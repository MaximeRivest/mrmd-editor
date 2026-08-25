/**
 * mrmd-document — the light document editor bundle.
 *
 * Purpose: host applications (for example aiconvo) that need MRMD's
 * markdown writing experience without the full platform. This entry
 * includes the editor, markdown rendering, core widgets, and themes.
 *
 * It excludes: Yjs networking, runtimes, terminals, linked tables,
 * AI panels, collaboration UI, MRP clients, and document templates.
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

// MRMD's markdown rendering: blur→render / focus→source, tables, math,
// images, checkboxes, alerts — the document experience.
import { markdown as markdownRendering, assetResolverFacet, sourceModeFacet } from './markdown/index.js';

// MRMD themes (tokens + CodeMirror theme builder).
import { getTheme, getThemeNames, getDefaultTokens } from './widgets/theme.js';
import { createCodemirrorTheme } from './widgets/codemirror-theme.js';

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

  const documentBase = EditorView.theme({
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
    markdownLang({ base: markdownLanguage, codeLanguages: codeBlockLanguage }),
    EditorView.lineWrapping,
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
  if (options.readonly) view.dom.classList.add('mrmd-readonly');

  return {
    view,
    element,

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

    destroy() {
      view.destroy();
      element.classList.remove('mrmd-root');
      delete element.dataset.mrmdThemingMode;
    },
  };
}

export { getTheme, getThemeNames };
export const version = '0.9.4-document';

export default { createDocumentEditor, getTheme, getThemeNames, version };
