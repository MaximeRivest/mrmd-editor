/**
 * Runtime Awareness Provider
 *
 * Tracks runtime/execution state and broadcasts via Yjs Awareness:
 * - Which cell is currently executing
 * - Execution progress (if available, e.g., from tqdm)
 * - Runtime status (idle, executing, streaming)
 *
 * This integrates with the ExecutionManager to automatically
 * update awareness when cells are run.
 *
 * @module awareness/runtime
 */

import { AwarenessStateManager, createRuntimeState, withExecution, withStatus } from './state.js';

// #region EXECUTION_TRACKER

/**
 * Creates a runtime awareness tracker that hooks into ExecutionManager.
 *
 * This creates a separate awareness "client" for the runtime, so it appears
 * as a distinct collaborator in the awareness list.
 *
 * @param {Object} options
 * @param {import('../execution.js').ExecutionManager} options.executionManager
 * @param {import('y-protocols/awareness').Awareness} options.awareness
 * @param {string} [options.language='JavaScript'] - Primary runtime language
 * @param {string} [options.name] - Runtime display name
 * @param {string} [options.color] - Runtime color
 * @returns {RuntimeAwarenessTracker}
 */
export function createRuntimeAwarenessTracker({
  executionManager,
  awareness,
  language = 'JavaScript',
  name,
  color,
}) {
  return new RuntimeAwarenessTracker({
    executionManager,
    awareness,
    language,
    name,
    color,
  });
}

/**
 * Runtime awareness tracker class
 */
export class RuntimeAwarenessTracker {
  constructor({ executionManager, awareness, language, name, color }) {
    this.executionManager = executionManager;
    this.awareness = awareness;
    this.language = language;

    // Create state manager
    this.stateManager = new AwarenessStateManager(awareness);

    // Initialize runtime state
    this.stateManager.setLocalState(createRuntimeState({
      language,
      name,
      color,
    }));

    // Track active executions
    this.activeExecutions = new Map();

    // Bind event handlers
    this._onCellRun = this._onCellRun.bind(this);
    this._onCellOutput = this._onCellOutput.bind(this);
    this._onCellComplete = this._onCellComplete.bind(this);
    this._onCellError = this._onCellError.bind(this);

    // Subscribe to execution events
    this._subscriptions = [
      executionManager.on('cellRun', this._onCellRun),
      executionManager.on('cellOutput', this._onCellOutput),
      executionManager.on('cellComplete', this._onCellComplete),
      executionManager.on('cellError', this._onCellError),
    ];
  }

  /**
   * Handle cell execution start
   * @param {number} index
   * @param {Object} cell
   */
  _onCellRun(index, cell) {
    const startTime = Date.now();

    this.activeExecutions.set(index, {
      cellIndex: index,
      startTime,
      language: cell.language,
    });

    // Update awareness
    this.stateManager.setExecution({
      cellIndex: index,
      startTime,
      language: cell.language,
    });
  }

  /**
   * Handle cell output (streaming)
   * @param {number} index
   * @param {string} chunk
   * @param {string} accumulated
   */
  _onCellOutput(index, chunk, accumulated) {
    const execution = this.activeExecutions.get(index);
    if (!execution) return;

    // Try to parse progress from output (tqdm, rich, etc.)
    const progress = this._parseProgress(accumulated);

    if (progress) {
      this.stateManager.setExecution({
        ...execution,
        progress: progress.percent,
        progressText: progress.text,
      });
    }
  }

  /**
   * Handle cell execution complete
   * @param {number} index
   * @param {Object} result
   */
  _onCellComplete(index, result) {
    this.activeExecutions.delete(index);

    // If no more active executions, set to idle
    if (this.activeExecutions.size === 0) {
      this.stateManager.setExecution(null);
    } else {
      // Update to show next active execution
      const [nextIndex, nextExecution] = this.activeExecutions.entries().next().value;
      this.stateManager.setExecution(nextExecution);
    }
  }

  /**
   * Handle cell execution error
   * @param {number} index
   * @param {Error} error
   */
  _onCellError(index, error) {
    // Same as complete - remove from active
    this._onCellComplete(index, { success: false, error });
  }

  /**
   * Try to parse progress information from output
   * Handles common formats: tqdm, rich, percentage patterns
   *
   * @param {string} output
   * @returns {{percent: number, text: string}|null}
   */
  _parseProgress(output) {
    if (!output) return null;

    // Get the last line (most recent progress update)
    const lines = output.split('\n');
    const lastLine = lines[lines.length - 1] || lines[lines.length - 2] || '';

    // tqdm format: "  5%|█         | 5/100 [00:01<00:19, 4.89it/s]"
    const tqdmMatch = lastLine.match(/(\d+)%\|[█▏▎▍▌▋▊▉ ]+\|\s*(\d+)\/(\d+)\s*\[([^\]]+)\]/);
    if (tqdmMatch) {
      return {
        percent: parseInt(tqdmMatch[1]) / 100,
        text: `${tqdmMatch[2]}/${tqdmMatch[3]} [${tqdmMatch[4]}]`,
      };
    }

    // Simple percentage: "Progress: 45%"
    const percentMatch = lastLine.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch) {
      return {
        percent: parseFloat(percentMatch[1]) / 100,
        text: `${percentMatch[1]}%`,
      };
    }

    // Fraction format: "Processing 45/100"
    const fractionMatch = lastLine.match(/(\d+)\s*\/\s*(\d+)/);
    if (fractionMatch) {
      const current = parseInt(fractionMatch[1]);
      const total = parseInt(fractionMatch[2]);
      if (total > 0) {
        return {
          percent: current / total,
          text: `${current}/${total}`,
        };
      }
    }

    return null;
  }

  /**
   * Manually set execution state (useful for external runtimes)
   * @param {Object|null} execution
   */
  setExecution(execution) {
    if (execution) {
      this.activeExecutions.set(execution.cellIndex, execution);
    }
    this.stateManager.setExecution(execution);
  }

  /**
   * Get current execution state
   * @returns {Object|null}
   */
  getExecution() {
    const state = this.stateManager.getLocalState();
    return state?.execution || null;
  }

  /**
   * Check if any cell is currently executing
   * @returns {boolean}
   */
  isExecuting() {
    return this.activeExecutions.size > 0;
  }

  /**
   * Get the runtime state manager
   * @returns {AwarenessStateManager}
   */
  getStateManager() {
    return this.stateManager;
  }

  /**
   * Cleanup subscriptions
   */
  destroy() {
    this._subscriptions.forEach(unsub => unsub());
    this._subscriptions = [];
    this.activeExecutions.clear();
  }
}

// #endregion EXECUTION_TRACKER

// #region MULTI_RUNTIME

/**
 * Tracks multiple runtimes (e.g., Python + JavaScript)
 *
 * Each runtime gets its own awareness state, appearing as separate
 * collaborators in the list.
 */
export class MultiRuntimeTracker {
  constructor({ awareness }) {
    this.awareness = awareness;
    this.runtimes = new Map();
  }

  /**
   * Register a runtime for tracking
   * @param {string} language
   * @param {Object} options
   * @param {import('../execution.js').ExecutionManager} options.executionManager
   * @param {string} [options.name]
   * @param {string} [options.color]
   * @returns {RuntimeAwarenessTracker}
   */
  register(language, { executionManager, name, color }) {
    if (this.runtimes.has(language)) {
      return this.runtimes.get(language);
    }

    const tracker = createRuntimeAwarenessTracker({
      executionManager,
      awareness: this.awareness,
      language,
      name,
      color,
    });

    this.runtimes.set(language, tracker);
    return tracker;
  }

  /**
   * Get tracker for a language
   * @param {string} language
   * @returns {RuntimeAwarenessTracker|undefined}
   */
  get(language) {
    return this.runtimes.get(language);
  }

  /**
   * Check if any runtime is executing
   * @returns {boolean}
   */
  isAnyExecuting() {
    for (const tracker of this.runtimes.values()) {
      if (tracker.isExecuting()) return true;
    }
    return false;
  }

  /**
   * Get all active executions
   * @returns {Array<{language: string, execution: Object}>}
   */
  getActiveExecutions() {
    const active = [];
    for (const [language, tracker] of this.runtimes) {
      const execution = tracker.getExecution();
      if (execution) {
        active.push({ language, execution });
      }
    }
    return active;
  }

  /**
   * Cleanup all trackers
   */
  destroy() {
    for (const tracker of this.runtimes.values()) {
      tracker.destroy();
    }
    this.runtimes.clear();
  }
}

/**
 * Create a multi-runtime tracker
 * @param {Object} options
 * @param {import('y-protocols/awareness').Awareness} options.awareness
 * @returns {MultiRuntimeTracker}
 */
export function createMultiRuntimeTracker({ awareness }) {
  return new MultiRuntimeTracker({ awareness });
}

// #endregion MULTI_RUNTIME

// #region SIMPLE_TRACKER

/**
 * Simple execution state broadcaster for use without ExecutionManager.
 *
 * Use this when you want to manually control execution state updates,
 * e.g., for external runtimes like mrmd-python.
 *
 * @param {Object} options
 * @param {import('./state.js').AwarenessStateManager} options.stateManager
 * @returns {Object} Execution state controller
 */
export function createSimpleExecutionTracker({ stateManager }) {
  return {
    /**
     * Start execution
     * @param {number} cellIndex
     * @param {string} [language]
     */
    start(cellIndex, language) {
      stateManager.setExecution({
        cellIndex,
        startTime: Date.now(),
        language,
      });
    },

    /**
     * Update progress
     * @param {number} progress - 0 to 1
     * @param {string} [progressText]
     */
    progress(progress, progressText) {
      const state = stateManager.getLocalState();
      if (state?.execution) {
        stateManager.setExecution({
          ...state.execution,
          progress,
          progressText,
        });
      }
    },

    /**
     * End execution
     */
    end() {
      stateManager.setExecution(null);
    },

    /**
     * Check if executing
     * @returns {boolean}
     */
    isExecuting() {
      const state = stateManager.getLocalState();
      return state?.status === 'executing';
    },
  };
}

// #endregion SIMPLE_TRACKER

// #region EXPORTS

export default {
  RuntimeAwarenessTracker,
  createRuntimeAwarenessTracker,
  MultiRuntimeTracker,
  createMultiRuntimeTracker,
  createSimpleExecutionTracker,
};

// #endregion EXPORTS
