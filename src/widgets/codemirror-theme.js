/**
 * CodeMirror Theme Generator
 *
 * Generates CodeMirror theme extensions from MRMD theme specifications.
 * This bridges our unified theme system with CodeMirror's styling.
 *
 * @module widgets/codemirror-theme
 */

import { EditorView } from '@codemirror/view';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Create a CodeMirror theme extension from an MRMD theme spec.
 *
 * @param {Object} theme - MRMD theme object with --editor-* and --syntax-* tokens
 * @returns {import('@codemirror/state').Extension} CodeMirror extension
 *
 * @example
 * import { createCodemirrorTheme, midnightTheme } from 'mrmd-editor';
 *
 * const cmTheme = createCodemirrorTheme(midnightTheme);
 * const editor = new EditorView({
 *   extensions: [cmTheme, ...otherExtensions],
 *   parent: document.body,
 * });
 */
/**
 * Parse a CSS color into [r, g, b] (0-255). Supports #rgb, #rrggbb, #rrggbbaa
 * and rgb()/rgba(). Returns null for anything else (var(), color-mix, names).
 */
function parseColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function luminance([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Guarantee the selection color is visibly different from the editor
 * background. Themes routinely pick selection colors that are nearly
 * invisible against their background; the editor protects itself by blending
 * the theme's selection toward its accent until there is enough separation.
 * The theme's hue is preserved — only its weight is corrected.
 */
function ensureVisibleSelection(selection, background, accent) {
  const sel = parseColor(selection);
  const bg = parseColor(background);
  if (!sel || !bg) return selection;

  const MIN_DELTA = 0.085;
  if (Math.abs(luminance(sel) - luminance(bg)) >= MIN_DELTA) return selection;

  const fallback = parseColor(accent) || (luminance(bg) > 0.5 ? [37, 99, 235] : [96, 165, 250]);
  // Blend selection toward the accent until the floor is met (max 3 steps).
  let mixed = sel;
  for (let step = 0; step < 3; step++) {
    mixed = mixed.map((c, i) => Math.round(c * 0.6 + fallback[i] * 0.4));
    if (Math.abs(luminance(mixed) - luminance(bg)) >= MIN_DELTA) break;
  }
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

export function createCodemirrorTheme(theme) {
  if (!theme) {
    throw new Error('Theme is required');
  }

  const selectionColor = ensureVisibleSelection(
    theme['--editor-selection'] || '#264f78',
    theme['--editor-background'] || '#1e1e1e',
    theme['--widget-border-accent'] || theme['--widget-text-accent'] || theme['--mrmd-accent'],
  );

  // Create the base editor theme (backgrounds, cursors, etc.)
  const editorTheme = EditorView.theme({
    // Root editor container
    '&': {
      backgroundColor: theme['--editor-background'] || '#1e1e1e',
      color: theme['--editor-foreground'] || '#d4d4d4',
      fontFamily: theme['--editor-font-family'] || 'inherit',
      fontSize: theme['--editor-font-size'] || 'inherit',
    },

    // Content area
    '.cm-content': {
      caretColor: theme['--editor-cursor'] || '#aeafad',
      fontFamily: theme['--editor-font-family'] || 'inherit',
      fontSize: theme['--editor-font-size'] || 'inherit',
      lineHeight: theme['--editor-line-height'] || 'inherit',
    },

    // Lines
    '.cm-line': {
      lineHeight: theme['--editor-line-height'] || 'inherit',
    },

    // Cursor
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: theme['--editor-cursor'] || '#aeafad',
    },

    // Selection — uses the visibility-protected color (see
    // ensureVisibleSelection above), not the raw theme token.
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: selectionColor,
    },

    // Search match highlighting
    '.cm-searchMatch': {
      backgroundColor: theme['--editor-selection-match'] || '#515c6a',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: theme['--editor-selection'] || '#264f78',
    },

    // Active line
    '.cm-activeLine': {
      backgroundColor: theme['--editor-active-line'] || 'rgba(255, 255, 255, 0.05)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: theme['--editor-active-line'] || 'rgba(255, 255, 255, 0.05)',
    },

    // Gutters (line numbers, fold markers)
    '.cm-gutters': {
      backgroundColor: theme['--editor-gutter'] || theme['--editor-background'] || '#1e1e1e',
      color: theme['--editor-line-number'] || '#858585',
      borderRight: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: theme['--editor-line-number'] || '#858585',
    },
    '.cm-lineNumbers .cm-activeLineGutter': {
      color: theme['--editor-line-number-active'] || '#c6c6c6',
    },

    // Matching brackets
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: theme['--editor-matching-bracket'] || 'rgba(255, 255, 255, 0.1)',
      outline: 'none',
    },

    // Panels (search, etc.)
    '.cm-panels': {
      backgroundColor: theme['--editor-gutter'] || theme['--editor-background'] || '#1e1e1e',
      color: theme['--editor-foreground'] || '#d4d4d4',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: `1px solid ${theme['--widget-border'] || 'rgba(255, 255, 255, 0.1)'}`,
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: `1px solid ${theme['--widget-border'] || 'rgba(255, 255, 255, 0.1)'}`,
    },

    // Panel inputs
    '.cm-textfield': {
      backgroundColor: theme['--widget-surface-inset'] || 'rgba(0, 0, 0, 0.2)',
      border: `1px solid ${theme['--widget-border'] || 'rgba(255, 255, 255, 0.1)'}`,
      color: theme['--editor-foreground'] || '#d4d4d4',
    },
    '.cm-button': {
      backgroundColor: theme['--widget-surface'] || 'rgba(0, 0, 0, 0.35)',
      color: theme['--editor-foreground'] || '#d4d4d4',
      border: `1px solid ${theme['--widget-border'] || 'rgba(255, 255, 255, 0.1)'}`,
    },

    // Tooltips
    '.cm-tooltip': {
      backgroundColor: theme['--widget-surface-elevated'] || '#1e1e1e',
      border: `1px solid ${theme['--widget-border'] || 'rgba(255, 255, 255, 0.1)'}`,
      color: theme['--editor-foreground'] || '#d4d4d4',
    },
    '.cm-tooltip.cm-tooltip-autocomplete': {
      '& > ul > li': {
        color: theme['--editor-foreground'] || '#d4d4d4',
      },
      '& > ul > li[aria-selected]': {
        backgroundColor: theme['--editor-selection'] || '#264f78',
        color: theme['--editor-foreground'] || '#d4d4d4',
      },
    },

    // Fold placeholders
    '.cm-foldPlaceholder': {
      backgroundColor: theme['--widget-surface'] || 'rgba(0, 0, 0, 0.35)',
      border: 'none',
      color: theme['--widget-text-muted'] || '#858585',
    },
  }, { dark: theme.isDark !== false });

  // Create syntax highlighting style
  const syntaxTheme = HighlightStyle.define([
    // Comments
    { tag: t.comment, color: theme['--syntax-comment'] || '#6a9955' },
    { tag: t.lineComment, color: theme['--syntax-comment'] || '#6a9955' },
    { tag: t.blockComment, color: theme['--syntax-comment'] || '#6a9955' },
    { tag: t.docComment, color: theme['--syntax-comment'] || '#6a9955' },

    // Keywords
    { tag: t.keyword, color: theme['--syntax-keyword'] || '#569cd6' },
    { tag: t.controlKeyword, color: theme['--syntax-control'] || theme['--syntax-keyword'] || '#c586c0' },
    { tag: t.operatorKeyword, color: theme['--syntax-keyword'] || '#569cd6' },
    { tag: t.definitionKeyword, color: theme['--syntax-keyword'] || '#569cd6' },
    { tag: t.moduleKeyword, color: theme['--syntax-keyword'] || '#569cd6' },

    // Operators and punctuation
    { tag: t.operator, color: theme['--syntax-operator'] || '#d4d4d4' },
    { tag: t.punctuation, color: theme['--syntax-punctuation'] || '#d4d4d4' },
    { tag: t.separator, color: theme['--syntax-punctuation'] || '#d4d4d4' },
    { tag: t.bracket, color: theme['--syntax-punctuation'] || '#d4d4d4' },
    { tag: t.angleBracket, color: theme['--syntax-punctuation'] || '#d4d4d4' },
    { tag: t.squareBracket, color: theme['--syntax-punctuation'] || '#d4d4d4' },
    { tag: t.paren, color: theme['--syntax-punctuation'] || '#d4d4d4' },
    { tag: t.brace, color: theme['--syntax-punctuation'] || '#d4d4d4' },

    // Strings
    { tag: t.string, color: theme['--syntax-string'] || '#ce9178' },
    { tag: t.docString, color: theme['--syntax-string'] || '#ce9178' },
    { tag: t.character, color: theme['--syntax-string'] || '#ce9178' },
    { tag: t.special(t.string), color: theme['--syntax-string'] || '#ce9178' },

    // Numbers
    { tag: t.number, color: theme['--syntax-number'] || '#b5cea8' },
    { tag: t.integer, color: theme['--syntax-number'] || '#b5cea8' },
    { tag: t.float, color: theme['--syntax-number'] || '#b5cea8' },

    // Variables
    { tag: t.variableName, color: theme['--syntax-variable'] || '#9cdcfe' },
    { tag: t.definition(t.variableName), color: theme['--syntax-variable'] || '#9cdcfe' },
    { tag: t.local(t.variableName), color: theme['--syntax-variable'] || '#9cdcfe' },
    { tag: t.special(t.variableName), color: theme['--syntax-variable-special'] || '#569cd6' },

    // Functions
    { tag: t.function(t.variableName), color: theme['--syntax-function'] || '#dcdcaa' },
    { tag: t.definition(t.function(t.variableName)), color: theme['--syntax-function'] || '#dcdcaa' },

    // Properties
    { tag: t.propertyName, color: theme['--syntax-property'] || '#9cdcfe' },
    { tag: t.definition(t.propertyName), color: theme['--syntax-property'] || '#9cdcfe' },
    { tag: t.special(t.propertyName), color: theme['--syntax-property'] || '#9cdcfe' },

    // Types and classes
    { tag: t.typeName, color: theme['--syntax-type'] || '#4ec9b0' },
    { tag: t.className, color: theme['--syntax-class'] || '#4ec9b0' },
    { tag: t.namespace, color: theme['--syntax-type'] || '#4ec9b0' },
    { tag: t.macroName, color: theme['--syntax-type'] || '#4ec9b0' },

    // Labels and constants
    { tag: t.labelName, color: theme['--syntax-variable'] || '#9cdcfe' },
    { tag: t.constant(t.variableName), color: theme['--syntax-constant'] || '#569cd6' },
    { tag: t.standard(t.variableName), color: theme['--syntax-constant'] || '#569cd6' },

    // Literals
    { tag: t.bool, color: theme['--syntax-constant'] || '#569cd6' },
    { tag: t.null, color: theme['--syntax-constant'] || '#569cd6' },
    { tag: t.atom, color: theme['--syntax-constant'] || '#569cd6' },
    { tag: t.unit, color: theme['--syntax-number'] || '#b5cea8' },

    // Regular expressions
    { tag: t.regexp, color: theme['--syntax-regexp'] || '#d16969' },

    // Escape sequences
    { tag: t.escape, color: theme['--syntax-escape'] || '#d7ba7d' },

    // HTML/XML
    { tag: t.tagName, color: theme['--syntax-tag'] || '#569cd6' },
    { tag: t.attributeName, color: theme['--syntax-attribute'] || '#9cdcfe' },
    { tag: t.attributeValue, color: theme['--syntax-attribute-value'] || '#ce9178' },

    // Markdown
    { tag: t.heading, color: theme['--syntax-heading'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.heading1, color: theme['--syntax-heading'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.heading2, color: theme['--syntax-heading'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.heading3, color: theme['--syntax-heading'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.heading4, color: theme['--syntax-heading'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.heading5, color: theme['--syntax-heading'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.heading6, color: theme['--syntax-heading'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.link, color: theme['--syntax-link'] || '#3794ff', textDecoration: 'underline' },
    { tag: t.url, color: theme['--syntax-link'] || '#3794ff', textDecoration: 'underline' },
    { tag: t.emphasis, color: theme['--syntax-emphasis'] || '#569cd6', fontStyle: 'italic' },
    { tag: t.strong, color: theme['--syntax-strong'] || '#569cd6', fontWeight: 'bold' },
    { tag: t.strikethrough, color: theme['--syntax-strikethrough'] || '#858585', textDecoration: 'line-through' },
    { tag: t.quote, color: theme['--syntax-quote'] || '#6a9955' },
    { tag: t.monospace, color: theme['--syntax-code'] || '#ce9178' },

    // Meta and processing
    { tag: t.meta, color: theme['--syntax-meta'] || '#858585' },
    { tag: t.processingInstruction, color: theme['--syntax-meta'] || '#858585' },
    { tag: t.annotation, color: theme['--syntax-meta'] || '#858585' },

    // Diff
    { tag: t.inserted, color: theme['--syntax-inserted'] || '#b5cea8' },
    { tag: t.deleted, color: theme['--syntax-deleted'] || '#ce9178' },
    { tag: t.changed, color: theme['--syntax-changed'] || '#569cd6' },

    // Invalid
    { tag: t.invalid, color: theme['--widget-error'] || '#ef4444', textDecoration: 'underline wavy' },
  ]);

  // Return combined extension
  return [editorTheme, syntaxHighlighting(syntaxTheme)];
}

/**
 * Cache for generated CodeMirror themes
 * @type {Map<string, import('@codemirror/state').Extension>}
 */
const cmThemeCache = new Map();

/**
 * Get or create a CodeMirror theme for a named theme.
 * Caches results for performance.
 *
 * @param {string} themeName - Name of the registered theme
 * @param {Function} getTheme - Function to get theme by name
 * @returns {import('@codemirror/state').Extension|null}
 */
export function getCodemirrorTheme(themeName, getTheme) {
  if (!themeName) return null;

  // Check cache
  if (cmThemeCache.has(themeName)) {
    return cmThemeCache.get(themeName);
  }

  // Get theme and generate
  const theme = getTheme(themeName);
  if (!theme) return null;

  const cmTheme = createCodemirrorTheme(theme);
  cmThemeCache.set(themeName, cmTheme);

  return cmTheme;
}

/**
 * Clear the CodeMirror theme cache.
 * Call this if you modify a theme and want to regenerate.
 */
export function clearCodemirrorThemeCache() {
  cmThemeCache.clear();
}

export default {
  createCodemirrorTheme,
  getCodemirrorTheme,
  clearCodemirrorThemeCache,
};
