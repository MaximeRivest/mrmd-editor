/**
 * Execution Queue
 *
 * Manages sequential execution of code cells in FIFO order.
 * Wraps the ExecutionManager to provide queuing, status tracking,
 * and status line insertion in output blocks.
 *
 * Key features:
 * - FIFO queue processing (like Jupyter notebooks)
 * - Status lines in output blocks: [status:queued] [2/3]
 * - Integration with StateManager for UI updates
 * - Event-driven updates for awareness broadcasting
 */

import { generateExecId, findCells, getCellAtIndex, findOutputBlockByExecId } from '../cells.js';

/**
 * @typedef {import('../state/manager.js').StateManager} StateManager
 * @typedef {import('../execution.js').ExecutionManager} ExecutionManager
 * @typedef {import('../state/schema.js').QueueEntry} QueueEntry
 */

/**
 * Internal queue entry with additional tracking
 * @typedef {Object} InternalQueueEntry
 * @property {string} execId - Unique execution ID
 * @property {number} cellIndex - Cell index
 * @property {string} language - Language of the cell
 * @property {string} code - Code to execute
 * @property {number} queuedAt - Timestamp when queued
 * @property {'queued'|'running'|'completed'|'cancelled'|'error'} status
 * @property {number|null} startedAt - When execution started
 * @property {number|null} completedAt - When execution completed
 * @property {string|null} error - Error message if failed
 */

/**
 * ExecutionQueue - FIFO queue for cell execution
 */
export class ExecutionQueue {
  /**
   * @param {Object} options
   * @param {ExecutionManager} options.executionManager - The execution manager
   * @param {StateManager} options.stateManager - State manager for UI updates
   * @param {Object} options.editor - Editor instance
   * @param {Object} [options.awareness] - Yjs Awareness for collaborative sync
   * @param {Object} [options.config] - Queue configuration
   * @param {boolean} [options.config.statusLineInOutput=true] - Add status lines to output
   */
  constructor(options) {
    const { executionManager, stateManager, editor, awareness, config = {} } = options;

    this.executionManager = executionManager;
    this.stateManager = stateManager;
    this.editor = editor;
    this.awareness = awareness;
    this.config = {
      statusLineInOutput: true,
      ...config
    };

    /**
     * Queue per language/runtime - allows parallel execution across runtimes
     * @type {Map<string, InternalQueueEntry[]>}
     */
    this.queueByLanguage = new Map();

    /**
     * Currently running entry per language
     * @type {Map<string, InternalQueueEntry>}
     */
    this.runningByLanguage = new Map();

    /** @type {Set<string>} Languages currently processing */
    this.processingLanguages = new Set();

    /** @type {Map<string, function>} Event handlers */
    this.handlers = {
      queued: [],
      started: [],
      completed: [],
      cancelled: [],
      error: [],
      queueChanged: []
    };

    // Wire up to execution manager events
    this._setupExecutionManagerListeners();
  }

  /**
   * Set up listeners on the execution manager
   */
  _setupExecutionManagerListeners() {
    // Listen for cell run start - output block is now created, so we can add status line
    this.executionManager.on('cellRun', (index, cell, execId) => {
      const entry = this._findRunningByCellIndex(index);
      console.log('[ExecutionQueue] cellRun event, index:', index, 'execId:', execId, 'found entry:', entry?.language);
      if (entry && this.config.statusLineInOutput) {
        // Output block now exists - update status line
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          this._updateStatusLine(entry.execId);
        });
      }
    });

    // Listen for completion to process next in queue
    // Find the running entry by cellIndex across all languages
    this.executionManager.on('cellComplete', (index, result) => {
      const entry = this._findRunningByCellIndex(index);
      console.log('[ExecutionQueue] cellComplete event, index:', index, 'found entry:', entry?.language);
      if (entry) {
        this._onExecutionComplete(entry.language, entry.execId, true, null);
      }
    });

    this.executionManager.on('cellError', (index, error) => {
      const entry = this._findRunningByCellIndex(index);
      console.log('[ExecutionQueue] cellError event, index:', index, 'found entry:', entry?.language);
      if (entry) {
        this._onExecutionComplete(entry.language, entry.execId, false, error?.message || String(error));
      }
    });
  }

  /**
   * Find a running entry by cell index
   * @private
   */
  _findRunningByCellIndex(cellIndex) {
    for (const entry of this.runningByLanguage.values()) {
      if (entry.cellIndex === cellIndex) {
        return entry;
      }
    }
    return null;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Enqueue a cell for execution
   *
   * @param {number} cellIndex - Cell index to execute
   * @returns {string} The execution ID
   */
  enqueue(cellIndex) {
    const content = this.editor.getContent();
    const cell = getCellAtIndex(content, cellIndex);

    if (!cell) {
      throw new Error(`No cell at index ${cellIndex}`);
    }

    const language = cell.language;

    // Check if this cell is already queued or running (for this language)
    const languageQueue = this.queueByLanguage.get(language) || [];
    const existingQueued = languageQueue.find(e => e.cellIndex === cellIndex);
    if (existingQueued) {
      return existingQueued.execId; // Already queued
    }

    const runningForLang = this.runningByLanguage.get(language);
    if (runningForLang?.cellIndex === cellIndex) {
      return runningForLang.execId; // Already running
    }

    const execId = generateExecId();
    const entry = {
      execId,
      cellIndex,
      language,
      code: cell.code,
      queuedAt: Date.now(),
      status: 'queued',
      startedAt: null,
      completedAt: null,
      error: null
    };

    // Add to language-specific queue
    if (!this.queueByLanguage.has(language)) {
      this.queueByLanguage.set(language, []);
    }
    this.queueByLanguage.get(language).push(entry);

    // Update state
    this._updateStateFromQueue();

    // Emit event
    this._emit('queued', entry);
    this._emit('queueChanged', this.getQueueSnapshot());

    // Start processing for this language if not already
    this._processNext(language);

    return execId;
  }

  /**
   * Cancel an execution by execId
   *
   * @param {string} execId
   * @returns {boolean} Whether the cancellation was successful
   */
  cancel(execId) {
    // Check if it's currently running (in any language)
    for (const [language, entry] of this.runningByLanguage) {
      if (entry.execId === execId) {
        // Cancel via execution manager
        this.executionManager.cancel(entry.cellIndex);
        this._onExecutionComplete(language, execId, false, 'Cancelled');
        return true;
      }
    }

    // Check if it's in any queue
    for (const [language, queue] of this.queueByLanguage) {
      const idx = queue.findIndex(e => e.execId === execId);
      if (idx !== -1) {
        const entry = queue.splice(idx, 1)[0];
        entry.status = 'cancelled';
        entry.completedAt = Date.now();

        // Update cell status
        this.stateManager.setCellStatus(entry.cellIndex, {
          status: 'idle',
          queuePosition: null,
          execId: null
        });

        // Clear status line from output if exists
        this._clearStatusLine(execId);

        this._updateStateFromQueue();
        this._emit('cancelled', entry);
        this._emit('queueChanged', this.getQueueSnapshot());

        return true;
      }
    }

    return false;
  }

  /**
   * Cancel all queued and running executions
   */
  cancelAll() {
    // Cancel all running (across all languages)
    for (const entry of this.runningByLanguage.values()) {
      this.cancel(entry.execId);
    }

    // Cancel all queued (across all languages)
    for (const queue of this.queueByLanguage.values()) {
      const queued = [...queue];
      for (const entry of queued) {
        this.cancel(entry.execId);
      }
    }
  }

  /**
   * Get the current queue state (aggregated across all languages)
   *
   * @returns {{entries: QueueEntry[], running: Object|null, runningByLanguage: Object, total: number}}
   */
  getQueueSnapshot() {
    // Aggregate all queued entries
    const allEntries = [];
    for (const [language, queue] of this.queueByLanguage) {
      queue.forEach((e, i) => {
        allEntries.push({
          execId: e.execId,
          cellIndex: e.cellIndex,
          language: e.language,
          queuePosition: i + 1, // Position within this language's queue
          queuedAt: e.queuedAt
        });
      });
    }

    // Get all running entries
    const runningEntries = {};
    for (const [language, entry] of this.runningByLanguage) {
      runningEntries[language] = entry.execId;
    }

    // Count totals
    let totalQueued = 0;
    for (const queue of this.queueByLanguage.values()) {
      totalQueued += queue.length;
    }
    const totalRunning = this.runningByLanguage.size;

    return {
      entries: allEntries,
      running: Object.keys(runningEntries).length > 0 ? runningEntries : null,
      runningByLanguage: runningEntries,
      total: totalQueued + totalRunning
    };
  }

  /**
   * Get status string for display (e.g., "[1/3]")
   *
   * @param {string} execId
   * @returns {string}
   */
  getStatusString(execId) {
    // Find which language this execId belongs to
    for (const [language, entry] of this.runningByLanguage) {
      if (entry.execId === execId) {
        const queue = this.queueByLanguage.get(language) || [];
        const total = queue.length + 1; // +1 for running
        return `[status:running] [1/${total}]`;
      }
    }

    for (const [language, queue] of this.queueByLanguage) {
      const idx = queue.findIndex(e => e.execId === execId);
      if (idx !== -1) {
        const running = this.runningByLanguage.has(language) ? 1 : 0;
        const total = queue.length + running;
        const position = idx + 1 + running;
        return `[status:queued] [${position}/${total}]`;
      }
    }

    return '';
  }

  /**
   * Check if a cell is queued or running
   *
   * @param {number} cellIndex
   * @returns {{status: 'idle'|'queued'|'running', queuePosition: number|null, execId: string|null, language: string|null}}
   */
  getCellQueueStatus(cellIndex) {
    // Check if running in any language
    for (const [language, entry] of this.runningByLanguage) {
      if (entry.cellIndex === cellIndex) {
        return { status: 'running', queuePosition: null, execId: entry.execId, language };
      }
    }

    // Check if queued in any language
    for (const [language, queue] of this.queueByLanguage) {
      const idx = queue.findIndex(e => e.cellIndex === cellIndex);
      if (idx !== -1) {
        const entry = queue[idx];
        return {
          status: 'queued',
          queuePosition: idx + 1,
          execId: entry.execId,
          language
        };
      }
    }

    return { status: 'idle', queuePosition: null, execId: null, language: null };
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  /**
   * Subscribe to an event
   *
   * @param {'queued'|'started'|'completed'|'cancelled'|'error'|'queueChanged'} event
   * @param {function} handler
   * @returns {function} Unsubscribe function
   */
  on(event, handler) {
    if (this.handlers[event]) {
      this.handlers[event].push(handler);
    }
    return () => {
      const idx = this.handlers[event]?.indexOf(handler);
      if (idx >= 0) this.handlers[event].splice(idx, 1);
    };
  }

  /**
   * Emit an event
   * @private
   */
  _emit(event, ...args) {
    this.handlers[event]?.forEach(h => {
      try {
        h(...args);
      } catch (err) {
        console.error(`[ExecutionQueue] Error in ${event} handler:`, err);
      }
    });
  }

  // ===========================================================================
  // INTERNAL
  // ===========================================================================

  /**
   * Process the next item in the queue for a specific language
   * @private
   * @param {string} language - Language to process
   */
  async _processNext(language) {
    // Check if this language is already processing or running
    if (this.processingLanguages.has(language) || this.runningByLanguage.has(language)) {
      return;
    }

    const queue = this.queueByLanguage.get(language);
    if (!queue || queue.length === 0) {
      return;
    }

    this.processingLanguages.add(language);

    // Take the first item from the language's queue
    const entry = queue.shift();
    entry.status = 'running';
    entry.startedAt = Date.now();
    this.runningByLanguage.set(language, entry);

    // Update state
    this._updateStateFromQueue();

    // Update cell status
    this.stateManager.setCellStatus(entry.cellIndex, {
      status: 'running',
      queuePosition: null,
      execId: entry.execId,
      lastRunAt: entry.startedAt
    });

    // Note: Status line in output is updated via cellRun event listener
    // after the execution manager creates the output block

    this._emit('started', entry);
    this._emit('queueChanged', this.getQueueSnapshot());

    this.processingLanguages.delete(language);

    // Now trigger the actual execution via ExecutionManager
    // The execution manager will handle creating the output block
    try {
      console.log('[ExecutionQueue] Running cell', entry.cellIndex, 'language:', language);
      await this.executionManager.runCell(entry.cellIndex);
    } catch (err) {
      // Error handling is done via events
      console.error('[ExecutionQueue] Execution error:', err);
    }
  }

  /**
   * Handle execution completion
   * @private
   * @param {string} language - Language of the completed execution
   * @param {string} execId - Execution ID
   * @param {boolean} success - Whether execution succeeded
   * @param {string|null} errorMsg - Error message if failed
   */
  _onExecutionComplete(language, execId, success, errorMsg) {
    const entry = this.runningByLanguage.get(language);
    if (!entry || entry.execId !== execId) {
      console.warn('[ExecutionQueue] Completion for unknown execution:', language, execId);
      return; // Not our execution
    }

    console.log('[ExecutionQueue] Execution complete:', language, execId, success);

    entry.status = success ? 'completed' : 'error';
    entry.completedAt = Date.now();
    entry.error = errorMsg;

    // Update cell status
    this.stateManager.setCellStatus(entry.cellIndex, {
      status: success ? 'success' : 'error',
      queuePosition: null,
      execId: entry.execId,
      lastRunAt: entry.startedAt,
      error: errorMsg
    });

    // Clear status line from output
    if (this.config.statusLineInOutput) {
      this._clearStatusLine(execId);
    }

    // Clear running for this language
    this.runningByLanguage.delete(language);

    // Update state
    this._updateStateFromQueue();

    // Emit events
    if (success) {
      this._emit('completed', entry);
    } else {
      this._emit('error', entry);
    }
    this._emit('queueChanged', this.getQueueSnapshot());

    // Process next in queue for this language
    this._processNext(language);
  }

  /**
   * Update state manager from current queue
   * @private
   */
  _updateStateFromQueue() {
    const snapshot = this.getQueueSnapshot();
    this.stateManager.setQueue(snapshot);

    // Update cell statuses for queued items
    for (const entry of snapshot.entries) {
      this.stateManager.setCellStatus(entry.cellIndex, {
        status: 'queued',
        queuePosition: entry.queuePosition,
        execId: entry.execId
      });
    }

    // Update cell statuses for running items
    for (const [language, entry] of this.runningByLanguage) {
      this.stateManager.setCellStatus(entry.cellIndex, {
        status: 'running',
        queuePosition: null,
        execId: entry.execId,
        lastRunAt: entry.startedAt
      });
    }

    // Broadcast to collaborators via awareness
    this._broadcastAwareness();
  }

  /**
   * Update status line in output block
   * @private
   */
  _updateStatusLine(execId) {
    const content = this.editor.getContent();
    const outputBlock = findOutputBlockByExecId(content, execId);

    if (!outputBlock) {
      return; // Output block not created yet - will be handled by execution manager
    }

    const statusString = this.getStatusString(execId);
    if (!statusString) return;

    // Check if there's already a status line
    const existingStatusMatch = outputBlock.content.match(/^\[status:(queued|running)\] \[\d+\/\d+\]\n/);

    if (existingStatusMatch) {
      // Replace existing status line
      const newContent = outputBlock.content.replace(
        /^\[status:(queued|running)\] \[\d+\/\d+\]\n/,
        statusString + '\n'
      );
      this.editor.view.dispatch({
        changes: {
          from: outputBlock.contentStart,
          to: outputBlock.contentEnd,
          insert: newContent
        }
      });
    } else {
      // Insert status line at the beginning of output
      this.editor.view.dispatch({
        changes: {
          from: outputBlock.contentStart,
          insert: statusString + '\n'
        }
      });
    }
  }

  /**
   * Clear status line from output block
   * @private
   */
  _clearStatusLine(execId) {
    const content = this.editor.getContent();
    const outputBlock = findOutputBlockByExecId(content, execId);

    if (!outputBlock) {
      return;
    }

    // Remove status line if present
    const statusMatch = outputBlock.content.match(/^\[status:(queued|running|completed|error)\] \[\d+\/\d+\]\n/);
    if (statusMatch) {
      const newContent = outputBlock.content.replace(
        /^\[status:(queued|running|completed|error)\] \[\d+\/\d+\]\n/,
        ''
      );
      this.editor.view.dispatch({
        changes: {
          from: outputBlock.contentStart,
          to: outputBlock.contentEnd,
          insert: newContent
        }
      });
    }
  }

  /**
   * Broadcast queue state via Yjs Awareness
   * @private
   */
  _broadcastAwareness() {
    if (!this.awareness) return;

    const snapshot = this.getQueueSnapshot();

    // Set queue state in awareness
    // This allows other collaborators to see what cells we're running/queuing
    this.awareness.setLocalStateField('queue', {
      running: snapshot.running,
      entries: snapshot.entries.map(e => ({
        execId: e.execId,
        cellIndex: e.cellIndex,
        queuePosition: e.queuePosition
      })),
      total: snapshot.total,
      updatedAt: Date.now()
    });
  }

  /**
   * Get all remote queue states (from collaborators)
   * @returns {Array<{clientId: number, queue: Object}>}
   */
  getRemoteQueues() {
    if (!this.awareness) return [];

    const localClientId = this.awareness.clientID;
    const remoteQueues = [];

    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === localClientId) return;
      if (state.queue) {
        remoteQueues.push({ clientId, queue: state.queue });
      }
    });

    return remoteQueues;
  }

  /**
   * Check if a cell is running on any collaborator
   * @param {number} cellIndex
   * @returns {{isRunning: boolean, clientId: number|null}}
   */
  isCellRunningRemotely(cellIndex) {
    const remoteQueues = this.getRemoteQueues();

    for (const { clientId, queue } of remoteQueues) {
      // Check if running
      if (queue.entries?.some(e => e.cellIndex === cellIndex)) {
        return { isRunning: true, clientId };
      }
    }

    return { isRunning: false, clientId: null };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.cancelAll();

    // Clear awareness state
    if (this.awareness) {
      this.awareness.setLocalStateField('queue', null);
    }

    // Clear all queues
    this.queueByLanguage.clear();
    this.runningByLanguage.clear();
    this.processingLanguages.clear();

    this.handlers = {
      queued: [],
      started: [],
      completed: [],
      cancelled: [],
      error: [],
      queueChanged: []
    };
  }
}

/**
 * Create an execution queue
 *
 * @param {Object} options
 * @param {ExecutionManager} options.executionManager
 * @param {StateManager} options.stateManager
 * @param {Object} options.editor
 * @param {Object} [options.config]
 * @returns {ExecutionQueue}
 */
export function createExecutionQueue(options) {
  return new ExecutionQueue(options);
}
