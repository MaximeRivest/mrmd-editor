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
  // Session Management
  // ===========================================================================

  /**
   * Create a session for a document
   * @param {string} doc - Document name
   * @param {'shared'|'dedicated'} python - Python runtime mode
   * @returns {Promise<Object>}
   */
  async createSession(doc, python = 'shared') {
    return this._fetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ doc, python }),
    });
  }

  /**
   * Get session info for a document
   * @param {string} doc - Document name
   * @returns {Promise<Object>}
   */
  async getSession(doc) {
    return this._fetch(`/api/sessions/${encodeURIComponent(doc)}`);
  }

  /**
   * Destroy a session
   * @param {string} doc - Document name
   * @returns {Promise<{doc: string, status: string}>}
   */
  async destroySession(doc) {
    return this._fetch(`/api/sessions/${encodeURIComponent(doc)}`, {
      method: 'DELETE',
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
