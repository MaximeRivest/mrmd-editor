/**
 * Block Decorations StateField
 *
 * Handles multi-line decorations that require Decoration.replace across line breaks.
 * CodeMirror 6 only allows these from StateFields, not ViewPlugins.
 *
 * This handles:
 * - Tables (multi-line)
 * - Display math (multi-line)
 *
 * Also implements "stable height" feature to prevent layout shift when
 * switching between rendered widgets and raw markdown.
 *
 * @module markdown/block-decorations
 */


import { StateField } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// =============================================================================
// Line Height Tracking for Accurate Spacing
// =============================================================================

/**
 * Module-level cache for line height.
 * Updated by ViewPlugin, read by StateField.
 * This is simpler and more reliable than StateEffect-based approach.
 */
let cachedLineHeight = 22; // Default fallback

/**
 * Get the current line height
 */
function getLineHeight() {
  return cachedLineHeight;
}

/**
 * Update the cached line height (called by ViewPlugin)
 * Invalidates widget height cache if line height changed significantly
 * (indicates font/zoom change)
 */
function setLineHeight(height) {
  if (height > 0 && height !== cachedLineHeight) {
    // If line height changed significantly (>1px), cached widget heights are stale
    if (cacheLineHeight > 0 && Math.abs(height - cacheLineHeight) > 1) {
      clearHeightCache();
    }
    cacheLineHeight = height;
    cachedLineHeight = height;
  }
}
import {
  TableWidget,
  parseTable,
  isTableLine,
  isTableDelimiter,
  generateTableId,
} from './widgets/table.js';
import {
  DisplayMathWidget,
  extractDisplayMath,
  generateMathId,
} from './widgets/math.js';

// =============================================================================
// Height Cache for Stable Layout
// =============================================================================

/**
 * Cache of rendered widget heights, keyed by content hash.
 * Used to pad raw markdown to prevent layout shift.
 *
 * Cache is invalidated when line height changes (font/zoom change).
 */
const widgetHeightCache = new Map();

/**
 * Track the line height when cache was populated.
 * If line height changes significantly, cache is invalidated.
 */
let cacheLineHeight = 0;

/**
 * Clear the height cache (called when font/zoom changes)
 */
export function clearHeightCache() {
  widgetHeightCache.clear();
}

/**
 * Simple hash function for content-based caching
 */
function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Store widget height in cache
 */
export function cacheWidgetHeight(contentHash, height) {
  widgetHeightCache.set(contentHash, height);
}

/**
 * Get cached widget height
 */
export function getCachedHeight(contentHash) {
  return widgetHeightCache.get(contentHash);
}

// =============================================================================
// Spacer Widget for Stable Layout
// =============================================================================

/**
 * A simple spacer widget that adds vertical padding to prevent layout shift
 * when switching from rendered widget to raw markdown.
 */
class SpacerWidget extends WidgetType {
  constructor(height, label = 'content') {
    super();
    this.height = height;
    this.label = label;
  }

  eq(other) {
    return other.height === this.height && other.label === this.label;
  }

  toDOM() {
    const spacer = document.createElement('div');
    spacer.className = 'cm-block-spacer';
    spacer.style.height = `${this.height}px`;
    // Subtle visual indicator
    spacer.setAttribute('data-spacer-for', this.label);
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

  // Don't let this widget be a cursor target
  get estimatedHeight() {
    return this.height;
  }
}

/**
 * TableWidget wrapper that caches its rendered height for stable layout.
 */
class TableWidgetWithHeightCache extends TableWidget {
  constructor(table, tableId, contentHash) {
    super(table, tableId);
    this.contentHash = contentHash;
  }

  eq(other) {
    return super.eq(other) && other.contentHash === this.contentHash;
  }

  toDOM() {
    const dom = super.toDOM();
    const contentHash = this.contentHash;

    // Cache the LINE height (not widget height) after render
    // The line includes widget buffers and other CM overhead
    requestAnimationFrame(() => {
      // Find the parent .cm-line element
      const line = dom.closest('.cm-line');
      const height = line ? line.offsetHeight : dom.offsetHeight;
      if (height > 0) {
        cacheWidgetHeight(contentHash, height);
      }
    });

    return dom;
  }
}

/**
 * DisplayMathWidget wrapper that caches its rendered height for stable layout.
 */
class DisplayMathWidgetWithHeightCache extends DisplayMathWidget {
  constructor(latex, mathId, contentHash) {
    super(latex, mathId);
    this.contentHash = contentHash;
  }

  eq(other) {
    return super.eq(other) && other.contentHash === this.contentHash;
  }

  toDOM() {
    const dom = super.toDOM();
    const contentHash = this.contentHash;

    // Cache the LINE height (not widget height) after render
    // The line includes widget buffers and other CM overhead
    requestAnimationFrame(() => {
      const line = dom.closest('.cm-line');
      const height = line ? line.offsetHeight : dom.offsetHeight;
      if (height > 0) {
        cacheWidgetHeight(contentHash, height);
      }
    });

    return dom;
  }
}

/**
 * Find all table ranges in the document using syntax tree + fallback scanner
 */
function findTableRanges(state) {
  const doc = state.doc;
  const ranges = [];
  const processedStarts = new Set();

  // First pass: use syntax tree
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(node.to);

        if (!processedStarts.has(startLine.number)) {
          processedStarts.add(startLine.number);
          ranges.push({
            type: 'table',
            from: node.from,
            to: node.to,
            startLine: startLine.number,
            endLine: endLine.number,
          });
        }
        return false; // Don't recurse
      }
    },
  });

  // Second pass: fallback scanner for tables not in syntax tree
  // (GFM tables sometimes parsed as paragraphs)
  let inTable = false;
  let tableStart = -1;
  let tableStartLine = -1;
  let hasDelimiter = false;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const isTable = isTableLine(text);
    const isDelim = isTableDelimiter(text);

    if (isTable && !inTable) {
      // Check if already processed
      if (!processedStarts.has(i)) {
        inTable = true;
        tableStart = line.from;
        tableStartLine = i;
        hasDelimiter = isDelim;
      }
    } else if (isTable && inTable) {
      if (isDelim) hasDelimiter = true;
    } else if (!isTable && inTable) {
      // End of table
      if (hasDelimiter && tableStartLine > 0) {
        const prevLine = doc.line(i - 1);
        ranges.push({
          type: 'table',
          from: tableStart,
          to: prevLine.to,
          startLine: tableStartLine,
          endLine: i - 1,
        });
      }
      inTable = false;
      tableStart = -1;
      tableStartLine = -1;
      hasDelimiter = false;
    }
  }

  // Handle table at end of document
  if (inTable && hasDelimiter && tableStartLine > 0) {
    const lastLine = doc.line(doc.lines);
    ranges.push({
      type: 'table',
      from: tableStart,
      to: lastLine.to,
      startLine: tableStartLine,
      endLine: doc.lines,
    });
  }

  return ranges;
}

/**
 * Find all display math ranges in the document
 */
function findDisplayMathRanges(state) {
  const doc = state.doc;
  const text = doc.toString();
  const ranges = [];

  // Match $$ ... $$ (multi-line)
  const dollarPattern = /\$\$([\s\S]*?)\$\$/g;
  let match;

  while ((match = dollarPattern.exec(text)) !== null) {
    const from = match.index;
    const to = match.index + match[0].length;
    const content = match[1];

    // Only include if it spans multiple lines or is a block
    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);

    // Check if it's on its own line (block display math)
    const lineText = startLine.text.trim();
    const isBlock = lineText.startsWith('$$');

    if (isBlock) {
      ranges.push({
        type: 'displayMath',
        from,
        to,
        startLine: startLine.number,
        endLine: endLine.number,
        content: content.trim(),
      });
    }
  }

  // Match \[ ... \] (LaTeX display math)
  const bracketPattern = /\\\[([\s\S]*?)\\\]/g;

  while ((match = bracketPattern.exec(text)) !== null) {
    const from = match.index;
    const to = match.index + match[0].length;
    const content = match[1];
    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);

    ranges.push({
      type: 'displayMath',
      from,
      to,
      startLine: startLine.number,
      endLine: endLine.number,
      content: content.trim(),
    });
  }

  return ranges;
}

/**
 * Build decorations for all block elements
 */
function buildBlockDecorations(state) {
  const doc = state.doc;
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  const decorations = [];

  // Find and process tables
  const tableRanges = findTableRanges(state);

  for (const range of tableRanges) {
    const cursorInTable = cursorLine >= range.startLine && cursorLine <= range.endLine;

    // Collect lines for both rendering and height calculation
    const lines = [];
    for (let i = range.startLine; i <= range.endLine; i++) {
      lines.push(doc.line(i).text);
    }
    const contentHash = 'table-' + hashContent(lines.join('\n'));

    if (!cursorInTable) {
      // Cursor outside: replace entire table with widget
      const parsed = parseTable(lines);

      if (parsed && parsed.rows.length > 0) {
        const tableId = generateTableId(range.from);
        decorations.push(
          Decoration.replace({
            widget: new TableWidgetWithHeightCache(parsed, tableId, contentHash),
          }).range(range.from, range.to)
        );
      }
    } else {
      // Cursor inside: show raw markdown, but add spacer to prevent layout shift

      const cachedHeight = getCachedHeight(contentHash);
      if (cachedHeight) {
        // Calculate raw content height using actual line height
        const lineCount = range.endLine - range.startLine + 1;
        const lineHeight = getLineHeight();
        const rawHeight = lineCount * lineHeight;
        const padding = cachedHeight - rawHeight;

        if (padding > 0) {
          // Use line decoration with padding-bottom (doesn't block navigation)
          const lastLine = doc.line(range.endLine);
          decorations.push(
            Decoration.line({
              attributes: {
                class: 'cm-block-spacer-line',
                style: `padding-bottom: ${padding}px`
              }
            }).range(lastLine.from)
          );
        }
      }
    }
  }

  // Find and process display math
  const mathRanges = findDisplayMathRanges(state);

  for (const range of mathRanges) {
    const cursorInMath = cursorLine >= range.startLine && cursorLine <= range.endLine;
    const contentHash = 'math-' + hashContent(range.content);

    if (!cursorInMath) {
      // Cursor outside: replace entire math block with widget
      const mathId = generateMathId(range.from);
      decorations.push(
        Decoration.replace({
          widget: new DisplayMathWidgetWithHeightCache(range.content, mathId, contentHash),
        }).range(range.from, range.to)
      );
    } else {
      // Cursor inside: show raw LaTeX, but add spacer to prevent layout shift
      const cachedHeight = getCachedHeight(contentHash);
      if (cachedHeight) {
        const lineCount = range.endLine - range.startLine + 1;
        const lineHeight = getLineHeight();
        const rawHeight = lineCount * lineHeight;
        const padding = cachedHeight - rawHeight;

        if (padding > 0) {
          // Use line decoration with padding-bottom (doesn't block navigation)
          const lastLine = doc.line(range.endLine);
          decorations.push(
            Decoration.line({
              attributes: {
                class: 'cm-block-spacer-line',
                style: `padding-bottom: ${padding}px`
              }
            }).range(lastLine.from)
          );
        }
      }
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * StateField for block decorations (tables, display math)
 *
 * This MUST be a StateField (not ViewPlugin) because it uses
 * Decoration.replace across line breaks.
 */
export const blockDecorations = StateField.define({
  create(state) {
    return buildBlockDecorations(state);
  },

  update(decorations, tr) {
    // Rebuild on any change that could affect block elements
    // For efficiency, we could map positions and only rebuild affected ranges,
    // but for now, full rebuild is acceptable
    if (tr.docChanged || tr.selection) {
      return buildBlockDecorations(tr.state);
    }
    return decorations;
  },

  provide: (f) => EditorView.decorations.from(f),
});

/**
 * ViewPlugin to track and update the actual line height from the editor.
 * This ensures spacer calculations use the real line height, not estimates.
 *
 * Note: StateFields run before ViewPlugins, so we need to trigger a
 * re-render after updating the line height cache.
 */
export const lineHeightTracker = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      const oldHeight = cachedLineHeight;
      setLineHeight(view.defaultLineHeight);

      // If line height changed, trigger a re-render so StateField uses correct value
      if (oldHeight !== cachedLineHeight) {
        // Use requestAnimationFrame to avoid dispatching during construction
        requestAnimationFrame(() => {
          // Dispatch empty transaction to trigger StateField rebuild
          view.dispatch({});
        });
      }
    }

    update(update) {
      // Check if line height changed (e.g., due to font loading or resize)
      const oldHeight = cachedLineHeight;
      setLineHeight(this.view.defaultLineHeight);

      // If height changed mid-session (font load, resize), trigger rebuild
      if (oldHeight !== cachedLineHeight) {
        this.view.dispatch({});
      }
    }
  }
);
