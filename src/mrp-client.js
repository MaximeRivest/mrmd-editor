/**
 * MRP Client
 *
 * Connects mrmd-editor to any MRMD Runtime Protocol server.
 *
 * Runtime model (simplified): one runtime process = one REPL namespace.
 * There are no client-managed MRP sessions.
 *
 * @module mrp-client
 */

// JSDoc imports for type hints
/** @typedef {import('./mrp-types.js').Capabilities} Capabilities */
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
   * @param {string[]} [options.languages] - Fallback languages if capabilities haven't loaded yet
   * @param {boolean} [options.prefetch=true] - Auto-fetch capabilities on construction
   */
  constructor(endpoint, options = {}) {
    this.#endpoint = endpoint.replace(/\/$/, ''); // Remove trailing slash
    this.#fallbackLanguages = options.languages || null;

    // Expose runtime URL for ExecutionManager to use in monitor mode routing
    this.runtimeUrl = this.#endpoint;

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
   * @param {function(StdinRequest): Promise<string> | Partial<ExecuteRequest> & { onStdinRequest?: function, onAsset?: function }} [optionsOrStdinHandler]
   *        Can be either:
   *        - A function to handle stdin requests (for Runtime interface compatibility)
   *        - An options object with onStdinRequest and onAsset properties
   * @returns {Promise<ExecuteResult>}
   */
  async executeStreaming(code, language, onChunk, optionsOrStdinHandler = {}, extraOptions = {}) {
    // Cancel any previous execution
    if (this.#currentExecution) {
      this.#currentExecution.abort();
    }

    const controller = new AbortController();
    this.#currentExecution = controller;

    // Handle both signatures:
    // 1. executeStreaming(code, lang, onChunk, onStdinRequest, options) - Runtime interface (5 params)
    // 2. executeStreaming(code, lang, onChunk, { onStdinRequest, onAsset, ...options }) - Original MRP client
    let onStdinRequest;
    let onAsset;
    let executeOptions = {};

    if (typeof optionsOrStdinHandler === 'function') {
      // Runtime interface: 4th param is the stdin handler, 5th is options
      onStdinRequest = optionsOrStdinHandler;
      executeOptions = extraOptions;
      onAsset = extraOptions.onAsset;
    } else {
      // Options object
      ({ onStdinRequest, onAsset, ...executeOptions } = optionsOrStdinHandler);
    }

    try {
      const res = await fetch(`${this.#endpoint}/execute/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
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
                  Promise.resolve(onStdinRequest(data))
                    .then((input) => this.sendInput(data.execId, input))
                    .catch((err) => {
                      // User cancelled input (e.g., pressed Escape)
                      // Notify server to unblock the waiting execution
                      console.log('Stdin cancelled:', err.message);
                      this.cancelInput(data.execId).catch(() => {
                        // Ignore errors - best effort cancellation
                      });
                    });
                }
              } else if (currentEvent === 'asset' || currentEvent === 'display') {
                if (onAsset) {
                  onAsset(data, currentEvent);
                }
              } else if (currentEvent === 'result') {
                finalResult = data;

                // Extract assets from result and notify callback
                if (onAsset && data.assets && data.assets.length > 0) {
                  for (const asset of data.assets) {
                    onAsset(asset, 'asset');
                  }
                }
                // Also handle displayData with images
                if (onAsset && data.displayData && data.displayData.length > 0) {
                  for (const display of data.displayData) {
                    if (display.data && (display.data['image/png'] || display.data['image/jpeg'] || display.data['image/svg+xml'])) {
                      onAsset(display, 'display');
                    }
                  }
                }
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
   * @returns {Promise<SendInputResult>}
   */
  async sendInput(execId, text) {
    const res = await fetch(`${this.#endpoint}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
   * @returns {Promise<void>}
   */
  async interrupt() {
    // Abort fetch if in progress
    if (this.#currentExecution) {
      this.#currentExecution.abort();
      this.#currentExecution = null;
    }

    // Also tell server to interrupt
    const res = await fetch(`${this.#endpoint}/interrupt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Failed to interrupt: ${res.status}`);
  }

  /**
   * Cancel a pending input request
   *
   * Called when the user dismisses the input field without providing input.
   * This unblocks the waiting execution on the server.
   *
   * @param {string} execId - The execution ID waiting for input
   * @returns {Promise<{cancelled: boolean, error?: string}>}
   */
  async cancelInput(execId) {
    const res = await fetch(`${this.#endpoint}/input/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exec_id: execId,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to cancel input: ${res.status}`);
    }

    return res.json();
  }

  /**
   * Reset runtime namespace (clear variables)
   *
   * @returns {Promise<{success: boolean}>}
   */
  async reset() {
    let res = await fetch(`${this.#endpoint}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Backward compatibility for runtimes that still expose session reset
    if (!res.ok && res.status === 404) {
      res = await fetch(`${this.#endpoint}/sessions/default/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    }

    if (!res.ok) throw new Error(`Failed to reset runtime: ${res.status}`);
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
      }),
    });

    if (!res.ok) throw new Error(`Hover failed: ${res.status}`);
    return res.json();
  }

  // ===========================================================================
  // Variables
  // ===========================================================================

  /**
   * List variables in runtime namespace
   *
   * @param {import('./mrp-types.js').VariablesFilter} [filter]
   * @returns {Promise<VariablesResult>}
   */
  async getVariables(filter) {
    const caps = await this.getCapabilities();

    if (!caps.features.variables) {
      return { variables: [], count: 0, truncated: false };
    }

    const res = await fetch(`${this.#endpoint}/variables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter }),
    });

    if (!res.ok) throw new Error(`Variables failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get detailed info about a variable
   *
   * @param {string} name - Variable name
   * @param {Object} [options]
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
   * @returns {Promise<IsCompleteResult>}
   */
  async isComplete(code) {
    const caps = await this.getCapabilities();

    if (!caps.features.isComplete) {
      return { status: 'unknown' };
    }

    const res = await fetch(`${this.#endpoint}/is_complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) throw new Error(`isComplete failed: ${res.status}`);
    return res.json();
  }

  /**
   * Format code
   *
   * @param {string} code
   * @returns {Promise<FormatResult>}
   */
  async format(code) {
    const caps = await this.getCapabilities();

    if (!caps.features.format) {
      return { formatted: code, changed: false };
    }

    const res = await fetch(`${this.#endpoint}/format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
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
}

// #endregion MRP_CLIENT

// #region FACTORY

/**
 * Create an MRP client
 *
 * @param {string} endpoint - Base URL for MRP endpoints
 * @param {Object} [options]
 * @returns {MRPClient}
 */
export function createMRPClient(endpoint, options = {}) {
  return new MRPClient(endpoint, options);
}

// #endregion FACTORY
