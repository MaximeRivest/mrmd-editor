/**
 * Monitor Coordination
 *
 * Browser-side coordination protocol for working with mrmd-monitor.
 * Uses Y.Map('executions') to communicate with the monitor.
 *
 * @module mrmd-editor/monitor-coordination
 */

import * as Y from 'yjs';

/**
 * Execution status values (must match mrmd-monitor/coordination.js)
 */
export const EXECUTION_STATUS = {
  /** Browser has requested execution */
  REQUESTED: 'requested',
  /** Monitor has claimed the execution */
  CLAIMED: 'claimed',
  /** Browser has created output block, ready to start */
  READY: 'ready',
  /** Monitor is streaming output from runtime */
  RUNNING: 'running',
  /** Execution completed successfully */
  COMPLETED: 'completed',
  /** Execution failed with error */
  ERROR: 'error',
  /** Execution was cancelled */
  CANCELLED: 'cancelled',
};

/**
 * Browser-side coordination for monitor mode
 */
export class MonitorCoordination {
  /**
   * @param {Y.Doc} ydoc - Yjs document
   * @param {number} clientId - This client's ID
   */
  constructor(ydoc, clientId) {
    /** @type {Y.Doc} */
    this.ydoc = ydoc;

    /** @type {number} */
    this.clientId = clientId;

    /** @type {Y.Map} */
    this.executions = ydoc.getMap('executions');

    /** @type {Map<string, Function>} */
    this._statusCallbacks = new Map();

    /** @type {Set<Function>} */
    this._observers = new Set();

    // Start observing
    this._setupObserver();
  }

  /**
   * Generate unique execution ID
   * @returns {string}
   */
  static generateExecId() {
    return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Set up Y.Map observer
   */
  _setupObserver() {
    const observer = (event) => {
      event.changes.keys.forEach((change, execId) => {
        const exec = this.executions.get(execId);

        // Debug logging for stdin
        if (exec?.stdinRequest) {
          console.log('[MonitorCoordination] Detected stdinRequest in exec:', execId, exec.stdinRequest);
        }

        // Call status callback if registered
        const callback = this._statusCallbacks.get(execId);
        if (callback && exec) {
          callback(exec.status, exec);
        } else if (exec?.stdinRequest) {
          console.warn('[MonitorCoordination] No callback registered for execId with stdinRequest:', execId);
        }
      });
    };

    this.executions.observe(observer);
    this._observers.add(observer);
  }

  /**
   * Request execution via monitor
   *
   * @param {Object} options
   * @param {string} options.code - Code to execute
   * @param {string} options.language - Language identifier
   * @param {string} options.runtimeUrl - MRP runtime URL
   * @param {string} [options.session] - MRP session ID
   * @param {string} [options.cellId] - Cell ID for tracking
   * @returns {string} execId
   */
  requestExecution({ code, language, runtimeUrl, session = 'default', cellId }) {
    const execId = MonitorCoordination.generateExecId();

    this.executions.set(execId, {
      id: execId,
      cellId,
      code,
      language,
      runtimeUrl,
      session,
      status: EXECUTION_STATUS.REQUESTED,
      requestedBy: this.clientId,
      requestedAt: Date.now(),
      claimedBy: null,
      claimedAt: null,
      outputBlockReady: false,
      outputPosition: null,
      startedAt: null,
      completedAt: null,
      stdinRequest: null,
      stdinResponse: null,
      result: null,
      error: null,
      displayData: [],
    });

    return execId;
  }

  /**
   * Mark output block as ready (called after creating output block in Y.Text)
   *
   * @param {string} execId
   * @param {Object} outputPosition - Yjs RelativePosition as JSON
   */
  setOutputBlockReady(execId, outputPosition) {
    const exec = this.executions.get(execId);
    if (!exec) return;

    this.executions.set(execId, {
      ...exec,
      status: exec.status === EXECUTION_STATUS.CLAIMED ? EXECUTION_STATUS.READY : exec.status,
      outputBlockReady: true,
      outputPosition,
    });
  }

  /**
   * Respond to stdin request
   *
   * @param {string} execId
   * @param {string} text - User input
   */
  respondStdin(execId, text) {
    const exec = this.executions.get(execId);
    if (!exec) return;

    this.executions.set(execId, {
      ...exec,
      stdinResponse: {
        text,
        respondedAt: Date.now(),
      },
    });
  }

  /**
   * Cancel execution
   *
   * @param {string} execId
   */
  cancelExecution(execId) {
    const exec = this.executions.get(execId);
    if (!exec) return;

    // Only cancel if not already completed/error
    if ([EXECUTION_STATUS.COMPLETED, EXECUTION_STATUS.ERROR, EXECUTION_STATUS.CANCELLED].includes(exec.status)) {
      return;
    }

    this.executions.set(execId, {
      ...exec,
      status: EXECUTION_STATUS.CANCELLED,
      completedAt: Date.now(),
    });
  }

  /**
   * Get execution by ID
   *
   * @param {string} execId
   * @returns {Object|undefined}
   */
  getExecution(execId) {
    return this.executions.get(execId);
  }

  /**
   * Watch for status changes on a specific execution
   *
   * @param {string} execId
   * @param {Function} callback - Called with (status, execution)
   * @returns {Function} Unsubscribe function
   */
  onStatusChange(execId, callback) {
    this._statusCallbacks.set(execId, callback);

    return () => {
      this._statusCallbacks.delete(execId);
    };
  }

  /**
   * Wait for a specific status
   *
   * @param {string} execId
   * @param {string|string[]} targetStatus - Status or array of statuses to wait for
   * @param {number} [timeout=30000] - Timeout in ms
   * @returns {Promise<Object>} Execution object when status is reached
   */
  waitForStatus(execId, targetStatus, timeout = 30000) {
    const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];

    return new Promise((resolve, reject) => {
      // Check current status first
      const current = this.executions.get(execId);
      if (current && statuses.includes(current.status)) {
        resolve(current);
        return;
      }

      let timeoutId;
      const unsubscribe = this.onStatusChange(execId, (status, exec) => {
        if (statuses.includes(status)) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(exec);
        }
      });

      timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for status ${statuses.join('/')} on ${execId}`));
      }, timeout);
    });
  }

  /**
   * Check if monitor mode is available
   *
   * Looks for any monitor in awareness or recent activity in executions map.
   *
   * @param {import('y-protocols/awareness').Awareness} [awareness]
   * @returns {boolean}
   */
  isMonitorAvailable(awareness) {
    if (awareness) {
      // Check if any peer is a monitor
      for (const [clientId, state] of awareness.getStates()) {
        if (state?.user?.type === 'monitor') {
          return true;
        }
      }
    }

    // Fallback: check if there are any recently claimed executions
    // (indicates a monitor is active)
    const now = Date.now();
    const recentThreshold = 60000; // 1 minute

    for (const exec of this.executions.values()) {
      if (exec.claimedBy && exec.claimedAt && (now - exec.claimedAt) < recentThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Clean up old executions (call periodically)
   *
   * @param {number} [maxAge=3600000] - Max age in ms (default: 1 hour)
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    const toDelete = [];

    this.executions.forEach((exec, execId) => {
      const age = now - (exec.completedAt || exec.requestedAt);
      if (age > maxAge && [EXECUTION_STATUS.COMPLETED, EXECUTION_STATUS.ERROR, EXECUTION_STATUS.CANCELLED].includes(exec.status)) {
        toDelete.push(execId);
      }
    });

    for (const execId of toDelete) {
      this.executions.delete(execId);
    }
  }

  /**
   * Destroy and clean up
   */
  destroy() {
    for (const observer of this._observers) {
      this.executions.unobserve(observer);
    }
    this._observers.clear();
    this._statusCallbacks.clear();
  }
}

/**
 * Create monitor coordination instance
 *
 * @param {Y.Doc} ydoc
 * @returns {MonitorCoordination}
 */
export function createMonitorCoordination(ydoc) {
  return new MonitorCoordination(ydoc, ydoc.clientID);
}
