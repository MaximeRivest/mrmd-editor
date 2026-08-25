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
import { EditorState, Compartment } from '@codemirror/state';
import { keymap, placeholder } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
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
 *   theme          MRMD theme name (default: plain-light / plain-dark)
 *   dark           boolean — picks the default theme when `theme` is unset
 *   readonly       boolean
 *   placeholder    empty-state text
 *   sourceMode     boolean — show all raw markdown syntax
 *   assetResolver  (url) => url — resolve relative image paths
 *   onChange       () => void — document changed
 *   onSave         () => void — user pressed Mod-S
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
  });

  const saveHandlers = [];
  const changeHandlers = [];
  if (typeof options.onSave === 'function') saveHandlers.push(options.onSave);
  if (typeof options.onChange === 'function') changeHandlers.push(options.onChange);

  const extensions = [
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
export const version = '0.9.0-document';

export default { createDocumentEditor, getTheme, getThemeNames, version };
