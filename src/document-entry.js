/**
 * mrmd-document — the light document editor bundle.
 *
 * Purpose: host applications (for example aiconvo) that need MRMD's
 * markdown writing experience without the full platform. This entry
 * includes the editor, markdown rendering, core widgets, and themes.
 *
 * It excludes: runtimes, terminals, linked tables, AI panels, MRP clients,
 * and document templates. Since 0.12.0 it carries the collaboration
 * primitives (Yjs, awareness, the y-websocket provider and the CodeMirror
 * binding) under `collab`, and both editors accept `extensions`, so a host
 * can make any editor shared. Since 0.13.0 the document editor draws
 * diagram fences through a host-supplied renderer (`diagrams`): the bundle
 * frames the drawing and owns the blur→render rule; the host owns the
 * library. Since 0.14.0 `showCellRun(cell)` shows a running cell's live
 * output and answers its input prompts in a panel under the cell that is
 * not document text (see document-cell-run.js). Since 0.15.0 runnable cells
 * carry a Run button and show their run state (queued, running with elapsed
 * time, waiting for input, last verdict) — document-cell-controls.js.
 * Since 0.17.0 AI commands (`ai`): a command box at the cursor (Mod-j) and
 * the answer as a suggestion beside the text until accepted; the host
 * lends the model — document-ai.js. Since 0.18.0 they can be found without
 * knowing a key: a ✦ in the margin beside the cursor's line opens the box
 * and shows what AI is doing there, buttons show their keys, and
 * `keyHelp()` tells the host which keys act here, now (`formatKey` spells
 * them). Since 0.19.0 both editors review proposed changes in the text
 * (`editor.review`, document-review.js): old lines struck through, the
 * new ones rendered and editable, Accept / Reject on each; AI commands can
 * answer that way (`ai.mode`), and every command reports its outcome.
 *
 * Build: npm run build:document
 * Output: dist/mrmd-document.iife.min.js (global: mrmdDocument)
 */

import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { keymap, placeholder, layer, RectangleMarker } from '@codemirror/view';
import { cellRunExtension, showCellRun } from './document-cell-run.js';
import { cellControls, setCellStatus, clearCellStatuses, CELL_KEYS } from './document-cell-controls.js';
import { isOutputFence, isOwnedImageLine, formatResult } from './rat-notebook.js';
import * as ratNotebook from './rat-notebook.js';
import { createNotebookRunner } from './notebook-runner.js';
import { aiConfig, documentAi, aiControllerOf, aiEditAnnotation, aiKeyHelp } from './document-ai.js';
import { documentReview, captureChanges, proposeChange, minimalChanges, acceptAll, rejectAll, reviewSummary, reviewKeyHelp, goToFirstChange } from './document-review.js';
import { goToNextChunk, goToPreviousChunk } from '@codemirror/merge';
import { formatKey } from './key-names.js';
import { StreamLanguage, syntaxTree } from '@codemirror/language';
import { markdown as markdownLang, markdownLanguage } from '@codemirror/lang-markdown';

// A focused language set for prose-first documents: web, data science, shell.
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { r } from 'codemirror-lang-r';
import { shell } from '@codemirror/legacy-modes/mode/shell';
// Whole-file code editing (aiconvo files mode): the compiled languages
// too, plus a few legacy modes for config files.
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { xml } from '@codemirror/lang-xml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { indentUnit } from '@codemirror/language';

// MRMD's markdown rendering: blur→render / focus→source, tables, math,
// images, checkboxes, alerts — the document experience.
import {
  markdown as markdownRendering,
  assetResolverFacet,
  sourceModeFacet,
  diagramsFacet,
  diagramsConfig,
  refreshDiagramsEffect,
  clearDiagramCache,
} from './markdown/index.js';

// MRMD themes (tokens + CodeMirror theme builder).
import { getTheme, getThemeNames, getDefaultTokens } from './widgets/theme.js';
import { createCodemirrorTheme } from './widgets/codemirror-theme.js';
import { documentHostServices } from './document-host-services.js';

// Collaboration primitives for hosts: the CRDT, awareness (cursors, names),
// the y-websocket provider and the CodeMirror binding. Exported, not wired:
// the host owns the document identity, the endpoint and who is who.
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
export const collab = { Y, Awareness, WebsocketProvider, yCollab, yUndoManagerKeymap };

const jsSupport = javascript();
const pySupport = python();
const htmlSupport = html();
const cssSupport = css();
const jsonSupport = json();
const sqlSupport = sql();
const yamlSupport = yaml();
const rSupport = r();
const shellLang = StreamLanguage.define(shell);

function codeBlockLanguage(info) {
  const lang = String(info || '').trim().toLowerCase().split(/[\s{]/)[0].replace(/[^a-z0-9+#-]/g, '');
  switch (lang) {
    case 'javascript': case 'js': case 'node': case 'jsx': case 'typescript': case 'ts': case 'tsx':
      return jsSupport.language;
    case 'python': case 'py': case 'python3':
      return pySupport.language;
    case 'html': case 'htm': return htmlSupport.language;
    case 'css': return cssSupport.language;
    case 'json': case 'jsonc': return jsonSupport.language;
    case 'sql': case 'sqlite': case 'postgres': case 'postgresql': case 'mysql': return sqlSupport.language;
    case 'yaml': case 'yml': return yamlSupport.language;
    case 'r': case 'rlang': return rSupport.language;
    case 'shell': case 'sh': case 'bash': case 'zsh': case 'fish': case 'console': return shellLang;
    default: return null;
  }
}

let rustSupport = null, goSupport = null, cppSupport = null, javaSupport = null, xmlSupport = null;
const legacy = new Map();
function legacyLang(name, mode) {
  if (!legacy.has(name)) legacy.set(name, StreamLanguage.define(mode));
  return legacy.get(name);
}

/**
 * Language support for a whole file, by name. Returns a CM extension
 * (LanguageSupport or StreamLanguage) or null for plain text.
 */
export function fileLanguage(filename) {
  const name = String(filename || '').split('/').pop().toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : name;
  switch (ext) {
    case 'js': case 'mjs': case 'cjs': case 'jsx': case 'ts': case 'tsx': case 'mts': case 'cts':
      return javascript({ jsx: ext.endsWith('x'), typescript: ext.startsWith('t') || ext === 'mts' || ext === 'cts' });
    case 'py': case 'pyi': return pySupport;
    case 'html': case 'htm': case 'vue': case 'svelte': return htmlSupport;
    case 'css': case 'scss': case 'less': return cssSupport;
    case 'json': case 'jsonc': case 'webmanifest': return jsonSupport;
    case 'sql': return sqlSupport;
    case 'yaml': case 'yml': return yamlSupport;
    case 'r': case 'rmd': return rSupport;
    case 'sh': case 'bash': case 'zsh': case 'fish': case 'bashrc': case 'zshrc': case 'profile': return shellLang;
    case 'rs': return rustSupport || (rustSupport = rust());
    case 'go': return goSupport || (goSupport = go());
    case 'c': case 'h': case 'cc': case 'cpp': case 'cxx': case 'hpp': case 'hh': return cppSupport || (cppSupport = cpp());
    case 'java': case 'kt': case 'kts': return javaSupport || (javaSupport = java());
    case 'xml': case 'svg': case 'plist': case 'xsl': return xmlSupport || (xmlSupport = xml());
    case 'toml': return legacyLang('toml', toml);
    case 'lua': return legacyLang('lua', lua);
    case 'rb': case 'gemfile': case 'rakefile': return legacyLang('ruby', ruby);
    case 'dockerfile': return legacyLang('dockerfile', dockerFile);
    case 'diff': case 'patch': return legacyLang('diff', diffMode);
    case 'md': case 'markdown': case 'qmd': case 'mdx':
      return markdownLang({ base: markdownLanguage, codeLanguages: codeBlockLanguage });
    default:
      if (name === 'dockerfile' || name === 'containerfile') return legacyLang('dockerfile', dockerFile);
      if (name === 'makefile') return null;
      return null;
  }
}

/**
 * Selection overlay — a layer ABOVE the content (like the cursor layer).
 *
 * Why: CodeMirror's drawSelection paints BELOW the text lines. Any line
 * fill (code-block grounds, alert tints) sits on top of it and mutes the
 * selection. This overlay draws the same rectangles above everything with
 * a translucent color, so the selection reads at full strength on every
 * surface. Layers ignore pointer events — clicks are unaffected.
 *
 * Color: --mrmd-selection-overlay (hosts set it; sensible fallback).
 */
const selectionOverlay = layer({
  above: true,
  class: 'mrmd-selection-overlay-layer',
  markers(view) {
    return view.state.selection.ranges
      .map(r => (r.empty ? [] : RectangleMarker.forRange(view, 'mrmd-selection-overlay', r)))
      .reduce((a, b) => a.concat(b), []);
  },
  update(update) {
    return update.docChanged || update.selectionSet || update.viewportChanged;
  },
});

/**
 * The fenced code block containing `pos`, or null.
 * Returns { lang, code, from, to } — code excludes the fence lines.
 */
function codeBlockAt(state, pos) {
  let found = null;
  syntaxTree(state).iterate({
    from: pos, to: pos,
    enter(node) {
      if (node.name === 'FencedCode') { found = { from: node.from, to: node.to }; return false; }
    },
  });
  if (!found) return null;
  const doc = state.doc;
  const firstLine = doc.lineAt(found.from);
  const lastLine = doc.lineAt(found.to);
  const lang = (firstLine.text.match(/^\s*(?:`{3,}|~{3,})\s*(\S*)/) || [])[1] || '';
  const hasClosingFence = lastLine.number > firstLine.number && /^\s*(?:`{3,}|~{3,})\s*$/.test(lastLine.text);
  const codeFrom = Math.min(firstLine.to + 1, doc.length);
  const codeTo = hasClosingFence ? Math.max(codeFrom, lastLine.from - 1) : found.to;
  return { lang, code: doc.sliceString(codeFrom, codeTo), from: found.from, to: found.to };
}

/** Which fence languages get a Run button (see createDocumentEditor). */
function runnableLanguage(option, diagrams) {
  if (typeof option === 'function') return lang => !!option(lang);
  if (Array.isArray(option)) {
    const allowed = new Set(option.map(l => String(l).toLowerCase()));
    return lang => allowed.has(lang);
  }
  const drawn = new Set((diagrams && diagrams.languages) || []);
  return lang => !!lang && lang !== 'output' && !lang.startsWith('output:') && !drawn.has(lang);
}

/**
 * All fenced code cells in document order, excluding output blocks.
 * Each: { lang, code, from, to } — same shape as codeBlockAt.
 */
function listCodeCells(state) {
  const cells = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const cell = codeBlockAt(state, node.from);
      if (cell && cell.lang && !isOutputFence('```' + cell.lang)) cells.push(cell);
      return false;
    },
  });
  return cells;
}

/**
 * The result OWNED by the cell ending at `cellTo`: {from, to}, or null.
 *
 * Ownership rule: a result is an output block (```output in any of its
 * spellings — output:<execId>, output | status) and/or the plot images a
 * run made (rat-notebook's isOwnedImageLine), each separated from the cell
 * and from each other by nothing but blank lines. Anything else in
 * between — prose, another cell, a person's own image — ends the result,
 * and a rerun never touches what follows.
 */
function ownedOutputBlock(state, cellTo) {
  const doc = state.doc;
  let n = doc.lineAt(cellTo).number + 1;
  const nextContent = from => { let i = from; while (i <= doc.lines && !doc.line(i).text.trim()) i++; return i; };
  let from = null, to = null;
  n = nextContent(n);
  if (n <= doc.lines && isOutputFence(doc.line(n).text)) {
    const open = doc.line(n);
    let block = null;
    syntaxTree(state).iterate({
      from: open.from, to: open.from + 1,
      enter(node) {
        if (node.name === 'FencedCode' && doc.lineAt(node.from).number === open.number) {
          block = { from: node.from, to: node.to };
          return false;
        }
      },
    });
    if (!block) return null;
    from = block.from; to = block.to;
    n = doc.lineAt(block.to).number + 1;
  }
  for (;;) {
    const i = nextContent(n);
    if (i > doc.lines || !isOwnedImageLine(doc.line(i).text)) break;
    const line = doc.line(i);
    if (from === null) from = line.from;
    to = line.to;
    n = i + 1;
  }
  return from === null ? null : { from, to };
}

/**
 * Replace, insert, or remove the result under one cell: the output block
 * for `outputText` and the images (each {src, alt}) after it, in the
 * format of rat-notebook's formatResult. Returns the change spec (the host
 * dispatches through the view, so undo, autosave and collaboration all
 * see one ordinary edit), or null when the document no longer contains
 * the cell as given (stale-run guard).
 */
function cellOutputChange(state, cell, outputText, images = []) {
  // Stale guard: the cell must still sit at [from,to) with the same code.
  const current = codeBlockAt(state, Math.min(cell.from, state.doc.length));
  if (!current || current.from !== cell.from || current.code !== cell.code) return null;
  const result = formatResult(outputText, images);
  const owned = ownedOutputBlock(state, current.to);
  if (!result) {
    if (!owned) return { changes: [] };        // nothing to write, nothing owned
    // The gap and the result go; what followed the result stays.
    return { changes: [{ from: current.to, to: owned.to }] };
  }
  if (owned) return { changes: [{ from: owned.from, to: owned.to, insert: result }] };
  return { changes: [{ from: current.to, insert: '\n\n' + result }] };
}

/**
 * Apply an MRMD theme's tokens as inline custom properties on one element.
 * Inline application keeps the host page's own theme system untouched.
 */
function applyThemeTokens(element, theme) {
  const tokens = getDefaultTokens();
  for (const [key, value] of Object.entries(theme)) {
    if (key.startsWith('--')) tokens[key] = value;
  }
  for (const [key, value] of Object.entries(tokens)) {
    element.style.setProperty(key, value);
  }
}

function resolveTheme(name, dark) {
  // A host can pass a full theme object (for example, one built from its
  // own design tokens — values may be CSS var() references). Unset tokens
  // fall back to the matching plain-* baseline.
  if (name && typeof name === 'object') {
    const base = getTheme(name.isDark === false ? 'plain-light' : 'plain-dark');
    return { ...base, ...name, name: name.name || 'hosted' };
  }
  const theme = name && getTheme(name);
  if (theme) return theme;
  return getTheme(dark ? 'plain-dark' : 'plain-light');
}

/**
 * Create a document editor.
 *
 * @param {string|HTMLElement} target
 * @param {Object} options
 *   doc            initial markdown text
 *   theme          MRMD theme name, or a theme object with token overrides
 *                  (default: plain-light / plain-dark)
 *   dark           boolean — picks the default theme when `theme` is unset
 *   readonly       boolean
 *   placeholder    empty-state text
 *   sourceMode     boolean — show all raw markdown syntax
 *   assetResolver  (url) => url — resolve relative image paths
 *   diagrams       {languages, render} — draw fenced blocks in the named
 *                  languages (```mermaid …) as figures when the cursor is
 *                  outside them. render(lang, source) resolves with a DOM
 *                  Node (inserted as a clone; the host owns sanitization)
 *                  or rejects to show the source under the error. Results
 *                  are cached by source; refreshDiagrams() redraws.
 *   onChange       () => void — document changed
 *   onSave         () => void — user pressed Mod-S
 *   onRunCell      ({lang, code, from, to}, {advance}) => void — the user
 *                  ran the cell at the cursor: Mod-Enter (advance: false)
 *                  or Shift-Enter (advance: true — notebook habit: run,
 *                  then move on). The host owns execution; it reports the
 *                  result back through setCellOutput. The editor owns the
 *                  markdown mechanics: cells, ownership, replacement.
 *                  With onRunCell, runnable cells also get a Run button on
 *                  their fence row (same call, advance: false), and the
 *                  host draws run state with setCellStatus.
 *   runnableLanguages  string[] | (lang) => boolean — which fence languages
 *                  get a Run button. Default: any named language except
 *                  output and diagram languages.
 *   onCancelCell   (cell, {state}) => void — the Stop button, on a cell that
 *                  is 'queued', 'running' or 'waiting'. Omitted: no Stop
 *                  button.
 *   ai             AI commands: {commands, run, model?, available?,
 *                  beforeAccept?, onAccept?, notify?, escalate?} — see
 *                  document-ai.js. Code cells then also get a ✦ button,
 *                  and a narrow gutter holds the ✦ beside the cursor's
 *                  line (shown even without `lineGutter`).
 *   review         {onResolved(outcome), onChange(summary)} — reviewing
 *                  proposed changes (editor.review, document-review.js)
 * @returns editor API
 */
export function createDocumentEditor(target, options = {}) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (!element) throw new Error('mrmd-document: target element not found');
  element.classList.add('mrmd-root');
  element.dataset.mrmdThemingMode = 'hosted';

  const systemDark = typeof window !== 'undefined'
    && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let themeName = options.theme || null;
  let theme = resolveTheme(themeName, options.dark !== null && options.dark !== undefined ? options.dark : systemDark);
  applyThemeTokens(element, theme);

  const themeCompartment = new Compartment();
  const readonlyCompartment = new Compartment();
  const sourceCompartment = new Compartment();
  const hostServices = documentHostServices({ ...options, lineGutter: !!options.lineGutter });
  const diagrams = diagramsConfig(options.diagrams);
  const ai = aiConfig(options.ai);
  const runsCells = typeof options.onRunCell === 'function';

  // The cell Mod-Enter and Shift-Enter run: the fenced block at the
  // cursor, unless it is empty or a result block. The keys fall through
  // (their default behavior) everywhere else.
  const cellToRun = state => {
    const cell = codeBlockAt(state, state.selection.main.head);
    return cell && cell.code.trim() && !isOutputFence('```' + cell.lang) ? cell : null;
  };

  const documentBase = EditorView.theme({
    '&': { height: '100%', fontSize: '16px' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'Georgia, "Times New Roman", serif',
      lineHeight: '1.6',
    },
    '.cm-content': { padding: '0', maxWidth: 'none' },
    // The host's marker gutter, and the AI spark's (document-ai.js).
    '.cm-gutters': { display: options.lineGutter || ai ? 'flex' : 'none' },
    // CM's gutter base theme forces display:flex !important. Prose keeps only
    // the opt-in host marker gutter, not code-editor line/fold gutters.
    '.cm-gutter.cm-lineNumbers': { display: 'none !important' },
    '.cm-gutter.cm-foldGutter': { display: 'none !important' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
    '.mrmd-selection-overlay': {
      backgroundColor: 'var(--mrmd-selection-overlay, color-mix(in srgb, var(--widget-border-accent, #3b82f6) 30%, transparent))',
    },
  });

  const saveHandlers = [];
  const changeHandlers = [];
  if (typeof options.onSave === 'function') saveHandlers.push(options.onSave);
  if (typeof options.onChange === 'function') changeHandlers.push(options.onChange);

  const extensions = [
    // Highest precedence: Mod-Enter must win over basicSetup's insertBlankLine,
    // but only when the cursor sits in a fenced code block AND the host wired
    // a handler. Otherwise the key falls through to its default behavior.
    runsCells ? Prec.highest(keymap.of([{
      key: CELL_KEYS.run,
      run: (v) => {
        const cell = cellToRun(v.state);
        if (!cell) return false;
        options.onRunCell(cell, { advance: false });
        return true;
      },
    }, {
      key: CELL_KEYS.runAndAdvance,
      run: (v) => {
        const cell = cellToRun(v.state);
        if (!cell) return false;
        options.onRunCell(cell, { advance: true });
        return true;
      },
    }])) : [],
    selectionOverlay,
    basicSetup,
    hostServices.extension,
    cellRunExtension,
    runsCells ? cellControls({
      cellAt: codeBlockAt,
      runnable: runnableLanguage(options.runnableLanguages, diagrams),
      onRun: cell => options.onRunCell(cell, { advance: false }),
      onCancel: typeof options.onCancelCell === 'function' ? (cell, info) => options.onCancelCell(cell, info) : null,
      onAi: ai ? cell => openAiForCell(cell) : null,
    }) : [],
    ai ? documentAi(ai, codeBlockAt) : [],
    documentReview(options.review || {}),
    markdownLang({ base: markdownLanguage, codeLanguages: codeBlockLanguage }),
    EditorView.lineWrapping,
    ...(Array.isArray(options.extensions) ? options.extensions : []),
    documentBase,
    themeCompartment.of(createCodemirrorTheme(theme)),
    readonlyCompartment.of(options.readonly ? EditorState.readOnly.of(true) : []),
    sourceCompartment.of(sourceModeFacet.of(!!options.sourceMode)),
    options.placeholder ? placeholder(options.placeholder) : [],
    typeof options.assetResolver === 'function' ? assetResolverFacet.of(options.assetResolver) : [],
    diagrams ? diagramsFacet.of(diagrams) : [],
    markdownRendering(),
    keymap.of([{
      key: 'Mod-s',
      preventDefault: true,
      run: () => { saveHandlers.forEach(fn => fn()); return true; },
    }]),
    EditorView.updateListener.of(update => {
      if (update.docChanged) changeHandlers.forEach(fn => fn());
    }),
  ];

  const view = new EditorView({
    state: EditorState.create({ doc: options.doc || '', extensions }),
    parent: element,
  });
  hostServices.attach(view);
  if (options.readonly) view.dom.classList.add('mrmd-readonly');

  // The ✦ on a code cell: select the cell's code, then open the command
  // box on it — the selection shows what the commands will act on.
  function openAiForCell(cell) {
    const current = codeBlockAt(view.state, Math.min(cell.from, view.state.doc.length));
    if (!current) return;
    const codeFrom = Math.min(view.state.doc.lineAt(current.from).to + 1, view.state.doc.length);
    view.dispatch({ selection: { anchor: codeFrom, head: codeFrom + current.code.length } });
    view.focus();
    aiControllerOf(view)?.openMenu();
  }

  return {
    view,
    element,
    setLineMarks: hostServices.setLineMarks,
    setLanguageServices: hostServices.setLanguageServices,
    setDiagnostics: hostServices.setDiagnostics,
    openSearch() { return openSearchPanel(view); },

    getContent() { return view.state.doc.toString(); },

    setContent(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(text ?? '') } });
    },

    setTheme(name) {
      theme = resolveTheme(name, systemDark);
      themeName = theme.name;
      applyThemeTokens(element, theme);
      view.dispatch({ effects: themeCompartment.reconfigure(createCodemirrorTheme(theme)) });
      return themeName;
    },

    getThemeName() { return themeName || theme.name; },

    setReadonly(value) {
      view.dispatch({ effects: readonlyCompartment.reconfigure(value ? EditorState.readOnly.of(true) : []) });
      view.dom.classList.toggle('mrmd-readonly', !!value);
    },

    setSourceMode(value) {
      view.dispatch({ effects: sourceCompartment.reconfigure(sourceModeFacet.of(!!value)) });
    },

    /**
     * Draw every diagram again through the host renderer — after the host's
     * theme changed, for instance. Forgets the cached drawings first, so the
     * renderer really runs. Nothing to do when no renderer was configured.
     */
    refreshDiagrams() {
      if (!diagrams) return false;
      clearDiagramCache(diagrams.render);
      view.dispatch({ effects: refreshDiagramsEffect.of(null) });
      return true;
    },

    /** The fenced code block at the cursor: {lang, code, from, to} or null. */
    codeBlockAtCursor() {
      return codeBlockAt(view.state, view.state.selection.main.head);
    },

    /** All runnable code cells (skips ```output blocks), document order. */
    listCells() {
      return listCodeCells(view.state);
    },

    /**
     * Write a cell's execution result into the document, MRMD style:
     * an ```output fence directly under the cell. Replaces only a block
     * the cell owns (whitespace-only gap rule); empty output removes an
     * owned block. One editor transaction — a single undo step.
     * Returns false when the cell moved or changed since the run (the
     * stale guard) — the host should show the result elsewhere then.
     */
    setCellOutput(cell, outputText, { images = [] } = {}) {
      const change = cellOutputChange(view.state, cell, outputText, images);
      if (!change) return false;
      if (change.changes.length) view.dispatch({ ...change, userEvent: 'output.cell' });
      return true;
    },

    /**
     * While the host runs `cell`: a panel under it with the output as it
     * streams (`append`) and a field for the program's input prompts
     * (`ask({prompt, secret})`). A view decoration, never document text;
     * the old result the cell owns is dimmed. The host writes the result
     * with setCellOutput, then calls `dispose()`. See document-cell-run.js.
     */
    showCellRun(cell, { dimResult = true } = {}) {
      const current = codeBlockAt(view.state, Math.min(cell.from, view.state.doc.length));
      const at = current && current.from === cell.from ? current : cell;
      const run = showCellRun(view, at, current ? ownedOutputBlock(view.state, current.to) : null, { dimResult });
      // The run's cell, wherever edits moved it: the panel follows it, so
      // the run (not a stale position) says what the cell is doing and
      // where its result goes. Set the final verdict before dispose().
      run.cell = () => {
        const pos = run.position();
        return pos == null ? null : codeBlockAt(view.state, pos);
      };
      run.setStatus = status => {
        const cellNow = run.cell();
        return cellNow ? setCellStatus(view, cellNow, status) : false;
      };
      return run;
    },

    ...reviewApi(view),

    /** Clear the run states drawn on cells: all, or those in `states`. */
    clearCellStatuses(states) { clearCellStatuses(view, states); },

    /** Open the AI command box at the cursor (as Mod-j does). False when AI commands are off. */
    openAiMenu() { return !!ai && !!aiControllerOf(view)?.openMenu(); },

    /**
     * Run an AI command on the selection or cursor, without the box:
     * `runAiCommand('grammar')`, `runAiCommand('edit', {instruction})`.
     */
    runAiCommand(id, opts) { return !!ai && !!aiControllerOf(view)?.run(id, opts); },

    /**
     * The editor's keys that act here, now — for the host's keyboard help.
     * Sections {label, keys: [[names, what]], exclusive?}, most local
     * first: the open AI command box (exclusive: it owns the keyboard), a
     * suggestion, then the cell or document at the cursor (run keys, the
     * AI command box). `names` are CodeMirror key names; the bundle's
     * `formatKey` spells them. Keys the host binds itself (save, search,
     * completion) are the host's to list.
     */
    keyHelp() {
      const { sections, open } = ai ? aiKeyHelp(view) : { sections: [], open: null };
      if (sections.some(s => s.exclusive)) return sections;
      const review = reviewKeyHelp(view.state);
      if (review) sections.push(review);
      const keys = [];
      if (runsCells && cellToRun(view.state)) {
        keys.push([[CELL_KEYS.run], 'run this cell'], [[CELL_KEYS.runAndAdvance], 'run this cell, then go to the next']);
      }
      if (open) keys.push(open);
      const here = codeBlockAt(view.state, view.state.selection.main.head);
      if (keys.length) sections.push({ label: here ? `${here.lang || 'code'} cell` : 'document', keys });
      return sections;
    },

    /**
     * Draw `cell`'s run state on the cell: {state: 'queued' | 'running' |
     * 'waiting' | 'ok' | 'error', startedAt, ms, label}, or null to clear.
     * See document-cell-controls.js. False when the cell moved or changed
     * (the same stale guard as setCellOutput).
     */
    setCellStatus(cell, status) {
      const current = cell && codeBlockAt(view.state, Math.min(cell.from, view.state.doc.length));
      if (!current || current.from !== cell.from) return false;
      return setCellStatus(view, current, status);
    },

    /** Move the cursor to the next runnable cell after `cell` (Shift-Enter). */
    advanceToNextCell(cell) {
      const cells = listCodeCells(view.state);
      const next = cells.find(c => c.from > cell.from);
      if (!next) return false;
      const line = view.state.doc.lineAt(next.from);
      const target = Math.min(line.to + 1, view.state.doc.length);
      view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
      return true;
    },

    onChange(fn) {
      changeHandlers.push(fn);
      return () => { const i = changeHandlers.indexOf(fn); if (i >= 0) changeHandlers.splice(i, 1); };
    },

    onSave(fn) {
      saveHandlers.push(fn);
      return () => { const i = saveHandlers.indexOf(fn); if (i >= 0) saveHandlers.splice(i, 1); };
    },

    focus() { view.focus(); },

    /** Cursor and selection as 1-based lines: {line, from, to, text}. */
    selection() { return selectionInfo(view); },
    /** Move the cursor to a 1-based line and scroll it into view. */
    gotoLine(n) { gotoLine(view, n); },

    destroy() {
      hostServices.destroy();
      view.destroy();
      element.classList.remove('mrmd-root');
      delete element.dataset.mrmdThemingMode;
    },
  };
}

// What both editors offer for reviewing changes (document-review.js).
function reviewApi(view) {
  return {
    /**
     * Turn the text into `text` by the smallest changes, so the cursor,
     * marks and a review keep their places (setContent replaces it all).
     */
    updateContent(text) {
      const changes = minimalChanges(view.state, String(text ?? ''));
      if (changes.length) view.dispatch({ changes });
    },
    review: {
      /** Every change until end() is one proposal (an agent writing this file): {id, end()}. */
      capture(meta) { return captureChanges(view, meta); },
      /** One change as a proposal: {from, to, insert, meta}. The id, or null over a change still under review. */
      propose(spec) { return proposeChange(view, spec); },
      /** {changes, proposals: [{id, meta}], capturing} */
      summary() { return reviewSummary(view.state); },
      acceptAll() { return acceptAll(view); },
      rejectAll() { return rejectAll(view); },
      first() { return goToFirstChange(view); },
      next() { return goToNextChunk(view); },
      previous() { return goToPreviousChunk(view); },
    },
  };
}

function selectionInfo(view) {
  const state = view.state;
  const main = state.selection.main;
  const fromLine = state.doc.lineAt(main.from), toLine = state.doc.lineAt(main.to);
  return {
    line: state.doc.lineAt(main.head).number,
    from: fromLine.number, to: toLine.number,
    empty: main.empty,
    text: main.empty ? '' : state.doc.sliceString(main.from, main.to),
    lineText: state.doc.lineAt(main.head).text,
  };
}

function gotoLine(view, n) {
  const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, Number(n) || 1)));
  view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
  view.focus();
}

/**
 * Create a whole-file code editor — the same engine, keymaps, and theme
 * object as the document editor, with line numbers, a language picked
 * from the file name, and a gutter the host can mark (provenance, trust).
 *
 * @param {string|HTMLElement} target
 * @param {Object} options
 *   doc, filename, theme, dark, readonly, onChange, onSave — as for the
 *   document editor. tabSize (default 2).
 * @returns editor API (+ setLineMarks(map) — {line: {glyph, title, cls}})
 */
export function createCodeEditor(target, options = {}) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (!element) throw new Error('mrmd-document: target element not found');
  element.classList.add('mrmd-root', 'mrmd-code-root');
  element.dataset.mrmdThemingMode = 'hosted';
  const systemDark = typeof window !== 'undefined'
    && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let themeName = options.theme || null;
  let theme = resolveTheme(themeName, options.dark !== null && options.dark !== undefined ? options.dark : systemDark);
  applyThemeTokens(element, theme);

  const themeCompartment = new Compartment();
  const readonlyCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const saveHandlers = [];
  const changeHandlers = [];
  if (typeof options.onSave === 'function') saveHandlers.push(options.onSave);
  if (typeof options.onChange === 'function') changeHandlers.push(options.onChange);

  const hostServices = documentHostServices({ ...options, lineGutter: true, wordCompletion: true, codeKeys: true });

  const codeBase = EditorView.theme({
    '&': { height: '100%', fontSize: '13px' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--editor-font-family, monospace)', lineHeight: '1.5' },
    '.cm-content': { padding: '8px 0 40vh' },
    '&.cm-focused': { outline: 'none' },
    '.mrmd-mark-gutter': { minWidth: '14px' },
    '.mrmd-line-mark': { display: 'inline-block', width: '12px', textAlign: 'center', cursor: 'pointer', color: 'var(--editor-line-number, #888)' },
    '.mrmd-selection-overlay': {
      backgroundColor: 'var(--mrmd-selection-overlay, color-mix(in srgb, var(--widget-border-accent, #3b82f6) 30%, transparent))',
    },
  });

  const lang = fileLanguage(options.filename || '');
  const extensions = [
    lineNumbers(),
    hostServices.extension,
    highlightActiveLineGutter(),
    highlightActiveLine(),
    selectionOverlay,
    basicSetup,
    search({ top: true }),
    keymap.of(searchKeymap),
    indentUnit.of(' '.repeat(Math.max(1, Number(options.tabSize) || 2))),
    EditorView.lineWrapping,
    ...(Array.isArray(options.extensions) ? options.extensions : []),
    documentReview(options.review || {}),
    codeBase,
    themeCompartment.of(createCodemirrorTheme(theme)),
    readonlyCompartment.of(options.readonly ? EditorState.readOnly.of(true) : []),
    languageCompartment.of(lang || []),
    keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { saveHandlers.forEach(fn => fn()); return true; } }]),
    EditorView.updateListener.of(update => {
      if (update.docChanged) changeHandlers.forEach(fn => fn());
    }),
  ];
  const view = new EditorView({ state: EditorState.create({ doc: options.doc || '', extensions }), parent: element });
  hostServices.attach(view);
  if (options.readonly) view.dom.classList.add('mrmd-readonly');

  return {
    view,
    element,
    getContent() { return view.state.doc.toString(); },
    setContent(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(text ?? '') } }); },
    ...reviewApi(view),
    /** The editor's keys that act here, now (the review's), as the document editor's keyHelp(). */
    keyHelp() { const review = reviewKeyHelp(view.state); return review ? [review] : []; },
    setTheme(name) {
      theme = resolveTheme(name, systemDark);
      themeName = theme.name;
      applyThemeTokens(element, theme);
      view.dispatch({ effects: themeCompartment.reconfigure(createCodemirrorTheme(theme)) });
      return themeName;
    },
    getThemeName() { return themeName || theme.name; },
    setReadonly(value) {
      view.dispatch({ effects: readonlyCompartment.reconfigure(value ? EditorState.readOnly.of(true) : []) });
      view.dom.classList.toggle('mrmd-readonly', !!value);
    },
    setFilename(filename) {
      hostServices.setFilename(filename);
      const next = fileLanguage(filename);
      view.dispatch({ effects: languageCompartment.reconfigure(next || []) });
    },
    setLineMarks: hostServices.setLineMarks,
    setLanguageServices: hostServices.setLanguageServices,
    setDiagnostics: hostServices.setDiagnostics,
    openSearch() { return openSearchPanel(view); },
    selection() { return selectionInfo(view); },
    gotoLine(n) { gotoLine(view, n); },
    onChange(fn) { changeHandlers.push(fn); return () => { const i = changeHandlers.indexOf(fn); if (i >= 0) changeHandlers.splice(i, 1); }; },
    onSave(fn) { saveHandlers.push(fn); return () => { const i = saveHandlers.indexOf(fn); if (i >= 0) saveHandlers.splice(i, 1); }; },
    focus() { view.focus(); },
    destroy() {
      hostServices.destroy();
      view.destroy();
      element.classList.remove('mrmd-root', 'mrmd-code-root');
      delete element.dataset.mrmdThemingMode;
    },
  };
}

export { getTheme, getThemeNames };
export const version = '0.19.0-document';

export { ratNotebook, createNotebookRunner, aiEditAnnotation, formatKey };
export default { createDocumentEditor, createCodeEditor, fileLanguage, getTheme, getThemeNames, collab, ratNotebook, createNotebookRunner, aiEditAnnotation, formatKey, version };
