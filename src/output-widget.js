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

// =============================================================================
// Height Cache for Stable Layout (prevents jitter when editing output blocks)
// =============================================================================

/**
 * Cache of output widget heights, keyed by block start position.
 * Used to pad raw markdown to prevent layout shift.
 */
const outputHeightCache = new Map();

/**
 * Cache the height of an output widget
 */
function cacheOutputHeight(blockStart, height) {
  if (height > 0) {
    outputHeightCache.set(blockStart, height);
  }
}

/**
 * Get cached height for an output block
 */
function getCachedOutputHeight(blockStart) {
  return outputHeightCache.get(blockStart);
}

// Facet to provide awareness system to the output widget
export const outputWidgetAwarenessFacet = Facet.define({
  combine: values => values[values.length - 1] || null
});

// Annotation to mark awareness-triggered updates (following y-codemirror.next pattern)
const outputWidgetAwarenessAnnotation = Annotation.define();

// Store pending stdin requests keyed by execId
// Key: execId, Value: { prompt, password, execId, cellIndex, resolve, reject, _currentValue }
export const pendingStdinRequests = new Map();

// #region WIDGET

/**
 * Widget for rendering output with ANSI colors
 */
class OutputWidget extends WidgetType {
  /**
   * @param {string} content - Output content with ANSI codes
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   * @param {number} blockStart - Document position where this output block starts
   * @param {string|null} execId - Execution ID for this output block
   */
  constructor(content, hidden = false, blockStart = 0, execId = null) {
    super();
    this.content = content;
    this.hidden = hidden;
    this.blockStart = blockStart;
    this.execId = execId;
  }

  eq(other) {
    return other.content === this.content && other.hidden === this.hidden && other.blockStart === this.blockStart && other.execId === this.execId;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    // Store block position for backwards compat
    container.dataset.outputBlockStart = String(this.blockStart);
    // Store execId for stdin input injection - this is the key identifier
    if (this.execId) {
      container.dataset.execId = this.execId;
    }

    // Render with ANSI colors
    const html = terminalToHtml(this.content);
    container.innerHTML = `<pre class="cm-output-content">${html}</pre>`;

    // Cache height for stable layout (prevents jitter when editing)
    // Only cache when not hidden (widget is visible and has real height)
    if (!this.hidden) {
      const blockStart = this.blockStart;
      requestAnimationFrame(() => {
        // Cache the widget's container height
        if (container.offsetHeight > 0) {
          cacheOutputHeight(blockStart, container.offsetHeight);
        }
      });
    }

    // Copy on click
    container.title = 'Click to copy output';
    const handleCopy = (e) => {
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

/**
 * Widget for empty output blocks - shows subtle "No output" indicator
 */
class EmptyOutputWidget extends WidgetType {
  /**
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   * @param {number} blockStart - Document position where this output block starts
   * @param {string|null} execId - Execution ID for this output block
   */
  constructor(hidden = false, blockStart = 0, execId = null) {
    super();
    this.hidden = hidden;
    this.blockStart = blockStart;
    this.execId = execId;
  }

  eq(other) {
    return other.hidden === this.hidden && other.blockStart === this.blockStart && other.execId === this.execId;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-empty-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    container.dataset.outputBlockStart = String(this.blockStart);
    if (this.execId) {
      container.dataset.execId = this.execId;
    }
    container.textContent = 'No output';
    return container;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Widget for stdin input blocks.
 * Renders a styled input area that's part of the document (Yjs collaborative).
 * The actual input is stored in the stdin block content, not in this widget.
 *
 * Uses the same overlay pattern as OutputWidget:
 * - Widget is position:absolute, overlays on transparent text lines
 * - When editing, widget hides and lines become visible
 */
class StdinWidget extends WidgetType {
  /**
   * @param {string} content - Current stdin content (what user has typed)
   * @param {boolean} isEditing - Whether any collaborator is focused here
   * @param {number} blockStart - Start position of the stdin block
   * @param {string} execId - Execution ID this stdin belongs to
   * @param {boolean} isPassword - Whether to mask the input
   */
  constructor(content, isEditing, blockStart, execId, isPassword = false) {
    super();
    this.content = content;
    this.isEditing = isEditing;
    this.blockStart = blockStart;
    this.execId = execId;
    this.isPassword = isPassword;
  }

  eq(other) {
    return (
      other.content === this.content &&
      other.isEditing === this.isEditing &&
      other.blockStart === this.blockStart &&
      other.execId === this.execId &&
      other.isPassword === this.isPassword
    );
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-stdin-widget' + (this.isEditing ? ' cm-stdin-widget-hidden' : '');
    container.dataset.execId = this.execId;
    container.dataset.stdinBlockStart = String(this.blockStart);
    if (this.isPassword) {
      container.dataset.password = 'true';
    }

    // Input display area with prompt
    const inputArea = document.createElement('pre');
    inputArea.className = 'cm-stdin-content';

    if (this.content.trim()) {
      // Show the input (masked if password)
      const displayText = this.isPassword ? '•'.repeat(this.content.trim().length) : this.content.trim();
      inputArea.textContent = displayText;
    } else {
      // Show blinking cursor placeholder
      inputArea.innerHTML = '<span class="cm-stdin-cursor">▌</span>';
    }

    container.appendChild(inputArea);

    // Hint below
    const hint = document.createElement('div');
    hint.className = 'cm-stdin-hint';
    hint.textContent = 'Click to type · Enter to submit';
    container.appendChild(hint);

    return container;
  }

  ignoreEvent() {
    return false; // Allow click events
  }
}

/**
 * Empty stdin widget - shown when stdin block has no content yet
 * Uses same overlay pattern as OutputWidget
 */
class EmptyStdinWidget extends WidgetType {
  constructor(isEditing, blockStart, execId, isPassword = false) {
    super();
    this.isEditing = isEditing;
    this.blockStart = blockStart;
    this.execId = execId;
    this.isPassword = isPassword;
  }

  eq(other) {
    return (
      other.isEditing === this.isEditing &&
      other.blockStart === this.blockStart &&
      other.execId === this.execId
    );
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-stdin-widget' + (this.isEditing ? ' cm-stdin-widget-hidden' : '');
    container.dataset.execId = this.execId;
    container.dataset.stdinBlockStart = String(this.blockStart);
    if (this.isPassword) {
      container.dataset.password = 'true';
    }

    // Input display area with blinking cursor
    const inputArea = document.createElement('pre');
    inputArea.className = 'cm-stdin-content';
    inputArea.innerHTML = '<span class="cm-stdin-cursor">▌</span>';
    container.appendChild(inputArea);

    // Hint below
    const hint = document.createElement('div');
    hint.className = 'cm-stdin-hint';
    hint.textContent = 'Click to type · Enter to submit';
    container.appendChild(hint);

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
 * Supports both ```output and ```output:execId formats.
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
  const text = doc.toString();

  // Find ```output or ```output:execId blocks
  // Group 1: optional execId, Group 2: content
  const outputBlockRegex = /```output(?::([^\n]*))?\n([\s\S]*?)```/g;
  let match;

  // Track which execIds have output blocks (for stdin positioning)
  const outputBlocksByExecId = new Map();

  while ((match = outputBlockRegex.exec(text)) !== null) {
    const execId = match[1] || null;  // May be undefined for legacy ```output blocks
    const content = match[2];
    const blockStart = match.index;
    const blockEnd = blockStart + match[0].length;

    // Store for stdin positioning
    if (execId) {
      outputBlocksByExecId.set(execId, { blockStart, blockEnd });
    }

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

    // ALWAYS add line decorations to hide raw text (widget overlays on top)
    // When editing (anyCollaboratorFocused), lines become visible and widget hides
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = doc.line(i);
      decorations.push(
        Decoration.line({
          class: anyCollaboratorFocused ? 'cm-output-line-visible' : 'cm-output-line-hidden',
        }).range(line.from)
      );
    }

    // Stable layout: when editing, add spacer to prevent layout shift
    if (anyCollaboratorFocused) {
      const cachedHeight = getCachedOutputHeight(blockStart);
      if (cachedHeight) {
        // Calculate raw content height
        const lineCount = endLine.number - startLine.number + 1;
        const lineHeight = view.defaultLineHeight;
        const rawHeight = lineCount * lineHeight;
        const padding = cachedHeight - rawHeight;

        if (padding > 0) {
          // Add padding to the last line (closing fence)
          decorations.push(
            Decoration.line({
              attributes: {
                class: 'cm-output-spacer-line',
                style: `padding-bottom: ${padding}px`
              }
            }).range(endLine.from)
          );
        }
      }
    }

    // Check if output is empty (just whitespace)
    const trimmedContent = content.trim();
    const isEmpty = trimmedContent.length === 0;

    // Add appropriate widget after opening fence line
    if (isEmpty) {
      // Empty output - show subtle indicator
      decorations.push(
        Decoration.widget({
          widget: new EmptyOutputWidget(anyCollaboratorFocused, blockStart, execId),
          side: 1,
        }).range(startLine.to)
      );
    } else {
      // Has content - show output widget
      decorations.push(
        Decoration.widget({
          widget: new OutputWidget(trimmedContent, anyCollaboratorFocused, blockStart, execId),
          side: 1,
        }).range(startLine.to)
      );
    }

  }

  // Find ```stdin:execId blocks
  // These are collaborative input blocks that appear when stdin is requested
  const stdinBlockRegex = /```stdin:([^\n]*)\n([\s\S]*?)```/g;
  let stdinMatch;

  while ((stdinMatch = stdinBlockRegex.exec(text)) !== null) {
    const execId = stdinMatch[1];
    const content = stdinMatch[2];
    const blockStart = stdinMatch.index;
    const blockEnd = blockStart + stdinMatch[0].length;

    // Check if execId contains password flag (e.g., "exec-123:password")
    const isPassword = execId.includes(':password');
    const cleanExecId = execId.replace(':password', '');

    // Get line range
    const startLine = doc.lineAt(blockStart);
    const endLine = doc.lineAt(blockEnd);

    // Check if LOCAL cursor is inside this block
    const localCursorInBlock = cursorLine >= startLine.number && cursorLine <= endLine.number;

    // Check if ANY collaborator is focused on this block
    let anyCollaboratorFocused = localCursorInBlock;
    if (awarenessSystem && !localCursorInBlock) {
      try {
        anyCollaboratorFocused = awarenessSystem.isBlockFocused(blockStart, blockEnd);
      } catch (e) {
        anyCollaboratorFocused = false;
      }
    }

    // Add line decorations (same pattern as output blocks)
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = doc.line(i);
      decorations.push(
        Decoration.line({
          class: anyCollaboratorFocused ? 'cm-stdin-line-visible' : 'cm-stdin-line-hidden',
        }).range(line.from)
      );
    }

    // Check if stdin has content
    const trimmedContent = content.trim();
    const isEmpty = trimmedContent.length === 0;

    // Add appropriate widget
    if (isEmpty) {
      decorations.push(
        Decoration.widget({
          widget: new EmptyStdinWidget(anyCollaboratorFocused, blockStart, cleanExecId, isPassword),
          side: 1,
        }).range(startLine.to)
      );
    } else {
      decorations.push(
        Decoration.widget({
          widget: new StdinWidget(trimmedContent, anyCollaboratorFocused, blockStart, cleanExecId, isPassword),
          side: 1,
        }).range(startLine.to)
      );
    }
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
 *
 * Uses CSS custom properties from the widget theme system.
 * See widgets/theme.js for available tokens.
 */
export const outputWidgetStyles = `
/* Output widget container */
/* Widget is absolutely positioned - overlays on transparent text lines, doesn't add to flow */
.cm-output-widget {
  position: absolute;
  left: var(--widget-inset-left, 0);
  right: 0;
  top: var(--widget-offset-top, 0);  /* Can be negative to pull widget up closer to code block */
  z-index: 1;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  line-height: var(--widget-line-height, inherit);
  padding: var(--widget-padding-y, 8px) var(--widget-padding-x, 12px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  overflow-x: auto;
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-border-accent, rgba(100, 149, 237, 0.6));
  cursor: pointer;
}

.cm-output-widget pre {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.cm-output-widget:hover {
  background: var(--widget-surface-hover, rgba(0, 0, 0, 0.45));
}

/* ==========================================================================
   CRITICAL: Stable Layout Pattern

   The widget is position:absolute so it doesn't add to document flow.
   Text lines ALWAYS provide the vertical space. Widget overlays on top.

   Viewing mode: text transparent, widget visible (z-index: 1)
   Editing mode: text visible (z-index: 2, opaque bg), widget hidden
   ========================================================================== */

/* Hidden when cursor is in block (editing mode) */
.cm-output-widget-hidden {
  display: none !important;
}

/* Both states: lines always take same space */
.cm-output-line-hidden,
.cm-output-line-visible {
  position: relative;
}

/* Hidden: text invisible but same space */
.cm-output-line-hidden {
  color: transparent !important;
  user-select: none;
}
.cm-output-line-hidden > span {
  visibility: hidden !important;
}

/* Visible: text shown for editing - must cover the widget underneath */
.cm-output-line-visible {
  color: var(--widget-text, #e0e0e0);
  position: relative;
  z-index: 2;
  background: var(--widget-surface-elevated, #1e1e1e);
}

/* Widget text color */
.cm-output-widget pre {
  color: var(--widget-text, #e0e0e0);
}

/* Output content container */
.cm-output-content {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Empty output widget - subtle indicator */
.cm-empty-output-widget {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size-small, 0.85em);
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.35));
  padding: 4px var(--widget-padding-x, 12px);
  margin: 2px 0;
  font-style: italic;
}

/* Stdin input widget - positioned via CodeMirror decoration system */
.cm-stdin-widget {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--widget-padding-y, 8px) var(--widget-padding-x, 12px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-stdin-accent, #f59e0b);
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  margin: 4px 0;
}

.cm-stdin-widget .cm-stdin-prompt {
  color: var(--widget-stdin-accent, #f59e0b);
  font-weight: 500;
  white-space: nowrap;
}

.cm-stdin-widget .cm-stdin-field {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.15));
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  outline: none;
}

.cm-stdin-widget .cm-stdin-field:focus {
  border-color: var(--widget-stdin-accent, #f59e0b);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.cm-stdin-widget .cm-stdin-field::placeholder {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
}

.cm-stdin-widget .cm-stdin-hint {
  font-size: 0.8em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  white-space: nowrap;
}

.cm-stdin-widget.cm-stdin-submitted {
  opacity: 0.6;
  border-left-color: var(--widget-success, #22c55e);
}

.cm-stdin-widget.cm-stdin-cancelled {
  opacity: 0.6;
  border-left-color: var(--widget-error, #ef4444);
}

/* Copy feedback */
.cm-output-copy-feedback {
  position: absolute;
  top: var(--widget-padding-y, 8px);
  right: var(--widget-padding-x, 12px);
  padding: 4px 8px;
  background: var(--widget-success, #22c55e);
  color: white;
  border-radius: 4px;
  font-size: var(--widget-font-size-small, 0.8em);
  animation: fadeOut 1.5s ease-out forwards;
}

@keyframes fadeOut {
  0%, 70% { opacity: 1; }
  100% { opacity: 0; }
}

/* ANSI text styles */
${ansiStyles}

/* Stdin input styles - inline with output */
.mrmd-stdin-container {
  display: inline-flex;
  align-items: baseline;
  margin: 0;
  padding: 0;
  min-width: 150px;
}

.mrmd-stdin-prompt {
  color: var(--widget-text-accent, #6495ed);
  white-space: pre;
}

.mrmd-stdin-field {
  flex: 1;
  min-width: 100px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--widget-border-focus, #6495ed);
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  padding: 0 2px;
  margin: 0;
  outline: none;
  caret-color: var(--widget-text-accent, #6495ed);
}

.mrmd-stdin-field:focus {
  border-bottom-color: var(--widget-text-accent, #6495ed);
  animation: stdin-cursor-blink 1s step-end infinite;
}

.mrmd-stdin-field::placeholder {
  color: transparent;
}

/* Blinking cursor animation for the input field */
@keyframes stdin-cursor-blink {
  50% {
    border-bottom-color: transparent;
  }
}

/* Visual indicator that input is active */
.mrmd-stdin-container::after {
  content: '\\2588'; /* Block cursor character */
  color: var(--widget-text-accent, #6495ed);
  animation: stdin-block-blink 1s step-end infinite;
  margin-left: 1px;
  font-size: 0.9em;
}

@keyframes stdin-block-blink {
  50% {
    opacity: 0;
  }
}

/* When input is submitted */
.mrmd-stdin-submitted .mrmd-stdin-field {
  border-bottom-color: var(--widget-success, #22c55e);
}

.mrmd-stdin-submitted::after {
  display: none;
}

/* Inline stdin input - injected directly into output widget content */
.mrmd-stdin-inline {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.05));
  padding: 2px 6px;
  border-radius: 3px;
  margin-left: 2px;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  border-bottom: 2px solid var(--widget-stdin-accent, #f59e0b);
}

.mrmd-stdin-inline .mrmd-stdin-prompt {
  color: var(--widget-stdin-accent, #f59e0b);
  white-space: pre;
}

.mrmd-stdin-inline .mrmd-stdin-field {
  min-width: 120px;
  max-width: 300px;
  background: transparent;
  border: none;
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  padding: 0 2px;
  outline: none;
  caret-color: var(--widget-stdin-accent, #f59e0b);
}

.mrmd-stdin-inline .mrmd-stdin-field:focus {
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.08));
}

.mrmd-stdin-inline .mrmd-stdin-hint {
  font-size: 0.8em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  white-space: nowrap;
}

/* Submitted state */
.mrmd-stdin-inline.mrmd-stdin-submitted {
  border-bottom-color: var(--widget-success, #22c55e);
  opacity: 0.8;
}

.mrmd-stdin-inline.mrmd-stdin-submitted .mrmd-stdin-field {
  color: var(--widget-success, #22c55e);
}

/* Cancelled state */
.mrmd-stdin-inline.mrmd-stdin-cancelled {
  border-bottom-color: var(--widget-error, #ef4444);
  opacity: 0.6;
}

.mrmd-stdin-inline.mrmd-stdin-cancelled .mrmd-stdin-field {
  text-decoration: line-through;
  color: var(--widget-error, #ef4444);
}

/* Stdin input positioned near code cell - main style for input requests */
.mrmd-stdin-cell-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-input-accent, #f59e0b);
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.mrmd-stdin-cell-input .mrmd-stdin-prompt {
  color: var(--widget-input-accent, #f59e0b);
  font-weight: 500;
  white-space: nowrap;
}

.mrmd-stdin-cell-input .mrmd-stdin-field {
  flex: 1;
  min-width: 200px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  outline: none;
}

.mrmd-stdin-cell-input .mrmd-stdin-field:focus {
  border-color: var(--widget-input-accent, #f59e0b);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.mrmd-stdin-cell-input .mrmd-stdin-field::placeholder {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
}

/* Hide blinking cursor for cell input - use regular cursor instead */
.mrmd-stdin-cell-input.mrmd-stdin-container::after {
  display: none;
}

/* Add hint text */
.mrmd-stdin-cell-input::after {
  content: 'Enter to submit, Esc to cancel';
  font-size: 0.75em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  white-space: nowrap;
}

/* Legacy styles for fallback absolute positioning */
.mrmd-stdin-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--widget-padding-y, 8px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: 4px;
  border: var(--widget-border-width, 1px) solid var(--widget-border-focus, #6495ed);
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-border-accent, rgba(100, 149, 237, 0.6));
}

/* ========================================================================== */
/* STDIN BLOCK WIDGET STYLES                                                  */
/* Uses same overlay pattern as output widget:                                */
/* - Widget is position:absolute, overlays on transparent text lines          */
/* - When editing (focused), widget hides and raw lines become visible        */
/* ========================================================================== */

/* Both states: lines always take same space (like output) */
.cm-stdin-line-hidden,
.cm-stdin-line-visible {
  position: relative;
}

/* Hidden: text invisible but same space (matches output pattern) */
.cm-stdin-line-hidden {
  color: transparent !important;
  user-select: none;
}
.cm-stdin-line-hidden > span {
  visibility: hidden !important;
}

/* Visible: text shown for editing - must cover the widget underneath */
.cm-stdin-line-visible {
  color: var(--widget-text, #e0e0e0);
  position: relative;
  z-index: 2;
  background: var(--widget-surface-elevated, #1e1e1e);
}

/* Main stdin widget container - position:absolute like output widget */
.cm-stdin-widget {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  line-height: var(--widget-line-height, inherit);
  padding: var(--widget-padding-y, 8px) var(--widget-padding-x, 12px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  overflow-x: auto;
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-stdin-accent, #f59e0b);
  cursor: text;
}

.cm-stdin-widget:hover {
  background: var(--widget-surface-hover, rgba(0, 0, 0, 0.45));
}

/* Hidden when cursor is in block (editing mode) - matches output */
.cm-stdin-widget-hidden {
  display: none !important;
}

/* Stdin content area (displays what user has typed) */
.cm-stdin-widget pre.cm-stdin-content {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--widget-text, #e0e0e0);
  min-height: 1.2em;
}

/* Blinking cursor when empty */
.cm-stdin-cursor {
  color: var(--widget-stdin-accent, #f59e0b);
  animation: stdin-cursor-blink 1s step-end infinite;
}

@keyframes stdin-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Hint text below input */
.cm-stdin-widget .cm-stdin-hint {
  font-size: 0.75em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  margin-top: 4px;
}

/* Password masking - show dots instead of actual characters */
.cm-stdin-widget[data-password="true"] .cm-stdin-content {
  letter-spacing: 0.2em;
}
`;

// #endregion STYLES

// #region STDIN_INJECTION

// Terminal-like stdin is handled via _setupStdinKeyHandler() in execution.js
// Old widget-injection code has been removed in favor of the simpler approach:
// 1. When stdin_request arrives, cursor is moved into output block (raw mode)
// 2. User types directly in the raw markdown
// 3. Enter is captured and sent as input

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
