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
import { MRPClient } from './mrp-client.js';

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
// #endregion IMPORTS

// #region VERSION
const VERSION = '0.1.0';
// #endregion VERSION

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

  const {
    doc = '',
    dark = null,
    placeholder: placeholderText = 'Start typing...',
    readonly = false,
    ydoc = new Y.Doc(),
    ytext = 'content',
    awareness: providedAwareness = null,
    runtimes = {},
    // Built-in JavaScript runtime (mrmd-js)
    // true = enabled (default), false = disabled, object = custom runtime
    javascript = true,
    // Collaborator info for awareness
    userName = 'Anonymous',
    userColor = null,
    userType = 'human',
    // Awareness configuration (batteries-included features)
    // Set to false to disable, true for defaults, or pass config object
    awarenessUI = true,
  } = options;

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
    yCollab(yText, awareness),
    keymap.of(yUndoManagerKeymap),
    outputWidgetPlugin, // ANSI output rendering
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: initialContent, extensions }),
    parent: element
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
    if (awarenessExtensions.length > 0) {
      view.dispatch({
        effects: StateEffect.appendConfig.of(awarenessExtensions)
      });
    }
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

  // Create editor API object first (needed by ExecutionManager)
  const api = {
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

    // ===========================================================================
    // Content
    // ===========================================================================

    getContent() {
      return view.state.doc.toString();
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
     * @param {function} callback
     * @returns {function} Unsubscribe function
     */
    onCollaboratorsChange(callback) {
      const handler = () => callback(this.getCollaborators());
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

    // ===========================================================================
    // Cleanup
    // ===========================================================================

    destroy() {
      this.execution.cancelAll();
      if (awarenessSystem) {
        awarenessSystem.destroy();
      }
      if (jsRuntime && jsRuntime.destroy) {
        jsRuntime.destroy();
      }
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
  };

  // Create execution manager
  api.execution = createExecutionManager(api, registry);

  // Wire up change handlers
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const content = update.state.doc.toString();
      changeHandlers.forEach(fn => fn(content));
    }
  });

  // Add update listener extension
  view.dispatch({
    effects: StateEffect.appendConfig.of(updateListener)
  });

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

// #region EXPORTS
const mrmd = {
  version: VERSION,
  create,
  drive,
  yjs,
  codemirror,
  terminal,
  awareness: awarenessExports,
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
};
// #endregion EXPORTS
