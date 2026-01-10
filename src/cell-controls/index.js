/**
 * Cell Controls Module
 *
 * Provides run/stop buttons, status indicators, and execution queue
 * for code cells in the MRMD editor.
 *
 * Features:
 * - Play/Stop buttons for each code cell
 * - Queue status badges with position indicators
 * - Copy code/output buttons
 * - Sequential execution queue (FIFO, like Jupyter)
 * - Status lines in output blocks for LLM readability
 * - Multiple position options: line-start, line-end, gutter
 * - Full theming support via CSS variables
 *
 * Usage:
 *
 *   import { createCellControls } from './cell-controls';
 *
 *   const cellControls = createCellControls({
 *     editor,
 *     executionManager,
 *     stateManager,
 *     config: editor.config.cellControls
 *   });
 *
 *   // Get CodeMirror extensions
 *   const extensions = cellControls.getExtensions();
 *
 *   // Access the queue
 *   cellControls.queue.enqueue(0); // Queue cell 0
 *   cellControls.queue.cancel(execId); // Cancel by execId
 */

// Re-export core components
export { ExecutionQueue, createExecutionQueue } from './queue.js';
export {
  CellControlsWidget,
  CellControlsGutterMarker,
  injectCellControlsStyles
} from './widgets.js';
export {
  cellControlsPlugin,
  cellControlsFacet,
  rebuildCellControlsEffect,
  createCellControlsExtensions,
  createCellControlsGutter
} from './plugin.js';

import { ExecutionQueue, createExecutionQueue } from './queue.js';
import { createCellControlsExtensions, cellControlsPlugin, cellControlsFacet } from './plugin.js';
import { injectCellControlsStyles } from './widgets.js';
import { findCodeBlocks, findOutputBlock } from '../cells.js';

/**
 * @typedef {import('../config/schema.js').CellControlsConfig} CellControlsConfig
 * @typedef {import('../state/manager.js').StateManager} StateManager
 * @typedef {import('../execution.js').ExecutionManager} ExecutionManager
 */

/**
 * Cell Controls System
 *
 * High-level API for cell controls, wrapping the queue, widgets, and extensions.
 */
export class CellControlsSystem {
  /**
   * @param {Object} options
   * @param {Object} options.editor - Editor instance
   * @param {ExecutionManager} options.executionManager - Execution manager
   * @param {StateManager} options.stateManager - State manager
   * @param {CellControlsConfig} options.config - Cell controls config
   * @param {Object} [options.awareness] - Yjs Awareness for collaborative sync
   */
  constructor(options) {
    const { editor, executionManager, stateManager, config, awareness } = options;

    this.editor = editor;
    this.executionManager = executionManager;
    this.stateManager = stateManager;
    this.config = config;
    this.awareness = awareness;

    // Create execution queue
    this.queue = new ExecutionQueue({
      executionManager,
      stateManager,
      editor,
      awareness,
      config: {
        statusLineInOutput: config.status?.statusLineInOutput ?? true
      }
    });

    // Set up callbacks for widgets
    this.callbacks = {
      onRun: (cellIndex) => this.runCell(cellIndex),
      onStop: (cellIndex, execId) => this.cancelCell(cellIndex, execId),
      onClear: (cellIndex) => this.clearOutput(cellIndex),
      onCopy: (cellIndex) => this.copyCode(cellIndex),
      onCopyOutput: (cellIndex) => this.copyOutput(cellIndex),
      onCopyBoth: (cellIndex) => this.copyBoth(cellIndex)
    };

    // Inject styles
    injectCellControlsStyles();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get CodeMirror extensions for cell controls
   *
   * @returns {import('@codemirror/state').Extension[]}
   */
  getExtensions() {
    return createCellControlsExtensions({
      config: this.config,
      stateManager: this.stateManager,
      queue: this.queue,
      callbacks: this.callbacks
    });
  }

  /**
   * Run a cell (adds to queue)
   *
   * @param {number} cellIndex
   * @returns {string} Execution ID
   */
  runCell(cellIndex) {
    return this.queue.enqueue(cellIndex);
  }

  /**
   * Cancel a cell execution
   *
   * @param {number} cellIndex
   * @param {string} [execId] - Optional specific execution ID
   * @returns {boolean} Whether cancellation was successful
   */
  cancelCell(cellIndex, execId) {
    if (execId) {
      return this.queue.cancel(execId);
    }

    // Find execId for this cell
    const status = this.queue.getCellQueueStatus(cellIndex);
    if (status.execId) {
      return this.queue.cancel(status.execId);
    }

    return false;
  }

  /**
   * Clear output for a cell
   *
   * @param {number} cellIndex
   */
  clearOutput(cellIndex) {
    this.executionManager.clearOutput(cellIndex);
  }

  /**
   * Copy code from a cell to clipboard
   *
   * @param {number} cellIndex
   */
  async copyCode(cellIndex) {
    const content = this.editor.getContent();
    const blocks = findCodeBlocks(content).filter(b => b.executable);

    if (cellIndex >= 0 && cellIndex < blocks.length) {
      const block = blocks[cellIndex];
      await navigator.clipboard.writeText(block.code);
    }
  }

  /**
   * Copy output from a cell to clipboard
   *
   * @param {number} cellIndex
   */
  async copyOutput(cellIndex) {
    const content = this.editor.getContent();
    const blocks = findCodeBlocks(content).filter(b => b.executable);

    if (cellIndex >= 0 && cellIndex < blocks.length) {
      const block = blocks[cellIndex];
      const output = findOutputBlock(content, block.end);

      if (output) {
        // Strip ANSI codes and status lines
        let outputText = output.content;
        // Remove status lines
        outputText = outputText.replace(/^\[status:(queued|running|completed|error)\] \[\d+\/\d+\]\n/g, '');
        // Strip ANSI codes (basic pattern)
        outputText = outputText.replace(/\x1b\[[0-9;]*m/g, '');

        await navigator.clipboard.writeText(outputText.trim());
      }
    }
  }

  /**
   * Copy both code and output from a cell to clipboard
   *
   * @param {number} cellIndex
   */
  async copyBoth(cellIndex) {
    const content = this.editor.getContent();
    const blocks = findCodeBlocks(content).filter(b => b.executable);

    if (cellIndex >= 0 && cellIndex < blocks.length) {
      const block = blocks[cellIndex];
      const output = findOutputBlock(content, block.end);

      let text = block.code;
      if (output) {
        let outputText = output.content;
        outputText = outputText.replace(/^\[status:(queued|running|completed|error)\] \[\d+\/\d+\]\n/g, '');
        outputText = outputText.replace(/\x1b\[[0-9;]*m/g, '');
        text += '\n\n--- Output ---\n' + outputText.trim();
      }

      await navigator.clipboard.writeText(text);
    }
  }

  /**
   * Run all cells sequentially
   */
  runAll() {
    const content = this.editor.getContent();
    const blocks = findCodeBlocks(content).filter(b => b.executable);

    for (let i = 0; i < blocks.length; i++) {
      this.queue.enqueue(i);
    }
  }

  /**
   * Run all cells above (and including) current cursor position
   */
  runAllAbove() {
    const content = this.editor.getContent();
    const pos = this.editor.view.state.selection.main.head;
    const blocks = findCodeBlocks(content).filter(b => b.executable);

    // Find which cell the cursor is in or nearest cell above
    let targetIndex = -1;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].end <= pos || (blocks[i].start <= pos && blocks[i].end >= pos)) {
        targetIndex = i;
      }
    }

    if (targetIndex >= 0) {
      for (let i = 0; i <= targetIndex; i++) {
        this.queue.enqueue(i);
      }
    }
  }

  /**
   * Cancel all executions
   */
  cancelAll() {
    this.queue.cancelAll();
  }

  /**
   * Update configuration
   *
   * @param {Partial<CellControlsConfig>} newConfig
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Update queue config
    if (newConfig.status?.statusLineInOutput !== undefined) {
      this.queue.config.statusLineInOutput = newConfig.status.statusLineInOutput;
    }
  }

  /**
   * Get queue snapshot
   *
   * @returns {{entries: Array, running: string|null, total: number}}
   */
  getQueueSnapshot() {
    return this.queue.getQueueSnapshot();
  }

  /**
   * Subscribe to queue events
   *
   * @param {'queued'|'started'|'completed'|'cancelled'|'error'|'queueChanged'} event
   * @param {function} handler
   * @returns {function} Unsubscribe function
   */
  on(event, handler) {
    return this.queue.on(event, handler);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.queue.destroy();
  }
}

/**
 * Create a cell controls system
 *
 * @param {Object} options
 * @param {Object} options.editor - Editor instance
 * @param {ExecutionManager} options.executionManager - Execution manager
 * @param {StateManager} options.stateManager - State manager
 * @param {CellControlsConfig} options.config - Cell controls config
 * @returns {CellControlsSystem}
 */
export function createCellControls(options) {
  return new CellControlsSystem(options);
}

export default {
  // Main API
  createCellControls,
  CellControlsSystem,

  // Queue
  ExecutionQueue,
  createExecutionQueue,

  // Extensions
  createCellControlsExtensions,
  cellControlsPlugin,
  cellControlsFacet,

  // Styles
  injectCellControlsStyles
};
