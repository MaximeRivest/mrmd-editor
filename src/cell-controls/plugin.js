/**
 * Cell Controls Plugin
 *
 * CodeMirror ViewPlugin that renders cell control decorations.
 * Supports multiple positions: line-start, line-end, gutter.
 */

import { ViewPlugin, Decoration, gutter, GutterMarker } from '@codemirror/view';
import { StateField, StateEffect, Facet } from '@codemirror/state';
import { findCodeBlocks } from '../cells.js';
import { CellControlsWidget, CellControlsGutterMarker, injectCellControlsStyles } from './widgets.js';

/**
 * @typedef {import('../config/schema.js').CellControlsConfig} CellControlsConfig
 * @typedef {import('../state/schema.js').CellStatusInfo} CellStatusInfo
 * @typedef {import('../state/manager.js').StateManager} StateManager
 * @typedef {import('./queue.js').ExecutionQueue} ExecutionQueue
 */

// Facet to provide cell controls context to the plugin
export const cellControlsFacet = Facet.define({
  combine: (values) => values[0] || null
});

// Effect to trigger decoration rebuild
export const rebuildCellControlsEffect = StateEffect.define();

/**
 * Build decorations for all code cells
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Object} context
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildDecorations(view, context) {
  if (!context || !context.config?.enabled) {
    return Decoration.none;
  }

  const { config, stateManager, callbacks, queue } = context;
  const decorations = [];
  const content = view.state.doc.toString();
  const codeBlocks = findCodeBlocks(content);

  // Filter to executable blocks only
  const executableBlocks = codeBlocks.filter(b => b.executable);

  // Get queue state
  const queueState = stateManager?.getQueue() || { entries: [], running: null, runningByLanguage: {}, total: 0 };

  // Compute per-language queue totals
  const queueTotalByLanguage = {};
  for (const entry of queueState.entries) {
    queueTotalByLanguage[entry.language] = (queueTotalByLanguage[entry.language] || 0) + 1;
  }
  // Add running entries to totals
  if (queueState.runningByLanguage) {
    for (const language of Object.keys(queueState.runningByLanguage)) {
      queueTotalByLanguage[language] = (queueTotalByLanguage[language] || 0) + 1;
    }
  }

  for (let i = 0; i < executableBlocks.length; i++) {
    const block = executableBlocks[i];

    // Get cell status from state manager
    const cellStatus = stateManager?.getCellStatus(i) || {
      status: 'idle',
      queuePosition: null,
      execId: null,
      lastRunAt: null,
      error: null
    };

    // Skip if position is 'none'
    if (config.position === 'none') {
      continue;
    }

    // Skip gutter - handled separately
    if (config.position === 'gutter') {
      continue;
    }

    // Find the line containing the opening fence
    const line = view.state.doc.lineAt(block.start);

    // Get per-language queue total for this cell's language
    const languageQueueTotal = queueTotalByLanguage[block.language] || 0;

    // Create widget
    const widget = new CellControlsWidget({
      cellIndex: i,
      language: block.language,
      status: cellStatus,
      buttons: config.buttons,
      queueTotal: languageQueueTotal,
      callbacks: {
        onRun: callbacks?.onRun,
        onStop: callbacks?.onStop,
        onClear: callbacks?.onClear,
        onCopy: callbacks?.onCopy,
        onCopyOutput: callbacks?.onCopyOutput,
        onCopyBoth: callbacks?.onCopyBoth
      }
    });

    // Position based on config
    let pos;
    if (config.position === 'line-start') {
      // After the opening ``` and language identifier
      // Find end of the first line (after ```language)
      pos = line.to;
    } else if (config.position === 'line-end') {
      // At the end of the opening fence line
      pos = line.to;
    } else {
      // Default to line-end
      pos = line.to;
    }

    decorations.push(
      Decoration.widget({
        widget,
        side: 1 // After the position
      }).range(pos)
    );
  }

  return Decoration.set(decorations, true);
}

/**
 * Cell controls ViewPlugin
 */
class CellControlsPluginClass {
  constructor(view) {
    this.view = view;
    this.context = view.state.facet(cellControlsFacet);
    this.decorations = buildDecorations(view, this.context);

    // Inject styles on first instantiation
    injectCellControlsStyles();

    // Subscribe to state changes
    this._setupStateSubscription();
  }

  _setupStateSubscription() {
    if (!this.context?.stateManager) return;

    // Subscribe to queue and cell status changes
    this._unsubscribe = this.context.stateManager.subscribe((event) => {
      if (event.path.startsWith('queue') || event.path.startsWith('cellStatus')) {
        // Trigger rebuild
        this.view.dispatch({
          effects: rebuildCellControlsEffect.of(null)
        });
      }
    });
  }

  update(update) {
    // Get current context (may have changed)
    const newContext = update.state.facet(cellControlsFacet);

    // Rebuild if document changed, context changed, or explicitly triggered
    const needsRebuild =
      update.docChanged ||
      this.context !== newContext ||
      update.transactions.some(tr => tr.effects.some(e => e.is(rebuildCellControlsEffect)));

    if (needsRebuild) {
      this.context = newContext;
      this.decorations = buildDecorations(update.view, this.context);

      // Re-setup subscription if context changed
      if (newContext && !this._unsubscribe) {
        this._setupStateSubscription();
      }
    }
  }

  destroy() {
    this._unsubscribe?.();
  }
}

/**
 * Cell controls ViewPlugin
 */
export const cellControlsPlugin = ViewPlugin.fromClass(CellControlsPluginClass, {
  decorations: (v) => v.decorations
});

/**
 * Custom gutter marker for cell controls
 */
class CellControlsMarker extends GutterMarker {
  constructor(cellIndex, status, queueTotal, callbacks) {
    super();
    this.cellIndex = cellIndex;
    this.status = status;
    this.queueTotal = queueTotal;
    this.callbacks = callbacks;
  }

  eq(other) {
    return (
      other instanceof CellControlsMarker &&
      this.cellIndex === other.cellIndex &&
      this.status.status === other.status.status &&
      this.status.queuePosition === other.status.queuePosition
    );
  }

  toDOM() {
    const widget = new CellControlsGutterMarker({
      cellIndex: this.cellIndex,
      status: this.status,
      queueTotal: this.queueTotal,
      callbacks: this.callbacks
    });
    return widget.toDOM();
  }
}

/**
 * Create a gutter for cell controls
 *
 * @param {Object} context
 * @returns {import('@codemirror/state').Extension}
 */
export function createCellControlsGutter(context) {
  return gutter({
    class: 'cm-cell-controls-gutter-col',
    markers: (view) => {
      if (!context?.config?.enabled || context.config.position !== 'gutter') {
        return [];
      }

      const content = view.state.doc.toString();
      const codeBlocks = findCodeBlocks(content);
      const executableBlocks = codeBlocks.filter(b => b.executable);
      const queueState = context.stateManager?.getQueue() || { total: 0 };

      const markers = [];
      for (let i = 0; i < executableBlocks.length; i++) {
        const block = executableBlocks[i];
        const line = view.state.doc.lineAt(block.start);
        const cellStatus = context.stateManager?.getCellStatus(i) || {
          status: 'idle',
          queuePosition: null
        };

        markers.push(new CellControlsMarker(
          i,
          cellStatus,
          queueState.total,
          context.callbacks
        ));
      }

      // Return as RangeSet-compatible format
      return markers.map((m, i) => {
        const block = executableBlocks[i];
        const line = view.state.doc.lineAt(block.start);
        return { from: line.from, marker: m };
      });
    },
    initialSpacer: () => {
      const spacer = document.createElement('div');
      spacer.className = 'cm-cell-controls-gutter';
      spacer.style.width = '20px';
      return spacer;
    }
  });
}

/**
 * State field to store cell controls context
 * Allows updating context without recreating plugin
 */
export const cellControlsState = StateField.define({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setCellControlsContext)) {
        return effect.value;
      }
    }
    return value;
  }
});

export const setCellControlsContext = StateEffect.define();

/**
 * Create cell controls extensions
 *
 * @param {Object} options
 * @param {CellControlsConfig} options.config - Cell controls configuration
 * @param {StateManager} options.stateManager - State manager
 * @param {ExecutionQueue} options.queue - Execution queue
 * @param {Object} options.callbacks - Action callbacks
 * @returns {import('@codemirror/state').Extension[]}
 */
export function createCellControlsExtensions(options) {
  const { config, stateManager, queue, callbacks } = options;

  const context = {
    config,
    stateManager,
    queue,
    callbacks
  };

  const extensions = [
    cellControlsFacet.of(context),
    cellControlsPlugin
  ];

  // Add gutter if configured
  if (config.position === 'gutter') {
    extensions.push(createCellControlsGutter(context));
  }

  return extensions;
}
