/**
 * MRP Client
 *
 * Connects mrmd-editor to any MRMD Runtime Protocol server.
 *
 * @module mrp-client
 */

// JSDoc imports for type hints
/** @typedef {import('./mrp-types.js').Capabilities} Capabilities */
/** @typedef {import('./mrp-types.js').Session} Session */
/** @typedef {import('./mrp-types.js').ExecuteRequest} ExecuteRequest */
/** @typedef {import('./mrp-types.js').ExecuteResult} ExecuteResult */
/** @typedef {import('./mrp-types.js').CompleteRequest} CompleteRequest */
/** @typedef {import('./mrp-types.js').CompleteResult} CompleteResult */
/** @typedef {import('./mrp-types.js').InspectRequest} InspectRequest */
/** @typedef {import('./mrp-types.js').InspectResult} InspectResult */
/** @typedef {import('./mrp-types.js').HoverRequest} HoverRequest */
/** @typedef {import('./mrp-types.js').HoverResult} HoverResult */
/** @typedef {import('./mrp-types.js').VariablesRequest} VariablesRequest */
/** @typedef {import('./mrp-types.js').VariablesResult} VariablesResult */
/** @typedef {import('./mrp-types.js').VariableDetail} VariableDetail */
/** @typedef {import('./mrp-types.js').IsCompleteResult} IsCompleteResult */
/** @typedef {import('./mrp-types.js').FormatResult} FormatResult */
/** @typedef {import('./mrp-types.js').StdinRequest} StdinRequest */
/** @typedef {import('./mrp-types.js').SendInputResult} SendInputResult */

// #region MRP_CLIENT

/**
 * MRP Client - connects to any MRMD Runtime Protocol server
 */
export class MRPClient {
  /** @type {string} */
  #endpoint;

  /** @type {string} */
  #defaultSession;

  /** @type {Capabilities|null} */
  #capabilities = null;

  /** @type {string[]|null} */
  #fallbackLanguages = null;

  /** @type {AbortController|null} */
  #currentExecution = null;

  /** @type {Promise<Capabilities>|null} */
  #capabilitiesPromise = null;

  /**
   * Create MRP client
   *
   * @param {string} endpoint - Base URL for MRP endpoints (e.g., "http://localhost:8000/mrp/v1")
   * @param {Object} [options]
   * @param {string} [options.session='default'] - Default session ID
   * @param {string[]} [options.languages] - Fallback languages if capabilities haven't loaded yet
   * @param {boolean} [options.prefetch=true] - Auto-fetch capabilities on construction
   */
  constructor(endpoint, options = {}) {
    this.#endpoint = endpoint.replace(/\/$/, ''); // Remove trailing slash
    this.#defaultSession = options.session || 'default';
    this.#fallbackLanguages = options.languages || null;

    // Auto-fetch capabilities (fire and forget)
    if (options.prefetch !== false) {
      this.#capabilitiesPromise = this.getCapabilities().catch(() => null);
    }
  }

  // ===========================================================================
  // Capabilities
  // ===========================================================================

  /**
   * Get runtime capabilities (cached after first call)
   *
   * @returns {Promise<Capabilities>}
   */
  async getCapabilities() {
    if (!this.#capabilities) {
      const res = await fetch(`${this.#endpoint}/capabilities`);
      if (!res.ok) {
        throw new Error(`Failed to get capabilities: ${res.status}`);
      }
      this.#capabilities = await res.json();
    }
    return this.#capabilities;
  }

  /**
   * Check if this runtime supports a language
   *
   * Checks in order:
   * 1. Fetched capabilities (if loaded)
   * 2. Fallback languages from constructor
   * 3. Inferred from endpoint URL (e.g., "mrmd-python" -> python)
   *
   * @param {string} language
   * @returns {boolean}
   */
  supports(language) {
    const lang = language.toLowerCase();

    // Check fetched capabilities first
    if (this.#capabilities) {
      return this.#capabilities.languages.includes(lang);
    }

    // Check fallback languages
    if (this.#fallbackLanguages) {
      return this.#fallbackLanguages.includes(lang);
    }

    // Infer from endpoint URL as last resort
    const endpoint = this.#endpoint.toLowerCase();
    if (endpoint.includes('python') && ['python', 'py', 'python3'].includes(lang)) {
      return true;
    }
    if (endpoint.includes('node') && ['javascript', 'js', 'node', 'typescript', 'ts'].includes(lang)) {
      return true;
    }
    if (endpoint.includes('julia') && ['julia', 'jl'].includes(lang)) {
      return true;
    }
    if (endpoint.includes('r-lang') && ['r', 'rlang'].includes(lang)) {
      return true;
    }

    return false;
  }

  /**
   * Wait for capabilities to be loaded
   * Useful if you need to check capabilities synchronously after awaiting
   *
   * @returns {Promise<Capabilities|null>}
   */
  async ready() {
    if (this.#capabilitiesPromise) {
      return this.#capabilitiesPromise;
    }
    return this.getCapabilities().catch(() => null);
  }

  /**
   * Check if a feature is supported
   *
   * @param {keyof import('./mrp-types.js').CapabilityFeatures} feature
   * @returns {boolean}
   */
  hasFeature(feature) {
    return this.#capabilities?.features?.[feature] ?? false;
  }

  // ===========================================================================
  // Sessions
  // ===========================================================================

  /**
   * List active sessions
   *
   * @returns {Promise<Session[]>}
   */
  async listSessions() {
    const res = await fetch(`${this.#endpoint}/sessions`);
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
    const data = await res.json();
    return data.sessions;
  }

  /**
   * Create a new session
   *
   * @param {import('./mrp-types.js').CreateSessionRequest} request
   * @returns {Promise<Session>}
   */
  async createSession(request) {
    const res = await fetch(`${this.#endpoint}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
    return res.json();
  }

  /**
   * Get session info
   *
   * @param {string} [session]
   * @returns {Promise<Session>}
   */
  async getSession(session) {
    const sid = session || this.#defaultSession;
    const res = await fetch(`${this.#endpoint}/sessions/${encodeURIComponent(sid)}`);
    if (!res.ok) throw new Error(`Failed to get session: ${res.status}`);
    return res.json();
  }

  /**
   * Destroy a session
   *
   * @param {string} [session]
   * @returns {Promise<void>}
   */
  async destroySession(session) {
    const sid = session || this.#defaultSession;
    const res = await fetch(`${this.#endpoint}/sessions/${encodeURIComponent(sid)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to destroy session: ${res.status}`);
  }

  /**
   * Reset session (clear namespace)
   *
   * @param {string} [session]
   * @returns {Promise<void>}
   */
  async reset(session) {
    const sid = session || this.#defaultSession;
    const res = await fetch(`${this.#endpoint}/sessions/${encodeURIComponent(sid)}/reset`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to reset session: ${res.status}`);
  }

  // ===========================================================================
  // Execution
  // ===========================================================================

  /**
   * Execute code and return result
   *
   * @param {string} code - Code to execute
   * @param {string} [language] - Language (for mrmd Runtime interface compatibility)
   * @param {Partial<ExecuteRequest>} [options] - Additional options
   * @returns {Promise<ExecuteResult>}
   */
  async execute(code, language, options = {}) {
    const res = await fetch(`${this.#endpoint}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        session: this.#defaultSession,
        ...options,
      }),
    });
    if (!res.ok) throw new Error(`Execution failed: ${res.status}`);
    return res.json();
  }

  /**
   * Execute code with streaming output
   *
   * @param {string} code - Code to execute
   * @param {string} [language] - Language (for mrmd Runtime interface compatibility)
   * @param {function(string, string, boolean): void} onChunk - Callback (chunk, accumulated, done)
   * @param {function(StdinRequest): Promise<string> | Partial<ExecuteRequest> & { onStdinRequest?: function }} [optionsOrStdinHandler]
   *        Can be either:
   *        - A function to handle stdin requests (for Runtime interface compatibility)
   *        - An options object with onStdinRequest property
   * @returns {Promise<ExecuteResult>}
   */
  async executeStreaming(code, language, onChunk, optionsOrStdinHandler = {}) {
    // Cancel any previous execution
    if (this.#currentExecution) {
      this.#currentExecution.abort();
    }

    const controller = new AbortController();
    this.#currentExecution = controller;

    // Handle both signatures:
    // 1. executeStreaming(code, lang, onChunk, onStdinRequest) - Runtime interface
    // 2. executeStreaming(code, lang, onChunk, { onStdinRequest, ...options }) - Original MRP client
    let onStdinRequest;
    let executeOptions = {};

    if (typeof optionsOrStdinHandler === 'function') {
      // Runtime interface: 4th param is the stdin handler directly
      onStdinRequest = optionsOrStdinHandler;
    } else {
      // Options object
      ({ onStdinRequest, ...executeOptions } = optionsOrStdinHandler);
    }

    try {
      const res = await fetch(`${this.#endpoint}/execute/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          session: this.#defaultSession,
          ...executeOptions,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Execution failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let accumulated = '';
      let finalResult = null;
      let currentEvent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'stdout' || currentEvent === 'stderr') {
                accumulated = data.accumulated;
                onChunk(data.content, accumulated, false);
              } else if (currentEvent === 'stdin_request') {
                // Runtime needs user input - call handler and send response
                if (onStdinRequest) {
                  // onStdinRequest returns Promise<string> with user's input
                  // We handle this async but don't block the SSE reading
                  // The server will wait for our /input POST
                  Promise.resolve(onStdinRequest(data))
                    .then((input) => {
                      // Send the input back to the server
                      return this.sendInput(data.execId, input);
                    })
                    .catch((err) => {
                      console.error('Stdin handling error:', err);
                    });
                }
              } else if (currentEvent === 'result') {
                finalResult = data;
              } else if (currentEvent === 'error') {
                finalResult = { success: false, error: data, stdout: '', stderr: '' };
              } else if (currentEvent === 'done') {
                onChunk('', accumulated, true);
              }
            } catch (e) {
              // Ignore parse errors for incomplete data
            }
          }
        }
      }

      return finalResult || { success: true, stdout: accumulated, stderr: '', result: null };
    } finally {
      this.#currentExecution = null;
    }
  }

  /**
   * Send user input to a waiting execution
   *
   * @param {string} execId - Execution ID waiting for input
   * @param {string} text - User input (include \n if submitting)
   * @param {string} [session] - Session ID
   * @returns {Promise<SendInputResult>}
   */
  async sendInput(execId, text, session) {
    const res = await fetch(`${this.#endpoint}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: session || this.#defaultSession,
        exec_id: execId,
        text,
      }),
    });
    if (!res.ok) throw new Error(`Send input failed: ${res.status}`);
    return res.json();
  }

  /**
   * Interrupt running execution
   *
   * @param {string} [session]
   * @returns {Promise<void>}
   */
  async interrupt(session) {
    // Abort fetch if in progress
    if (this.#currentExecution) {
      this.#currentExecution.abort();
      this.#currentExecution = null;
    }

    // Also tell server to interrupt
    const res = await fetch(`${this.#endpoint}/interrupt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: session || this.#defaultSession }),
    });
    if (!res.ok) throw new Error(`Failed to interrupt: ${res.status}`);
  }

  // ===========================================================================
  // Input
  // ===========================================================================

  /**
   * Send user input to a waiting execution (stdin_request response)
   *
   * @param {string} execId - The execution ID that requested input
   * @param {string} text - The user input text (should include newline if submitting)
   * @param {string} [session]
   * @returns {Promise<{accepted: boolean, error?: string}>}
   */
  async sendInput(execId, text, session) {
    const res = await fetch(`${this.#endpoint}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: session || this.#defaultSession,
        exec_id: execId,
        text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to send input: ${res.status}`);
    }

    return res.json();
  }

  // ===========================================================================
  // Completion
  // ===========================================================================

  /**
   * Get completions at cursor position
   *
   * @param {CompleteRequest} request
   * @returns {Promise<CompleteResult>}
   */
  async complete(request) {
    const caps = await this.getCapabilities();

    if (!caps.features.complete) {
      return { matches: [], cursorStart: request.cursor, cursorEnd: request.cursor, source: 'static' };
    }

    const res = await fetch(`${this.#endpoint}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        session: request.session || this.#defaultSession,
      }),
    });

    if (!res.ok) throw new Error(`Completion failed: ${res.status}`);
    return res.json();
  }

  // ===========================================================================
  // Introspection
  // ===========================================================================

  /**
   * Get detailed info about symbol
   *
   * @param {InspectRequest} request
   * @returns {Promise<InspectResult>}
   */
  async inspect(request) {
    const caps = await this.getCapabilities();

    if (!caps.features.inspect) {
      return { found: false, source: 'static' };
    }

    const res = await fetch(`${this.#endpoint}/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        session: request.session || this.#defaultSession,
      }),
    });

    if (!res.ok) throw new Error(`Inspect failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get hover tooltip for symbol
   *
   * @param {HoverRequest} request
   * @returns {Promise<HoverResult>}
   */
  async hover(request) {
    const caps = await this.getCapabilities();

    if (!caps.features.hover) {
      return { found: false };
    }

    const res = await fetch(`${this.#endpoint}/hover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...request,
        session: request.session || this.#defaultSession,
      }),
    });

    if (!res.ok) throw new Error(`Hover failed: ${res.status}`);
    return res.json();
  }

  // ===========================================================================
  // Variables
  // ===========================================================================

  /**
   * List variables in session
   *
   * @param {string} [session]
   * @param {import('./mrp-types.js').VariablesFilter} [filter]
   * @returns {Promise<VariablesResult>}
   */
  async getVariables(session, filter) {
    const caps = await this.getCapabilities();

    if (!caps.features.variables) {
      return { variables: [], count: 0, truncated: false };
    }

    const res = await fetch(`${this.#endpoint}/variables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: session || this.#defaultSession,
        filter,
      }),
    });

    if (!res.ok) throw new Error(`Variables failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get detailed info about a variable
   *
   * @param {string} name - Variable name
   * @param {Object} [options]
   * @param {string} [options.session] - Session ID
   * @param {string[]} [options.path] - Drill-down path
   * @param {number} [options.maxChildren] - Max children to return
   * @param {number} [options.maxValueLength] - Max value length
   * @returns {Promise<VariableDetail>}
   */
  async getVariableDetail(name, options = {}) {
    const caps = await this.getCapabilities();

    if (!caps.features.variableExpand) {
      return { name, type: 'unknown', value: '?', expandable: false };
    }

    const res = await fetch(`${this.#endpoint}/variables/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: options.session || this.#defaultSession,
        path: options.path,
        maxChildren: options.maxChildren,
        maxValueLength: options.maxValueLength,
      }),
    });

    if (!res.ok) throw new Error(`Variable detail failed: ${res.status}`);
    return res.json();
  }

  // ===========================================================================
  // Code Analysis
  // ===========================================================================

  /**
   * Check if code is a complete statement
   *
   * @param {string} code
   * @param {string} [session]
   * @returns {Promise<IsCompleteResult>}
   */
  async isComplete(code, session) {
    const caps = await this.getCapabilities();

    if (!caps.features.isComplete) {
      return { status: 'unknown' };
    }

    const res = await fetch(`${this.#endpoint}/is_complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        session: session || this.#defaultSession,
      }),
    });

    if (!res.ok) throw new Error(`isComplete failed: ${res.status}`);
    return res.json();
  }

  /**
   * Format code
   *
   * @param {string} code
   * @param {string} [session]
   * @returns {Promise<FormatResult>}
   */
  async format(code, session) {
    const caps = await this.getCapabilities();

    if (!caps.features.format) {
      return { formatted: code, changed: false };
    }

    const res = await fetch(`${this.#endpoint}/format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        session: session || this.#defaultSession,
      }),
    });

    if (!res.ok) throw new Error(`Format failed: ${res.status}`);
    return res.json();
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get asset URL
   *
   * @param {string} path - Asset path
   * @returns {string}
   */
  getAssetUrl(path) {
    return `${this.#endpoint}/assets/${encodeURIComponent(path)}`;
  }

  /**
   * Get the endpoint URL
   *
   * @returns {string}
   */
  get endpoint() {
    return this.#endpoint;
  }

  /**
   * Get the default session ID
   *
   * @returns {string}
   */
  get defaultSession() {
    return this.#defaultSession;
  }

  /**
   * Set the default session ID
   *
   * @param {string} session
   */
  set defaultSession(session) {
    this.#defaultSession = session;
  }
}

// #endregion MRP_CLIENT

// #region FACTORY

/**
 * Create an MRP client
 *
 * @param {string} endpoint - Base URL for MRP endpoints
 * @param {Object} [options]
 * @param {string} [options.session='default'] - Default session ID
 * @returns {MRPClient}
 */
export function createMRPClient(endpoint, options = {}) {
  return new MRPClient(endpoint, options);
}

// #endregion FACTORY
