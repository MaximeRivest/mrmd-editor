/**
 * @fileoverview Config schema type definitions
 *
 * Config is what you DECLARE. It's serializable and restorable.
 * Changing config reconfigures the editor.
 */

// =============================================================================
// MAIN CONFIG
// =============================================================================

/**
 * Editor configuration - everything you can declare
 * @typedef {Object} EditorConfig
 * @property {DriveConfig} [drive] - Sync server connection
 * @property {DocumentConfig} [document] - Document settings
 * @property {AppearanceConfig} [appearance] - Visual settings
 * @property {UserConfig} [user] - User identity
 * @property {Record<string, RuntimeConfig>} [runtimes] - Code execution runtimes
 * @property {ExecutionConfig} [execution] - Execution settings
 * @property {CellControlsConfig} [cellControls] - Cell controls (buttons, status, queue)
 * @property {AIConfig} [ai] - AI service endpoints
 * @property {SectionControlsConfig} [sectionControls] - Section controls (AI/formatting)
 * @property {AwarenessConfig} [awareness] - Collaboration UI settings
 * @property {boolean | DevPanelConfig} [devPanel] - Developer panel
 */

// =============================================================================
// DRIVE / CONNECTION
// =============================================================================

/**
 * Sync server connection configuration
 * @typedef {Object} DriveConfig
 * @property {string} url - WebSocket URL (e.g., 'ws://localhost:4444')
 * @property {string} [auth] - Authentication token
 */

/**
 * Document configuration
 * @typedef {Object} DocumentConfig
 * @property {string} [path] - Path on drive (e.g., 'notes/readme.md')
 * @property {string} [content] - Initial content (only used if no drive or new file)
 */

// =============================================================================
// APPEARANCE
// =============================================================================

/**
 * Visual appearance configuration
 * @typedef {Object} AppearanceConfig
 * @property {boolean | null} [dark] - Dark mode: true=dark, false=light, null=system
 * @property {string | null} [theme] - Theme name: 'midnight', 'daylight', 'plain-light', or custom.
 *   If null, defaults to 'plain-light'.
 * @property {boolean} [readonly] - View-only mode
 * @property {string} [placeholder] - Placeholder text when empty
 * @property {boolean} [spellcheck] - Enable browser-native spellcheck on prose
 *   (automatically disabled inside fenced code blocks).
 *   Works in browsers and Electron (Chromium's OS-level spellchecker).
 */

/** @type {AppearanceConfig} */
export const DEFAULT_APPEARANCE = {
  dark: null,
  theme: null,  // Defaults to plain-light
  readonly: false,
  placeholder: 'Start typing...',
  spellcheck: true,
};

// =============================================================================
// USER / IDENTITY
// =============================================================================

/**
 * User identity configuration
 * @typedef {Object} UserConfig
 * @property {string} [name] - Display name
 * @property {string} [color] - Cursor/highlight color
 * @property {'human' | 'ai' | 'runtime' | 'sync'} [type] - Collaborator type
 */

/** @type {UserConfig} */
export const DEFAULT_USER = {
  name: 'Anonymous',
  color: null, // Will be randomly generated
  type: 'human'
};

// =============================================================================
// RUNTIMES
// =============================================================================

/**
 * Runtime configuration - can be declarative or instance-based
 * @typedef {BuiltinRuntimeConfig | MRPRuntimeConfig | CustomRuntimeConfig} RuntimeConfig
 */

/**
 * Built-in JavaScript runtime (mrmd-js)
 * @typedef {Object} BuiltinRuntimeConfig
 * @property {'builtin'} type
 * @property {'main' | 'iframe'} [isolation] - Execution isolation mode
 */

/**
 * MRP (MRMD Runtime Protocol) server runtime
 * @typedef {Object} MRPRuntimeConfig
 * @property {'mrp'} type
 * @property {string} url - Server URL (e.g., 'http://localhost:8000/mrp/v1')
 * @property {number} [timeout] - Request timeout in ms
 */

/**
 * Custom runtime instance (not serializable)
 * @typedef {Object} CustomRuntimeConfig
 * @property {'custom'} type
 * @property {RuntimeInstance} instance - The actual runtime object
 */

/**
 * Runtime instance interface (for custom runtimes)
 * @typedef {Object} RuntimeInstance
 * @property {(language: string) => boolean} supports - Check language support
 * @property {(code: string, language: string) => Promise<ExecutionResult>} execute - Execute code
 * @property {(code: string, language: string, onChunk: Function, onStdin?: Function) => Promise<ExecutionResult>} [executeStreaming] - Streaming execution
 */

/**
 * Execution result from a runtime
 * @typedef {Object} ExecutionResult
 * @property {string} [stdout] - Standard output
 * @property {string} [stderr] - Standard error
 * @property {string} [result] - Return value
 * @property {boolean} success - Whether execution succeeded
 * @property {number} [duration] - Duration in ms
 * @property {ExecutionError} [error] - Error details if failed
 */

/**
 * Execution error details
 * @typedef {Object} ExecutionError
 * @property {string} name - Error name/type
 * @property {string} message - Error message
 * @property {string} [traceback] - Stack trace
 */

// =============================================================================
// AI ENDPOINTS
// =============================================================================

/**
 * AI services configuration
 * @typedef {Object} AIConfig
 * @property {AIEndpointConfig[]} [endpoints] - Configured endpoints
 * @property {string} [default] - Default endpoint ID
 */

/**
 * Single AI endpoint configuration
 * @typedef {Object} AIEndpointConfig
 * @property {string} id - Unique identifier
 * @property {'chat' | 'completion' | 'transcription' | 'code'} type - Endpoint type
 * @property {'openai' | 'anthropic' | 'local' | 'custom'} provider - Provider
 * @property {string} [url] - Custom endpoint URL
 * @property {string} [model] - Model name (e.g., 'gpt-4', 'claude-sonnet-4-20250514')
 */

// =============================================================================
// AWARENESS / COLLABORATION
// =============================================================================

/**
 * Awareness/collaboration UI configuration
 * @typedef {Object} AwarenessConfig
 * @property {boolean} [enabled] - Enable awareness features
 * @property {boolean} [showCursors] - Show other users' cursors
 * @property {boolean} [showNames] - Show cursor name labels
 * @property {boolean} [showActivity] - Show typing/executing indicators
 */

/** @type {AwarenessConfig} */
export const DEFAULT_AWARENESS = {
  enabled: true,
  showCursors: true,
  showNames: true,
  showActivity: true
};

// =============================================================================
// EXECUTION
// =============================================================================

/**
 * Execution configuration
 * @typedef {Object} ExecutionConfig
 * @property {boolean} [autoRefreshVariables] - Auto-refresh variables after execution
 */

/** @type {ExecutionConfig} */
export const DEFAULT_EXECUTION = {
  autoRefreshVariables: false
};

// =============================================================================
// CELL CONTROLS
// =============================================================================

/**
 * Cell controls configuration - buttons and status for code cells
 * @typedef {Object} CellControlsConfig
 * @property {boolean} [enabled] - Master switch for cell controls
 * @property {'line-start'|'line-end'|'gutter'|'none'} [position] - Where to show controls
 * @property {CellButtonsConfig} [buttons] - Which buttons to show
 * @property {CellStatusConfig} [status] - Status indicator settings
 * @property {CellQueueConfig} [queue] - Queue behavior settings
 */

/**
 * Cell buttons configuration
 * @typedef {Object} CellButtonsConfig
 * @property {boolean} [run] - Show run/play button
 * @property {boolean} [stop] - Show stop/cancel button (when running/queued)
 * @property {boolean} [clear] - Show clear output button
 * @property {boolean} [copy] - Show copy code button
 * @property {boolean} [copyOutput] - Show copy output button
 * @property {boolean} [copyBoth] - Show copy code+output button
 */

/**
 * Cell status indicator configuration
 * @typedef {Object} CellStatusConfig
 * @property {boolean} [show] - Show status indicator (idle/queued/running)
 * @property {boolean} [showQueuePosition] - Show position in queue (e.g., "2/3")
 * @property {boolean} [statusLineInOutput] - Add [status:...] lines to output blocks
 */

/**
 * Cell execution queue configuration
 * @typedef {Object} CellQueueConfig
 * @property {'sequential'|'parallel'} [mode] - Queue processing mode
 * @property {number} [maxConcurrent] - Max concurrent executions (for parallel mode)
 */

/** @type {CellButtonsConfig} */
export const DEFAULT_CELL_BUTTONS = {
  run: true,
  stop: true,
  clear: true,
  copy: true,
  copyOutput: true,
  copyBoth: false
};

/** @type {CellStatusConfig} */
export const DEFAULT_CELL_STATUS = {
  show: true,
  showQueuePosition: true,
  statusLineInOutput: true
};

/** @type {CellQueueConfig} */
export const DEFAULT_CELL_QUEUE = {
  mode: 'sequential',
  maxConcurrent: 1
};

/** @type {CellControlsConfig} */
export const DEFAULT_CELL_CONTROLS = {
  enabled: true,
  position: 'line-start',
  buttons: { ...DEFAULT_CELL_BUTTONS },
  status: { ...DEFAULT_CELL_STATUS },
  queue: { ...DEFAULT_CELL_QUEUE }
};

/**
 * Section controls configuration - AI and formatting buttons next to sections
 * @typedef {Object} SectionControlsConfig
 * @property {boolean} [enabled] - Master switch for section controls
 * @property {boolean} [showAi] - Show AI command buttons
 * @property {boolean} [showFormatting] - Show markdown formatting buttons
 * @property {'full' | 'dots-hover' | 'dots-click'} [mode] - Display mode:
 *   'full' = always show toolbar, 'dots-hover' = dots that expand on hover,
 *   'dots-click' = dots that open command palette on click
 */

/** @type {SectionControlsConfig} */
export const DEFAULT_SECTION_CONTROLS = {
  enabled: true,
  showAi: true,
  showFormatting: true,
  mode: 'dots-click'
};

// =============================================================================
// DEV PANEL
// =============================================================================

/**
 * Developer panel configuration
 * @typedef {Object} DevPanelConfig
 * @property {boolean} [enabled] - Enable the panel
 * @property {boolean} [startOpen] - Start with panel open
 * @property {'bottom' | 'right'} [position] - Panel position
 * @property {number} [maxHeight] - Maximum height in pixels
 */

/** @type {DevPanelConfig} */
export const DEFAULT_DEV_PANEL = {
  enabled: false,
  startOpen: false,
  position: 'bottom',
  maxHeight: 300
};

// =============================================================================
// FULL DEFAULTS
// =============================================================================

/**
 * Get default config with all values filled in
 * @returns {EditorConfig}
 */
export function getDefaultConfig() {
  return {
    drive: null,
    document: {
      path: null,
      content: ''
    },
    appearance: { ...DEFAULT_APPEARANCE },
    user: { ...DEFAULT_USER },
    runtimes: {},
    execution: { ...DEFAULT_EXECUTION },
    cellControls: {
      enabled: DEFAULT_CELL_CONTROLS.enabled,
      position: DEFAULT_CELL_CONTROLS.position,
      buttons: { ...DEFAULT_CELL_BUTTONS },
      status: { ...DEFAULT_CELL_STATUS },
      queue: { ...DEFAULT_CELL_QUEUE }
    },
    ai: {
      endpoints: [],
      default: null
    },
    sectionControls: { ...DEFAULT_SECTION_CONTROLS },
    awareness: { ...DEFAULT_AWARENESS },
    devPanel: { ...DEFAULT_DEV_PANEL }
  };
}

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Normalize flat options (current API) to structured config
 * This maintains backward compatibility with the existing API.
 *
 * @param {Object} options - Flat options from create()
 * @returns {EditorConfig}
 */
export function normalizeOptions(options = {}) {
  const config = getDefaultConfig();

  // Document
  if (options.doc !== undefined) {
    config.document.content = options.doc;
  }

  // Appearance
  if (options.dark !== undefined) {
    config.appearance.dark = options.dark;
  }
  if (options.theme !== undefined) {
    config.appearance.theme = options.theme;
  }
  if (options.readonly !== undefined) {
    config.appearance.readonly = options.readonly;
  }
  if (options.placeholder !== undefined) {
    config.appearance.placeholder = options.placeholder;
  }
  if (options.spellcheck !== undefined) {
    config.appearance.spellcheck = options.spellcheck;
  }

  // User
  if (options.userName !== undefined) {
    config.user.name = options.userName;
  }
  if (options.userColor !== undefined) {
    config.user.color = options.userColor;
  }
  if (options.userType !== undefined) {
    config.user.type = options.userType;
  }

  // Runtimes - convert instances to custom config
  if (options.runtimes) {
    for (const [name, runtime] of Object.entries(options.runtimes)) {
      if (runtime && typeof runtime === 'object') {
        if (runtime.type === 'mrp' || runtime.type === 'builtin') {
          // Already in config format
          config.runtimes[name] = runtime;
        } else {
          // Instance - wrap in custom config
          config.runtimes[name] = { type: 'custom', instance: runtime };
        }
      }
    }
  }

  // JavaScript runtime shorthand
  if (options.javascript === true) {
    config.runtimes.javascript = { type: 'builtin' };
  } else if (options.javascript === false) {
    // Explicitly disabled (even if provided via options.runtimes)
    delete config.runtimes.javascript;
  } else if (options.javascript && typeof options.javascript === 'object') {
    config.runtimes.javascript = { type: 'custom', instance: options.javascript };
  } else if (options.javascript === undefined && !config.runtimes.javascript) {
    // Default: enable builtin only when no JS runtime was already provided
    config.runtimes.javascript = { type: 'builtin' };
  }

  // Awareness
  if (options.awarenessUI === false) {
    config.awareness.enabled = false;
  } else if (typeof options.awarenessUI === 'object') {
    config.awareness = { ...config.awareness, ...options.awarenessUI };
  }

  // Dev panel (new option)
  if (options.devPanel !== undefined) {
    if (options.devPanel === true) {
      config.devPanel = { ...DEFAULT_DEV_PANEL, enabled: true };
    } else if (options.devPanel === false) {
      config.devPanel = { ...DEFAULT_DEV_PANEL, enabled: false };
    } else if (typeof options.devPanel === 'object') {
      config.devPanel = { ...DEFAULT_DEV_PANEL, ...options.devPanel, enabled: true };
    }
  }

  // Execution options
  if (options.autoRefreshVariables !== undefined) {
    config.execution.autoRefreshVariables = options.autoRefreshVariables;
  }

  // Section controls
  if (options.sectionControls !== undefined) {
    if (options.sectionControls === true) {
      config.sectionControls.enabled = true;
    } else if (options.sectionControls === false) {
      config.sectionControls.enabled = false;
    } else if (typeof options.sectionControls === 'object') {
      config.sectionControls = {
        ...config.sectionControls,
        ...options.sectionControls
      };
    }
  }

  // Cell controls
  if (options.cellControls !== undefined) {
    if (options.cellControls === true) {
      config.cellControls.enabled = true;
    } else if (options.cellControls === false) {
      config.cellControls.enabled = false;
    } else if (typeof options.cellControls === 'object') {
      config.cellControls = {
        ...config.cellControls,
        ...options.cellControls,
        buttons: { ...config.cellControls.buttons, ...options.cellControls.buttons },
        status: { ...config.cellControls.status, ...options.cellControls.status },
        queue: { ...config.cellControls.queue, ...options.cellControls.queue }
      };
    }
  }

  // If structured config properties are provided, use them directly
  if (options.drive) config.drive = options.drive;
  if (options.document) config.document = { ...config.document, ...options.document };
  if (options.appearance) config.appearance = { ...config.appearance, ...options.appearance };
  if (options.user) config.user = { ...config.user, ...options.user };
  if (options.execution) config.execution = { ...config.execution, ...options.execution };
  if (options.ai) config.ai = options.ai;
  if (options.awareness && typeof options.awareness === 'object') {
    config.awareness = { ...config.awareness, ...options.awareness };
  }

  return config;
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Serialize config to JSON-safe object
 * Custom runtime instances are converted to markers.
 *
 * @param {EditorConfig} config
 * @returns {Object}
 */
export function serializeConfig(config) {
  const serialized = JSON.parse(JSON.stringify(config, (key, value) => {
    // Handle custom runtime instances
    if (key === 'instance' && typeof value === 'object' && value !== null) {
      return '[CustomRuntime - not serializable]';
    }
    return value;
  }));

  return serialized;
}

/**
 * Check if config can be fully serialized
 * @param {EditorConfig} config
 * @returns {boolean}
 */
export function isFullySerializable(config) {
  if (!config.runtimes) return true;

  for (const runtime of Object.values(config.runtimes)) {
    if (runtime.type === 'custom') {
      return false;
    }
  }

  return true;
}
