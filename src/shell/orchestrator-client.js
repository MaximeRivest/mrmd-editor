/**
 * @fileoverview HTTP client for mrmd-orchestrator API
 *
 * Provides methods to interact with the orchestrator's endpoints
 * for file management, environment configuration, and service status.
 */

// =============================================================================
// ORCHESTRATOR CLIENT
// =============================================================================

/**
 * @typedef {Object} FileEntry
 * @property {string} name - File name (without extension for .md files)
 * @property {string} path - Relative path from docs root
 * @property {'file'|'directory'} type
 * @property {number} [size] - File size in bytes
 * @property {number} [modified] - Last modified timestamp
 */

/**
 * @typedef {Object} PythonEnvironment
 * @property {string} version
 * @property {string} executable
 * @property {string|null} venv
 * @property {string|null} venv_name
 * @property {string} cwd
 * @property {'ready'|'starting'|'stopped'|'error'} status
 */

/**
 * @typedef {Object} EnvironmentInfo
 * @property {PythonEnvironment|null} python
 * @property {string} project_root
 */

/**
 * @typedef {Object} ServiceStatus
 * @property {boolean} managed
 * @property {string} url
 * @property {boolean} running
 */

/**
 * @typedef {Object} OrchestratorStatus
 * @property {boolean} started
 * @property {ServiceStatus} sync
 * @property {Record<string, ServiceStatus>} runtimes
 * @property {Record<string, {running: boolean}>} monitors
 */

export class OrchestratorClient {
  /**
   * @param {string} baseUrl - Orchestrator HTTP URL
   */
  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this._listeners = new Set();
    this._pollInterval = null;
    this._lastStatus = null;
  }

  // ===========================================================================
  // Core HTTP Methods
  // ===========================================================================

  /**
   * Make an HTTP request to the orchestrator
   * @private
   */
  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to orchestrator at ${this.baseUrl}`);
      }
      throw error;
    }
  }

  // ===========================================================================
  // Status & Health
  // ===========================================================================

  /**
   * Check if orchestrator is reachable
   * @returns {Promise<boolean>}
   */
  async isReachable() {
    try {
      await this._fetch('/health');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get orchestrator status
   * @returns {Promise<OrchestratorStatus>}
   */
  async getStatus() {
    return this._fetch('/api/status');
  }

  /**
   * Get service URLs
   * @returns {Promise<{sync: string, runtimes: Record<string, string>, editor: string|null}>}
   */
  async getUrls() {
    return this._fetch('/api/urls');
  }

  // ===========================================================================
  // File Management
  // ===========================================================================

  /**
   * List files in the docs directory
   * @param {Object} options
   * @param {string} [options.path=''] - Subdirectory to list
   * @param {boolean} [options.recursive=false] - List recursively
   * @returns {Promise<{files: FileEntry[], path: string, root: string}>}
   */
  async listFiles(options = {}) {
    const params = new URLSearchParams();
    if (options.path) params.set('path', options.path);
    if (options.recursive) params.set('recursive', 'true');

    const query = params.toString();
    return this._fetch(`/api/files${query ? '?' + query : ''}`);
  }

  /**
   * Create a new file
   * @param {string} name - File name (can include subdirectory path)
   * @param {string} [content] - Initial content
   * @returns {Promise<{name: string, path: string}>}
   */
  async createFile(name, content) {
    return this._fetch('/api/files', {
      method: 'POST',
      body: JSON.stringify({ name, content }),
    });
  }

  /**
   * Rename a file
   * @param {string} fromPath - Current path (relative to docs)
   * @param {string} toPath - New path (relative to docs)
   * @returns {Promise<{success: boolean, from_path: string, to_path: string}>}
   */
  async renameFile(fromPath, toPath) {
    return this._fetch('/api/files/rename', {
      method: 'POST',
      body: JSON.stringify({ from_path: fromPath, to_path: toPath }),
    });
  }

  /**
   * Copy a file (Save As)
   * @param {string} fromPath - Source path (relative to docs)
   * @param {string} toPath - Destination path (relative or absolute)
   * @returns {Promise<{success: boolean, from_path: string, to_path: string, in_project: boolean, synced: boolean}>}
   */
  async copyFile(fromPath, toPath) {
    return this._fetch('/api/files/copy', {
      method: 'POST',
      body: JSON.stringify({ from_path: fromPath, to_path: toPath }),
    });
  }

  /**
   * Delete a file
   * @param {string} path - File path (relative to docs)
   * @returns {Promise<{status: string, path: string}>}
   */
  async deleteFile(path) {
    return this._fetch(`/api/files/${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
  }

  // ===========================================================================
  // Filesystem Browsing
  // ===========================================================================

  /**
   * Browse the filesystem
   * @param {Object} options
   * @param {string} [options.path='~'] - Directory to browse
   * @param {'all'|'dir'|'file'} [options.type='all'] - Filter by type
   * @param {boolean} [options.showHidden=false] - Show hidden files
   * @returns {Promise<{entries: FileEntry[], path: string, parent: string|null}>}
   */
  async browse(options = {}) {
    const params = new URLSearchParams();
    if (options.path) params.set('path', options.path);
    if (options.type) params.set('type', options.type);
    if (options.showHidden) params.set('show_hidden', 'true');

    const query = params.toString();
    return this._fetch(`/api/browse${query ? '?' + query : ''}`);
  }

  // ===========================================================================
  // Machine Catalog (multi-machine sync)
  // ===========================================================================

  /**
   * Get catalog of files across all connected machines.
   * @param {Object} [options]
   * @param {string} [options.project] - Filter to a specific project
   * @returns {Promise<{userId: string, machines: Array, cloudOnlyProjects?: string[]}>}
   */
  async getCatalog(options = {}) {
    const params = new URLSearchParams();
    if (options.project) params.set('project', options.project);
    const query = params.toString();
    return this._fetch(`/api/catalog${query ? '?' + query : ''}`);
  }

  /**
   * Get list of connected machines.
   * @returns {Promise<{userId: string, machines: Array}>}
   */
  async getMachines() {
    return this._fetch('/api/machines');
  }

  /**
   * Get currently active runtime machine.
   * @returns {Promise<{activeMachineId: string|null, provider: Object|null}>}
   */
  async getActiveMachine() {
    return this._fetch('/api/machines/active');
  }

  /**
   * Set active runtime machine.
   * @param {string|null} machineId
   * @returns {Promise<{ok: boolean, activeMachineId: string|null, provider: Object|null}>}
   */
  async setActiveMachine(machineId) {
    return this._fetch('/api/machines/active', {
      method: 'POST',
      body: JSON.stringify({ machineId: machineId ?? null }),
    });
  }

  // ===========================================================================
  // Environment Management
  // ===========================================================================

  /**
   * Get environment information
   * @returns {Promise<EnvironmentInfo>}
   */
  async getEnvironment() {
    return this._fetch('/api/environment');
  }

  /**
   * Update environment settings
   * @param {Object} settings
   * @param {string} [settings.venv] - Path to virtual environment
   * @param {string} [settings.cwd] - Working directory
   * @returns {Promise<{success: boolean, changes: string[], environment: PythonEnvironment|null}>}
   */
  async updateEnvironment(settings) {
    return this._fetch('/api/environment', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  // ===========================================================================
  // Monitor Management
  // ===========================================================================

  /**
   * List active monitors
   * @returns {Promise<{monitors: Array<{doc: string, running: boolean}>}>}
   */
  async listMonitors() {
    return this._fetch('/api/monitors');
  }

  /**
   * Start a monitor for a document
   * @param {string} doc - Document name
   * @returns {Promise<{doc: string, running: boolean, message: string}>}
   */
  async startMonitor(doc) {
    return this._fetch('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({ doc }),
    });
  }

  /**
   * Stop a monitor
   * @param {string} doc - Document name
   * @returns {Promise<{doc: string, running: boolean, message: string}>}
   */
  async stopMonitor(doc) {
    return this._fetch(`/api/monitors/${encodeURIComponent(doc)}`, {
      method: 'DELETE',
    });
  }

  // ===========================================================================
  // Runtime Attachments
  // ===========================================================================

  /**
   * Create a runtime attachment for a document
   * @param {string} doc - Document name
   * @param {'shared'|'dedicated'} python - Python runtime mode
   * @param {string} [venv] - Path to virtual environment (for dedicated runtimes)
   * @returns {Promise<Object>}
   */
  async createRuntimeAttachment(doc, python = 'shared', venv = null) {
    const body = { doc, python };
    if (venv) {
      body.venv = venv;
    }

    try {
      return await this._fetch('/api/runtimes', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Legacy orchestrator compatibility
      return this._fetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }
  }

  /**
   * Get runtime attachment info for a document
   * @param {string} doc - Document name
   * @returns {Promise<Object>}
   */
  async getRuntimeAttachment(doc) {
    const encoded = encodeURIComponent(doc);
    try {
      return await this._fetch(`/api/runtimes/${encoded}`);
    } catch (err) {
      return this._fetch(`/api/sessions/${encoded}`);
    }
  }

  /**
   * Destroy a runtime attachment
   * @param {string} doc - Document name
   * @returns {Promise<{doc: string, status: string}>}
   */
  async destroyRuntimeAttachment(doc) {
    const encoded = encodeURIComponent(doc);
    try {
      return await this._fetch(`/api/runtimes/${encoded}`, {
        method: 'DELETE',
      });
    } catch (err) {
      return this._fetch(`/api/sessions/${encoded}`, {
        method: 'DELETE',
      });
    }
  }

  /**
   * List all runtime attachments
   * @returns {Promise<{runtimes?: Array, sessions?: Array}>}
   */
  async listRuntimeAttachments() {
    try {
      return await this._fetch('/api/runtimes');
    } catch (err) {
      return this._fetch('/api/sessions');
    }
  }

  // Legacy aliases
  async createSession(doc, python = 'shared', venv = null) {
    return this.createRuntimeAttachment(doc, python, venv);
  }

  async getSession(doc) {
    return this.getRuntimeAttachment(doc);
  }

  async destroySession(doc) {
    return this.destroyRuntimeAttachment(doc);
  }

  async listSessions() {
    return this.listRuntimeAttachments();
  }

  // ===========================================================================
  // Context Management
  // ===========================================================================

  /**
   * Resolve markdown-managed AI context for a document.
   * @param {Object} request
   * @param {string} request.doc
   * @param {string} [request.content]
   * @param {number} [request.cursorPos]
   * @param {{from: number, to: number}} [request.selection]
   * @param {string[]} [request.codeSymbols]
   * @param {boolean} [request.ensureExists=false]
   */
  async resolveContext(request) {
    return this._fetch('/api/context/resolve', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get context markdown for a document.
   * @param {string} doc
   */
  async getContext(doc) {
    return this._fetch(`/api/context/${encodeURIComponent(doc)}`);
  }

  /**
   * Save context markdown for a document.
   * @param {string} doc
   * @param {string} content
   */
  async saveContext(doc, content) {
    return this._fetch(`/api/context/${encodeURIComponent(doc)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  /**
   * Initialize context markdown for a document if missing.
   * @param {string} doc
   */
  async initContext(doc) {
    return this._fetch(`/api/context/init/${encodeURIComponent(doc)}`, {
      method: 'POST',
    });
  }

  /**
   * Get project default context markdown.
   */
  async getDefaultContext() {
    return this._fetch('/api/context');
  }

  /**
   * Save project default context markdown.
   * @param {string} content
   */
  async saveDefaultContext(content) {
    return this._fetch('/api/context', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  // ===========================================================================
  // Project & Runtime Management
  // ===========================================================================

  /**
   * Get project information
   * @returns {Promise<{root: string, name: string, type: string, venv: string|null}>}
   */
  async getProject() {
    return this._fetch('/api/project');
  }

  /**
   * List all runtimes (shared and dedicated)
   * @returns {Promise<{shared: Object|null, dedicated: Array, sessions: Array, project: Object}>}
   */
  async listRuntimes() {
    return this._fetch('/api/runtimes');
  }

  /**
   * Kill a runtime
   * @param {string} runtimeId - Runtime ID ('shared' or document name for dedicated)
   * @returns {Promise<{id: string, killed: boolean, message: string}>}
   */
  async killRuntime(runtimeId) {
    return this._fetch(`/api/runtimes/${encodeURIComponent(runtimeId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Start a new runtime
   * @param {Object} options
   * @param {string} [options.id] - Runtime ID (auto-generated if not provided)
   * @param {string} [options.venv] - Path to virtual environment
   * @param {string} [options.cwd] - Working directory
   * @returns {Promise<{success: boolean, runtime: Object}>}
   */
  async startRuntime(options = {}) {
    return this._fetch('/api/runtimes', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * List available virtual environments
   * @returns {Promise<{venvs: Array<{path: string, name: string, python: string, version: string, source: string}>, project_root: string}>}
   */
  async listVenvs(deep = false) {
    return this._fetch(`/api/venvs${deep ? '?deep=true' : ''}`);
  }

  /**
   * Search for venvs across the filesystem
   * @param {string} [searchRoot] - Optional root to search from
   * @returns {Promise<{venvs: Array, count: number}>}
   */
  async searchVenvs(searchRoot = null) {
    return this._fetch('/api/venvs/search', {
      method: 'POST',
      body: JSON.stringify(searchRoot ? { search_root: searchRoot } : {}),
    });
  }

  // ===========================================================================
  // Logs
  // ===========================================================================

  /**
   * Get logs from a process
   * @param {string} processName - Process name (e.g., 'mrmd-sync', 'mrmd-python')
   * @param {number} [lines=50] - Number of lines to retrieve
   * @returns {Promise<{process: string, lines: string[]}>}
   */
  async getLogs(processName, lines = 50) {
    return this._fetch(`/api/logs/${encodeURIComponent(processName)}?lines=${lines}`);
  }

  // ===========================================================================
  // Polling & Subscriptions
  // ===========================================================================

  /**
   * Subscribe to status changes
   * @param {(status: OrchestratorStatus) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Start polling for status changes
   * @param {number} [intervalMs=2000] - Poll interval in milliseconds
   */
  startPolling(intervalMs = 2000) {
    if (this._pollInterval) return;

    const poll = async () => {
      try {
        const status = await this.getStatus();

        // Notify if changed
        if (JSON.stringify(status) !== JSON.stringify(this._lastStatus)) {
          this._lastStatus = status;
          this._listeners.forEach(cb => cb(status));
        }
      } catch (error) {
        // Notify of disconnection
        if (this._lastStatus !== null) {
          this._lastStatus = null;
          this._listeners.forEach(cb => cb(null));
        }
      }
    };

    // Poll immediately, then at interval
    poll();
    this._pollInterval = setInterval(poll, intervalMs);
  }

  /**
   * Stop polling for status changes
   */
  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopPolling();
    this._listeners.clear();
  }
}

/**
 * Create an orchestrator client
 * @param {string} [baseUrl='http://localhost:8080']
 * @returns {OrchestratorClient}
 */
export function createOrchestratorClient(baseUrl) {
  return new OrchestratorClient(baseUrl);
}
