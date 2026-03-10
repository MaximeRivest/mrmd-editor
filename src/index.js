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
import { keymap, Decoration, ViewPlugin, WidgetType, placeholder, highlightWhitespace } from '@codemirror/view';
import { StreamLanguage, syntaxTree, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { createCodemirrorTheme } from './widgets/codemirror-theme.js';

// Language support
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
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
import { mermaid } from 'codemirror-lang-mermaid';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';

// Collaboration
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { WebsocketProvider } from 'y-websocket';

// Internal modules
import { findCells, getCellAtCursor, countCells, findTerminalBlocks, isTerminalLanguage } from './cells.js';
import { RuntimeRegistry, createRuntimeRegistry } from './runtime.js';
import {
  defaultDocumentTemplate,
  documentTemplatePresets,
  normalizeDocumentTemplate,
  cloneDocumentTemplate,
  createDocumentTemplateExtension,
  compileDocumentTemplateCSS,
  serializeDocumentTemplateToCss,
  findDocumentTemplatePreset,
  resolveFontForExport,
  serializeDocumentTemplateToPandocMeta,
  serializeDocumentTemplateToPandocYaml,
  serializeDocumentTemplateToLatexPreamble,
  serializeDocumentTemplateToHtml,
  serializeDocumentTemplateToWordStyleMap,
  buildPandocCommand,
} from './document-template.js';
import { parseFrontmatter, readFrontmatterValue, updateFrontmatterField } from './frontmatter-updater.js';
import { ExecutionManager, createExecutionManager } from './execution.js';
import { MonitorCoordination, EXECUTION_STATUS, createMonitorCoordination } from './monitor-coordination.js';
import * as linkedTables from './tables/index.js';
import {
  LINKED_TABLE_EVENT,
  dispatchLinkedTableAction,
  openLinkedTableWorkspace,
  canImportLinkedTableFromHost,
  normalizeLinkedTableBlockInsertion,
  insertLinkedTableBlock,
  importLinkedTableFromHost,
  TableJobsClient,
  TABLE_JOB_STATUS,
  createTableJobsClient,
  createLinkedTableController,
  LinkedTableController,
  createLinkedTableBlockAnchor,
  resolveLinkedTableBlockAnchor,
  linkedTableMarkdownState,
} from './tables/index.js';
import { MRPClient } from './mrp-client.js';

// Shell (status bar, file management, studio layout)
import * as shellModule from './shell/index.js';

// AI Integration (decorations, state, widgets)
import * as aiIntegrationModule from './ai-integration.js';

// Ctrl-K Modal (cursor-positioned AI command input)
import * as ctrlKModalModule from './ctrl-k-modal.js';

// Comment Syntax (<!--! !--> markers with AI integration)
import * as commentSyntaxModule from './comment-syntax.js';

// Cell controls (run buttons, queue, status)
import { createCellControls, CellControlsSystem } from './cell-controls/index.js';

// Section controls (AI/formatting next to focused line)
import { sectionControls } from './section-controls/index.js';

// Commands and keymap
import { commandRegistry } from './commands.js';
import { createKeymap, mergeKeybindings, defaultKeybindings } from './keymap.js';

// Runtime LSP (hover, completions, variables)
import {
  adaptMrmdJsSession,
  adaptMRPClient,
  createRuntimeHoverExtension,
  createRuntimeCompletionExtension,
  createRuntimeSignatureHelpExtension,
  createVariableExplorer,
  injectRuntimeLspStyles,
} from './runtime-lsp.js';

// Spellcheck (prose-only, disabled in code blocks)
import { createSpellcheckExtensions } from './spellcheck.js';
// Grammar diagnostics (LanguageTool host integration)
import {
  createLanguageToolDiagnosticsExtension,
  collectVisibleProseFragments,
  forceLanguageToolRefresh,
  refreshLanguageToolDiagnostics,
  applyFirstLanguageToolSuggestion,
  getLanguageToolSuggestionMenu,
  applyLanguageToolSuggestionAt,
} from './grammar.js';

// Wiki-link completion ([[internal-links]])
import {
  projectFilesFacet,
  createWikiLinkCompletionSource,
  createWikiLinkCompletionExtension,
  getWikiLinkCompletionSource,
  injectWikiLinkCompletionStyles,
} from './wiki-link-completion.js';

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
// Terminal portal (```term blocks with xterm.js)
import { TermBlock, termBlockRegistry, TermBlockRegistry } from './term-block.js';
import { PtyClient, createPtyClient, listTerminalSessions, createTerminalSession } from './term-pty-client.js';
import {
  terminalWidget,
  terminalKeymap,
  launchTerminal,
  closeTerminal,
  isTerminalVisible,
  terminalOverlay,
  injectTermWidgetStyles,
  termOverlayStyles,
} from './term-widget.js';
import {
  outputWidget,
  outputWidgetPlugin,
  outputWidgetAwarenessFacet,
  injectOutputWidgetStyles,
  outputWidgetStyles,
} from './output-widget.js';

// Markdown rendering (blur→render, focus→source)
import {
  markdown as markdownRendering,
  markdownRenderer,
  assetResolverFacet,  // Facet for resolving asset URLs in Electron/desktop apps
  sourceModeFacet,     // Facet to toggle source/raw markdown view
  wysiwygModeFacet,    // Facet to toggle protected WYSIWYG rendering
  createWysiwygExtensions,
  createInlineEditingExtensions,
  toggleInlineFormat,
  toggleInlineMark,
  getSelectionFormattingState,
  findFencedCodeAt,
  blockDecorations,  // StateField for tables, display math (multi-line replace)
  lineHeightTracker, // ViewPlugin for accurate line height tracking
  markdownStyles,
  injectMarkdownStyles,
  // Widgets
  TaskCheckboxWidget,
  ImageWidget,
  ImagePlaceholder,
  parseImageMarkdown,
  TableWidget,
  parseTable,
  isTableLine,
  isTableDelimiter,
  generateTableId,
  AlertTitleWidget,
} from './markdown/index.js';

// Page view pagination (spacer-based page breaks)
import { pageViewPagination } from './page-view-pagination.js';

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

  // Track named execution contexts - each can have different isolation
  // Context naming:
  //   null/undefined/'default'/'main'/'none' → configured default isolation
  //   'sandbox'/'iframe' → sandboxed iframe
  //   other names → sandboxed iframe with separate scope
  const contexts = new Map();
  const defaultIsolation = options.defaultIsolation || 'iframe';

  /**
   * Get or create a context by name
   * @param {string|null} contextName
   * @returns {Session}
   */
  function getOrCreateContext(contextName) {
    // Normalize context name
    const name = contextName || 'default';

    // Return existing context
    if (contexts.has(name)) {
      return contexts.get(name);
    }

    // Determine isolation mode based on context name
    let isolation;
    if (!contextName || contextName === 'default' || contextName === 'main' || contextName === 'none') {
      // Default context uses the configured default isolation
      isolation = defaultIsolation;
    } else if (contextName === 'sandbox' || contextName === 'iframe') {
      // Explicit sandbox request
      isolation = 'iframe';
    } else {
      // Named contexts are sandboxed by default (separate scope)
      isolation = 'iframe';
    }

    // Create new execution context with appropriate isolation
    const context = rt.createSession({
      language: 'javascript',
      isolation,
      id: name,
    });

    contexts.set(name, context);
    console.log(`[JS Runtime] Created context '${name}' with isolation: ${isolation}`);
    return context;
  }

  // Create default context eagerly
  const defaultContext = getOrCreateContext('default');

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
    // Mermaid diagrams
    'mermaid': 'mermaid',
  };

  return {
    /** Check if this runtime supports the given language */
    supports(lang) {
      return lang.toLowerCase() in supportedLanguages;
    },

    /** Execute code (non-streaming) */
    async execute(code, language, execOptions = {}) {
      const lang = supportedLanguages[language.toLowerCase()] || 'javascript';
      const contextName = execOptions.context ?? execOptions.session;
      const context = getOrCreateContext(contextName);
      const result = await context.execute(code, { language: lang });
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
    async executeStreaming(code, language, onChunk, onStdinRequest, execOptions = {}) {
      const lang = supportedLanguages[language.toLowerCase()] || 'javascript';
      const contextName = execOptions.context ?? execOptions.session;
      const context = getOrCreateContext(contextName);
      const result = await context.execute(code, { language: lang });

      // Handle different output types
      let output = result.stdout || '';

      // For HTML/CSS, check displayData for rendered content
      if (result.displayData && result.displayData.length > 0) {
        const display = result.displayData[0];
        if (display.data) {
          // Prefer HTML representation
          if (display.data['text/html']) {
            output = display.data['text/html'];
          } else if (display.data['text/css']) {
            // Preserve CSS source so the output widget can show selector impact
            output = display.data['text/css'];
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

    /** Reset a context (clear all variables) */
    reset(contextName) {
      const context = contexts.get(contextName || 'default');
      if (context) {
        context.reset();
      }
    },

    /** Reset all contexts */
    resetAll() {
      for (const context of contexts.values()) {
        context.reset();
      }
    },

    /** Get the underlying mrmd-js runtime */
    getRuntime() {
      return rt;
    },

    /** Get a context by name (default if not specified) */
    getContext(contextName) {
      return getOrCreateContext(contextName);
    },

    /** List all context names */
    listContexts() {
      return Array.from(contexts.keys());
    },

    // Legacy aliases (kept for compatibility inside monorepo)
    getSession(contextName) {
      return getOrCreateContext(contextName);
    },

    listSessions() {
      return Array.from(contexts.keys());
    },

    /** Destroy the runtime and all contexts */
    destroy() {
      rt.destroy();
    },

    // =========================================================================
    // LSP Features (powered by mrmd-js default context)
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
      return defaultContext.hover(code, cursor);
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
      return defaultContext.complete(code, cursor);
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
      return defaultContext.inspect(code, cursor, options);
    },

    /**
     * List all variables in a context namespace.
     *
     * @param {Object} [filter]
     * @param {string} [contextName='default']
     * @returns {Array<{name: string, type: string, value: string, expandable?: boolean}>}
     */
    listVariables(filter = {}, contextName = 'default') {
      return getOrCreateContext(contextName).listVariables(filter);
    },

    /**
     * Get detailed info about a specific variable.
     *
     * @param {string} name - Variable name
     * @param {Object} [options] - Options like path, maxChildren
     * @returns {Object}
     */
    getVariable(name, options = {}) {
      return defaultContext.getVariable(name, options);
    },

    /**
     * Check if code is a complete statement.
     *
     * @param {string} code
     * @returns {{status: 'complete'|'incomplete'|'invalid'|'unknown', indent?: string}}
     */
    isComplete(code) {
      return defaultContext.isComplete(code);
    },

    /**
     * Format code.
     *
     * @param {string} code
     * @returns {Promise<{formatted: string, changed: boolean}>}
     */
    format(code) {
      return defaultContext.format(code);
    },

    /**
     * Get the adapted LSP provider for use with runtime-lsp module.
     * @returns {import('./runtime-lsp.js').RuntimeLSPProvider}
     */
    getLSPProvider() {
      return adaptMrmdJsSession(defaultContext);
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
const mermaidSupport = mermaid();
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
    case 'mermaid':
      return mermaidSupport.language;
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

// #region CODE_BLOCK_BACKGROUND
/**
 * ViewPlugin that adds background styling to fenced code blocks.
 * Gives code cells the light gray background like Material for MkDocs.
 * Fence lines (``` markers) get smaller/lighter styling to fade away.
 */
const codeBlockBackground = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    const decorations = [];
    const tree = syntaxTree(view.state);

    tree.iterate({
      enter: (node) => {
        if (node.name === 'FencedCode') {
          const from = node.from;
          const to = node.to;
          const firstLine = view.state.doc.lineAt(from);
          const lastLine = view.state.doc.lineAt(to);

          // Extract language from the opening fence line
          const fenceText = firstLine.text;
          const langMatch = fenceText.match(/^(\s*`{3,}|~{3,})\s*(\S*)/);
          const rawLang = langMatch?.[2] || '';
          const language = normalizeCodeLanguage(rawLang);

          // Iterate through each line in the code block
          for (let pos = from; pos < to;) {
            const line = view.state.doc.lineAt(pos);
            const isFirstLine = line.number === firstLine.number;
            const isLastLine = line.number === lastLine.number;

            if (isFirstLine || isLastLine) {
              // Fence lines - subtle styling
              decorations.push(
                Decoration.line({
                  class: 'cm-codeblock-fence',
                  attributes: language ? { 'data-lang': language } : undefined,
                }).range(line.from)
              );
            } else {
              // Content lines - normal code block styling
              decorations.push(
                Decoration.line({
                  class: 'cm-codeblock-line',
                  attributes: language ? { 'data-lang': language } : undefined,
                }).range(line.from)
              );
            }
            pos = line.to + 1;
          }
        }
      }
    });

    return Decoration.set(decorations, true);
  }
}, {
  decorations: v => v.decorations
});

/**
 * CSS styles for code block backgrounds
 *
 * Selection visibility fix:
 * CodeMirror renders selection via .cm-selectionBackground elements in a layer
 * BELOW the content layer. Opaque line backgrounds hide this selection.
 * We fix this by:
 * 1. Using semi-transparent backgrounds (allows selection to show through)
 * 2. Styling ::selection pseudo-element (native browser selection, always on top)
 */
const codeBlockStyles = EditorView.theme({
  // Content lines - smaller than prose, monospace font for code
  '.cm-codeblock-line': {
    backgroundColor: 'color-mix(in srgb, var(--widget-surface, #f5f5f5) 85%, transparent)',
    fontFamily: "var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace)",
    fontSize: 'var(--code-font-size, 0.8em)',
    lineHeight: 'var(--code-line-height, 1.5)',
  },
  // Fence lines (``` markers) - even smaller, very subtle
  '.cm-codeblock-fence': {
    backgroundColor: 'color-mix(in srgb, var(--widget-surface, #f5f5f5) 85%, transparent)',
    fontFamily: "var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace)",
    fontSize: '0.5em',
    color: 'var(--widget-text-muted, #888)',
  },
  // Selection styling for code blocks - ensure visibility with native ::selection
  '.cm-codeblock-line::selection, .cm-codeblock-line *::selection': {
    backgroundColor: 'var(--editor-selection, #264f78) !important',
  },
  '.cm-codeblock-fence::selection, .cm-codeblock-fence *::selection': {
    backgroundColor: 'var(--editor-selection, #264f78) !important',
  },
  // Mobile: code blocks need to be larger and scroll horizontally
  '@media (max-width: 768px)': {
    '.cm-codeblock-line': {
      fontSize: 'max(var(--code-font-size, 0.8em), 13px)',
    },
    '.cm-codeblock-fence': {
      fontSize: '0.6em', // Slightly larger than desktop's 0.5em for visibility
    },
  },
});
// #endregion CODE_BLOCK_BACKGROUND

// #region INVISIBLE_CHARACTERS
/**
 * Extension that shows newline markers (¶) at the end of each line.
 * Used in combination with CM6's built-in highlightWhitespace() for
 * spaces and tabs. Together they provide full invisible character rendering.
 */
class NewlineMarkerWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-newline-marker';
    span.textContent = '¶';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  ignoreEvent() { return true; }
}

const newlineMarkerPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view) {
      const decorations = [];
      const doc = view.state.doc;

      for (let i = doc.lineAt(view.viewport.from).number; i <= doc.lineAt(view.viewport.to).number; i++) {
        const line = doc.line(i);
        // Add newline marker at the end of each line (except the last line if it has no trailing newline)
        if (i < doc.lines) {
          decorations.push(
            Decoration.widget({
              widget: new NewlineMarkerWidget(),
              side: 1, // After the line content
            }).range(line.to)
          );
        }
      }

      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations }
);

/**
 * Styles for invisible character markers.
 * Overrides CM6's default whitespace styling with more visible symbols.
 */
const invisibleCharStyles = EditorView.theme({
  // Newline markers (¶)
  '.cm-newline-marker': {
    color: 'var(--md-marker-color, #aaa)',
    opacity: '0.5',
    fontSize: '0.8em',
    userSelect: 'none',
    pointerEvents: 'none',
  },
  // Override CM6's default space dots - make them subtler
  '.cm-highlightSpace': {
    backgroundImage: 'radial-gradient(circle at 50% 55%, var(--md-marker-color, #aaa) 20%, transparent 5%)',
    opacity: '0.4',
  },
  // Override CM6's tab arrows
  '.cm-highlightTab': {
    backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20"><path stroke="%23aaa" stroke-width="1" fill="none" d="M1 10H196L190 5M190 15L196 10M197 4L197 16"/></svg>')`,
    opacity: '0.5',
  },
});

/**
 * Create the invisibles extension bundle.
 * Includes whitespace highlighting + newline markers + styles.
 *
 * @returns {import('@codemirror/state').Extension}
 */
function createInvisiblesExtension() {
  return [
    highlightWhitespace(),
    newlineMarkerPlugin,
    invisibleCharStyles,
  ];
}
// #endregion INVISIBLE_CHARACTERS

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

// #region INITIAL_CURSOR
/**
 * Find the ideal initial cursor position for a markdown document.
 *
 * When opening a file, placing the cursor at position 0 shows raw frontmatter
 * YAML which looks ugly. Instead, we find the first empty line after any
 * frontmatter block — this causes the frontmatter to render as a nice widget
 * and gives a clean first impression.
 *
 * @param {string} content - Document content
 * @returns {number} Character position for the cursor
 */
function findInitialCursorPosition(content) {
  if (!content) return 0;

  const lines = content.split('\n');
  let i = 0;

  // Skip YAML frontmatter if present (--- ... ---)
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i]?.trim() !== '---') {
      i++;
    }
    if (i < lines.length) i++; // skip closing ---
  }

  // Find first empty line from current position
  while (i < lines.length) {
    if (lines[i]?.trim() === '') {
      // Calculate character position (start of this empty line)
      let pos = 0;
      for (let j = 0; j < i; j++) {
        pos += lines[j].length + 1; // +1 for \n
      }
      return pos;
    }
    i++;
  }

  return 0; // fallback to start
}

function wrapSelectionsWith(view, open, close = open, userEvent = 'input.wysiwyg.format') {
  const state = view.state;
  const changes = [];
  const ranges = [];
  let delta = 0;

  for (const range of state.selection.ranges) {
    if (range.empty) {
      changes.push({ from: range.from, insert: open + close });
      const pos = range.from + open.length + delta;
      ranges.push({ anchor: pos, head: pos });
      delta += open.length + close.length;
    } else {
      changes.push({ from: range.from, insert: open });
      changes.push({ from: range.to, insert: close });
      ranges.push({ anchor: range.from + open.length + delta, head: range.to + open.length + delta });
      delta += open.length + close.length;
    }
  }

  view.dispatch({
    changes,
    selection: { ranges, mainIndex: state.selection.mainIndex },
    userEvent,
  });
}

function currentLineStructuralPrefix(lineText) {
  const heading = lineText.match(/^\s{0,3}(#{1,6})\s+/);
  if (heading) return heading[0];
  const quote = lineText.match(/^(\s*>\s?)+/);
  if (quote) return quote[0];
  const list = lineText.match(/^(\s*)(?:[-+*]|\d+\.)\s+/);
  if (list) return list[0];
  return '';
}

function getCurrentBlockTypeInfo(view) {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const text = line.text;

  // ── Check if inside a fenced code block ──
  const tree = syntaxTree(view.state);
  let fencedCode = null;
  tree.iterate({
    from: Math.max(0, pos - 1),
    to: pos + 1,
    enter: (node) => {
      if (node.name === 'FencedCode' && node.from <= pos && node.to >= pos) {
        fencedCode = node;
      }
    },
  });

  if (fencedCode) {
    // Extract language from the opening fence line (```python, ```r, etc.)
    const fenceLine = view.state.doc.lineAt(fencedCode.from);
    const fenceText = fenceLine.text;
    const langMatch = fenceText.match(/^(\s*`{3,}|~{3,})\s*(\S*)/);
    const rawLang = langMatch?.[2] || '';
    const language = normalizeCodeLanguage(rawLang);

    // Determine if cursor is on the fence line itself or inside code content
    const isOnFence = line.number === fenceLine.number ||
      line.number === view.state.doc.lineAt(fencedCode.to).number;

    // Detect the syntax token under the cursor
    const syntaxToken = isOnFence ? null : getSyntaxTokenAtPos(view, pos);

    return {
      type: 'codeblock',
      level: 0,
      label: language ? `codeblock-${language}` : 'codeblock',
      language,
      isOnFence,
      syntaxToken,
      fenceFrom: fencedCode.from,
      fenceTo: fencedCode.to,
    };
  }

  const heading = text.match(/^\s{0,3}(#{1,6})\s+/);
  if (heading) {
    return { type: 'heading', level: heading[1].length, label: `h${heading[1].length}` };
  }

  if (/^(\s*>\s?)+/.test(text)) {
    return { type: 'blockquote', level: 1, label: 'blockquote' };
  }

  if (/^(\s*)(?:[-+*])\s+/.test(text)) {
    return { type: 'unordered-list', level: 1, label: 'unordered-list' };
  }

  if (/^(\s*)(?:\d+\.)\s+/.test(text)) {
    return { type: 'ordered-list', level: 1, label: 'ordered-list' };
  }

  return { type: 'paragraph', level: 0, label: 'paragraph' };
}

/**
 * Normalize code language aliases to canonical names matching template keys.
 */
function normalizeCodeLanguage(raw) {
  if (!raw) return '';
  const lang = raw.toLowerCase().trim();
  const map = {
    'js': 'javascript', 'node': 'javascript', 'ecmascript': 'javascript',
    'ts': 'typescript',
    'py': 'python', 'python3': 'python',
    'rb': 'ruby',
    'rs': 'rust',
    'sh': 'shell', 'bash': 'shell', 'zsh': 'shell', 'fish': 'shell',
    'ps1': 'powershell', 'pwsh': 'powershell',
    'yml': 'yaml',
    'htm': 'html',
    'c': 'cpp', 'c++': 'cpp', 'cxx': 'cpp', 'h': 'cpp', 'hpp': 'cpp',
    'golang': 'go',
    'jl': 'julia',
    'rlang': 'r',
    'mysql': 'sql', 'postgresql': 'sql', 'postgres': 'sql', 'sqlite': 'sql',
    'jsonc': 'json',
    'jsx': 'javascript', 'tsx': 'typescript',
    'xml': 'html', 'svg': 'html',
  };
  return map[lang] || lang;
}

/**
 * Get the semantic syntax token type at a position within a code block.
 * Maps CodeMirror/Lezer highlight tags to our template token names.
 *
 * @param {EditorView} view
 * @param {number} pos
 * @returns {string|null} Token name like 'keyword', 'string', 'comment', etc.
 */
function getSyntaxTokenAtPos(view, pos) {
  const tree = syntaxTree(view.state);
  let bestNode = null;
  let bestSize = Infinity;

  // Find the most specific (smallest) node at pos
  tree.iterate({
    from: pos,
    to: pos + 1,
    enter: (node) => {
      const size = node.to - node.from;
      if (size < bestSize && node.from <= pos && node.to > pos) {
        bestNode = node;
        bestSize = size;
      }
    },
  });

  if (!bestNode) return null;
  const name = bestNode.name;

  // Map Lezer tree node names to our semantic token names.
  // These are the node names from @lezer/highlight and language parsers.
  const tokenMap = {
    // Keywords
    'Keyword': 'keyword',
    'keyword': 'keyword',
    'ControlKeyword': 'controlKeyword',
    'controlKeyword': 'controlKeyword',
    'for': 'controlKeyword',
    'if': 'controlKeyword',
    'else': 'controlKeyword',
    'while': 'controlKeyword',
    'return': 'keyword',
    'def': 'keyword',
    'class': 'keyword',
    'import': 'keyword',
    'from': 'keyword',
    'as': 'keyword',
    'in': 'keyword',
    'not': 'keyword',
    'and': 'keyword',
    'or': 'keyword',
    'is': 'keyword',
    'with': 'keyword',
    'try': 'controlKeyword',
    'except': 'controlKeyword',
    'finally': 'controlKeyword',
    'raise': 'keyword',
    'yield': 'keyword',
    'lambda': 'keyword',
    'pass': 'keyword',
    'break': 'controlKeyword',
    'continue': 'controlKeyword',
    'del': 'keyword',
    'global': 'keyword',
    'nonlocal': 'keyword',
    'assert': 'keyword',
    'async': 'keyword',
    'await': 'keyword',
    'let': 'keyword',
    'const': 'keyword',
    'var': 'keyword',
    'function': 'keyword',
    'switch': 'controlKeyword',
    'case': 'controlKeyword',
    'default': 'controlKeyword',
    'do': 'controlKeyword',
    'throw': 'keyword',
    'catch': 'controlKeyword',
    'new': 'keyword',
    'this': 'keyword',
    'super': 'keyword',
    'extends': 'keyword',
    'implements': 'keyword',
    'interface': 'keyword',
    'enum': 'keyword',
    'export': 'keyword',
    'typeof': 'keyword',
    'instanceof': 'keyword',
    'void': 'keyword',
    'delete': 'keyword',

    // Strings
    'String': 'string',
    'string': 'string',
    'TemplateString': 'string',
    'FormatString': 'string',
    'Character': 'string',

    // Numbers
    'Number': 'number',
    'number': 'number',
    'Integer': 'number',
    'Float': 'number',

    // Comments
    'Comment': 'comment',
    'comment': 'comment',
    'LineComment': 'comment',
    'BlockComment': 'comment',

    // Functions
    'FunctionDefinition': 'function',
    'FunctionDeclaration': 'function',
    'CallExpression': 'function',

    // Variables
    'VariableName': 'variable',
    'VariableDefinition': 'variable',

    // Types
    'TypeName': 'type',
    'TypeDefinition': 'type',
    'ClassName': 'type',
    'ClassDefinition': 'type',

    // Operators
    'ArithOp': 'operator',
    'LogicOp': 'operator',
    'BitOp': 'operator',
    'CompareOp': 'operator',
    'AssignOp': 'operator',
    'Equals': 'operator',

    // Punctuation
    'Punctuation': 'punctuation',
    '(': 'punctuation',
    ')': 'punctuation',
    '[': 'punctuation',
    ']': 'punctuation',
    '{': 'punctuation',
    '}': 'punctuation',
    '.': 'punctuation',
    ',': 'punctuation',
    ';': 'punctuation',
    ':': 'punctuation',

    // Properties
    'PropertyName': 'property',
    'PropertyDefinition': 'property',

    // Constants
    'BooleanLiteral': 'constant',
    'Boolean': 'constant',
    'True': 'constant',
    'False': 'constant',
    'None': 'constant',
    'Null': 'constant',
    'null': 'constant',
    'undefined': 'constant',

    // Regex
    'RegExp': 'regexp',

    // Escape
    'Escape': 'escape',
    'EscapeSequence': 'escape',

    // Tags (HTML/XML)
    'TagName': 'tag',
    'StartTag': 'tag',
    'EndTag': 'tag',
    'SelfClosingTag': 'tag',

    // Attributes
    'AttributeName': 'attribute',
    'AttributeValue': 'attributeValue',

    // Meta / decorators
    'Decorator': 'meta',
    'Annotation': 'meta',
    'Meta': 'meta',
    'ProcessingInstruction': 'meta',
  };

  // Direct match
  if (tokenMap[name]) return tokenMap[name];

  // Try resolving from the tree directly and walking up parent nodes
  try {
    let node = tree.resolveInner(pos, 1);
    let depth = 0;
    while (node && depth < 8) {
      if (tokenMap[node.name]) return tokenMap[node.name];
      node = node.parent;
      depth++;
    }
  } catch (e) { /* ignore tree resolution errors */ }

  return null;
}

function getSelectionFormattingInfo(view) {
  return getSelectionFormattingState(view);
}

function setCurrentBlockType(view, type, options = {}) {
  const state = view.state;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const prefix = currentLineStructuralPrefix(line.text);
  const contentStart = line.from + prefix.length;
  let newPrefix = '';

  if (type === 'paragraph') {
    newPrefix = '';
  } else if (type === 'heading') {
    const level = Math.max(1, Math.min(6, Number(options.level) || 1));
    newPrefix = '#'.repeat(level) + ' ';
  } else if (type === 'blockquote') {
    newPrefix = '> ';
  } else if (type === 'unordered-list') {
    newPrefix = '- ';
  } else if (type === 'ordered-list') {
    newPrefix = '1. ';
  } else {
    return false;
  }

  view.dispatch({
    changes: { from: line.from, to: contentStart, insert: newPrefix },
    selection: { anchor: line.from + newPrefix.length + Math.max(0, pos - contentStart) },
    userEvent: 'input.wysiwyg.blocktype',
  });
  return true;
}

function insertLinkAtSelection(view, url, text = null) {
  const state = view.state;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  const label = text ?? selected ?? 'link';
  const link = `[${label}](${url})`;
  const insertFrom = range.from;
  const insertTo = range.to;
  view.dispatch({
    changes: { from: insertFrom, to: insertTo, insert: link },
    selection: { anchor: insertFrom + 1, head: insertFrom + 1 + label.length },
    userEvent: 'input.wysiwyg.link',
  });
  return true;
}

function insertImageAtSelection(view, url, alt = 'image') {
  const pos = view.state.selection.main.head;
  const image = `![${alt}](${url})`;
  view.dispatch({
    changes: { from: pos, insert: image },
    selection: { anchor: pos + 2, head: pos + 2 + alt.length },
    userEvent: 'input.wysiwyg.image',
  });
  return true;
}

function insertCodeBlockAtCursor(view, language = '') {
  const pos = view.state.selection.main.head;
  const lang = language ? String(language).trim() : '';
  const prefix = pos > 0 && view.state.sliceDoc(pos - 1, pos) !== '\n' ? '\n' : '';
  const block = `${prefix}\`\`\`${lang}\n\n\`\`\``;
  const cursor = pos + prefix.length + 3 + lang.length + 1;
  view.dispatch({
    changes: { from: pos, insert: block },
    selection: { anchor: cursor },
    userEvent: 'input.wysiwyg.codeblock',
  });
  return true;
}
// #endregion INITIAL_CURSOR

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
  const spellcheck = config.appearance.spellcheck;
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

  const linkedTableHostContext = {
    projectRoot: options.projectRoot || null,
    documentPath: options.documentPath || null,
  };

  // Runtimes from normalized config
  const runtimes = {};
  for (const [name, rtConfig] of Object.entries(config.runtimes)) {
    if (rtConfig.type === 'custom' && rtConfig.instance) {
      runtimes[name] = rtConfig.instance;
    }
    // MRP and builtin types are handled separately below
  }

  // JavaScript isolation mode: 'iframe' (default, sandboxed) or 'none' (main window context)
  const javascriptIsolation = options.javascriptIsolation || 'iframe';

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
  const initialDocumentTemplate = normalizeDocumentTemplate(options.documentTemplate || defaultDocumentTemplate);
  const themeCompartment = new Compartment();
  const documentTemplateCompartment = new Compartment();
  const readonlyCompartment = new Compartment();
  const keymapCompartment = new Compartment();
  const projectFilesCompartment = new Compartment();
  const sectionControlsCompartment = new Compartment();
  const sourceModeCompartment = new Compartment();
  const wysiwygModeCompartment = new Compartment();
  const invisiblesCompartment = new Compartment();

  // Create UndoManager for undo/redo tracking
  // We create it ourselves so we can listen to stack changes
  const undoManager = new Y.UndoManager(yText);

  const markdownWithCodeBlocks = markdown({
    base: markdownLanguage,  // GFM support (tables, task lists, strikethrough)
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
    // Mobile: slightly larger text, comfortable line-height
    '@media (max-width: 768px)': {
      '&': { fontSize: '17px' },
      '.cm-scroller': { lineHeight: '1.7' },
    },
  });

  // Inject CSS styles
  injectOutputWidgetStyles();
  if (awarenessUI) {
    injectAwarenessStyles();
  }

  // Initialize unified theme system
  // Use explicit theme if set, otherwise auto-select based on dark mode
  const resolveThemeName = (theme, isDarkMode) => {
    if (theme) return theme;
    return 'plain-light';
  };
  const initialThemeName = resolveThemeName(config.appearance?.theme, isDark);

  // Apply widget theme (CSS variables)
  applyTheme(initialThemeName);

  // Generate CodeMirror theme extension from our theme spec
  const initialTheme = getTheme(initialThemeName);
  const initialCMTheme = initialTheme ? createCodemirrorTheme(initialTheme) : [];

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
    codeBlockBackground,  // Add gray background to code blocks
    codeBlockStyles,
    // Spellcheck: enable browser-native spellcheck on prose, disable in code
    ...(spellcheck !== false ? createSpellcheckExtensions() : []),
    EditorView.lineWrapping, // Always wrap markdown text
    themeCompartment.of(initialCMTheme),
    documentTemplateCompartment.of(createDocumentTemplateExtension(initialDocumentTemplate)),
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
    ...createInlineEditingExtensions(),
    lineHeightTracker,  // ViewPlugin: tracks line height for spacer calculations
    linkedTableMarkdownState,
    blockDecorations,   // StateField for tables, display math (multi-line)
    markdownRenderer,   // ViewPlugin for everything else (inline)
    pageViewPagination, // ViewPlugin: page-view spacers at page boundaries
    ...createWysiwygExtensions(),
    ...commentSyntaxModule.createCommentSyntaxExtension(),
    // Wiki-link completion - just the facet for project files
    // The actual completion is provided by runtime-lsp (via additionalSources)
    // or by a standalone autocompletion added below if no runtime providers exist
    projectFilesCompartment.of(projectFilesFacet.of([])),
    // Section controls are configured after API creation
    sectionControlsCompartment.of([]),
    // Source mode (show all raw markdown syntax)
    sourceModeCompartment.of(sourceModeFacet.of(false)),
    // WYSIWYG mode (fully rendered, syntax-protected editing)
    wysiwygModeCompartment.of(wysiwygModeFacet.of(false)),
    // Invisible characters (whitespace visualization)
    invisiblesCompartment.of([]),
  ];

  // Inject markdown styles
  injectMarkdownStyles();

  // Inject wiki-link completion styles
  injectWikiLinkCompletionStyles();

  const view = new EditorView({
    state: EditorState.create({ doc: initialContent, extensions }),
    parent: element
  });

  // Watch for theme changes (system preference changes)
  // Only auto-switch theme if no explicit theme is configured
  let currentWidgetTheme = initialThemeName;
  const unwatchTheme = watchTheme({
    editorElement: view.dom,
    currentTheme: currentWidgetTheme,
    onThemeChange: (newTheme) => {
      // Only auto-change if user hasn't set an explicit theme
      if (!config.appearance?.theme) {
        currentWidgetTheme = newTheme;
        applyTheme(newTheme);
      }
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
  const selectionHandlers = [];
  const saveHandlers = [];
  const frontmatterTitleCommitHandlers = [];
  const viewSourceHandlers = [];
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

  const handleFrontmatterTitleCommit = (event) => {
    const title = event?.detail?.title;
    if (!title) return;
    for (const handler of frontmatterTitleCommitHandlers) {
      try {
        handler(title, event.detail || {});
      } catch (err) {
        console.warn('[mrmd] frontmatter title commit handler failed:', err);
      }
    }
  };
  element.addEventListener('mrmd:frontmatter-title-commit', handleFrontmatterTitleCommit);

  // Create runtime registry
  const registry = createRuntimeRegistry();

  // Register provided runtimes
  for (const [name, runtime] of Object.entries(runtimes)) {
    registry.register(name, runtime);
  }

  // JavaScript runtime for editor + LSP features.
  // Use normalized config so options.runtimes.javascript is not shadowed by a second runtime.
  let jsRuntime = null;
  const jsRuntimeConfig = config.runtimes.javascript;
  if (jsRuntimeConfig?.type === 'builtin') {
    jsRuntime = createJavaScriptRuntime({ defaultIsolation: javascriptIsolation });
    registry.register('javascript', jsRuntime);
  } else if (jsRuntimeConfig?.type === 'custom' && jsRuntimeConfig.instance) {
    jsRuntime = jsRuntimeConfig.instance;
  }
  // If javascript is disabled, jsRuntime remains null.

  // =========================================================================
  // RUNTIME LSP PROVIDERS
  // Build map of LSP providers for hover, completions, variables
  // Works with both mrmd-js (browser) and MRP servers (mrmd-python)
  // =========================================================================
  const runtimeLspProviders = new Map();

  // Add JS runtime LSP provider if available
  if (jsRuntime?.getLSPProvider) {
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

  // Check for custom runtimes with getLSPProvider method (e.g., mrmd-js passed via options.runtimes)
  for (const [name, rtConfig] of Object.entries(config.runtimes)) {
    if (rtConfig.type === 'custom' && rtConfig.instance?.getLSPProvider) {
      const provider = rtConfig.instance.getLSPProvider();
      runtimeLspProviders.set(name, provider);
      console.log(`[editor] Registered LSP provider for custom runtime: ${name}`);
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
    // Include wiki-link source so both work together
    const wikiLinkSource = getWikiLinkCompletionSource();
    const completionExt = createRuntimeCompletionExtension({
      providers: runtimeLspProviders,
      getContent: () => view.state.doc.toString(),
      stateManager: awarenessSystem?.getStateManager(),
      yText,
      config: {
        activateOnTyping: config.completion?.activateOnTyping ?? true,
        maxRenderedOptions: config.completion?.maxRenderedOptions ?? 50,
      },
      additionalSources: [wikiLinkSource],
    });
    runtimeLspExtensions.push(completionExt);

    const signatureHelpExt = createRuntimeSignatureHelpExtension({
      providers: runtimeLspProviders,
      getContent: () => view.state.doc.toString(),
    });
    runtimeLspExtensions.push(signatureHelpExt);

    // Add extensions to the view
    view.dispatch({
      effects: StateEffect.appendConfig.of(runtimeLspExtensions),
    });
  }

  // Add runtime LSP extensions at init if we have providers
  if (runtimeLspProviders.size > 0) {
    addLspExtensions();
  } else {
    // No runtime providers - add standalone wiki-link completion
    view.dispatch({
      effects: StateEffect.appendConfig.of(createWikiLinkCompletionExtension()),
    });
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
    linkedTables: null, // Set below

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

    getLinkedTableHostContext() {
      return {
        ...linkedTableHostContext,
        ...(this.linkedTables?.getHostContext?.() || {}),
      };
    },

    setLinkedTableHostContext(context = {}) {
      if (context.projectRoot !== undefined) linkedTableHostContext.projectRoot = context.projectRoot;
      if (context.documentPath !== undefined) linkedTableHostContext.documentPath = context.documentPath;
      this.linkedTables?.setHostContext?.(linkedTableHostContext);
      return this.getLinkedTableHostContext();
    },

    canImportLinkedTableFromHost(hostApi) {
      return canImportLinkedTableFromHost(hostApi);
    },

    insertLinkedTableBlock(blockMarkdown, options = {}) {
      return insertLinkedTableBlock(this, blockMarkdown, options);
    },

    async importLinkedTableFromHost(sourceFilePath, options = {}) {
      return importLinkedTableFromHost(this, {
        ...this.getLinkedTableHostContext(),
        ...options,
        sourceFilePath,
      });
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
    // WYSIWYG Editing Helpers
    // ===========================================================================

    toggleBold() {
      return toggleInlineMark(view, 'bold');
    },

    toggleItalic() {
      return toggleInlineMark(view, 'italic');
    },

    toggleUnderline() {
      return toggleInlineMark(view, 'underline');
    },

    toggleStrikethrough() {
      return toggleInlineMark(view, 'strike');
    },

    toggleInlineCode() {
      return toggleInlineMark(view, 'code');
    },

    setBlockType(type, options = {}) {
      return setCurrentBlockType(view, type, options);
    },

    insertLink(url, text = null) {
      return insertLinkAtSelection(view, url, text);
    },

    insertCodeBlock(language = '') {
      return insertCodeBlockAtCursor(view, language);
    },

    /**
     * Delete the fenced code block surrounding the cursor.
     * @returns {boolean} true if a code block was found and deleted
     */
    deleteCodeBlock() {
      const pos = view.state.selection.main.head;
      const fence = findFencedCodeAt(view.state, pos);
      if (!fence) return false;
      const doc = view.state.doc;
      let delFrom = fence.from;
      let delTo = Math.min(fence.to, doc.length);
      if (delFrom > 0 && doc.sliceString(delFrom - 1, delFrom) === '\n') delFrom--;
      if (delTo < doc.length && doc.sliceString(delTo, delTo + 1) === '\n') delTo++;
      view.dispatch({
        changes: { from: delFrom, to: delTo, insert: '' },
        userEvent: 'delete.wysiwyg.delete-codeblock',
      });
      return true;
    },

    insertImage(url, alt = 'image') {
      return insertImageAtSelection(view, url, alt);
    },

    getCurrentBlockType() {
      return getCurrentBlockTypeInfo(view);
    },

    getSelectionFormatting() {
      return getSelectionFormattingInfo(view);
    },

    onSelectionChange(callback) {
      selectionHandlers.push(callback);
      return () => {
        const idx = selectionHandlers.indexOf(callback);
        if (idx >= 0) selectionHandlers.splice(idx, 1);
      };
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

    /**
     * Set dark mode. Updates both CodeMirror and widget themes.
     * @param {boolean | null} value - true=dark, false=light, null=system
     */
    setDark(value) {
      // Use reactive config which triggers handlers
      this.config.appearance.dark = value;
    },

    /**
     * Set the theme. Controls widgets, output, cell controls styling.
     * @param {string | null} theme - Theme name ('midnight', 'daylight', 'github', etc.) or null for auto
     */
    setTheme(theme) {
      // Use reactive config which triggers handlers
      this.config.appearance.theme = theme;
    },

    /**
     * Get available theme names
     * @returns {string[]}
     */
    getThemeNames() {
      return getThemeNames();
    },

    /**
     * Apply a semantic document template to the editor content surface.
     * This is separate from the app/editor chrome theme.
     *
     * @param {object} template
     * @returns {object} normalized template
     */
    setDocumentTemplate(template) {
      const next = normalizeDocumentTemplate(template || defaultDocumentTemplate);
      this._documentTemplate = cloneDocumentTemplate(next);
      this._documentTemplateName = next.name || 'Untitled Template';
      view.dispatch({
        effects: documentTemplateCompartment.reconfigure(
          createDocumentTemplateExtension(next)
        ),
      });
      return this.getDocumentTemplate();
    },

    getDocumentTemplate() {
      return cloneDocumentTemplate(this._documentTemplate || initialDocumentTemplate);
    },

    getDocumentTemplateName() {
      return this._documentTemplateName || this._documentTemplate?.name || initialDocumentTemplate.name;
    },

    getDocumentTemplatePresets() {
      return documentTemplatePresets.map(cloneDocumentTemplate);
    },

    compileDocumentTemplate(template = null) {
      return compileDocumentTemplateCSS(template || this.getDocumentTemplate());
    },

    serializeDocumentTemplate(template = null, scope = '.markdown-body') {
      return serializeDocumentTemplateToCss(template || this.getDocumentTemplate(), scope);
    },

    /**
     * Serialize the current document template to Pandoc YAML metadata.
     * @param {object} [template]
     * @returns {string} YAML string
     */
    serializeDocumentTemplatePandoc(template = null) {
      return serializeDocumentTemplateToPandocYaml(template || this.getDocumentTemplate());
    },

    /**
     * Serialize the current document template to a LaTeX preamble.
     * @param {object} [template]
     * @returns {string} LaTeX commands
     */
    serializeDocumentTemplateLatex(template = null) {
      return serializeDocumentTemplateToLatexPreamble(template || this.getDocumentTemplate());
    },

    /**
     * Serialize the current document template to a standalone HTML wrapper.
     * @param {object} [template]
     * @param {object} [options]
     * @returns {string} HTML document string
     */
    serializeDocumentTemplateHtml(template = null, options = {}) {
      return serializeDocumentTemplateToHtml(template || this.getDocumentTemplate(), options);
    },

    /**
     * Get a Word style mapping for the current document template.
     * @param {object} [template]
     * @returns {object}
     */
    getDocumentTemplateWordStyleMap(template = null) {
      return serializeDocumentTemplateToWordStyleMap(template || this.getDocumentTemplate());
    },

    /**
     * Generate a recommended Pandoc command for the current document template.
     * @param {object} options - { format, input, output, referenceDoc, preambleFile }
     * @returns {string}
     */
    buildPandocCommand(options = {}) {
      return buildPandocCommand(this.getDocumentTemplate(), options);
    },

    bindDocumentTemplate(name) {
      const result = updateFrontmatterField(this.getContent(), 'template', name);
      if (!result) return false;
      view.dispatch({
        changes: result.changes,
        userEvent: 'input.document-template-binding',
      });
      return true;
    },

    /**
     * Update section controls configuration.
     * @param {{enabled?: boolean, showAi?: boolean, showFormatting?: boolean, mode?: 'full' | 'dots-hover' | 'dots-click'}} updates
     */
    setSectionControls(updates = {}) {
      this.config.sectionControls = {
        ...this.config.sectionControls,
        ...updates,
      };
    },

    /**
     * Get current section controls configuration.
     * @returns {{enabled: boolean, showAi: boolean, showFormatting: boolean, mode: string}}
     */
    getSectionControls() {
      return { ...(this.config.sectionControls || {}) };
    },

    // ===========================================================================
    // Source Mode, WYSIWYG Mode & Invisible Characters
    // ===========================================================================

    /** @private */
    _sourceMode: false,
    /** @private */
    _wysiwygMode: false,
    /** @private */
    _showInvisibles: false,
    /** @private */
    _documentTemplate: cloneDocumentTemplate(initialDocumentTemplate),
    /** @private */
    _documentTemplateName: initialDocumentTemplate.name || 'Default',

    /**
     * Toggle source mode (show all raw markdown syntax).
     * Mutually exclusive with WYSIWYG mode.
     *
     * @param {boolean} [value] - true=on, false=off. Omit to toggle.
     * @returns {boolean} The new state
     */
    setSourceMode(value) {
      const newValue = value !== undefined ? !!value : !this._sourceMode;
      this._sourceMode = newValue;
      if (newValue) this._wysiwygMode = false;
      view.dispatch({
        effects: [
          sourceModeCompartment.reconfigure(sourceModeFacet.of(newValue)),
          wysiwygModeCompartment.reconfigure(wysiwygModeFacet.of(false)),
        ],
      });
      return newValue;
    },

    /**
     * Get current source mode state.
     * @returns {boolean}
     */
    getSourceMode() {
      return this._sourceMode;
    },

    /**
     * Toggle WYSIWYG mode (fully rendered, syntax-protected editing).
     * Mutually exclusive with source mode.
     *
     * @param {boolean} [value] - true=on, false=off. Omit to toggle.
     * @returns {boolean} The new state
     */
    setWysiwygMode(value) {
      const newValue = value !== undefined ? !!value : !this._wysiwygMode;
      this._wysiwygMode = newValue;
      if (newValue) this._sourceMode = false;
      view.dispatch({
        effects: [
          wysiwygModeCompartment.reconfigure(wysiwygModeFacet.of(newValue)),
          sourceModeCompartment.reconfigure(sourceModeFacet.of(false)),
        ],
      });
      return newValue;
    },

    /**
     * Get current WYSIWYG mode state.
     * @returns {boolean}
     */
    getWysiwygMode() {
      return this._wysiwygMode;
    },

    /**
     * Toggle invisible characters (spaces, tabs, newlines).
     * When enabled, spaces are shown as dots, tabs as arrows, and
     * newlines as ¶ symbols.
     *
     * @param {boolean} [value] - true=on, false=off. Omit to toggle.
     * @returns {boolean} The new state
     */
    setShowInvisibles(value) {
      const newValue = value !== undefined ? !!value : !this._showInvisibles;
      this._showInvisibles = newValue;
      view.dispatch({
        effects: invisiblesCompartment.reconfigure(
          newValue ? createInvisiblesExtension() : []
        ),
      });
      return newValue;
    },

    /**
     * Get current invisible characters state.
     * @returns {boolean}
     */
    getShowInvisibles() {
      return this._showInvisibles;
    },

    // ===========================================================================
    // Wiki-link completion
    // ===========================================================================

    /**
     * Set project files for [[wiki-link]] autocomplete.
     *
     * Call this when opening a project or when files change.
     * The files array should contain objects with { path, title, name }.
     *
     * @param {Array<{path: string, title: string, name: string}>} files - Project files
     *
     * @example
     * // Set files from FSML-parsed project
     * editor.setProjectFiles(
     *   project.files.map(path => FSML.parsePath(path))
     * );
     *
     * @example
     * // Clear files (disables wiki-link completion)
     * editor.setProjectFiles([]);
     */
    setProjectFiles(files) {
      view.dispatch({
        effects: projectFilesCompartment.reconfigure(
          projectFilesFacet.of(files || [])
        ),
      });
    },

    /**
     * Get current project files.
     * @returns {Array<{path: string, title: string, name: string}>}
     */
    getProjectFiles() {
      return view.state.facet(projectFilesFacet);
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
     * Register a runtime.
     *
     * If the runtime is an MRPClient, automatically registers it as an LSP
     * provider for hover, completions, and variable inspection.
     *
     * @param {string} name - Runtime name (e.g., 'python', 'julia')
     * @param {Object} runtime - Runtime instance (MRPClient or custom)
     */
    registerRuntime(name, runtime) {
      registry.register(name, runtime);

      // Auto-register LSP provider for MRPClient instances
      if (runtime instanceof MRPClient) {
        const provider = adaptMRPClient(runtime, [name.toLowerCase()]);
        runtimeLspProviders.set(name, provider);
        addLspExtensions();  // Ensure extensions exist (idempotent)
      }
    },

    /**
     * Unregister a runtime.
     * Call this when a runtime is stopped/killed to prevent stale client usage.
     *
     * @param {string} name - Runtime name (e.g., 'python', 'julia')
     */
    unregisterRuntime(name) {
      registry.unregister(name);

      // Also remove LSP provider if present
      if (runtimeLspProviders.has(name)) {
        runtimeLspProviders.delete(name);
      }

      console.log(`[editor] Unregistered runtime: ${name}`);
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
     * Get source code for symbol at cursor position, without emitting UI callbacks.
     * Calls inspect with detail=2 to get full source code.
     *
     * @param {number} [pos] - Position (defaults to cursor)
     * @returns {Promise<{found: boolean, name?: string, sourceCode?: string, file?: string, ...}|null>}
     */
    async getSourceInfo(pos) {
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
      return provider.inspect(cell.code, offset, cell.language, { detail: 2 });
    },

    /**
     * View source code for symbol at cursor position.
     * Calls inspect with detail=2 to get full source code.
     * Triggers registered onViewSource callbacks.
     *
     * @param {number} [pos] - Position (defaults to cursor)
     * @returns {Promise<{found: boolean, name?: string, sourceCode?: string, file?: string, ...}|null>}
     */
    async viewSource(pos) {
      const result = await this.getSourceInfo(pos);

      // Trigger callbacks if we got a result
      if (result && result.found) {
        viewSourceHandlers.forEach(handler => {
          try {
            handler(result);
          } catch (e) {
            console.error('[viewSource] Handler error:', e);
          }
        });
      }

      return result;
    },

    /**
     * View source for a specific symbol by name.
     * Useful for drilling into types from source code.
     *
     * @param {string} symbol - Full symbol path (e.g., 'dspy.LM', 'BaseLM')
     * @param {string} [language='python'] - Language/runtime to query
     * @returns {Promise<{found: boolean, name?: string, sourceCode?: string, file?: string, ...}|null>}
     */
    async viewSourceByName(symbol, language = 'python') {
      const provider = runtimeLspProviders.get(language) ||
        Array.from(runtimeLspProviders.values()).find(p =>
          p.languages.includes(language.toLowerCase())
        );

      if (!provider) return null;

      // Inspect at the end of the symbol name
      const result = await provider.inspect(symbol, symbol.length, language, { detail: 2 });

      // Trigger callbacks if we got a result
      if (result && result.found) {
        viewSourceHandlers.forEach(handler => {
          try {
            handler(result);
          } catch (e) {
            console.error('[viewSource] Handler error:', e);
          }
        });
      }

      return result;
    },

    /**
     * Register callback for viewSource events.
     * Called when user triggers "view source" (F12, Cmd+Click).
     *
     * @param {function} callback - Called with inspect result {found, name, sourceCode, file, ...}
     * @returns {function} Unsubscribe function
     */
    onViewSource(callback) {
      viewSourceHandlers.push(callback);
      return () => {
        const idx = viewSourceHandlers.indexOf(callback);
        if (idx >= 0) viewSourceHandlers.splice(idx, 1);
      };
    },

    /**
     * Refresh variables from all MRP runtimes
     * Fetches current variable state and updates state.variables
     *
     * @returns {Promise<void>}
     */
    async refreshVariables() {
      for (const [name, runtime] of registry.runtimes) {
        // Check if runtime is an MRP client (has getVariables method)
        if (typeof runtime.getVariables === 'function') {
          try {
            const result = await runtime.getVariables();
            if (result && result.variables) {
              const session = 'default';
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

    onFrontmatterTitleCommit(callback) {
      frontmatterTitleCommitHandlers.push(callback);
      return () => {
        const idx = frontmatterTitleCommitHandlers.indexOf(callback);
        if (idx >= 0) frontmatterTitleCommitHandlers.splice(idx, 1);
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
      if (this.linkedTables?.destroy) {
        this.linkedTables.destroy();
      }
      if (cellControls) {
        cellControls.destroy();
      }
      if (awarenessSystem) {
        awarenessSystem.destroy();
      }
      if (jsRuntime && jsRuntime.destroy) {
        jsRuntime.destroy();
      }
      // Clean up WebSocket provider (if using createDrive API)
      // This prevents reconnection loops after editor destruction
      if (this.provider) {
        try {
          this.provider.disconnect();
          this.provider.destroy();
        } catch (e) {
          console.warn('[mrmd] Error cleaning up WebSocket provider:', e);
        }
        this.provider = null;
      }
      // Clean up theme watcher
      unwatchTheme();
      element.removeEventListener('mrmd:frontmatter-title-commit', handleFrontmatterTitleCommit);
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

  // Create linked-table action/job controller
  api.linkedTables = createLinkedTableController({
    editor: api,
    projectRoot: linkedTableHostContext.projectRoot,
    documentPath: linkedTableHostContext.documentPath,
  });

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

  // Initialize section controls now that API exists
  const applySectionControlsConfig = () => {
    const options = reactiveConfig.sectionControls || {};
    const extension = options.enabled === false ? [] : sectionControls(api, options);
    view.dispatch({
      effects: sectionControlsCompartment.reconfigure(extension),
    });
  };
  applySectionControlsConfig();

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
    config: reactiveConfig,  // Pass config for reading current values in handlers
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
  reactiveConfig._subscribe((event) => {
    if (event.path[0] === 'sectionControls') {
      applySectionControlsConfig();
    }
  });

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

    if (update.docChanged || update.selectionSet) {
      const payload = {
        selection: update.state.selection.main,
        block: getCurrentBlockTypeInfo(update.view),
        formatting: getSelectionFormattingInfo(update.view),
      };
      selectionHandlers.forEach(fn => {
        try {
          fn(payload);
        } catch (err) {
          console.warn('[mrmd] selection change handler failed:', err);
        }
      });
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

// #region RUNTIME
/**
 * Create an editor runtime attachment via orchestrator.
 *
 * This is the simplest way to use mrmd with full features:
 * - Automatically creates/attaches runtime with orchestrator
 * - Connects to sync server
 * - Sets up Python runtime (shared or dedicated)
 * - Enables monitor mode for long-running executions
 *
 * @param {string} orchestratorUrl - Orchestrator URL (e.g., 'http://localhost:8080')
 * @param {string|HTMLElement} target - CSS selector or element
 * @param {Object} options - Session options
 * @param {string} options.doc - Document name (required)
 * @param {string} [options.python='shared'] - 'shared' or 'dedicated'
 * @param {Object} [options.editor] - Additional editor options
 * @returns {Promise<Object>} Editor instance with destroyRuntime() method
 *
 * @example
 * // Basic usage
 * const editor = await mrmd.runtime('http://localhost:8080', '#editor', {
 *   doc: 'my-notebook',
 * });
 *
 * // With dedicated Python runtime
 * const editor = await mrmd.runtime('http://localhost:8080', '#editor', {
 *   doc: 'my-notebook',
 *   python: 'dedicated',
 * });
 *
 * // Clean up when done
 * await editor.destroyRuntime();
 */
async function runtime(orchestratorUrl, target, options = {}) {
  const { doc, python = 'shared', editor: editorOptions = {} } = options;

  if (!doc) {
    throw new Error('mrmd.runtime: doc option is required');
  }

  // Normalize orchestrator URL
  let baseUrl = orchestratorUrl;
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  // Create runtime attachment with orchestrator
  console.log(`[mrmd.runtime] Creating runtime for '${doc}' (python=${python})`);

  // Prefer /api/runtimes, fall back to /api/sessions for legacy orchestrators
  let response = await fetch(`${baseUrl}/api/runtimes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc, python }),
  });

  if (!response.ok && response.status === 404) {
    response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc, python }),
    });
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create runtime attachment: ${error}`);
  }

  const sessionInfo = await response.json();
  console.log('[mrmd.runtime] Runtime created:', sessionInfo);

  // Extract URLs from response
  const syncUrl = sessionInfo.sync;
  const runtimeUrl = sessionInfo.runtimes?.python?.url;

  if (!syncUrl) {
    throw new Error('Session response missing sync URL');
  }

  // Connect to sync server
  const docs = drive(syncUrl);

  // Open document
  const editor = await docs.open(doc, target, {
    ...editorOptions,
  });

  // Connect Python runtime if available
  if (runtimeUrl) {
    editor.connectRuntime('python', runtimeUrl);

    // Enable monitor mode
    editor.execution.enableMonitorMode({
      ydoc: editor.ydoc,
      runtimeUrl,
      awareness: editor.awareness,
    });
  }

  // Store runtime info on editor
  editor._sessionInfo = sessionInfo;
  editor._orchestratorUrl = baseUrl;

  // Add destroyRuntime method
  editor.destroyRuntime = async function() {
    console.log(`[mrmd.runtime] Destroying runtime for '${doc}'`);

    // Disconnect from sync
    if (editor.disconnect) {
      editor.disconnect();
    }

    // Call orchestrator to clean up
    try {
      let resp = await fetch(`${baseUrl}/api/runtimes/${encodeURIComponent(doc)}`, {
        method: 'DELETE',
      });
      if (!resp.ok && resp.status === 404) {
        resp = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(doc)}`, {
          method: 'DELETE',
        });
      }
      if (!resp.ok) {
        console.warn(`[mrmd.runtime] Failed to destroy runtime: ${resp.statusText}`);
      }
    } catch (err) {
      console.warn(`[mrmd.runtime] Failed to destroy runtime:`, err);
    }

    // Destroy editor
    editor.destroy();
  };

  // Add method to get runtime info
  editor.getRuntimeInfo = function() {
    return this._sessionInfo;
  };

  return editor;
}
// #endregion RUNTIME

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
  // Theme generation (replaces oneDark)
  createCodemirrorTheme,
  javascript,
  python,
  markdown,
};
// #endregion EXPOSED_LIBS

// #region TERMINAL_EXPORTS
const terminal = {
  // Terminal buffer (ANSI processing for output blocks)
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
  // Terminal portal (```term blocks with xterm.js)
  TermBlock,
  termBlockRegistry,
  TermBlockRegistry,
  PtyClient,
  createPtyClient,
  listTerminalSessions,
  createTerminalSession,
  terminalWidget,
  terminalKeymap,
  launchTerminal,
  closeTerminal,
  isTerminalVisible,
  terminalOverlay,
  injectTermWidgetStyles,
  termOverlayStyles,
  findTerminalBlocks,
  isTerminalLanguage,
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

// #region MARKDOWN_EXPORTS
const markdownExports = {
  // Main extension
  markdown: markdownRendering,
  markdownRenderer,

  // Asset resolver facet (for Electron/desktop apps)
  assetResolverFacet,

  // Mode facets
  sourceModeFacet,
  wysiwygModeFacet,
  createInlineEditingExtensions,
  createWysiwygExtensions,
  toggleInlineFormat,
  toggleInlineMark,
  getSelectionFormattingState,
  findFencedCodeAt,

  // Styles
  markdownStyles,
  injectMarkdownStyles,

  // Widgets
  TaskCheckboxWidget,
  ImageWidget,
  ImagePlaceholder,
  parseImageMarkdown,
  TableWidget,
  parseTable,
  isTableLine,
  isTableDelimiter,
  generateTableId,
  AlertTitleWidget,

  // Page view pagination
  pageViewPagination,
};

const documentTemplateExports = {
  defaultDocumentTemplate,
  documentTemplatePresets,
  normalizeDocumentTemplate,
  cloneDocumentTemplate,
  createDocumentTemplateExtension,
  compileDocumentTemplateCSS,
  serializeDocumentTemplateToCss,
  findDocumentTemplatePreset,
  // Multi-format export
  resolveFontForExport,
  serializeDocumentTemplateToPandocMeta,
  serializeDocumentTemplateToPandocYaml,
  serializeDocumentTemplateToLatexPreamble,
  serializeDocumentTemplateToHtml,
  serializeDocumentTemplateToWordStyleMap,
  buildPandocCommand,
};
// #endregion MARKDOWN_EXPORTS

// #region WIKI_LINK_EXPORTS
const wikiLinkExports = {
  // Facet for providing project files
  projectFilesFacet,
  // Completion source and extension
  createWikiLinkCompletionSource,
  createWikiLinkCompletionExtension,
  getWikiLinkCompletionSource,
  // Styles
  injectWikiLinkCompletionStyles,
};
// #endregion WIKI_LINK_EXPORTS

// #region EXPORTS
const mrmd = {
  version: VERSION,
  create,
  drive,
  runtime,
  findInitialCursorPosition,
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
  // Wiki-link completion ([[internal-links]])
  wikiLink: wikiLinkExports,
  // Linked tables
  linkedTables,
  // Markdown rendering (blur→render, focus→source)
  markdown: markdownExports,
  // Frontmatter utilities
  frontmatter: {
    parseFrontmatter,
    readFrontmatterValue,
    updateFrontmatterField,
  },
  // Document templates (semantic content styling)
  documentTemplates: documentTemplateExports,
  // Shell (status bar, file management, studio layout)
  shell: shellModule,
  // AI Integration (decorations, state, widgets)
  ai: aiIntegrationModule,
  // Ctrl-K Modal (cursor-positioned AI command input)
  ctrlK: ctrlKModalModule,
  // Comment Syntax (<!--! !--> markers with AI integration)
  commentSyntax: commentSyntaxModule,
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
  // Direct shell exports for convenience
  createStudio: shellModule.createStudio,
  OrchestratorClient: shellModule.OrchestratorClient,
  Drive: shellModule.Drive,
};

export default mrmd;
export {
  create,
  drive,
  runtime,
  findInitialCursorPosition,
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
  // Terminal portal exports (```term blocks)
  TermBlock,
  termBlockRegistry,
  TermBlockRegistry,
  PtyClient,
  createPtyClient,
  listTerminalSessions,
  createTerminalSession,
  terminalWidget,
  terminalKeymap,
  launchTerminal,
  closeTerminal,
  isTerminalVisible,
  terminalOverlay,
  injectTermWidgetStyles,
  termOverlayStyles,
  findTerminalBlocks,
  isTerminalLanguage,
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
  // Linked table exports
  linkedTables as linkedTablesModule,
  LINKED_TABLE_EVENT,
  dispatchLinkedTableAction,
  openLinkedTableWorkspace,
  canImportLinkedTableFromHost,
  normalizeLinkedTableBlockInsertion,
  insertLinkedTableBlock,
  importLinkedTableFromHost,
  TableJobsClient,
  TABLE_JOB_STATUS,
  createTableJobsClient,
  LinkedTableController,
  createLinkedTableController,
  createLinkedTableBlockAnchor,
  resolveLinkedTableBlockAnchor,
  // Markdown rendering exports
  markdownExports,
  markdownRendering as markdown,
  markdownRenderer,
  assetResolverFacet,
  markdownStyles,
  injectMarkdownStyles,
  TaskCheckboxWidget,
  ImageWidget,
  ImagePlaceholder,
  parseImageMarkdown,
  TableWidget,
  parseTable,
  isTableLine,
  isTableDelimiter,
  generateTableId,
  AlertTitleWidget,
  // Document template exports
  documentTemplateExports,
  defaultDocumentTemplate,
  documentTemplatePresets,
  normalizeDocumentTemplate,
  cloneDocumentTemplate,
  createDocumentTemplateExtension,
  compileDocumentTemplateCSS,
  serializeDocumentTemplateToCss,
  findDocumentTemplatePreset,
  resolveFontForExport,
  serializeDocumentTemplateToPandocMeta,
  serializeDocumentTemplateToPandocYaml,
  serializeDocumentTemplateToLatexPreamble,
  serializeDocumentTemplateToHtml,
  serializeDocumentTemplateToWordStyleMap,
  buildPandocCommand,
  // Spellcheck exports
  createSpellcheckExtensions,
  // Grammar exports
  createLanguageToolDiagnosticsExtension,
  collectVisibleProseFragments,
  forceLanguageToolRefresh,
  refreshLanguageToolDiagnostics,
  applyFirstLanguageToolSuggestion,
  getLanguageToolSuggestionMenu,
  applyLanguageToolSuggestionAt,
  // Wiki-link completion exports
  wikiLinkExports,
  projectFilesFacet,
  createWikiLinkCompletionSource,
  createWikiLinkCompletionExtension,
  getWikiLinkCompletionSource,
  injectWikiLinkCompletionStyles,
  // Shell module exports
  shellModule as shell,
};

// Re-export shell components for direct imports
export const { createStudio, OrchestratorClient, Drive, createDrive, ShellStateManager, injectShellStyles } = shellModule;

// Document language detection and frontmatter updater
export { getDocumentLanguages, getLanguageDisplay, isExecutableLanguage } from './document-languages.js';
export { parseFrontmatter, readFrontmatterSession, getEffectiveSessionConfig, readFrontmatterValue, updateFrontmatterField } from './frontmatter-updater.js';
// #endregion EXPORTS
