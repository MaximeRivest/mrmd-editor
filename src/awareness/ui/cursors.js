/**
 * Enhanced Cursor Decorations
 *
 * Extends the default y-codemirror.next cursor rendering with richer labels
 * showing collaborator status, what they're doing, etc.
 *
 * The default y-codemirror.next shows: colored caret + name on hover.
 * This enhancement adds: status indicator, activity text, animation.
 *
 * @module awareness/ui/cursors
 */

import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import * as Y from 'yjs';

// #region WIDGET

/**
 * Widget for rendering enhanced cursor label
 */
class CursorLabelWidget extends WidgetType {
  /**
   * @param {Object} options
   * @param {string} options.name
   * @param {string} options.color
   * @param {string} [options.status]
   * @param {string} [options.activity]
   * @param {string} [options.type]
   * @param {boolean} [options.showAlways=false]
   */
  constructor({ name, color, status, activity, type, showAlways = false }) {
    super();
    this.name = name;
    this.color = color;
    this.status = status;
    this.activity = activity;
    this.type = type;
    this.showAlways = showAlways;
  }

  eq(other) {
    return (
      other.name === this.name &&
      other.color === this.color &&
      other.status === this.status &&
      other.activity === this.activity
    );
  }

  toDOM() {
    const container = document.createElement('span');
    container.className = `mrmd-cursor-label${this.showAlways ? ' mrmd-cursor-label--always' : ''}`;
    container.style.setProperty('--cursor-color', this.color);

    // Name
    const nameEl = document.createElement('span');
    nameEl.className = 'mrmd-cursor-label__name';
    nameEl.textContent = this.name;
    container.appendChild(nameEl);

    // Status indicator
    if (this.status && this.status !== 'idle') {
      const statusEl = document.createElement('span');
      statusEl.className = `mrmd-cursor-label__status mrmd-cursor-label__status--${this.status}`;

      switch (this.status) {
        case 'typing':
          statusEl.innerHTML = '<span class="typing-indicator"><span></span><span></span><span></span></span>';
          break;
        case 'executing':
          statusEl.innerHTML = '<span class="executing-indicator"></span>';
          break;
        case 'streaming':
          statusEl.innerHTML = '<span class="streaming-indicator"></span>';
          break;
        default:
          statusEl.textContent = this.status;
      }

      container.appendChild(statusEl);
    }

    // Activity text (short)
    if (this.activity) {
      const activityEl = document.createElement('span');
      activityEl.className = 'mrmd-cursor-label__activity';
      activityEl.textContent = this.activity;
      container.appendChild(activityEl);
    }

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

// #endregion WIDGET

// #region CARET_WIDGET

/**
 * Widget for the actual cursor caret (the blinking line)
 */
class CursorCaretWidget extends WidgetType {
  constructor({ color, status }) {
    super();
    this.color = color;
    this.status = status;
  }

  eq(other) {
    return other.color === this.color && other.status === this.status;
  }

  toDOM() {
    const caret = document.createElement('span');
    caret.className = `mrmd-cursor-caret${this.status ? ' mrmd-cursor-caret--' + this.status : ''}`;
    caret.style.borderColor = this.color;
    caret.style.setProperty('--cursor-color', this.color);
    return caret;
  }

  ignoreEvent() {
    return true;
  }
}

// #endregion CARET_WIDGET

// #region EXTENSION

/**
 * Creates an enhanced cursor decoration extension.
 *
 * This works alongside y-codemirror.next's built-in cursors, adding
 * richer labels with status information.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {Y.Text} [options.yText] - Yjs Text instance for position conversion
 * @param {Object} [options.config]
 * @param {boolean} [options.config.showLabels=true] - Show name labels
 * @param {boolean} [options.config.showStatus=true] - Show status indicators
 * @param {boolean} [options.config.showActivity=true] - Show activity text
 * @param {boolean} [options.config.showAlways=false] - Always show labels (not just on hover)
 * @param {boolean} [options.config.replaceCaret=false] - Replace default carets
 * @returns {import('@codemirror/state').Extension}
 */
export function createEnhancedCursors({ stateManager, yText, config = {} }) {
  const {
    showLabels = true,
    showStatus = true,
    showActivity = true,
    showAlways = false,
    replaceCaret = false,
  } = config;

  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.stateManager = stateManager;
        this.yText = yText;
        try {
          this.decorations = this.buildDecorations();
        } catch (e) {
          console.warn('Initial cursor decoration build failed:', e);
          this.decorations = Decoration.none;
        }

        // Subscribe to awareness changes
        this.unsubscribe = stateManager.onChange(() => {
          try {
            this.decorations = this.buildDecorations();
            // Request a measure pass to update decorations
            if (view.dom && view.dom.isConnected) {
              view.requestMeasure();
            }
          } catch (e) {
            console.warn('Cursor decoration update failed:', e);
          }
        });
      }

      update(update) {
        // Rebuild on doc or selection changes (cursor positions may have changed)
        if (update.docChanged || update.selectionSet) {
          this.decorations = this.buildDecorations();
        }
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        const localClientId = this.stateManager.awareness.clientID;

        // Get all remote collaborators with cursor state
        const collaborators = [];
        this.stateManager.awareness.getStates().forEach((state, clientId) => {
          if (clientId === localClientId) return; // Skip self
          if (!state.user) return;

          // y-codemirror.next stores cursor in awareness
          const cursor = state.cursor;
          if (!cursor) return;

          collaborators.push({
            clientId,
            user: state.user,
            cursor,
          });
        });

        // Sort by position to build decorations in order
        const decorationsToAdd = [];

        for (const { clientId, user, cursor } of collaborators) {
          // Get absolute position from relative position
          // This depends on y-codemirror.next's cursor format
          const pos = this.getAbsolutePosition(cursor);
          if (pos === null || pos < 0 || pos > this.view.state.doc.length) continue;

          // Activity text
          let activity = '';
          if (showActivity && user.hover) {
            activity = `→ ${user.hover.symbol}`;
          } else if (showActivity && user.autocomplete) {
            activity = `→ ${user.autocomplete.query}...`;
          }

          // Add caret decoration
          if (replaceCaret) {
            decorationsToAdd.push({
              pos,
              decoration: Decoration.widget({
                widget: new CursorCaretWidget({
                  color: user.color,
                  status: user.status,
                }),
                side: 1,
              }),
            });
          }

          // Add label decoration
          if (showLabels) {
            decorationsToAdd.push({
              pos,
              decoration: Decoration.widget({
                widget: new CursorLabelWidget({
                  name: user.name || 'Anonymous',
                  color: user.color || '#666',
                  status: showStatus ? user.status : undefined,
                  activity,
                  type: user.type,
                  showAlways,
                }),
                side: 1,
              }),
            });
          }
        }

        // Sort by position and add to builder
        decorationsToAdd.sort((a, b) => a.pos - b.pos);
        for (const { pos, decoration } of decorationsToAdd) {
          builder.add(pos, pos, decoration);
        }

        return builder.finish();
      }

      /**
       * Convert y-codemirror relative position to absolute position
       * y-codemirror.next stores cursor as {anchor, head} with RelativePositions
       * that need to be converted using the Y.Doc
       */
      getAbsolutePosition(cursor) {
        if (typeof cursor === 'number') {
          return cursor;
        }

        // If cursor has head property as a number, use that directly
        if (cursor && typeof cursor.head === 'number') {
          return cursor.head;
        }

        // If cursor.head is a RelativePosition object, convert it
        if (cursor && cursor.head && typeof cursor.head === 'object' && this.yText) {
          try {
            const ydoc = this.yText.doc;
            if (ydoc) {
              const absPos = Y.createAbsolutePositionFromRelativePosition(cursor.head, ydoc);
              if (absPos) {
                return absPos.index;
              }
            }
          } catch (e) {
            // Conversion failed, fall through
          }
        }

        // Fallback: try anchor
        if (cursor && typeof cursor.anchor === 'number') {
          return cursor.anchor;
        }

        if (cursor && cursor.anchor && typeof cursor.anchor === 'object' && this.yText) {
          try {
            const ydoc = this.yText.doc;
            if (ydoc) {
              const absPos = Y.createAbsolutePositionFromRelativePosition(cursor.anchor, ydoc);
              if (absPos) {
                return absPos.index;
              }
            }
          } catch (e) {
            // Conversion failed
          }
        }

        return null;
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
}

// #endregion EXTENSION

// #region SELECTION_HIGHLIGHT

/**
 * Creates selection highlight decorations for remote collaborators.
 *
 * Shows a colored background for text selected by other users.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {Y.Text} [options.yText] - Yjs Text instance for position conversion
 * @param {number} [options.opacity=0.2] - Selection background opacity
 * @returns {import('@codemirror/state').Extension}
 */
export function createSelectionHighlights({ stateManager, yText, opacity = 0.2 }) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.stateManager = stateManager;
        this.yText = yText;
        try {
          this.decorations = this.buildDecorations();
        } catch (e) {
          console.warn('Initial selection highlight build failed:', e);
          this.decorations = Decoration.none;
        }

        this.unsubscribe = stateManager.onChange(() => {
          try {
            this.decorations = this.buildDecorations();
            if (view.dom && view.dom.isConnected) {
              view.requestMeasure();
            }
          } catch (e) {
            console.warn('Selection highlight update failed:', e);
          }
        });
      }

      update(update) {
        if (update.docChanged) {
          this.decorations = this.buildDecorations();
        }
      }

      /**
       * Convert a RelativePosition to absolute index
       */
      getAbsoluteIndex(relPos) {
        if (typeof relPos === 'number') return relPos;
        if (!relPos || typeof relPos !== 'object' || !this.yText) return null;

        try {
          const ydoc = this.yText.doc;
          if (ydoc) {
            const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc);
            if (absPos) return absPos.index;
          }
        } catch (e) {
          // Conversion failed
        }
        return null;
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        const localClientId = this.stateManager.awareness.clientID;
        const docLength = this.view.state.doc.length;

        const decorationsToAdd = [];

        this.stateManager.awareness.getStates().forEach((state, clientId) => {
          if (clientId === localClientId) return;
          if (!state.user || !state.cursor) return;

          const cursor = state.cursor;
          let from, to;

          if (typeof cursor === 'object') {
            from = this.getAbsoluteIndex(cursor.anchor);
            to = this.getAbsoluteIndex(cursor.head);
          }

          if (from === null || to === null) return;

          // Ensure from < to
          if (from > to) [from, to] = [to, from];

          // Clamp to document bounds
          from = Math.max(0, Math.min(from, docLength));
          to = Math.max(0, Math.min(to, docLength));

          // Only show if there's an actual selection (not just a cursor)
          if (from === to) return;

          const color = state.user.color || '#666';

          decorationsToAdd.push({
            from,
            to,
            decoration: Decoration.mark({
              class: 'mrmd-remote-selection',
              attributes: {
                style: `background-color: ${hexToRgba(color, opacity)}`,
              },
            }),
          });
        });

        // Sort and add
        decorationsToAdd.sort((a, b) => a.from - b.from);
        for (const { from, to, decoration } of decorationsToAdd) {
          builder.add(from, to, decoration);
        }

        return builder.finish();
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
}

/**
 * Convert hex color to rgba
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(100, 100, 100, ${alpha})`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// #endregion SELECTION_HIGHLIGHT

// #region COMBINED

/**
 * Creates all cursor-related awareness extensions.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {Y.Text} [options.yText] - Yjs Text instance for position conversion
 * @param {Object} [options.config]
 * @returns {import('@codemirror/state').Extension[]}
 */
export function createCursorExtensions({ stateManager, yText, config = {} }) {
  return [
    createEnhancedCursors({ stateManager, yText, config }),
    createSelectionHighlights({ stateManager, yText, opacity: config.selectionOpacity || 0.2 }),
  ];
}

// #endregion COMBINED

// #region EXPORTS

export default {
  CursorLabelWidget,
  CursorCaretWidget,
  createEnhancedCursors,
  createSelectionHighlights,
  createCursorExtensions,
};

// #endregion EXPORTS
