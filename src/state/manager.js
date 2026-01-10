/**
 * @fileoverview State manager
 *
 * Manages editor state - the observable, derived data that reflects
 * what's happening in the editor. State is read-only from the user's
 * perspective; the editor updates it internally.
 */

import { getInitialState, INITIAL_RUNTIME_STATE, INITIAL_QUEUE_STATE, INITIAL_CELL_STATUS } from './schema.js';

/**
 * @typedef {import('./schema.js').EditorState} EditorState
 * @typedef {import('./schema.js').ConnectionState} ConnectionState
 * @typedef {import('./schema.js').DocumentState} DocumentState
 * @typedef {import('./schema.js').RuntimeState} RuntimeState
 * @typedef {import('./schema.js').SessionState} SessionState
 * @typedef {import('./schema.js').VariableInfo} VariableInfo
 * @typedef {import('./schema.js').ExecutionRecord} ExecutionRecord
 * @typedef {import('./schema.js').CollaboratorInfo} CollaboratorInfo
 * @typedef {import('./schema.js').CurrentExecution} CurrentExecution
 * @typedef {import('./schema.js').QueueState} QueueState
 * @typedef {import('./schema.js').QueueEntry} QueueEntry
 * @typedef {import('./schema.js').CellStatusInfo} CellStatusInfo
 */

/**
 * State change event
 * @typedef {Object} StateChangeEvent
 * @property {string} path - Dot-separated path to changed property
 * @property {any} value - New value
 * @property {any} [oldValue] - Previous value
 */

/**
 * State manager - internal API for updating state
 * Users get a read-only proxy; the editor uses this manager to update.
 */
export class StateManager {
  constructor() {
    /** @type {EditorState} */
    this._state = getInitialState();

    /** @type {Set<(event: StateChangeEvent) => void>} */
    this._listeners = new Set();

    /** @type {Map<string, Set<(value: any) => void>>} */
    this._pathListeners = new Map();

    /** @type {number} */
    this._executionIdCounter = 0;
  }

  // ===========================================================================
  // READ-ONLY PROXY
  // ===========================================================================

  /**
   * Get a read-only proxy of the state
   * @returns {EditorState}
   */
  getReadOnlyProxy() {
    return this._createReadOnlyProxy(this._state);
  }

  /**
   * Create a read-only proxy for an object
   * @param {Object} obj
   * @param {string[]} [path]
   * @returns {Object}
   */
  _createReadOnlyProxy(obj, path = []) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    const self = this;

    return new Proxy(obj, {
      get(target, prop) {
        // Special method to subscribe to this specific path
        if (prop === '_subscribe') {
          return (listener) => self._subscribeToPath(path.join('.') || '*', listener);
        }

        const value = target[prop];

        // Recursively proxy nested objects
        if (value !== null && typeof value === 'object') {
          return self._createReadOnlyProxy(value, [...path, String(prop)]);
        }

        return value;
      },

      set() {
        console.warn('[State] State is read-only. Use editor methods to change state.');
        return false;
      },

      deleteProperty() {
        console.warn('[State] State is read-only. Cannot delete properties.');
        return false;
      }
    });
  }

  // ===========================================================================
  // SUBSCRIPTIONS
  // ===========================================================================

  /**
   * Subscribe to all state changes
   * @param {(event: StateChangeEvent) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Subscribe to changes at a specific path
   * @param {string} path - Dot-separated path (e.g., 'connection.status')
   * @param {(value: any) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  _subscribeToPath(path, listener) {
    if (!this._pathListeners.has(path)) {
      this._pathListeners.set(path, new Set());
    }
    this._pathListeners.get(path).add(listener);
    return () => this._pathListeners.get(path)?.delete(listener);
  }

  /**
   * Subscribe to changes at a specific path (public API)
   * @param {string} path
   * @param {(value: any) => void} listener
   * @returns {() => void}
   */
  onPath(path, listener) {
    return this._subscribeToPath(path, listener);
  }

  /**
   * Emit a state change
   * @param {string} path
   * @param {any} value
   * @param {any} [oldValue]
   */
  _emit(path, value, oldValue) {
    const event = { path, value, oldValue };

    // Global listeners
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[StateManager] Listener error:', err);
      }
    }

    // Path-specific listeners
    const pathListeners = this._pathListeners.get(path);
    if (pathListeners) {
      for (const listener of pathListeners) {
        try {
          listener(value);
        } catch (err) {
          console.error('[StateManager] Path listener error:', err);
        }
      }
    }

    // Also notify listeners of parent paths
    const parts = path.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      const parentListeners = this._pathListeners.get(parentPath);
      if (parentListeners) {
        const parentValue = this._getAtPath(parentPath);
        for (const listener of parentListeners) {
          try {
            listener(parentValue);
          } catch (err) {
            console.error('[StateManager] Parent listener error:', err);
          }
        }
      }
    }
  }

  /**
   * Get value at path
   * @param {string} path
   * @returns {any}
   */
  _getAtPath(path) {
    const parts = path.split('.');
    let current = this._state;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  // ===========================================================================
  // CONNECTION STATE
  // ===========================================================================

  /**
   * Update connection status
   * @param {ConnectionState['status']} status
   * @param {Object} [extra] - Additional properties
   */
  setConnectionStatus(status, extra = {}) {
    const old = this._state.connection.status;
    this._state.connection.status = status;

    if (status === 'connected') {
      this._state.connection.lastConnected = Date.now();
      this._state.connection.error = undefined;
    }

    if (extra.error) {
      this._state.connection.error = extra.error;
    }
    if (extra.latency !== undefined) {
      this._state.connection.latency = extra.latency;
    }
    if (extra.reconnectAttempts !== undefined) {
      this._state.connection.reconnectAttempts = extra.reconnectAttempts;
    }

    this._emit('connection.status', status, old);
  }

  /**
   * Update connection latency
   * @param {number} latency
   */
  setConnectionLatency(latency) {
    const old = this._state.connection.latency;
    this._state.connection.latency = latency;
    this._emit('connection.latency', latency, old);
  }

  // ===========================================================================
  // DOCUMENT STATE
  // ===========================================================================

  /**
   * Update document stats
   * @param {Partial<DocumentState>} updates
   */
  updateDocument(updates) {
    for (const [key, value] of Object.entries(updates)) {
      const old = this._state.document[key];
      if (old !== value) {
        this._state.document[key] = value;
        this._emit(`document.${key}`, value, old);
      }
    }
  }

  /**
   * Set dirty flag
   * @param {boolean} dirty
   */
  setDirty(dirty) {
    this.updateDocument({ dirty, lastModified: Date.now() });
  }

  /**
   * Update undo/redo state
   * @param {Object} undoState
   * @param {boolean} undoState.canUndo
   * @param {boolean} undoState.canRedo
   * @param {number} [undoState.undoDepth]
   * @param {number} [undoState.redoDepth]
   */
  updateUndoState(undoState) {
    this.updateDocument(undoState);
  }

  // ===========================================================================
  // RUNTIME STATE
  // ===========================================================================

  /**
   * Add or update a runtime
   * @param {string} name
   * @param {Partial<RuntimeState>} state
   */
  setRuntime(name, state) {
    const existing = this._state.runtimes[name];
    this._state.runtimes[name] = {
      ...INITIAL_RUNTIME_STATE,
      ...existing,
      ...state
    };
    this._emit(`runtimes.${name}`, this._state.runtimes[name], existing);
  }

  /**
   * Update runtime status
   * @param {string} name
   * @param {RuntimeState['status']} status
   * @param {string} [error]
   */
  setRuntimeStatus(name, status, error) {
    if (!this._state.runtimes[name]) {
      this._state.runtimes[name] = { ...INITIAL_RUNTIME_STATE };
    }
    const old = this._state.runtimes[name].status;
    this._state.runtimes[name].status = status;
    if (error !== undefined) {
      this._state.runtimes[name].error = error;
    }
    this._emit(`runtimes.${name}.status`, status, old);
  }

  /**
   * Remove a runtime
   * @param {string} name
   */
  removeRuntime(name) {
    const old = this._state.runtimes[name];
    delete this._state.runtimes[name];
    this._emit(`runtimes.${name}`, undefined, old);
  }

  // ===========================================================================
  // SESSION STATE
  // ===========================================================================

  /**
   * Add or update a session
   * @param {string} id
   * @param {SessionState} state
   */
  setSession(id, state) {
    const old = this._state.sessions[id];
    this._state.sessions[id] = state;
    this._emit(`sessions.${id}`, state, old);
  }

  /**
   * Increment session execution count
   * @param {string} id
   */
  incrementSessionCount(id) {
    if (this._state.sessions[id]) {
      this._state.sessions[id].executionCount++;
      this._state.sessions[id].lastActivity = Date.now();
      this._emit(`sessions.${id}`, this._state.sessions[id]);
    }
  }

  /**
   * Remove a session
   * @param {string} id
   */
  removeSession(id) {
    const old = this._state.sessions[id];
    delete this._state.sessions[id];
    delete this._state.variables[id];
    this._emit(`sessions.${id}`, undefined, old);
  }

  // ===========================================================================
  // VARIABLES
  // ===========================================================================

  /**
   * Set variables for a session
   * @param {string} sessionId
   * @param {Record<string, VariableInfo>} variables
   */
  setVariables(sessionId, variables) {
    const old = this._state.variables[sessionId];
    this._state.variables[sessionId] = variables;
    this._emit(`variables.${sessionId}`, variables, old);
  }

  /**
   * Update a single variable
   * @param {string} sessionId
   * @param {string} name
   * @param {VariableInfo} info
   */
  setVariable(sessionId, name, info) {
    if (!this._state.variables[sessionId]) {
      this._state.variables[sessionId] = {};
    }
    const old = this._state.variables[sessionId][name];
    this._state.variables[sessionId][name] = info;
    this._emit(`variables.${sessionId}.${name}`, info, old);
  }

  /**
   * Clear variables for a session
   * @param {string} sessionId
   */
  clearVariables(sessionId) {
    const old = this._state.variables[sessionId];
    delete this._state.variables[sessionId];
    this._emit(`variables.${sessionId}`, undefined, old);
  }

  // ===========================================================================
  // EXECUTION HISTORY
  // ===========================================================================

  /**
   * Add an execution record
   * @param {Omit<ExecutionRecord, 'id'>} record
   * @returns {string} Record ID
   */
  addExecution(record) {
    const id = `exec_${++this._executionIdCounter}_${Date.now()}`;
    const fullRecord = { ...record, id };
    this._state.history.push(fullRecord);

    // Keep history bounded (last 100)
    if (this._state.history.length > 100) {
      this._state.history.shift();
    }

    this._emit('history', this._state.history);
    return id;
  }

  /**
   * Clear execution history
   */
  clearHistory() {
    this._state.history = [];
    this._emit('history', []);
  }

  // ===========================================================================
  // CURRENT EXECUTION
  // ===========================================================================

  /**
   * Set current execution
   * @param {CurrentExecution | null} execution
   */
  setExecution(execution) {
    const old = this._state.execution;
    this._state.execution = execution;
    this._emit('execution', execution, old);
  }

  /**
   * Update execution progress
   * @param {number} progress - 0 to 1
   * @param {string} [progressText]
   */
  updateExecutionProgress(progress, progressText) {
    if (this._state.execution) {
      this._state.execution.progress = progress;
      if (progressText) {
        this._state.execution.progressText = progressText;
      }
      this._emit('execution', this._state.execution);
    }
  }

  // ===========================================================================
  // EXECUTION QUEUE
  // ===========================================================================

  /**
   * Set the entire queue state
   * @param {QueueState} queueState
   */
  setQueue(queueState) {
    const old = this._state.queue;
    this._state.queue = queueState;
    this._emit('queue', queueState, old);
  }

  /**
   * Add an entry to the queue
   * @param {QueueEntry} entry
   */
  addToQueue(entry) {
    this._state.queue.entries.push(entry);
    this._state.queue.total = this._state.queue.entries.length + (this._state.queue.running ? 1 : 0);
    this._emit('queue', this._state.queue);
    this._emit('queue.entries', this._state.queue.entries);
  }

  /**
   * Remove an entry from the queue by execId
   * @param {string} execId
   */
  removeFromQueue(execId) {
    const idx = this._state.queue.entries.findIndex(e => e.execId === execId);
    if (idx !== -1) {
      this._state.queue.entries.splice(idx, 1);
      // Recalculate queue positions
      this._state.queue.entries.forEach((e, i) => {
        e.queuePosition = i + 1;
      });
      this._state.queue.total = this._state.queue.entries.length + (this._state.queue.running ? 1 : 0);
      this._emit('queue', this._state.queue);
      this._emit('queue.entries', this._state.queue.entries);
    }
  }

  /**
   * Set the currently running execution
   * @param {string|null} execId
   */
  setQueueRunning(execId) {
    const old = this._state.queue.running;
    this._state.queue.running = execId;
    this._state.queue.total = this._state.queue.entries.length + (execId ? 1 : 0);
    this._emit('queue.running', execId, old);
    this._emit('queue', this._state.queue);
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    this._state.queue = { ...INITIAL_QUEUE_STATE };
    this._emit('queue', this._state.queue);
  }

  /**
   * Get queue state
   * @returns {QueueState}
   */
  getQueue() {
    return this._state.queue;
  }

  // ===========================================================================
  // CELL STATUS
  // ===========================================================================

  /**
   * Set status for a cell
   * @param {number} cellIndex
   * @param {Partial<CellStatusInfo>} status
   */
  setCellStatus(cellIndex, status) {
    const existing = this._state.cellStatus[cellIndex] || { ...INITIAL_CELL_STATUS };
    const updated = { ...existing, ...status };
    const old = this._state.cellStatus[cellIndex];
    this._state.cellStatus[cellIndex] = updated;
    this._emit(`cellStatus.${cellIndex}`, updated, old);
    this._emit('cellStatus', this._state.cellStatus);
  }

  /**
   * Get status for a cell
   * @param {number} cellIndex
   * @returns {CellStatusInfo}
   */
  getCellStatus(cellIndex) {
    return this._state.cellStatus[cellIndex] || { ...INITIAL_CELL_STATUS };
  }

  /**
   * Clear status for a cell (reset to idle)
   * @param {number} cellIndex
   */
  clearCellStatus(cellIndex) {
    const old = this._state.cellStatus[cellIndex];
    delete this._state.cellStatus[cellIndex];
    this._emit(`cellStatus.${cellIndex}`, undefined, old);
    this._emit('cellStatus', this._state.cellStatus);
  }

  /**
   * Clear all cell statuses
   */
  clearAllCellStatus() {
    this._state.cellStatus = {};
    this._emit('cellStatus', {});
  }

  /**
   * Get all cell statuses
   * @returns {Record<number, CellStatusInfo>}
   */
  getAllCellStatus() {
    return this._state.cellStatus;
  }

  // ===========================================================================
  // COLLABORATORS
  // ===========================================================================

  /**
   * Update collaborators list
   * @param {CollaboratorInfo[]} collaborators
   */
  setCollaborators(collaborators) {
    const old = this._state.collaborators;
    this._state.collaborators = collaborators;
    this._emit('collaborators', collaborators, old);
  }

  // ===========================================================================
  // AI STATE
  // ===========================================================================

  /**
   * Set AI endpoint status
   * @param {string} id
   * @param {'unconfigured' | 'available' | 'error'} status
   * @param {string} [error]
   */
  setAIEndpointStatus(id, status, error) {
    if (!this._state.ai.endpoints[id]) {
      this._state.ai.endpoints[id] = { status: 'unconfigured' };
    }
    const old = this._state.ai.endpoints[id].status;
    this._state.ai.endpoints[id].status = status;
    if (error !== undefined) {
      this._state.ai.endpoints[id].error = error;
    }
    this._emit(`ai.endpoints.${id}.status`, status, old);
  }

  /**
   * Set active AI endpoint
   * @param {string | undefined} id
   */
  setActiveAIEndpoint(id) {
    const old = this._state.ai.activeEndpoint;
    this._state.ai.activeEndpoint = id;
    this._emit('ai.activeEndpoint', id, old);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Get raw state (for serialization)
   * @returns {EditorState}
   */
  getRawState() {
    return this._state;
  }

  /**
   * Reset to initial state
   */
  reset() {
    this._state = getInitialState();
    this._emit('*', this._state);
  }
}

/**
 * Create a new state manager
 * @returns {StateManager}
 */
export function createStateManager() {
  return new StateManager();
}
