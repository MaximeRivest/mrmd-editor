/**
 * AI Integration for CodeMirror
 *
 * Provides:
 * - StateField for tracking pending AI operations
 * - Loading placeholder decorations (shimmer while AI works)
 * - Pending change decorations (shimmer on new text)
 * - Accept/reject flow for AI suggestions
 * - Spark widget for cursor-based AI menu
 */

import { StateField, StateEffect, Facet } from '@codemirror/state';
import { Decoration, WidgetType, EditorView, ViewPlugin } from '@codemirror/view';
import { keymap } from '@codemirror/view';

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
// AI Operation Types
// ===========================================================================

/**
 * @typedef {Object} AiOperation
 * @property {string} id - Unique operation ID
 * @property {string} type - Operation type: 'insert', 'replace'
 * @property {number} from - Start position
 * @property {number} to - End position (same as from for inserts)
 * @property {string} [originalText] - Original text being replaced
 * @property {string} [newText] - AI-generated text (when complete)
 * @property {string} status - 'loading', 'pending', 'accepted', 'rejected'
 * @property {number} startTime - When operation started
 * @property {function} [onCancel] - Callback when cancelled
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
  }

  // Sort by position
  decorations.sort((a, b) => a.from - b.from);

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
      // Find pending operation at cursor
      const cursor = view.state.selection.main.head;
      for (const [id, op] of state.operations) {
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
      // Find pending or loading operation at cursor
      const cursor = view.state.selection.main.head;
      for (const [id, op] of state.operations) {
        if (op.status === 'loading') {
          if (cursor >= op.from && cursor <= op.to + 10) { // Near loading indicator
            view.dispatch({ effects: cancelAiOperation.of({ id }) });
            return true;
          }
        }
        if (op.status === 'pending' && op.newText) {
          const textEnd = op.from + op.newText.length;
          if (cursor >= op.from && cursor <= textEnd) {
            // Reject and restore
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
    key: 'Mod-Shift-Enter',
    run(view) {
      // Accept all pending changes
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
      // Reject all pending changes
      const state = view.state.field(aiState);
      const changes = [];
      const effects = [];

      for (const [id, op] of state.operations) {
        if (op.status === 'pending' && op.newText) {
          const textEnd = op.from + op.newText.length;
          const currentText = view.state.doc.sliceString(op.from, textEnd);
          if (currentText === op.newText) {
            changes.push({ from: op.from, to: textEnd, insert: op.originalText || '' });
          }
        }
        if (op.status === 'loading') {
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
