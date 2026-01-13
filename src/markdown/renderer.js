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

import { ViewPlugin, Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

// Import widgets
import { ImageWidget, ImagePlaceholder } from './widgets/image.js';
import {
  TableWidget,
  parseTable,
  isTableLine,
  isTableDelimiter,
  generateTableId,
} from './widgets/table.js';
import { TaskCheckboxWidget } from './widgets/checkbox.js';
import { AlertTitleWidget } from './widgets/alert-title.js';
import {
  InlineMathWidget,
  DisplayMathWidget,
  extractInlineMath,
  extractDisplayMath,
  generateMathId,
} from './widgets/math.js';

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

  // Track table ranges processed by syntax tree (for fallback scanner)
  const processedTableRanges = [];

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

        const cursor = node.node.cursor();
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'URL') {
              imageUrl = doc.sliceString(cursor.from, cursor.to);
            }
            if (cursor.name === 'LinkLabel') {
              imageAlt = doc.sliceString(cursor.from, cursor.to);
            }
          } while (cursor.nextSibling());
        }

        // Check if this image is inside a link (linked image: [![alt](img)](url))
        const parent = node.node.parent;
        const isLinkedImage = parent?.name === 'Link';
        const syntaxEnd = isLinkedImage ? parent.to : node.to;
        const syntaxStart = isLinkedImage ? parent.from : node.from;

        if (isActiveLine) {
          // Show full syntax when editing
          decorations.push(
            Decoration.mark({ class: 'cm-md-marker' }).range(syntaxStart, syntaxEnd)
          );
        } else {
          // Replace syntax with compact placeholder
          // (Full image preview would require block widgets which aren't supported in plugins)
          decorations.push(
            Decoration.replace({
              widget: new ImagePlaceholder(imageAlt, imageUrl, isLinkedImage),
            }).range(syntaxStart, syntaxEnd)
          );
        }
      }

      // =======================================================================
      // TABLES
      // =======================================================================
      if (node.name === 'Table') {
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(node.to);

        // Track this table as processed (for fallback scanner)
        processedTableRanges.push({ from: node.from, to: node.to });

        // Check if cursor is inside the table
        const cursorInTable = cursorLine >= startLine.number && cursorLine <= endLine.number;

        if (cursorInTable) {
          // Cursor in table: show raw markdown with styling
          for (let i = startLine.number; i <= endLine.number; i++) {
            const line = doc.line(i);
            decorations.push(
              Decoration.line({ class: 'cm-md-table-line-visible' }).range(line.from)
            );
          }
        } else {
          // Cursor outside: hide lines and show widget
          // Collect table lines for parsing
          const lines = [];
          for (let i = startLine.number; i <= endLine.number; i++) {
            lines.push(doc.line(i).text);
          }

          // Parse the table
          const parsed = parseTable(lines);

          if (parsed && parsed.rows.length > 0) {
            // Hide all table lines (text transparent, same height)
            for (let i = startLine.number; i <= endLine.number; i++) {
              const line = doc.line(i);
              decorations.push(
                Decoration.line({ class: 'cm-md-table-line-hidden' }).range(line.from)
              );
            }

            // Add table widget after first line
            const tableId = generateTableId(node.from);
            decorations.push(
              Decoration.widget({
                widget: new TableWidget(parsed, tableId),
                side: 1,
              }).range(startLine.to)
            );
          } else {
            // Parsing failed - show styled raw markdown
            for (let i = startLine.number; i <= endLine.number; i++) {
              const line = doc.line(i);
              decorations.push(
                Decoration.line({ class: 'cm-md-table-line-visible' }).range(line.from)
              );
            }
          }
        }

        return false; // Don't recurse into table children
      }
    },
  });

  // ==========================================================================
  // FALLBACK TABLE SCANNER (Tufte Markdown Extensions)
  // ==========================================================================
  // The GFM parser only recognizes standard delimiter rows (:?-+:?)
  // Our Tufte Markdown extensions (|:--{30%}|, |---.|) break GFM recognition.
  // This fallback scans for tables the syntax tree missed.

  const isProcessedAsTable = (from, to) => {
    return processedTableRanges.some(r => from >= r.from && to <= r.to);
  };

  // Scan viewport for potential tables line by line
  let lineNum = doc.lineAt(view.viewport.from).number;
  const lastLineNum = doc.lineAt(view.viewport.to).number;

  while (lineNum <= lastLineNum) {
    const line = doc.line(lineNum);

    // Check if this looks like a table header row
    if (isTableLine(line.text) && lineNum < doc.lines) {
      const nextLine = doc.line(lineNum + 1);

      // Look for delimiter on next line (our isTableDelimiter supports Tufte syntax)
      if (isTableDelimiter(nextLine.text)) {
        // Found a potential table! Collect all table lines
        const tableStartLine = lineNum;
        let tableEndLine = lineNum + 1; // At least header + delimiter

        // Continue collecting data rows
        while (tableEndLine < doc.lines) {
          const checkLine = doc.line(tableEndLine + 1);
          if (isTableLine(checkLine.text)) {
            tableEndLine++;
          } else {
            break;
          }
        }

        const tableStart = doc.line(tableStartLine).from;
        const tableEnd = doc.line(tableEndLine).to;

        // Skip if already processed by syntax tree
        if (!isProcessedAsTable(tableStart, tableEnd)) {
          const startLine = doc.line(tableStartLine);
          const endLine = doc.line(tableEndLine);

          // Check if cursor is inside the table
          const cursorInTable = cursorLine >= tableStartLine && cursorLine <= tableEndLine;

          if (cursorInTable) {
            // Cursor in table: show raw markdown with styling
            for (let i = tableStartLine; i <= tableEndLine; i++) {
              const tableLine = doc.line(i);
              decorations.push(
                Decoration.line({ class: 'cm-md-table-line-visible' }).range(tableLine.from)
              );
            }
          } else {
            // Cursor outside: hide lines and show widget
            const lines = [];
            for (let i = tableStartLine; i <= tableEndLine; i++) {
              lines.push(doc.line(i).text);
            }

            const parsed = parseTable(lines);

            if (parsed && parsed.rows.length > 0) {
              // Hide all table lines
              for (let i = tableStartLine; i <= tableEndLine; i++) {
                const tableLine = doc.line(i);
                decorations.push(
                  Decoration.line({ class: 'cm-md-table-line-hidden' }).range(tableLine.from)
                );
              }

              // Add table widget
              const tableId = generateTableId(tableStart);
              decorations.push(
                Decoration.widget({
                  widget: new TableWidget(parsed, tableId),
                  side: 1,
                }).range(startLine.to)
              );
            } else {
              // Parsing failed - show styled raw markdown
              for (let i = tableStartLine; i <= tableEndLine; i++) {
                const tableLine = doc.line(i);
                decorations.push(
                  Decoration.line({ class: 'cm-md-table-line-visible' }).range(tableLine.from)
                );
              }
            }
          }

          // Skip to after this table
          lineNum = tableEndLine + 1;
          continue;
        }
      }
    }

    lineNum++;
  }

  // ==========================================================================
  // MATH DETECTION (LaTeX with KaTeX)
  // ==========================================================================
  // Detect display math ($$...$$) and inline math ($...$)
  // These aren't in the markdown syntax tree, so we scan manually.

  const text = doc.toString();

  // Display math: $$...$$ (can span multiple lines)
  const displayMathRegex = /\$\$([\s\S]+?)\$\$/g;
  let displayMatch;
  while ((displayMatch = displayMathRegex.exec(text)) !== null) {
    const from = displayMatch.index;
    const to = from + displayMatch[0].length;

    // Skip if outside viewport
    if (to < view.viewport.from || from > view.viewport.to) continue;

    const latex = displayMatch[1].trim();
    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);

    // Check if cursor is inside the math block
    const cursorInMath = cursorLine >= startLine.number && cursorLine <= endLine.number;

    if (cursorInMath) {
      // Show raw LaTeX with styling
      for (let i = startLine.number; i <= endLine.number; i++) {
        const line = doc.line(i);
        decorations.push(
          Decoration.line({ class: 'cm-md-math-line-visible' }).range(line.from)
        );
      }
    } else {
      // Hide lines and show rendered widget
      for (let i = startLine.number; i <= endLine.number; i++) {
        const line = doc.line(i);
        decorations.push(
          Decoration.line({ class: 'cm-md-math-line-hidden' }).range(line.from)
        );
      }

      // Add math widget after first line
      const mathId = generateMathId(from);
      decorations.push(
        Decoration.widget({
          widget: new DisplayMathWidget(latex, mathId),
          side: 1,
        }).range(startLine.to)
      );
    }
  }

  // Inline math: $...$ (single line only, not $$)
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
