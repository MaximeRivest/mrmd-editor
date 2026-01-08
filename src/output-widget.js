/**
 * Output Widget
 *
 * CodeMirror widget that renders output blocks with ANSI color support.
 * Uses line decorations to hide raw text + positioned widget for colored display.
 *
 * Approach (from prototype):
 * 1. Add line decorations to hide the raw output text via CSS
 * 2. Add widget positioned after opening fence that shows colored HTML
 * 3. Don't use Decoration.replace (causes parser issues)
 *
 * @module output-widget
 */

import { WidgetType, Decoration, ViewPlugin } from '@codemirror/view';
import { terminalToHtml, hasAnsi, stripAnsi, ansiStyles } from './terminal.js';

// #region WIDGET

/**
 * Widget for rendering output with ANSI colors
 */
class OutputWidget extends WidgetType {
  /**
   * @param {string} content - Output content with ANSI codes
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   */
  constructor(content, hidden = false) {
    super();
    this.content = content;
    this.hidden = hidden;
  }

  eq(other) {
    return other.content === this.content && other.hidden === this.hidden;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');

    // Render with ANSI colors
    const html = terminalToHtml(this.content);
    container.innerHTML = `<pre class="cm-output-ansi">${html}</pre>`;

    // Copy on click
    container.title = 'Click to copy output';
    container.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Copy plain text (without ANSI codes)
      const plainText = stripAnsi(this.content);
      navigator.clipboard.writeText(plainText).then(() => {
        const feedback = document.createElement('div');
        feedback.className = 'cm-output-copy-feedback';
        feedback.textContent = 'Copied!';
        container.appendChild(feedback);
        setTimeout(() => feedback.remove(), 1500);
      });
    };

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

// #endregion WIDGET

// #region DECORATION_PLUGIN

/**
 * Find output blocks and create decorations
 * @param {import('@codemirror/view').EditorView} view
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildDecorations(view) {
  const decorations = [];
  const doc = view.state.doc;
  const cursorPos = view.state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;

  // Find ```output blocks using regex
  const text = doc.toString();
  const outputBlockRegex = /```output\n([\s\S]*?)```/g;
  let match;

  while ((match = outputBlockRegex.exec(text)) !== null) {
    const content = match[1];
    const blockStart = match.index;
    const blockEnd = blockStart + match[0].length;

    // Only process blocks with ANSI codes
    if (!hasAnsi(content)) {
      continue;
    }

    // Get line range
    const startLine = doc.lineAt(blockStart);
    const endLine = doc.lineAt(blockEnd);

    // Check if cursor is inside this block
    const cursorInBlock = cursorLine >= startLine.number && cursorLine <= endLine.number;

    // Add line decorations to hide/show raw text
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = doc.line(i);
      decorations.push(
        Decoration.line({
          class: cursorInBlock ? 'cm-output-line-visible' : 'cm-output-line-hidden',
        }).range(line.from)
      );
    }

    // Add widget after opening fence line (positioned widget, not replace)
    decorations.push(
      Decoration.widget({
        widget: new OutputWidget(content.trimEnd(), cursorInBlock),
        side: 1,
      }).range(startLine.to)
    );
  }

  return Decoration.set(decorations, true);
}

/**
 * ViewPlugin that manages output block decorations
 */
export const outputWidgetPlugin = ViewPlugin.fromClass(
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

// #endregion DECORATION_PLUGIN

// #region STYLES

/**
 * CSS styles for output widget
 */
export const outputWidgetStyles = `
/* Output widget container */
.cm-output-widget {
  font-family: var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: 0.9em;
  line-height: 1.4;
  padding: 8px 12px;
  background: var(--output-bg, rgba(0, 0, 0, 0.3));
  border-radius: 6px;
  margin: 4px 0;
  position: relative;
  overflow-x: auto;
  border-left: 3px solid var(--output-border, rgba(100, 100, 100, 0.5));
  cursor: pointer;
}

.cm-output-widget pre {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.cm-output-widget:hover {
  background: var(--output-hover-bg, rgba(0, 0, 0, 0.35));
}

/* Hidden when cursor is in block (show raw source) */
.cm-output-widget-hidden {
  display: none;
}

/* Line visibility classes */
.cm-output-line-hidden {
  /* Hide text but maintain line height for stable layout */
  color: transparent !important;
}
.cm-output-line-hidden * {
  color: transparent !important;
}

.cm-output-line-visible {
  /* Normal visibility when editing */
}

/* Copy feedback */
.cm-output-copy-feedback {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: var(--feedback-bg, rgba(34, 197, 94, 0.9));
  color: var(--feedback-color, white);
  border-radius: 4px;
  font-size: 0.8em;
  animation: fadeOut 1.5s ease-out forwards;
}

@keyframes fadeOut {
  0%, 70% { opacity: 1; }
  100% { opacity: 0; }
}

/* ANSI text styles */
${ansiStyles}
`;

// #endregion STYLES

// #region EXPORTS

/**
 * Create the output widget extension for CodeMirror
 * @returns {import('@codemirror/state').Extension}
 */
export function outputWidget() {
  return outputWidgetPlugin;
}

/**
 * Inject output widget CSS styles into the document
 */
export function injectOutputWidgetStyles() {
  if (document.getElementById('mrmd-output-widget-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mrmd-output-widget-styles';
  style.textContent = outputWidgetStyles;
  document.head.appendChild(style);
}

// #endregion EXPORTS
