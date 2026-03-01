/**
 * PTY WebSocket Client
 *
 * Handles WebSocket communication with the PTY server for terminal blocks.
 * Supports reconnection, session persistence, and multiple concurrent terminals.
 *
 * @module term-pty-client
 */

/**
 * Configuration for PTY client
 * @typedef {Object} PtyClientConfig
 * @property {string} [baseUrl] - Base URL for PTY server (default: current host)
 * @property {string} [sessionId] - Session identifier
 * @property {string} [cwd] - Working directory
 * @property {string} [venv] - Virtual environment path
 * @property {string} [filePath] - Associated file path
 * @property {Function} [onData] - Callback for data from PTY
 * @property {Function} [onConnect] - Callback when connected
 * @property {Function} [onDisconnect] - Callback when disconnected
 * @property {Function} [onError] - Callback for errors
 */

/**
 * PTY WebSocket Client
 */
export class PtyClient {
  /**
   * Create a new PTY client
   * @param {PtyClientConfig} config
   */
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || null, // null = use current host
      sessionId: config.sessionId || `term-${Date.now()}`,
      cwd: config.cwd || null,
      venv: config.venv || null,
      filePath: config.filePath || null,
      onData: config.onData || (() => {}),
      onConnect: config.onConnect || (() => {}),
      onDisconnect: config.onDisconnect || (() => {}),
      onError: config.onError || ((err) => console.error('[PtyClient]', err)),
    };

    /** @type {WebSocket|null} */
    this.ws = null;

    /** @type {boolean} */
    this.connected = false;

    /** @type {boolean} */
    this.intentionallyClosed = false;

    // Reconnection state
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseReconnectDelay = 1000;
    this.reconnectTimeout = null;

    // Small-input batching (typing) to reduce WS frame overhead on tunneled/mobile connections.
    this._writeBuffer = '';
    this._writeTimer = null;
  }

  /**
   * Build WebSocket URL with query parameters
   * @returns {string}
   */
  buildUrl() {
    let base = this.config.baseUrl;

    // Handle Electron/file:// context - baseUrl must be provided
    if (!base || base.startsWith('file://')) {
      // In Electron, window.location.origin is file://, so we need explicit baseUrl
      throw new Error('PtyClient requires baseUrl to be set (e.g., http://127.0.0.1:PORT)');
    }

    // Determine WebSocket protocol from base URL
    const protocol = base.startsWith('https') ? 'wss:' : 'ws:';
    // Extract host:port from base URL
    const host = base.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const params = new URLSearchParams();
    params.set('session_id', this.config.sessionId);

    if (this.config.cwd) {
      params.set('cwd', this.config.cwd);
    }
    if (this.config.venv) {
      params.set('venv', this.config.venv);
    }
    if (this.config.filePath) {
      params.set('file_path', this.config.filePath);
    }

    return `${protocol}//${host}/api/pty?${params.toString()}`;
  }

  /**
   * Connect to the PTY server
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.intentionallyClosed = false;
      const url = this.buildUrl();

      console.log('[PtyClient] Connecting to:', url);

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        console.log('[PtyClient] Connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.config.onConnect();
        resolve();
      };

      this.ws.onmessage = (event) => {
        // Handle both text and binary messages. Text is the normal case
        // (PTY sends terminal output as text). Binary may arrive if the
        // tunnel proxy incorrectly marks a frame as binary — convert to
        // string so xterm.js can render it (xterm doesn't handle Blobs).
        const data = event.data;
        if (typeof data === 'string') {
          this.config.onData(data);
        } else if (data instanceof Blob) {
          data.text().then(text => this.config.onData(text));
        } else if (data instanceof ArrayBuffer) {
          this.config.onData(new TextDecoder().decode(data));
        } else {
          this.config.onData(data);
        }
      };

      this.ws.onerror = (event) => {
        console.error('[PtyClient] WebSocket error:', event);
        this.config.onError(new Error('WebSocket error'));
      };

      this.ws.onclose = (event) => {
        console.log('[PtyClient] Disconnected, code:', event.code);
        this.connected = false;
        this.ws = null;
        if (this._writeTimer) {
          clearTimeout(this._writeTimer);
          this._writeTimer = null;
        }
        this._writeBuffer = '';
        this.config.onDisconnect(event.code, event.reason);

        // Attempt reconnection if not intentionally closed
        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[PtyClient] Max reconnect attempts reached');
      this.config.onError(new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    console.log(`[PtyClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[PtyClient] Reconnect failed:', err);
      });
    }, delay);
  }

  /**
   * Flush any buffered small-input writes.
   */
  _flushWriteBuffer() {
    if (!this._writeBuffer) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this._writeBuffer = '';
      return;
    }

    const buffered = this._writeBuffer;
    this._writeBuffer = '';
    this.ws.send(JSON.stringify({ type: 'input', data: buffered }));
  }

  /**
   * Send data to the PTY (user input).
   * Large payloads (pastes) are chunked to avoid overwhelming the terminal
   * renderer and WebSocket tunnel on markco.dev.
   *
   * @param {string} data - Input data
   */
  write(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Small inputs (normal typing/control sequences): buffer briefly so
    // rapid keypresses are batched into fewer WS frames.
    if (data.length <= 4096) {
      this._writeBuffer += data;
      if (!this._writeTimer) {
        this._writeTimer = setTimeout(() => {
          this._writeTimer = null;
          this._flushWriteBuffer();
        }, 8);
      }
      return;
    }

    // Preserve input ordering: flush any pending small-input batch first.
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    this._flushWriteBuffer();

    // Large paste: chunk it to prevent UI freeze.
    // xterm.js may wrap pastes in bracketed paste markers (\x1b[200~ ... \x1b[201~).
    // We preserve those: send a leading marker once, chunk the body, send trailing marker.
    const BPS = '\x1b[200~';
    const BPE = '\x1b[201~';
    let body = data;
    let hasBracket = false;

    if (body.startsWith(BPS) && body.endsWith(BPE)) {
      hasBracket = true;
      body = body.slice(BPS.length, -BPE.length);
    }

    const CHUNK_SIZE = 2048;
    const CHUNK_DELAY_MS = 6;
    let offset = 0;
    const ws = this.ws;

    if (hasBracket) {
      ws.send(JSON.stringify({ type: 'input', data: BPS }));
    }

    const sendNext = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (offset >= body.length) {
        if (hasBracket) {
          ws.send(JSON.stringify({ type: 'input', data: BPE }));
        }
        return;
      }
      const chunk = body.slice(offset, offset + CHUNK_SIZE);
      offset += CHUNK_SIZE;
      ws.send(JSON.stringify({ type: 'input', data: chunk }));
      setTimeout(sendNext, CHUNK_DELAY_MS);
    };

    sendNext();
  }

  /**
   * Resize the PTY
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   */
  resize(cols, rows) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'resize',
        cols: cols,
        rows: rows,
      }));
    }
  }

  /**
   * Disconnect from the PTY server
   * Note: The PTY session may stay alive on the server for reconnection
   */
  disconnect() {
    this.intentionallyClosed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    this._writeBuffer = '';

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Kill the PTY session on the server
   * @returns {Promise<void>}
   */
  async kill() {
    this.disconnect();

    const base = this.config.baseUrl || window.location.origin;
    try {
      await fetch(`${base}/api/pty/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: this.config.sessionId }),
      });
      console.log('[PtyClient] Session killed:', this.config.sessionId);
    } catch (err) {
      console.error('[PtyClient] Failed to kill session:', err);
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * Create a PTY client and connect
 * @param {PtyClientConfig} config
 * @returns {Promise<PtyClient>}
 */
export async function createPtyClient(config) {
  const client = new PtyClient(config);
  await client.connect();
  return client;
}

/**
 * List all active terminal sessions from the server
 * @param {string} [baseUrl] - Base URL (default: current host)
 * @returns {Promise<Array<{session_id: string, name: string, cwd: string}>>}
 */
export async function listTerminalSessions(baseUrl = null) {
  const base = baseUrl || window.location.origin;
  try {
    const response = await fetch(`${base}/api/terminals`);
    const data = await response.json();
    return data.terminals || [];
  } catch (err) {
    console.error('[PtyClient] Failed to list sessions:', err);
    return [];
  }
}

/**
 * Create a new terminal session on the server
 * @param {Object} options
 * @param {string} [options.name] - Display name
 * @param {string} [options.cwd] - Working directory
 * @param {string} [options.venv] - Virtual environment path
 * @param {string} [options.filePath] - Associated file path
 * @param {string} [baseUrl] - Base URL (default: current host)
 * @returns {Promise<{session_id: string, name: string}>}
 */
export async function createTerminalSession(options = {}, baseUrl = null) {
  const base = baseUrl || window.location.origin;
  const response = await fetch(`${base}/api/terminals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: options.name,
      cwd: options.cwd,
      venv: options.venv,
      file_path: options.filePath,
    }),
  });
  return response.json();
}

export default PtyClient;
