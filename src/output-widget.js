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
 * ## IMPORTANT: CSS Specificity Gotcha
 *
 * When hiding lines with `color: transparent`, you MUST exclude the widget:
 *
 *   WRONG: `.cm-output-line-hidden * { color: transparent !important; }`
 *   RIGHT: `.cm-output-line-hidden > *:not(.cm-output-widget) { color: transparent !important; }`
 *
 * The widget is positioned INSIDE a hidden line (after the opening fence).
 * If you use `*` selector, it makes all widget content transparent too!
 * This is a common mistake - the widget appears as an empty dark box.
 *
 * Always add explicit color restoration for widget content:
 *   `.cm-output-widget pre { color: var(--output-text, #e0e0e0); }`
 *
 * @module output-widget
 */

import { WidgetType, Decoration, ViewPlugin, EditorView } from '@codemirror/view';
import { Facet, Annotation } from '@codemirror/state';
import { terminalToHtml, hasAnsi, stripAnsi, ansiStyles } from './terminal.js';

// Facet to provide awareness system to the output widget
export const outputWidgetAwarenessFacet = Facet.define({
  combine: values => values[values.length - 1] || null
});

// Annotation to mark awareness-triggered updates (following y-codemirror.next pattern)
const outputWidgetAwarenessAnnotation = Annotation.define();

// #region WIDGET

/**
 * Widget for rendering output with ANSI colors
 */
class OutputWidget extends WidgetType {
  /**
   * @param {string} content - Output content with ANSI codes
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   * @param {number} blockStart - Document position where this output block starts
   */
  constructor(content, hidden = false, blockStart = 0) {
    super();
    this.content = content;
    this.hidden = hidden;
    this.blockStart = blockStart;
  }

  eq(other) {
    return other.content === this.content && other.hidden === this.hidden && other.blockStart === this.blockStart;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    // Store block position for stdin widget placement
    container.dataset.outputBlockStart = String(this.blockStart);

    // Render with ANSI colors
    const html = terminalToHtml(this.content);
    container.innerHTML = `<pre class="cm-output-ansi">${html}</pre>`;

    // Copy on click (only on pre, not on stdin inputs)
    container.title = 'Click to copy output';
    const handleCopy = (e) => {
      // Don't copy if clicking on stdin input
      if (e.target.closest('.mrmd-stdin-input')) return;

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
    container.onclick = handleCopy;

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

// #endregion WIDGET

// #region DECORATION_PLUGIN

/**
 * Find output blocks and create decorations.
 * Uses y-codemirror.next cursor positions (via awareness) to determine if any
 * collaborator is focused on an output block - no separate focusedBlock state needed.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Object|null} awarenessSystem - Optional awareness system for collaborative focus
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildDecorations(view, awarenessSystem) {
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

    // Get line range
    const startLine = doc.lineAt(blockStart);
    const endLine = doc.lineAt(blockEnd);

    // Check if LOCAL cursor is inside this block
    const localCursorInBlock = cursorLine >= startLine.number && cursorLine <= endLine.number;

    // Check if ANY collaborator (local or remote) is focused on this block
    // Uses y-codemirror.next's cursor positions which survive document edits
    let anyCollaboratorFocused = localCursorInBlock;
    if (awarenessSystem && !localCursorInBlock) {
      try {
        // Check remote cursors (uses RelativePositions, survives edits)
        anyCollaboratorFocused = awarenessSystem.isBlockFocused(blockStart, blockEnd);
      } catch (e) {
        // If awareness fails, fall back to local-only behavior
        console.warn('Output widget: awareness check failed', e);
        anyCollaboratorFocused = false;
      }
    }

    // Only hide/show lines with ANSI codes (plain text shows as-is)
    const hasAnsiContent = hasAnsi(content);

    // Add line decorations to hide/show raw text (only for ANSI content)
    if (hasAnsiContent) {
      for (let i = startLine.number; i <= endLine.number; i++) {
        const line = doc.line(i);
        decorations.push(
          Decoration.line({
            class: anyCollaboratorFocused ? 'cm-output-line-visible' : 'cm-output-line-hidden',
          }).range(line.from)
        );
      }
    }

    // Always add widget after opening fence line for stdin input placement
    // Widget will be hidden for plain text content or when any collaborator is editing
    decorations.push(
      Decoration.widget({
        widget: new OutputWidget(content.trimEnd(), anyCollaboratorFocused || !hasAnsiContent, blockStart),
        side: 1,
      }).range(startLine.to)
    );
  }

  return Decoration.set(decorations, true);
}

/**
 * ViewPlugin that manages output block decorations with awareness support.
 * When any collaborator focuses on an output block, all clients see raw text.
 *
 * Follows y-codemirror.next pattern:
 * - Awareness changes dispatch a transaction with annotation
 * - update() always rebuilds decorations (no conditional)
 * - This ensures decorations are rebuilt during the normal CodeMirror cycle
 */
export const outputWidgetPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      // Get awareness from facet (may be null initially)
      this.awarenessSystem = view.state.facet(outputWidgetAwarenessFacet);
      this.unsubscribe = null;

      // Build initial decorations
      this.decorations = buildDecorations(view, this.awarenessSystem);

      // Setup awareness listener (following y-codemirror.next pattern)
      // The listener dispatches a transaction which triggers update()
      this._setupAwarenessListener(view);
    }

    /**
     * Setup awareness listener following y-codemirror.next pattern:
     * When awareness changes, dispatch a transaction with annotation.
     * This triggers the update() method during normal CodeMirror cycle.
     *
     * IMPORTANT: Only dispatch for REMOTE client changes to avoid
     * recursive update errors. Local changes are already handled
     * by the current update cycle.
     */
    _setupAwarenessListener(view) {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }

      if (this.awarenessSystem) {
        // Following y-codemirror.next pattern exactly:
        // Only dispatch when REMOTE clients change (not local)
        this.unsubscribe = this.awarenessSystem.onCollaboratorsChange((collaborators, changeInfo) => {
          // Only dispatch for remote changes to avoid recursive updates
          // Local changes are already being processed in the current update cycle
          if (changeInfo?.isRemote) {
            view.dispatch({
              annotations: [outputWidgetAwarenessAnnotation.of([])]
            });
          }
        });
      }
    }

    /**
     * Called on every CodeMirror transaction.
     * Following y-codemirror.next pattern: ALWAYS rebuild decorations.
     */
    update(update) {
      // Check if awareness facet changed (e.g., awareness was added after view creation)
      const newAwareness = update.state.facet(outputWidgetAwarenessFacet);
      if (newAwareness !== this.awarenessSystem) {
        this.awarenessSystem = newAwareness;
        this._setupAwarenessListener(update.view);
      }

      // ALWAYS rebuild decorations (following y-codemirror.next pattern)
      // Uses y-codemirror.next cursor positions to check remote focus
      // (no separate focusedBlock state needed - cursor positions survive edits)
      this.decorations = buildDecorations(update.view, this.awarenessSystem);
    }

    destroy() {
      if (this.unsubscribe) {
        this.unsubscribe();
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
.cm-output-line-hidden > *:not(.cm-output-widget) {
  color: transparent !important;
}

/* Widget content must NOT be transparent */
.cm-output-widget,
.cm-output-widget * {
  color: inherit;
}
.cm-output-widget pre {
  color: var(--output-text, #e0e0e0);
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

/* Stdin input styles */
.mrmd-stdin-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  background: var(--stdin-bg, rgba(0, 0, 0, 0.2));
  border-radius: 4px;
  border: 1px solid var(--stdin-border, rgba(100, 149, 237, 0.5));
}

.mrmd-stdin-prompt {
  color: var(--stdin-prompt-color, #6495ed);
  font-weight: 500;
  white-space: pre;
}

.mrmd-stdin-field {
  flex: 1;
  background: var(--stdin-field-bg, rgba(255, 255, 255, 0.1));
  border: 1px solid var(--stdin-field-border, rgba(255, 255, 255, 0.2));
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--stdin-field-color, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  outline: none;
}

.mrmd-stdin-field:focus {
  border-color: var(--stdin-field-focus-border, #6495ed);
  box-shadow: 0 0 0 2px var(--stdin-field-focus-shadow, rgba(100, 149, 237, 0.3));
}

.mrmd-stdin-field::placeholder {
  color: var(--stdin-placeholder-color, rgba(224, 224, 224, 0.5));
}
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
