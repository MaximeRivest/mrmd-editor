var mrmdJs = (function (exports) {
  'use strict';

  /**
   * Constants
   *
   * Runtime constants for mrmd-js.
   * @module constants
   */

  /** Runtime name */
  const RUNTIME_NAME = 'mrmd-js';

  /** Runtime version */
  const RUNTIME_VERSION = '2.0.0';

  /** Default session ID */
  const DEFAULT_SESSION = 'default';

  /** Default max sessions */
  const DEFAULT_MAX_SESSIONS = 10;

  /** Supported languages */
  const SUPPORTED_LANGUAGES = [
    'javascript',
    'js',
    'html',
    'htm',
    'css',
    'style',
  ];

  /** Default features */
  const DEFAULT_FEATURES = {
    execute: true,
    executeStream: true,
    interrupt: false, // Limited in browser
    complete: true,
    inspect: true,
    hover: true,
    variables: true,
    variableExpand: true,
    reset: true,
    isComplete: true,
    format: true,
    assets: true,
  };

  /**
   * Console Capture
   *
   * Intercepts console methods to capture output during execution.
   * @module session/console-capture
   */

  /**
   * @typedef {import('./context/interface.js').LogEntry} LogEntry
   */

  /**
   * Format arguments for logging
   * @param {Array<*>} args
   * @returns {string}
   */
  function formatArgs(args) {
    return args
      .map((arg) => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
  }

  /**
   * Create a console capture for a window context
   */
  class ConsoleCapture {
    /** @type {Window} */
    #context;

    /** @type {LogEntry[]} */
    #queue = [];

    /** @type {Partial<Console> | null} */
    #originalConsole = null;

    /** @type {boolean} */
    #active = false;

    /**
     * @param {Window} context - The window context to capture console from
     */
    constructor(context) {
      this.#context = context;
    }

    /**
     * Start capturing console output
     */
    start() {
      if (this.#active) return;

      const console = this.#context.console;

      // Save originals
      this.#originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
      };

      // Intercept methods
      console.log = (...args) => {
        this.#queue.push({ type: 'log', args, timestamp: Date.now() });
        this.#originalConsole?.log?.(...args);
      };

      console.info = (...args) => {
        this.#queue.push({ type: 'info', args, timestamp: Date.now() });
        this.#originalConsole?.info?.(...args);
      };

      console.warn = (...args) => {
        this.#queue.push({ type: 'warn', args, timestamp: Date.now() });
        this.#originalConsole?.warn?.(...args);
      };

      console.error = (...args) => {
        this.#queue.push({ type: 'error', args, timestamp: Date.now() });
        this.#originalConsole?.error?.(...args);
      };

      this.#active = true;
    }

    /**
     * Stop capturing and restore original console
     */
    stop() {
      if (!this.#active || !this.#originalConsole) return;

      const console = this.#context.console;

      if (this.#originalConsole.log) {
        console.log = this.#originalConsole.log;
      }
      if (this.#originalConsole.info) {
        console.info = this.#originalConsole.info;
      }
      if (this.#originalConsole.warn) {
        console.warn = this.#originalConsole.warn;
      }
      if (this.#originalConsole.error) {
        console.error = this.#originalConsole.error;
      }

      this.#originalConsole = null;
      this.#active = false;
    }

    /**
     * Clear the log queue
     */
    clear() {
      this.#queue = [];
    }

    /**
     * Get captured logs and clear queue
     * @returns {LogEntry[]}
     */
    flush() {
      const logs = this.#queue;
      this.#queue = [];
      return logs;
    }

    /**
     * Get captured logs without clearing
     * @returns {LogEntry[]}
     */
    peek() {
      return [...this.#queue];
    }

    /**
     * Convert logs to stdout/stderr strings
     * @param {LogEntry[]} logs
     * @returns {{ stdout: string, stderr: string }}
     */
    static toOutput(logs) {
      const stdout = [];
      const stderr = [];

      for (const log of logs) {
        const formatted = formatArgs(log.args);
        if (log.type === 'error') {
          stderr.push(`Error: ${formatted}`);
        } else if (log.type === 'warn') {
          stderr.push(`Warning: ${formatted}`);
        } else {
          stdout.push(formatted);
        }
      }

      return {
        stdout: stdout.join('\n'),
        stderr: stderr.join('\n'),
      };
    }
  }

  /**
   * Create a console capture for a context
   * @param {Window} context
   * @returns {ConsoleCapture}
   */
  function createConsoleCapture(context) {
    return new ConsoleCapture(context);
  }

  /**
   * Iframe Execution Context
   *
   * Executes JavaScript in an isolated iframe environment.
   * Variables persist in the iframe's global scope between executions.
   *
   * @module session/context/iframe
   */


  /**
   * @typedef {import('./interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('./interface.js').RawExecutionResult} RawExecutionResult
   * @typedef {import('./interface.js').LogEntry} LogEntry
   */

  /**
   * @typedef {Object} IframeContextOptions
   * @property {boolean} [visible=false] - Whether iframe is visible
   * @property {HTMLElement} [target] - Target element for visible iframe
   * @property {boolean} [allowMainAccess=true] - Allow access to main document
   * @property {Record<string, *>} [utilities] - Custom utilities to inject
   * @property {Partial<CSSStyleDeclaration>} [styles] - Styles for visible iframe
   */

  /**
   * Iframe-based execution context
   * @implements {ExecutionContext}
   */
  class IframeContext {
    /** @type {HTMLIFrameElement | null} */
    #iframe = null;

    /** @type {Window | null} */
    #ctx = null;

    /** @type {Set<string>} */
    #trackedVars = new Set();

    /** @type {ConsoleCapture | null} */
    #consoleCapture = null;

    /** @type {IframeContextOptions} */
    #options;

    /** @type {boolean} */
    #initialized = false;

    /**
     * @param {IframeContextOptions} [options]
     */
    constructor(options = {}) {
      this.#options = {
        visible: false,
        allowMainAccess: true,
        ...options,
      };
    }

    /**
     * Initialize the iframe
     */
    #initialize() {
      if (this.#initialized) return;

      // Create iframe
      this.#iframe = document.createElement('iframe');
      this.#iframe.sandbox.add('allow-scripts');
      this.#iframe.sandbox.add('allow-same-origin');

      if (this.#options.visible && this.#options.target) {
        // Visible mode
        const styles = this.#options.styles || {};
        this.#iframe.style.width = styles.width || '100%';
        this.#iframe.style.height = styles.height || '100%';
        this.#iframe.style.border = styles.border || 'none';
        this.#iframe.style.display = 'block';

        // Apply additional styles
        for (const [key, value] of Object.entries(styles)) {
          if (value && typeof value === 'string') {
            this.#iframe.style.setProperty(key, value);
          }
        }

        this.#options.target.appendChild(this.#iframe);
      } else {
        // Hidden mode
        this.#iframe.style.display = 'none';
        document.body.appendChild(this.#iframe);
      }

      // Get context
      this.#ctx = /** @type {Window} */ (this.#iframe.contentWindow);

      // Set up utilities
      this.#setupUtilities();

      // Set up console capture
      this.#consoleCapture = new ConsoleCapture(this.#ctx);
      this.#consoleCapture.start();

      // Initialize tracking set in iframe
      this.#ctx.__userVars__ = this.#trackedVars;

      this.#initialized = true;
    }

    /**
     * Set up utility functions in the context
     */
    #setupUtilities() {
      if (!this.#ctx) return;

      // Access to main document
      if (this.#options.allowMainAccess) {
        this.#ctx.mainDocument = document;
        this.#ctx.mainWindow = window;
      }

      // Sleep helper
      this.#ctx.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      // Print helper
      this.#ctx.print = (...args) => {
        this.#ctx?.console.log(...args);
      };

      // Display helper for rich output
      this.#ctx.display = (data, mimeType = 'text/plain') => {
        // Store for retrieval
        if (!this.#ctx.__displayQueue__) {
          this.#ctx.__displayQueue__ = [];
        }

        let content;
        if (typeof data === 'string') {
          content = data;
        } else if (data instanceof HTMLElement) {
          content = data.outerHTML;
          mimeType = 'text/html';
        } else {
          try {
            content = JSON.stringify(data, null, 2);
            mimeType = 'application/json';
          } catch {
            content = String(data);
          }
        }

        this.#ctx.__displayQueue__.push({ data: { [mimeType]: content }, metadata: {} });
      };

      // Inject custom utilities
      if (this.#options.utilities) {
        for (const [key, value] of Object.entries(this.#options.utilities)) {
          this.#ctx[key] = value;
        }
      }
    }

    /**
     * Execute code in the iframe
     * @param {string} code - Already transformed/wrapped code from executor
     * @returns {Promise<RawExecutionResult>}
     */
    async execute(code) {
      this.#initialize();

      if (!this.#ctx) {
        throw new Error('Context not initialized');
      }

      // Clear display queue
      this.#ctx.__displayQueue__ = [];

      // Clear console capture
      this.#consoleCapture?.clear();

      const startTime = performance.now();

      try {
        // Execute - code is already transformed/wrapped by the executor
        const result = await this.#ctx.eval(code);
        const duration = performance.now() - startTime;

        // Get logs
        const logs = this.#consoleCapture?.flush() || [];

        return {
          result,
          logs,
          duration,
        };
      } catch (error) {
        const duration = performance.now() - startTime;
        const logs = this.#consoleCapture?.flush() || [];

        return {
          result: undefined,
          logs,
          error: error instanceof Error ? error : new Error(String(error)),
          duration,
        };
      }
    }

    /**
     * Get all user-defined variables
     * @returns {Record<string, *>}
     */
    getVariables() {
      if (!this.#ctx) return {};

      const vars = {};
      for (const name of this.#trackedVars) {
        try {
          vars[name] = this.#ctx[name];
        } catch {
          // Skip inaccessible
        }
      }
      return vars;
    }

    /**
     * Get a specific variable
     * @param {string} name
     * @returns {*}
     */
    getVariable(name) {
      if (!this.#ctx) return undefined;
      return this.#ctx[name];
    }

    /**
     * Check if variable exists
     * @param {string} name
     * @returns {boolean}
     */
    hasVariable(name) {
      if (!this.#ctx) return false;
      return name in this.#ctx;
    }

    /**
     * Get the global object
     * @returns {Window}
     */
    getGlobal() {
      this.#initialize();
      return /** @type {Window} */ (this.#ctx);
    }

    /**
     * Track a declared variable
     * @param {string} name
     */
    trackVariable(name) {
      this.#trackedVars.add(name);
    }

    /**
     * Get tracked variable names
     * @returns {Set<string>}
     */
    getTrackedVariables() {
      return this.#trackedVars;
    }

    /**
     * Reset the context
     */
    reset() {
      if (!this.#initialized) return;

      // Destroy and reinitialize
      this.destroy();
      this.#initialized = false;
      this.#trackedVars = new Set();
      this.#initialize();
    }

    /**
     * Destroy the context
     */
    destroy() {
      this.#consoleCapture?.stop();
      this.#consoleCapture = null;

      if (this.#iframe) {
        this.#iframe.parentElement?.removeChild(this.#iframe);
        this.#iframe = null;
      }

      this.#ctx = null;
      this.#initialized = false;
    }

    /**
     * Check if this is main context
     * @returns {boolean}
     */
    isMainContext() {
      return false;
    }

    /**
     * Get the iframe element
     * @returns {HTMLIFrameElement | null}
     */
    getIframe() {
      return this.#iframe;
    }

    /**
     * Get display data queue
     * @returns {Array<{data: Record<string, string>, metadata: Record<string, *>}>}
     */
    getDisplayQueue() {
      return this.#ctx?.__displayQueue__ || [];
    }
  }

  /**
   * Create an iframe context
   * @param {IframeContextOptions} [options]
   * @returns {IframeContext}
   */
  function createIframeContext(options) {
    return new IframeContext(options);
  }

  /**
   * Main Execution Context
   *
   * Executes JavaScript in the main window context (no isolation).
   * Provides full access to the page's DOM and state.
   *
   * @module session/context/main
   */


  /**
   * @typedef {import('./interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('./interface.js').RawExecutionResult} RawExecutionResult
   */

  /**
   * @typedef {Object} MainContextOptions
   * @property {Record<string, *>} [utilities] - Custom utilities to inject
   */

  /**
   * Main window execution context (no isolation)
   * @implements {ExecutionContext}
   */
  class MainContext {
    /** @type {Set<string>} */
    #trackedVars = new Set();

    /** @type {ConsoleCapture | null} */
    #consoleCapture = null;

    /** @type {MainContextOptions} */
    #options;

    /** @type {boolean} */
    #initialized = false;

    /** @type {Array<{data: Record<string, string>, metadata: Record<string, *>}>} */
    #displayQueue = [];

    /**
     * @param {MainContextOptions} [options]
     */
    constructor(options = {}) {
      this.#options = options;
    }

    /**
     * Initialize the context
     */
    #initialize() {
      if (this.#initialized) return;

      // Set up utilities on window
      this.#setupUtilities();

      // Set up console capture
      this.#consoleCapture = new ConsoleCapture(window);
      this.#consoleCapture.start();

      this.#initialized = true;
    }

    /**
     * Set up utility functions
     */
    #setupUtilities() {
      // Sleep helper (if not already defined)
      if (!('sleep' in window)) {
        /** @type {*} */ (window).sleep = (ms) =>
          new Promise((resolve) => setTimeout(resolve, ms));
      }

      // Print helper
      if (!('print' in window) || typeof window.print !== 'function') {
        /** @type {*} */ (window).print = (...args) => {
          console.log(...args);
        };
      }

      // Display helper
      /** @type {*} */ (window).__mrmd_display__ = (data, mimeType = 'text/plain') => {
        let content;
        if (typeof data === 'string') {
          content = data;
        } else if (data instanceof HTMLElement) {
          content = data.outerHTML;
          mimeType = 'text/html';
        } else {
          try {
            content = JSON.stringify(data, null, 2);
            mimeType = 'application/json';
          } catch {
            content = String(data);
          }
        }

        this.#displayQueue.push({ data: { [mimeType]: content }, metadata: {} });
      };

      // Inject custom utilities
      if (this.#options.utilities) {
        for (const [key, value] of Object.entries(this.#options.utilities)) {
          /** @type {*} */ (window)[key] = value;
        }
      }
    }

    /**
     * Execute code in main context
     * @param {string} code - Already transformed/wrapped code from executor
     * @returns {Promise<RawExecutionResult>}
     */
    async execute(code) {
      this.#initialize();

      // Clear display queue
      this.#displayQueue = [];

      // Clear console capture
      this.#consoleCapture?.clear();

      const startTime = performance.now();

      try {
        // Execute - code is already transformed/wrapped by the executor
        const result = await eval(code);
        const duration = performance.now() - startTime;

        // Get logs
        const logs = this.#consoleCapture?.flush() || [];

        return {
          result,
          logs,
          duration,
        };
      } catch (error) {
        const duration = performance.now() - startTime;
        const logs = this.#consoleCapture?.flush() || [];

        return {
          result: undefined,
          logs,
          error: error instanceof Error ? error : new Error(String(error)),
          duration,
        };
      }
    }

    /**
     * Get all user-defined variables
     * @returns {Record<string, *>}
     */
    getVariables() {
      const vars = {};
      for (const name of this.#trackedVars) {
        try {
          vars[name] = /** @type {*} */ (window)[name];
        } catch {
          // Skip inaccessible
        }
      }
      return vars;
    }

    /**
     * Get a specific variable
     * @param {string} name
     * @returns {*}
     */
    getVariable(name) {
      return /** @type {*} */ (window)[name];
    }

    /**
     * Check if variable exists
     * @param {string} name
     * @returns {boolean}
     */
    hasVariable(name) {
      return name in window;
    }

    /**
     * Get the global object
     * @returns {Window}
     */
    getGlobal() {
      return window;
    }

    /**
     * Track a declared variable
     * @param {string} name
     */
    trackVariable(name) {
      this.#trackedVars.add(name);
    }

    /**
     * Get tracked variable names
     * @returns {Set<string>}
     */
    getTrackedVariables() {
      return this.#trackedVars;
    }

    /**
     * Reset the context
     */
    reset() {
      // Delete tracked variables from window
      for (const name of this.#trackedVars) {
        try {
          delete /** @type {*} */ (window)[name];
        } catch {
          // Some properties can't be deleted
        }
      }
      this.#trackedVars = new Set();
      this.#displayQueue = [];
    }

    /**
     * Destroy the context
     */
    destroy() {
      this.#consoleCapture?.stop();
      this.#consoleCapture = null;

      // Clean up tracked variables
      this.reset();

      // Clean up utilities we added
      try {
        delete /** @type {*} */ (window).__mrmd_display__;
      } catch {
        // Ignore
      }

      this.#initialized = false;
    }

    /**
     * Check if this is main context
     * @returns {boolean}
     */
    isMainContext() {
      return true;
    }

    /**
     * Get the iframe element
     * @returns {null}
     */
    getIframe() {
      return null;
    }

    /**
     * Get display data queue
     * @returns {Array<{data: Record<string, string>, metadata: Record<string, *>}>}
     */
    getDisplayQueue() {
      return this.#displayQueue;
    }
  }

  /**
   * Create a main context
   * @param {MainContextOptions} [options]
   * @returns {MainContext}
   */
  function createMainContext(options) {
    return new MainContext(options);
  }

  /**
   * Extract Transform
   *
   * Extracts declared variable names from code.
   * @module transform/extract
   */

  /**
   * Extract all variable names that will be declared by the code.
   * Handles var, let, const, function, and class declarations.
   *
   * @param {string} code - Source code
   * @returns {string[]} Array of declared variable names
   *
   * @example
   * extractDeclaredVariables('const x = 1; let { a, b } = obj; function foo() {}')
   * // Returns: ['x', 'a', 'b', 'foo']
   */
  function extractDeclaredVariables(code) {
    const variables = new Set();

    // Remove strings, comments to avoid false matches
    const cleaned = removeStringsAndComments(code);

    // Match var/let/const declarations
    // Handles: const x = 1, let x = 1, var x = 1
    // Handles: const { a, b } = obj, const [a, b] = arr
    const varPattern = /\b(?:var|let|const)\s+([^=;]+?)(?:\s*=|\s*;|\s*$)/g;

    let match;
    while ((match = varPattern.exec(cleaned)) !== null) {
      const declaration = match[1].trim();
      extractNamesFromPattern(declaration, variables);
    }

    // Match function declarations
    const funcPattern = /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    while ((match = funcPattern.exec(cleaned)) !== null) {
      variables.add(match[1]);
    }

    // Match class declarations
    const classPattern = /\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((match = classPattern.exec(cleaned)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Extract variable names from a destructuring pattern or simple identifier
   * @param {string} pattern
   * @param {Set<string>} variables
   */
  function extractNamesFromPattern(pattern, variables) {
    // Simple identifier
    const simpleMatch = pattern.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
    if (simpleMatch) {
      variables.add(simpleMatch[1]);
      return;
    }

    // Object destructuring { a, b: c, ...rest }
    if (pattern.startsWith('{')) {
      const inner = pattern.slice(1, -1);
      // Split by comma, handling nested braces
      const parts = splitByComma(inner);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Handle rest: ...rest
        if (trimmed.startsWith('...')) {
          const name = trimmed.slice(3).trim();
          if (isValidIdentifier(name)) {
            variables.add(name);
          }
          continue;
        }

        // Handle rename: key: name or key: pattern
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const value = trimmed.slice(colonIdx + 1).trim();
          extractNamesFromPattern(value, variables);
        } else {
          // Simple: key (which is also the variable name)
          const name = trimmed.split('=')[0].trim(); // Handle default values
          if (isValidIdentifier(name)) {
            variables.add(name);
          }
        }
      }
      return;
    }

    // Array destructuring [a, b, ...rest]
    if (pattern.startsWith('[')) {
      const inner = pattern.slice(1, -1);
      const parts = splitByComma(inner);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Handle rest: ...rest
        if (trimmed.startsWith('...')) {
          const name = trimmed.slice(3).trim();
          if (isValidIdentifier(name)) {
            variables.add(name);
          }
          continue;
        }

        // Handle nested destructuring or simple name
        const nameOrPattern = trimmed.split('=')[0].trim();
        extractNamesFromPattern(nameOrPattern, variables);
      }
      return;
    }

    // Multiple declarations: a, b, c (from var a, b, c)
    if (pattern.includes(',')) {
      const parts = splitByComma(pattern);
      for (const part of parts) {
        const trimmed = part.trim().split('=')[0].trim();
        if (isValidIdentifier(trimmed)) {
          variables.add(trimmed);
        }
      }
    }
  }

  /**
   * Split string by commas, respecting nested brackets
   * @param {string} str
   * @returns {string[]}
   */
  function splitByComma(str) {
    const parts = [];
    let current = '';
    let depth = 0;

    for (const char of str) {
      if ((char === '{' || char === '[' || char === '(')) {
        depth++;
        current += char;
      } else if ((char === '}' || char === ']' || char === ')')) {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * Check if string is a valid JavaScript identifier
   * @param {string} name
   * @returns {boolean}
   */
  function isValidIdentifier(name) {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
  }

  /**
   * Remove strings and comments from code
   * @param {string} code
   * @returns {string}
   */
  function removeStringsAndComments(code) {
    let result = '';
    let i = 0;

    while (i < code.length) {
      // Single-line comment
      if (code[i] === '/' && code[i + 1] === '/') {
        while (i < code.length && code[i] !== '\n') i++;
        continue;
      }

      // Multi-line comment
      if (code[i] === '/' && code[i + 1] === '*') {
        i += 2;
        while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
        i += 2;
        continue;
      }

      // Template literal
      if (code[i] === '`') {
        result += ' ';
        i++;
        while (i < code.length) {
          if (code[i] === '\\') {
            i += 2;
            continue;
          }
          if (code[i] === '`') {
            i++;
            break;
          }
          if (code[i] === '$' && code[i + 1] === '{') {
            i += 2;
            let depth = 1;
            while (i < code.length && depth > 0) {
              if (code[i] === '{') depth++;
              else if (code[i] === '}') depth--;
              i++;
            }
            continue;
          }
          i++;
        }
        continue;
      }

      // String
      if (code[i] === '"' || code[i] === "'") {
        const quote = code[i];
        result += ' ';
        i++;
        while (i < code.length) {
          if (code[i] === '\\') {
            i += 2;
            continue;
          }
          if (code[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }

      result += code[i];
      i++;
    }

    return result;
  }

  /**
   * Executor Interface
   *
   * Defines the contract for language executors.
   * Each executor handles one or more languages and produces MRP-compliant results.
   *
   * @module execute/interface
   */

  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/execution.js').ExecuteOptions} ExecuteOptions
   * @typedef {import('../types/execution.js').ExecutionResult} ExecutionResult
   * @typedef {import('../types/streaming.js').StreamEvent} StreamEvent
   */

  /**
   * @typedef {Object} Executor
   * @property {readonly string[]} languages - Language identifiers this executor handles
   * @property {function(string, ExecutionContext, ExecuteOptions=): Promise<ExecutionResult>} execute - Execute code
   * @property {function(string, ExecutionContext, ExecuteOptions=): AsyncGenerator<StreamEvent>} [executeStream] - Execute with streaming
   */

  /**
   * @typedef {Object} ExecutorConfig
   * @property {string[]} languages - Language identifiers to register
   */

  /**
   * Base class for executors (optional, executors can also be plain objects)
   * @abstract
   */
  class BaseExecutor {
    /** @type {readonly string[]} */
    languages = [];

    /**
     * Execute code
     * @param {string} code - Code to execute
     * @param {ExecutionContext} context - Execution context
     * @param {ExecuteOptions} [options] - Execution options
     * @returns {Promise<ExecutionResult>}
     * @abstract
     */
    async execute(code, context, options = {}) {
      throw new Error('execute() must be implemented by subclass');
    }

    /**
     * Execute code with streaming output
     * Default implementation wraps execute() result
     *
     * @param {string} code - Code to execute
     * @param {ExecutionContext} context - Execution context
     * @param {ExecuteOptions} [options] - Execution options
     * @returns {AsyncGenerator<StreamEvent>}
     */
    async *executeStream(code, context, options = {}) {
      const execId = options.execId || `exec-${Date.now()}`;
      const timestamp = new Date().toISOString();

      // Start event
      yield /** @type {import('../types/streaming.js').StartEvent} */ ({
        type: 'start',
        execId,
        timestamp,
      });

      try {
        // Execute
        const result = await this.execute(code, context, options);

        // Stream stdout
        if (result.stdout) {
          yield /** @type {import('../types/streaming.js').StdoutEvent} */ ({
            type: 'stdout',
            content: result.stdout,
            accumulated: result.stdout,
          });
        }

        // Stream stderr
        if (result.stderr) {
          yield /** @type {import('../types/streaming.js').StderrEvent} */ ({
            type: 'stderr',
            content: result.stderr,
            accumulated: result.stderr,
          });
        }

        // Stream display data
        for (const display of result.displayData) {
          yield /** @type {import('../types/streaming.js').DisplayEvent} */ ({
            type: 'display',
            data: display.data,
            metadata: display.metadata,
          });
        }

        // Stream assets
        for (const asset of result.assets) {
          yield /** @type {import('../types/streaming.js').AssetEvent} */ ({
            type: 'asset',
            path: asset.path,
            url: asset.url,
            mimeType: asset.mimeType,
            assetType: asset.assetType,
          });
        }

        // Result event
        yield /** @type {import('../types/streaming.js').ResultEvent} */ ({
          type: 'result',
          result,
        });
      } catch (error) {
        // Error event
        yield /** @type {import('../types/streaming.js').ErrorEvent} */ ({
          type: 'error',
          error: {
            type: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
            traceback: error instanceof Error && error.stack ? error.stack.split('\n') : undefined,
          },
        });
      }

      // Done event
      yield /** @type {import('../types/streaming.js').DoneEvent} */ ({
        type: 'done',
      });
    }

    /**
     * Check if this executor supports a language
     * @param {string} language
     * @returns {boolean}
     */
    supports(language) {
      return this.languages.includes(language.toLowerCase());
    }
  }

  /**
   * Persistence Transform
   *
   * Transforms const/let declarations to var for persistence across executions.
   * In a REPL, we want variables to persist between cells. const/let are
   * block-scoped and would be lost; var attaches to the global scope.
   *
   * @module transform/persistence
   */

  /**
   * Transform const/let declarations to var for persistence.
   *
   * @param {string} code - Source code
   * @returns {string} Transformed code
   *
   * @example
   * transformForPersistence('const x = 1; let y = 2;')
   * // Returns: 'var x = 1; var y = 2;'
   */
  function transformForPersistence(code) {
    // Use a state machine approach to avoid transforming inside strings/comments
    let result = '';
    let i = 0;
    const len = code.length;

    while (i < len) {
      // Check for single-line comment
      if (code[i] === '/' && code[i + 1] === '/') {
        const start = i;
        i += 2;
        while (i < len && code[i] !== '\n') i++;
        result += code.slice(start, i);
        continue;
      }

      // Check for multi-line comment
      if (code[i] === '/' && code[i + 1] === '*') {
        const start = i;
        i += 2;
        while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
        i += 2;
        result += code.slice(start, i);
        continue;
      }

      // Check for template literal
      if (code[i] === '`') {
        const start = i;
        i++;
        while (i < len) {
          if (code[i] === '\\') {
            i += 2;
            continue;
          }
          if (code[i] === '`') {
            i++;
            break;
          }
          // Handle ${...} - need to track nested braces
          if (code[i] === '$' && code[i + 1] === '{') {
            i += 2;
            let braceDepth = 1;
            while (i < len && braceDepth > 0) {
              if (code[i] === '{') braceDepth++;
              else if (code[i] === '}') braceDepth--;
              i++;
            }
            continue;
          }
          i++;
        }
        result += code.slice(start, i);
        continue;
      }

      // Check for string (single or double quote)
      if (code[i] === '"' || code[i] === "'") {
        const quote = code[i];
        const start = i;
        i++;
        while (i < len) {
          if (code[i] === '\\') {
            i += 2;
            continue;
          }
          if (code[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        result += code.slice(start, i);
        continue;
      }

      // Check for regex (simple heuristic)
      if (code[i] === '/' && i > 0) {
        const prev = code[i - 1];
        // Regex can follow: ( = : [ ! & | ? { } ; , \n
        if ('(=:[!&|?{};,\n'.includes(prev) || /\s/.test(prev)) {
          const start = i;
          i++;
          while (i < len) {
            if (code[i] === '\\') {
              i += 2;
              continue;
            }
            if (code[i] === '/') {
              i++;
              // Skip flags
              while (i < len && /[gimsuy]/.test(code[i])) i++;
              break;
            }
            if (code[i] === '\n') break; // Invalid regex
            i++;
          }
          result += code.slice(start, i);
          continue;
        }
      }

      // Check for const/let keywords
      if (isWordBoundary(code, i)) {
        if (code.slice(i, i + 5) === 'const' && isWordBoundary(code, i + 5)) {
          result += 'var';
          i += 5;
          continue;
        }
        if (code.slice(i, i + 3) === 'let' && isWordBoundary(code, i + 3)) {
          result += 'var';
          i += 3;
          continue;
        }
      }

      result += code[i];
      i++;
    }

    return result;
  }

  /**
   * Check if position is at a word boundary
   * @param {string} code
   * @param {number} pos
   * @returns {boolean}
   */
  function isWordBoundary(code, pos) {
    if (pos === 0) return true;
    if (pos >= code.length) return true;

    const before = code[pos - 1];
    const after = code[pos];

    const isWordChar = (c) => /[a-zA-Z0-9_$]/.test(c);

    // Boundary if previous char is not a word char
    if (pos > 0 && isWordChar(before)) return false;
    // Or if position is at end and next char is not word char
    if (pos < code.length && !isWordChar(after)) return true;

    return true;
  }

  /**
   * Async Transform
   *
   * Wraps code to support top-level await.
   * @module transform/async
   */

  /**
   * Check if code contains top-level await
   * @param {string} code
   * @returns {boolean}
   */
  function hasTopLevelAwait(code) {
    // Simple check - look for await outside of async function/arrow
    // This is a heuristic; a proper check would need AST parsing

    // Remove strings, comments, and regex to avoid false positives
    const cleaned = code
      // Remove template literals (simple version)
      .replace(/`[^`]*`/g, '')
      // Remove strings
      .replace(/"(?:[^"\\]|\\.)*"/g, '')
      .replace(/'(?:[^'\\]|\\.)*'/g, '')
      // Remove single-line comments
      .replace(/\/\/[^\n]*/g, '')
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');
    let i = 0;

    while (i < cleaned.length) {
      // Check for async function or async arrow
      if (cleaned.slice(i, i + 5) === 'async') {
        // Look ahead for function or arrow
        let j = i + 5;
        while (j < cleaned.length && /\s/.test(cleaned[j])) j++;

        if (
          cleaned.slice(j, j + 8) === 'function' ||
          cleaned[j] === '('
        ) ;
      }

      // Track braces for context depth (simplified)
      if (cleaned[i] === '{') ;
      if (cleaned[i] === '}') ;

      // Check for await at top level
      if (cleaned.slice(i, i + 5) === 'await') {
        const before = i > 0 ? cleaned[i - 1] : ' ';
        const after = i + 5 < cleaned.length ? cleaned[i + 5] : ' ';

        // Check it's a word boundary
        if (!/[a-zA-Z0-9_$]/.test(before) && !/[a-zA-Z0-9_$]/.test(after)) {
          // Found await - check if we're at top level
          // For simplicity, assume any await not deep in braces is top-level
          // A proper implementation would track async function scopes
          return true;
        }
      }

      i++;
    }

    return false;
  }

  /**
   * Wrap code for top-level await support
   *
   * Transforms code to run in an async IIFE that captures the last expression.
   *
   * @param {string} code - Source code
   * @returns {string} Wrapped code
   */
  function wrapForAsync(code) {
    const needsAsync = hasTopLevelAwait(code);

    // We always wrap to capture the return value
    // The wrapper captures the last expression value

    if (needsAsync) {
      return `(async () => {
${code}
})()`;
    }

    return `(() => {
${code}
})()`;
  }

  /**
   * Wrap code and capture the last expression value
   *
   * @param {string} code - Source code
   * @returns {string} Wrapped code that returns last expression
   */
  function wrapWithLastExpression(code) {
    const needsAsync = hasTopLevelAwait(code);

    // Find the last expression and make it a return value
    // This is tricky without AST - we use eval trick instead
    const wrapped = `
;(${needsAsync ? 'async ' : ''}function() {
  let __result__;
  try {
    __result__ = eval(${JSON.stringify(code)});
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Code might be statements, not expression
      eval(${JSON.stringify(code)});
      __result__ = undefined;
    } else {
      throw e;
    }
  }
  return __result__;
})()`;

    return wrapped.trim();
  }

  /**
   * JavaScript Executor
   *
   * Executes JavaScript code in an execution context.
   * Handles variable persistence, async/await, and console output.
   *
   * @module execute/javascript
   */


  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/execution.js').ExecuteOptions} ExecuteOptions
   * @typedef {import('../types/execution.js').ExecutionResult} ExecutionResult
   * @typedef {import('../types/execution.js').ExecutionError} ExecutionError
   * @typedef {import('../types/execution.js').DisplayData} DisplayData
   */

  /**
   * Format a value for display as a string
   * @param {*} value
   * @param {number} [maxLength=1000]
   * @returns {string | undefined}
   */
  function formatValue$1(value, maxLength = 1000) {
    if (value === undefined) return undefined;
    if (value === null) return 'null';

    if (typeof value === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value, null, 2);
        if (json.length > maxLength) {
          return json.slice(0, maxLength) + '...';
        }
        return json;
      } catch {
        return String(value);
      }
    }

    const str = String(value);
    if (str.length > maxLength) {
      return str.slice(0, maxLength) + '...';
    }
    return str;
  }

  /**
   * JavaScript executor
   */
  class JavaScriptExecutor extends BaseExecutor {
    /** @type {readonly string[]} */
    languages = ['javascript', 'js', 'ecmascript', 'es'];

    /**
     * Execute JavaScript code
     * @param {string} code - Code to execute
     * @param {ExecutionContext} context - Execution context
     * @param {ExecuteOptions} [options] - Execution options
     * @returns {Promise<ExecutionResult>}
     */
    async execute(code, context, options = {}) {
      const startTime = performance.now();

      // Extract and track declared variables
      const declaredVars = extractDeclaredVariables(code);
      for (const varName of declaredVars) {
        context.trackVariable(varName);
      }

      // Transform code for persistence (const/let → var)
      const transformed = transformForPersistence(code);

      // Wrap to capture last expression value and support async
      const wrapped = wrapWithLastExpression(transformed);

      try {
        // Execute in context
        const rawResult = await context.execute(wrapped);
        const duration = performance.now() - startTime;

        // Format result
        return this.#formatResult(rawResult, context, duration, options);
      } catch (error) {
        const duration = performance.now() - startTime;

        return {
          success: false,
          stdout: '',
          stderr: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
          error: this.#formatError(error),
          displayData: [],
          assets: [],
          executionCount: 0,
          duration,
        };
      }
    }

    /**
     * Format raw execution result to MRP ExecutionResult
     * @param {import('../session/context/interface.js').RawExecutionResult} raw
     * @param {ExecutionContext} context
     * @param {number} duration
     * @param {ExecuteOptions} options
     * @returns {ExecutionResult}
     */
    #formatResult(raw, context, duration, options) {
      // Separate logs into stdout/stderr
      const stdout = raw.logs
        .filter((log) => log.type === 'log' || log.type === 'info')
        .map((log) => log.args.map((arg) => formatValue$1(arg) ?? '').join(' '))
        .join('\n');

      const stderr = raw.logs
        .filter((log) => log.type === 'error' || log.type === 'warn')
        .map((log) => {
          const prefix = log.type === 'error' ? 'Error: ' : 'Warning: ';
          return prefix + log.args.map((arg) => formatValue$1(arg) ?? '').join(' ');
        })
        .join('\n');

      // Format error if present
      /** @type {ExecutionError | undefined} */
      let error;
      if (raw.error) {
        error = this.#formatError(raw.error);
      }

      // Get display data from context
      /** @type {DisplayData[]} */
      const displayData = 'getDisplayQueue' in context ? context.getDisplayQueue() : [];

      return {
        success: !raw.error,
        stdout,
        stderr,
        result: raw.result,
        resultString: formatValue$1(raw.result),
        error,
        displayData,
        assets: [],
        executionCount: 0, // Will be set by session
        duration,
      };
    }

    /**
     * Format an error
     * @param {*} error
     * @returns {ExecutionError}
     */
    #formatError(error) {
      if (error instanceof Error) {
        /** @type {ExecutionError} */
        const formatted = {
          type: error.name,
          message: error.message,
          traceback: error.stack?.split('\n'),
        };

        // Try to extract line/column from stack
        const lineMatch = error.stack?.match(/:(\d+):(\d+)/);
        if (lineMatch) {
          formatted.line = parseInt(lineMatch[1], 10);
          formatted.column = parseInt(lineMatch[2], 10);
        }

        return formatted;
      }

      return {
        type: 'Error',
        message: String(error),
      };
    }
  }

  /**
   * Create a JavaScript executor
   * @returns {JavaScriptExecutor}
   */
  function createJavaScriptExecutor() {
    return new JavaScriptExecutor();
  }

  /**
   * Code Parsing Utilities
   *
   * Utilities for parsing JavaScript code to extract identifiers,
   * determine completion context, and find symbol boundaries.
   *
   * @module lsp/parse
   */

  /**
   * @typedef {Object} IdentifierInfo
   * @property {string} name - The identifier name
   * @property {string} full - Full path (e.g., "obj.prop" or "arr[0]")
   * @property {number} start - Start position in code
   * @property {number} end - End position in code
   */

  /**
   * @typedef {'member' | 'global' | 'bracket' | 'string' | 'comment' | 'none'} CompletionContextType
   */

  /**
   * @typedef {Object} CompletionContext
   * @property {CompletionContextType} type - Context type
   * @property {string} prefix - What user has typed
   * @property {string} [object] - Object path for member access
   * @property {number} start - Start of completion region
   * @property {number} end - End of completion region
   */

  // Characters that can be part of an identifier
  const ID_START = /[$_a-zA-Z]/;
  const ID_CONTINUE = /[$_a-zA-Z0-9]/;

  // JavaScript keywords
  const KEYWORDS = new Set([
    'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export',
    'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
    'in', 'instanceof', 'let', 'new', 'null', 'return', 'static',
    'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
    'undefined', 'var', 'void', 'while', 'with', 'yield',
    // Future reserved
    'implements', 'interface', 'package', 'private', 'protected', 'public',
  ]);

  // Common globals to suggest
  const COMMON_GLOBALS = [
    'Array', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Map',
    'Math', 'Number', 'Object', 'Promise', 'Proxy', 'Reflect', 'RegExp',
    'Set', 'String', 'Symbol', 'WeakMap', 'WeakSet',
    'console', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout',
    'clearInterval', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  ];

  /**
   * Check if a character is an identifier start
   * @param {string} char
   * @returns {boolean}
   */
  function isIdentifierStart(char) {
    return ID_START.test(char);
  }

  /**
   * Check if a character is an identifier continuation
   * @param {string} char
   * @returns {boolean}
   */
  function isIdentifierPart(char) {
    return ID_CONTINUE.test(char);
  }

  /**
   * Check if a string is a JavaScript keyword
   * @param {string} str
   * @returns {boolean}
   */
  function isKeyword(str) {
    return KEYWORDS.has(str);
  }

  /**
   * Get all JavaScript keywords
   * @returns {string[]}
   */
  function getKeywords() {
    return Array.from(KEYWORDS);
  }

  /**
   * Get common global names
   * @returns {string[]}
   */
  function getCommonGlobals() {
    return COMMON_GLOBALS;
  }

  /**
   * Find the identifier at a given position in code
   * @param {string} code
   * @param {number} cursor - Cursor position (0-indexed)
   * @returns {IdentifierInfo | null}
   */
  function parseIdentifierAtPosition(code, cursor) {
    if (!code || cursor < 0 || cursor > code.length) {
      return null;
    }

    // Find the start of the identifier chain (handles obj.prop.sub)
    let start = cursor;
    let parenDepth = 0;
    let bracketDepth = 0;

    // Walk backwards to find the start
    while (start > 0) {
      const char = code[start - 1];

      // Handle brackets for array access
      if (char === ']') {
        bracketDepth++;
        start--;
        continue;
      }
      if (char === '[') {
        if (bracketDepth > 0) {
          bracketDepth--;
          start--;
          continue;
        }
        break;
      }

      // Skip over bracket contents
      if (bracketDepth > 0) {
        start--;
        continue;
      }

      // Handle dots for member access
      if (char === '.') {
        start--;
        continue;
      }

      // Handle identifier characters
      if (isIdentifierPart(char)) {
        start--;
        continue;
      }

      // Handle closing paren (for function calls like foo().bar)
      if (char === ')') {
        parenDepth++;
        start--;
        continue;
      }
      if (char === '(') {
        if (parenDepth > 0) {
          parenDepth--;
          start--;
          continue;
        }
        break;
      }

      // Skip over paren contents
      if (parenDepth > 0) {
        start--;
        continue;
      }

      // Stop at any other character
      break;
    }

    // Find the end of the identifier
    let end = cursor;
    while (end < code.length && isIdentifierPart(code[end])) {
      end++;
    }

    if (start === end) {
      return null;
    }

    const full = code.slice(start, end);

    // Extract just the last identifier name
    const lastDot = full.lastIndexOf('.');
    const name = lastDot >= 0 ? full.slice(lastDot + 1) : full;

    return {
      name,
      full,
      start,
      end,
    };
  }

  /**
   * Determine the completion context at cursor position
   * @param {string} code
   * @param {number} cursor
   * @returns {CompletionContext}
   */
  function parseCompletionContext(code, cursor) {
    // Default result
    const defaultResult = {
      type: /** @type {CompletionContextType} */ ('none'),
      prefix: '',
      start: cursor,
      end: cursor,
    };

    if (!code || cursor < 0 || cursor > code.length) {
      return defaultResult;
    }

    // Check if we're in a string or comment
    const contextType = getStringOrCommentContext(code, cursor);
    if (contextType === 'string' || contextType === 'comment') {
      return { type: contextType, prefix: '', start: cursor, end: cursor };
    }

    // Find what's immediately before the cursor
    let pos = cursor - 1;

    // Skip whitespace
    while (pos >= 0 && /\s/.test(code[pos])) {
      pos--;
    }

    if (pos < 0) {
      return { type: 'global', prefix: '', start: cursor, end: cursor };
    }

    // Check for member access (dot notation)
    if (code[pos] === '.') {
      // Find the object before the dot
      const objectEnd = pos;
      const objectInfo = parseIdentifierAtPosition(code, objectEnd);

      if (objectInfo) {
        return {
          type: 'member',
          prefix: '',
          object: objectInfo.full,
          start: cursor,
          end: cursor,
        };
      }

      return { type: 'member', prefix: '', object: '', start: cursor, end: cursor };
    }

    // Check if we're typing an identifier
    if (isIdentifierPart(code[pos])) {
      // Walk back to find the start
      let start = pos;
      while (start > 0 && isIdentifierPart(code[start - 1])) {
        start--;
      }

      const prefix = code.slice(start, cursor);

      // Check what's before this identifier
      let beforeStart = start - 1;
      while (beforeStart >= 0 && /\s/.test(code[beforeStart])) {
        beforeStart--;
      }

      if (beforeStart >= 0 && code[beforeStart] === '.') {
        // Member access with partial identifier
        const objectEnd = beforeStart;
        const objectInfo = parseIdentifierAtPosition(code, objectEnd);

        return {
          type: 'member',
          prefix,
          object: objectInfo?.full ?? '',
          start,
          end: cursor,
        };
      }

      // Global identifier
      return {
        type: 'global',
        prefix,
        start,
        end: cursor,
      };
    }

    // Check for bracket access
    if (code[pos] === '[') {
      // Find the object before the bracket
      const objectEnd = pos;
      const objectInfo = parseIdentifierAtPosition(code, objectEnd);

      if (objectInfo) {
        return {
          type: 'bracket',
          prefix: '',
          object: objectInfo.full,
          start: cursor,
          end: cursor,
        };
      }
    }

    return { type: 'global', prefix: '', start: cursor, end: cursor };
  }

  /**
   * Determine if cursor is inside a string or comment
   * @param {string} code
   * @param {number} cursor
   * @returns {'string' | 'comment' | null}
   */
  function getStringOrCommentContext(code, cursor) {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < cursor && i < code.length; i++) {
      const char = code[i];
      const next = code[i + 1];
      const prev = code[i - 1];

      // Skip escaped characters in strings
      if ((inSingleQuote || inDoubleQuote || inTemplate) && prev === '\\') {
        continue;
      }

      // Line comment
      if (!inSingleQuote && !inDoubleQuote && !inTemplate && !inBlockComment) {
        if (char === '/' && next === '/') {
          inLineComment = true;
          i++; // Skip next char
          continue;
        }
      }

      // Block comment
      if (!inSingleQuote && !inDoubleQuote && !inTemplate && !inLineComment) {
        if (char === '/' && next === '*') {
          inBlockComment = true;
          i++;
          continue;
        }
        if (inBlockComment && char === '*' && next === '/') {
          inBlockComment = false;
          i++;
          continue;
        }
      }

      // End line comment at newline
      if (inLineComment && char === '\n') {
        inLineComment = false;
        continue;
      }

      // Strings
      if (!inLineComment && !inBlockComment) {
        if (char === "'" && !inDoubleQuote && !inTemplate) {
          inSingleQuote = !inSingleQuote;
          continue;
        }
        if (char === '"' && !inSingleQuote && !inTemplate) {
          inDoubleQuote = !inDoubleQuote;
          continue;
        }
        if (char === '`' && !inSingleQuote && !inDoubleQuote) {
          inTemplate = !inTemplate;
          continue;
        }
      }
    }

    if (inSingleQuote || inDoubleQuote || inTemplate) {
      return 'string';
    }
    if (inLineComment || inBlockComment) {
      return 'comment';
    }
    return null;
  }

  /**
   * Extract the word at cursor position (simpler than full identifier)
   * @param {string} code
   * @param {number} cursor
   * @returns {{word: string, start: number, end: number}}
   */
  function getWordAtCursor(code, cursor) {
    let start = cursor;
    let end = cursor;

    // Walk backwards
    while (start > 0 && isIdentifierPart(code[start - 1])) {
      start--;
    }

    // Walk forwards
    while (end < code.length && isIdentifierPart(code[end])) {
      end++;
    }

    return {
      word: code.slice(start, end),
      start,
      end,
    };
  }

  /**
   * Split an object path into parts
   * e.g., "obj.prop[0].name" → ["obj", "prop", "0", "name"]
   * @param {string} path
   * @returns {string[]}
   */
  function splitObjectPath(path) {
    const parts = [];
    let current = '';
    let inBracket = false;

    for (const char of path) {
      if (char === '.' && !inBracket) {
        if (current) parts.push(current);
        current = '';
      } else if (char === '[') {
        if (current) parts.push(current);
        current = '';
        inBracket = true;
      } else if (char === ']') {
        if (current) parts.push(current);
        current = '';
        inBracket = false;
      } else if (char === '"' || char === "'") {
        // Skip quotes in bracket notation
        continue;
      } else {
        current += char;
      }
    }

    if (current) parts.push(current);
    return parts;
  }

  /**
   * Value Formatting Utilities
   *
   * Utilities for formatting JavaScript values for display in
   * completions, hover, and variable inspection.
   *
   * @module lsp/format
   */

  /**
   * Format a value for display as a string
   * @param {*} value
   * @param {number} [maxLength=1000]
   * @returns {string | undefined}
   */
  function formatValue(value, maxLength = 1000) {
    if (value === undefined) return undefined;
    if (value === null) return 'null';

    if (typeof value === 'function') {
      const name = value.name || 'anonymous';
      return `[Function: ${name}]`;
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    }

    if (value instanceof RegExp) {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Map) {
      const preview = Array.from(value.entries())
        .slice(0, 5)
        .map(([k, v]) => `${formatValueShort(k)} => ${formatValueShort(v)}`)
        .join(', ');
      const more = value.size > 5 ? `, ... (${value.size} total)` : '';
      return `Map(${value.size}) {${preview}${more}}`;
    }

    if (value instanceof Set) {
      const preview = Array.from(value)
        .slice(0, 5)
        .map(formatValueShort)
        .join(', ');
      const more = value.size > 5 ? `, ... (${value.size} total)` : '';
      return `Set(${value.size}) {${preview}${more}}`;
    }

    if (Array.isArray(value)) {
      const preview = value.slice(0, 5).map(formatValueShort).join(', ');
      const more = value.length > 5 ? `, ... (${value.length} total)` : '';
      return `[${preview}${more}]`;
    }

    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value, null, 2);
        if (json.length > maxLength) {
          return json.slice(0, maxLength) + '...';
        }
        return json;
      } catch {
        return String(value);
      }
    }

    const str = String(value);
    if (str.length > maxLength) {
      return str.slice(0, maxLength) + '...';
    }
    return str;
  }

  /**
   * Format a value for short display (single line, truncated)
   * @param {*} value
   * @param {number} [maxLength=50]
   * @returns {string}
   */
  function formatValueShort(value, maxLength = 50) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';

    if (typeof value === 'string') {
      const truncated = value.length > maxLength - 2
        ? value.slice(0, maxLength - 5) + '...'
        : value;
      return JSON.stringify(truncated);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (typeof value === 'function') {
      return `ƒ ${value.name || 'anonymous'}()`;
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof RegExp) {
      const str = value.toString();
      return str.length > maxLength ? str.slice(0, maxLength - 3) + '...' : str;
    }

    if (value instanceof Map) {
      return `Map(${value.size})`;
    }

    if (value instanceof Set) {
      return `Set(${value.size})`;
    }

    if (value instanceof Error) {
      return `${value.name}: ${value.message.slice(0, 30)}`;
    }

    if (typeof value === 'object') {
      const constructor = value.constructor?.name;
      if (constructor && constructor !== 'Object') {
        return constructor;
      }
      const keys = Object.keys(value);
      return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`;
    }

    return String(value).slice(0, maxLength);
  }

  /**
   * Get type name for a value
   * @param {*} value
   * @returns {string}
   */
  function getTypeName(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'Array';
    if (value instanceof Date) return 'Date';
    if (value instanceof RegExp) return 'RegExp';
    if (value instanceof Error) return value.constructor.name;
    if (value instanceof Map) return 'Map';
    if (value instanceof Set) return 'Set';
    if (value instanceof WeakMap) return 'WeakMap';
    if (value instanceof WeakSet) return 'WeakSet';
    if (value instanceof Promise) return 'Promise';
    if (value instanceof ArrayBuffer) return 'ArrayBuffer';

    // Typed arrays
    if (ArrayBuffer.isView(value)) {
      return value.constructor.name;
    }

    const type = typeof value;
    if (type === 'object') {
      const constructor = value.constructor;
      if (constructor && constructor.name !== 'Object') {
        return constructor.name;
      }
      return 'Object';
    }

    return type;
  }

  /**
   * Get the kind of a value for completion icons
   * @param {*} value
   * @returns {import('../types/completion.js').CompletionKind}
   */
  function getCompletionKind(value) {
    if (value === null || value === undefined) {
      return 'value';
    }

    if (typeof value === 'function') {
      // Check if it's a class (constructor)
      if (/^class\s/.test(value.toString())) {
        return 'class';
      }
      return 'function';
    }

    if (typeof value === 'object') {
      if (Array.isArray(value)) return 'variable';
      if (value instanceof Map || value instanceof Set) return 'variable';
      return 'variable';
    }

    return 'value';
  }

  /**
   * Check if a value is expandable (has children)
   * @param {*} value
   * @returns {boolean}
   */
  function isExpandable(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'object') return true;
    if (typeof value === 'function') return true;
    return false;
  }

  /**
   * Get function signature from a function
   * @param {Function} fn
   * @returns {string}
   */
  function getFunctionSignature(fn) {
    if (typeof fn !== 'function') return '';

    const str = fn.toString();

    // Handle arrow functions
    if (str.startsWith('(') || /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>/.test(str)) {
      const match = str.match(/^(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/);
      if (match) {
        const params = match[1].startsWith('(') ? match[1] : `(${match[1]})`;
        return `${params} => ...`;
      }
    }

    // Handle regular functions
    const funcMatch = str.match(/^(?:async\s+)?function\s*([^(]*)\(([^)]*)\)/);
    if (funcMatch) {
      const name = funcMatch[1].trim() || fn.name || 'anonymous';
      const params = funcMatch[2];
      return `function ${name}(${params})`;
    }

    // Handle method shorthand
    const methodMatch = str.match(/^(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/);
    if (methodMatch) {
      return `${methodMatch[1]}(${methodMatch[2]})`;
    }

    // Handle class
    if (str.startsWith('class')) {
      return `class ${fn.name || 'anonymous'}`;
    }

    // Fallback
    const name = fn.name || 'anonymous';
    const length = fn.length;
    const params = Array(length).fill('arg').map((a, i) => `${a}${i}`).join(', ');
    return `${name}(${params})`;
  }

  /**
   * Get source code for a function (if available)
   * @param {Function} fn
   * @returns {string | undefined}
   */
  function getFunctionSource(fn) {
    if (typeof fn !== 'function') return undefined;

    try {
      const source = fn.toString();
      // Check if it's native code
      if (source.includes('[native code]')) {
        return undefined;
      }
      return source;
    } catch {
      return undefined;
    }
  }

  /**
   * Get size description for a value
   * @param {*} value
   * @returns {string | undefined}
   */
  function getSizeDescription(value) {
    if (Array.isArray(value)) {
      return `${value.length} items`;
    }
    if (value instanceof Map || value instanceof Set) {
      return `${value.size} items`;
    }
    if (typeof value === 'string') {
      return `${value.length} chars`;
    }
    if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);
      return `${keys.length} keys`;
    }
    return undefined;
  }

  /**
   * Code Completion
   *
   * Provides runtime-aware code completions by introspecting live values
   * in the execution context.
   *
   * @module lsp/complete
   */


  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/completion.js').CompletionResult} CompletionResult
   * @typedef {import('../types/completion.js').CompletionItem} CompletionItem
   * @typedef {import('../types/completion.js').CompleteOptions} CompleteOptions
   */

  /**
   * Get completions at cursor position
   *
   * @param {string} code - The code being edited
   * @param {number} cursor - Cursor position (0-indexed)
   * @param {ExecutionContext} context - Execution context for live values
   * @param {CompleteOptions} [options]
   * @returns {CompletionResult}
   */
  function getCompletions(code, cursor, context, options = {}) {
    const ctx = parseCompletionContext(code, cursor);

    // Don't complete inside strings or comments
    if (ctx.type === 'string' || ctx.type === 'comment') {
      return {
        matches: [],
        cursorStart: cursor,
        cursorEnd: cursor,
        source: 'runtime',
      };
    }

    /** @type {CompletionItem[]} */
    let matches = [];

    switch (ctx.type) {
      case 'member':
        matches = getMemberCompletions(ctx.object || '', ctx.prefix, context);
        break;

      case 'bracket':
        matches = getBracketCompletions(ctx.object || '', context);
        break;

      case 'global':
      default:
        matches = getGlobalCompletions(ctx.prefix, context);
        break;
    }

    // Filter by prefix
    if (ctx.prefix) {
      const lowerPrefix = ctx.prefix.toLowerCase();
      matches = matches.filter(item =>
        item.label.toLowerCase().startsWith(lowerPrefix)
      );
    }

    // Sort by priority and name
    matches.sort((a, b) => {
      const priorityDiff = (a.sortPriority ?? 50) - (b.sortPriority ?? 50);
      if (priorityDiff !== 0) return priorityDiff;
      return a.label.localeCompare(b.label);
    });

    return {
      matches,
      cursorStart: ctx.start,
      cursorEnd: ctx.end,
      source: 'runtime',
    };
  }

  /**
   * Get completions for member access (dot notation)
   * @param {string} objectPath
   * @param {string} prefix
   * @param {ExecutionContext} context
   * @returns {CompletionItem[]}
   */
  function getMemberCompletions(objectPath, prefix, context) {
    if (!objectPath) return [];

    // Resolve the object in context
    const value = resolveValue$2(objectPath, context);
    if (value === undefined && !objectPath.includes('.')) {
      // Check if it's a global
      const global = context.getGlobal();
      if (global && objectPath in global) {
        // @ts-ignore
        return getPropertiesOf(global[objectPath]);
      }
    }

    if (value === undefined || value === null) {
      return [];
    }

    return getPropertiesOf(value);
  }

  /**
   * Get completions for bracket access
   * @param {string} objectPath
   * @param {ExecutionContext} context
   * @returns {CompletionItem[]}
   */
  function getBracketCompletions(objectPath, context) {
    const value = resolveValue$2(objectPath, context);

    if (Array.isArray(value)) {
      // Suggest indices
      return value.slice(0, 20).map((_, i) => ({
        label: String(i),
        kind: /** @type {const} */ ('value'),
        detail: getTypeName(value[i]),
        valuePreview: formatValueShort(value[i]),
        sortPriority: 10,
      }));
    }

    if (value instanceof Map) {
      // Suggest keys
      return Array.from(value.keys()).slice(0, 20).map(key => ({
        label: String(key),
        insertText: typeof key === 'string' ? `"${key}"` : String(key),
        kind: /** @type {const} */ ('property'),
        detail: getTypeName(value.get(key)),
        valuePreview: formatValueShort(value.get(key)),
        sortPriority: 10,
      }));
    }

    if (typeof value === 'object' && value !== null) {
      // Suggest string keys
      return Object.keys(value).slice(0, 50).map(key => ({
        label: key,
        insertText: `"${key}"`,
        kind: /** @type {const} */ ('property'),
        detail: getTypeName(value[key]),
        valuePreview: formatValueShort(value[key]),
        sortPriority: 10,
      }));
    }

    return [];
  }

  /**
   * Get completions for global context
   * @param {string} prefix
   * @param {ExecutionContext} context
   * @returns {CompletionItem[]}
   */
  function getGlobalCompletions(prefix, context) {
    /** @type {CompletionItem[]} */
    const items = [];

    // 1. User-defined variables (highest priority)
    const userVars = context.getVariables();
    for (const [name, value] of Object.entries(userVars)) {
      items.push({
        label: name,
        kind: getCompletionKind(value),
        detail: getTypeName(value),
        valuePreview: formatValueShort(value),
        type: getTypeName(value),
        sortPriority: 10,
      });
    }

    // 2. Keywords
    for (const keyword of getKeywords()) {
      items.push({
        label: keyword,
        kind: 'keyword',
        sortPriority: 60,
      });
    }

    // 3. Common globals
    const global = context.getGlobal();
    for (const name of getCommonGlobals()) {
      if (name in userVars) continue; // Skip if user defined

      try {
        // @ts-ignore
        const value = global?.[name];
        if (value !== undefined) {
          items.push({
            label: name,
            kind: getCompletionKind(value),
            detail: getTypeName(value),
            type: getTypeName(value),
            sortPriority: 40,
          });
        }
      } catch {
        // Skip inaccessible
      }
    }

    // 4. Add some built-in globals that might be useful
    const builtinGlobals = ['globalThis', 'window', 'document', 'navigator', 'location'];
    for (const name of builtinGlobals) {
      if (name in userVars) continue;
      try {
        // @ts-ignore
        const value = global?.[name];
        if (value !== undefined) {
          items.push({
            label: name,
            kind: 'variable',
            detail: getTypeName(value),
            sortPriority: 50,
          });
        }
      } catch {
        // Skip inaccessible
      }
    }

    return items;
  }

  /**
   * Get all properties of an object as completion items
   * @param {*} value
   * @returns {CompletionItem[]}
   */
  function getPropertiesOf(value) {
    /** @type {CompletionItem[]} */
    const items = [];
    const seen = new Set();

    // Walk prototype chain
    let obj = value;
    let depth = 0;

    while (obj != null && depth < 5) {
      const names = Object.getOwnPropertyNames(obj);

      for (const name of names) {
        if (seen.has(name)) continue;
        if (name === 'constructor') continue; // Skip constructor
        seen.add(name);

        try {
          const descriptor = Object.getOwnPropertyDescriptor(obj, name);
          const propValue = descriptor?.get ? undefined : value[name];

          /** @type {CompletionItem} */
          const item = {
            label: name,
            kind: typeof propValue === 'function' ? 'method' : 'property',
            sortPriority: depth === 0 ? 20 : 30 + depth,
          };

          if (propValue !== undefined) {
            item.detail = getTypeName(propValue);
            item.type = getTypeName(propValue);

            if (typeof propValue === 'function') {
              item.detail = getFunctionSignature(propValue);
            } else {
              item.valuePreview = formatValueShort(propValue);
            }
          } else if (descriptor?.get) {
            item.detail = '(getter)';
          }

          items.push(item);
        } catch {
          // Skip inaccessible properties
          items.push({
            label: name,
            kind: 'property',
            detail: '(inaccessible)',
            sortPriority: 90,
          });
        }
      }

      obj = Object.getPrototypeOf(obj);
      depth++;
    }

    return items;
  }

  /**
   * Resolve a value from an object path in the context
   * @param {string} path
   * @param {ExecutionContext} context
   * @returns {*}
   */
  function resolveValue$2(path, context) {
    const parts = splitObjectPath(path);
    if (parts.length === 0) return undefined;

    // Start with user variables or global
    let value = context.getVariable(parts[0]);

    if (value === undefined) {
      // Try global
      const global = context.getGlobal();
      if (global && parts[0] in global) {
        // @ts-ignore
        value = global[parts[0]];
      }
    }

    if (value === undefined) return undefined;

    // Navigate path
    for (let i = 1; i < parts.length; i++) {
      if (value === null || value === undefined) return undefined;

      try {
        if (value instanceof Map) {
          value = value.get(parts[i]);
        } else {
          // @ts-ignore
          value = value[parts[i]];
        }
      } catch {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Hover Information
   *
   * Provides hover information (type and value preview) for symbols
   * by introspecting live values in the execution context.
   *
   * @module lsp/hover
   */


  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/inspection.js').HoverResult} HoverResult
   */

  /**
   * Get hover information at cursor position
   *
   * @param {string} code - The code being edited
   * @param {number} cursor - Cursor position (0-indexed)
   * @param {ExecutionContext} context - Execution context for live values
   * @returns {HoverResult}
   */
  function getHoverInfo(code, cursor, context) {
    // Find identifier at cursor
    const identifier = parseIdentifierAtPosition(code, cursor);

    if (!identifier) {
      return { found: false };
    }

    // Resolve the value
    const value = resolveValue$1(identifier.full, context);

    // Check if it exists
    const exists = value !== undefined || hasVariable$1(identifier.full, context);

    if (!exists) {
      return { found: false };
    }

    /** @type {HoverResult} */
    const result = {
      found: true,
      name: identifier.full,
      type: getTypeName(value),
    };

    // Add signature for functions
    if (typeof value === 'function') {
      result.signature = getFunctionSignature(value);
    } else {
      // Add value preview for non-functions
      result.value = formatValueShort(value, 100);
    }

    return result;
  }

  /**
   * Resolve a value from an object path in the context
   * @param {string} path
   * @param {ExecutionContext} context
   * @returns {*}
   */
  function resolveValue$1(path, context) {
    const parts = splitObjectPath(path);
    if (parts.length === 0) return undefined;

    // Start with user variables or global
    let value = context.getVariable(parts[0]);

    if (value === undefined) {
      // Try global
      const global = context.getGlobal();
      if (global && parts[0] in global) {
        // @ts-ignore
        value = global[parts[0]];
      }
    }

    if (value === undefined) return undefined;

    // Navigate path
    for (let i = 1; i < parts.length; i++) {
      if (value === null || value === undefined) return undefined;

      try {
        if (value instanceof Map) {
          value = value.get(parts[i]);
        } else {
          // @ts-ignore
          value = value[parts[i]];
        }
      } catch {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Check if a variable exists in context
   * @param {string} path
   * @param {ExecutionContext} context
   * @returns {boolean}
   */
  function hasVariable$1(path, context) {
    const parts = splitObjectPath(path);
    if (parts.length === 0) return false;

    if (context.hasVariable(parts[0])) {
      return true;
    }

    // Check global
    const global = context.getGlobal();
    if (global && parts[0] in global) {
      return true;
    }

    return false;
  }

  /**
   * Symbol Inspection
   *
   * Provides detailed inspection information for symbols including
   * signature, documentation, source code, and children.
   *
   * @module lsp/inspect
   */


  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/inspection.js').InspectOptions} InspectOptions
   * @typedef {import('../types/inspection.js').InspectResult} InspectResult
   * @typedef {import('../types/variables.js').VariableInfo} VariableInfo
   */

  /**
   * Get detailed inspection information at cursor position
   *
   * @param {string} code - The code being edited
   * @param {number} cursor - Cursor position (0-indexed)
   * @param {ExecutionContext} context - Execution context for live values
   * @param {InspectOptions} [options]
   * @returns {InspectResult}
   */
  function getInspectInfo(code, cursor, context, options = {}) {
    const detail = options.detail ?? 0;

    // Find identifier at cursor
    const identifier = parseIdentifierAtPosition(code, cursor);

    if (!identifier) {
      return { found: false, source: 'runtime' };
    }

    // Resolve the value
    const value = resolveValue(identifier.full, context);

    // Check if it exists
    const exists = value !== undefined || hasVariable(identifier.full, context);

    if (!exists) {
      return { found: false, source: 'runtime' };
    }

    /** @type {InspectResult} */
    const result = {
      found: true,
      source: 'runtime',
      name: identifier.name,
      kind: getInspectKind(value),
      type: getTypeName(value),
      value: formatValueShort(value, 200),
    };

    // Add function-specific info
    if (typeof value === 'function') {
      result.signature = getFunctionSignature(value);

      // Detail level 1: add docstring
      if (detail >= 1) {
        result.docstring = getDocstring(value);
      }

      // Detail level 2: add source code
      if (detail >= 2) {
        result.sourceCode = getFunctionSource(value);
      }
    }

    // Add children for expandable values
    if (detail >= 1 && isExpandable(value)) {
      result.children = getChildren$1(value);
    }

    return result;
  }

  /**
   * Inspect a specific object path
   *
   * @param {string} path - Object path to inspect (e.g., "obj.prop")
   * @param {ExecutionContext} context
   * @param {InspectOptions} [options]
   * @returns {InspectResult}
   */
  function inspectPath(path, context, options = {}) {
    const detail = options.detail ?? 0;

    const value = resolveValue(path, context);
    const exists = value !== undefined || hasVariable(path, context);

    if (!exists) {
      return { found: false, source: 'runtime' };
    }

    const parts = splitObjectPath(path);
    const name = parts[parts.length - 1] || path;

    /** @type {InspectResult} */
    const result = {
      found: true,
      source: 'runtime',
      name,
      kind: getInspectKind(value),
      type: getTypeName(value),
      value: formatValueShort(value, 200),
    };

    if (typeof value === 'function') {
      result.signature = getFunctionSignature(value);

      if (detail >= 1) {
        result.docstring = getDocstring(value);
      }

      if (detail >= 2) {
        result.sourceCode = getFunctionSource(value);
      }
    }

    if (detail >= 1 && isExpandable(value)) {
      result.children = getChildren$1(value);
    }

    return result;
  }

  /**
   * Get kind string for inspection
   * @param {*} value
   * @returns {string}
   */
  function getInspectKind(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (typeof value === 'function') {
      const str = value.toString();
      if (str.startsWith('class ')) return 'class';
      if (/^(async\s+)?function\s*\*/.test(str)) return 'generator';
      if (str.includes('=>')) return 'arrow-function';
      return 'function';
    }

    if (Array.isArray(value)) return 'array';
    if (value instanceof Map) return 'map';
    if (value instanceof Set) return 'set';
    if (value instanceof Date) return 'date';
    if (value instanceof RegExp) return 'regexp';
    if (value instanceof Error) return 'error';
    if (value instanceof Promise) return 'promise';

    const type = typeof value;
    if (type === 'object') return 'object';

    return type;
  }

  /**
   * Get docstring for a function (if available)
   * @param {Function} fn
   * @returns {string | undefined}
   */
  function getDocstring(fn) {
    if (typeof fn !== 'function') return undefined;

    try {
      const source = fn.toString();

      // Try to find JSDoc-style comments
      // Look for /** ... */ before function declaration
      // This won't work for most runtime functions, but worth trying
      const jsdocMatch = source.match(/\/\*\*([\s\S]*?)\*\//);
      if (jsdocMatch) {
        return jsdocMatch[1]
          .split('\n')
          .map(line => line.replace(/^\s*\*\s?/, '').trim())
          .filter(line => line && !line.startsWith('@'))
          .join('\n')
          .trim();
      }

      // Check for built-in documentation (MDN-style)
      const builtinDocs = getBuiltinDocumentation(fn);
      if (builtinDocs) {
        return builtinDocs;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get documentation for built-in functions
   * @param {Function} fn
   * @returns {string | undefined}
   */
  function getBuiltinDocumentation(fn) {
    // Map of common built-in functions to their descriptions
    const docs = {
      // Array methods
      'push': 'Adds elements to the end of an array and returns the new length.',
      'pop': 'Removes the last element from an array and returns it.',
      'shift': 'Removes the first element from an array and returns it.',
      'unshift': 'Adds elements to the beginning of an array and returns the new length.',
      'slice': 'Returns a shallow copy of a portion of an array.',
      'splice': 'Changes the contents of an array by removing or replacing elements.',
      'map': 'Creates a new array with the results of calling a function on every element.',
      'filter': 'Creates a new array with all elements that pass a test.',
      'reduce': 'Executes a reducer function on each element, resulting in a single value.',
      'forEach': 'Executes a function once for each array element.',
      'find': 'Returns the first element that satisfies a testing function.',
      'findIndex': 'Returns the index of the first element that satisfies a testing function.',
      'includes': 'Determines whether an array includes a certain value.',
      'indexOf': 'Returns the first index at which a given element can be found.',
      'join': 'Joins all elements of an array into a string.',
      'sort': 'Sorts the elements of an array in place and returns the array.',
      'reverse': 'Reverses the elements of an array in place.',
      'concat': 'Merges two or more arrays into a new array.',
      'flat': 'Creates a new array with all sub-array elements concatenated.',
      'flatMap': 'Maps each element then flattens the result into a new array.',

      // String methods
      'charAt': 'Returns the character at a specified index.',
      'charCodeAt': 'Returns the Unicode value of the character at an index.',
      'split': 'Splits a string into an array of substrings.',
      'substring': 'Returns a portion of the string between two indices.',
      'substr': 'Returns a portion of the string starting from an index.',
      'toLowerCase': 'Returns the string converted to lowercase.',
      'toUpperCase': 'Returns the string converted to uppercase.',
      'trim': 'Removes whitespace from both ends of a string.',
      'trimStart': 'Removes whitespace from the beginning of a string.',
      'trimEnd': 'Removes whitespace from the end of a string.',
      'replace': 'Returns a new string with some or all matches replaced.',
      'replaceAll': 'Returns a new string with all matches replaced.',
      'match': 'Retrieves the result of matching a string against a regex.',
      'search': 'Searches for a match between a regex and the string.',
      'startsWith': 'Determines whether a string begins with specified characters.',
      'endsWith': 'Determines whether a string ends with specified characters.',
      'padStart': 'Pads the string with another string until it reaches the given length.',
      'padEnd': 'Pads the string with another string at the end.',
      'repeat': 'Returns a new string with copies of the original string.',

      // Object methods
      'hasOwnProperty': 'Returns a boolean indicating whether the object has the property.',
      'toString': 'Returns a string representation of the object.',
      'valueOf': 'Returns the primitive value of the object.',

      // Global functions
      'parseInt': 'Parses a string argument and returns an integer.',
      'parseFloat': 'Parses a string argument and returns a floating point number.',
      'isNaN': 'Determines whether a value is NaN.',
      'isFinite': 'Determines whether a value is a finite number.',
      'encodeURI': 'Encodes a URI by replacing certain characters.',
      'decodeURI': 'Decodes a URI previously created by encodeURI.',
      'encodeURIComponent': 'Encodes a URI component by replacing certain characters.',
      'decodeURIComponent': 'Decodes a URI component.',

      // JSON
      'parse': 'Parses a JSON string and returns the JavaScript value.',
      'stringify': 'Converts a JavaScript value to a JSON string.',

      // Math
      'abs': 'Returns the absolute value of a number.',
      'ceil': 'Rounds a number up to the next largest integer.',
      'floor': 'Rounds a number down to the largest integer.',
      'round': 'Rounds a number to the nearest integer.',
      'max': 'Returns the largest of zero or more numbers.',
      'min': 'Returns the smallest of zero or more numbers.',
      'pow': 'Returns the base raised to the exponent power.',
      'sqrt': 'Returns the square root of a number.',
      'random': 'Returns a random number between 0 and 1.',
      'sin': 'Returns the sine of a number.',
      'cos': 'Returns the cosine of a number.',
      'tan': 'Returns the tangent of a number.',
      'log': 'Returns the natural logarithm of a number.',
      'exp': 'Returns e raised to the power of a number.',

      // Console
      'log': 'Outputs a message to the console.',
      'error': 'Outputs an error message to the console.',
      'warn': 'Outputs a warning message to the console.',
      'info': 'Outputs an informational message to the console.',
      'debug': 'Outputs a debug message to the console.',
      'table': 'Displays tabular data as a table.',
      'clear': 'Clears the console.',
      'group': 'Creates a new inline group in the console.',
      'groupEnd': 'Exits the current inline group in the console.',
      'time': 'Starts a timer with a specified label.',
      'timeEnd': 'Stops a timer and logs the elapsed time.',
    };

    const name = fn.name;
    return docs[name];
  }

  /**
   * Get children of an expandable value as VariableInfo[]
   * @param {*} value
   * @param {number} [maxChildren=100]
   * @returns {VariableInfo[]}
   */
  function getChildren$1(value, maxChildren = 100) {
    if (value === null || value === undefined) return [];

    /** @type {VariableInfo[]} */
    const children = [];

    if (Array.isArray(value)) {
      const items = value.slice(0, maxChildren);
      for (let i = 0; i < items.length; i++) {
        children.push(formatVariableInfo$1(String(i), items[i]));
      }
    } else if (value instanceof Map) {
      let count = 0;
      for (const [k, v] of value) {
        if (count >= maxChildren) break;
        children.push(formatVariableInfo$1(String(k), v));
        count++;
      }
    } else if (value instanceof Set) {
      let count = 0;
      for (const v of value) {
        if (count >= maxChildren) break;
        children.push(formatVariableInfo$1(String(count), v));
        count++;
      }
    } else if (typeof value === 'object') {
      const keys = Object.keys(value).slice(0, maxChildren);
      for (const key of keys) {
        try {
          children.push(formatVariableInfo$1(key, value[key]));
        } catch {
          children.push({
            name: key,
            type: 'unknown',
            value: '(inaccessible)',
            expandable: false,
          });
        }
      }
    }

    return children;
  }

  /**
   * Format a variable for display
   * @param {string} name
   * @param {*} value
   * @returns {VariableInfo}
   */
  function formatVariableInfo$1(name, value) {
    /** @type {VariableInfo} */
    const info = {
      name,
      type: getTypeName(value),
      value: formatValueShort(value, 100),
      expandable: isExpandable(value),
    };

    // Add size info
    const size = getSizeDescription(value);
    if (size) {
      info.size = size;
    }

    // Add length for arrays/strings
    if (Array.isArray(value)) {
      info.length = value.length;
    } else if (typeof value === 'string') {
      info.length = value.length;
    } else if (value instanceof Map || value instanceof Set) {
      info.length = value.size;
    }

    // Add keys preview for objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (!(value instanceof Map) && !(value instanceof Set)) {
        info.keys = Object.keys(value).slice(0, 10);
      }
    }

    return info;
  }

  /**
   * Resolve a value from an object path in the context
   * @param {string} path
   * @param {ExecutionContext} context
   * @returns {*}
   */
  function resolveValue(path, context) {
    const parts = splitObjectPath(path);
    if (parts.length === 0) return undefined;

    // Start with user variables or global
    let value = context.getVariable(parts[0]);

    if (value === undefined) {
      // Try global
      const global = context.getGlobal();
      if (global && parts[0] in global) {
        // @ts-ignore
        value = global[parts[0]];
      }
    }

    if (value === undefined) return undefined;

    // Navigate path
    for (let i = 1; i < parts.length; i++) {
      if (value === null || value === undefined) return undefined;

      try {
        if (value instanceof Map) {
          value = value.get(parts[i]);
        } else {
          // @ts-ignore
          value = value[parts[i]];
        }
      } catch {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Check if a variable exists in context
   * @param {string} path
   * @param {ExecutionContext} context
   * @returns {boolean}
   */
  function hasVariable(path, context) {
    const parts = splitObjectPath(path);
    if (parts.length === 0) return false;

    if (context.hasVariable(parts[0])) {
      return true;
    }

    // Check global
    const global = context.getGlobal();
    if (global && parts[0] in global) {
      return true;
    }

    return false;
  }

  /**
   * Variable Inspection
   *
   * Provides variable listing and detailed inspection for the
   * variables panel in notebook UIs.
   *
   * @module lsp/variables
   */


  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/variables.js').VariableFilter} VariableFilter
   * @typedef {import('../types/variables.js').VariableInfo} VariableInfo
   * @typedef {import('../types/variables.js').VariableDetailOptions} VariableDetailOptions
   * @typedef {import('../types/variables.js').VariableDetail} VariableDetail
   */

  /**
   * List all variables in the session namespace
   *
   * @param {ExecutionContext} context - Execution context
   * @param {VariableFilter} [filter] - Optional filter
   * @returns {VariableInfo[]}
   */
  function listVariables(context, filter = {}) {
    const vars = context.getVariables();
    const tracked = context.getTrackedVariables();

    /** @type {VariableInfo[]} */
    const result = [];

    for (const name of tracked) {
      if (!(name in vars)) continue;

      const value = vars[name];

      // Apply filters
      if (filter.excludePrivate && name.startsWith('_')) continue;
      if (filter.namePattern && !new RegExp(filter.namePattern).test(name)) continue;
      if (filter.types && !filter.types.includes(getTypeName(value))) continue;

      result.push(formatVariableInfo(name, value));
    }

    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }

  /**
   * Get detailed information about a variable
   *
   * @param {string} name - Variable name
   * @param {ExecutionContext} context - Execution context
   * @param {VariableDetailOptions} [options]
   * @returns {VariableDetail | null}
   */
  function getVariableDetail(name, context, options = {}) {
    let value = context.getVariable(name);

    // Navigate path
    if (options.path && options.path.length > 0) {
      for (const key of options.path) {
        if (value == null) return null;

        try {
          if (value instanceof Map) {
            value = value.get(key);
          } else {
            value = /** @type {*} */ (value)[key];
          }
        } catch {
          return null;
        }
      }
    }

    // Check if exists
    if (value === undefined && !context.hasVariable(name)) {
      return null;
    }

    const maxChildren = options.maxChildren ?? 100;
    const maxValueLength = options.maxValueLength ?? 1000;

    const info = formatVariableInfo(name, value);

    /** @type {VariableDetail} */
    const detail = {
      ...info,
      fullValue: formatValue(value, maxValueLength),
      truncated: false,
    };

    // Add children for expandable values
    if (isExpandable(value)) {
      const children = getChildren(value);
      detail.children = children.slice(0, maxChildren).map(
        ([k, v]) => formatVariableInfo(k, v)
      );
      detail.truncated = children.length > maxChildren;

      // Get methods and attributes for objects
      if (typeof value === 'object' && value !== null) {
        detail.methods = getMethods(value);
        detail.attributes = getAttributes(value);
      }
    }

    return detail;
  }

  /**
   * Expand a variable by path
   *
   * @param {string} baseName - Base variable name
   * @param {string[]} path - Path to expand
   * @param {ExecutionContext} context
   * @param {number} [maxChildren=100]
   * @returns {VariableInfo[] | null}
   */
  function expandVariable(baseName, path, context, maxChildren = 100) {
    let value = context.getVariable(baseName);

    if (value === undefined) return null;

    // Navigate path
    for (const key of path) {
      if (value == null) return null;

      try {
        if (value instanceof Map) {
          value = value.get(key);
        } else {
          value = /** @type {*} */ (value)[key];
        }
      } catch {
        return null;
      }
    }

    if (!isExpandable(value)) {
      return null;
    }

    const children = getChildren(value);
    return children.slice(0, maxChildren).map(([k, v]) => formatVariableInfo(k, v));
  }

  /**
   * Format a variable for display
   * @param {string} name
   * @param {*} value
   * @returns {VariableInfo}
   */
  function formatVariableInfo(name, value) {
    /** @type {VariableInfo} */
    const info = {
      name,
      type: getTypeName(value),
      value: formatValueShort(value, 100),
      expandable: isExpandable(value),
    };

    // Add size info
    const size = getSizeDescription(value);
    if (size) {
      info.size = size;
    }

    // Add length for arrays/strings
    if (Array.isArray(value)) {
      info.length = value.length;
    } else if (typeof value === 'string') {
      info.length = value.length;
    } else if (value instanceof Map || value instanceof Set) {
      info.length = value.size;
    }

    // Add shape for typed arrays
    if (ArrayBuffer.isView(value) && 'length' in value) {
      // @ts-ignore
      info.length = value.length;
      info.dtype = value.constructor.name.replace('Array', '').toLowerCase();
    }

    // Add keys preview for objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (!(value instanceof Map) && !(value instanceof Set) && !ArrayBuffer.isView(value)) {
        info.keys = Object.keys(value).slice(0, 10);
      }
    }

    return info;
  }

  /**
   * Get children of an expandable value
   * @param {*} value
   * @returns {Array<[string, *]>}
   */
  function getChildren(value) {
    if (value === null || value === undefined) return [];

    if (Array.isArray(value)) {
      return value.map((v, i) => [String(i), v]);
    }

    if (value instanceof Map) {
      return Array.from(value.entries()).map(([k, v]) => [String(k), v]);
    }

    if (value instanceof Set) {
      return Array.from(value).map((v, i) => [String(i), v]);
    }

    if (typeof value === 'object') {
      return Object.entries(value);
    }

    return [];
  }

  /**
   * Get method names of an object
   * @param {*} value
   * @returns {string[]}
   */
  function getMethods(value) {
    const methods = new Set();
    let obj = value;
    let depth = 0;

    while (obj != null && obj !== Object.prototype && depth < 3) {
      for (const name of Object.getOwnPropertyNames(obj)) {
        if (name === 'constructor') continue;

        try {
          if (typeof obj[name] === 'function') {
            methods.add(name);
          }
        } catch {
          // Skip inaccessible
        }
      }

      obj = Object.getPrototypeOf(obj);
      depth++;
    }

    return Array.from(methods).sort();
  }

  /**
   * Get attribute (non-method) names of an object
   * @param {*} value
   * @returns {string[]}
   */
  function getAttributes(value) {
    const attrs = [];

    for (const name of Object.getOwnPropertyNames(value)) {
      try {
        if (typeof value[name] !== 'function') {
          attrs.push(name);
        }
      } catch {
        // Skip inaccessible
      }
    }

    return attrs.sort();
  }

  /**
   * Statement Completeness Checker
   *
   * Determines whether a piece of code is a complete statement that can
   * be executed, or if it needs more input (like an unclosed bracket).
   *
   * @module analysis/is-complete
   */

  /**
   * @typedef {import('../types/analysis.js').IsCompleteResult} IsCompleteResult
   */

  /**
   * Check if code is a complete statement
   *
   * @param {string} code - The code to check
   * @returns {IsCompleteResult}
   */
  function isComplete(code) {
    const trimmed = code.trim();

    // Empty code is complete
    if (!trimmed) {
      return { status: 'complete', indent: '' };
    }

    // Check bracket balance
    const bracketInfo = checkBrackets(trimmed);
    if (bracketInfo.unclosed > 0) {
      return {
        status: 'incomplete',
        indent: '  '.repeat(bracketInfo.unclosed),
      };
    }
    if (bracketInfo.unclosed < 0) {
      return { status: 'invalid', indent: '' };
    }

    // Check for unterminated strings
    const stringInfo = checkStrings(trimmed);
    if (stringInfo.unclosed) {
      return { status: 'incomplete', indent: '' };
    }

    // Check for trailing operators that suggest continuation
    if (endsWithContinuation(trimmed)) {
      return { status: 'incomplete', indent: '' };
    }

    // Check for incomplete template literals
    if (hasIncompleteTemplate(trimmed)) {
      return { status: 'incomplete', indent: '' };
    }

    // Try to parse to verify syntax
    const parseResult = tryParse(code);
    return parseResult;
  }

  /**
   * Check bracket balance
   * @param {string} code
   * @returns {{ unclosed: number }}
   */
  function checkBrackets(code) {
    let depth = 0;
    let inString = null;
    let inTemplate = false;
    let templateDepth = 0;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prev = code[i - 1];
      const next = code[i + 1];

      // Handle escape sequences in strings
      if ((inString || inTemplate) && prev === '\\') {
        continue;
      }

      // Handle comments
      if (!inString && !inTemplate && !inBlockComment && char === '/' && next === '/') {
        inLineComment = true;
        continue;
      }
      if (inLineComment && char === '\n') {
        inLineComment = false;
        continue;
      }
      if (inLineComment) continue;

      if (!inString && !inTemplate && !inLineComment && char === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      if (inBlockComment && char === '*' && next === '/') {
        inBlockComment = false;
        i++;
        continue;
      }
      if (inBlockComment) continue;

      // Handle strings
      if (!inTemplate && (char === '"' || char === "'")) {
        if (inString === char) {
          inString = null;
        } else if (!inString) {
          inString = char;
        }
        continue;
      }

      // Handle template literals
      if (char === '`') {
        if (inTemplate && templateDepth === 0) {
          inTemplate = false;
        } else if (!inString) {
          inTemplate = true;
          templateDepth = 0;
        }
        continue;
      }

      // Handle template expressions ${...}
      if (inTemplate && char === '$' && next === '{') {
        templateDepth++;
        continue;
      }
      if (inTemplate && templateDepth > 0 && char === '}') {
        templateDepth--;
        continue;
      }

      // Skip bracket counting inside strings
      if (inString) continue;
      if (inTemplate && templateDepth === 0) continue;

      // Count brackets
      if (char === '{' || char === '[' || char === '(') {
        depth++;
      } else if (char === '}' || char === ']' || char === ')') {
        depth--;
      }
    }

    return { unclosed: depth };
  }

  /**
   * Check for unterminated strings
   * @param {string} code
   * @returns {{ unclosed: boolean }}
   */
  function checkStrings(code) {
    let inString = null;
    let inTemplate = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prev = code[i - 1];

      // Skip escaped characters
      if (prev === '\\') continue;

      // Skip comments
      if (!inString && !inTemplate && char === '/' && code[i + 1] === '/') {
        // Find end of line
        const newline = code.indexOf('\n', i);
        if (newline === -1) break;
        i = newline;
        continue;
      }

      if (!inString && !inTemplate && char === '/' && code[i + 1] === '*') {
        const end = code.indexOf('*/', i + 2);
        if (end === -1) break;
        i = end + 1;
        continue;
      }

      // Track strings
      if (!inTemplate && (char === '"' || char === "'")) {
        if (inString === char) {
          inString = null;
        } else if (!inString) {
          inString = char;
        }
      }

      // Track template literals
      if (!inString && char === '`') {
        inTemplate = !inTemplate;
      }
    }

    return { unclosed: inString !== null || inTemplate };
  }

  /**
   * Check if code ends with a continuation operator
   * @param {string} code
   * @returns {boolean}
   */
  function endsWithContinuation(code) {
    // Remove trailing whitespace and comments
    let trimmed = code.trim();

    // Remove trailing line comment
    const lines = trimmed.split('\n');
    let lastLine = lines[lines.length - 1].trim();
    const commentIndex = findLineCommentStart(lastLine);
    if (commentIndex !== -1) {
      lastLine = lastLine.slice(0, commentIndex).trim();
      if (!lastLine) {
        // Line was only a comment, check previous lines
        for (let i = lines.length - 2; i >= 0; i--) {
          lastLine = lines[i].trim();
          const ci = findLineCommentStart(lastLine);
          if (ci !== -1) {
            lastLine = lastLine.slice(0, ci).trim();
          }
          if (lastLine) break;
        }
      }
    }

    if (!lastLine) return false;

    // Operators that suggest continuation
    const continuationOps = [
      '+', '-', '*', '/', '%', '**',
      '=', '+=', '-=', '*=', '/=', '%=',
      '==', '===', '!=', '!==',
      '<', '>', '<=', '>=',
      '&&', '||', '??',
      '&', '|', '^', '~',
      '<<', '>>', '>>>',
      '?', ':',
      ',',
      '.',
      '=>',
    ];

    for (const op of continuationOps) {
      if (lastLine.endsWith(op)) {
        return true;
      }
    }

    // Keywords that suggest continuation
    const continuationKeywords = [
      'return', 'throw', 'new', 'typeof', 'void', 'delete',
      'await', 'yield', 'in', 'of', 'instanceof',
      'else', 'extends', 'implements',
    ];

    for (const kw of continuationKeywords) {
      if (lastLine === kw || lastLine.endsWith(' ' + kw)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find line comment start, accounting for strings
   * @param {string} line
   * @returns {number}
   */
  function findLineCommentStart(line) {
    let inString = null;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const prev = line[i - 1];

      if (prev === '\\') continue;

      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = char;
      } else if (inString === char) {
        inString = null;
      } else if (!inString && char === '/' && line[i + 1] === '/') {
        return i;
      }
    }

    return -1;
  }

  /**
   * Check for incomplete template literal expressions
   * @param {string} code
   * @returns {boolean}
   */
  function hasIncompleteTemplate(code) {
    let inTemplate = false;
    let expressionDepth = 0;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prev = code[i - 1];
      const next = code[i + 1];

      if (prev === '\\') continue;

      if (char === '`') {
        if (inTemplate && expressionDepth === 0) {
          inTemplate = false;
        } else if (!inTemplate) {
          inTemplate = true;
          expressionDepth = 0;
        }
      } else if (inTemplate && char === '$' && next === '{') {
        expressionDepth++;
        i++;
      } else if (inTemplate && expressionDepth > 0) {
        if (char === '{') expressionDepth++;
        else if (char === '}') expressionDepth--;
      }
    }

    return inTemplate;
  }

  /**
   * Try to parse the code to check for syntax errors
   * @param {string} code
   * @returns {IsCompleteResult}
   */
  function tryParse(code) {
    try {
      // Try to parse as a function body
      new Function(code);
      return { status: 'complete', indent: '' };
    } catch (e) {
      if (e instanceof SyntaxError) {
        const msg = e.message.toLowerCase();

        // Patterns that indicate incomplete code
        const incompletePatterns = [
          'unexpected end',
          'unterminated',
          'expected',
          'missing',
        ];

        for (const pattern of incompletePatterns) {
          if (msg.includes(pattern)) {
            return { status: 'incomplete', indent: '' };
          }
        }

        // Other syntax errors are invalid
        return { status: 'invalid', indent: '' };
      }

      return { status: 'unknown', indent: '' };
    }
  }

  /**
   * Get suggested indent for continuation
   * @param {string} code
   * @returns {string}
   */
  function getSuggestedIndent(code) {
    const lines = code.split('\n');
    const lastLine = lines[lines.length - 1];

    // Get current indent
    const match = lastLine.match(/^(\s*)/);
    const currentIndent = match ? match[1] : '';

    // Check if we should increase indent
    const trimmed = lastLine.trim();
    const shouldIncrease =
      trimmed.endsWith('{') ||
      trimmed.endsWith('[') ||
      trimmed.endsWith('(') ||
      trimmed.endsWith(':') ||
      trimmed.endsWith('=>');

    if (shouldIncrease) {
      return currentIndent + '  ';
    }

    return currentIndent;
  }

  /**
   * Code Formatting
   *
   * Formats JavaScript code. Can integrate with prettier if available,
   * otherwise provides basic formatting.
   *
   * @module analysis/format
   */

  /**
   * @typedef {import('../types/analysis.js').FormatResult} FormatResult
   */

  /**
   * @typedef {Object} FormatOptions
   * @property {number} [tabWidth=2] - Number of spaces per tab
   * @property {boolean} [useTabs=false] - Use tabs instead of spaces
   * @property {boolean} [semi=true] - Add semicolons
   * @property {boolean} [singleQuote=false] - Use single quotes
   * @property {number} [printWidth=80] - Line width
   */

  /** @type {any} */
  let prettierInstance = null;

  /**
   * Set prettier instance for formatting
   * This allows external prettier to be provided
   *
   * @param {any} prettier - Prettier instance
   */
  function setPrettier(prettier) {
    prettierInstance = prettier;
  }

  /**
   * Check if prettier is available
   * @returns {boolean}
   */
  function hasPrettier() {
    return prettierInstance !== null;
  }

  /**
   * Format JavaScript code
   *
   * @param {string} code - Code to format
   * @param {FormatOptions} [options]
   * @returns {Promise<FormatResult>}
   */
  async function formatCode(code, options = {}) {
    // Try prettier first
    if (prettierInstance) {
      try {
        const formatted = await formatWithPrettier(code, options);
        return {
          formatted,
          changed: formatted !== code,
        };
      } catch (e) {
        // Prettier failed, fall back to basic formatting
        console.warn('Prettier formatting failed:', e);
      }
    }

    // Fall back to basic formatting
    const formatted = basicFormat(code, options);
    return {
      formatted,
      changed: formatted !== code,
    };
  }

  /**
   * Format with prettier
   * @param {string} code
   * @param {FormatOptions} options
   * @returns {Promise<string>}
   */
  async function formatWithPrettier(code, options) {
    const prettierOptions = {
      parser: 'babel',
      tabWidth: options.tabWidth ?? 2,
      useTabs: options.useTabs ?? false,
      semi: options.semi ?? true,
      singleQuote: options.singleQuote ?? false,
      printWidth: options.printWidth ?? 80,
    };

    // prettier might be async or sync depending on version
    const result = prettierInstance.format(code, prettierOptions);
    return result instanceof Promise ? await result : result;
  }

  /**
   * Basic code formatting (no external dependencies)
   *
   * @param {string} code
   * @param {FormatOptions} options
   * @returns {string}
   */
  function basicFormat(code, options = {}) {
    const tabWidth = options.tabWidth ?? 2;
    const useTabs = options.useTabs ?? false;
    const semi = options.semi ?? true;
    const indent = useTabs ? '\t' : ' '.repeat(tabWidth);

    let result = code;

    // Normalize line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Normalize whitespace around operators
    result = normalizeOperatorSpacing(result);

    // Normalize comma spacing
    result = result.replace(/,\s*/g, ', ');

    // Normalize colon spacing in objects
    result = normalizeColonSpacing(result);

    // Fix indentation
    result = fixIndentation(result, indent);

    // Add/remove trailing semicolons
    if (semi) {
      result = addSemicolons(result);
    }

    // Remove trailing whitespace
    result = result.split('\n').map(line => line.trimEnd()).join('\n');

    // Ensure single trailing newline
    result = result.trimEnd() + '\n';

    return result;
  }

  /**
   * Normalize spacing around operators
   * @param {string} code
   * @returns {string}
   */
  function normalizeOperatorSpacing(code) {
    // This is tricky because we need to handle strings and regex
    // For now, do a simple replacement that might not be perfect

    // Binary operators (add spaces around)
    const binaryOps = [
      '===', '!==', '==', '!=',
      '<=', '>=', '<', '>',
      '&&', '||', '??',
      '+=', '-=', '*=', '/=', '%=',
      '**=', '&=', '|=', '^=',
      '<<=', '>>=', '>>>=',
      '=>',
    ];

    let result = code;

    // Process each operator (order matters - longer first)
    for (const op of binaryOps) {
      const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Only if not already properly spaced
      result = result.replace(
        new RegExp(`(\\S)${escaped}(\\S)`, 'g'),
        `$1 ${op} $2`
      );
    }

    // Single = assignment (but not ==, ===, =>, etc)
    result = result.replace(/(\w)=(?![=>])(\S)/g, '$1 = $2');

    return result;
  }

  /**
   * Normalize colon spacing in objects
   * @param {string} code
   * @returns {string}
   */
  function normalizeColonSpacing(code) {
    // Object property colons: add space after but not before
    // This is imperfect but handles common cases
    return code.replace(/(\w+)\s*:\s*/g, '$1: ');
  }

  /**
   * Fix indentation based on bracket depth
   * @param {string} code
   * @param {string} indent
   * @returns {string}
   */
  function fixIndentation(code, indent) {
    const lines = code.split('\n');
    const result = [];
    let depth = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        result.push('');
        continue;
      }

      // Check if line starts with closing bracket
      const startsWithClose = /^[}\])]/.test(trimmed);
      if (startsWithClose && depth > 0) {
        depth--;
      }

      // Add indentation
      result.push(indent.repeat(depth) + trimmed);

      // Count bracket changes for next line
      const opens = (trimmed.match(/[{[(]/g) || []).length;
      const closes = (trimmed.match(/[}\])]/g) || []).length;
      depth += opens - closes;

      // Ensure depth doesn't go negative
      if (depth < 0) depth = 0;
    }

    return result.join('\n');
  }

  /**
   * Add semicolons to statements that need them
   * @param {string} code
   * @returns {string}
   */
  function addSemicolons(code) {
    const lines = code.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        result.push(line);
        continue;
      }

      // Skip lines that don't need semicolons
      const skipPatterns = [
        /^\/\//, // Comment
        /^\/\*/, // Block comment start
        /\*\/$/, // Block comment end
        /^\*/, // Block comment middle
        /^import\s/, // Import (might need semi, but complex)
        /^export\s/, // Export
        /^if\s*\(/, // If
        /^else/, // Else
        /^for\s*\(/, // For
        /^while\s*\(/, // While
        /^do\s*{?$/, // Do
        /^switch\s*\(/, // Switch
        /^try\s*{?$/, // Try
        /^catch\s*\(/, // Catch
        /^finally\s*{?$/, // Finally
        /^function\s/, // Function declaration
        /^class\s/, // Class
        /^async\s+function/, // Async function
        /[{,]\s*$/, // Ends with { or ,
        /^\s*[}\])]/, // Starts with closing bracket
      ];

      let needsSemi = true;
      for (const pattern of skipPatterns) {
        if (pattern.test(trimmed)) {
          needsSemi = false;
          break;
        }
      }

      // Already has semicolon
      if (trimmed.endsWith(';')) {
        needsSemi = false;
      }

      // Check if next non-empty line suggests continuation
      if (needsSemi) {
        for (let j = i + 1; j < lines.length; j++) {
          const nextTrimmed = lines[j].trim();
          if (!nextTrimmed) continue;
          if (/^[.?[]/.test(nextTrimmed)) {
            // Next line is continuation
            needsSemi = false;
          }
          break;
        }
      }

      if (needsSemi) {
        // Find where to insert semicolon (before trailing comment)
        const commentMatch = line.match(/^(.*?)(\s*\/\/.*)$/);
        if (commentMatch) {
          line = commentMatch[1] + ';' + commentMatch[2];
        } else {
          line = line.trimEnd() + ';';
        }
      }

      result.push(line);
    }

    return result.join('\n');
  }

  /**
   * Format HTML code (basic)
   * @param {string} code
   * @returns {string}
   */
  function formatHtml(code) {
    // Very basic HTML formatting
    let result = code;

    // Normalize line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Add newlines after block elements
    result = result.replace(/(<\/(?:div|p|ul|ol|li|h[1-6]|header|footer|section|article|nav|aside|main|table|tr|thead|tbody|form)>)/gi, '$1\n');

    // Add newlines before block elements
    result = result.replace(/(<(?:div|p|ul|ol|li|h[1-6]|header|footer|section|article|nav|aside|main|table|tr|thead|tbody|form)(?:\s[^>]*)?>)/gi, '\n$1');

    // Remove multiple blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim() + '\n';
  }

  /**
   * Format CSS code (basic)
   * @param {string} code
   * @returns {string}
   */
  function formatCss(code) {
    let result = code;

    // Normalize line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Add newlines after { and ;
    result = result.replace(/\{/g, ' {\n');
    result = result.replace(/;/g, ';\n');
    result = result.replace(/\}/g, '\n}\n');

    // Fix property spacing
    result = result.replace(/:\s*/g, ': ');

    // Fix indentation
    const lines = result.split('\n');
    const formatted = [];
    let depth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === '}') depth--;
      formatted.push('  '.repeat(Math.max(0, depth)) + trimmed);
      if (trimmed.endsWith('{')) depth++;
    }

    return formatted.join('\n') + '\n';
  }

  /**
   * Session Class
   *
   * A session is an isolated execution context that persists variables
   * across executions. It wraps an ExecutionContext and provides the
   * full MRP session API.
   *
   * @module session/session
   */


  /**
   * @typedef {import('../execute/registry.js').ExecutorRegistry} ExecutorRegistry
   * @typedef {import('../execute/interface.js').Executor} Executor
   */

  /**
   * @typedef {import('./context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('./context/interface.js').RawExecutionResult} RawExecutionResult
   * @typedef {import('../types/session.js').SessionInfo} SessionInfo
   * @typedef {import('../types/session.js').CreateSessionOptions} CreateSessionOptions
   * @typedef {import('../types/session.js').IsolationMode} IsolationMode
   * @typedef {import('../types/execution.js').ExecuteOptions} ExecuteOptions
   * @typedef {import('../types/execution.js').ExecutionResult} ExecutionResult
   * @typedef {import('../types/execution.js').ExecutionError} ExecutionError
   * @typedef {import('../types/execution.js').DisplayData} DisplayData
   * @typedef {import('../types/streaming.js').StreamEvent} StreamEvent
   * @typedef {import('../types/completion.js').CompleteOptions} CompleteOptions
   * @typedef {import('../types/completion.js').CompletionResult} CompletionResult
   * @typedef {import('../types/inspection.js').InspectOptions} InspectOptions
   * @typedef {import('../types/inspection.js').InspectResult} InspectResult
   * @typedef {import('../types/inspection.js').HoverResult} HoverResult
   * @typedef {import('../types/variables.js').VariableFilter} VariableFilter
   * @typedef {import('../types/variables.js').VariableInfo} VariableInfo
   * @typedef {import('../types/variables.js').VariableDetailOptions} VariableDetailOptions
   * @typedef {import('../types/variables.js').VariableDetail} VariableDetail
   * @typedef {import('../types/analysis.js').IsCompleteResult} IsCompleteResult
   * @typedef {import('../types/analysis.js').FormatResult} FormatResult
   */

  /**
   * Generate a unique execution ID
   * @returns {string}
   */
  function generateExecId() {
    return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Session class - represents an isolated execution context
   */
  class Session {
    /** @type {string} */
    #id;

    /** @type {string} */
    #language;

    /** @type {IsolationMode} */
    #isolation;

    /** @type {Date} */
    #created;

    /** @type {Date} */
    #lastActivity;

    /** @type {number} */
    #executionCount = 0;

    /** @type {ExecutionContext} */
    #context;

    /** @type {ExecutorRegistry | null} */
    #executorRegistry = null;

    /** @type {JavaScriptExecutor} */
    #defaultJsExecutor;

    /** @type {Map<string, AbortController>} */
    #runningExecutions = new Map();

    /** @type {Map<string, (text: string) => void>} */
    #pendingInputs = new Map();

    /**
     * @param {string} id - Session ID
     * @param {CreateSessionOptions & { executorRegistry?: ExecutorRegistry }} [options]
     */
    constructor(id, options = {}) {
      this.#id = id;
      this.#language = options.language || 'javascript';
      this.#isolation = options.isolation || 'iframe';
      this.#created = new Date();
      this.#lastActivity = new Date();

      // Store executor registry if provided
      this.#executorRegistry = options.executorRegistry || null;

      // Create default JS executor for fallback
      this.#defaultJsExecutor = new JavaScriptExecutor();

      // Create the appropriate context
      this.#context = this.#createContext(options);
    }

    /**
     * Create the execution context based on isolation mode
     * @param {CreateSessionOptions} options
     * @returns {ExecutionContext}
     */
    #createContext(options) {
      switch (this.#isolation) {
        case 'none':
          return new MainContext({
            utilities: options.utilities,
          });

        case 'iframe':
        default:
          return new IframeContext({
            visible: false,
            allowMainAccess: options.allowMainAccess ?? false,
            utilities: options.utilities,
          });
      }
    }

    // ============================================================================
    // Properties
    // ============================================================================

    /** @returns {string} */
    get id() {
      return this.#id;
    }

    /** @returns {string} */
    get language() {
      return this.#language;
    }

    /** @returns {IsolationMode} */
    get isolation() {
      return this.#isolation;
    }

    /** @returns {Date} */
    get created() {
      return this.#created;
    }

    /** @returns {Date} */
    get lastActivity() {
      return this.#lastActivity;
    }

    /** @returns {number} */
    get executionCount() {
      return this.#executionCount;
    }

    // ============================================================================
    // Execution
    // ============================================================================

    /**
     * Execute code and return result
     * @param {string} code - Code to execute
     * @param {ExecuteOptions} [options]
     * @returns {Promise<ExecutionResult>}
     */
    async execute(code, options = {}) {
      const execId = options.execId || generateExecId();
      const language = options.language || this.#language;

      // Update activity
      this.#lastActivity = new Date();

      // Track execution
      const abortController = new AbortController();
      this.#runningExecutions.set(execId, abortController);

      try {
        // Get the executor for this language
        const executor = this.#getExecutor(language);

        // Execute using the executor
        const result = await executor.execute(code, this.#context, {
          ...options,
          execId,
          language,
        });

        // Update execution count
        if (options.storeHistory !== false) {
          this.#executionCount++;
        }

        // Update result with session's execution count
        result.executionCount = this.#executionCount;

        return result;
      } finally {
        this.#runningExecutions.delete(execId);
      }
    }

    /**
     * Get the executor for a language
     * @param {string} language
     * @returns {Executor}
     */
    #getExecutor(language) {
      // Try registry first
      if (this.#executorRegistry) {
        const executor = this.#executorRegistry.get(language);
        if (executor) return executor;
      }

      // Fall back to default JS executor for JavaScript
      const lang = language.toLowerCase();
      if (['javascript', 'js', 'ecmascript', 'es'].includes(lang)) {
        return this.#defaultJsExecutor;
      }

      // Return a no-op executor that reports unsupported language
      return {
        languages: [],
        async execute(code, context, options) {
          return {
            success: false,
            stdout: '',
            stderr: `No executor registered for language: ${language}`,
            error: {
              type: 'ExecutorError',
              message: `No executor registered for language: ${language}. Register an ExecutorRegistry with HTML/CSS executors to support this language.`,
            },
            displayData: [],
            assets: [],
            executionCount: 0,
            duration: 0,
          };
        },
      };
    }

    /**
     * Execute code with streaming output
     * @param {string} code - Code to execute
     * @param {ExecuteOptions} [options]
     * @returns {AsyncGenerator<StreamEvent>}
     */
    async *executeStream(code, options = {}) {
      const execId = options.execId || generateExecId();
      const language = options.language || this.#language;

      // Update activity
      this.#lastActivity = new Date();

      // Track execution
      const abortController = new AbortController();
      this.#runningExecutions.set(execId, abortController);

      try {
        // Get the executor for this language
        const executor = this.#getExecutor(language);

        // Use executor's streaming if available
        if (executor.executeStream) {
          let executionCount = this.#executionCount;

          for await (const event of executor.executeStream(code, this.#context, {
            ...options,
            execId,
            language,
          })) {
            // Update execution count on result event
            if (event.type === 'result' && options.storeHistory !== false) {
              this.#executionCount++;
              event.result.executionCount = this.#executionCount;
            }
            yield event;
          }
        } else {
          // Fall back to wrapping execute()
          const timestamp = new Date().toISOString();

          yield /** @type {import('../types/streaming.js').StartEvent} */ ({
            type: 'start',
            execId,
            timestamp,
          });

          try {
            const result = await executor.execute(code, this.#context, {
              ...options,
              execId,
              language,
            });

            if (options.storeHistory !== false) {
              this.#executionCount++;
            }
            result.executionCount = this.#executionCount;

            if (result.stdout) {
              yield /** @type {import('../types/streaming.js').StdoutEvent} */ ({
                type: 'stdout',
                content: result.stdout,
                accumulated: result.stdout,
              });
            }

            if (result.stderr) {
              yield /** @type {import('../types/streaming.js').StderrEvent} */ ({
                type: 'stderr',
                content: result.stderr,
                accumulated: result.stderr,
              });
            }

            for (const display of result.displayData) {
              yield /** @type {import('../types/streaming.js').DisplayEvent} */ ({
                type: 'display',
                data: display.data,
                metadata: display.metadata,
              });
            }

            for (const asset of result.assets) {
              yield /** @type {import('../types/streaming.js').AssetEvent} */ ({
                type: 'asset',
                path: asset.path,
                url: asset.url,
                mimeType: asset.mimeType,
                assetType: asset.assetType,
              });
            }

            yield /** @type {import('../types/streaming.js').ResultEvent} */ ({
              type: 'result',
              result,
            });
          } catch (error) {
            yield /** @type {import('../types/streaming.js').ErrorEvent} */ ({
              type: 'error',
              error: {
                type: error instanceof Error ? error.name : 'Error',
                message: error instanceof Error ? error.message : String(error),
                traceback: error instanceof Error && error.stack ? error.stack.split('\n') : undefined,
              },
            });
          }

          yield /** @type {import('../types/streaming.js').DoneEvent} */ ({
            type: 'done',
          });
        }
      } finally {
        this.#runningExecutions.delete(execId);
      }
    }

    /**
     * Set the executor registry
     * @param {ExecutorRegistry} registry
     */
    setExecutorRegistry(registry) {
      this.#executorRegistry = registry;
    }

    /**
     * Get the executor registry
     * @returns {ExecutorRegistry | null}
     */
    getExecutorRegistry() {
      return this.#executorRegistry;
    }

    /**
     * Get supported languages
     * @returns {string[]}
     */
    getSupportedLanguages() {
      if (this.#executorRegistry) {
        return this.#executorRegistry.languages();
      }
      return ['javascript', 'js', 'ecmascript', 'es'];
    }

    /**
     * Send input to a waiting execution
     * @param {string} execId - Execution ID
     * @param {string} text - Input text
     * @returns {boolean} Whether input was accepted
     */
    sendInput(execId, text) {
      const handler = this.#pendingInputs.get(execId);
      if (handler) {
        handler(text);
        this.#pendingInputs.delete(execId);
        return true;
      }
      return false;
    }

    /**
     * Interrupt a running execution
     * @param {string} [execId] - Specific execution ID, or all if not provided
     * @returns {boolean} Whether any execution was interrupted
     */
    interrupt(execId) {
      if (execId) {
        const controller = this.#runningExecutions.get(execId);
        if (controller) {
          controller.abort();
          this.#runningExecutions.delete(execId);
          return true;
        }
        return false;
      }

      // Interrupt all
      if (this.#runningExecutions.size > 0) {
        for (const controller of this.#runningExecutions.values()) {
          controller.abort();
        }
        this.#runningExecutions.clear();
        return true;
      }

      return false;
    }

    // ============================================================================
    // LSP Features (delegated to lsp/ modules)
    // ============================================================================

    /**
     * Get completions at cursor position
     * @param {string} code
     * @param {number} cursor
     * @param {CompleteOptions} [options]
     * @returns {CompletionResult}
     */
    complete(code, cursor, options = {}) {
      return getCompletions(code, cursor, this.#context, options);
    }

    /**
     * Get hover information at cursor position
     * @param {string} code
     * @param {number} cursor
     * @returns {HoverResult}
     */
    hover(code, cursor) {
      return getHoverInfo(code, cursor, this.#context);
    }

    /**
     * Get detailed inspection at cursor position
     * @param {string} code
     * @param {number} cursor
     * @param {InspectOptions} [options]
     * @returns {InspectResult}
     */
    inspect(code, cursor, options = {}) {
      return getInspectInfo(code, cursor, this.#context, options);
    }

    /**
     * List all variables in session
     * @param {VariableFilter} [filter]
     * @returns {VariableInfo[]}
     */
    listVariables(filter = {}) {
      return listVariables(this.#context, filter);
    }

    /**
     * Get detailed information about a variable
     * @param {string} name
     * @param {VariableDetailOptions} [options]
     * @returns {VariableDetail | null}
     */
    getVariable(name, options = {}) {
      return getVariableDetail(name, this.#context, options);
    }

    // ============================================================================
    // Analysis
    // ============================================================================

    /**
     * Check if code is a complete statement
     * @param {string} code
     * @returns {IsCompleteResult}
     */
    isComplete(code) {
      return isComplete(code);
    }

    /**
     * Format code
     * @param {string} code
     * @returns {Promise<FormatResult>}
     */
    async format(code) {
      return formatCode(code);
    }

    // ============================================================================
    // Lifecycle
    // ============================================================================

    /**
     * Reset the session (clear variables but keep session)
     */
    reset() {
      this.#context.reset();
      this.#executionCount = 0;
      this.#lastActivity = new Date();
    }

    /**
     * Destroy the session and release resources
     */
    destroy() {
      // Cancel any running executions
      this.interrupt();

      // Destroy context
      this.#context.destroy();
    }

    /**
     * Get session info
     * @returns {SessionInfo}
     */
    getInfo() {
      return {
        id: this.#id,
        language: this.#language,
        created: this.#created.toISOString(),
        lastActivity: this.#lastActivity.toISOString(),
        executionCount: this.#executionCount,
        variableCount: this.#context.getTrackedVariables().size,
        isolation: this.#isolation,
      };
    }

    /**
     * Get the underlying execution context (for advanced use)
     * @returns {ExecutionContext}
     */
    getContext() {
      return this.#context;
    }
  }

  /**
   * Create a session
   * @param {string} id
   * @param {CreateSessionOptions} [options]
   * @returns {Session}
   */
  function createSession(id, options) {
    return new Session(id, options);
  }

  /**
   * Session Manager
   *
   * Manages multiple sessions, handles creation/destruction,
   * and enforces limits.
   *
   * @module session/manager
   */


  /**
   * @typedef {import('../types/session.js').SessionInfo} SessionInfo
   * @typedef {import('../types/session.js').CreateSessionOptions} CreateSessionOptions
   */

  /**
   * @typedef {Object} SessionManagerOptions
   * @property {number} [maxSessions=10] - Maximum number of concurrent sessions
   * @property {string} [defaultLanguage='javascript'] - Default language for new sessions
   * @property {import('../types/session.js').IsolationMode} [defaultIsolation='iframe'] - Default isolation mode
   * @property {boolean} [defaultAllowMainAccess=false] - Default main access setting
   */

  /**
   * Generate a unique session ID
   * @returns {string}
   */
  function generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Session Manager - manages multiple execution sessions
   */
  class SessionManager {
    /** @type {Map<string, Session>} */
    #sessions = new Map();

    /** @type {SessionManagerOptions} */
    #options;

    /**
     * @param {SessionManagerOptions} [options]
     */
    constructor(options = {}) {
      this.#options = {
        maxSessions: 10,
        defaultLanguage: 'javascript',
        defaultIsolation: 'iframe',
        defaultAllowMainAccess: false,
        ...options,
      };
    }

    // ============================================================================
    // Session Lifecycle
    // ============================================================================

    /**
     * Create a new session
     * @param {CreateSessionOptions} [options]
     * @returns {Session}
     * @throws {Error} If max sessions reached
     */
    create(options = {}) {
      // Check limits
      if (this.#sessions.size >= this.#options.maxSessions) {
        throw new Error(
          `Maximum sessions (${this.#options.maxSessions}) reached. ` +
            'Destroy existing sessions before creating new ones.'
        );
      }

      // Generate ID if not provided
      const id = options.id || generateSessionId();

      // Check for duplicate ID
      if (this.#sessions.has(id)) {
        throw new Error(`Session with ID '${id}' already exists`);
      }

      // Merge with defaults
      const sessionOptions = {
        language: options.language || this.#options.defaultLanguage,
        isolation: options.isolation || this.#options.defaultIsolation,
        allowMainAccess: options.allowMainAccess ?? this.#options.defaultAllowMainAccess,
        utilities: options.utilities,
      };

      // Create session
      const session = new Session(id, sessionOptions);
      this.#sessions.set(id, session);

      return session;
    }

    /**
     * Get an existing session by ID
     * @param {string} id
     * @returns {Session | undefined}
     */
    get(id) {
      return this.#sessions.get(id);
    }

    /**
     * Get a session, creating it if it doesn't exist
     * @param {string} id
     * @param {CreateSessionOptions} [options]
     * @returns {Session}
     */
    getOrCreate(id, options = {}) {
      const existing = this.#sessions.get(id);
      if (existing) {
        return existing;
      }
      return this.create({ ...options, id });
    }

    /**
     * Check if a session exists
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
      return this.#sessions.has(id);
    }

    /**
     * Destroy a session by ID
     * @param {string} id
     * @returns {boolean} Whether a session was destroyed
     */
    destroy(id) {
      const session = this.#sessions.get(id);
      if (session) {
        session.destroy();
        this.#sessions.delete(id);
        return true;
      }
      return false;
    }

    /**
     * Destroy all sessions
     */
    destroyAll() {
      for (const session of this.#sessions.values()) {
        session.destroy();
      }
      this.#sessions.clear();
    }

    // ============================================================================
    // Session Queries
    // ============================================================================

    /**
     * List all sessions
     * @returns {SessionInfo[]}
     */
    list() {
      return Array.from(this.#sessions.values()).map((s) => s.getInfo());
    }

    /**
     * Get number of active sessions
     * @returns {number}
     */
    get size() {
      return this.#sessions.size;
    }

    /**
     * Get all session IDs
     * @returns {string[]}
     */
    get ids() {
      return Array.from(this.#sessions.keys());
    }

    /**
     * Get the maximum number of sessions allowed
     * @returns {number}
     */
    get maxSessions() {
      return this.#options.maxSessions;
    }

    /**
     * Iterate over sessions
     * @returns {IterableIterator<Session>}
     */
    [Symbol.iterator]() {
      return this.#sessions.values();
    }

    /**
     * Iterate over session entries
     * @returns {IterableIterator<[string, Session]>}
     */
    entries() {
      return this.#sessions.entries();
    }

    // ============================================================================
    // Bulk Operations
    // ============================================================================

    /**
     * Reset all sessions (clear variables but keep sessions)
     */
    resetAll() {
      for (const session of this.#sessions.values()) {
        session.reset();
      }
    }

    /**
     * Interrupt all running executions across all sessions
     * @returns {number} Number of sessions that had executions interrupted
     */
    interruptAll() {
      let count = 0;
      for (const session of this.#sessions.values()) {
        if (session.interrupt()) {
          count++;
        }
      }
      return count;
    }

    /**
     * Get sessions by language
     * @param {string} language
     * @returns {Session[]}
     */
    getByLanguage(language) {
      const results = [];
      for (const session of this.#sessions.values()) {
        if (session.language === language) {
          results.push(session);
        }
      }
      return results;
    }

    /**
     * Get the most recently active session
     * @returns {Session | undefined}
     */
    getMostRecent() {
      let mostRecent = undefined;
      let latestTime = 0;

      for (const session of this.#sessions.values()) {
        const time = session.lastActivity.getTime();
        if (time > latestTime) {
          latestTime = time;
          mostRecent = session;
        }
      }

      return mostRecent;
    }

    // ============================================================================
    // Cleanup
    // ============================================================================

    /**
     * Destroy sessions that have been inactive for a certain time
     * @param {number} maxIdleMs - Maximum idle time in milliseconds
     * @returns {number} Number of sessions destroyed
     */
    cleanupIdle(maxIdleMs) {
      const now = Date.now();
      const toDestroy = [];

      for (const [id, session] of this.#sessions) {
        if (now - session.lastActivity.getTime() > maxIdleMs) {
          toDestroy.push(id);
        }
      }

      for (const id of toDestroy) {
        this.destroy(id);
      }

      return toDestroy.length;
    }

    /**
     * Destroy oldest sessions to get under a certain count
     * @param {number} targetCount - Target number of sessions
     * @returns {number} Number of sessions destroyed
     */
    trimToCount(targetCount) {
      if (this.#sessions.size <= targetCount) {
        return 0;
      }

      // Sort by last activity (oldest first)
      const sorted = Array.from(this.#sessions.entries()).sort(
        ([, a], [, b]) => a.lastActivity.getTime() - b.lastActivity.getTime()
      );

      const toDestroy = sorted.slice(0, this.#sessions.size - targetCount);

      for (const [id] of toDestroy) {
        this.destroy(id);
      }

      return toDestroy.length;
    }
  }

  /**
   * Create a session manager
   * @param {SessionManagerOptions} [options]
   * @returns {SessionManager}
   */
  function createSessionManager(options) {
    return new SessionManager(options);
  }

  /**
   * Executor Registry
   *
   * Manages language executors and routes execution requests
   * to the appropriate executor based on language.
   *
   * @module execute/registry
   */

  /**
   * @typedef {import('./interface.js').Executor} Executor
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/execution.js').ExecuteOptions} ExecuteOptions
   * @typedef {import('../types/execution.js').ExecutionResult} ExecutionResult
   * @typedef {import('../types/streaming.js').StreamEvent} StreamEvent
   */

  /**
   * Registry for language executors
   */
  class ExecutorRegistry {
    /** @type {Map<string, Executor>} */
    #executors = new Map();

    /** @type {Map<string, string>} */
    #aliases = new Map();

    /**
     * Register an executor for one or more languages
     * @param {Executor} executor - The executor to register
     */
    register(executor) {
      for (const language of executor.languages) {
        const lang = language.toLowerCase();
        this.#executors.set(lang, executor);
      }
    }

    /**
     * Register a single language with an executor
     * @param {string} language - Language identifier
     * @param {Executor} executor - The executor
     */
    registerLanguage(language, executor) {
      this.#executors.set(language.toLowerCase(), executor);
    }

    /**
     * Register an alias for a language
     * @param {string} alias - The alias
     * @param {string} language - The target language
     */
    registerAlias(alias, language) {
      this.#aliases.set(alias.toLowerCase(), language.toLowerCase());
    }

    /**
     * Get the executor for a language
     * @param {string} language
     * @returns {Executor | undefined}
     */
    get(language) {
      const lang = language.toLowerCase();

      // Check direct registration
      let executor = this.#executors.get(lang);
      if (executor) return executor;

      // Check aliases
      const aliasTarget = this.#aliases.get(lang);
      if (aliasTarget) {
        return this.#executors.get(aliasTarget);
      }

      return undefined;
    }

    /**
     * Check if a language is supported
     * @param {string} language
     * @returns {boolean}
     */
    supports(language) {
      return this.get(language) !== undefined;
    }

    /**
     * Get all registered languages
     * @returns {string[]}
     */
    languages() {
      const langs = new Set([...this.#executors.keys(), ...this.#aliases.keys()]);
      return Array.from(langs).sort();
    }

    /**
     * Get all registered executors (deduplicated)
     * @returns {Executor[]}
     */
    executors() {
      return Array.from(new Set(this.#executors.values()));
    }

    /**
     * Execute code using the appropriate executor
     * @param {string} code - Code to execute
     * @param {string} language - Language identifier
     * @param {ExecutionContext} context - Execution context
     * @param {ExecuteOptions} [options] - Execution options
     * @returns {Promise<ExecutionResult>}
     */
    async execute(code, language, context, options = {}) {
      const executor = this.get(language);

      if (!executor) {
        return {
          success: false,
          stdout: '',
          stderr: `No executor registered for language: ${language}`,
          error: {
            type: 'ExecutorError',
            message: `No executor registered for language: ${language}`,
          },
          displayData: [],
          assets: [],
          executionCount: 0,
          duration: 0,
        };
      }

      return executor.execute(code, context, options);
    }

    /**
     * Execute code with streaming using the appropriate executor
     * @param {string} code - Code to execute
     * @param {string} language - Language identifier
     * @param {ExecutionContext} context - Execution context
     * @param {ExecuteOptions} [options] - Execution options
     * @returns {AsyncGenerator<StreamEvent>}
     */
    async *executeStream(code, language, context, options = {}) {
      const executor = this.get(language);

      if (!executor) {
        yield /** @type {import('../types/streaming.js').ErrorEvent} */ ({
          type: 'error',
          error: {
            type: 'ExecutorError',
            message: `No executor registered for language: ${language}`,
          },
        });
        yield /** @type {import('../types/streaming.js').DoneEvent} */ ({
          type: 'done',
        });
        return;
      }

      if (executor.executeStream) {
        yield* executor.executeStream(code, context, options);
      } else {
        // Fall back to non-streaming execution wrapped in events
        const execId = options.execId || `exec-${Date.now()}`;

        yield /** @type {import('../types/streaming.js').StartEvent} */ ({
          type: 'start',
          execId,
          timestamp: new Date().toISOString(),
        });

        try {
          const result = await executor.execute(code, context, options);

          if (result.stdout) {
            yield /** @type {import('../types/streaming.js').StdoutEvent} */ ({
              type: 'stdout',
              content: result.stdout,
              accumulated: result.stdout,
            });
          }

          if (result.stderr) {
            yield /** @type {import('../types/streaming.js').StderrEvent} */ ({
              type: 'stderr',
              content: result.stderr,
              accumulated: result.stderr,
            });
          }

          for (const display of result.displayData) {
            yield /** @type {import('../types/streaming.js').DisplayEvent} */ ({
              type: 'display',
              data: display.data,
              metadata: display.metadata,
            });
          }

          yield /** @type {import('../types/streaming.js').ResultEvent} */ ({
            type: 'result',
            result,
          });
        } catch (error) {
          yield /** @type {import('../types/streaming.js').ErrorEvent} */ ({
            type: 'error',
            error: {
              type: error instanceof Error ? error.name : 'Error',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }

        yield /** @type {import('../types/streaming.js').DoneEvent} */ ({
          type: 'done',
        });
      }
    }

    /**
     * Unregister a language
     * @param {string} language
     * @returns {boolean}
     */
    unregister(language) {
      const lang = language.toLowerCase();
      const hadExecutor = this.#executors.delete(lang);
      const hadAlias = this.#aliases.delete(lang);
      return hadExecutor || hadAlias;
    }

    /**
     * Clear all registered executors
     */
    clear() {
      this.#executors.clear();
      this.#aliases.clear();
    }
  }

  /**
   * Create an executor registry
   * @returns {ExecutorRegistry}
   */
  function createExecutorRegistry() {
    return new ExecutorRegistry();
  }

  /**
   * HTML Executor
   *
   * Executes HTML cells by producing displayData with text/html MIME type.
   * Optionally extracts and executes inline scripts.
   *
   * @module execute/html
   */


  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/execution.js').ExecuteOptions} ExecuteOptions
   * @typedef {import('../types/execution.js').ExecutionResult} ExecutionResult
   * @typedef {import('../types/execution.js').DisplayData} DisplayData
   */

  /**
   * Regex to match script tags and capture their content
   */
  const SCRIPT_REGEX = /<script[^>]*>([\s\S]*?)<\/script>/gi;

  /**
   * Regex to match style tags and capture their content
   */
  const STYLE_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/gi;

  /**
   * Extract script tags from HTML
   * @param {string} html
   * @returns {{ html: string, scripts: string[] }}
   */
  function extractScripts(html) {
    const scripts = [];

    const cleaned = html.replace(SCRIPT_REGEX, (_, content) => {
      if (content.trim()) {
        scripts.push(content);
      }
      return '';
    });

    return { html: cleaned, scripts };
  }

  /**
   * Extract style tags from HTML
   * @param {string} html
   * @returns {{ html: string, styles: string[] }}
   */
  function extractStyles(html) {
    const styles = [];

    const cleaned = html.replace(STYLE_REGEX, (_, content) => {
      if (content.trim()) {
        styles.push(content);
      }
      return '';
    });

    return { html: cleaned, styles };
  }

  /**
   * HTML executor - produces displayData for HTML content
   */
  class HtmlExecutor extends BaseExecutor {
    /** @type {readonly string[]} */
    languages = ['html', 'htm', 'xhtml'];

    /**
     * Execute HTML cell
     * @param {string} code - HTML content
     * @param {ExecutionContext} context - Execution context
     * @param {ExecuteOptions} [options] - Execution options
     * @returns {Promise<ExecutionResult>}
     */
    async execute(code, context, options = {}) {
      const startTime = performance.now();

      // Extract scripts and styles
      const { html: htmlWithoutScripts, scripts } = extractScripts(code);
      const { html: cleanHtml, styles } = extractStyles(htmlWithoutScripts);

      // Build display data
      /** @type {DisplayData[]} */
      const displayData = [];

      // Main HTML content
      displayData.push({
        data: {
          'text/html': code, // Send original HTML including scripts/styles
        },
        metadata: {
          // Metadata for client to decide how to render
          hasScripts: scripts.length > 0,
          hasStyles: styles.length > 0,
          scriptCount: scripts.length,
          styleCount: styles.length,
          trusted: options.cellMeta?.trusted ?? false,
          // Client can use this to decide whether to execute scripts
          executeScripts: options.cellMeta?.executeScripts ?? true,
        },
      });

      // Optionally include cleaned HTML (without scripts/styles) as alternate
      if (scripts.length > 0 || styles.length > 0) {
        displayData.push({
          data: {
            'text/html+safe': cleanHtml.trim(),
          },
          metadata: {
            description: 'HTML content with scripts and styles removed',
          },
        });
      }

      // Include extracted styles as separate CSS display data
      if (styles.length > 0) {
        displayData.push({
          data: {
            'text/css': styles.join('\n\n'),
          },
          metadata: {
            source: 'extracted',
            description: 'Styles extracted from HTML',
          },
        });
      }

      const duration = performance.now() - startTime;

      // Build info message
      const parts = [];
      if (cleanHtml.trim()) parts.push('HTML');
      if (styles.length > 0) parts.push(`${styles.length} style${styles.length > 1 ? 's' : ''}`);
      if (scripts.length > 0) parts.push(`${scripts.length} script${scripts.length > 1 ? 's' : ''}`);

      return {
        success: true,
        stdout: `Rendered: ${parts.join(', ') || 'empty'}`,
        stderr: '',
        result: undefined,
        displayData,
        assets: [],
        executionCount: 0,
        duration,
      };
    }
  }

  /**
   * Create an HTML executor
   * @returns {HtmlExecutor}
   */
  function createHtmlExecutor() {
    return new HtmlExecutor();
  }

  /**
   * CSS Executor
   *
   * Executes CSS cells by producing displayData with text/css MIME type.
   * Supports optional scoping to prevent style leakage.
   *
   * @module execute/css
   */


  /**
   * @typedef {import('../session/context/interface.js').ExecutionContext} ExecutionContext
   * @typedef {import('../types/execution.js').ExecuteOptions} ExecuteOptions
   * @typedef {import('../types/execution.js').ExecutionResult} ExecutionResult
   * @typedef {import('../types/execution.js').DisplayData} DisplayData
   */

  /**
   * Generate a unique scope class name
   * @param {string} [id] - Optional ID to include
   * @returns {string}
   */
  function generateScopeClass(id) {
    const suffix = id
      ? id.replace(/[^a-z0-9]/gi, '')
      : Math.random().toString(36).slice(2, 8);
    return `mrmd-scope-${suffix}`;
  }

  /**
   * Scope CSS selectors by prefixing them with a scope selector
   *
   * @param {string} css - CSS content
   * @param {string} scopeSelector - Scope selector (e.g., '.mrmd-scope-abc123')
   * @returns {string} Scoped CSS
   *
   * @example
   * scopeStyles('.card { color: red; }', '.scope-123')
   * // Returns: '.scope-123 .card { color: red; }'
   */
  function scopeStyles$1(css, scopeSelector) {
    return css.replace(
      /([^{}]+)\{/g,
      (match, selectors) => {
        const scoped = selectors
          .split(',')
          .map((selector) => {
            const trimmed = selector.trim();

            // Don't scope special selectors
            if (
              // @-rules (media, keyframes, supports, etc.)
              trimmed.startsWith('@') ||
              // Keyframe percentages and keywords
              trimmed.startsWith('from') ||
              trimmed.startsWith('to') ||
              /^\d+%$/.test(trimmed) ||
              // Empty selector
              !trimmed
            ) {
              return trimmed;
            }

            // Handle :root specially - replace with scope selector
            if (trimmed === ':root') {
              return scopeSelector;
            }

            // Handle :host (for shadow DOM compatibility)
            if (trimmed === ':host') {
              return scopeSelector;
            }

            // Handle * selector
            if (trimmed === '*') {
              return `${scopeSelector} *`;
            }

            // Handle html/body - scope to container instead
            if (trimmed === 'html' || trimmed === 'body') {
              return scopeSelector;
            }

            // Prefix the selector
            return `${scopeSelector} ${trimmed}`;
          })
          .join(', ');

        return `${scoped} {`;
      }
    );
  }

  /**
   * Parse CSS to extract rule information
   * @param {string} css
   * @returns {{ rules: number, selectors: string[], variables: string[] }}
   */
  function parseCssInfo(css) {
    const selectors = [];
    const variables = [];

    // Count rules (rough estimate by counting {)
    const rules = (css.match(/\{/g) || []).length;

    // Extract selectors (before {)
    const selectorMatches = css.match(/([^{}]+)\{/g) || [];
    for (const match of selectorMatches) {
      const selector = match.replace('{', '').trim();
      if (selector && !selector.startsWith('@')) {
        selectors.push(...selector.split(',').map((s) => s.trim()));
      }
    }

    // Extract CSS custom properties (--var-name)
    const varMatches = css.match(/--[\w-]+/g) || [];
    variables.push(...new Set(varMatches));

    return { rules, selectors: selectors.slice(0, 10), variables: variables.slice(0, 10) };
  }

  /**
   * CSS executor - produces displayData for CSS content
   */
  class CssExecutor extends BaseExecutor {
    /** @type {readonly string[]} */
    languages = ['css', 'style', 'stylesheet'];

    /**
     * Execute CSS cell
     * @param {string} code - CSS content
     * @param {ExecutionContext} context - Execution context
     * @param {ExecuteOptions} [options] - Execution options
     * @returns {Promise<ExecutionResult>}
     */
    async execute(code, context, options = {}) {
      const startTime = performance.now();

      // Determine if scoping is requested
      const shouldScope = options.cellMeta?.scoped ?? options.cellMeta?.scope ?? false;
      const scopeId = options.execId || options.cellId || `css-${Date.now()}`;
      const scopeClass = shouldScope ? generateScopeClass(scopeId) : undefined;

      // Apply scoping if requested
      const processedCss = scopeClass ? scopeStyles$1(code, `.${scopeClass}`) : code;

      // Parse CSS for info
      const info = parseCssInfo(code);

      // Build display data
      /** @type {DisplayData[]} */
      const displayData = [
        {
          data: {
            'text/css': processedCss,
          },
          metadata: {
            // Original CSS (before scoping)
            original: code !== processedCss ? code : undefined,
            // Scoping info
            scoped: !!scopeClass,
            scopeClass,
            // CSS info
            ruleCount: info.rules,
            selectors: info.selectors,
            customProperties: info.variables,
            // Client hints
            inject: options.cellMeta?.inject ?? true,
            target: options.cellMeta?.target,
          },
        },
      ];

      const duration = performance.now() - startTime;

      // Build info message
      const parts = [`${info.rules} rule${info.rules !== 1 ? 's' : ''}`];
      if (scopeClass) {
        parts.push(`scoped to .${scopeClass}`);
      }
      if (info.variables.length > 0) {
        parts.push(`${info.variables.length} variable${info.variables.length !== 1 ? 's' : ''}`);
      }

      return {
        success: true,
        stdout: `CSS: ${parts.join(', ')}`,
        stderr: '',
        result: undefined,
        displayData,
        assets: [],
        executionCount: 0,
        duration,
      };
    }
  }

  /**
   * Create a CSS executor
   * @returns {CssExecutor}
   */
  function createCssExecutor() {
    return new CssExecutor();
  }

  /**
   * Execute Module
   *
   * Provides executors for different languages and the registry to manage them.
   *
   * @module execute
   */


  /**
   * Create a registry with default executors registered
   * @returns {ExecutorRegistry}
   */
  function createDefaultExecutorRegistry() {
    const registry = new ExecutorRegistry();
    registry.register(new JavaScriptExecutor());
    registry.register(new HtmlExecutor());
    registry.register(new CssExecutor());
    return registry;
  }

  /**
   * MRP Runtime
   *
   * Main entry point for the mrmd-js runtime. Implements the MRMD Runtime
   * Protocol (MRP) as a JavaScript API for browser-based execution.
   *
   * @module runtime
   */


  /**
   * @typedef {import('./types/capabilities.js').Capabilities} Capabilities
   * @typedef {import('./types/capabilities.js').Features} Features
   * @typedef {import('./types/capabilities.js').BrowserEnvironment} BrowserEnvironment
   * @typedef {import('./types/session.js').SessionInfo} SessionInfo
   * @typedef {import('./types/session.js').CreateSessionOptions} CreateSessionOptions
   * @typedef {import('./types/session.js').IsolationMode} IsolationMode
   * @typedef {import('./types/execution.js').ExecuteOptions} ExecuteOptions
   * @typedef {import('./types/execution.js').ExecutionResult} ExecutionResult
   * @typedef {import('./types/streaming.js').StreamEvent} StreamEvent
   * @typedef {import('./types/completion.js').CompleteOptions} CompleteOptions
   * @typedef {import('./types/completion.js').CompletionResult} CompletionResult
   * @typedef {import('./types/inspection.js').InspectOptions} InspectOptions
   * @typedef {import('./types/inspection.js').InspectResult} InspectResult
   * @typedef {import('./types/inspection.js').HoverResult} HoverResult
   * @typedef {import('./types/variables.js').VariableFilter} VariableFilter
   * @typedef {import('./types/variables.js').VariableInfo} VariableInfo
   * @typedef {import('./types/variables.js').VariableDetailOptions} VariableDetailOptions
   * @typedef {import('./types/variables.js').VariableDetail} VariableDetail
   * @typedef {import('./types/analysis.js').IsCompleteResult} IsCompleteResult
   * @typedef {import('./types/analysis.js').FormatResult} FormatResult
   * @typedef {import('./session/session.js').Session} Session
   * @typedef {import('./execute/registry.js').ExecutorRegistry} ExecutorRegistry
   * @typedef {import('./execute/interface.js').Executor} Executor
   */

  /**
   * @typedef {Object} MrpRuntimeOptions
   * @property {number} [maxSessions] - Maximum concurrent sessions
   * @property {IsolationMode} [defaultIsolation='iframe'] - Default isolation mode
   * @property {boolean} [defaultAllowMainAccess=false] - Allow main window access by default
   */

  /**
   * Asset stored in the runtime
   * @typedef {Object} StoredAsset
   * @property {string} url - Blob URL
   * @property {string} mimeType - MIME type
   * @property {string} assetType - Asset type category
   * @property {number} size - Size in bytes
   */

  /**
   * Main MRP runtime for browser JavaScript
   *
   * @example
   * const runtime = new MrpRuntime();
   * const session = runtime.createSession({ language: 'javascript' });
   * const result = await session.execute('const x = 1 + 2; x');
   * console.log(result.resultString); // "3"
   */
  class MrpRuntime {
    /** @type {SessionManager} */
    #sessionManager;

    /** @type {ExecutorRegistry} */
    #executorRegistry;

    /** @type {MrpRuntimeOptions} */
    #options;

    /** @type {Map<string, StoredAsset>} */
    #assets = new Map();

    /**
     * Create a new MRP runtime
     * @param {MrpRuntimeOptions} [options]
     */
    constructor(options = {}) {
      this.#options = {
        maxSessions: options.maxSessions ?? DEFAULT_MAX_SESSIONS,
        defaultIsolation: options.defaultIsolation ?? 'iframe',
        defaultAllowMainAccess: options.defaultAllowMainAccess ?? false,
      };

      this.#executorRegistry = createDefaultExecutorRegistry();
      this.#sessionManager = new SessionManager({
        maxSessions: this.#options.maxSessions,
      });
    }

    // ============================================================================
    // Capabilities
    // ============================================================================

    /**
     * Get runtime capabilities (MRP /capabilities)
     * @returns {Capabilities}
     */
    getCapabilities() {
      return {
        runtime: RUNTIME_NAME,
        version: RUNTIME_VERSION,
        languages: this.#executorRegistry.languages(),
        features: this.#getFeatures(),
        defaultSession: 'default',
        maxSessions: this.#options.maxSessions ?? DEFAULT_MAX_SESSIONS,
        environment: this.#getEnvironment(),
      };
    }

    /**
     * Get feature flags
     * @returns {Features}
     */
    #getFeatures() {
      return {
        execute: true,
        executeStream: true,
        interrupt: true,
        complete: true,
        inspect: true,
        hover: true,
        variables: true,
        variableExpand: true,
        reset: true,
        isComplete: true,
        format: true,
        assets: true,
      };
    }

    /**
     * Get environment info
     * @returns {BrowserEnvironment}
     */
    #getEnvironment() {
      return {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        language: typeof navigator !== 'undefined' ? navigator.language : 'en',
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
      };
    }

    // ============================================================================
    // Sessions
    // ============================================================================

    /**
     * List all active sessions (MRP GET /sessions)
     * @returns {SessionInfo[]}
     */
    listSessions() {
      return this.#sessionManager.list();
    }

    /**
     * Create a new session (MRP POST /sessions)
     * @param {CreateSessionOptions} [options]
     * @returns {Session}
     */
    createSession(options = {}) {
      const session = this.#sessionManager.create({
        ...options,
        isolation: options.isolation ?? this.#options.defaultIsolation,
        allowMainAccess: options.allowMainAccess ?? this.#options.defaultAllowMainAccess,
        executorRegistry: this.#executorRegistry,
      });
      return session;
    }

    /**
     * Get a session by ID (MRP GET /sessions/{id})
     * @param {string} id
     * @returns {Session | undefined}
     */
    getSession(id) {
      return this.#sessionManager.get(id);
    }

    /**
     * Get or create a session
     * @param {string} id
     * @param {CreateSessionOptions} [options]
     * @returns {Session}
     */
    getOrCreateSession(id, options = {}) {
      const existing = this.#sessionManager.get(id);
      if (existing) return existing;

      return this.createSession({ ...options, id });
    }

    /**
     * Destroy a session (MRP DELETE /sessions/{id})
     * @param {string} id
     * @returns {boolean}
     */
    destroySession(id) {
      return this.#sessionManager.destroy(id);
    }

    /**
     * Reset a session (MRP POST /sessions/{id}/reset)
     * @param {string} id
     * @returns {boolean}
     */
    resetSession(id) {
      const session = this.#sessionManager.get(id);
      if (!session) return false;
      session.reset();
      return true;
    }

    // ============================================================================
    // Execution (convenience methods using default session)
    // ============================================================================

    /**
     * Execute code (MRP POST /execute)
     * @param {string} code
     * @param {ExecuteOptions} [options]
     * @returns {Promise<ExecutionResult>}
     */
    async execute(code, options = {}) {
      const session = this.getOrCreateSession(options.session ?? 'default');
      return session.execute(code, options);
    }

    /**
     * Execute code with streaming output (MRP POST /execute/stream)
     * @param {string} code
     * @param {ExecuteOptions} [options]
     * @returns {AsyncGenerator<StreamEvent>}
     */
    async *executeStream(code, options = {}) {
      const session = this.getOrCreateSession(options.session ?? 'default');
      yield* session.executeStream(code, options);
    }

    /**
     * Send input to a waiting execution (MRP POST /input)
     * @param {string} sessionId
     * @param {string} execId
     * @param {string} text
     * @returns {boolean}
     */
    sendInput(sessionId, execId, text) {
      const session = this.#sessionManager.get(sessionId);
      if (!session) return false;
      return session.sendInput(execId, text);
    }

    /**
     * Interrupt execution (MRP POST /interrupt)
     * @param {string} [sessionId]
     * @param {string} [execId]
     * @returns {boolean}
     */
    interrupt(sessionId, execId) {
      if (sessionId) {
        const session = this.#sessionManager.get(sessionId);
        if (!session) return false;
        return session.interrupt(execId);
      }

      // Interrupt all sessions
      return this.#sessionManager.interruptAll();
    }

    // ============================================================================
    // LSP Features (convenience methods)
    // ============================================================================

    /**
     * Get completions (MRP POST /complete)
     * @param {string} code
     * @param {number} cursor
     * @param {CompleteOptions} [options]
     * @returns {CompletionResult}
     */
    complete(code, cursor, options = {}) {
      const session = this.getOrCreateSession(options.session ?? 'default');
      return session.complete(code, cursor, options);
    }

    /**
     * Get hover info (MRP POST /hover)
     * @param {string} code
     * @param {number} cursor
     * @param {string} [sessionId='default']
     * @returns {HoverResult}
     */
    hover(code, cursor, sessionId = 'default') {
      const session = this.getOrCreateSession(sessionId);
      return session.hover(code, cursor);
    }

    /**
     * Get inspection info (MRP POST /inspect)
     * @param {string} code
     * @param {number} cursor
     * @param {InspectOptions} [options]
     * @returns {InspectResult}
     */
    inspect(code, cursor, options = {}) {
      const session = this.getOrCreateSession(options.session ?? 'default');
      return session.inspect(code, cursor, options);
    }

    /**
     * List variables (MRP POST /variables)
     * @param {VariableFilter} [filter]
     * @param {string} [sessionId='default']
     * @returns {VariableInfo[]}
     */
    listVariables(filter, sessionId = 'default') {
      const session = this.getOrCreateSession(sessionId);
      return session.listVariables(filter);
    }

    /**
     * Get variable detail (MRP POST /variables/{name})
     * @param {string} name
     * @param {VariableDetailOptions} [options]
     * @returns {VariableDetail | null}
     */
    getVariable(name, options = {}) {
      const session = this.getOrCreateSession(options.session ?? 'default');
      return session.getVariable(name, options);
    }

    // ============================================================================
    // Analysis
    // ============================================================================

    /**
     * Check if code is complete (MRP POST /is_complete)
     * @param {string} code
     * @param {string} [sessionId='default']
     * @returns {IsCompleteResult}
     */
    isComplete(code, sessionId = 'default') {
      const session = this.getOrCreateSession(sessionId);
      return session.isComplete(code);
    }

    /**
     * Format code (MRP POST /format)
     * @param {string} code
     * @param {string} [sessionId='default']
     * @returns {Promise<FormatResult>}
     */
    async format(code, sessionId = 'default') {
      const session = this.getOrCreateSession(sessionId);
      return session.format(code);
    }

    // ============================================================================
    // Assets
    // ============================================================================

    /**
     * Create an asset (blob URL)
     * @param {Blob | string} content
     * @param {string} mimeType
     * @param {string} [name]
     * @returns {import('./types/execution.js').Asset}
     */
    createAsset(content, mimeType, name) {
      const blob = typeof content === 'string'
        ? new Blob([content], { type: mimeType })
        : content;

      const url = URL.createObjectURL(blob);
      const path = name ?? `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const assetType = mimeType.startsWith('image/')
        ? 'image'
        : mimeType === 'text/html'
          ? 'html'
          : mimeType === 'application/json'
            ? 'json'
            : 'other';

      this.#assets.set(path, {
        url,
        mimeType,
        assetType,
        size: blob.size,
      });

      return {
        path,
        url,
        mimeType,
        assetType,
        size: blob.size,
      };
    }

    /**
     * Get an asset by path (MRP GET /assets/{path})
     * @param {string} path
     * @returns {string | null} Blob URL or null if not found
     */
    getAsset(path) {
      const asset = this.#assets.get(path);
      return asset?.url ?? null;
    }

    /**
     * Get asset info
     * @param {string} path
     * @returns {StoredAsset | null}
     */
    getAssetInfo(path) {
      return this.#assets.get(path) ?? null;
    }

    /**
     * List all assets
     * @returns {Array<{ path: string } & StoredAsset>}
     */
    listAssets() {
      return Array.from(this.#assets.entries()).map(([path, asset]) => ({
        path,
        ...asset,
      }));
    }

    /**
     * Remove an asset
     * @param {string} path
     * @returns {boolean}
     */
    removeAsset(path) {
      const asset = this.#assets.get(path);
      if (!asset) return false;

      URL.revokeObjectURL(asset.url);
      this.#assets.delete(path);
      return true;
    }

    /**
     * Clear all assets
     */
    clearAssets() {
      for (const asset of this.#assets.values()) {
        URL.revokeObjectURL(asset.url);
      }
      this.#assets.clear();
    }

    // ============================================================================
    // Extensibility
    // ============================================================================

    /**
     * Register a custom executor for a language
     * @param {string} language
     * @param {Executor} executor
     */
    registerExecutor(language, executor) {
      this.#executorRegistry.register(language, executor);
    }

    /**
     * Register a language alias
     * @param {string} alias
     * @param {string} language
     */
    registerLanguageAlias(alias, language) {
      this.#executorRegistry.registerAlias(alias, language);
    }

    /**
     * Get the executor registry
     * @returns {ExecutorRegistry}
     */
    getExecutorRegistry() {
      return this.#executorRegistry;
    }

    /**
     * Get the session manager
     * @returns {SessionManager}
     */
    getSessionManager() {
      return this.#sessionManager;
    }

    // ============================================================================
    // Lifecycle
    // ============================================================================

    /**
     * Destroy the runtime and clean up all resources
     */
    destroy() {
      this.#sessionManager.destroyAll();
      this.clearAssets();
    }
  }

  /**
   * Create a new MRP runtime
   * @param {MrpRuntimeOptions} [options]
   * @returns {MrpRuntime}
   */
  function createRuntime(options) {
    return new MrpRuntime(options);
  }

  /**
   * HTML Renderer
   *
   * Utility for rendering HTML displayData from cell execution.
   * Provides three rendering modes: direct, shadow, and scoped.
   *
   * @module utils/html-renderer
   */

  /**
   * @typedef {'direct' | 'shadow' | 'scoped'} RenderMode
   */

  /**
   * @typedef {Object} RenderOptions
   * @property {RenderMode} [mode='direct'] - Rendering mode
   * @property {string} [scopeClass] - Scope class for 'scoped' mode
   * @property {boolean} [executeScripts=true] - Execute inline scripts
   * @property {(error: Error, script: string) => void} [onScriptError] - Script error callback
   * @property {boolean} [clear=true] - Clear container before rendering
   */

  /**
   * @typedef {Object} RenderResult
   * @property {HTMLElement} container - Container element
   * @property {ShadowRoot} [shadowRoot] - Shadow root if shadow mode
   * @property {number} scriptsExecuted - Number of scripts executed
   * @property {Error[]} scriptErrors - Script errors
   */

  /** @type {Set<string>} */
  const executedScripts = new Set();

  /**
   * HTML Renderer class for rendering displayData
   */
  class HtmlRenderer {
    /** @type {Map<string, Set<string>>} */
    #scriptHashes = new Map();

    /**
     * Render HTML string into a container
     *
     * @param {string} html - HTML string to render
     * @param {HTMLElement} container - Target container
     * @param {RenderOptions} [options]
     * @returns {RenderResult}
     */
    render(html, container, options = {}) {
      const mode = options.mode ?? 'direct';

      switch (mode) {
        case 'shadow':
          return this.#renderShadow(html, container, options);
        case 'scoped':
          return this.#renderScoped(html, container, options);
        case 'direct':
        default:
          return this.#renderDirect(html, container, options);
      }
    }

    /**
     * Render displayData into container
     *
     * @param {import('../types/execution.js').DisplayData} displayData
     * @param {HTMLElement} container
     * @param {RenderOptions} [options]
     * @returns {RenderResult}
     */
    renderDisplayData(displayData, container, options = {}) {
      const html = displayData.data['text/html'];
      if (!html) {
        return {
          container,
          scriptsExecuted: 0,
          scriptErrors: [],
        };
      }

      // Use scopeClass from metadata if available
      const scopeClass = options.scopeClass ?? displayData.metadata?.scopeClass;

      return this.render(html, container, {
        ...options,
        scopeClass: typeof scopeClass === 'string' ? scopeClass : undefined,
      });
    }

    /**
     * Render in direct mode (no isolation)
     * @param {string} html
     * @param {HTMLElement} container
     * @param {RenderOptions} options
     * @returns {RenderResult}
     */
    #renderDirect(html, container, options) {
      if (options.clear !== false) {
        container.innerHTML = '';
      }

      // Extract scripts before setting innerHTML
      const { content, scripts } = this.#extractScripts(html);

      // Append content
      const temp = document.createElement('div');
      temp.innerHTML = content;
      while (temp.firstChild) {
        container.appendChild(temp.firstChild);
      }

      // Execute scripts
      const { executed, errors } = this.#executeScripts(scripts, container, options);

      return {
        container,
        scriptsExecuted: executed,
        scriptErrors: errors,
      };
    }

    /**
     * Render in shadow mode (full isolation via Shadow DOM)
     * @param {string} html
     * @param {HTMLElement} container
     * @param {RenderOptions} options
     * @returns {RenderResult}
     */
    #renderShadow(html, container, options) {
      // Create or reuse shadow root
      let shadowRoot = container.shadowRoot;
      if (!shadowRoot) {
        shadowRoot = container.attachShadow({ mode: 'open' });
      }

      if (options.clear !== false) {
        shadowRoot.innerHTML = '';
      }

      // Extract scripts
      const { content, scripts } = this.#extractScripts(html);

      // Set content
      const temp = document.createElement('div');
      temp.innerHTML = content;
      while (temp.firstChild) {
        shadowRoot.appendChild(temp.firstChild);
      }

      // Execute scripts in shadow context
      const { executed, errors } = this.#executeScripts(scripts, shadowRoot, options);

      return {
        container,
        shadowRoot,
        scriptsExecuted: executed,
        scriptErrors: errors,
      };
    }

    /**
     * Render in scoped mode (CSS isolation via class prefixing)
     * @param {string} html
     * @param {HTMLElement} container
     * @param {RenderOptions} options
     * @returns {RenderResult}
     */
    #renderScoped(html, container, options) {
      const scopeClass = options.scopeClass ?? `mrmd-scope-${Date.now()}`;

      // Add scope class to container
      container.classList.add(scopeClass);

      if (options.clear !== false) {
        container.innerHTML = '';
      }

      // Extract scripts and styles
      const { content, scripts, styles } = this.#extractScriptsAndStyles(html);

      // Scope and append styles
      for (const style of styles) {
        const scopedCss = scopeStyles(style, `.${scopeClass}`);
        const styleEl = document.createElement('style');
        styleEl.textContent = scopedCss;
        container.appendChild(styleEl);
      }

      // Append content
      const temp = document.createElement('div');
      temp.innerHTML = content;
      while (temp.firstChild) {
        container.appendChild(temp.firstChild);
      }

      // Execute scripts
      const { executed, errors } = this.#executeScripts(scripts, container, options);

      return {
        container,
        scriptsExecuted: executed,
        scriptErrors: errors,
      };
    }

    /**
     * Extract scripts from HTML
     * @param {string} html
     * @returns {{ content: string, scripts: string[] }}
     */
    #extractScripts(html) {
      const scripts = [];
      const content = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match, code) => {
        scripts.push(code.trim());
        return '';
      });
      return { content, scripts };
    }

    /**
     * Extract scripts and styles from HTML
     * @param {string} html
     * @returns {{ content: string, scripts: string[], styles: string[] }}
     */
    #extractScriptsAndStyles(html) {
      const scripts = [];
      const styles = [];

      let content = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match, code) => {
        scripts.push(code.trim());
        return '';
      });

      content = content.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
        styles.push(css.trim());
        return '';
      });

      return { content, scripts, styles };
    }

    /**
     * Execute scripts
     * @param {string[]} scripts
     * @param {HTMLElement | ShadowRoot} context
     * @param {RenderOptions} options
     * @returns {{ executed: number, errors: Error[] }}
     */
    #executeScripts(scripts, context, options) {
      if (options.executeScripts === false) {
        return { executed: 0, errors: [] };
      }

      let executed = 0;
      const errors = [];

      for (const code of scripts) {
        if (!code) continue;

        // Skip already executed scripts (deduplication by content hash)
        const hash = this.#hashCode(code);
        if (executedScripts.has(hash)) {
          continue;
        }
        executedScripts.add(hash);

        try {
          // Create script element for proper execution
          const script = document.createElement('script');
          script.textContent = code;

          // Add to document to execute
          if (context instanceof ShadowRoot) {
            context.appendChild(script);
          } else {
            context.appendChild(script);
          }

          executed++;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          errors.push(error);
          options.onScriptError?.(error, code);
        }
      }

      return { executed, errors };
    }

    /**
     * Simple hash function for deduplication
     * @param {string} str
     * @returns {string}
     */
    #hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(36);
    }

    /**
     * Clear executed scripts cache (for re-execution)
     * @param {string} [execId] - Clear specific execution, or all if not provided
     */
    clearScripts(execId) {
      if (execId) {
        this.#scriptHashes.delete(execId);
      } else {
        this.#scriptHashes.clear();
        executedScripts.clear();
      }
    }
  }

  /**
   * Scope CSS selectors with a prefix
   * @param {string} css
   * @param {string} scopeSelector
   * @returns {string}
   */
  function scopeStyles(css, scopeSelector) {
    // Simple CSS scoping - prefix each selector
    // This is a basic implementation; a full parser would be more robust

    return css.replace(
      /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g,
      (match, selector, suffix) => {
        // Don't scope @-rules
        if (selector.trim().startsWith('@')) {
          return match;
        }

        // Don't scope :root, html, body
        const trimmed = selector.trim();
        if (trimmed === ':root' || trimmed === 'html' || trimmed === 'body') {
          return `${scopeSelector}${suffix}`;
        }

        // Scope the selector
        return `${scopeSelector} ${selector.trim()}${suffix}`;
      }
    );
  }

  /**
   * Create a new HTML renderer
   * @returns {HtmlRenderer}
   */
  function createHtmlRenderer() {
    return new HtmlRenderer();
  }

  /**
   * CSS Applicator
   *
   * Utility for applying CSS displayData from cell execution.
   * Manages stylesheet lifecycle and scoping.
   *
   * @module utils/css-applicator
   */


  /**
   * CSS Applicator class
   */
  class CssApplicator {
    /** @type {Map<string, HTMLStyleElement>} */
    #styles = new Map();

    /** @type {HTMLElement} */
    #container;

    /**
     * Create CSS applicator
     * @param {HTMLElement} [container=document.head] - Container for style elements
     */
    constructor(container) {
      this.#container = container ?? document.head;
    }

    /**
     * Apply CSS string
     *
     * @param {string} css - CSS string
     * @param {ApplyOptions} [options]
     * @returns {ApplyResult}
     */
    apply(css, options = {}) {
      const id = options.id ?? `mrmd-style-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Scope CSS if requested
      let processedCss = css;
      if (options.scope) {
        processedCss = scopeStyles(css, options.scope);
      }

      // Check for existing style with same ID
      let element = this.#styles.get(id);
      let replaced = false;

      if (element) {
        if (options.append) {
          element.textContent += '\n' + processedCss;
        } else {
          element.textContent = processedCss;
          replaced = true;
        }
      } else {
        element = document.createElement('style');
        element.id = id;
        element.textContent = processedCss;
        this.#container.appendChild(element);
        this.#styles.set(id, element);
      }

      return { element, id, replaced };
    }

    /**
     * Apply CSS from displayData
     *
     * @param {import('../types/execution.js').DisplayData} displayData
     * @param {ApplyOptions} [options]
     * @returns {ApplyResult | null}
     */
    applyDisplayData(displayData, options = {}) {
      const css = displayData.data['text/css'];
      if (!css) return null;

      // Use metadata for options if available
      const id = options.id ?? (displayData.metadata?.id ? String(displayData.metadata.id) : undefined);
      const scope = options.scope ?? (displayData.metadata?.scope ? String(displayData.metadata.scope) : undefined);

      return this.apply(css, { ...options, id, scope });
    }

    /**
     * Remove a style by ID
     * @param {string} id
     * @returns {boolean}
     */
    remove(id) {
      const element = this.#styles.get(id);
      if (!element) return false;

      element.remove();
      this.#styles.delete(id);
      return true;
    }

    /**
     * Remove all managed styles
     */
    clear() {
      for (const element of this.#styles.values()) {
        element.remove();
      }
      this.#styles.clear();
    }

    /**
     * Get all managed style IDs
     * @returns {string[]}
     */
    list() {
      return Array.from(this.#styles.keys());
    }

    /**
     * Get a style element by ID
     * @param {string} id
     * @returns {HTMLStyleElement | undefined}
     */
    get(id) {
      return this.#styles.get(id);
    }
  }

  /**
   * Create a CSS applicator
   * @param {HTMLElement} [container]
   * @returns {CssApplicator}
   */
  function createCssApplicator(container) {
    return new CssApplicator(container);
  }

  /**
   * ANSI to HTML Renderer
   *
   * Converts ANSI escape sequences to HTML with appropriate styling.
   * Useful for rendering terminal output from code execution.
   *
   * @module utils/ansi-renderer
   */

  /**
   * @typedef {Object} AnsiStyle
   * @property {string} [color] - Foreground color
   * @property {string} [background] - Background color
   * @property {boolean} [bold] - Bold text
   * @property {boolean} [dim] - Dim text
   * @property {boolean} [italic] - Italic text
   * @property {boolean} [underline] - Underlined text
   * @property {boolean} [strikethrough] - Strikethrough text
   * @property {boolean} [inverse] - Inverse colors
   */

  /**
   * ANSI color codes to CSS colors
   */
  const COLORS = {
    30: '#000000', // Black
    31: '#cc0000', // Red
    32: '#00cc00', // Green
    33: '#cccc00', // Yellow
    34: '#0000cc', // Blue
    35: '#cc00cc', // Magenta
    36: '#00cccc', // Cyan
    37: '#cccccc', // White
    90: '#666666', // Bright Black (Gray)
    91: '#ff0000', // Bright Red
    92: '#00ff00', // Bright Green
    93: '#ffff00', // Bright Yellow
    94: '#0000ff', // Bright Blue
    95: '#ff00ff', // Bright Magenta
    96: '#00ffff', // Bright Cyan
    97: '#ffffff', // Bright White
  };

  const BG_COLORS = {
    40: '#000000',
    41: '#cc0000',
    42: '#00cc00',
    43: '#cccc00',
    44: '#0000cc',
    45: '#cc00cc',
    46: '#00cccc',
    47: '#cccccc',
    100: '#666666',
    101: '#ff0000',
    102: '#00ff00',
    103: '#ffff00',
    104: '#0000ff',
    105: '#ff00ff',
    106: '#00ffff',
    107: '#ffffff',
  };

  /**
   * ANSI Renderer class
   */
  class AnsiRenderer {
    /** @type {boolean} */
    #escapeHtml = true;

    /**
     * Create ANSI renderer
     * @param {{ escapeHtml?: boolean }} [options]
     */
    constructor(options = {}) {
      this.#escapeHtml = options.escapeHtml !== false;
    }

    /**
     * Convert ANSI text to HTML
     *
     * @param {string} text - Text with ANSI escape sequences
     * @returns {string} HTML string
     */
    render(text) {
      if (!text) return '';

      /** @type {AnsiStyle} */
      let currentStyle = {};
      const parts = [];
      let currentText = '';

      // ANSI escape sequence regex
      const ansiRegex = /\x1b\[([0-9;]*)m/g;
      let lastIndex = 0;
      let match;

      while ((match = ansiRegex.exec(text)) !== null) {
        // Add text before this escape sequence
        const beforeText = text.slice(lastIndex, match.index);
        if (beforeText) {
          currentText += beforeText;
        }

        // Parse codes
        const codes = match[1].split(';').map(c => parseInt(c, 10) || 0);

        // Flush current text with current style
        if (currentText) {
          parts.push(this.#wrapWithStyle(currentText, currentStyle));
          currentText = '';
        }

        // Update style based on codes
        currentStyle = this.#updateStyle(currentStyle, codes);

        lastIndex = ansiRegex.lastIndex;
      }

      // Add remaining text
      const remainingText = text.slice(lastIndex);
      if (remainingText) {
        currentText += remainingText;
      }

      if (currentText) {
        parts.push(this.#wrapWithStyle(currentText, currentStyle));
      }

      return parts.join('');
    }

    /**
     * Render to a DOM element
     *
     * @param {string} text - ANSI text
     * @param {HTMLElement} container - Target container
     * @param {{ clear?: boolean }} [options]
     */
    renderTo(text, container, options = {}) {
      const html = this.render(text);

      if (options.clear !== false) {
        container.innerHTML = '';
      }

      const wrapper = document.createElement('pre');
      wrapper.className = 'ansi-output';
      wrapper.innerHTML = html;
      container.appendChild(wrapper);
    }

    /**
     * Update style based on ANSI codes
     * @param {AnsiStyle} style
     * @param {number[]} codes
     * @returns {AnsiStyle}
     */
    #updateStyle(style, codes) {
      const newStyle = { ...style };

      for (const code of codes) {
        if (code === 0) {
          // Reset all
          return {};
        } else if (code === 1) {
          newStyle.bold = true;
        } else if (code === 2) {
          newStyle.dim = true;
        } else if (code === 3) {
          newStyle.italic = true;
        } else if (code === 4) {
          newStyle.underline = true;
        } else if (code === 7) {
          newStyle.inverse = true;
        } else if (code === 9) {
          newStyle.strikethrough = true;
        } else if (code === 22) {
          newStyle.bold = false;
          newStyle.dim = false;
        } else if (code === 23) {
          newStyle.italic = false;
        } else if (code === 24) {
          newStyle.underline = false;
        } else if (code === 27) {
          newStyle.inverse = false;
        } else if (code === 29) {
          newStyle.strikethrough = false;
        } else if (code === 39) {
          delete newStyle.color;
        } else if (code === 49) {
          delete newStyle.background;
        } else if (code >= 30 && code <= 37) {
          newStyle.color = COLORS[code];
        } else if (code >= 40 && code <= 47) {
          newStyle.background = BG_COLORS[code];
        } else if (code >= 90 && code <= 97) {
          newStyle.color = COLORS[code];
        } else if (code >= 100 && code <= 107) {
          newStyle.background = BG_COLORS[code];
        }
        // TODO: 256 color and RGB support (38;5;n and 38;2;r;g;b)
      }

      return newStyle;
    }

    /**
     * Wrap text with style span
     * @param {string} text
     * @param {AnsiStyle} style
     * @returns {string}
     */
    #wrapWithStyle(text, style) {
      // Escape HTML if needed
      let escaped = text;
      if (this.#escapeHtml) {
        escaped = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      // No style needed
      if (Object.keys(style).length === 0) {
        return escaped;
      }

      // Build inline style
      const styles = [];

      if (style.color) {
        styles.push(`color:${style.color}`);
      }
      if (style.background) {
        styles.push(`background-color:${style.background}`);
      }
      if (style.bold) {
        styles.push('font-weight:bold');
      }
      if (style.dim) {
        styles.push('opacity:0.5');
      }
      if (style.italic) {
        styles.push('font-style:italic');
      }
      if (style.underline) {
        styles.push('text-decoration:underline');
      }
      if (style.strikethrough) {
        if (style.underline) {
          styles.push('text-decoration:underline line-through');
        } else {
          styles.push('text-decoration:line-through');
        }
      }

      if (styles.length === 0) {
        return escaped;
      }

      return `<span style="${styles.join(';')}">${escaped}</span>`;
    }

    /**
     * Strip ANSI codes from text
     * @param {string} text
     * @returns {string}
     */
    static strip(text) {
      return text.replace(/\x1b\[[0-9;]*m/g, '');
    }
  }

  /**
   * Convert ANSI text to HTML (convenience function)
   * @param {string} text
   * @returns {string}
   */
  function ansiToHtml(text) {
    return new AnsiRenderer().render(text);
  }

  /**
   * Strip ANSI codes (convenience function)
   * @param {string} text
   * @returns {string}
   */
  function stripAnsi(text) {
    return AnsiRenderer.strip(text);
  }

  /**
   * Create an ANSI renderer
   * @param {{ escapeHtml?: boolean }} [options]
   * @returns {AnsiRenderer}
   */
  function createAnsiRenderer(options) {
    return new AnsiRenderer(options);
  }

  exports.AnsiRenderer = AnsiRenderer;
  exports.BaseExecutor = BaseExecutor;
  exports.ConsoleCapture = ConsoleCapture;
  exports.CssApplicator = CssApplicator;
  exports.CssExecutor = CssExecutor;
  exports.DEFAULT_FEATURES = DEFAULT_FEATURES;
  exports.DEFAULT_MAX_SESSIONS = DEFAULT_MAX_SESSIONS;
  exports.DEFAULT_SESSION = DEFAULT_SESSION;
  exports.ExecutorRegistry = ExecutorRegistry;
  exports.HtmlExecutor = HtmlExecutor;
  exports.HtmlRenderer = HtmlRenderer;
  exports.IframeContext = IframeContext;
  exports.JavaScriptExecutor = JavaScriptExecutor;
  exports.MainContext = MainContext;
  exports.MrpRuntime = MrpRuntime;
  exports.RUNTIME_NAME = RUNTIME_NAME;
  exports.RUNTIME_VERSION = RUNTIME_VERSION;
  exports.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
  exports.Session = Session;
  exports.SessionManager = SessionManager;
  exports.ansiToHtml = ansiToHtml;
  exports.basicFormat = basicFormat;
  exports.createAnsiRenderer = createAnsiRenderer;
  exports.createConsoleCapture = createConsoleCapture;
  exports.createCssApplicator = createCssApplicator;
  exports.createCssExecutor = createCssExecutor;
  exports.createDefaultExecutorRegistry = createDefaultExecutorRegistry;
  exports.createExecutorRegistry = createExecutorRegistry;
  exports.createHtmlExecutor = createHtmlExecutor;
  exports.createHtmlRenderer = createHtmlRenderer;
  exports.createIframeContext = createIframeContext;
  exports.createJavaScriptExecutor = createJavaScriptExecutor;
  exports.createMainContext = createMainContext;
  exports.createRuntime = createRuntime;
  exports.createSession = createSession;
  exports.createSessionManager = createSessionManager;
  exports.expandVariable = expandVariable;
  exports.extractDeclaredVariables = extractDeclaredVariables;
  exports.extractScripts = extractScripts;
  exports.extractStyles = extractStyles;
  exports.formatCode = formatCode;
  exports.formatCss = formatCss;
  exports.formatHtml = formatHtml;
  exports.formatValue = formatValue;
  exports.formatValueShort = formatValueShort;
  exports.formatVariableInfo = formatVariableInfo;
  exports.generateScopeClass = generateScopeClass;
  exports.getAttributes = getAttributes;
  exports.getChildren = getChildren;
  exports.getCommonGlobals = getCommonGlobals;
  exports.getCompletionKind = getCompletionKind;
  exports.getCompletions = getCompletions;
  exports.getFunctionSignature = getFunctionSignature;
  exports.getFunctionSource = getFunctionSource;
  exports.getHoverInfo = getHoverInfo;
  exports.getInspectInfo = getInspectInfo;
  exports.getKeywords = getKeywords;
  exports.getMethods = getMethods;
  exports.getSizeDescription = getSizeDescription;
  exports.getStringOrCommentContext = getStringOrCommentContext;
  exports.getSuggestedIndent = getSuggestedIndent;
  exports.getTypeName = getTypeName;
  exports.getVariableDetail = getVariableDetail;
  exports.getWordAtCursor = getWordAtCursor;
  exports.hasPrettier = hasPrettier;
  exports.inspectPath = inspectPath;
  exports.isComplete = isComplete;
  exports.isExpandable = isExpandable;
  exports.isIdentifierPart = isIdentifierPart;
  exports.isIdentifierStart = isIdentifierStart;
  exports.isKeyword = isKeyword;
  exports.listVariables = listVariables;
  exports.parseCompletionContext = parseCompletionContext;
  exports.parseIdentifierAtPosition = parseIdentifierAtPosition;
  exports.scopeStyles = scopeStyles$1;
  exports.scopeStylesUtil = scopeStyles;
  exports.setPrettier = setPrettier;
  exports.splitObjectPath = splitObjectPath;
  exports.stripAnsi = stripAnsi;
  exports.transformForPersistence = transformForPersistence;
  exports.wrapForAsync = wrapForAsync;
  exports.wrapWithLastExpression = wrapWithLastExpression;

  return exports;

})({});
//# sourceMappingURL=mrmd-js.iife.js.map
