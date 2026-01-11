/**
 * mrmd - Markdown editor with realtime collaboration
 *
 * A markdown editor where humans, code, and AI all collaborate through
 * the same interface. The document is just text - everything writes to
 * it like a human would:
 *
 * - Human → keyboard → insert/replace text
 * - Code cells → runtime → stream output as text
 * - AI/LLM → API → stream response as text
 * - Other browsers → network → Yjs sync
 *
 * Usage:
 *   import mrmd from 'mrmd-editor';
 *
 *   // Standalone editor
 *   const editor = mrmd.create('#editor', { doc: '# Hello' });
 *
 *   // With code execution
 *   import { JavaScriptExecutor } from 'mrmd-js';
 *   const editor = mrmd.create('#editor', {
 *     runtimes: { javascript: new JavaScriptExecutor() }
 *   });
 *   editor.runCurrentCell();
 *
 *   // With sync server
 *   const docs = mrmd.drive('wss://server');
 *   const editor = docs.open('readme.md', '#editor');
 */

// #region IMPORTS
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, StateEffect, Compartment, Text, Transaction } from '@codemirror/state';
import { keymap, Decoration, ViewPlugin, WidgetType, placeholder } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { StreamLanguage, syntaxTree, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

// Language support
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { sql } from '@codemirror/lang-sql';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { r } from 'codemirror-lang-r';
import { julia } from '@plutojl/lang-julia';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';

// Collaboration
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { WebsocketProvider } from 'y-websocket';

// Internal modules
import { findCells, getCellAtCursor, countCells } from './cells.js';
import { RuntimeRegistry, createRuntimeRegistry } from './runtime.js';
import { ExecutionManager, createExecutionManager } from './execution.js';
import { MonitorCoordination, EXECUTION_STATUS, createMonitorCoordination } from './monitor-coordination.js';
import { MRPClient } from './mrp-client.js';

// Cell controls (run buttons, queue, status)
import { createCellControls, CellControlsSystem } from './cell-controls/index.js';

// Commands and keymap
import { commandRegistry } from './commands.js';
import { createKeymap, mergeKeybindings, defaultKeybindings } from './keymap.js';

// Runtime LSP (hover, completions, variables)
import {
  adaptMrmdJsSession,
  adaptMRPClient,
  createRuntimeHoverExtension,
  createRuntimeCompletionExtension,
  createVariableExplorer,
  injectRuntimeLspStyles,
} from './runtime-lsp.js';

// Built-in JavaScript runtime
import { createRuntime as createMrmdJsRuntime } from 'mrmd-js';
import {
  TerminalBuffer,
  processTerminalOutput,
  terminalToHtml,
  stripAnsi,
  hasAnsi,
  ansiStyles,
} from './terminal.js';
import {
  outputWidget,
  outputWidgetPlugin,
  outputWidgetAwarenessFacet,
  injectOutputWidgetStyles,
  outputWidgetStyles,
} from './output-widget.js';

// Awareness system
import {
  createAwareness,
  AwarenessSystem,
  AwarenessStateManager,
  createHumanState,
  createRuntimeState,
  createAIState,
  generateColor as generateAwarenessColor,
  injectAwarenessStyles,
  defaultAwarenessConfig,
  minimalAwarenessConfig,
  // UI Components
  createCollaboratorList,
  createFloatingCollaboratorList,
  createAvatarRow,
  createStatusBar,
  // Extensions
  createCursorExtensions,
  createIndicatorExtensions,
  // Tracking
  createHumanAwarenessExtensions,
  createRuntimeAwarenessTracker,
  createSimpleExecutionTracker,
} from './awareness/index.js';

// Config system (reactive configuration)
import {
  normalizeOptions,
  createReactiveConfig,
  createConfigHandler,
  serializeConfig,
  isFullySerializable,
} from './config/index.js';

// State system (observable state)
import { createStateManager } from './state/index.js';

// Dev panel
import {
  devPanelExtension,
  toggleDevPanel,
  injectDevPanelStyles,
} from './devpanel.js';

// Widget theme system
import {
  widgets,
  initTheme,
  applyTheme,
  detectTheme,
  watchTheme,
  midnightTheme,
  daylightTheme,
  githubTheme,
  registerTheme,
  createTheme,
  getTheme,
  getThemeNames,
  generateThemeCSS,
} from './widgets/index.js';
// #endregion IMPORTS

// #region VERSION
const VERSION = '0.1.0';
// #endregion VERSION

// #region PROGRESS_PARSING
/**
 * Parse progress information from streaming output.
 * Handles common formats: tqdm, rich, percentage patterns.
 *
 * @param {string} output
 * @returns {{percent: number, text: string}|null}
 */
function parseProgress(output) {
  if (!output) return null;

  // Get the last line (most recent progress update)
  const lines = output.split('\n');
  const lastLine = lines[lines.length - 1] || lines[lines.length - 2] || '';

  // tqdm format: "  5%|█████     | 5/100 [00:01<00:19, 4.89it/s]"
  const tqdmMatch = lastLine.match(/(\d+)%\|[█▏▎▍▌▋▊▉ ]+\|\s*(\d+)\/(\d+)\s*\[([^\]]+)\]/);
  if (tqdmMatch) {
    return {
      percent: parseInt(tqdmMatch[1]) / 100,
      text: `${tqdmMatch[2]}/${tqdmMatch[3]} [${tqdmMatch[4]}]`,
    };
  }

  // Simple percentage: "Progress: 45%"
  const percentMatch = lastLine.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return {
      percent: parseFloat(percentMatch[1]) / 100,
      text: `${percentMatch[1]}%`,
    };
  }

  // Fraction format: "Processing 45/100"
  const fractionMatch = lastLine.match(/(\d+)\s*\/\s*(\d+)/);
  if (fractionMatch) {
    const current = parseInt(fractionMatch[1]);
    const total = parseInt(fractionMatch[2]);
    if (total > 0) {
      return {
        percent: current / total,
        text: `${current}/${total}`,
      };
    }
  }

  return null;
}
// #endregion PROGRESS_PARSING

// #region BROWSER_RUNTIME
/**
 * Create an editor-compatible browser runtime from mrmd-js
 * Supports JavaScript, HTML, and CSS execution
 *
 * @param {Object} [options]
 * @param {string} [options.isolation='iframe'] - 'iframe' or 'main'
 * @param {boolean} [options.allowMainAccess=false] - Allow main window access from iframe
 * @returns {Object} Runtime compatible with editor.registerRuntime()
 */
function createJavaScriptRuntime(options = {}) {
  const rt = createMrmdJsRuntime(options);
  const session = rt.createSession({ language: 'javascript' });

  // Languages supported by mrmd-js
  const supportedLanguages = {
    // JavaScript variants
    'javascript': 'javascript',
    'js': 'javascript',
    'node': 'javascript',
    'ecmascript': 'javascript',
    // HTML
    'html': 'html',
    'htm': 'html',
    // CSS
    'css': 'css',
  };

  return {
    /** Check if this runtime supports the given language */
    supports(lang) {
      return lang.toLowerCase() in supportedLanguages;
    },

    /** Execute code (non-streaming) */
    async execute(code, language) {
      const lang = supportedLanguages[language.toLowerCase()] || 'javascript';
      const result = await session.execute(code, { language: lang });
      return {
        success: result.success,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        result: result.resultString,
        error: result.error,
        displayData: result.displayData,
      };
    },

    /** Execute code with streaming output */
    async executeStreaming(code, language, onChunk, onStdinRequest) {
      const lang = supportedLanguages[language.toLowerCase()] || 'javascript';
      const result = await session.execute(code, { language: lang });

      // Handle different output types
      let output = result.stdout || '';

      // For HTML/CSS, check displayData for rendered content
      if (result.displayData && result.displayData.length > 0) {
        const display = result.displayData[0];
        if (display.data) {
          // Prefer HTML representation
          if (display.data['text/html']) {
            output = display.data['text/html'];
          } else if (display.data['text/plain']) {
            output = display.data['text/plain'];
          }
        }
      } else if (result.resultString) {
        // For JS, append result
        output += (output ? '\n' : '') + result.resultString;
      }

      // Send as single chunk (mrmd-js executes synchronously in browser)
      if (output) {
        onChunk(output, output, true);
      }

      return {
        success: result.success,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        result: result.resultString,
        error: result.error,
        displayData: result.displayData,
      };
    },

    /** Reset the session (clear all variables) */
    reset() {
      session.reset();
    },

    /** Get the underlying mrmd-js runtime */
    getRuntime() {
      return rt;
    },

    /** Get the underlying session */
    getSession() {
      return session;
    },

    /** Destroy the runtime */
    destroy() {
      rt.destroy();
    },

    // =========================================================================
    // LSP Features (powered by mrmd-js session)
    // =========================================================================

    /**
     * Get hover information for a position in code.
     * Returns runtime values, not just types.
     *
     * @param {string} code - The code to analyze
     * @param {number} cursor - Cursor position within code
     * @returns {{found: boolean, name?: string, type?: string, value?: string, signature?: string}|null}
     */
    hover(code, cursor) {
      return session.hover(code, cursor);
    },

    /**
     * Get completions at a cursor position.
     * Returns actual object properties and runtime-aware suggestions.
     *
     * @param {string} code - The code to complete
     * @param {number} cursor - Cursor position
     * @returns {{matches: Array, cursorStart: number, cursorEnd: number}}
     */
    complete(code, cursor) {
      return session.complete(code, cursor);
    },

    /**
     * Get detailed inspection for a symbol.
     *
     * @param {string} code - The code to inspect
     * @param {number} cursor - Cursor position
     * @param {Object} [options] - Inspection options
     * @returns {Object|null}
     */
    inspect(code, cursor, options = {}) {
      return session.inspect(code, cursor, options);
    },

    /**
     * List all variables in the session namespace.
     *
     * @returns {Array<{name: string, type: string, value: string, expandable?: boolean}>}
     */
    listVariables() {
      return session.listVariables();
    },

    /**
     * Get detailed info about a specific variable.
     *
     * @param {string} name - Variable name
     * @param {Object} [options] - Options like path, maxChildren
     * @returns {Object}
     */
    getVariable(name, options = {}) {
      return session.getVariable(name, options);
    },

    /**
     * Check if code is a complete statement.
     *
     * @param {string} code
     * @returns {{status: 'complete'|'incomplete'|'invalid'|'unknown', indent?: string}}
     */
    isComplete(code) {
      return session.isComplete(code);
    },

    /**
     * Format code.
     *
     * @param {string} code
     * @returns {Promise<{formatted: string, changed: boolean}>}
     */
    format(code) {
      return session.format(code);
    },

    /**
     * Get the adapted LSP provider for use with runtime-lsp module.
     * @returns {import('./runtime-lsp.js').RuntimeLSPProvider}
     */
    getLSPProvider() {
      return adaptMrmdJsSession(session);
    },
  };
}
// #endregion BROWSER_RUNTIME

// #region CODE_BLOCK_LANGUAGES
const pythonSupport = python();
const jsSupport = javascript();
const jsxSupport = javascript({ jsx: true });
const tsSupport = javascript({ typescript: true });
const tsxSupport = javascript({ jsx: true, typescript: true });
const htmlSupport = html();
const cssSupport = css();
const jsonSupport = json();
const sqlSupport = sql();
const rustSupport = rust();
const cppSupport = cpp();
const javaSupport = java();
const goSupport = go();
const xmlSupport = xml();
const yamlSupport = yaml();
const rSupport = r();
const juliaSupport = julia();
const shellLang = StreamLanguage.define(shell);
const powershellLang = StreamLanguage.define(powerShell);

function codeBlockLanguage(info) {
  const lang = info.toLowerCase().trim();
  switch (lang) {
    case 'javascript': case 'js': case 'node': case 'ecmascript':
      return jsSupport.language;
    case 'jsx':
      return jsxSupport.language;
    case 'typescript': case 'ts':
      return tsSupport.language;
    case 'tsx':
      return tsxSupport.language;
    case 'python': case 'py': case 'python3':
      return pythonSupport.language;
    case 'html': case 'htm':
      return htmlSupport.language;
    case 'css':
      return cssSupport.language;
    case 'json': case 'jsonc':
      return jsonSupport.language;
    case 'xml': case 'svg':
      return xmlSupport.language;
    case 'rust': case 'rs':
      return rustSupport.language;
    case 'c': case 'cpp': case 'c++': case 'cxx': case 'h': case 'hpp':
      return cppSupport.language;
    case 'java':
      return javaSupport.language;
    case 'go': case 'golang':
      return goSupport.language;
    case 'sql': case 'mysql': case 'postgresql': case 'postgres': case 'sqlite':
      return sqlSupport.language;
    case 'yaml': case 'yml':
      return yamlSupport.language;
    case 'r': case 'rlang':
      return rSupport.language;
    case 'julia': case 'jl':
      return juliaSupport.language;
    case 'shell': case 'sh': case 'bash': case 'zsh': case 'fish':
      return shellLang;
    case 'powershell': case 'ps1': case 'pwsh':
      return powershellLang;
    default:
      return null;
  }
}

const languageSupportExtensions = [
  pythonSupport.support,
  jsSupport.support,
  tsSupport.support,
  htmlSupport.support,
  cssSupport.support,
];
// #endregion CODE_BLOCK_LANGUAGES

// #region WRITER
/**
 * Writer for streaming content into the editor.
 * Used by AI, code output, etc. Appears as if a collaborator is typing.
 */
class Writer {
  constructor(editor, startPos) {
    this._editor = editor;
    this._pos = startPos ?? editor.view.state.doc.length;
    this._active = true;
  }

  write(text) {
    if (!this._active) {
      throw new Error('Writer has ended');
    }
    this._editor.view.dispatch({
      changes: { from: this._pos, insert: text },
    });
    this._pos += text.length;
    return this;
  }

  end() {
    this._active = false;
  }

  get position() {
    return this._pos;
  }

  get active() {
    return this._active;
  }
}
// #endregion WRITER

// #region CREATE
/**
 * Create a standalone markdown editor
 *
 * @param {string|HTMLElement} target - CSS selector or element
 * @param {Object} options - Editor options
 * @returns {Editor}
 */
function create(target, options = {}) {
  const element = typeof target === 'string'
    ? document.querySelector(target)
    : target;

  if (!element) {
    throw new Error('mrmd: Target element not found');
  }

  // =========================================================================
  // CONFIG & STATE SETUP
  // Normalize options to structured config and create state manager
  // =========================================================================
  const config = normalizeOptions(options);
  const stateManager = createStateManager();

  // Make config reactive (changes trigger handlers)
  // Created early so it's available for dev panel and other components
  const reactiveConfig = createReactiveConfig(config);

  // Extract values from config (maintains backward compatibility)
  // These variables are used throughout the function
  const doc = config.document.content || '';
  const dark = config.appearance.dark;
  const placeholderText = config.appearance.placeholder;
  const readonly = config.appearance.readonly;
  const userName = config.user.name;
  const userColor = config.user.color;
  const userType = config.user.type;

  // Yjs options (not in structured config yet - passed directly)
  const {
    ydoc = new Y.Doc(),
    ytext = 'content',
    awareness: providedAwareness = null,
    // Awareness configuration (batteries-included features)
    // Set to false to disable, true for defaults, or pass config object
    awarenessUI = true,
  } = options;

  // Runtimes from normalized config
  const runtimes = {};
  for (const [name, rtConfig] of Object.entries(config.runtimes)) {
    if (rtConfig.type === 'custom' && rtConfig.instance) {
      runtimes[name] = rtConfig.instance;
    }
    // MRP and builtin types are handled separately below
  }

  // JavaScript runtime option (backward compat)
  const javascript = options.javascript !== undefined ? options.javascript : true;

  // System dark mode detection
  const getSystemDarkMode = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const isDark = dark !== null ? dark : getSystemDarkMode();

  // Create or use provided awareness
  // Awareness tracks all collaborators: humans, AI, code executors
  const awareness = providedAwareness || new Awareness(ydoc);

  // Generate a random color if not provided
  const generateColor = () => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Set local awareness state for this editor instance
  awareness.setLocalStateField('user', {
    type: 'human',
    name: userName,
    color: userColor || generateColor(),
  });

  const yText = ydoc.getText(ytext);

  // Yjs-first initialization:
  // Only seed content if Yjs is empty (we're creating a new document)
  // If Yjs already has content (we're joining), use that as source of truth
  const yjsHasContent = yText.length > 0;

  if (!yjsHasContent && doc) {
    // We're the first editor - seed Yjs with initial content
    ydoc.transact(() => {
      yText.insert(0, doc);
    });
  }

  // Always read initial content from Yjs (source of truth)
  const initialContent = yText.toString();
  const themeCompartment = new Compartment();
  const readonlyCompartment = new Compartment();
  const keymapCompartment = new Compartment();

  // Create UndoManager for undo/redo tracking
  // We create it ourselves so we can listen to stack changes
  const undoManager = new Y.UndoManager(yText);

  const markdownWithCodeBlocks = markdown({
    codeLanguages: codeBlockLanguage
  });

  const documentTheme = EditorView.theme({
    '&': { height: '100%', fontSize: '16px' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'Georgia, "Times New Roman", serif',
      lineHeight: '1.6',
    },
    '.cm-content': { padding: '0', maxWidth: 'none' },
    '.cm-gutters': { display: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
  });

  // Inject CSS styles
  injectOutputWidgetStyles();
  if (awarenessUI) {
    injectAwarenessStyles();
  }

  // Initialize widget theme system
  // Detect theme based on CodeMirror theme class and system preference
  const initialTheme = detectTheme({
    themeName: config.appearance?.widgetTheme,
    editorElement: element,
  });
  applyTheme(initialTheme);

  // Prepare awareness system (created after view exists)
  let awarenessSystem = null;
  const awarenessConfig = awarenessUI === true
    ? defaultAwarenessConfig
    : typeof awarenessUI === 'object'
      ? { ...defaultAwarenessConfig, ...awarenessUI }
      : null;

  const extensions = [
    basicSetup,
    markdownWithCodeBlocks,
    ...languageSupportExtensions,
    documentTheme,
    themeCompartment.of(isDark ? oneDark : []),
    readonlyCompartment.of(readonly ? EditorState.readOnly.of(true) : []),
    placeholderText ? placeholder(placeholderText) : [],
    // Yjs collaboration - y-codemirror.next handles sync and undo
    // Its cursor rendering is hidden via CSS (see awareness/ui/styles.js)
    // Our awareness system handles all cursor/presence rendering uniformly
    yCollab(yText, awareness, { undoManager }),
    keymap.of(yUndoManagerKeymap),
    // Cell execution keymap (Shift-Enter, Mod-Enter, etc.)
    // Initially empty, configured after api is created
    keymapCompartment.of([]),
    outputWidgetPlugin, // ANSI output rendering
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: initialContent, extensions }),
    parent: element
  });

  // Watch for theme changes (CodeMirror theme toggle, system preference)
  let currentWidgetTheme = initialTheme;
  const unwatchTheme = watchTheme({
    editorElement: view.dom,
    currentTheme: currentWidgetTheme,
    onThemeChange: (newTheme) => {
      currentWidgetTheme = newTheme;
      applyTheme(newTheme);
    },
  });

  // Initialize awareness system after view exists
  if (awarenessConfig) {
    awarenessSystem = createAwareness({
      yjsAwareness: awareness,
      view,
      getContent: () => view.state.doc.toString(),
      yText,
      userName,
      userColor,
      userType,
      config: awarenessConfig,
    });

    // Add awareness extensions to the view
    const awarenessExtensions = awarenessSystem.getExtensions();
    // Also configure output widget to use awareness (for collaborative focus sync)
    awarenessExtensions.push(outputWidgetAwarenessFacet.of(awarenessSystem));

    if (awarenessExtensions.length > 0) {
      view.dispatch({
        effects: StateEffect.appendConfig.of(awarenessExtensions)
      });
    }
  }

  // Add dev panel if enabled
  if (config.devPanel?.enabled) {
    injectDevPanelStyles();
    view.dispatch({
      effects: StateEffect.appendConfig.of([
        devPanelExtension({
          config: reactiveConfig,
          stateManager,
          startOpen: config.devPanel.startOpen ?? false
        })
      ])
    });
  }

  // Event handlers
  const changeHandlers = [];
  const saveHandlers = [];
  const cellRunHandlers = [];
  const cellOutputHandlers = [];
  const cellCompleteHandlers = [];
  const cellErrorHandlers = [];

  // Keyboard handler for save
  element.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      const content = view.state.doc.toString();
      saveHandlers.forEach(fn => fn(content));
    }
  });

  // Create runtime registry
  const registry = createRuntimeRegistry();

  // Register provided runtimes
  for (const [name, runtime] of Object.entries(runtimes)) {
    registry.register(name, runtime);
  }

  // Built-in JavaScript runtime (mrmd-js)
  // - true: use built-in mrmd-js runtime (default)
  // - false: disable JavaScript execution
  // - object: use custom runtime (must implement supports/execute/executeStreaming)
  let jsRuntime = null;
  if (javascript === true) {
    jsRuntime = createJavaScriptRuntime();
    registry.register('javascript', jsRuntime);
  } else if (javascript && typeof javascript === 'object') {
    // Custom runtime provided
    registry.register('javascript', javascript);
  }
  // javascript === false means no JS runtime

  // =========================================================================
  // RUNTIME LSP PROVIDERS
  // Build map of LSP providers for hover, completions, variables
  // Works with both mrmd-js (browser) and MRP servers (mrmd-python)
  // =========================================================================
  const runtimeLspProviders = new Map();

  // Add JS runtime LSP provider if available
  if (jsRuntime) {
    const jsProvider = jsRuntime.getLSPProvider();
    runtimeLspProviders.set('javascript', jsProvider);
  }

  // Check config for MRP runtimes and add their LSP providers
  for (const [name, rtConfig] of Object.entries(config.runtimes)) {
    if (rtConfig.type === 'mrp' && rtConfig.url) {
      const client = new MRPClient(rtConfig.url);
      const mrpProvider = adaptMRPClient(client, rtConfig.languages);
      runtimeLspProviders.set(name, mrpProvider);
      // Also register the client for execution
      registry.register(name, client);
    }
  }

  // Inject runtime LSP styles
  injectRuntimeLspStyles();

  // Create variable explorer for UI components
  const variableExplorer = createVariableExplorer({
    providers: runtimeLspProviders,
    activeLanguage: 'javascript',
  });

  // Track whether LSP extensions have been added (needed for dynamic connectRuntime)
  let lspExtensionsAdded = false;

  // Helper to add LSP extensions (called at init or on first connectRuntime)
  function addLspExtensions() {
    if (lspExtensionsAdded) return;
    lspExtensionsAdded = true;

    const runtimeLspExtensions = [];

    // Create hover extension with awareness integration
    const hoverExt = createRuntimeHoverExtension({
      providers: runtimeLspProviders,
      getContent: () => view.state.doc.toString(),
      stateManager: awarenessSystem?.getStateManager(),
      yText,
    });
    runtimeLspExtensions.push(hoverExt);

    // Create completion extension with awareness integration
    const completionExt = createRuntimeCompletionExtension({
      providers: runtimeLspProviders,
      getContent: () => view.state.doc.toString(),
      stateManager: awarenessSystem?.getStateManager(),
      yText,
      config: {
        activateOnTyping: config.completion?.activateOnTyping ?? true,
        maxRenderedOptions: config.completion?.maxRenderedOptions ?? 50,
      },
    });
    runtimeLspExtensions.push(completionExt);

    // Add extensions to the view
    view.dispatch({
      effects: StateEffect.appendConfig.of(runtimeLspExtensions),
    });
  }

  // Add runtime LSP extensions at init if we have providers
  if (runtimeLspProviders.size > 0) {
    addLspExtensions();
  }

  // Create editor API object first (needed by ExecutionManager)
  const api = {
    // =========================================================================
    // CONFIG & STATE (new architecture)
    // =========================================================================

    /**
     * Reactive configuration object.
     * Changes to config properties trigger editor reconfiguration.
     *
     * @example
     * editor.config.appearance.dark = true;  // Switches to dark mode
     * editor.config.user.name = 'Alice';     // Updates collaborator name
     *
     * @type {import('./config/schema.js').EditorConfig}
     */
    config: reactiveConfig,

    /**
     * Observable state (read-only).
     * Reflects the current state of the editor and its subsystems.
     *
     * @example
     * console.log(editor.state.document.dirty);   // false
     * console.log(editor.state.connection.status); // 'disconnected'
     * console.log(editor.state.history.length);    // 5
     *
     * @type {import('./state/schema.js').EditorState}
     */
    state: stateManager.getReadOnlyProxy(),

    /**
     * Internal state manager (for advanced use).
     * Use this to subscribe to specific state paths.
     * @private
     */
    _stateManager: stateManager,

    // Core references
    view,
    ydoc,
    yText,
    awareness,

    // Awareness system (batteries-included UI)
    awarenessSystem,

    // Runtime
    registry,
    execution: null, // Set below

    // Runtime LSP (hover, completions, variables)
    runtimeLspProviders,
    variableExplorer,

    // Built-in JS runtime (for debugging)
    jsRuntime,

    // ===========================================================================
    // Content
    // ===========================================================================

    getContent() {
      return view.state.doc.toString();
    },

    /**
     * Get the Yjs Text instance for position tracking.
     * Use with Y.createRelativePositionFromTypeIndex() for positions that survive edits.
     * @returns {import('yjs').Text}
     */
    getYText() {
      return yText;
    },

    setContent(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text }
      });
    },

    insert(pos, text) {
      view.dispatch({
        changes: { from: pos, insert: text }
      });
    },

    insertAtCursor(text) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: text }
      });
    },

    replace(from, to, text) {
      view.dispatch({
        changes: { from, to, insert: text }
      });
    },

    // ===========================================================================
    // Streaming Writer
    // ===========================================================================

    writer(pos) {
      return new Writer(this, pos);
    },

    // ===========================================================================
    // State
    // ===========================================================================

    setReadonly(value) {
      view.dispatch({
        effects: readonlyCompartment.reconfigure(
          value ? EditorState.readOnly.of(true) : []
        )
      });
    },

    setDark(value) {
      view.dispatch({
        effects: themeCompartment.reconfigure(value ? oneDark : [])
      });
    },

    focus() {
      view.focus();
    },

    blur() {
      view.contentDOM.blur();
    },

    stats() {
      const doc = view.state.doc;
      const text = doc.toString();
      return {
        lines: doc.lines,
        chars: doc.length,
        words: text.split(/\s+/).filter(w => w.length > 0).length
      };
    },

    // ===========================================================================
    // Undo / Redo
    // ===========================================================================

    /**
     * Undo the last change
     * @returns {boolean} Whether undo was performed
     */
    undo() {
      if (undoManager.undoStack.length > 0) {
        undoManager.undo();
        return true;
      }
      return false;
    },

    /**
     * Redo the last undone change
     * @returns {boolean} Whether redo was performed
     */
    redo() {
      if (undoManager.redoStack.length > 0) {
        undoManager.redo();
        return true;
      }
      return false;
    },

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
      return undoManager.undoStack.length > 0;
    },

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
      return undoManager.redoStack.length > 0;
    },

    /**
     * Get undo stack depth
     * @returns {number}
     */
    undoDepth() {
      return undoManager.undoStack.length;
    },

    /**
     * Get redo stack depth
     * @returns {number}
     */
    redoDepth() {
      return undoManager.redoStack.length;
    },

    /**
     * Clear undo/redo history
     */
    clearUndoHistory() {
      undoManager.clear();
    },

    // ===========================================================================
    // Awareness / Collaboration
    // ===========================================================================

    /**
     * Announce a collaborator (for runtimes, LLMs, etc.)
     * Changes the local user's type and updates their state accordingly.
     * @param {'human'|'ai'|'runtime'|'sync'} type - Collaborator type
     * @param {string} name - Display name
     * @param {string} [color] - Optional color
     */
    announceCollaborator(type, name, color) {
      // Use the awareness system's state manager if available for proper state structure
      if (awarenessSystem) {
        const stateManager = awarenessSystem.getStateManager();
        const current = stateManager.getLocalState() || {};
        // Create proper state structure based on type
        let newState;
        switch (type) {
          case 'ai':
            newState = createAIState({ name, color: color || current.color });
            break;
          case 'runtime':
            newState = createRuntimeState({ language: name, name, color: color || current.color });
            break;
          default:
            newState = createHumanState({ name, color: color || current.color });
        }
        // Preserve current status and other fields
        stateManager.setLocalState({
          ...newState,
          status: current.status || 'idle',
        });
      } else {
        // Fallback to direct awareness update
        const current = awareness.getLocalState()?.user || {};
        awareness.setLocalStateField('user', {
          ...current,
          type,
          name,
          color: color || current.color || generateColor(),
          lastActivity: Date.now(),
        });
      }
    },

    /**
     * Update collaborator status
     * @param {'idle'|'typing'|'streaming'|'executing'} status
     */
    setCollaboratorStatus(status) {
      // Use the awareness system's state manager if available
      if (awarenessSystem) {
        awarenessSystem.setStatus(status);
      } else {
        const current = awareness.getLocalState()?.user || {};
        awareness.setLocalStateField('user', { ...current, status, lastActivity: Date.now() });
      }
    },

    /**
     * Get all connected collaborators
     * @returns {Array<{clientId: number, user: object}>}
     */
    getCollaborators() {
      const states = [];
      awareness.getStates().forEach((state, clientId) => {
        if (state.user) {
          states.push({ clientId, user: state.user });
        }
      });
      return states;
    },

    /**
     * Listen for collaborator changes
     * @param {function} callback - Called with (collaborators, changeInfo)
     *   changeInfo: { added: number[], updated: number[], removed: number[], isRemote: boolean }
     * @returns {function} Unsubscribe function
     */
    onCollaboratorsChange(callback) {
      const localClientId = awareness.clientID;
      const handler = ({ added, updated, removed }) => {
        const changedClients = [...added, ...updated, ...removed];
        const isRemote = changedClients.some(id => id !== localClientId);
        callback(this.getCollaborators(), { added, updated, removed, isRemote });
      };
      awareness.on('change', handler);
      return () => awareness.off('change', handler);
    },

    // ===========================================================================
    // Awareness UI (Batteries-Included)
    // ===========================================================================

    /**
     * Create a collaborator list UI component
     * @param {HTMLElement} container
     * @param {Object} [options]
     * @returns {{update: function, destroy: function, element: HTMLElement}|null}
     */
    createCollaboratorList(container, options = {}) {
      if (!awarenessSystem) return null;
      return awarenessSystem.createCollaboratorList(container, options);
    },

    /**
     * Create a floating collaborator list
     * @param {Object} [options]
     * @returns {{show: function, hide: function, toggle: function, destroy: function}|null}
     */
    createFloatingCollaboratorList(options = {}) {
      if (!awarenessSystem) return null;
      return awarenessSystem.createFloatingList(options);
    },

    /**
     * Create a compact avatar row showing collaborators
     * @param {HTMLElement} container
     * @param {Object} [options]
     * @returns {{update: function, destroy: function, element: HTMLElement}|null}
     */
    createAvatarRow(container, options = {}) {
      if (!awarenessSystem) return null;
      return awarenessSystem.createAvatarRow(container, options);
    },

    /**
     * Create a status bar showing global awareness info
     * @param {HTMLElement} [container]
     * @returns {{element: HTMLElement, update: function, destroy: function}|null}
     */
    createStatusBar(container) {
      if (!awarenessSystem) return null;
      return awarenessSystem.createStatusBar(container);
    },

    /**
     * Set hover state for awareness broadcast
     * @param {Object|null} hover - {symbol, type, info, position}
     */
    setHover(hover) {
      if (awarenessSystem) {
        awarenessSystem.setHover(hover);
      }
    },

    /**
     * Set autocomplete state for awareness broadcast
     * @param {Object|null} autocomplete - {query, items, position}
     */
    setAutocomplete(autocomplete) {
      if (awarenessSystem) {
        awarenessSystem.setAutocomplete(autocomplete);
      }
    },

    /**
     * Set execution state (for runtimes)
     * @param {Object|null} execution - {cellIndex, startTime, progress, progressText}
     */
    setExecution(execution) {
      if (awarenessSystem) {
        awarenessSystem.setExecution(execution);
      }
    },

    /**
     * Set generation state (for AI)
     * @param {Object|null} generation - {targetCell, tokensGenerated, model}
     */
    setGeneration(generation) {
      if (awarenessSystem) {
        awarenessSystem.setGeneration(generation);
      }
    },

    /**
     * Wrap a hover provider to broadcast hover state
     * @param {function} hoverProvider
     * @returns {function}
     */
    wrapHoverProvider(hoverProvider) {
      if (!awarenessSystem) return hoverProvider;
      return awarenessSystem.wrapHoverProvider(hoverProvider);
    },

    /**
     * Wrap a completion source to broadcast autocomplete state
     * @param {function} source
     * @returns {function}
     */
    wrapCompletionSource(source) {
      if (!awarenessSystem) return source;
      return awarenessSystem.wrapCompletionSource(source);
    },

    /**
     * Create an execution tracker that auto-updates awareness
     * @returns {{start: function, progress: function, end: function}|null}
     */
    createExecutionTracker() {
      if (!awarenessSystem) return null;
      return awarenessSystem.createExecutionTracker();
    },

    // ===========================================================================
    // Code Cells
    // ===========================================================================

    /**
     * Get cells in the document
     */
    getCells() {
      return findCells(this.getContent());
    },

    /**
     * Get cell at cursor
     */
    getCurrentCell() {
      const pos = view.state.selection.main.head;
      return getCellAtCursor(this.getContent(), pos);
    },

    /**
     * Count cells
     */
    cellCount() {
      return countCells(this.getContent());
    },

    /**
     * Run a cell by index
     */
    runCell(index) {
      return this.execution.runCell(index);
    },

    /**
     * Run the cell at cursor
     */
    runCurrentCell() {
      return this.execution.runCurrentCell();
    },

    /**
     * Run all cells in order
     */
    runAll() {
      return this.execution.runAll();
    },

    /**
     * Run all cells up to and including current
     */
    runAllAbove() {
      return this.execution.runAllAbove();
    },

    /**
     * Clear output for a cell
     */
    clearOutput(index) {
      return this.execution.clearOutput(index);
    },

    /**
     * Clear all outputs
     */
    clearOutputs() {
      return this.execution.clearOutputs();
    },

    /**
     * Cancel running execution
     */
    cancelExecution(index) {
      if (index !== undefined) {
        return this.execution.cancel(index);
      }
      return this.execution.cancelAll();
    },

    /**
     * Register a runtime
     */
    registerRuntime(name, runtime) {
      registry.register(name, runtime);
    },

    /**
     * Check if a language is supported
     */
    supportsLanguage(language) {
      return registry.supports(language);
    },

    // ===========================================================================
    // Runtime LSP (hover, completions, variables)
    // ===========================================================================

    /**
     * Register an LSP provider for a language.
     * Use this to add runtime LSP features for additional languages.
     *
     * @param {string} language - Language name (e.g., 'python')
     * @param {import('./runtime-lsp.js').RuntimeLSPProvider} provider - The LSP provider
     */
    registerLSPProvider(language, provider) {
      runtimeLspProviders.set(language, provider);
    },

    /**
     * Connect to an MRP runtime server with full features (execution + LSP).
     * This is the recommended one-liner for adding language runtimes.
     *
     * @param {string} language - Language name (e.g., 'python', 'julia', 'r')
     * @param {string} url - MRP server URL (e.g., 'http://localhost:8000/mrp/v1')
     * @param {Object} [options] - Optional configuration
     * @param {string[]} [options.languages] - Language aliases (defaults to [language])
     * @returns {MRPClient} The connected client (for advanced use)
     *
     * @example
     * // Connect Python with all features (hover, completions, execution)
     * editor.connectRuntime('python', 'http://localhost:8000/mrp/v1');
     *
     * // With language aliases
     * editor.connectRuntime('python', 'http://localhost:8000/mrp/v1', {
     *   languages: ['python', 'py', 'python3']
     * });
     */
    connectRuntime(language, url, options = {}) {
      // Create MRP client
      const client = new MRPClient(url);

      // Register for execution
      registry.register(language, client);

      // Create and register LSP provider
      const languages = options.languages || [language.toLowerCase()];
      const provider = adaptMRPClient(client, languages);
      runtimeLspProviders.set(language, provider);

      // Ensure LSP extensions are added (if this is the first provider)
      addLspExtensions();

      return client;
    },

    // ===========================================================================
    // Commands and Keymap (initialized after api is created)
    // ===========================================================================

    /**
     * Available commands that can be bound to keyboard shortcuts.
     * Initialized after api creation - see below.
     */
    commands: null, // Placeholder, set after api is created

    /**
     * Update keyboard shortcuts at runtime.
     * Merges with existing bindings by default.
     *
     * @param {Object} bindings - Key-to-command mapping
     * @param {Object} [options]
     * @param {boolean} [options.replace=false] - Replace all bindings instead of merging
     *
     * @example
     * // Add/override specific bindings
     * editor.setKeymap({
     *   'F5': 'runAllCells',
     *   'Shift-Enter': 'runCell',  // Override default
     * });
     *
     * // Disable a default binding
     * editor.setKeymap({ 'Mod-Shift-Enter': false });
     *
     * // Replace all bindings
     * editor.setKeymap({ 'F5': 'runCell' }, { replace: true });
     */
    setKeymap: null, // Placeholder, set after api is created

    /**
     * Get the current keymap configuration.
     *
     * @returns {Object} Current key-to-command mapping
     */
    getKeymap: null, // Placeholder, set after api is created

    /**
     * Get hover information at cursor position.
     * Returns runtime values for the symbol under cursor.
     *
     * @param {number} [pos] - Position (defaults to cursor)
     * @returns {Promise<{found: boolean, name?: string, type?: string, value?: string}|null>}
     */
    async getHoverInfo(pos) {
      const position = pos ?? view.state.selection.main.head;
      const content = this.getContent();
      const cell = getCellAtCursor(content, position);

      if (!cell) return null;

      const provider = runtimeLspProviders.get(cell.language) ||
        Array.from(runtimeLspProviders.values()).find(p =>
          p.languages.includes(cell.language.toLowerCase())
        );

      if (!provider) return null;

      const offset = position - cell.codeStart;
      return provider.hover(cell.code, offset, cell.language);
    },

    /**
     * Get completions at cursor position.
     *
     * @param {number} [pos] - Position (defaults to cursor)
     * @returns {Promise<{matches: Array, cursorStart: number, cursorEnd: number}|null>}
     */
    async getCompletions(pos) {
      const position = pos ?? view.state.selection.main.head;
      const content = this.getContent();
      const cell = getCellAtCursor(content, position);

      if (!cell) return null;

      const provider = runtimeLspProviders.get(cell.language) ||
        Array.from(runtimeLspProviders.values()).find(p =>
          p.languages.includes(cell.language.toLowerCase())
        );

      if (!provider) return null;

      const offset = position - cell.codeStart;
      return provider.complete(cell.code, offset, cell.language);
    },

    /**
     * List all variables in a runtime session.
     *
     * @param {string} [language='javascript'] - Language/runtime to query
     * @returns {Promise<Array<{name: string, type: string, value: string}>>}
     */
    async listVariables(language = 'javascript') {
      const provider = runtimeLspProviders.get(language) ||
        Array.from(runtimeLspProviders.values()).find(p =>
          p.languages.includes(language.toLowerCase())
        );

      if (!provider) return [];
      return provider.listVariables();
    },

    /**
     * Get detailed info about a variable.
     *
     * @param {string} name - Variable name
     * @param {string} [language='javascript'] - Language/runtime to query
     * @param {Object} [options] - Options like path, maxChildren
     * @returns {Promise<Object>}
     */
    async getVariableDetail(name, language = 'javascript', options = {}) {
      const provider = runtimeLspProviders.get(language) ||
        Array.from(runtimeLspProviders.values()).find(p =>
          p.languages.includes(language.toLowerCase())
        );

      if (!provider) return { name, type: 'unknown', value: '?', expandable: false };
      return provider.getVariable(name, options);
    },

    /**
     * Format code using the runtime's formatter.
     *
     * @param {string} code - Code to format
     * @param {string} [language='javascript'] - Language/runtime to use
     * @returns {Promise<{formatted: string, changed: boolean}>}
     */
    async formatCode(code, language = 'javascript') {
      const provider = runtimeLspProviders.get(language) ||
        Array.from(runtimeLspProviders.values()).find(p =>
          p.languages.includes(language.toLowerCase())
        );

      if (!provider) return { formatted: code, changed: false };
      return provider.format(code);
    },

    /**
     * Refresh variables from all MRP runtimes
     * Fetches current variable state and updates state.variables
     *
     * @param {string} [sessionId] - Specific session to refresh (optional)
     * @returns {Promise<void>}
     */
    async refreshVariables(sessionId) {
      for (const [name, runtime] of registry.runtimes) {
        // Check if runtime is an MRP client (has getVariables method)
        if (typeof runtime.getVariables === 'function') {
          try {
            const result = await runtime.getVariables(sessionId);
            if (result && result.variables) {
              const session = sessionId || 'default';
              const variables = {};
              for (const v of result.variables) {
                variables[v.name] = {
                  name: v.name,
                  type: v.type || 'unknown',
                  preview: v.repr || String(v.value),
                  value: v.value,
                  size: v.size,
                  expandable: v.expandable || false,
                };
              }
              stateManager.setVariables(session, variables);

              // Also update session info
              stateManager.setSession(session, {
                runtime: name,
                language: runtime.language || 'unknown',
                executionCount: result.executionCount || 0,
                lastActivity: Date.now(),
              });
            }
          } catch (err) {
            console.warn(`[refreshVariables] Failed for runtime ${name}:`, err);
          }
        }
      }
    },

    /**
     * Clear variables for a session
     * @param {string} [sessionId] - Session to clear (default: all)
     */
    clearVariables(sessionId) {
      if (sessionId) {
        stateManager.clearVariables(sessionId);
      } else {
        // Clear all sessions
        const state = stateManager.getRawState();
        for (const sid of Object.keys(state.variables)) {
          stateManager.clearVariables(sid);
        }
      }
    },

    // ===========================================================================
    // Events
    // ===========================================================================

    onChange(callback) {
      changeHandlers.push(callback);
      return () => {
        const idx = changeHandlers.indexOf(callback);
        if (idx >= 0) changeHandlers.splice(idx, 1);
      };
    },

    onSave(callback) {
      saveHandlers.push(callback);
      return () => {
        const idx = saveHandlers.indexOf(callback);
        if (idx >= 0) saveHandlers.splice(idx, 1);
      };
    },

    onCellRun(callback) {
      return this.execution.on('cellRun', callback);
    },

    onCellOutput(callback) {
      return this.execution.on('cellOutput', callback);
    },

    onCellComplete(callback) {
      return this.execution.on('cellComplete', callback);
    },

    onCellError(callback) {
      return this.execution.on('cellError', callback);
    },

    /**
     * Subscribe to config changes
     * @param {(event: import('./config/reactive.js').ConfigChangeEvent) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    onConfigChange(callback) {
      return reactiveConfig._subscribe(callback);
    },

    /**
     * Subscribe to state changes
     * @param {string | ((event: import('./state/manager.js').StateChangeEvent) => void)} pathOrCallback
     * @param {((value: any) => void)} [callback] - If pathOrCallback is a path string
     * @returns {() => void} Unsubscribe function
     *
     * @example
     * // Subscribe to all state changes
     * editor.onStateChange((event) => console.log(event.path, event.value));
     *
     * // Subscribe to specific path
     * editor.onStateChange('connection.status', (status) => console.log(status));
     */
    onStateChange(pathOrCallback, callback) {
      if (typeof pathOrCallback === 'function') {
        return stateManager.subscribe(pathOrCallback);
      }
      return stateManager.onPath(pathOrCallback, callback);
    },

    // ===========================================================================
    // Cleanup
    // ===========================================================================

    destroy() {
      this.execution.cancelAll();
      if (cellControls) {
        cellControls.destroy();
      }
      if (awarenessSystem) {
        awarenessSystem.destroy();
      }
      if (jsRuntime && jsRuntime.destroy) {
        jsRuntime.destroy();
      }
      // Clean up theme watcher
      unwatchTheme();
      // Clean up undo manager
      undoManager.destroy();
      view.destroy();
    },

    // ===========================================================================
    // Built-in Runtimes
    // ===========================================================================

    /**
     * Get the built-in JavaScript runtime (mrmd-js)
     * @returns {Object|null} The JS runtime or null if disabled
     */
    get jsRuntime() {
      return jsRuntime;
    },

    /**
     * Debug helper - returns current config and state for console debugging
     * @returns {{config: Object, state: Object, serializedConfig: Object}}
     */
    get _debug() {
      return {
        config: config,
        state: stateManager.getRawState(),
        serializedConfig: serializeConfig(config),
        isFullySerializable: isFullySerializable(config),
      };
    },

    /**
     * Toggle the dev panel visibility
     */
    toggleDevPanel() {
      toggleDevPanel(view);
    },
  };

  // Create execution manager
  api.execution = createExecutionManager(api, registry);

  // Configure keymap now that api is ready
  // Merge user keybindings with defaults
  const userKeybindings = options.keymap || {};
  let currentKeybindings = mergeKeybindings(userKeybindings);
  view.dispatch({
    effects: keymapCompartment.reconfigure(createKeymap(api, currentKeybindings))
  });

  // Initialize commands object (now that api is available)
  api.commands = Object.fromEntries(
    Object.entries(commandRegistry).map(([name, factory]) => [
      name,
      () => factory(api)(view)
    ])
  );

  // Initialize setKeymap method
  api.setKeymap = function(bindings, options = {}) {
    const newBindings = options.replace
      ? bindings
      : mergeKeybindings(bindings, currentKeybindings);

    // Update stored bindings for future merges
    currentKeybindings = newBindings;

    view.dispatch({
      effects: keymapCompartment.reconfigure(createKeymap(api, newBindings))
    });
  };

  // Initialize getKeymap method
  api.getKeymap = function() {
    return { ...currentKeybindings };
  };

  // Wire execution events to awareness (so execution badges work automatically)
  // This makes the runtime appear as a collaborator executing code
  if (awarenessSystem) {
    api.execution.on('cellRun', (index, cell) => {
      awarenessSystem.setExecution({
        cellIndex: index,
        startTime: Date.now(),
        language: cell.language,
      });
    });

    api.execution.on('cellOutput', (index, chunk, accumulated) => {
      // Try to parse progress from output (tqdm, etc.)
      const progress = parseProgress(accumulated);
      if (progress) {
        const current = awarenessSystem.getStateManager().getLocalState();
        if (current?.execution) {
          awarenessSystem.setExecution({
            ...current.execution,
            progress: progress.percent,
            progressText: progress.text,
          });
        }
      }
    });

    api.execution.on('cellComplete', () => {
      awarenessSystem.setExecution(null);
    });

    api.execution.on('cellError', () => {
      awarenessSystem.setExecution(null);
    });
  }

  // =========================================================================
  // WIRE STATE UPDATES
  // Execution events update state.history and state.execution
  // =========================================================================

  api.execution.on('cellRun', (index, cell) => {
    stateManager.setExecution({
      cellIndex: index,
      language: cell.language,
      startTime: Date.now(),
    });
  });

  api.execution.on('cellOutput', (index, chunk, accumulated) => {
    // Parse progress and update execution state
    const progress = parseProgress(accumulated);
    if (progress) {
      stateManager.updateExecutionProgress(progress.percent, progress.text);
    }
  });

  api.execution.on('cellComplete', (index, result) => {
    const execution = stateManager.getRawState().execution;
    const startTime = execution?.startTime || Date.now();

    // Add to history
    stateManager.addExecution({
      cellIndex: index,
      language: execution?.language || 'unknown',
      codePreview: result?.code?.slice(0, 100) || '',
      success: result?.success !== false,
      error: result?.error?.message,
      startTime,
      duration: Date.now() - startTime,
    });

    stateManager.setExecution(null);

    // Auto-refresh variables if enabled
    if (config.execution?.autoRefreshVariables) {
      api.refreshVariables().catch(err => {
        console.warn('[autoRefreshVariables] Failed:', err);
      });
    }
  });

  api.execution.on('cellError', (index, error) => {
    const execution = stateManager.getRawState().execution;
    const startTime = execution?.startTime || Date.now();

    // Add failed execution to history
    stateManager.addExecution({
      cellIndex: index,
      language: execution?.language || 'unknown',
      codePreview: '',
      success: false,
      error: error?.message || String(error),
      startTime,
      duration: Date.now() - startTime,
    });

    stateManager.setExecution(null);
  });

  // =========================================================================
  // CELL CONTROLS
  // Run buttons, stop buttons, queue status for code cells
  // =========================================================================

  let cellControls = null;

  if (config.cellControls?.enabled !== false) {
    cellControls = createCellControls({
      editor: api,
      executionManager: api.execution,
      stateManager,
      config: config.cellControls,
      awareness: awarenessSystem?.yjsAwareness || awareness,
    });

    // Add cell controls extensions to the view
    const cellControlsExtensions = cellControls.getExtensions();
    if (cellControlsExtensions.length > 0) {
      view.dispatch({
        effects: StateEffect.appendConfig.of(cellControlsExtensions)
      });
    }

    // Expose on API
    api.cellControls = cellControls;
  }

  // =========================================================================
  // WIRE CONFIG CHANGE HANDLERS
  // Config changes trigger editor reconfiguration
  // =========================================================================

  const configHandler = createConfigHandler({
    view,
    themeCompartment,
    readonlyCompartment,
    awareness,
    registry,
    awarenessSystem,
    cellControls,
    createRuntime: (rtConfig) => {
      // Create runtime from config
      if (rtConfig.type === 'builtin') {
        return createJavaScriptRuntime();
      } else if (rtConfig.type === 'custom' && rtConfig.instance) {
        return rtConfig.instance;
      } else if (rtConfig.type === 'mrp' && rtConfig.url) {
        return new MRPClient(rtConfig.url);
      }
      return null;
    },
  });

  reactiveConfig._subscribe(configHandler);

  // =========================================================================
  // UPDATE DOCUMENT STATE
  // Document changes update state.document
  // =========================================================================

  const updateDocumentState = () => {
    const doc = view.state.doc;
    const text = doc.toString();
    const cells = findCells(text);

    stateManager.updateDocument({
      size: doc.length,
      lines: doc.lines,
      words: text.split(/\s+/).filter(w => w.length > 0).length,
      cells: cells.length,
    });
  };

  // Initialize document state
  updateDocumentState();

  // Wire up change handlers
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const content = update.state.doc.toString();
      changeHandlers.forEach(fn => fn(content));

      // Update document state
      stateManager.setDirty(true);
      updateDocumentState();
    }
  });

  // Add update listener extension
  view.dispatch({
    effects: StateEffect.appendConfig.of(updateListener)
  });

  // =========================================================================
  // INITIALIZE RUNTIME STATE
  // Register runtimes in state
  // =========================================================================

  for (const [name, runtime] of registry.runtimes) {
    const languages = [];
    // Discover languages
    const testLangs = ['javascript', 'python', 'julia', 'r', 'bash'];
    for (const lang of testLangs) {
      if (runtime.supports?.(lang)) {
        languages.push(lang);
      }
    }
    stateManager.setRuntime(name, { status: 'ready', languages });
  }

  // =========================================================================
  // WIRE UNDO MANAGER TO STATE
  // Track undo/redo availability in state.document
  // =========================================================================

  const updateUndoState = () => {
    stateManager.updateUndoState({
      canUndo: undoManager.undoStack.length > 0,
      canRedo: undoManager.redoStack.length > 0,
      undoDepth: undoManager.undoStack.length,
      redoDepth: undoManager.redoStack.length,
    });
  };

  // Initialize undo state
  updateUndoState();

  // Listen for stack changes
  undoManager.on('stack-item-added', updateUndoState);
  undoManager.on('stack-item-popped', updateUndoState);
  undoManager.on('stack-cleared', updateUndoState);

  // =========================================================================
  // WIRE COLLABORATORS TO STATE
  // Track connected collaborators in state.collaborators
  // =========================================================================

  const updateCollaboratorsState = () => {
    const collaborators = [];
    awareness.getStates().forEach((state, clientId) => {
      if (state.user || state.name) {
        // Handle both state structures (user object or flat)
        const user = state.user || state;
        collaborators.push({
          clientId,
          name: user.name || 'Anonymous',
          color: user.color || '#888888',
          type: user.type || 'human',
          status: user.status || state.status || 'idle',
          cursor: state.cursor,
        });
      }
    });
    stateManager.setCollaborators(collaborators);
  };

  // Initialize collaborators state
  updateCollaboratorsState();

  // Listen for awareness changes
  awareness.on('change', updateCollaboratorsState);

  return api;
}
// #endregion CREATE

// #region DRIVE
/**
 * Connect to a sync server
 */
function drive(urlOrOptions, options = {}) {
  let url, auth, runtimes;

  if (typeof urlOrOptions === 'string') {
    url = urlOrOptions;
    auth = options.auth;
    runtimes = options.runtimes || {};
  } else {
    url = urlOrOptions.url;
    auth = urlOrOptions.auth;
    runtimes = urlOrOptions.runtimes || {};
  }

  if (url && !url.includes('://')) {
    url = 'wss://' + url;
  }

  const statusHandlers = [];
  let status = 'disconnected';

  function setStatus(newStatus) {
    status = newStatus;
    statusHandlers.forEach(fn => fn(status));
  }

  return {
    url,

    async open(path, target, editorOptions = {}) {
      const ydoc = new Y.Doc();
      const serverUrl = auth ? `${url}?token=${auth}` : url;
      const provider = new WebsocketProvider(serverUrl, path, ydoc);

      provider.on('status', ({ status: s }) => {
        setStatus(s);
      });

      // Wait for initial sync before creating editor
      // This prevents duplicate content when multiple tabs open
      await new Promise((resolve) => {
        if (provider.synced) {
          resolve();
        } else {
          provider.once('synced', resolve);
          // Timeout fallback in case sync fails
          setTimeout(resolve, 3000);
        }
      });

      // Only pass doc option if the server document is empty
      const yText = ydoc.getText('content');
      const serverHasContent = yText.length > 0;
      const finalOptions = {
        ...editorOptions,
        ydoc,
        ytext: 'content',
        awareness: provider.awareness,
        runtimes: { ...runtimes, ...editorOptions.runtimes },
      };

      // Don't seed content if server already has it
      if (serverHasContent) {
        delete finalOptions.doc;
      }

      const editor = create(target, finalOptions);

      editor.provider = provider;
      editor.path = path;

      // Wire connection status to state
      const stateManager = editor._stateManager;
      if (stateManager) {
        // Set document path
        stateManager.updateDocument({ path });

        // Map provider status to our status enum
        const mapStatus = (s) => {
          if (s === 'connected') return 'connected';
          if (s === 'connecting') return 'connecting';
          if (s === 'disconnected') return 'disconnected';
          return 'error';
        };

        // Set initial connection status
        stateManager.setConnectionStatus(
          provider.wsconnected ? 'connected' : 'connecting'
        );

        // Listen for status changes
        provider.on('status', ({ status: s }) => {
          stateManager.setConnectionStatus(mapStatus(s));
        });

        // Track connection errors
        provider.on('connection-error', (event) => {
          stateManager.setConnectionStatus('error', {
            error: event.message || 'Connection error'
          });
        });

        // Track reconnection attempts
        let reconnectAttempts = 0;
        provider.on('status', ({ status: s }) => {
          if (s === 'connecting') {
            reconnectAttempts++;
            stateManager.setConnectionStatus('connecting', { reconnectAttempts });
          } else if (s === 'connected') {
            reconnectAttempts = 0;
            stateManager.setConnectionStatus('connected', { reconnectAttempts: 0 });
          }
        });
      }

      editor.disconnect = () => provider.disconnect();
      editor.reconnect = () => provider.connect();

      return editor;
    },

    async read(path) {
      throw new Error('drive.read() not yet implemented');
    },

    async write(path, content) {
      throw new Error('drive.write() not yet implemented');
    },

    async list(path) {
      throw new Error('drive.list() not yet implemented');
    },

    onStatus(callback) {
      statusHandlers.push(callback);
      return () => {
        const idx = statusHandlers.indexOf(callback);
        if (idx >= 0) statusHandlers.splice(idx, 1);
      };
    },

    get status() {
      return status;
    }
  };
}
// #endregion DRIVE

// #region EXPOSED_LIBS
const yjs = {
  Y,
  Doc: Y.Doc,
  Text: Y.Text,
  Array: Y.Array,
  Map: Y.Map,
  Awareness,
  encodeStateAsUpdate: Y.encodeStateAsUpdate,
  applyUpdate: Y.applyUpdate,
  encodeStateVector: Y.encodeStateVector,
  createAbsolutePositionFromRelativePosition: Y.createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex: Y.createRelativePositionFromTypeIndex,
};

const codemirror = {
  EditorView,
  EditorState,
  StateEffect,
  Compartment,
  Text,
  Transaction,
  basicSetup,
  keymap,
  Decoration,
  ViewPlugin,
  WidgetType,
  placeholder,
  syntaxTree,
  syntaxHighlighting,
  defaultHighlightStyle,
  oneDark,
  javascript,
  python,
  markdown,
};
// #endregion EXPOSED_LIBS

// #region TERMINAL_EXPORTS
const terminal = {
  TerminalBuffer,
  processTerminalOutput,
  terminalToHtml,
  stripAnsi,
  hasAnsi,
  ansiStyles,
  // Output widget
  outputWidget,
  outputWidgetPlugin,
  injectOutputWidgetStyles,
  outputWidgetStyles,
};
// #endregion TERMINAL_EXPORTS

// #region AWARENESS_EXPORTS
const awarenessExports = {
  // Main API
  createAwareness,
  AwarenessSystem,
  AwarenessStateManager,

  // State helpers
  createHumanState,
  createRuntimeState,
  createAIState,
  generateColor: generateAwarenessColor,

  // UI Components
  createCollaboratorList,
  createFloatingCollaboratorList,
  createAvatarRow,
  createStatusBar,

  // Extensions
  createCursorExtensions,
  createIndicatorExtensions,

  // Tracking
  createHumanAwarenessExtensions,
  createRuntimeAwarenessTracker,
  createSimpleExecutionTracker,

  // Styles
  injectAwarenessStyles,

  // Config presets
  defaultAwarenessConfig,
  minimalAwarenessConfig,
};
// #endregion AWARENESS_EXPORTS

// #region CONFIG_STATE_EXPORTS
const configExports = {
  normalizeOptions,
  createReactiveConfig,
  createConfigHandler,
  serializeConfig,
  isFullySerializable,
};

const stateExports = {
  createStateManager,
};
// #endregion CONFIG_STATE_EXPORTS

// #region CELL_CONTROLS_EXPORTS
const cellControlsExports = {
  createCellControls,
  CellControlsSystem,
};
// #endregion CELL_CONTROLS_EXPORTS

// #region RUNTIME_LSP_EXPORTS
const runtimeLspExports = {
  // Adapters
  adaptMrmdJsSession,
  adaptMRPClient,

  // Extensions
  createRuntimeHoverExtension,
  createRuntimeCompletionExtension,

  // Variable Explorer
  createVariableExplorer,

  // Styles
  injectRuntimeLspStyles,
};
// #endregion RUNTIME_LSP_EXPORTS

// #region EXPORTS
const mrmd = {
  version: VERSION,
  create,
  drive,
  yjs,
  codemirror,
  terminal,
  awareness: awarenessExports,
  // Widget theme system
  widgets,
  // Config & State systems
  configUtils: configExports,
  stateUtils: stateExports,
  // Cell controls (run buttons, queue, status)
  cellControls: cellControlsExports,
  // Runtime LSP (hover, completions, variables)
  runtimeLsp: runtimeLspExports,
  // Utilities for runtime authors
  RuntimeRegistry,
  createRuntimeRegistry,
  // Built-in JavaScript runtime (mrmd-js)
  createJavaScriptRuntime,
  // MRP Client for connecting to runtime servers
  MRPClient,
  // Direct terminal exports for convenience
  TerminalBuffer,
  processTerminalOutput,
  // Direct awareness exports for convenience
  createAwareness,
  AwarenessSystem,
  AwarenessStateManager,
  // Direct runtime LSP exports for convenience
  adaptMrmdJsSession,
  adaptMRPClient,
  createRuntimeHoverExtension,
  createRuntimeCompletionExtension,
  createVariableExplorer,
};

export default mrmd;
export {
  create,
  drive,
  yjs,
  codemirror,
  terminal,
  awarenessExports as awareness,
  RuntimeRegistry,
  createRuntimeRegistry,
  createJavaScriptRuntime,
  MRPClient,
  TerminalBuffer,
  processTerminalOutput,
  terminalToHtml,
  stripAnsi,
  hasAnsi,
  ansiStyles,
  // Awareness exports
  createAwareness,
  AwarenessSystem,
  AwarenessStateManager,
  createHumanState,
  createRuntimeState,
  createAIState,
  injectAwarenessStyles,
  defaultAwarenessConfig,
  minimalAwarenessConfig,
  createCollaboratorList,
  createFloatingCollaboratorList,
  createAvatarRow,
  createStatusBar,
  createCursorExtensions,
  createIndicatorExtensions,
  // Dev panel exports
  devPanelExtension,
  toggleDevPanel,
  injectDevPanelStyles,
  // Config/State exports
  configExports,
  stateExports,
  normalizeOptions,
  createReactiveConfig,
  createConfigHandler,
  serializeConfig,
  isFullySerializable,
  createStateManager,
  // Runtime LSP exports
  runtimeLspExports,
  adaptMrmdJsSession,
  adaptMRPClient,
  createRuntimeHoverExtension,
  createRuntimeCompletionExtension,
  createVariableExplorer,
  injectRuntimeLspStyles,
  // Widget theme system exports
  widgets,
  initTheme,
  applyTheme,
  detectTheme,
  watchTheme,
  midnightTheme,
  daylightTheme,
  githubTheme,
  registerTheme,
  createTheme,
  getTheme,
  getThemeNames,
  generateThemeCSS,
  // Cell controls exports
  cellControlsExports,
  createCellControls,
  CellControlsSystem,
  // Monitor coordination exports
  MonitorCoordination,
  EXECUTION_STATUS,
  createMonitorCoordination,
};
// #endregion EXPORTS
