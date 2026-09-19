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
 * can make any editor shared.
 *
 * Build: npm run build:document
 * Output: dist/mrmd-document.iife.min.js (global: mrmdDocument)
 */

import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { keymap, placeholder, layer, RectangleMarker } from '@codemirror/view';
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
import { markdown as markdownRendering, assetResolverFacet, sourceModeFacet } from './markdown/index.js';

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

/**
 * The language word of a fence line, lowercased ('' when bare).
 */
function fenceLang(lineText) {
  return ((lineText.match(/^\s*(?:`{3,}|~{3,})\s*(\S*)/) || [])[1] || '').toLowerCase();
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
      if (cell && cell.lang && cell.lang.toLowerCase() !== 'output') cells.push(cell);
      return false;
    },
  });
  return cells;
}

/**
 * The output block OWNED by the cell ending at `cellTo`, or null.
 *
 * Ownership rule (the MRMD convention): an ```output fence belongs to the
 * cell above it only when nothing but whitespace separates the cell's
 * closing fence line from the output's opening fence line. Anything else
 * between them — prose, another cell, a moved block — breaks ownership,
 * and a rerun must never touch it.
 */
function ownedOutputBlock(state, cellTo) {
  const doc = state.doc;
  const afterLineNum = doc.lineAt(cellTo).number + 1;
  let openLine = null;
  for (let n = afterLineNum; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (!line.text.trim()) continue;           // whitespace — keep looking
    if (fenceLang(line.text) === 'output') openLine = line;
    break;                                     // first non-blank decides
  }
  if (!openLine) return null;
  // The block is the FencedCode node starting at that line.
  let block = null;
  syntaxTree(state).iterate({
    from: openLine.from, to: openLine.from + 1,
    enter(node) {
      if (node.name === 'FencedCode' && doc.lineAt(node.from).number === openLine.number) {
        block = { from: node.from, to: node.to };
        return false;
      }
    },
  });
  return block;
}

/**
 * Replace, insert, or remove the output block under one cell.
 * Returns the change spec (host dispatches through the view, so undo,
 * autosave, and collaboration all see one ordinary edit), or null when
 * the document no longer contains the cell as given (stale-run guard).
 */
function cellOutputChange(state, cell, outputText) {
  // Stale guard: the cell must still sit at [from,to) with the same code.
  const current = codeBlockAt(state, Math.min(cell.from, state.doc.length));
  if (!current || current.from !== cell.from || current.code !== cell.code) return null;
  const doc = state.doc;
  const text = String(outputText ?? '').replace(/\s+$/, '');
  // Inner text must not contain a ``` fence line — indent such lines by
  // one space so they cannot terminate the block (rare; keeps it valid).
  const safe = text.split('\n').map(l => (/^\s*(?:`{3,}|~{3,})/.test(l) ? ' ' + l : l)).join('\n');
  const owned = ownedOutputBlock(state, current.to);
  if (!text) {
    if (!owned) return { changes: [] };        // nothing to write, nothing owned
    // Remove the owned block plus the blank line that separated it.
    const removeFrom = Math.min(current.to + 1, owned.from > 0 ? owned.from : current.to);
    const after = doc.lineAt(owned.to).number < doc.lines ? doc.line(doc.lineAt(owned.to).number + 1) : null;
    const removeTo = after && !after.text.trim() ? after.to : owned.to;
    return { changes: [{ from: Math.min(removeFrom, owned.from), to: Math.min(removeTo + 1, doc.length) }] };
  }
  const blockText = '```output\n' + safe + '\n```';
  if (owned) return { changes: [{ from: owned.from, to: owned.to, insert: blockText }] };
  return { changes: [{ from: current.to, insert: '\n\n' + blockText }] };
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
 *   onChange       () => void — document changed
 *   onSave         () => void — user pressed Mod-S
 *   onRunCell      ({lang, code, from, to}, {advance}) => void — the user
 *                  ran the cell at the cursor: Mod-Enter (advance: false)
 *                  or Shift-Enter (advance: true — notebook habit: run,
 *                  then move on). The host owns execution; it reports the
 *                  result back through setCellOutput. The editor owns the
 *                  markdown mechanics: cells, ownership, replacement.
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

  const documentBase = EditorView.theme({
    '&': { height: '100%', fontSize: '16px' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'Georgia, "Times New Roman", serif',
      lineHeight: '1.6',
    },
    '.cm-content': { padding: '0', maxWidth: 'none' },
    '.cm-gutters': { display: options.lineGutter ? 'flex' : 'none' },
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
    typeof options.onRunCell === 'function' ? Prec.highest(keymap.of([{
      key: 'Mod-Enter',
      run: (v) => {
        const cell = codeBlockAt(v.state, v.state.selection.main.head);
        if (!cell || !cell.code.trim() || cell.lang.toLowerCase() === 'output') return false;
        options.onRunCell(cell, { advance: false });
        return true;
      },
    }, {
      key: 'Shift-Enter',
      run: (v) => {
        const cell = codeBlockAt(v.state, v.state.selection.main.head);
        if (!cell || !cell.code.trim() || cell.lang.toLowerCase() === 'output') return false;
        options.onRunCell(cell, { advance: true });
        return true;
      },
    }])) : [],
    selectionOverlay,
    basicSetup,
    hostServices.extension,
    markdownLang({ base: markdownLanguage, codeLanguages: codeBlockLanguage }),
    EditorView.lineWrapping,
    ...(Array.isArray(options.extensions) ? options.extensions : []),
    documentBase,
    themeCompartment.of(createCodemirrorTheme(theme)),
    readonlyCompartment.of(options.readonly ? EditorState.readOnly.of(true) : []),
    sourceCompartment.of(sourceModeFacet.of(!!options.sourceMode)),
    options.placeholder ? placeholder(options.placeholder) : [],
    typeof options.assetResolver === 'function' ? assetResolverFacet.of(options.assetResolver) : [],
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
    setCellOutput(cell, outputText) {
      const change = cellOutputChange(view.state, cell, outputText);
      if (!change) return false;
      if (change.changes.length) view.dispatch({ ...change, userEvent: 'output.cell' });
      return true;
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
export const version = '0.12.0-document';

export default { createDocumentEditor, createCodeEditor, fileLanguage, getTheme, getThemeNames, collab, version };
