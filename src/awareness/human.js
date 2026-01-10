/**
 * Human Awareness Provider
 *
 * Tracks human collaborator state and broadcasts via Yjs Awareness:
 * - Typing/idle status (with debounce)
 * - Hover tooltips (what symbol they're inspecting)
 * - Autocomplete popups (what they're completing)
 * - Active cell (which code cell cursor is in)
 *
 * @module awareness/human
 */

import { ViewPlugin } from '@codemirror/view';
import { getCellAtCursor, findCells } from '../cells.js';
import * as Y from 'yjs';

// #region TYPING_TRACKER

/**
 * Creates a CodeMirror extension that tracks typing status
 * and updates awareness accordingly.
 *
 * @param {Object} options
 * @param {import('./state.js').AwarenessStateManager} options.stateManager
 * @param {number} [options.idleTimeout=2000] - Ms of inactivity before 'idle'
 * @param {function(): string} options.getContent - Get document content
 * @returns {import('@codemirror/state').Extension}
 */
export function createTypingTracker({ stateManager, idleTimeout = 2000, getContent }) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.stateManager = stateManager;
        this.getContent = getContent;
        this.idleTimer = null;
        this.lastCellIndex = null;
      }

      update(update) {
        // Track typing
        if (update.docChanged) {
          this.onTyping();
        }

        // Track selection/cursor changes
        if (update.selectionSet) {
          this.onSelectionChange();
        }
      }

      onTyping() {
        // Clear existing idle timer
        if (this.idleTimer) {
          clearTimeout(this.idleTimer);
        }

        // Set status to typing
        this.stateManager.setStatus('typing');

        // Set idle timer
        this.idleTimer = setTimeout(() => {
          this.stateManager.setStatus('idle');
        }, idleTimeout);
      }

      onSelectionChange() {
        const pos = this.view.state.selection.main.head;
        const content = this.getContent();
        const cell = getCellAtCursor(content, pos);

        // Update active cell if changed
        const cellIndex = cell ? this.findCellIndex(content, cell) : null;
        if (cellIndex !== this.lastCellIndex) {
          this.lastCellIndex = cellIndex;
          this.stateManager.setActiveCell(cellIndex);
        }

        // Update status to selecting if there's a selection range
        const { from, to } = this.view.state.selection.main;
        if (from !== to) {
          this.stateManager.setStatus('selecting');
        }
      }

      findCellIndex(content, cell) {
        const cells = findCells(content);
        return cells.findIndex(c => c.start === cell.start);
      }

      destroy() {
        if (this.idleTimer) {
          clearTimeout(this.idleTimer);
        }
      }
    }
  );
}

// #endregion TYPING_TRACKER

// #region HOVER_TRACKER

/**
 * Wraps a hover tooltip provider to broadcast hover state via awareness.
 *
 * Use this to wrap your existing hover tooltip so collaborators can see
 * what symbols others are inspecting.
 *
 * @param {Object} options
 * @param {import('./state.js').AwarenessStateManager} options.stateManager
 * @param {function(view, pos): Promise<object|null>} options.hoverProvider - Original hover provider
 * @param {function(): string} options.getContent
 * @param {import('yjs').Text} [options.yText] - Yjs Text for position tracking
 * @param {number} [options.clearDelay=500] - Ms after hover closes to clear state
 * @returns {function} Wrapped hover provider
 */
export function createHoverTracker({ stateManager, hoverProvider, getContent, yText, clearDelay = 500 }) {
  let clearTimer = null;

  return async (view, pos) => {
    // Clear any pending clear
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }

    // Get the hover result from original provider
    const result = await hoverProvider(view, pos);

    if (result) {
      // Extract hover info for awareness
      const content = getContent();
      const cell = getCellAtCursor(content, pos);

      // Use RelativePosition if yText available (survives concurrent edits)
      // Falls back to line/ch for backwards compatibility
      const position = yText
        ? Y.createRelativePositionFromTypeIndex(yText, pos)
        : { line: view.state.doc.lineAt(pos).number, ch: pos - view.state.doc.lineAt(pos).from };

      // Broadcast to awareness
      stateManager.setHover({
        symbol: result.name || extractSymbolAtPos(view, pos),
        type: result.type,
        info: result.value || result.signature,
        position,
        cellIndex: cell ? findCellIndexHelper(content, cell) : undefined,
      });

      // Wrap the tooltip to clear awareness when it closes
      const originalCreate = result.create;
      result.create = () => {
        const dom = originalCreate();

        // Clear hover state when tooltip is removed
        // Use MutationObserver to detect removal
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.removedNodes.length > 0) {
              // Schedule clear (with delay in case user hovers again)
              clearTimer = setTimeout(() => {
                stateManager.setHover(null);
              }, clearDelay);
            }
          }
        });

        // Observe parent for removal
        requestAnimationFrame(() => {
          if (dom.dom?.parentNode) {
            observer.observe(dom.dom.parentNode, { childList: true });
          }
        });

        return dom;
      };
    } else {
      // No hover result, clear after delay
      clearTimer = setTimeout(() => {
        stateManager.setHover(null);
      }, clearDelay);
    }

    return result;
  };
}

/**
 * Extract the symbol/word at a position
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @returns {string}
 */
function extractSymbolAtPos(view, pos) {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const offset = pos - line.from;

  // Find word boundaries
  let start = offset;
  let end = offset;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;

  return text.slice(start, end);
}

/**
 * Find cell index for a cell
 */
function findCellIndexHelper(content, cell) {
  const cells = findCells(content);
  return cells.findIndex(c => c.start === cell.start);
}

// #endregion HOVER_TRACKER

// #region AUTOCOMPLETE_TRACKER

/**
 * Wraps an autocomplete source to broadcast autocomplete state via awareness.
 *
 * @param {Object} options
 * @param {import('./state.js').AwarenessStateManager} options.stateManager
 * @param {import('@codemirror/autocomplete').CompletionSource} options.completionSource
 * @param {function(): string} options.getContent
 * @param {import('yjs').Text} [options.yText] - Yjs Text for position tracking
 * @param {number} [options.maxItems=5] - Max items to include in awareness
 * @returns {import('@codemirror/autocomplete').CompletionSource}
 */
export function createAutocompleteTracker({ stateManager, completionSource, getContent, yText, maxItems = 5 }) {
  return async (context) => {
    const result = await completionSource(context);

    if (result && result.options && result.options.length > 0) {
      const content = getContent();
      const pos = context.pos;
      const cell = getCellAtCursor(content, pos);

      // Extract query text
      const query = context.state.doc.sliceString(result.from, result.to);

      // Use RelativePosition if yText available (survives concurrent edits)
      // Falls back to line/ch for backwards compatibility
      const position = yText
        ? Y.createRelativePositionFromTypeIndex(yText, pos)
        : { line: context.state.doc.lineAt(pos).number, ch: pos - context.state.doc.lineAt(pos).from };

      // Broadcast to awareness
      stateManager.setAutocomplete({
        query,
        items: result.options.slice(0, maxItems).map(opt => opt.label),
        position,
        cellIndex: cell ? findCellIndexHelper(content, cell) : undefined,
      });
    }

    return result;
  };
}

/**
 * Creates a CodeMirror extension that clears autocomplete state when popup closes.
 *
 * @param {import('./state.js').AwarenessStateManager} stateManager
 * @returns {import('@codemirror/state').Extension}
 */
export function createAutocompleteClearTracker(stateManager) {
  return ViewPlugin.fromClass(
    class {
      constructor() {
        this.wasOpen = false;
      }

      update(update) {
        // Check if autocomplete tooltip is present
        const isOpen = update.view.dom.querySelector('.cm-tooltip-autocomplete') !== null;

        if (this.wasOpen && !isOpen) {
          // Autocomplete just closed
          stateManager.setAutocomplete(null);
        }

        this.wasOpen = isOpen;
      }
    }
  );
}

// #endregion AUTOCOMPLETE_TRACKER

// #region IDLE_TRACKER

/**
 * Creates an extension that sets status to idle on blur/visibility change.
 *
 * @param {import('./state.js').AwarenessStateManager} stateManager
 * @returns {import('@codemirror/state').Extension}
 */
export function createIdleTracker(stateManager) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.stateManager = stateManager;

        // Track focus
        this.onBlur = () => {
          this.stateManager.clearTransient();
        };

        // Track visibility
        this.onVisibilityChange = () => {
          if (document.hidden) {
            this.stateManager.clearTransient();
          }
        };

        view.dom.addEventListener('blur', this.onBlur, true);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
      }

      destroy() {
        this.view.dom.removeEventListener('blur', this.onBlur, true);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
      }
    }
  );
}

// #endregion IDLE_TRACKER

// #region COMBINED

/**
 * Creates all human awareness tracking extensions.
 *
 * @param {Object} options
 * @param {import('./state.js').AwarenessStateManager} options.stateManager
 * @param {function(): string} options.getContent
 * @param {Object} [options.config]
 * @param {number} [options.config.idleTimeout=2000]
 * @param {number} [options.config.hoverClearDelay=500]
 * @param {number} [options.config.maxAutocompleteItems=5]
 * @returns {import('@codemirror/state').Extension[]}
 */
export function createHumanAwarenessExtensions({ stateManager, getContent, config = {} }) {
  const {
    idleTimeout = 2000,
  } = config;

  return [
    createTypingTracker({ stateManager, idleTimeout, getContent }),
    createAutocompleteClearTracker(stateManager),
    createIdleTracker(stateManager),
  ];
}

// #endregion COMBINED

// #region EXPORTS

export default {
  createTypingTracker,
  createHoverTracker,
  createAutocompleteTracker,
  createAutocompleteClearTracker,
  createIdleTracker,
  createHumanAwarenessExtensions,
};

// #endregion EXPORTS
