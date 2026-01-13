/**
 * @fileoverview Shell State Manager
 *
 * Manages state for shell components (file info, environment, orchestrator status).
 * Works alongside the editor's StateManager but for shell-specific concerns.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * @typedef {Object} FileContext
 * @property {string} name - File name without extension
 * @property {string} path - Relative path from docs root (with extension)
 * @property {string} fullPath - Full absolute path
 * @property {string} root - Docs root directory
 * @property {boolean} isOutsideProject - Whether file is outside the project
 * @property {boolean} dirty - Has unsaved changes
 */

/**
 * @typedef {Object} RuntimeContext
 * @property {string} language
 * @property {string} version
 * @property {string|null} venv
 * @property {string|null} venvName
 * @property {string} cwd
 * @property {string} executable
 * @property {'ready'|'starting'|'stopped'|'error'} status
 * @property {string|null} error
 */

/**
 * @typedef {Object} OrchestratorContext
 * @property {'connected'|'disconnected'|'error'} status
 * @property {string} url
 * @property {string|null} error
 * @property {Record<string, {status: string, running: boolean}>} services
 */

/**
 * @typedef {Object} ShellState
 * @property {string} projectRoot
 * @property {FileContext|null} file
 * @property {Record<string, RuntimeContext>} runtimes
 * @property {OrchestratorContext} orchestrator
 */

// =============================================================================
// INITIAL STATE
// =============================================================================

/**
 * @returns {ShellState}
 */
function getInitialState() {
  return {
    projectRoot: '',
    file: null,
    theme: null, // null = auto, or theme name
    runtimes: {
      // Legacy: single Python runtime info (for backward compat)
      python: null,
      // New: multiple runtime sessions
      sessions: {
        // 'shared': { id, url, status, venv, cwd, ... }
        // 'python-8001': { id, url, status, venv, cwd, dedicated: true, port: 8001 }
      },
      // Document → session attachment
      attachments: {
        // 'my-notebook': 'shared'
        // 'data-analysis': 'python-8001'
      },
    },
    orchestrator: {
      status: 'disconnected',
      url: '',
      error: null,
      services: {},
    },
    ai: null, // AI assistant state
  };
}

// =============================================================================
// SHELL STATE MANAGER
// =============================================================================

export class ShellStateManager {
  /**
   * @param {import('./orchestrator-client.js').OrchestratorClient} orchestratorClient
   */
  constructor(orchestratorClient) {
    this._client = orchestratorClient;
    this._state = getInitialState();
    this._listeners = new Map(); // path -> Set<callback>
    this._globalListeners = new Set();
    this._unsubscribeOrchestrator = null;
  }

  // ===========================================================================
  // State Access
  // ===========================================================================

  /**
   * Get the full state
   * @returns {ShellState}
   */
  getState() {
    return this._state;
  }

  /**
   * Get a value at a path
   * @param {string} path - Dot-separated path (e.g., 'file.name', 'runtimes.python.version')
   * @returns {*}
   */
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  // ===========================================================================
  // State Updates
  // ===========================================================================

  /**
   * Update state at a path
   * @param {string} path - Dot-separated path
   * @param {*} value - New value
   */
  _set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();

    let obj = this._state;
    for (const key of keys) {
      if (obj[key] === undefined) {
        obj[key] = {};
      }
      obj = obj[key];
    }

    const oldValue = obj[lastKey];
    obj[lastKey] = value;

    // Notify listeners
    this._notifyPath(path, value, oldValue);
  }

  /**
   * Update multiple paths at once
   * @param {Record<string, *>} updates - Path -> value mapping
   */
  _setMultiple(updates) {
    for (const [path, value] of Object.entries(updates)) {
      this._set(path, value);
    }
  }

  /**
   * Merge an object into a path
   * @param {string} path
   * @param {Object} obj
   */
  _merge(path, obj) {
    const current = this.get(path) || {};
    this._set(path, { ...current, ...obj });
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to changes at a specific path
   * @param {string} path - Dot-separated path
   * @param {(newValue: *, oldValue: *) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onPath(path, callback) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }
    this._listeners.get(path).add(callback);

    // Immediately call with current value
    callback(this.get(path), undefined);

    return () => {
      const listeners = this._listeners.get(path);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this._listeners.delete(path);
        }
      }
    };
  }

  /**
   * Subscribe to all state changes
   * @param {(state: ShellState) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onChange(callback) {
    this._globalListeners.add(callback);
    callback(this._state);
    return () => this._globalListeners.delete(callback);
  }

  /**
   * Notify listeners of a change
   * @private
   */
  _notifyPath(path, newValue, oldValue) {
    // Notify exact path listeners
    const listeners = this._listeners.get(path);
    if (listeners) {
      listeners.forEach(cb => cb(newValue, oldValue));
    }

    // Notify parent path listeners (e.g., 'file' when 'file.name' changes)
    const parts = path.split('.');
    while (parts.length > 1) {
      parts.pop();
      const parentPath = parts.join('.');
      const parentListeners = this._listeners.get(parentPath);
      if (parentListeners) {
        const parentValue = this.get(parentPath);
        parentListeners.forEach(cb => cb(parentValue, undefined));
      }
    }

    // Notify global listeners
    this._globalListeners.forEach(cb => cb(this._state));
  }

  // ===========================================================================
  // Orchestrator Integration
  // ===========================================================================

  /**
   * Start syncing with the orchestrator
   */
  async startSync() {
    this._state.orchestrator.url = this._client.baseUrl;

    // Subscribe to orchestrator status changes
    this._unsubscribeOrchestrator = this._client.subscribe((status) => {
      if (status === null) {
        this._set('orchestrator.status', 'disconnected');
        this._set('orchestrator.error', 'Connection lost');
      } else {
        this._updateFromOrchestratorStatus(status);
      }
    });

    // Start polling
    this._client.startPolling();

    // Initial fetch
    await this.refresh();
  }

  /**
   * Stop syncing with the orchestrator
   */
  stopSync() {
    if (this._unsubscribeOrchestrator) {
      this._unsubscribeOrchestrator();
      this._unsubscribeOrchestrator = null;
    }
    this._client.stopPolling();
  }

  /**
   * Refresh state from orchestrator
   */
  async refresh() {
    try {
      // Fetch status and environment in parallel
      const [status, env] = await Promise.all([
        this._client.getStatus(),
        this._client.getEnvironment(),
      ]);

      this._updateFromOrchestratorStatus(status);
      this._updateFromEnvironment(env);

      this._set('orchestrator.status', 'connected');
      this._set('orchestrator.error', null);
    } catch (error) {
      this._set('orchestrator.status', 'error');
      this._set('orchestrator.error', error.message);
    }
  }

  /**
   * Update state from orchestrator status
   * @private
   */
  _updateFromOrchestratorStatus(status) {
    // Update services
    const services = {};

    if (status.sync) {
      services['mrmd-sync'] = {
        status: status.sync.running ? 'running' : 'stopped',
        running: status.sync.running,
        url: status.sync.url,
      };
    }

    for (const [lang, info] of Object.entries(status.runtimes || {})) {
      services[`mrmd-${lang}`] = {
        status: info.running ? 'running' : 'stopped',
        running: info.running,
        url: info.url,
      };
    }

    this._set('orchestrator.services', services);
    this._set('orchestrator.status', 'connected');
  }

  /**
   * Update state from environment info
   * @private
   */
  _updateFromEnvironment(env) {
    this._set('projectRoot', env.project_root);

    if (env.python) {
      this._set('runtimes.python', {
        language: 'python',
        version: env.python.version,
        venv: env.python.venv,
        venvName: env.python.venv_name,
        cwd: env.python.cwd,
        executable: env.python.executable,
        status: env.python.status,
        error: null,
      });
    }
  }

  // ===========================================================================
  // File Management
  // ===========================================================================

  /**
   * Set the current file context
   * @param {Object} options
   * @param {string} options.name - File name
   * @param {string} options.path - Relative path
   * @param {string} options.root - Docs root
   */
  setFile(options) {
    const { name, path, root } = options;

    // Determine if outside project
    const projectRoot = this.get('projectRoot');
    let isOutsideProject = false;

    if (projectRoot) {
      // If we have an absolute path, check if it's within project
      if (options.fullPath) {
        isOutsideProject = !options.fullPath.startsWith(projectRoot);
      }
    }

    this._set('file', {
      name: name || path?.replace(/\.md$/, '').split('/').pop() || '',
      path: path || '',
      fullPath: options.fullPath || `${root}/${path}`,
      root: root || '',
      isOutsideProject,
      dirty: false,
    });
  }

  /**
   * Mark the current file as dirty/clean
   * @param {boolean} dirty
   */
  setFileDirty(dirty) {
    if (this._state.file) {
      this._set('file.dirty', dirty);
    }
  }

  // ===========================================================================
  // Environment Management
  // ===========================================================================

  /**
   * Change the Python virtual environment
   * @param {string|null} venvPath - Path to venv, or null for system Python
   */
  async setVenv(venvPath) {
    // Optimistically update UI
    this._set('runtimes.python.status', 'starting');

    try {
      const result = await this._client.updateEnvironment({ venv: venvPath || '' });

      if (result.environment) {
        this._set('runtimes.python', {
          ...this.get('runtimes.python'),
          venv: result.environment.venv,
          venvName: result.environment.venv_name,
          version: result.environment.version,
          executable: result.environment.executable,
          status: result.environment.status,
          error: null,
        });
      }
    } catch (error) {
      this._merge('runtimes.python', {
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Change the working directory
   * @param {string} cwd - Path to working directory
   */
  async setCwd(cwd) {
    this._set('runtimes.python.status', 'starting');

    try {
      const result = await this._client.updateEnvironment({ cwd });

      if (result.environment) {
        this._merge('runtimes.python', {
          cwd: result.environment.cwd,
          status: result.environment.status,
          error: null,
        });
      }
    } catch (error) {
      this._merge('runtimes.python', {
        status: 'error',
        error: error.message,
      });
      throw error;
    }
  }

  // ===========================================================================
  // Runtime Session Management
  // ===========================================================================

  /**
   * Get the session attached to a document
   * @param {string} docName - Document name
   * @returns {string} Session ID (defaults to 'shared')
   */
  getDocumentSession(docName) {
    return this.get(`runtimes.attachments.${docName}`) || 'shared';
  }

  /**
   * Get session info
   * @param {string} sessionId - Session ID
   * @returns {Object|null}
   */
  getSession(sessionId) {
    return this.get(`runtimes.sessions.${sessionId}`) || null;
  }

  /**
   * Get all available sessions
   * @returns {Array<{id: string, info: Object}>}
   */
  getSessions() {
    const sessions = this.get('runtimes.sessions') || {};
    return Object.entries(sessions).map(([id, info]) => ({ id, info }));
  }

  /**
   * Attach a document to a session
   * @param {string} docName - Document name
   * @param {string} sessionId - Session ID to attach to
   */
  attachDocument(docName, sessionId) {
    this._set(`runtimes.attachments.${docName}`, sessionId);
  }

  /**
   * Register a runtime session
   * @param {string} sessionId - Session ID
   * @param {Object} info - Session info (url, status, venv, cwd, etc.)
   */
  registerSession(sessionId, info) {
    this._set(`runtimes.sessions.${sessionId}`, info);

    // Also update legacy python state if this is the shared session
    if (sessionId === 'shared' && info.language === 'python') {
      this._set('runtimes.python', {
        language: 'python',
        version: info.version,
        venv: info.venv,
        venvName: info.venvName,
        cwd: info.cwd,
        executable: info.executable,
        status: info.status,
        error: null,
      });
    }
  }

  /**
   * Create a new dedicated runtime session
   * @param {string} docName - Document to attach the session to
   * @param {'shared'|'dedicated'} mode - Runtime mode
   * @param {string} [venv] - Path to virtual environment (for dedicated runtimes)
   * @returns {Promise<Object>} Session info
   */
  async createSession(docName, mode = 'dedicated', venv = null) {
    try {
      const result = await this._client.createSession(docName, mode, venv);

      const sessionId = result.id || (mode === 'dedicated' ? `python-${result.runtimes?.python?.port || Date.now()}` : 'shared');

      const sessionInfo = {
        id: sessionId,
        url: result.runtimes?.python?.url || result.sync,
        status: 'ready',
        dedicated: mode === 'dedicated',
        port: result.runtimes?.python?.port,
        venv: result.runtimes?.python?.venv || venv,
        language: 'python',
        docName,
      };

      // Register the session
      this.registerSession(sessionId, sessionInfo);

      // Attach the document to this session
      this.attachDocument(docName, sessionId);

      return sessionInfo;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Get the runtime URL for a document
   * @param {string} docName - Document name
   * @returns {string|null} Runtime URL
   */
  getRuntimeUrl(docName) {
    const sessionId = this.getDocumentSession(docName);
    const session = this.getSession(sessionId);
    return session?.url || null;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up resources
   */
  destroy() {
    this.stopSync();
    this._listeners.clear();
    this._globalListeners.clear();
  }
}

/**
 * Create a shell state manager
 * @param {import('./orchestrator-client.js').OrchestratorClient} orchestratorClient
 * @returns {ShellStateManager}
 */
export function createShellState(orchestratorClient) {
  return new ShellStateManager(orchestratorClient);
}
