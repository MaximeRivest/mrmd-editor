/**
 * Inline Status Indicators
 *
 * Visual indicators shown inline in the editor:
 * - Hover indicators: small dot where others are hovering
 * - Execution indicators: badge on cells being executed
 * - Cell presence indicators: show who's in each cell
 *
 * @module awareness/ui/indicators
 */

import { ViewPlugin, Decoration, WidgetType, EditorView } from '@codemirror/view';
import { RangeSetBuilder, Annotation } from '@codemirror/state';
import { findCells } from '../../cells.js';
import * as Y from 'yjs';

// Annotation to mark awareness-triggered indicator updates (following y-codemirror.next pattern)
const indicatorAwarenessAnnotation = Annotation.define();

/**
 * Convert a position (either RelativePosition or {line, ch}) to absolute index.
 * @param {Object} position - RelativePosition or {line, ch}
 * @param {import('@codemirror/state').Text} doc - CodeMirror document
 * @param {import('yjs').Text} [yText] - Yjs Text for RelativePosition conversion
 * @returns {number|null} - Absolute position or null if invalid
 */
function positionToAbsolute(position, doc, yText) {
  if (!position) return null;

  // Check if it's a RelativePosition (has type/tname/item properties)
  if (position.type !== undefined || position.tname !== undefined || position.item !== undefined) {
    // It's a RelativePosition - convert using Yjs
    if (yText?.doc) {
      try {
        const absPos = Y.createAbsolutePositionFromRelativePosition(position, yText.doc);
        if (absPos && absPos.type === yText) {
          return absPos.index;
        }
      } catch (e) {
        // Conversion failed
      }
    }
    return null;
  }

  // Legacy format: {line, ch}
  if (typeof position.line === 'number' && typeof position.ch === 'number') {
    try {
      const line = doc.line(position.line);
      return line.from + Math.min(position.ch, line.length);
    } catch (e) {
      // Invalid line number
    }
  }

  return null;
}

// #region HOVER_INDICATOR

/**
 * Widget showing a small dot where a collaborator is hovering
 */
class HoverIndicatorWidget extends WidgetType {
  constructor({ name, color, symbol }) {
    super();
    this.name = name;
    this.color = color;
    this.symbol = symbol;
  }

  eq(other) {
    return (
      other.name === this.name &&
      other.color === this.color &&
      other.symbol === this.symbol
    );
  }

  toDOM() {
    const dot = document.createElement('span');
    dot.className = 'mrmd-hover-indicator';
    dot.style.setProperty('--indicator-color', this.color);
    dot.title = `${this.name} is inspecting ${this.symbol}`;

    // Small colored dot
    const inner = document.createElement('span');
    inner.className = 'mrmd-hover-indicator__dot';
    dot.appendChild(inner);

    return dot;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Creates hover indicator decorations.
 *
 * Shows small dots at positions where other collaborators have
 * their hover tooltips open.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {function(): string} options.getContent
 * @param {import('yjs').Text} [options.yText] - Yjs Text for RelativePosition conversion
 * @returns {import('@codemirror/state').Extension}
 */
export function createHoverIndicators({ stateManager, getContent, yText }) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.stateManager = stateManager;
        this.getContent = getContent;
        this.yText = yText;
        this.decorations = this.buildDecorations();

        // Subscribe to awareness changes (following y-codemirror.next pattern)
        this.unsubscribe = stateManager.onChange((collaborators, changeInfo) => {
          if (changeInfo?.isRemote) {
            view.dispatch({
              annotations: [indicatorAwarenessAnnotation.of([])]
            });
          }
        });
      }

      update(update) {
        // ALWAYS rebuild decorations (following y-codemirror.next pattern)
        this.decorations = this.buildDecorations();
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        const localClientId = this.stateManager.awareness.clientID;
        const doc = this.view.state.doc;
        const decorationsToAdd = [];

        this.stateManager.awareness.getStates().forEach((state, clientId) => {
          if (clientId === localClientId) return;
          if (!state.user?.hover) return;

          const { hover } = state.user;
          const { position, symbol } = hover;

          // Convert position to absolute (handles both RelativePosition and {line, ch})
          const pos = positionToAbsolute(position, doc, this.yText);
          if (pos === null || pos < 0 || pos > doc.length) return;

          try {
            decorationsToAdd.push({
              pos,
              decoration: Decoration.widget({
                widget: new HoverIndicatorWidget({
                  name: state.user.name || 'Anonymous',
                  color: state.user.color || '#666',
                  symbol: symbol || '?',
                }),
                side: -1, // Before the position
              }),
            });
          } catch (e) {
            // Invalid position, skip
          }
        });

        decorationsToAdd.sort((a, b) => a.pos - b.pos);
        for (const { pos, decoration } of decorationsToAdd) {
          builder.add(pos, pos, decoration);
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

// #endregion HOVER_INDICATOR

// #region EXECUTION_INDICATOR

/**
 * Widget showing execution status on a cell
 */
class ExecutionIndicatorWidget extends WidgetType {
  constructor({ name, color, progress, progressText, language }) {
    super();
    this.name = name;
    this.color = color;
    this.progress = progress;
    this.progressText = progressText;
    this.language = language;
  }

  eq(other) {
    return (
      other.name === this.name &&
      other.progress === this.progress &&
      other.progressText === this.progressText
    );
  }

  toDOM() {
    const container = document.createElement('span');
    container.className = 'mrmd-execution-indicator';
    container.style.setProperty('--indicator-color', this.color);

    // Spinner
    const spinner = document.createElement('span');
    spinner.className = 'mrmd-execution-indicator__spinner';
    container.appendChild(spinner);

    // Runtime name
    const label = document.createElement('span');
    label.className = 'mrmd-execution-indicator__label';
    label.textContent = this.name || this.language || 'Running';
    container.appendChild(label);

    // Progress bar (if progress available)
    if (this.progress !== undefined && this.progress !== null) {
      const progressBar = document.createElement('span');
      progressBar.className = 'mrmd-execution-indicator__progress';

      const fill = document.createElement('span');
      fill.className = 'mrmd-execution-indicator__progress-fill';
      fill.style.width = `${Math.round(this.progress * 100)}%`;
      progressBar.appendChild(fill);

      container.appendChild(progressBar);

      // Progress text
      if (this.progressText) {
        const text = document.createElement('span');
        text.className = 'mrmd-execution-indicator__progress-text';
        text.textContent = this.progressText;
        container.appendChild(text);
      }
    }

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Creates execution indicator decorations.
 *
 * Shows a badge on cells that are currently being executed,
 * with optional progress information.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {function(): string} options.getContent
 * @returns {import('@codemirror/state').Extension}
 */
export function createExecutionIndicators({ stateManager, getContent }) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.stateManager = stateManager;
        this.getContent = getContent;
        this.decorations = this.buildDecorations();

        // Subscribe to awareness changes (following y-codemirror.next pattern)
        this.unsubscribe = stateManager.onChange((collaborators, changeInfo) => {
          if (changeInfo?.isRemote) {
            view.dispatch({
              annotations: [indicatorAwarenessAnnotation.of([])]
            });
          }
        });
      }

      update(update) {
        // ALWAYS rebuild decorations (following y-codemirror.next pattern)
        this.decorations = this.buildDecorations();
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        const content = this.getContent();
        const cells = findCells(content);
        const decorationsToAdd = [];

        // Find all active executions from all collaborators
        const activeExecutions = new Map(); // cellIndex -> execution info

        this.stateManager.awareness.getStates().forEach((state, clientId) => {
          if (!state.user?.execution) return;

          const { execution } = state.user;
          const { cellIndex } = execution;

          // Prefer showing the execution with progress info
          const existing = activeExecutions.get(cellIndex);
          if (!existing || execution.progress !== undefined) {
            activeExecutions.set(cellIndex, {
              name: state.user.name,
              color: state.user.color,
              ...execution,
            });
          }
        });

        // Add indicators for executing cells
        activeExecutions.forEach((execution, cellIndex) => {
          const cell = cells[cellIndex];
          if (!cell) return;

          // Position at end of opening fence line
          const doc = this.view.state.doc;
          const cellLine = doc.lineAt(cell.start);

          decorationsToAdd.push({
            pos: cellLine.to,
            decoration: Decoration.widget({
              widget: new ExecutionIndicatorWidget({
                name: execution.name,
                color: execution.color || '#10b981',
                progress: execution.progress,
                progressText: execution.progressText,
                language: execution.language,
              }),
              side: 1,
            }),
          });
        });

        decorationsToAdd.sort((a, b) => a.pos - b.pos);
        for (const { pos, decoration } of decorationsToAdd) {
          builder.add(pos, pos, decoration);
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

// #endregion EXECUTION_INDICATOR

// #region CELL_PRESENCE

/**
 * Widget showing collaborators present in a cell
 */
class CellPresenceWidget extends WidgetType {
  constructor({ collaborators }) {
    super();
    this.collaborators = collaborators;
  }

  eq(other) {
    if (other.collaborators.length !== this.collaborators.length) return false;
    return this.collaborators.every((c, i) =>
      c.name === other.collaborators[i].name && c.color === other.collaborators[i].color
    );
  }

  toDOM() {
    const container = document.createElement('span');
    container.className = 'mrmd-cell-presence';

    // Show avatars for collaborators in this cell
    this.collaborators.slice(0, 3).forEach(({ name, color }) => {
      const avatar = document.createElement('span');
      avatar.className = 'mrmd-cell-presence__avatar';
      avatar.style.backgroundColor = color || '#666';
      avatar.textContent = (name?.[0] || '?').toUpperCase();
      avatar.title = name || 'Anonymous';
      container.appendChild(avatar);
    });

    // Overflow indicator
    if (this.collaborators.length > 3) {
      const more = document.createElement('span');
      more.className = 'mrmd-cell-presence__more';
      more.textContent = `+${this.collaborators.length - 3}`;
      container.appendChild(more);
    }

    return container;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Creates cell presence indicators.
 *
 * Shows small avatars in the gutter area showing which
 * collaborators have their cursor in each cell.
 *
 * Calculates cell index from cursor position (RelativePosition) at render time
 * to avoid stale indices when cells are added/removed.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {function(): string} options.getContent
 * @param {import('yjs').Text} [options.yText] - Yjs Text for cursor position conversion
 * @returns {import('@codemirror/state').Extension}
 */
export function createCellPresenceIndicators({ stateManager, getContent, yText }) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.stateManager = stateManager;
        this.getContent = getContent;
        this.yText = yText;
        this.decorations = this.buildDecorations();

        // Subscribe to awareness changes (following y-codemirror.next pattern)
        this.unsubscribe = stateManager.onChange((collaborators, changeInfo) => {
          if (changeInfo?.isRemote) {
            view.dispatch({
              annotations: [indicatorAwarenessAnnotation.of([])]
            });
          }
        });
      }

      update(update) {
        // ALWAYS rebuild decorations (following y-codemirror.next pattern)
        this.decorations = this.buildDecorations();
      }

      /**
       * Get cell index from cursor position (most accurate) or fallback to stored index
       */
      getCellIndexFromCursor(state, cells) {
        const cursor = state.cursor;
        if (cursor?.head && this.yText?.doc) {
          try {
            const absPos = Y.createAbsolutePositionFromRelativePosition(cursor.head, this.yText.doc);
            if (absPos && absPos.type === this.yText) {
              const pos = absPos.index;
              const cellIndex = cells.findIndex(cell => pos >= cell.start && pos <= cell.end);
              if (cellIndex !== -1) return cellIndex;
            }
          } catch (e) {
            // Fall through to stored index
          }
        }
        // Fallback: stored activeCellIndex (may be stale)
        return state.user?.activeCellIndex;
      }

      buildDecorations() {
        const builder = new RangeSetBuilder();
        const content = this.getContent();
        const cells = findCells(content);
        const localClientId = this.stateManager.awareness.clientID;

        // Group collaborators by cell
        const cellCollaborators = new Map(); // cellIndex -> collaborators[]

        this.stateManager.awareness.getStates().forEach((state, clientId) => {
          if (clientId === localClientId) return;
          if (!state.user) return;

          // Calculate cell index from cursor (survives cell add/remove)
          const cellIndex = this.getCellIndexFromCursor(state, cells);
          if (cellIndex === undefined || cellIndex === null || cellIndex < 0) return;

          if (!cellCollaborators.has(cellIndex)) {
            cellCollaborators.set(cellIndex, []);
          }
          cellCollaborators.get(cellIndex).push({
            name: state.user.name,
            color: state.user.color,
            status: state.user.status,
          });
        });

        // Create decorations
        const decorationsToAdd = [];

        cellCollaborators.forEach((collaborators, cellIndex) => {
          const cell = cells[cellIndex];
          if (!cell) return;

          // Position at start of cell
          decorationsToAdd.push({
            pos: cell.start,
            decoration: Decoration.widget({
              widget: new CellPresenceWidget({ collaborators }),
              side: -1,
            }),
          });
        });

        decorationsToAdd.sort((a, b) => a.pos - b.pos);
        for (const { pos, decoration } of decorationsToAdd) {
          builder.add(pos, pos, decoration);
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

// #endregion CELL_PRESENCE

// #region STATUS_BAR

/**
 * Creates a status bar element showing global awareness info.
 *
 * This is not a CodeMirror extension but a standalone DOM element
 * that can be placed anywhere in your UI.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {HTMLElement} [options.container] - Container to append to
 * @returns {{element: HTMLElement, update: function, destroy: function}}
 */
export function createStatusBar({ stateManager, container }) {
  const bar = document.createElement('div');
  bar.className = 'mrmd-status-bar';

  function render() {
    const collaborators = stateManager.getCollaborators();
    const execution = getActiveExecution(collaborators);
    const generation = getActiveGeneration(collaborators);

    let html = '';

    // Collaborator count
    html += `<span class="mrmd-status-bar__item">
      <span class="mrmd-status-bar__icon">👥</span>
      <span class="mrmd-status-bar__value">${collaborators.length}</span>
    </span>`;

    // Active execution
    if (execution) {
      html += `<span class="mrmd-status-bar__item mrmd-status-bar__item--executing">
        <span class="mrmd-status-bar__spinner"></span>
        <span class="mrmd-status-bar__label">${execution.name || 'Runtime'}</span>
        <span class="mrmd-status-bar__detail">Cell ${execution.cellIndex}</span>
        ${execution.progress !== undefined ? `
          <span class="mrmd-status-bar__progress">
            <span class="mrmd-status-bar__progress-fill" style="width: ${Math.round(execution.progress * 100)}%"></span>
          </span>
          <span class="mrmd-status-bar__progress-text">${execution.progressText || Math.round(execution.progress * 100) + '%'}</span>
        ` : ''}
      </span>`;
    }

    // AI generation
    if (generation) {
      html += `<span class="mrmd-status-bar__item mrmd-status-bar__item--streaming">
        <span class="mrmd-status-bar__icon">🤖</span>
        <span class="mrmd-status-bar__label">${generation.name || 'AI'}</span>
        ${generation.tokensGenerated ? `
          <span class="mrmd-status-bar__detail">${generation.tokensGenerated} tokens</span>
        ` : ''}
      </span>`;
    }

    bar.innerHTML = html;
  }

  function getActiveExecution(collaborators) {
    for (const { user } of collaborators) {
      if (user.execution && user.status === 'executing') {
        return { name: user.name, ...user.execution };
      }
    }
    return null;
  }

  function getActiveGeneration(collaborators) {
    for (const { user } of collaborators) {
      if (user.generation && (user.status === 'streaming' || user.status === 'thinking')) {
        return { name: user.name, ...user.generation };
      }
    }
    return null;
  }

  render();

  const unsubscribe = stateManager.onChange(render);

  if (container) {
    container.appendChild(bar);
  }

  return {
    element: bar,
    update: render,
    destroy() {
      unsubscribe();
      bar.remove();
    },
  };
}

// #endregion STATUS_BAR

// #region COMBINED

/**
 * Creates all indicator extensions.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {function(): string} options.getContent
 * @param {import('yjs').Text} [options.yText] - Yjs Text for RelativePosition conversion
 * @param {Object} [options.config]
 * @param {boolean} [options.config.hover=true]
 * @param {boolean} [options.config.execution=true]
 * @param {boolean} [options.config.cellPresence=true]
 * @returns {import('@codemirror/state').Extension[]}
 */
export function createIndicatorExtensions({ stateManager, getContent, yText, config = {} }) {
  const {
    hover = true,
    execution = true,
    cellPresence = true,
  } = config;

  const extensions = [];

  if (hover) {
    extensions.push(createHoverIndicators({ stateManager, getContent, yText }));
  }

  if (execution) {
    extensions.push(createExecutionIndicators({ stateManager, getContent }));
  }

  if (cellPresence) {
    extensions.push(createCellPresenceIndicators({ stateManager, getContent, yText }));
  }

  return extensions;
}

// #endregion COMBINED

// #region EXPORTS

export default {
  createHoverIndicators,
  createExecutionIndicators,
  createCellPresenceIndicators,
  createStatusBar,
  createIndicatorExtensions,
};

// #endregion EXPORTS
