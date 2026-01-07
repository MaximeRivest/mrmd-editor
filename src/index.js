/**
 * mrmd - Markdown editor with realtime collaboration
 *
 * A drop-in collaborative markdown editor with CodeMirror 6 and Yjs.
 * Code blocks automatically get syntax highlighting for their language.
 *
 * Usage:
 *   // Standalone
 *   const editor = mrmd.create('#editor', { doc: '# Hello' });
 *
 *   // With sync server
 *   const docs = mrmd.drive('wss://server');
 *   const editor = docs.open('readme.md', '#editor');
 */

// #region IMPORTS - External dependencies
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, Text, Transaction } from '@codemirror/state';
import { keymap, Decoration, ViewPlugin, WidgetType, placeholder } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { StreamLanguage, syntaxTree, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

// CM6 Native language support
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

// Community CM6 languages
import { r } from 'codemirror-lang-r';
import { julia } from '@plutojl/lang-julia';

// CM5 Legacy modes (for languages without CM6 support)
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';

import * as Y from 'yjs';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { WebsocketProvider } from 'y-websocket';
// #endregion IMPORTS

// #region VERSION - Package version constant
const VERSION = '0.1.0';
// #endregion VERSION

// #region CODE_BLOCK_LANGUAGES - Language support for fenced code blocks
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

// #region STREAMING_WRITER - Writer class for streaming content
/**
 * Writer for streaming content into the editor.
 * Used by AI, code output, etc.
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
    this._editor.insert(this._pos, text);
    this._pos += text.length;
    return this;
  }

  end() {
    this._active = false;
  }

  get position() {
    return this._pos;
  }
}
// #endregion STREAMING_WRITER

// #region EDITOR_FACTORY - Main create() function
/**
 * Create a standalone markdown editor
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
  } = options;

  const getSystemDarkMode = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const isDark = dark !== null ? dark : getSystemDarkMode();
  const yText = ydoc.getText(ytext);

  if (yText.length === 0 && doc) {
    yText.insert(0, doc);
  }

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

  const extensions = [
    basicSetup,
    markdownWithCodeBlocks,
    ...languageSupportExtensions,
    documentTheme,
    themeCompartment.of(isDark ? oneDark : []),
    readonlyCompartment.of(readonly ? EditorState.readOnly.of(true) : []),
    placeholderText ? placeholder(placeholderText) : [],
    yCollab(yText),
    keymap.of(yUndoManagerKeymap),
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: initialContent, extensions }),
    parent: element
  });

  // Event handlers
  const changeHandlers = [];
  const saveHandlers = [];

  // Listen for changes
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const content = update.state.doc.toString();
      changeHandlers.forEach(fn => fn(content));
    }
  });

  // Add update listener
  view.dispatch({
    effects: view.state.update({}).effects
  });

  // Keyboard handler for save
  element.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      const content = view.state.doc.toString();
      saveHandlers.forEach(fn => fn(content));
    }
  });

  // #region EDITOR_API
  const api = {
    // Core references
    view,
    ydoc,
    yText,

    // Content
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

    // Streaming writer
    writer(pos) {
      return new Writer(this, pos);
    },

    // State
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

    // Events
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

    // Code cells (placeholders for runtime packages)
    runCell(index) {
      console.warn('mrmd: No runtime configured. Use mrmd-python, mrmd-node, etc.');
    },

    runCurrentCell() {
      console.warn('mrmd: No runtime configured.');
    },

    runAll() {
      console.warn('mrmd: No runtime configured.');
    },

    clearOutput(index) {
      // TODO: implement
    },

    clearOutputs() {
      // TODO: implement
    },

    // Destroy
    destroy() {
      view.destroy();
    }
  };
  // #endregion EDITOR_API

  return api;
}
// #endregion EDITOR_FACTORY

// #region DRIVE - Connection to sync server
/**
 * Connect to a sync server
 *
 * @param {string|Object} urlOrOptions - WebSocket URL or options object
 * @param {Object} options - Options if first arg is URL
 * @returns {Drive} Drive instance
 */
function drive(urlOrOptions, options = {}) {
  let url, auth;

  if (typeof urlOrOptions === 'string') {
    url = urlOrOptions;
    auth = options.auth;
  } else {
    url = urlOrOptions.url;
    auth = urlOrOptions.auth;
  }

  // Normalize URL
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

    /**
     * Open a file in an editor
     */
    open(path, target, editorOptions = {}) {
      const ydoc = new Y.Doc();

      // Connect to sync server
      // WebsocketProvider takes (serverUrl, roomName, ydoc)
      // The room name becomes the URL path on the server
      const serverUrl = auth ? `${url}?token=${auth}` : url;
      const provider = new WebsocketProvider(serverUrl, path, ydoc);

      provider.on('status', ({ status: s }) => {
        setStatus(s);
      });

      // Create editor with this ydoc
      const editor = create(target, {
        ...editorOptions,
        ydoc,
        ytext: 'content',
      });

      // Extend editor with sync-specific methods
      editor.provider = provider;
      editor.path = path;

      editor.disconnect = () => {
        provider.disconnect();
      };

      editor.reconnect = () => {
        provider.connect();
      };

      return editor;
    },

    /**
     * Read file content without mounting editor
     */
    async read(path) {
      // TODO: implement via REST or sync protocol
      throw new Error('drive.read() not yet implemented');
    },

    /**
     * Write file content directly
     */
    async write(path, content) {
      // TODO: implement via REST or sync protocol
      throw new Error('drive.write() not yet implemented');
    },

    /**
     * List files in directory
     */
    async list(path) {
      // TODO: implement via REST or sync protocol
      throw new Error('drive.list() not yet implemented');
    },

    /**
     * Connection status handler
     */
    onStatus(callback) {
      statusHandlers.push(callback);
      return () => {
        const idx = statusHandlers.indexOf(callback);
        if (idx >= 0) statusHandlers.splice(idx, 1);
      };
    },

    /**
     * Current status
     */
    get status() {
      return status;
    }
  };
}
// #endregion DRIVE

// #region EXPOSED_LIBS - Libraries exposed for power users
const yjs = {
  Y,
  Doc: Y.Doc,
  Text: Y.Text,
  Array: Y.Array,
  Map: Y.Map,
  encodeStateAsUpdate: Y.encodeStateAsUpdate,
  applyUpdate: Y.applyUpdate,
  encodeStateVector: Y.encodeStateVector,
};

const codemirror = {
  EditorView,
  EditorState,
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

// #region EXPORTS - Module exports
const mrmd = {
  version: VERSION,
  create,
  drive,
  yjs,
  codemirror,
};

export default mrmd;
// #endregion EXPORTS
