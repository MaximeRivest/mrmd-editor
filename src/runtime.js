/**
 * Runtime Registry
 *
 * Manages execution runtimes for different languages.
 * Runtimes are provided by separate packages (mrmd-python, mrmd-js, etc.)
 *
 * A runtime must implement:
 * - supports(language: string): boolean
 * - execute(code: string, language: string): Promise<{stdout, stderr, error?}>
 * - OR executeStreaming(code, language, onChunk): Promise<result>
 */

/**
 * Runtime interface (for documentation)
 *
 * @typedef {Object} Runtime
 * @property {function(string): boolean} supports - Check if runtime handles language
 * @property {function(string, string): Promise<ExecutionResult>} execute - Execute code
 * @property {function(string, string, function): Promise<ExecutionResult>} [executeStreaming] - Streaming execution
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {string} stdout - Standard output
 * @property {string} stderr - Standard error
 * @property {string} [result] - Return value (if any)
 * @property {Object} [error] - Error info if failed
 * @property {boolean} success - Whether execution succeeded
 */

/**
 * Runtime Registry
 *
 * Holds registered runtimes and routes execution to the correct one.
 */
export class RuntimeRegistry {
  constructor() {
    /** @type {Map<string, Runtime>} */
    this.runtimes = new Map();

    /** @type {Map<string, string>} Language -> runtime name mapping */
    this.languageMap = new Map();
  }

  /**
   * Register a runtime
   *
   * @param {string} name - Runtime name (e.g., 'python', 'javascript')
   * @param {Runtime} runtime - Runtime instance
   */
  register(name, runtime) {
    if (!runtime || typeof runtime.supports !== 'function') {
      throw new Error(`Runtime '${name}' must implement supports(language)`);
    }
    if (typeof runtime.execute !== 'function' && typeof runtime.executeStreaming !== 'function') {
      throw new Error(`Runtime '${name}' must implement execute() or executeStreaming()`);
    }

    this.runtimes.set(name, runtime);

    // Auto-discover supported languages
    const testLanguages = [
      'python', 'py', 'python3',
      'javascript', 'js', 'node', 'typescript', 'ts',
      'julia', 'jl',
      'r', 'rlang',
      'bash', 'sh', 'shell',
      'html',
    ];

    for (const lang of testLanguages) {
      if (runtime.supports(lang)) {
        this.languageMap.set(lang, name);
      }
    }
  }

  /**
   * Unregister a runtime
   *
   * @param {string} name - Runtime name
   */
  unregister(name) {
    this.runtimes.delete(name);

    // Clean up language mappings
    for (const [lang, runtimeName] of this.languageMap) {
      if (runtimeName === name) {
        this.languageMap.delete(lang);
      }
    }
  }

  /**
   * Get runtime for a language
   *
   * @param {string} language - Language identifier
   * @returns {Runtime|null}
   */
  getRuntime(language) {
    const normalizedLang = language.toLowerCase();

    // Check explicit mapping first
    const runtimeName = this.languageMap.get(normalizedLang);
    if (runtimeName) {
      return this.runtimes.get(runtimeName) || null;
    }

    // Fallback: check all runtimes
    for (const runtime of this.runtimes.values()) {
      if (runtime.supports(normalizedLang)) {
        return runtime;
      }
    }

    return null;
  }

  /**
   * Check if any runtime supports a language
   *
   * @param {string} language - Language identifier
   * @returns {boolean}
   */
  supports(language) {
    return this.getRuntime(language) !== null;
  }

  /**
   * Execute code using the appropriate runtime
   *
   * @param {string} code - Code to execute
   * @param {string} language - Language identifier
   * @returns {Promise<ExecutionResult>}
   */
  async execute(code, language) {
    const runtime = this.getRuntime(language);
    if (!runtime) {
      return {
        stdout: '',
        stderr: `No runtime registered for language: ${language}`,
        success: false,
        error: { type: 'NoRuntime', message: `No runtime for ${language}` },
      };
    }

    return runtime.execute(code, language);
  }

  /**
   * Execute code with streaming output
   *
   * @param {string} code - Code to execute
   * @param {string} language - Language identifier
   * @param {function(string, string, boolean): void} onChunk - Callback (chunk, accumulated, done)
   * @returns {Promise<ExecutionResult>}
   */
  async executeStreaming(code, language, onChunk) {
    const runtime = this.getRuntime(language);
    if (!runtime) {
      const error = `No runtime registered for language: ${language}`;
      onChunk(error, error, true);
      return {
        stdout: '',
        stderr: error,
        success: false,
        error: { type: 'NoRuntime', message: error },
      };
    }

    // Use streaming if available, otherwise wrap execute
    if (typeof runtime.executeStreaming === 'function') {
      return runtime.executeStreaming(code, language, onChunk);
    } else {
      // Fallback: run execute and send all output at once
      const result = await runtime.execute(code, language);
      const output = result.stdout + (result.stderr ? '\n' + result.stderr : '');
      onChunk(output, output, true);
      return result;
    }
  }

  /**
   * List registered runtimes
   *
   * @returns {string[]}
   */
  list() {
    return Array.from(this.runtimes.keys());
  }

  /**
   * Get all supported languages
   *
   * @returns {string[]}
   */
  supportedLanguages() {
    return Array.from(this.languageMap.keys());
  }
}

/**
 * Create a new runtime registry
 *
 * @returns {RuntimeRegistry}
 */
export function createRuntimeRegistry() {
  return new RuntimeRegistry();
}
