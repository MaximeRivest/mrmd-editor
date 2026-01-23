/**
 * AI Integration for CodeMirror
 *
 * Provides:
 * - StateField for tracking pending AI operations
 * - Loading placeholder decorations (shimmer while AI works)
 * - Pending change decorations (shimmer on new text)
 * - Accept/reject flow for AI suggestions
 * - Spark widget for cursor-based AI menu
 * - ResponsePicker widget for multi-model responses
 */

import { StateField, StateEffect, Facet } from '@codemirror/state';
import { Decoration, WidgetType, EditorView, ViewPlugin } from '@codemirror/view';
import { keymap } from '@codemirror/view';

// ===========================================================================
// Simple Markdown Renderer (for ResponsePicker)
// ===========================================================================

/**
 * Convert markdown to HTML for display in ResponsePicker.
 * Handles: code blocks, inline code, bold, italic, links, headers, lists.
 * @param {string} md - Markdown text
 * @returns {string} HTML string
 */
function renderMarkdownToHtml(md) {
  if (!md) return '';

  let html = md;

  // Escape HTML first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```lang\ncode\n```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${langClass}>${code.trim()}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Headers (# to ######)
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Unordered lists (- item or * item)
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists (1. item)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<(?:pre|ul|ol|h[1-6])>)/g, '$1');
  html = html.replace(/(<\/(?:pre|ul|ol|h[1-6])>)<\/p>/g, '$1');

  return html;
}

// ===========================================================================
// State Effects
// ===========================================================================

/**
 * Start an AI operation (shows loading placeholder)
 */
export const startAiOperation = StateEffect.define();

/**
 * Complete an AI operation with result (shows pending change)
 */
export const completeAiOperation = StateEffect.define();

/**
 * Cancel an AI operation
 */
export const cancelAiOperation = StateEffect.define();

/**
 * Accept a pending AI change
 */
export const acceptAiChange = StateEffect.define();

/**
 * Reject a pending AI change
 */
export const rejectAiChange = StateEffect.define();

/**
 * Accept all pending AI changes
 */
export const acceptAllAiChanges = StateEffect.define();

/**
 * Reject all pending AI changes
 */
export const rejectAllAiChanges = StateEffect.define();

// ===========================================================================
// Multi-Response (ResponsePicker) State Effects
// ===========================================================================

/**
 * Start an AI operation with multi-response picker support
 * @type {StateEffect<{id: string, from: number, to: number, type: 'insert'|'replace', originalText?: string, onCancel?: function}>}
 */
export const startAiOperationMulti = StateEffect.define();

/**
 * Add a response to an existing multi-response operation
 * @type {StateEffect<{id: string, model: string, response: string|null, error?: string, isSynthesized?: boolean, status: 'pending'|'loading'|'complete'|'error'}>}
 */
export const addAiResponse = StateEffect.define();

/**
 * Update response status (e.g., loading -> complete)
 * @type {StateEffect<{id: string, model: string, response?: string, error?: string, status: 'complete'|'error'}>}
 */
export const updateAiResponse = StateEffect.define();

/**
 * Set the selected response index in the picker
 * @type {StateEffect<{id: string, index: number}>}
 */
export const setSelectedResponse = StateEffect.define();

/**
 * Accept the currently selected response
 * @type {StateEffect<{id: string}>}
 */
export const acceptSelectedResponse = StateEffect.define();

// ===========================================================================
// AI Operation Types
// ===========================================================================

/**
 * @typedef {Object} ResponseOption
 * @property {string} model - Model name (e.g., 'grok-4', 'Synthesized')
 * @property {string|null} response - Response text (null while loading)
 * @property {string|null} error - Error message if failed
 * @property {boolean} isSynthesized - True for the merged/synthesized result
 * @property {'pending'|'loading'|'complete'|'error'} status - Response status
 */

/**
 * @typedef {Object} AiOperation
 * @property {string} id - Unique operation ID
 * @property {string} type - Operation type: 'insert', 'replace'
 * @property {number} from - Start position
 * @property {number} to - End position (same as from for inserts)
 * @property {string} [originalText] - Original text being replaced
 * @property {string} [newText] - AI-generated text (when complete)
 * @property {string} status - 'loading', 'pending', 'accepted', 'rejected', 'multi'
 * @property {number} startTime - When operation started
 * @property {function} [onCancel] - Callback when cancelled
 * @property {boolean} [isMultiMode] - True if using ResponsePicker
 * @property {ResponseOption[]} [responses] - Array of responses for multi-mode
 * @property {number} [selectedIndex] - Currently selected response index
 */

// ===========================================================================
// State Field
// ===========================================================================

/**
 * StateField for AI operations
 */
export const aiState = StateField.define({
  create() {
    return {
      operations: new Map(), // id -> AiOperation
      juiceLevel: 0,
    };
  },

  update(state, tr) {
    let newState = state;

    for (const effect of tr.effects) {
      if (effect.is(startAiOperation)) {
        const op = effect.value;
        const operations = new Map(state.operations);
        operations.set(op.id, {
          ...op,
          status: 'loading',
          startTime: Date.now(),
        });
        newState = { ...state, operations };
      }

      if (effect.is(completeAiOperation)) {
        const { id, newText } = effect.value;
        const operations = new Map(state.operations);
        const op = operations.get(id);
        if (op) {
          operations.set(id, {
            ...op,
            newText,
            status: 'pending',
          });
          newState = { ...state, operations };
        }
      }

      if (effect.is(cancelAiOperation)) {
        const { id } = effect.value;
        const operations = new Map(state.operations);
        const op = operations.get(id);
        if (op) {
          op.onCancel?.();
          operations.delete(id);
          newState = { ...state, operations };
        }
      }

      if (effect.is(acceptAiChange)) {
        const { id } = effect.value;
        const operations = new Map(state.operations);
        operations.delete(id);
        newState = { ...state, operations };
      }

      if (effect.is(rejectAiChange)) {
        const { id } = effect.value;
        const operations = new Map(state.operations);
        operations.delete(id);
        newState = { ...state, operations };
      }

      if (effect.is(acceptAllAiChanges)) {
        newState = { ...state, operations: new Map() };
      }

      if (effect.is(rejectAllAiChanges)) {
        newState = { ...state, operations: new Map() };
      }

      // Multi-response operations
      if (effect.is(startAiOperationMulti)) {
        const op = effect.value;
        const operations = new Map(state.operations);
        operations.set(op.id, {
          ...op,
          status: 'multi',
          startTime: Date.now(),
          isMultiMode: true,
          responses: [],
          selectedIndex: 0,
        });
        newState = { ...state, operations };
      }

      if (effect.is(addAiResponse)) {
        const { id, model, response, error, isSynthesized, status } = effect.value;
        const operations = new Map(state.operations);
        const op = operations.get(id);
        if (op && op.isMultiMode) {
          const responses = [...(op.responses || [])];
          // Check if model already exists (update it)
          const existingIdx = responses.findIndex(r => r.model === model);
          const newResponse = { model, response, error: error || null, isSynthesized: isSynthesized || false, status };
          if (existingIdx >= 0) {
            responses[existingIdx] = newResponse;
          } else {
            responses.push(newResponse);
          }
          // Auto-select synthesized response if it arrives
          let selectedIndex = op.selectedIndex;
          if (isSynthesized && status === 'complete') {
            selectedIndex = responses.length - 1;
          }
          operations.set(id, { ...op, responses, selectedIndex });
          newState = { ...state, operations };
        }
      }

      if (effect.is(updateAiResponse)) {
        const { id, model, response, error, status } = effect.value;
        const operations = new Map(state.operations);
        const op = operations.get(id);
        if (op && op.isMultiMode) {
          const responses = [...(op.responses || [])];
          const idx = responses.findIndex(r => r.model === model);
          if (idx >= 0) {
            responses[idx] = { ...responses[idx], response, error: error || null, status };
            operations.set(id, { ...op, responses });
            newState = { ...state, operations };
          }
        }
      }

      if (effect.is(setSelectedResponse)) {
        const { id, index } = effect.value;
        const operations = new Map(state.operations);
        const op = operations.get(id);
        if (op && op.isMultiMode) {
          const maxIndex = (op.responses?.length || 1) - 1;
          const clampedIndex = Math.max(0, Math.min(index, maxIndex));
          operations.set(id, { ...op, selectedIndex: clampedIndex });
          newState = { ...state, operations };
        }
      }

      if (effect.is(acceptSelectedResponse)) {
        const { id } = effect.value;
        const operations = new Map(state.operations);
        const op = operations.get(id);
        if (op && op.isMultiMode && op.responses?.length > 0) {
          const selectedResponse = op.responses[op.selectedIndex];
          if (selectedResponse?.response) {
            // Mark with the selected response text for insertion
            operations.set(id, {
              ...op,
              newText: selectedResponse.response,
              status: 'accepted',
            });
            newState = { ...state, operations };
          }
        }
      }
    }

    // Adjust positions for document changes
    if (tr.docChanged && newState.operations.size > 0) {
      const operations = new Map();
      for (const [id, op] of newState.operations) {
        const newFrom = tr.changes.mapPos(op.from, 1);
        const newTo = tr.changes.mapPos(op.to, -1);
        operations.set(id, { ...op, from: newFrom, to: newTo });
      }
      newState = { ...newState, operations };
    }

    return newState;
  },
});

// ===========================================================================
// ResponsePicker StateField (for block decorations)
// Block widgets must be provided via StateField with EditorView.decorations
// ===========================================================================

/**
 * Stored callbacks for ResponsePicker widgets
 * Keyed by operation ID, contains view reference and callbacks
 */
const responsePickerCallbacks = new Map();

/**
 * StateField that provides ResponsePicker block decorations
 */
export const responsePickerField = StateField.define({
  create() {
    return Decoration.none;
  },

  update(decorations, tr) {
    const state = tr.state.field(aiState);
    const widgets = [];

    for (const [id, op] of state.operations) {
      if (op.status === 'multi' && op.isMultiMode) {
        const responses = op.responses || [];
        const selectedIndex = op.selectedIndex || 0;

        // Get or create callbacks for this operation
        let callbacks = responsePickerCallbacks.get(id);
        if (!callbacks) {
          callbacks = {
            navigate: null,
            accept: null,
            reject: null,
          };
          responsePickerCallbacks.set(id, callbacks);
        }

        // Create widget with placeholder callbacks (will be bound when view is available)
        const widget = new ResponsePickerWidget(
          id,
          responses,
          selectedIndex,
          (delta) => callbacks.navigate?.(delta),
          () => callbacks.accept?.(),
          () => callbacks.reject?.()
        );

        widgets.push(
          Decoration.widget({
            widget,
            block: true,
            side: 1,
          }).range(op.from)
        );
      }
    }

    // Clean up callbacks for removed operations
    for (const id of responsePickerCallbacks.keys()) {
      if (!state.operations.has(id)) {
        responsePickerCallbacks.delete(id);
      }
    }

    return Decoration.set(widgets, true);
  },

  provide: field => EditorView.decorations.from(field),
});

/**
 * ViewPlugin to bind ResponsePicker callbacks to the view
 */
const responsePickerCallbackPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.bindCallbacks(view);
    }

    bindCallbacks(view) {
      const state = view.state.field(aiState);
      for (const [id, op] of state.operations) {
        if (op.status === 'multi' && op.isMultiMode) {
          const callbacks = responsePickerCallbacks.get(id);
          if (callbacks) {
            const responses = op.responses || [];
            const selectedIndex = op.selectedIndex || 0;

            callbacks.navigate = (delta) => {
              const newIndex = selectedIndex + delta;
              view.dispatch({ effects: setSelectedResponse.of({ id, index: newIndex }) });
            };

            callbacks.accept = () => {
              const selected = responses[selectedIndex];
              if (selected?.response) {
                if (op.type === 'insert') {
                  view.dispatch({
                    changes: { from: op.from, insert: selected.response },
                    effects: [acceptSelectedResponse.of({ id }), cancelAiOperation.of({ id })],
                  });
                } else {
                  view.dispatch({
                    changes: { from: op.from, to: op.to, insert: selected.response },
                    effects: [acceptSelectedResponse.of({ id }), cancelAiOperation.of({ id })],
                  });
                }
              }
            };

            callbacks.reject = () => {
              op.onCancel?.();
              view.dispatch({ effects: cancelAiOperation.of({ id }) });
            };
          }
        }
      }
    }

    update(update) {
      if (update.state.field(aiState) !== update.startState.field(aiState)) {
        this.bindCallbacks(update.view);
      }
    }
  }
);

// ===========================================================================
// Loading Placeholder Widget
// ===========================================================================

class LoadingPlaceholderWidget extends WidgetType {
  constructor(operationId, onCancel) {
    super();
    this.operationId = operationId;
    this.onCancel = onCancel;
  }

  toDOM(view) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-ai-loading';
    wrapper.setAttribute('data-operation-id', this.operationId);

    // Shimmer dots
    const dots = document.createElement('span');
    dots.className = 'cm-ai-loading-dots';
    dots.textContent = '...';
    wrapper.appendChild(dots);

    // Cancel button (shows on hover)
    const cancelBtn = document.createElement('span');
    cancelBtn.className = 'cm-ai-loading-cancel';
    cancelBtn.textContent = '×';
    cancelBtn.title = 'Cancel';
    cancelBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onCancel?.();
    };
    wrapper.appendChild(cancelBtn);

    return wrapper;
  }

  eq(other) {
    return other.operationId === this.operationId;
  }

  ignoreEvent() {
    return false;
  }
}

// ===========================================================================
// Pending Change Widget (for inline actions)
// ===========================================================================

class PendingChangeActionsWidget extends WidgetType {
  constructor(operationId, onAccept, onReject) {
    super();
    this.operationId = operationId;
    this.onAccept = onAccept;
    this.onReject = onReject;
  }

  toDOM(view) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-ai-pending-actions';
    wrapper.setAttribute('data-operation-id', this.operationId);

    const acceptBtn = document.createElement('span');
    acceptBtn.className = 'cm-ai-accept-btn';
    acceptBtn.textContent = '✓';
    acceptBtn.title = 'Accept (Enter)';
    acceptBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAccept?.();
    };
    wrapper.appendChild(acceptBtn);

    const rejectBtn = document.createElement('span');
    rejectBtn.className = 'cm-ai-reject-btn';
    rejectBtn.textContent = '×';
    rejectBtn.title = 'Reject (Escape)';
    rejectBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onReject?.();
    };
    wrapper.appendChild(rejectBtn);

    return wrapper;
  }

  eq(other) {
    return other.operationId === this.operationId;
  }

  ignoreEvent() {
    return false;
  }
}

// ===========================================================================
// Spark Cursor Widget
// ===========================================================================

class SparkWidget extends WidgetType {
  constructor(onClick) {
    super();
    this.onClick = onClick;
  }

  toDOM(view) {
    const spark = document.createElement('span');
    spark.className = 'cm-ai-spark';
    spark.textContent = '✦';
    spark.title = 'AI Commands';
    spark.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick?.(e);
    };
    return spark;
  }

  eq(other) {
    return true; // Always equal since it's just a trigger
  }

  ignoreEvent() {
    return false;
  }
}

// ===========================================================================
// ResponsePicker Widget (Multi-Response Selector)
// ===========================================================================

/**
 * Block widget for selecting between multiple AI responses.
 * Shows responses as they stream in, allows navigation, renders markdown.
 */
class ResponsePickerWidget extends WidgetType {
  /**
   * @param {string} operationId
   * @param {ResponseOption[]} responses
   * @param {number} selectedIndex
   * @param {function} onNavigate - (delta: number) => void
   * @param {function} onAccept - () => void
   * @param {function} onReject - () => void
   */
  constructor(operationId, responses, selectedIndex, onNavigate, onAccept, onReject) {
    super();
    this.operationId = operationId;
    this.responses = responses;
    this.selectedIndex = selectedIndex;
    this.onNavigate = onNavigate;
    this.onAccept = onAccept;
    this.onReject = onReject;
  }

  eq(other) {
    return (
      other.operationId === this.operationId &&
      other.selectedIndex === this.selectedIndex &&
      other.responses.length === this.responses.length &&
      other.responses.every((r, i) =>
        r.model === this.responses[i].model &&
        r.status === this.responses[i].status &&
        r.response === this.responses[i].response
      )
    );
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'cm-ai-response-picker';
    container.setAttribute('data-operation-id', this.operationId);

    // Header with navigation
    const header = document.createElement('div');
    header.className = 'cm-ai-picker-header';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'cm-ai-picker-nav cm-ai-picker-prev';
    prevBtn.textContent = '◀';
    prevBtn.title = 'Previous response (←)';
    prevBtn.disabled = this.selectedIndex <= 0;
    prevBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onNavigate?.(-1);
    };
    header.appendChild(prevBtn);

    const title = document.createElement('span');
    title.className = 'cm-ai-picker-title';
    const current = this.responses[this.selectedIndex];
    const modelName = current?.model || 'Loading...';
    const count = `${this.selectedIndex + 1} / ${this.responses.length || '?'}`;
    title.innerHTML = `<span class="cm-ai-picker-model">${modelName}</span> <span class="cm-ai-picker-count">${count}</span>`;
    header.appendChild(title);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'cm-ai-picker-nav cm-ai-picker-next';
    nextBtn.textContent = '▶';
    nextBtn.title = 'Next response (→)';
    nextBtn.disabled = this.selectedIndex >= this.responses.length - 1;
    nextBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onNavigate?.(1);
    };
    header.appendChild(nextBtn);

    container.appendChild(header);

    // Content area (markdown rendered)
    const content = document.createElement('div');
    content.className = 'cm-ai-picker-content';

    if (!current) {
      content.innerHTML = '<div class="cm-ai-picker-loading">Waiting for responses...</div>';
    } else if (current.status === 'loading' || current.status === 'pending') {
      content.innerHTML = `<div class="cm-ai-picker-loading"><span class="cm-ai-picker-spinner"></span> ${current.model} is thinking...</div>`;
    } else if (current.status === 'error') {
      content.innerHTML = `<div class="cm-ai-picker-error">Error: ${current.error || 'Unknown error'}</div>`;
    } else if (current.response) {
      // Render markdown
      const rendered = renderMarkdownToHtml(current.response);
      content.innerHTML = `<div class="cm-ai-picker-markdown">${rendered}</div>`;

      // Setup copy on selection
      content.addEventListener('copy', (e) => {
        // Copy raw markdown instead of rendered HTML
        const selection = window.getSelection();
        if (selection && selection.toString()) {
          // If there's a selection, let default behavior handle it
          // but we could intercept and provide markdown
        }
      });

      // Click to copy whole response
      const copyHint = document.createElement('div');
      copyHint.className = 'cm-ai-picker-copy-hint';
      copyHint.textContent = 'Click to copy markdown';
      content.appendChild(copyHint);

      content.onclick = (e) => {
        // Only copy if not selecting text
        const selection = window.getSelection();
        if (selection && selection.toString()) return;

        navigator.clipboard.writeText(current.response).then(() => {
          copyHint.textContent = 'Copied!';
          setTimeout(() => {
            copyHint.textContent = 'Click to copy markdown';
          }, 1500);
        });
      };
    } else {
      content.innerHTML = '<div class="cm-ai-picker-empty">No response yet</div>';
    }

    container.appendChild(content);

    // Model indicator dots
    const dots = document.createElement('div');
    dots.className = 'cm-ai-picker-dots';
    this.responses.forEach((resp, idx) => {
      const dot = document.createElement('span');
      dot.className = 'cm-ai-picker-dot';
      if (idx === this.selectedIndex) dot.classList.add('selected');
      if (resp.status === 'complete') dot.classList.add('complete');
      if (resp.status === 'loading' || resp.status === 'pending') dot.classList.add('loading');
      if (resp.status === 'error') dot.classList.add('error');
      if (resp.isSynthesized) dot.classList.add('synthesized');
      dot.title = `${resp.model} (${resp.status})`;
      dot.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = idx - this.selectedIndex;
        if (delta !== 0) this.onNavigate?.(delta);
      };
      dots.appendChild(dot);
    });
    container.appendChild(dots);

    // Footer with actions
    const footer = document.createElement('div');
    footer.className = 'cm-ai-picker-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cm-ai-picker-btn cm-ai-picker-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.title = 'Cancel (Escape)';
    cancelBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onReject?.();
    };
    footer.appendChild(cancelBtn);

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'cm-ai-picker-btn cm-ai-picker-accept';
    acceptBtn.textContent = 'Use This';
    acceptBtn.title = 'Accept selected response (Enter)';
    acceptBtn.disabled = !current || current.status !== 'complete' || !current.response;
    acceptBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAccept?.();
    };
    footer.appendChild(acceptBtn);

    container.appendChild(footer);

    return container;
  }

  ignoreEvent(event) {
    // Don't ignore click events - we handle them
    return false;
  }

  get estimatedHeight() {
    return 300; // Approximate height for layout
  }
}

// ===========================================================================
// Decorations
// ===========================================================================

const loadingDecoration = (opId, onCancel) => Decoration.widget({
  widget: new LoadingPlaceholderWidget(opId, onCancel),
  side: 1,
});

const pendingMarkDecoration = Decoration.mark({
  class: 'cm-ai-pending-change',
});

const pendingActionsDecoration = (opId, onAccept, onReject) => Decoration.widget({
  widget: new PendingChangeActionsWidget(opId, onAccept, onReject),
  side: 1,
});

const replacedMarkDecoration = Decoration.mark({
  class: 'cm-ai-replaced',
});

// ResponsePicker decoration is handled by responsePickerField below (block widgets need StateField)

// ===========================================================================
// Decoration Plugin
// ===========================================================================

function buildDecorations(view) {
  const state = view.state.field(aiState);
  const decorations = [];

  for (const [id, op] of state.operations) {
    if (op.status === 'loading') {
      // Show loading placeholder
      decorations.push(loadingDecoration(id, () => {
        view.dispatch({ effects: cancelAiOperation.of({ id }) });
      }).range(op.from));

      // If replacing, dim the original text
      if (op.type === 'replace' && op.to > op.from) {
        decorations.push(replacedMarkDecoration.range(op.from, op.to));
      }
    }

    if (op.status === 'pending' && op.newText) {
      // Show shimmer on the new text
      // Note: The text has already been inserted, so we mark from where it was inserted
      const textEnd = op.from + op.newText.length;
      if (textEnd > op.from) {
        decorations.push(pendingMarkDecoration.range(op.from, textEnd));
        decorations.push(pendingActionsDecoration(
          id,
          () => view.dispatch({ effects: acceptAiChange.of({ id }) }),
          () => {
            // Reject: remove the inserted text and restore original
            const currentText = view.state.doc.sliceString(op.from, textEnd);
            if (currentText === op.newText) {
              view.dispatch({
                changes: { from: op.from, to: textEnd, insert: op.originalText || '' },
                effects: rejectAiChange.of({ id }),
              });
            } else {
              // Text was modified, just remove the operation
              view.dispatch({ effects: rejectAiChange.of({ id }) });
            }
          }
        ).range(textEnd));
      }
    }

    // Multi-response mode (ResponsePicker) - handled by responsePickerField StateField
    // Only add the replaced text decoration here
    if (op.status === 'multi' && op.isMultiMode) {
      if (op.type === 'replace' && op.to > op.from) {
        decorations.push(replacedMarkDecoration.range(op.from, op.to));
      }
    }
  }

  // Sort by position and startSide (required by CodeMirror)
  decorations.sort((a, b) => {
    const fromDiff = a.from - b.from;
    if (fromDiff !== 0) return fromDiff;
    // When same position, sort by startSide (widget side)
    const aSide = a.value?.startSide ?? a.value?.spec?.side ?? 0;
    const bSide = b.value?.startSide ?? b.value?.spec?.side ?? 0;
    return aSide - bSide;
  });

  return Decoration.set(decorations);
}

export const aiDecorations = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.state.field(aiState) !== update.startState.field(aiState)) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: v => v.decorations,
  }
);

// ===========================================================================
// Spark Plugin (cursor follower)
// ===========================================================================

export function createSparkPlugin(onSparkClick) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.buildSpark(view);
        this.onSparkClick = onSparkClick;
      }

      buildSpark(view) {
        const sel = view.state.selection.main;
        if (sel.empty) {
          return Decoration.set([
            Decoration.widget({
              widget: new SparkWidget((e) => this.onSparkClick?.(e, view)),
              side: 1,
            }).range(sel.head),
          ]);
        }
        return Decoration.set([]);
      }

      update(update) {
        if (update.selectionSet || update.docChanged) {
          this.decorations = this.buildSpark(update.view);
        }
      }
    },
    {
      decorations: v => v.decorations,
    }
  );
}

// ===========================================================================
// Keybindings
// ===========================================================================

export const aiKeymap = keymap.of([
  {
    key: 'Enter',
    run(view) {
      const state = view.state.field(aiState);
      const cursor = view.state.selection.main.head;

      for (const [id, op] of state.operations) {
        // Handle multi-mode ResponsePicker
        if (op.status === 'multi' && op.isMultiMode) {
          const responses = op.responses || [];
          const selected = responses[op.selectedIndex || 0];
          if (selected?.response && selected.status === 'complete') {
            // Insert the selected response text
            if (op.type === 'insert') {
              view.dispatch({
                changes: { from: op.from, insert: selected.response },
                effects: [
                  acceptSelectedResponse.of({ id }),
                  cancelAiOperation.of({ id }),
                ],
              });
            } else {
              view.dispatch({
                changes: { from: op.from, to: op.to, insert: selected.response },
                effects: [
                  acceptSelectedResponse.of({ id }),
                  cancelAiOperation.of({ id }),
                ],
              });
            }
            return true;
          }
        }

        // Handle regular pending operation at cursor
        if (op.status === 'pending' && op.newText) {
          const textEnd = op.from + op.newText.length;
          if (cursor >= op.from && cursor <= textEnd) {
            view.dispatch({ effects: acceptAiChange.of({ id }) });
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    key: 'Escape',
    run(view) {
      const state = view.state.field(aiState);
      const cursor = view.state.selection.main.head;

      for (const [id, op] of state.operations) {
        // Handle multi-mode ResponsePicker - always cancel on Escape
        if (op.status === 'multi' && op.isMultiMode) {
          op.onCancel?.();
          view.dispatch({ effects: cancelAiOperation.of({ id }) });
          return true;
        }

        if (op.status === 'loading') {
          if (cursor >= op.from && cursor <= op.to + 10) {
            view.dispatch({ effects: cancelAiOperation.of({ id }) });
            return true;
          }
        }
        if (op.status === 'pending' && op.newText) {
          const textEnd = op.from + op.newText.length;
          if (cursor >= op.from && cursor <= textEnd) {
            const currentText = view.state.doc.sliceString(op.from, textEnd);
            if (currentText === op.newText) {
              view.dispatch({
                changes: { from: op.from, to: textEnd, insert: op.originalText || '' },
                effects: rejectAiChange.of({ id }),
              });
            } else {
              view.dispatch({ effects: rejectAiChange.of({ id }) });
            }
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    key: 'ArrowLeft',
    run(view) {
      const state = view.state.field(aiState);
      for (const [id, op] of state.operations) {
        if (op.status === 'multi' && op.isMultiMode) {
          const currentIndex = op.selectedIndex || 0;
          if (currentIndex > 0) {
            view.dispatch({ effects: setSelectedResponse.of({ id, index: currentIndex - 1 }) });
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    key: 'ArrowRight',
    run(view) {
      const state = view.state.field(aiState);
      for (const [id, op] of state.operations) {
        if (op.status === 'multi' && op.isMultiMode) {
          const currentIndex = op.selectedIndex || 0;
          const maxIndex = (op.responses?.length || 1) - 1;
          if (currentIndex < maxIndex) {
            view.dispatch({ effects: setSelectedResponse.of({ id, index: currentIndex + 1 }) });
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    key: 'Mod-Shift-Enter',
    run(view) {
      const state = view.state.field(aiState);
      if (state.operations.size > 0) {
        view.dispatch({ effects: acceptAllAiChanges.of(null) });
        return true;
      }
      return false;
    },
  },
  {
    key: 'Mod-Shift-Escape',
    run(view) {
      const state = view.state.field(aiState);
      const changes = [];

      for (const [id, op] of state.operations) {
        if (op.status === 'pending' && op.newText) {
          const textEnd = op.from + op.newText.length;
          const currentText = view.state.doc.sliceString(op.from, textEnd);
          if (currentText === op.newText) {
            changes.push({ from: op.from, to: textEnd, insert: op.originalText || '' });
          }
        }
        if (op.status === 'loading' || (op.status === 'multi' && op.isMultiMode)) {
          op.onCancel?.();
        }
      }

      if (state.operations.size > 0) {
        view.dispatch({
          changes,
          effects: rejectAllAiChanges.of(null),
        });
        return true;
      }
      return false;
    },
  },
]);

// ===========================================================================
// CSS Styles
// ===========================================================================

export const aiStyles = EditorView.baseTheme({
  // Loading placeholder
  '.cm-ai-loading': {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 4px',
    margin: '0 2px',
    borderRadius: '3px',
    background: 'linear-gradient(90deg, transparent, rgba(100, 149, 237, 0.2), transparent)',
    backgroundSize: '200% 100%',
    animation: 'cm-ai-shimmer 1.5s infinite',
    verticalAlign: 'baseline',
  },
  '.cm-ai-loading-dots': {
    color: 'rgba(100, 149, 237, 0.8)',
    fontWeight: 'bold',
    animation: 'cm-ai-pulse 1s infinite',
  },
  '.cm-ai-loading-cancel': {
    marginLeft: '4px',
    cursor: 'pointer',
    color: 'rgba(100, 100, 100, 0.5)',
    fontWeight: 'bold',
    opacity: '0',
    transition: 'opacity 0.15s',
    '&:hover': {
      color: '#e74c3c',
    },
  },
  '.cm-ai-loading:hover .cm-ai-loading-cancel': {
    opacity: '1',
  },

  // Replaced text (dimmed during replace operation)
  '.cm-ai-replaced': {
    opacity: '0.4',
    textDecoration: 'line-through',
    textDecorationColor: 'rgba(100, 100, 100, 0.3)',
  },

  // Pending change (shimmer)
  '.cm-ai-pending-change': {
    background: 'linear-gradient(90deg, transparent, rgba(100, 149, 237, 0.15), transparent)',
    backgroundSize: '200% 100%',
    animation: 'cm-ai-shimmer 2s infinite',
    borderRadius: '2px',
  },

  // Pending actions
  '.cm-ai-pending-actions': {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '4px',
    fontSize: '0.85em',
    verticalAlign: 'baseline',
  },
  '.cm-ai-accept-btn, .cm-ai-reject-btn': {
    cursor: 'pointer',
    padding: '0 3px',
    borderRadius: '3px',
    transition: 'background 0.15s, color 0.15s',
  },
  '.cm-ai-accept-btn': {
    color: '#27ae60',
    '&:hover': {
      background: 'rgba(39, 174, 96, 0.15)',
    },
  },
  '.cm-ai-reject-btn': {
    color: '#e74c3c',
    '&:hover': {
      background: 'rgba(231, 76, 60, 0.15)',
    },
  },

  // Spark cursor widget
  '.cm-ai-spark': {
    cursor: 'pointer',
    marginLeft: '2px',
    color: 'rgba(100, 149, 237, 0.6)',
    fontSize: '0.9em',
    transition: 'color 0.15s, transform 0.15s',
    display: 'inline-block',
    '&:hover': {
      color: 'rgba(100, 149, 237, 1)',
      transform: 'scale(1.2)',
    },
  },

  // Animations
  '@keyframes cm-ai-shimmer': {
    '0%': { backgroundPosition: '200% 0' },
    '100%': { backgroundPosition: '-200% 0' },
  },
  '@keyframes cm-ai-pulse': {
    '0%, 100%': { opacity: '0.4' },
    '50%': { opacity: '1' },
  },

  // ===========================================================================
  // ResponsePicker Widget Styles
  // ===========================================================================

  '.cm-ai-response-picker': {
    // Display as block to break out of inline flow
    display: 'flex !important',
    flexDirection: 'column',
    // Position as block element
    position: 'relative',
    width: '100%',
    margin: '8px 0',
    // Styling
    background: 'var(--widget-surface, rgba(0, 0, 0, 0.35))',
    borderRadius: 'var(--widget-border-radius, 6px)',
    borderLeft: '3px solid var(--widget-border-accent, rgba(100, 149, 237, 0.6))',
    overflow: 'hidden',
    fontFamily: 'var(--widget-font-mono, "SF Mono", Monaco, "Cascadia Code", monospace)',
    fontSize: 'var(--widget-font-size, 0.9em)',
    maxHeight: 'calc(100vh - 150px)',
    // Break out of line
    clear: 'both',
  },
  // Ensure the widget wrapper also displays as block
  '.cm-widgetBuffer + .cm-ai-response-picker, .cm-line .cm-ai-response-picker': {
    display: 'flex !important',
  },

  // Header
  '.cm-ai-picker-header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'var(--widget-surface-elevated, rgba(0, 0, 0, 0.5))',
    borderBottom: '1px solid var(--widget-border, rgba(255, 255, 255, 0.1))',
    flexShrink: '0',
  },

  '.cm-ai-picker-nav': {
    background: 'transparent',
    border: 'none',
    color: 'var(--widget-text-muted, rgba(255, 255, 255, 0.6))',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '1em',
    transition: 'background 0.15s, color 0.15s',
    '&:hover:not(:disabled)': {
      background: 'var(--widget-surface-hover, rgba(255, 255, 255, 0.1))',
      color: 'var(--widget-text, #e0e0e0)',
    },
    '&:disabled': {
      opacity: '0.3',
      cursor: 'not-allowed',
    },
  },

  '.cm-ai-picker-title': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  '.cm-ai-picker-model': {
    color: 'var(--widget-text-accent, #6495ed)',
    fontWeight: '500',
  },

  '.cm-ai-picker-count': {
    color: 'var(--widget-text-muted, rgba(255, 255, 255, 0.5))',
    fontSize: '0.85em',
  },

  // Content area
  '.cm-ai-picker-content': {
    flex: '1',
    overflow: 'auto',
    padding: '12px 16px',
    minHeight: '100px',
    maxHeight: '400px',
    position: 'relative',
    cursor: 'pointer',
  },

  '.cm-ai-picker-loading': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--widget-text-muted, rgba(255, 255, 255, 0.6))',
    fontStyle: 'italic',
  },

  '.cm-ai-picker-spinner': {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid var(--widget-text-muted, rgba(255, 255, 255, 0.3))',
    borderTopColor: 'var(--widget-text-accent, #6495ed)',
    borderRadius: '50%',
    animation: 'cm-ai-spin 0.8s linear infinite',
  },

  '.cm-ai-picker-error': {
    color: 'var(--widget-error, #ef4444)',
    padding: '8px',
    background: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '4px',
  },

  '.cm-ai-picker-empty': {
    color: 'var(--widget-text-muted, rgba(255, 255, 255, 0.5))',
    fontStyle: 'italic',
  },

  // Markdown content
  '.cm-ai-picker-markdown': {
    color: 'var(--widget-text, #e0e0e0)',
    lineHeight: '1.5',
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      marginTop: '0.5em',
      marginBottom: '0.3em',
      color: 'var(--widget-text, #e0e0e0)',
    },
    '& p': {
      margin: '0.5em 0',
    },
    '& pre': {
      background: 'var(--widget-surface-inset, rgba(0, 0, 0, 0.3))',
      padding: '8px 12px',
      borderRadius: '4px',
      overflow: 'auto',
      margin: '0.5em 0',
    },
    '& code': {
      background: 'var(--widget-surface-inset, rgba(0, 0, 0, 0.3))',
      padding: '2px 4px',
      borderRadius: '3px',
      fontSize: '0.9em',
    },
    '& pre code': {
      background: 'transparent',
      padding: '0',
    },
    '& a': {
      color: 'var(--widget-text-accent, #6495ed)',
      textDecoration: 'none',
      '&:hover': {
        textDecoration: 'underline',
      },
    },
    '& ul, & ol': {
      marginLeft: '1.5em',
      margin: '0.5em 0',
    },
    '& strong': {
      fontWeight: '600',
    },
    '& em': {
      fontStyle: 'italic',
    },
  },

  '.cm-ai-picker-copy-hint': {
    position: 'absolute',
    bottom: '4px',
    right: '8px',
    fontSize: '0.75em',
    color: 'var(--widget-text-muted, rgba(255, 255, 255, 0.4))',
    opacity: '0',
    transition: 'opacity 0.15s',
  },

  '.cm-ai-picker-content:hover .cm-ai-picker-copy-hint': {
    opacity: '1',
  },

  // Model indicator dots
  '.cm-ai-picker-dots': {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px',
    background: 'var(--widget-surface-elevated, rgba(0, 0, 0, 0.5))',
    borderTop: '1px solid var(--widget-border, rgba(255, 255, 255, 0.1))',
    flexShrink: '0',
  },

  '.cm-ai-picker-dot': {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--widget-text-muted, rgba(255, 255, 255, 0.3))',
    cursor: 'pointer',
    transition: 'transform 0.15s, background 0.15s',
    '&:hover': {
      transform: 'scale(1.3)',
    },
    '&.selected': {
      background: 'var(--widget-text-accent, #6495ed)',
      transform: 'scale(1.2)',
    },
    '&.complete': {
      background: 'var(--widget-success, #22c55e)',
    },
    '&.loading': {
      background: 'var(--widget-warning, #f59e0b)',
      animation: 'cm-ai-pulse 1s infinite',
    },
    '&.error': {
      background: 'var(--widget-error, #ef4444)',
    },
    '&.synthesized': {
      background: 'var(--widget-text-accent, #6495ed)',
      boxShadow: '0 0 4px var(--widget-text-accent, #6495ed)',
    },
    '&.selected.complete': {
      background: 'var(--widget-success, #22c55e)',
      boxShadow: '0 0 4px var(--widget-success, #22c55e)',
    },
  },

  // Footer with actions
  '.cm-ai-picker-footer': {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--widget-surface-elevated, rgba(0, 0, 0, 0.5))',
    borderTop: '1px solid var(--widget-border, rgba(255, 255, 255, 0.1))',
    flexShrink: '0',
  },

  '.cm-ai-picker-btn': {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9em',
    fontWeight: '500',
    transition: 'background 0.15s, opacity 0.15s',
  },

  '.cm-ai-picker-cancel': {
    background: 'var(--widget-surface-inset, rgba(255, 255, 255, 0.1))',
    color: 'var(--widget-text-muted, rgba(255, 255, 255, 0.7))',
    '&:hover': {
      background: 'var(--widget-surface-hover, rgba(255, 255, 255, 0.15))',
    },
  },

  '.cm-ai-picker-accept': {
    background: 'var(--widget-success, #22c55e)',
    color: 'white',
    '&:hover:not(:disabled)': {
      background: 'var(--widget-success-hover, #16a34a)',
    },
    '&:disabled': {
      opacity: '0.5',
      cursor: 'not-allowed',
    },
  },

  // Spinner animation
  '@keyframes cm-ai-spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
});

// ===========================================================================
// Extension Bundle
// ===========================================================================

/**
 * Create AI integration extension
 * @param {Object} [options]
 * @param {function} [options.onSparkClick] - Called when spark is clicked
 * @returns {Extension[]}
 */
export function aiIntegration(options = {}) {
  const extensions = [
    aiState,
    responsePickerField,
    responsePickerCallbackPlugin,
    aiDecorations,
    aiKeymap,
    aiStyles,
  ];

  if (options.onSparkClick) {
    extensions.push(createSparkPlugin(options.onSparkClick));
  }

  return extensions;
}

// ===========================================================================
// Helper Functions
// ===========================================================================

/**
 * Generate unique operation ID
 * @returns {string}
 */
export function generateOperationId() {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get context around cursor for AI operations
 *
 * @param {EditorView} view - CodeMirror view
 * @param {number} [contextSize=500] - Characters of context to include
 * @returns {{
 *   textBeforeCursor: string,
 *   textAfterCursor: string,
 *   localContext: string,
 *   selectedText: string,
 *   cursorPos: number,
 *   selectionFrom: number,
 *   selectionTo: number,
 *   documentContext: string,
 * }}
 */
export function getAiContext(view, contextSize = 500) {
  const doc = view.state.doc;
  const sel = view.state.selection.main;
  const content = doc.toString();

  const cursorPos = sel.head;
  const selectionFrom = sel.from;
  const selectionTo = sel.to;

  // Text before and after cursor
  const textBeforeCursor = content.slice(Math.max(0, cursorPos - contextSize), cursorPos);
  const textAfterCursor = content.slice(cursorPos, Math.min(content.length, cursorPos + contextSize));

  // Local context (around selection or cursor)
  const contextStart = Math.max(0, selectionFrom - contextSize);
  const contextEnd = Math.min(content.length, selectionTo + contextSize);
  const localContext = content.slice(contextStart, contextEnd);

  // Selected text
  const selectedText = content.slice(selectionFrom, selectionTo);

  return {
    textBeforeCursor,
    textAfterCursor,
    localContext,
    selectedText,
    cursorPos,
    selectionFrom,
    selectionTo,
    documentContext: content, // Full document for AI context
  };
}

// ===========================================================================
// Long-Press 'j' Detection & AI Command Palette
// ===========================================================================

/**
 * Default command key mappings for the AI palette
 */
export const AI_PALETTE_COMMANDS = {
  'g': { id: 'fix-grammar', label: 'Fix Grammar', hint: 'selection' },
  't': { id: 'fix-transcription', label: 'Fix Transcription', hint: 'selection' },
  's': { id: 'finish-sentence', label: 'Complete Sentence', hint: 'cursor' },
  'p': { id: 'finish-paragraph', label: 'Complete Paragraph', hint: 'cursor' },
  'l': { id: 'finish-code-line', label: 'Complete Line', hint: 'code' },
  'c': { id: 'finish-code-section', label: 'Complete Section', hint: 'code' },
  'd': { id: 'document-code', label: 'Add Docstrings', hint: 'selection' },
  'y': { id: 'add-types', label: 'Add Type Hints', hint: 'selection' },
  'n': { id: 'improve-names', label: 'Improve Names', hint: 'selection' },
  'r': { id: 'refactor', label: 'Refactor Code', hint: 'selection' },
  'o': { id: 'document-continue', label: 'Continue Document', hint: 'append' },
};

/**
 * Long-press state for 'j' key detection
 */
let longPressState = null;

/**
 * Currently active AI palette instance
 */
let activePalette = null;

/**
 * Long-press timing configuration
 */
const LONG_PRESS_CONFIG = {
  quickPhaseMs: 100,    // Time before showing loading indicator
  triggerMs: 1500,      // Time to trigger palette
};

/**
 * Loading indicator widget shown during long-press
 */
class LongPressIndicatorWidget extends WidgetType {
  constructor(progress) {
    super();
    this.progress = progress; // 0-1
  }

  toDOM() {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-ai-longpress-indicator';

    // Circular progress indicator
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');

    // Background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '8');
    bgCircle.setAttribute('cy', '8');
    bgCircle.setAttribute('r', '6');
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'rgba(100, 149, 237, 0.3)');
    bgCircle.setAttribute('stroke-width', '2');
    svg.appendChild(bgCircle);

    // Progress circle
    const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('cx', '8');
    progressCircle.setAttribute('cy', '8');
    progressCircle.setAttribute('r', '6');
    progressCircle.setAttribute('fill', 'none');
    progressCircle.setAttribute('stroke', 'rgba(100, 149, 237, 1)');
    progressCircle.setAttribute('stroke-width', '2');
    progressCircle.setAttribute('stroke-linecap', 'round');
    // Calculate stroke-dasharray for progress
    const circumference = 2 * Math.PI * 6;
    const dashOffset = circumference * (1 - this.progress);
    progressCircle.setAttribute('stroke-dasharray', `${circumference}`);
    progressCircle.setAttribute('stroke-dashoffset', `${dashOffset}`);
    progressCircle.setAttribute('transform', 'rotate(-90 8 8)');
    svg.appendChild(progressCircle);

    wrapper.appendChild(svg);
    return wrapper;
  }

  eq(other) {
    // Always update to show progress
    return false;
  }
}

/**
 * StateField for long-press indicator
 */
const longPressIndicatorState = StateField.define({
  create() {
    return { active: false, pos: 0, progress: 0 };
  },
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showLongPressIndicator)) {
        return { active: true, pos: effect.value.pos, progress: effect.value.progress };
      }
      if (effect.is(hideLongPressIndicator)) {
        return { active: false, pos: 0, progress: 0 };
      }
      if (effect.is(updateLongPressProgress)) {
        if (state.active) {
          return { ...state, progress: effect.value };
        }
      }
    }
    return state;
  },
});

const showLongPressIndicator = StateEffect.define();
const hideLongPressIndicator = StateEffect.define();
const updateLongPressProgress = StateEffect.define();

/**
 * ViewPlugin for long-press indicator decorations
 */
const longPressIndicatorPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.buildDecorations(view);
    }

    buildDecorations(view) {
      const state = view.state.field(longPressIndicatorState);
      if (!state.active) {
        return Decoration.set([]);
      }
      return Decoration.set([
        Decoration.widget({
          widget: new LongPressIndicatorWidget(state.progress),
          side: 1,
        }).range(state.pos),
      ]);
    }

    update(update) {
      if (update.state.field(longPressIndicatorState) !== update.startState.field(longPressIndicatorState)) {
        this.decorations = this.buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/**
 * AI Command Palette class
 */
class AiCommandPalette {
  constructor(view, options = {}) {
    this.view = view;
    this.onCommand = options.onCommand;
    this.onJuiceLevelChange = options.onJuiceLevelChange;
    this.onReasoningLevelChange = options.onReasoningLevelChange;
    this.juiceLevel = options.juiceLevel ?? 1;
    this.reasoningLevel = options.reasoningLevel ?? 1;
    this.overlay = null;
    this.keyHandler = null;
  }

  show() {
    if (this.overlay) return;

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'cm-ai-palette-overlay';

    // Create palette container
    const palette = document.createElement('div');
    palette.className = 'cm-ai-palette';

    // Header
    const header = document.createElement('div');
    header.className = 'cm-ai-palette-header';
    header.innerHTML = `
      <span class="cm-ai-palette-title">AI Commands</span>
      <span class="cm-ai-palette-hint">ESC to close</span>
    `;
    palette.appendChild(header);

    // Level controls
    const levels = document.createElement('div');
    levels.className = 'cm-ai-palette-levels';

    // Juice level (1-5)
    const juiceRow = document.createElement('div');
    juiceRow.className = 'cm-ai-palette-level-row';
    juiceRow.innerHTML = `<span class="cm-ai-palette-level-label">Quality:</span>`;
    for (let i = 0; i < 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'cm-ai-palette-level-btn' + (i === this.juiceLevel ? ' selected' : '');
      btn.dataset.juice = i;
      btn.textContent = i + 1;
      btn.title = `Juice Level ${i + 1} (press ${i + 1})`;
      juiceRow.appendChild(btn);
    }
    levels.appendChild(juiceRow);

    // Reasoning level (Shift+0-5)
    const reasoningRow = document.createElement('div');
    reasoningRow.className = 'cm-ai-palette-level-row';
    reasoningRow.innerHTML = `<span class="cm-ai-palette-level-label">Reasoning:</span>`;
    for (let i = 0; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'cm-ai-palette-level-btn' + (i === this.reasoningLevel ? ' selected' : '');
      btn.dataset.reasoning = i;
      btn.textContent = i;
      btn.title = `Reasoning Level ${i} (press Shift+${i})`;
      reasoningRow.appendChild(btn);
    }
    levels.appendChild(reasoningRow);

    palette.appendChild(levels);

    // Commands list
    const commands = document.createElement('div');
    commands.className = 'cm-ai-palette-commands';

    for (const [key, cmd] of Object.entries(AI_PALETTE_COMMANDS)) {
      const item = document.createElement('div');
      item.className = 'cm-ai-palette-item';
      item.innerHTML = `
        <span class="cm-ai-palette-key">${key}</span>
        <span class="cm-ai-palette-label">${cmd.label}</span>
        <span class="cm-ai-palette-item-hint">${cmd.hint}</span>
      `;
      item.dataset.cmdId = cmd.id;
      item.dataset.key = key;
      commands.appendChild(item);
    }

    palette.appendChild(commands);
    this.overlay.appendChild(palette);
    document.body.appendChild(this.overlay);

    // Capture all keyboard input
    this.keyHandler = (e) => this.handleKey(e);
    document.addEventListener('keydown', this.keyHandler, { capture: true });

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    // Click on command
    commands.addEventListener('click', (e) => {
      const item = e.target.closest('.cm-ai-palette-item');
      if (item) {
        const cmdId = item.dataset.cmdId;
        this.executeCommand(cmdId);
      }
    });

    // Click on level buttons
    levels.addEventListener('click', (e) => {
      const btn = e.target.closest('.cm-ai-palette-level-btn');
      if (btn) {
        if (btn.dataset.juice !== undefined) {
          this.setJuiceLevel(parseInt(btn.dataset.juice, 10));
        } else if (btn.dataset.reasoning !== undefined) {
          this.setReasoningLevel(parseInt(btn.dataset.reasoning, 10));
        }
      }
    });

    activePalette = this;
  }

  hide() {
    if (!this.overlay) return;

    document.removeEventListener('keydown', this.keyHandler, { capture: true });
    this.overlay.remove();
    this.overlay = null;
    this.keyHandler = null;
    activePalette = null;

    // Return focus to editor
    this.view.focus();
  }

  handleKey(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const key = e.key.toLowerCase();

    // Escape to close
    if (e.key === 'Escape') {
      this.hide();
      return;
    }

    // Shift+0-5 for reasoning level
    if (e.shiftKey && key >= '0' && key <= '5') {
      this.setReasoningLevel(parseInt(key, 10));
      return;
    }

    // 1-5 for juice level (without shift)
    if (!e.shiftKey && key >= '1' && key <= '5') {
      this.setJuiceLevel(parseInt(key, 10) - 1); // 1-5 maps to 0-4
      return;
    }

    // Command keys
    if (AI_PALETTE_COMMANDS[key]) {
      this.executeCommand(AI_PALETTE_COMMANDS[key].id);
      return;
    }
  }

  setJuiceLevel(level) {
    this.juiceLevel = level;
    this.onJuiceLevelChange?.(level);
    this.updateLevelUI();
  }

  setReasoningLevel(level) {
    this.reasoningLevel = level;
    this.onReasoningLevelChange?.(level);
    this.updateLevelUI();
  }

  updateLevelUI() {
    if (!this.overlay) return;

    // Update juice buttons
    this.overlay.querySelectorAll('[data-juice]').forEach((btn) => {
      btn.classList.toggle('selected', parseInt(btn.dataset.juice, 10) === this.juiceLevel);
    });

    // Update reasoning buttons
    this.overlay.querySelectorAll('[data-reasoning]').forEach((btn) => {
      btn.classList.toggle('selected', parseInt(btn.dataset.reasoning, 10) === this.reasoningLevel);
    });
  }

  executeCommand(cmdId) {
    this.hide();
    this.onCommand?.(cmdId, {
      juiceLevel: this.juiceLevel,
      reasoningLevel: this.reasoningLevel,
    });
  }
}

/**
 * Show the AI command palette
 * @param {EditorView} view
 * @param {Object} options
 * @param {function} options.onCommand - Called with (cmdId, {juiceLevel, reasoningLevel})
 * @param {function} options.onJuiceLevelChange - Called when juice level changes
 * @param {function} options.onReasoningLevelChange - Called when reasoning level changes
 * @param {number} options.juiceLevel - Initial juice level
 * @param {number} options.reasoningLevel - Initial reasoning level
 */
export function showAiPalette(view, options = {}) {
  if (activePalette) {
    activePalette.hide();
  }
  const palette = new AiCommandPalette(view, options);
  palette.show();
  return palette;
}

/**
 * Hide the AI command palette if open
 */
export function hideAiPalette() {
  if (activePalette) {
    activePalette.hide();
  }
}

/**
 * Check if AI palette is currently open
 */
export function isAiPaletteOpen() {
  return activePalette !== null;
}

/**
 * Start long-press detection for 'j' key
 */
function startLongPress(view, onTrigger, onCancel) {
  const startTime = Date.now();
  const startPos = view.state.selection.main.head;

  // Show indicator after quick phase
  const phaseTimer = setTimeout(() => {
    if (longPressState) {
      longPressState.phase = 'loading';
      view.dispatch({
        effects: showLongPressIndicator.of({ pos: startPos, progress: 0 }),
      });
      // Start progress animation
      startProgressAnimation(view, startTime);
    }
  }, LONG_PRESS_CONFIG.quickPhaseMs);

  // Trigger palette after full duration
  const paletteTimer = setTimeout(() => {
    if (longPressState) {
      view.dispatch({ effects: hideLongPressIndicator.of(null) });
      longPressState = null;
      onTrigger();
    }
  }, LONG_PRESS_CONFIG.triggerMs);

  longPressState = {
    startTime,
    startPos,
    phase: 'quick',
    phaseTimer,
    paletteTimer,
    animationFrame: null,
    onCancel,
  };
}

/**
 * Animate the progress indicator
 */
function startProgressAnimation(view, startTime) {
  const animate = () => {
    if (!longPressState || longPressState.phase !== 'loading') return;

    const elapsed = Date.now() - startTime - LONG_PRESS_CONFIG.quickPhaseMs;
    const duration = LONG_PRESS_CONFIG.triggerMs - LONG_PRESS_CONFIG.quickPhaseMs;
    const progress = Math.min(1, elapsed / duration);

    view.dispatch({ effects: updateLongPressProgress.of(progress) });

    if (progress < 1 && longPressState) {
      longPressState.animationFrame = requestAnimationFrame(animate);
    }
  };

  if (longPressState) {
    longPressState.animationFrame = requestAnimationFrame(animate);
  }
}

/**
 * Cancel long-press detection
 */
function cancelLongPress(view, insertJ = true) {
  if (!longPressState) return;

  clearTimeout(longPressState.phaseTimer);
  clearTimeout(longPressState.paletteTimer);
  if (longPressState.animationFrame) {
    cancelAnimationFrame(longPressState.animationFrame);
  }

  view.dispatch({ effects: hideLongPressIndicator.of(null) });

  if (insertJ) {
    // Insert 'j' at the original position
    const pos = longPressState.startPos;
    view.dispatch({
      changes: { from: pos, insert: 'j' },
      selection: { anchor: pos + 1 },
    });
  }

  longPressState.onCancel?.();
  longPressState = null;
}

/**
 * Check if a key event has modifiers
 */
function hasModifiers(e) {
  return e.ctrlKey || e.metaKey || e.altKey;
}

/**
 * Cooldown timestamp - blocks 'j' input for a period after panel opens
 * This prevents 'j' from being typed if user releases key slightly late
 */
let jCooldownUntil = 0;

/**
 * Cooldown duration in ms after panel opens
 */
const J_COOLDOWN_MS = 2000;

/**
 * Create the long-press 'j' detection extension
 * @param {Object} options
 * @param {function} options.onTrigger - Called when long-press threshold is reached
 * @param {function} [options.onCancel] - Called when long-press is cancelled (j released early)
 */
export function createLongPressExtension(options = {}) {
  return [
    longPressIndicatorState,
    longPressIndicatorPlugin,
    EditorView.domEventHandlers({
      keydown(event, view) {
        // Handle 'j' key without modifiers
        if (event.key === 'j' && !hasModifiers(event) && !event.shiftKey) {
          // If already in long-press state, block ALL 'j' keydowns (including repeats)
          if (longPressState) {
            event.preventDefault();
            return true;
          }

          // If in cooldown period (just triggered panel), block 'j'
          if (Date.now() < jCooldownUntil) {
            event.preventDefault();
            return true;
          }

          // Don't start new long-press on repeated keys
          if (event.repeat) {
            return false;
          }

          event.preventDefault();

          startLongPress(
            view,
            () => {
              // Set cooldown to prevent 'j' from being typed after panel opens
              jCooldownUntil = Date.now() + J_COOLDOWN_MS;
              // Trigger callback (e.g., open AI panel)
              options.onTrigger?.(view);
            },
            () => {
              // Cancelled
              options.onCancel?.(view);
            }
          );

          return true;
        }
        return false;
      },
      keyup(event, view) {
        if (event.key === 'j') {
          // Handle keyup during long-press state
          if (longPressState) {
            cancelLongPress(view, true);
            return true;
          }
          // Also consume keyup during cooldown to prevent issues
          if (Date.now() < jCooldownUntil) {
            return true;
          }
        }
        return false;
      },
    }),
  ];
}

// ===========================================================================
// Long-Press Indicator & Palette Styles
// ===========================================================================

export const aiPaletteStyles = EditorView.baseTheme({
  // Long-press indicator
  '.cm-ai-longpress-indicator': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '2px',
    verticalAlign: 'middle',
  },
  '.cm-ai-longpress-indicator svg': {
    display: 'block',
  },
});

/**
 * CSS styles for the AI palette (injected into document)
 */
export const AI_PALETTE_CSS = `
.cm-ai-palette-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(2px);
}

.cm-ai-palette {
  background: var(--bg-secondary, #161b22);
  border: 1px solid var(--border, #30363d);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  min-width: 320px;
  max-width: 400px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: var(--text, #c9d1d9);
}

.cm-ai-palette-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #30363d);
  background: var(--bg-tertiary, #21262d);
}

.cm-ai-palette-title {
  font-weight: 600;
  color: var(--accent, #58a6ff);
}

.cm-ai-palette-hint {
  font-size: 11px;
  color: var(--text-muted, #8b949e);
}

.cm-ai-palette-levels {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #30363d);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cm-ai-palette-level-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cm-ai-palette-level-label {
  font-size: 11px;
  color: var(--text-muted, #8b949e);
  width: 70px;
  flex-shrink: 0;
}

.cm-ai-palette-level-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border, #30363d);
  border-radius: 4px;
  background: var(--bg, #0d1117);
  color: var(--text-muted, #8b949e);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.cm-ai-palette-level-btn:hover {
  border-color: var(--accent, #58a6ff);
  color: var(--text, #c9d1d9);
}

.cm-ai-palette-level-btn.selected {
  background: var(--accent, #58a6ff);
  border-color: var(--accent, #58a6ff);
  color: white;
}

.cm-ai-palette-commands {
  padding: 8px 0;
  max-height: 400px;
  overflow-y: auto;
}

.cm-ai-palette-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
}

.cm-ai-palette-item:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.04));
}

.cm-ai-palette-key {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary, #21262d);
  border: 1px solid var(--border, #30363d);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent, #58a6ff);
  margin-right: 12px;
  flex-shrink: 0;
}

.cm-ai-palette-label {
  flex: 1;
}

.cm-ai-palette-item-hint {
  font-size: 11px;
  color: var(--text-dim, #6e7681);
  margin-left: 8px;
}
`;

/**
 * Inject AI palette styles into document
 */
export function injectAiPaletteStyles() {
  if (document.querySelector('#cm-ai-palette-styles')) return;

  const style = document.createElement('style');
  style.id = 'cm-ai-palette-styles';
  style.textContent = AI_PALETTE_CSS;
  document.head.appendChild(style);
}

/**
 * Execute an AI operation with loading/pending states
 *
 * @param {EditorView} view - CodeMirror view
 * @param {import('./shell/ai-client.js').AiClient} aiClient - AI client
 * @param {Object} options
 * @param {string} options.program - AI program to execute
 * @param {Object} options.params - Program parameters
 * @param {'insert'|'replace'} options.type - Operation type
 * @param {number} options.from - Start position
 * @param {number} options.to - End position
 * @param {string} options.resultField - Field name in response containing result
 * @param {number} [options.juiceLevel] - Override juice level
 * @returns {Promise<void>}
 */
export async function executeAiOperation(view, aiClient, options) {
  const {
    program,
    params,
    type,
    from,
    to,
    resultField,
    juiceLevel,
  } = options;

  const opId = generateOperationId();
  const originalText = type === 'replace' ? view.state.doc.sliceString(from, to) : '';

  // Create abort controller for cancellation
  let cancelled = false;
  const onCancel = () => {
    cancelled = true;
    aiClient.cancel(opId);
  };

  // Start operation (show loading)
  view.dispatch({
    effects: startAiOperation.of({
      id: opId,
      type,
      from,
      to,
      originalText,
      onCancel,
    }),
  });

  try {
    const result = await aiClient.execute(program, params, {
      juiceLevel,
      requestId: opId,
    });

    if (cancelled) return;

    const newText = result[resultField] || result.completion || result.fixed_text || '';

    if (!newText) {
      // No result, cancel the operation
      view.dispatch({ effects: cancelAiOperation.of({ id: opId }) });
      return;
    }

    // Insert the new text and mark as pending
    if (type === 'insert') {
      view.dispatch({
        changes: { from, insert: newText },
        effects: completeAiOperation.of({ id: opId, newText }),
      });
    } else {
      // Replace
      view.dispatch({
        changes: { from, to, insert: newText },
        effects: completeAiOperation.of({ id: opId, newText }),
      });
    }
  } catch (err) {
    if (!cancelled) {
      console.error('[AI] Operation failed:', err);
      view.dispatch({ effects: cancelAiOperation.of({ id: opId }) });
    }
  }
}
