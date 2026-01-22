/**
 * Markdown Renderer
 *
 * CodeMirror ViewPlugin that renders markdown elements.
 * Uses the syntax tree to detect elements and applies decorations.
 *
 * Behavior (opinionated, not configurable):
 * - Blur = rendered (markers hidden, widgets shown)
 * - Focus = source (markers visible, raw markdown)
 * - Focus scope is line-based for inline, block-based for blocks
 *
 * @module markdown/renderer
 */

import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { Facet } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

// =============================================================================
// Asset Resolver Facet
// =============================================================================

/**
 * Facet for resolving asset URLs.
 * Allows the host application (e.g., Electron) to transform relative asset
 * paths into absolute URLs that the browser can load.
 *
 * Example usage:
 *   assetResolverFacet.of((url) => `file://${projectRoot}/${url}`)
 *
 * @type {Facet<(url: string) => string, ((url: string) => string) | null>}
 */
export const assetResolverFacet = Facet.define({
  combine: (values) => values[values.length - 1] || null,
});

// Import widgets
import {
  ImageWidget,
  ImagePlaceholder,
  BlockImageWidget,
  updateLinkDefinitionCache,
  resolveLinkReference,
  isBlockImage,
  generateImageId,
  extractPositionFromLine,
  isPositionModifier,
} from './widgets/image.js';
// Tables handled by StateField (block-decorations.js) - multi-line replace not allowed in ViewPlugin
import { TaskCheckboxWidget } from './widgets/checkbox.js';
import { AlertTitleWidget } from './widgets/alert-title.js';
import {
  InlineMathWidget,
  extractInlineMath,
} from './widgets/math.js';
// Display math handled by StateField (block-decorations.js) - multi-line replace not allowed in ViewPlugin

// Import height caching for stable layout
import { cacheWidgetHeight, getCachedHeight } from './block-decorations.js';

// =============================================================================
// Height Caching for Stable Layout
// =============================================================================

/**
 * Simple hash function for content-based caching
 */
function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * BlockImageWidget wrapper that caches its rendered height for stable layout.
 */
class BlockImageWidgetWithHeightCache extends BlockImageWidget {
  constructor(url, alt, isLinked, linkUrl, imageId, position, title, contentHash) {
    super(url, alt, isLinked, linkUrl, imageId, position, title);
    this.contentHash = contentHash;
  }

  eq(other) {
    return super.eq(other) && other.contentHash === this.contentHash;
  }

  toDOM() {
    const dom = super.toDOM();
    const contentHash = this.contentHash;

    // Cache the LINE height (not widget height) after image loads
    // The line includes widget buffers and other CM overhead
    const cacheHeight = () => {
      const line = dom.closest('.cm-line');
      const height = line ? line.offsetHeight : dom.offsetHeight;
      if (height > 0) {
        cacheWidgetHeight(contentHash, height);
      }
    };

    // Use MutationObserver to detect when img is added to DOM
    // Note: BlockImageWidget adds img to DOM only in onload callback
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const img = dom.querySelector('img');
          if (img) {
            // Image added - wait for it to have dimensions
            if (img.complete) {
              cacheHeight();
            } else {
              img.addEventListener('load', cacheHeight);
            }
            observer.disconnect();
            return;
          }
        }
      }
    });

    observer.observe(dom, { childList: true, subtree: true });

    // Also try after a delay as fallback
    setTimeout(cacheHeight, 500);

    return dom;
  }
}

/**
 * Spacer widget for stable layout when editing raw markdown
 */
class ImageSpacerWidget extends WidgetType {
  constructor(height) {
    super();
    this.height = height;
  }

  eq(other) {
    return other.height === this.height;
  }

  toDOM() {
    const spacer = document.createElement('div');
    spacer.className = 'cm-block-spacer';
    spacer.style.height = `${this.height}px`;
    spacer.setAttribute('data-spacer-for', 'image');
    // Make non-focusable and non-interactive for navigation
    spacer.setAttribute('tabindex', '-1');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.pointerEvents = 'none';
    spacer.style.userSelect = 'none';
    return spacer;
  }

  ignoreEvent() {
    return true;
  }

  get estimatedHeight() {
    return this.height;
  }
}

/**
 * Build decorations for all markdown elements in the viewport.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildDecorations(view) {
  const decorations = [];
  const doc = view.state.doc;
  const cursorPos = view.state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;

  // Get asset resolver from facet (may be null)
  const assetResolver = view.state.facet(assetResolverFacet);

  // Helper to resolve asset URLs
  const resolveUrl = (url) => {
    if (!url || !assetResolver) return url;
    // Only resolve relative URLs (not http://, https://, data:, etc.)
    if (url.startsWith('http://') || url.startsWith('https://') ||
        url.startsWith('data:') || url.startsWith('file://')) {
      return url;
    }
    return assetResolver(url);
  };

  // Update link definition cache for reference-style images/links
  updateLinkDefinitionCache(doc.toString());

  // Note: Tables and display math are handled by StateField (block-decorations.js)
  // ViewPlugin can only handle single-line decorations

  syntaxTree(view.state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter: (node) => {
      const lineNum = doc.lineAt(node.from).number;
      const isActiveLine = lineNum === cursorLine;

      // Marker class: hidden on blur, muted on focus
      const markerClass = isActiveLine ? 'cm-md-marker' : 'cm-md-hidden';

      // =======================================================================
      // HEADINGS
      // =======================================================================
      if (node.name.startsWith('ATXHeading')) {
        const level = node.name.match(/\d/)?.[0] || '1';

        // Find content start (after # markers and space)
        let contentStart = node.from;
        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'HeaderMark') {
              contentStart = cursor.to;
              // Skip whitespace after markers
              while (
                contentStart < node.to &&
                doc.sliceString(contentStart, contentStart + 1) === ' '
              ) {
                contentStart++;
              }
              break;
            }
          } while (cursor.nextSibling());
        }

        // Style the heading content
        if (contentStart < node.to) {
          decorations.push(
            Decoration.mark({ class: `cm-md-h${level}` }).range(contentStart, node.to)
          );
        }
      }

      // Header markers (# ## ###)
      if (node.name === 'HeaderMark') {
        decorations.push(
          Decoration.mark({ class: markerClass }).range(node.from, node.to)
        );
      }

      // =======================================================================
      // EMPHASIS (bold, italic)
      // =======================================================================
      if (node.name === 'StrongEmphasis') {
        decorations.push(
          Decoration.mark({ class: 'cm-md-bold' }).range(node.from, node.to)
        );
      }

      if (node.name === 'Emphasis') {
        decorations.push(
          Decoration.mark({ class: 'cm-md-italic' }).range(node.from, node.to)
        );
      }

      // Emphasis markers (* ** _ __)
      if (node.name === 'EmphasisMark') {
        decorations.push(
          Decoration.mark({ class: markerClass }).range(node.from, node.to)
        );
      }

      // =======================================================================
      // STRIKETHROUGH
      // =======================================================================
      if (node.name === 'Strikethrough') {
        decorations.push(
          Decoration.mark({ class: 'cm-md-strikethrough' }).range(node.from, node.to)
        );
      }

      if (node.name === 'StrikethroughMark') {
        decorations.push(
          Decoration.mark({ class: markerClass }).range(node.from, node.to)
        );
      }

      // =======================================================================
      // INLINE CODE
      // =======================================================================
      if (node.name === 'InlineCode') {
        decorations.push(
          Decoration.mark({ class: 'cm-md-inline-code' }).range(node.from, node.to)
        );
      }

      // Code backticks (inline only, not fenced code)
      if (node.name === 'CodeMark') {
        const text = doc.sliceString(node.from, node.to);
        // Only hide single/double backticks, not fenced code markers (```)
        if (text.length < 3) {
          decorations.push(
            Decoration.mark({ class: markerClass }).range(node.from, node.to)
          );
        }
      }

      // =======================================================================
      // LINKS
      // =======================================================================
      if (node.name === 'Link') {
        // Check if this link contains an image (linked image: [![alt](img)](url))
        const cursor = node.node.cursor();
        let containsImage = false;
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'Image') {
              containsImage = true;
              break;
            }
          } while (cursor.nextSibling());
        }

        // Skip if it's a linked image - Image handler will handle it
        if (containsImage) {
          return;
        }

        // Process regular links
        cursor.moveTo(node.from);
        if (cursor.firstChild()) {
          do {
            const childLine = doc.lineAt(cursor.from).number;
            const childHidden = childLine === cursorLine ? 'cm-md-marker' : 'cm-md-hidden';

            if (cursor.name === 'LinkMark') {
              decorations.push(
                Decoration.mark({ class: childHidden }).range(cursor.from, cursor.to)
              );
            }
            if (cursor.name === 'LinkLabel') {
              decorations.push(
                Decoration.mark({ class: 'cm-md-link-text' }).range(cursor.from, cursor.to)
              );
            }
            if (cursor.name === 'URL') {
              decorations.push(
                Decoration.mark({ class: childHidden }).range(cursor.from, cursor.to)
              );
            }
          } while (cursor.nextSibling());
        }
      }

      // =======================================================================
      // BLOCKQUOTES
      // =======================================================================
      if (node.name === 'Blockquote') {
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(node.to);

        // Check for GitHub-style alert marker: > [!NOTE], [!TIP], etc.
        const firstLineText = startLine.text;
        const alertMatch = firstLineText.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
        const alertType = alertMatch ? alertMatch[1].toLowerCase() : null;

        for (let i = startLine.number; i <= endLine.number; i++) {
          const line = doc.line(i);
          if (alertType) {
            // Apply alert-specific styling
            decorations.push(
              Decoration.line({ class: `cm-md-alert cm-md-alert-${alertType}` }).range(line.from)
            );
          } else {
            decorations.push(
              Decoration.line({ class: 'cm-md-blockquote-line' }).range(line.from)
            );
          }
        }

        // Replace the alert marker [!TYPE] with widget when not on that line
        if (alertType && startLine.number !== cursorLine) {
          const markerStart = startLine.from + firstLineText.indexOf('[!');
          const markerEnd = startLine.from + firstLineText.indexOf(']') + 1;
          if (markerStart >= startLine.from && markerEnd > markerStart) {
            decorations.push(
              Decoration.replace({
                widget: new AlertTitleWidget(alertType),
              }).range(markerStart, markerEnd)
            );
          }
        }
      }

      // Quote markers (>)
      if (node.name === 'QuoteMark') {
        decorations.push(
          Decoration.mark({ class: markerClass }).range(node.from, node.to)
        );
      }

      // =======================================================================
      // LISTS
      // =======================================================================
      if (node.name === 'ListMark') {
        decorations.push(
          Decoration.mark({ class: 'cm-md-list-marker' }).range(node.from, node.to)
        );
      }

      // Task list checkboxes: - [ ] or - [x]
      if (node.name === 'ListItem') {
        const itemText = doc.sliceString(node.from, Math.min(node.from + 10, node.to));
        // Match: marker + space + [ ] or [x] or [X]
        const taskMatch = itemText.match(/^[-*+]\s+\[([ xX])\]/);
        if (taskMatch) {
          const isChecked = taskMatch[1].toLowerCase() === 'x';
          // Find the position of '[' in the document
          const bracketOffset = itemText.indexOf('[');
          const bracketPos = node.from + bracketOffset;

          // Don't render widget if cursor is on this line
          const itemLine = doc.lineAt(node.from);
          if (itemLine.number !== cursorLine) {
            // Replace [ ], [x], or [X] with checkbox widget
            decorations.push(
              Decoration.replace({
                widget: new TaskCheckboxWidget(isChecked, bracketPos),
              }).range(bracketPos, bracketPos + 3)
            );
          }
        }
      }

      // =======================================================================
      // HORIZONTAL RULES
      // =======================================================================
      if (node.name === 'HorizontalRule') {
        decorations.push(
          Decoration.mark({ class: 'cm-md-hr' }).range(node.from, node.to)
        );
        const line = doc.lineAt(node.from);
        decorations.push(
          Decoration.line({ class: 'cm-md-hr-line' }).range(line.from)
        );
      }

      // =======================================================================
      // IMAGES
      // =======================================================================
      if (node.name === 'Image') {
        let imageUrl = '';
        let imageAlt = '';
        let imageTitle = ''; // Title/caption from ![alt](url "title")
        let linkLabel = ''; // For reference-style images: ![alt][ref]

        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'URL') {
              imageUrl = doc.sliceString(cursor.from, cursor.to);
            }
            if (cursor.name === 'LinkTitle') {
              // Title is the text inside quotes: "caption text"
              const titleWithQuotes = doc.sliceString(cursor.from, cursor.to);
              // Remove surrounding quotes
              imageTitle = titleWithQuotes.slice(1, -1);
            }
            // First LinkLabel is the alt text, second is the reference
            if (cursor.name === 'LinkLabel') {
              const labelText = doc.sliceString(cursor.from, cursor.to);
              if (!imageAlt) {
                imageAlt = labelText;
              } else {
                // This is a reference label (![alt][ref])
                linkLabel = labelText;
              }
            }
          } while (cursor.nextSibling());
        }

        // Resolve reference-style images: ![alt][ref] -> look up [ref]: url
        if (!imageUrl && linkLabel) {
          const resolved = resolveLinkReference(linkLabel);
          if (resolved) {
            imageUrl = resolved.url;
            if (!imageTitle && resolved.title) {
              imageTitle = resolved.title;
            }
          }
        }
        // Also handle shortcut reference: ![alt][] where ref = alt
        if (!imageUrl && !linkLabel && imageAlt) {
          const resolved = resolveLinkReference(imageAlt);
          if (resolved) {
            imageUrl = resolved.url;
            if (!imageTitle && resolved.title) {
              imageTitle = resolved.title;
            }
          }
        }

        // Check if this image is inside a link (linked image: [![alt](img)](url))
        const parent = node.node.parent;
        const isLinkedImage = parent?.name === 'Link';
        let syntaxEnd = isLinkedImage ? parent.to : node.to;
        const syntaxStart = isLinkedImage ? parent.from : node.from;

        // Get link URL if this is a linked image
        let linkUrl = '';
        if (isLinkedImage) {
          const linkCursor = parent.cursor();
          if (linkCursor.firstChild()) {
            do {
              if (linkCursor.name === 'URL') {
                linkUrl = doc.sliceString(linkCursor.from, linkCursor.to);
              }
            } while (linkCursor.nextSibling());
          }
        }

        // Determine if this is a block image (alone on a line)
        const line = doc.lineAt(node.from);
        const isBlock = isBlockImage(line.text);
        const imageId = generateImageId(node.from);

        // Extract position modifier from end of line: ![alt](url)> → 'right'
        const { position, hasModifier } = extractPositionFromLine(line.text);

        // Adjust syntaxEnd to include the position modifier character
        if (hasModifier && syntaxEnd < line.to) {
          const charAfterSyntax = doc.sliceString(syntaxEnd, syntaxEnd + 1);
          if (isPositionModifier(charAfterSyntax)) {
            syntaxEnd = syntaxEnd + 1;
          }
        }

        // Content hash for stable layout caching
        const contentHash = isBlock ? 'img-' + hashContent(line.text) : null;

        if (isActiveLine) {
          // Show full syntax when editing (including position modifier)
          decorations.push(
            Decoration.mark({ class: 'cm-md-image-syntax' }).range(syntaxStart, syntaxEnd)
          );

          // For block images, add spacer to prevent layout shift
          if (isBlock && contentHash) {
            const cachedHeight = getCachedHeight(contentHash);
            if (cachedHeight) {
              // Use actual line height from view for accurate spacing
              const lineHeight = view.defaultLineHeight;
              const rawHeight = lineHeight; // Images are single line
              const padding = cachedHeight - rawHeight;
              if (padding > 0) {
                // Use line decoration with padding-bottom (doesn't block navigation)
                decorations.push(
                  Decoration.line({
                    attributes: {
                      class: 'cm-block-spacer-line',
                      style: `padding-bottom: ${padding}px`
                    }
                  }).range(line.from)
                );
              }
            }
          }
        } else if (!imageUrl) {
          // No URL (unresolved reference) - show placeholder
          decorations.push(
            Decoration.replace({
              widget: new ImagePlaceholder(imageAlt, '', isLinkedImage),
            }).range(syntaxStart, syntaxEnd)
          );
        } else if (isBlock) {
          // Block image: replace ENTIRE line content with image widget
          // Uses height-caching wrapper for stable layout
          decorations.push(
            Decoration.replace({
              widget: new BlockImageWidgetWithHeightCache(
                resolveUrl(imageUrl),
                imageAlt,
                isLinkedImage,
                resolveUrl(linkUrl),
                imageId,
                position,    // Position modifier: 'block', 'right', 'left', 'wide', 'small'
                imageTitle,  // Caption from title attribute
                contentHash  // For height caching
              ),
            }).range(line.from, line.to)
          );
        } else {
          // Inline image: replace with inline image widget
          decorations.push(
            Decoration.replace({
              widget: new ImageWidget(resolveUrl(imageUrl), imageAlt, isLinkedImage, resolveUrl(linkUrl)),
            }).range(syntaxStart, syntaxEnd)
          );
        }
      }

      // TABLES: Handled by StateField (block-decorations.js)
      // Skip table nodes - they use multi-line Decoration.replace which requires StateField
      if (node.name === 'Table') {
        return false; // Don't recurse into table children
      }
    },
  });

  // ==========================================================================
  // TABLES & DISPLAY MATH: Handled by StateField (block-decorations.js)
  // ==========================================================================
  // These multi-line elements require Decoration.replace across line breaks,
  // which is only allowed from StateField, not ViewPlugin.

  // ==========================================================================
  // INLINE MATH: $...$ (single line only)
  // ==========================================================================
  // Inline math can be handled here since it's single-line
  // Process line by line in viewport
  for (let i = doc.lineAt(view.viewport.from).number; i <= doc.lineAt(view.viewport.to).number; i++) {
    const line = doc.line(i);
    const isActiveLine = i === cursorLine;

    // Skip if this line is part of a display math block
    if (line.text.includes('$$')) continue;

    const inlineMaths = extractInlineMath(line.text);

    for (const math of inlineMaths) {
      const from = line.from + math.start;
      const to = line.from + math.end;

      if (isActiveLine) {
        // Show raw math syntax with styling
        decorations.push(
          Decoration.mark({ class: 'cm-md-math-syntax' }).range(from, to)
        );
      } else {
        // Replace with rendered widget
        decorations.push(
          Decoration.replace({
            widget: new InlineMathWidget(math.latex, math.raw),
          }).range(from, to)
        );
      }
    }
  }

  // Sort decorations by position and return
  return Decoration.set(decorations, true);
}

/**
 * Markdown rendering ViewPlugin
 */
export const markdownRenderer = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
