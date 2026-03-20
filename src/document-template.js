/**
 * Document template system.
 *
 * Semantic, reusable document styling separate from the app/editor chrome theme.
 * Phase 1 focuses on editor preview + reusable presets.
 *
 * @module document-template
 */

import { EditorView, ViewPlugin } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { tags as lezerTags, tagHighlighter } from '@lezer/highlight';

export const defaultDocumentTemplate = {
  name: 'Default',
  version: 5,
  editor: {
    applyDocumentStyles: true,
  },
  page: {
    background: '',
    maxWidth: '',
    // Print / export properties (not used in editor preview)
    paperSize: '',       // 'letter' | 'a4' | 'a5' | 'legal' | ''
    marginTop: '',       // e.g. '1in', '2.54cm'
    marginBottom: '',
    marginLeft: '',
    marginRight: '',
  },
  body: {
    fontFamily: '',
    fontSize: '',
    lineHeight: '',
    color: '',
    textTransform: '', // '' | 'uppercase' | 'lowercase' | 'capitalize'
    paragraphSpacing: '', // e.g. '1em', '12pt' — maps to CSS margin-bottom on p, LaTeX \parskip
  },
  // --- Inline mark styles (bold, italic, underline, strikethrough) ---
  // Base defaults apply everywhere. Per-block overrides cascade:
  //   inlineMarks.bold  →  heading.bold  →  heading.h1.bold
  inlineMarks: {
    bold: {
      color: '',
      fontFamily: '',
      fontWeight: '',
      relativeSize: '', // e.g. '1.05' → 1.05em
      textTransform: '',
    },
    italic: {
      color: '',
      fontFamily: '',
      fontStyle: '',
      relativeSize: '',
      textTransform: '',
    },
    underline: {
      color: '',
      lineColor: '',
      lineStyle: '', // '' | 'solid' | 'dashed' | 'dotted' | 'wavy'
      textTransform: '',
    },
    strikethrough: {
      color: '',
      lineColor: '',
      textTransform: '',
    },
  },
  heading: {
    color: '',
    fontFamily: '',
    textTransform: '',
    // Per-heading sizes plus optional inline-mark overrides
    h1: {
      fontFamily: '', fontSize: '', fontWeight: '', textTransform: '',
      bold: { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
      italic: { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
      underline: { color: '', lineColor: '', lineStyle: '', textTransform: '' },
      strikethrough: { color: '', lineColor: '', textTransform: '' },
    },
    h2: {
      fontFamily: '', fontSize: '', fontWeight: '', textTransform: '',
      bold: { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
      italic: { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
      underline: { color: '', lineColor: '', lineStyle: '', textTransform: '' },
      strikethrough: { color: '', lineColor: '', textTransform: '' },
    },
    h3: {
      fontFamily: '', fontSize: '', fontWeight: '', textTransform: '',
      bold: { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
      italic: { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
      underline: { color: '', lineColor: '', lineStyle: '', textTransform: '' },
      strikethrough: { color: '', lineColor: '', textTransform: '' },
    },
    h4: {
      fontFamily: '', fontSize: '', fontWeight: '', textTransform: '',
      bold: { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
      italic: { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
      underline: { color: '', lineColor: '', lineStyle: '', textTransform: '' },
      strikethrough: { color: '', lineColor: '', textTransform: '' },
    },
    h5: {
      fontFamily: '', fontSize: '', fontWeight: '', textTransform: '',
      bold: { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
      italic: { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
      underline: { color: '', lineColor: '', lineStyle: '', textTransform: '' },
      strikethrough: { color: '', lineColor: '', textTransform: '' },
    },
    h6: {
      fontFamily: '', fontSize: '', fontWeight: '', textTransform: '',
      bold: { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
      italic: { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
      underline: { color: '', lineColor: '', lineStyle: '', textTransform: '' },
      strikethrough: { color: '', lineColor: '', textTransform: '' },
    },
    // Heading-wide mark overrides (applied to all h1-h6 unless a per-level override exists)
    bold:          { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
    italic:        { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
    underline:     { color: '', lineColor: '', lineStyle: '', textTransform: '' },
    strikethrough: { color: '', lineColor: '', textTransform: '' },
    numbering: '',       // '' | 'none' | 'all' | 'h2+' — hint for Pandoc --number-sections
  },
  blockquote: {
    borderLeftColor: '',
    background: '',
    color: '',
    fontFamily: '',
    fontStyle: '',       // '' | 'italic' | 'normal'
    textTransform: '',
    // Blockquote-specific mark overrides
    bold:          { color: '', fontFamily: '', fontWeight: '', relativeSize: '', textTransform: '' },
    italic:        { color: '', fontFamily: '', fontStyle: '', relativeSize: '', textTransform: '' },
    underline:     { color: '', lineColor: '', lineStyle: '', textTransform: '' },
    strikethrough: { color: '', lineColor: '', textTransform: '' },
  },
  code: {
    inline: {
      fontFamily: '',
      background: '',
      color: '',
    },
    block: {
      fontFamily: '',
      fontSize: '',
      background: '',
      color: '',
      lineNumbers: '',   // '' | 'true' | 'false' — hint for Pandoc --listings / code line numbers
      lineHeight: '',    // e.g. '1.5'
      borderRadius: '',  // e.g. '6px'
      borderColor: '',   // e.g. '#333'
      padding: '',       // e.g. '1em'
    },
    // --- Cell chrome: header bar, run button, output area ---
    cell: {
      headerBackground: '',   // code cell header bar background
      headerColor: '',        // code cell header bar text color
      headerBorderColor: '',  // border below header
      outputBackground: '',   // output area background
      outputColor: '',        // output area text color
      outputBorderColor: '',  // border above output area
      outputFontFamily: '',   // output area font family
      outputFontSize: '',     // output area font size (e.g. '0.85em')
      outputLineHeight: '',   // output area line height
    },
    // --- Syntax highlighting tokens ---
    // Base token colors apply to all code blocks/languages.
    // Per-language overrides cascade:  code.highlight.keyword  →  code.highlight.languages.python.keyword
    //
    // Each token property is a color string (e.g. '#569cd6').
    // Additional style properties (fontWeight, fontStyle) are supported for some tokens.
    highlight: {
      // Semantic token colors (base — all languages)
      keyword:       '',   // for, if, while, return, import, class, function, etc.
      controlKeyword: '',  // if, else, for, while, try, catch — control flow subset
      string:        '',   // "hello", 'world', `template`
      number:        '',   // 42, 3.14, 0xFF
      comment:       '',   // // line comment, /* block comment */
      function:      '',   // function names: print(), len(), my_func()
      variable:      '',   // variable names
      type:          '',   // type/class names: int, String, MyClass
      operator:      '',   // +, -, *, =, ==, !=, &&
      punctuation:   '',   // (), {}, [], ;, :, .
      property:      '',   // object.property, dict.key
      constant:      '',   // true, false, null, None, nil
      regexp:        '',   // /pattern/flags
      escape:        '',   // \n, \t, unicode escapes
      tag:           '',   // HTML/XML tag names
      attribute:     '',   // HTML/XML attribute names
      attributeValue: '',  // HTML/XML attribute values
      meta:          '',   // preprocessor, decorators, annotations
      inserted:      '',   // diff: added lines
      deleted:       '',   // diff: removed lines
      changed:       '',   // diff: changed lines

      // Style modifiers for specific tokens (beyond just color)
      keywordStyle:  '',   // '' | 'bold' | 'italic' | 'bold italic'
      commentStyle:  '',   // '' | 'italic' | 'bold' | 'bold italic'
      functionStyle: '',   // '' | 'bold' | 'italic'
      typeStyle:     '',   // '' | 'bold' | 'italic'

      // Per-language overrides
      // Each language key contains the same token properties as above.
      // Only non-empty values override the base.
      languages: {
        python:     { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        r:          { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        julia:      { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        javascript: { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        typescript: { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        html:       { keyword: '', string: '', comment: '', tag: '', attribute: '', attributeValue: '', punctuation: '', meta: '', commentStyle: '' },
        css:        { keyword: '', string: '', number: '', comment: '', property: '', punctuation: '', constant: '', meta: '', commentStyle: '' },
        sql:        { keyword: '', string: '', number: '', comment: '', function: '', operator: '', punctuation: '', constant: '', keywordStyle: '', commentStyle: '' },
        rust:       { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        go:         { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        java:       { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        cpp:        { keyword: '', controlKeyword: '', string: '', number: '', comment: '', function: '', variable: '', type: '', operator: '', punctuation: '', property: '', constant: '', meta: '', keywordStyle: '', commentStyle: '', functionStyle: '', typeStyle: '' },
        shell:      { keyword: '', string: '', number: '', comment: '', variable: '', operator: '', punctuation: '', constant: '', commentStyle: '' },
        yaml:       { keyword: '', string: '', number: '', comment: '', property: '', punctuation: '', constant: '', commentStyle: '' },
        json:       { keyword: '', string: '', number: '', property: '', punctuation: '', constant: '' },
      },
    },
  },
  link: {
    color: '',
    underline: '',
  },
  table: {
    borderColor: '',
    headerBackground: '',
    headerColor: '',       // header text color
    headerFontWeight: '',  // '' | '400' | '600' | '700' | '800'
    fontFamily: '',        // table body font (falls back to body font)
    fontSize: '',          // e.g. '0.9em' — relative to body
    color: '',             // table body text color
    cellPadding: '',       // e.g. '8px 12px'
    stripedRows: '',       // '' | 'even' | 'odd' — alternating row background
    stripedColor: '',      // background color for striped rows
  },
  math: {
    color: '',                // math text color
    fontSize: '',             // e.g. '1.1em' — relative size for math
    displayBackground: '',    // background behind display math blocks
    displayPadding: '',       // padding for display math blocks
    displayBorderRadius: '',  // border radius for display math blocks
  },
  hr: {
    color: '',
    style: '',           // '' | 'solid' | 'dashed' | 'dotted'
    thickness: '',       // e.g. '1px', '2px'
  },
  list: {
    bulletStyle: '',     // '' | 'disc' | 'circle' | 'square' | 'dash'
    numberStyle: '',     // '' | 'decimal' | 'lower-alpha' | 'lower-roman' | 'upper-alpha' | 'upper-roman'
  },
  image: {
    captionFontSize: '', // e.g. '0.9em'
    captionColor: '',
    borderRadius: '',    // e.g. '4px'
    maxWidth: '',        // e.g. '100%', '80%'
  },
  toc: {
    enabled: '',         // '' | 'true' | 'false' — whether export includes TOC
    depth: '',           // '' | '2' | '3' | '4' — heading depth for TOC
  },
};

export const documentTemplatePresets = [
  defaultDocumentTemplate,
  {
    name: 'Manuscript',
    version: 1,
    page: { background: '#fffefc', maxWidth: '760px' },
    body: {
      fontFamily: 'Charter, Georgia, serif',
      fontSize: '17px',
      lineHeight: '1.8',
      color: '#232323',
    },
    heading: {
      color: '#121212',
      h1: { fontSize: '2.3em', fontWeight: '800' },
      h2: { fontSize: '1.75em', fontWeight: '700' },
      h3: { fontSize: '1.35em', fontWeight: '700' },
    },
    blockquote: {
      borderLeftColor: '#7c3aed',
      background: '#f6f1ff',
      color: '#4b5563',
    },
    code: {
      inline: {
        fontFamily: 'JetBrains Mono, monospace',
        background: '#f3f4f6',
        color: '#9d174d',
      },
      block: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.84em',
        background: '#111827',
        color: '#e5e7eb',
      },
    },
    link: { color: '#1d4ed8', underline: true },
    table: { borderColor: '#d1d5db', headerBackground: '#f9fafb' },
  },
  {
    name: 'Report',
    version: 1,
    page: { background: '#ffffff', maxWidth: '900px' },
    body: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '15px',
      lineHeight: '1.7',
      color: '#1f2937',
    },
    heading: {
      color: '#0f172a',
      h1: { fontSize: '2.1em', fontWeight: '800' },
      h2: { fontSize: '1.6em', fontWeight: '700' },
      h3: { fontSize: '1.25em', fontWeight: '700' },
    },
    blockquote: {
      borderLeftColor: '#2563eb',
      background: '#eff6ff',
      color: '#334155',
    },
    code: {
      inline: {
        fontFamily: 'JetBrains Mono, monospace',
        background: '#eef2ff',
        color: '#4338ca',
      },
      block: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.82em',
        background: '#0f172a',
        color: '#e2e8f0',
      },
    },
    link: { color: '#2563eb', underline: true },
    table: { borderColor: '#cbd5e1', headerBackground: '#f8fafc' },
  },
  {
    name: 'Notebook',
    version: 1,
    page: { background: '', maxWidth: '840px' },
    body: {
      fontFamily: 'Alegreya, Georgia, serif',
      fontSize: '18px',
      lineHeight: '1.75',
      color: '',
    },
    heading: {
      color: '',
      h1: { fontSize: '2.4em', fontWeight: '800' },
      h2: { fontSize: '1.8em', fontWeight: '700' },
      h3: { fontSize: '1.4em', fontWeight: '700' },
    },
    blockquote: {
      borderLeftColor: '#f59e0b',
      background: '#fffbeb',
      color: '#5b4636',
    },
    code: {
      inline: {
        fontFamily: 'SF Mono, monospace',
        background: '#f3f4f6',
        color: '#b45309',
      },
      block: {
        fontFamily: 'SF Mono, monospace',
        fontSize: '0.8em',
        background: '#f8fafc',
        color: '#111827',
      },
    },
    link: { color: '#0ea5e9', underline: true },
    table: { borderColor: '#e5e7eb', headerBackground: '#fafaf9' },
  },
  // ── Academic ──────────────────────────────────────────────
  // Formal serif layout for papers, theses, and research notes.
  // Tight body, generous heading hierarchy, muted palette.
  {
    name: 'Academic',
    version: 1,
    page: { background: '#ffffff', maxWidth: '780px', paperSize: 'letter', marginTop: '1in', marginBottom: '1in', marginLeft: '1.25in', marginRight: '1.25in' },
    body: {
      fontFamily: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif',
      fontSize: '16px',
      lineHeight: '1.65',
      color: '#1a1a1a',
      paragraphSpacing: '0.6em',
    },
    heading: {
      color: '#1a1a1a',
      numbering: 'all',
      h1: { fontSize: '1.9em', fontWeight: '700' },
      h2: { fontSize: '1.5em', fontWeight: '700' },
      h3: { fontSize: '1.2em', fontWeight: '700' },
      h4: { fontSize: '1.05em', fontWeight: '700' },
    },
    blockquote: {
      borderLeftColor: '#6b7280',
      background: '#f9fafb',
      color: '#374151',
      fontStyle: 'italic',
    },
    code: {
      inline: {
        fontFamily: 'Inconsolata, "Source Code Pro", monospace',
        background: '#f3f4f6',
        color: '#6d28d9',
      },
      block: {
        fontFamily: 'Inconsolata, "Source Code Pro", monospace',
        fontSize: '0.85em',
        background: '#f8f9fa',
        color: '#1f2937',
        lineNumbers: 'true',
      },
      highlight: {
        keyword: '#7c3aed',
        controlKeyword: '#be185d',
        string: '#059669',
        number: '#d97706',
        comment: '#6b7280',
        function: '#1e40af',
        variable: '#1f2937',
        type: '#0d9488',
        operator: '#374151',
        punctuation: '#6b7280',
        property: '#1e40af',
        constant: '#7c3aed',
        commentStyle: 'italic',
        typeStyle: 'italic',
      },
    },
    link: { color: '#1e40af', underline: true },
    table: { borderColor: '#9ca3af', headerBackground: '#f3f4f6' },
    hr: { color: '#d1d5db', style: 'solid', thickness: '1px' },
    toc: { enabled: 'true', depth: '3' },
  },
  // ── Dark Prose ───────────────────────────────────────────
  // Warm dark background with soft amber text — easy on the eyes
  // for long reading sessions. Earthy blockquotes, muted code.
  {
    name: 'Dark Prose',
    version: 1,
    page: { background: '#1c1917', maxWidth: '760px' },
    body: {
      fontFamily: '"Libre Baskerville", Georgia, serif',
      fontSize: '17px',
      lineHeight: '1.85',
      color: '#d6d3d1',
    },
    heading: {
      color: '#fafaf9',
      h1: { fontSize: '2.2em', fontWeight: '700' },
      h2: { fontSize: '1.65em', fontWeight: '700' },
      h3: { fontSize: '1.3em', fontWeight: '600' },
    },
    blockquote: {
      borderLeftColor: '#a16207',
      background: '#292524',
      color: '#a8a29e',
      fontStyle: 'italic',
    },
    code: {
      inline: {
        fontFamily: 'JetBrains Mono, monospace',
        background: '#292524',
        color: '#fbbf24',
      },
      block: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.84em',
        background: '#0c0a09',
        color: '#e7e5e4',
      },
      highlight: {
        keyword: '#fbbf24',
        controlKeyword: '#f59e0b',
        string: '#a3e635',
        number: '#e879f9',
        comment: '#78716c',
        function: '#38bdf8',
        variable: '#e7e5e4',
        type: '#34d399',
        operator: '#a8a29e',
        punctuation: '#a8a29e',
        property: '#67e8f9',
        constant: '#fbbf24',
        commentStyle: 'italic',
      },
    },
    link: { color: '#f59e0b', underline: false },
    table: { borderColor: '#44403c', headerBackground: '#292524' },
    hr: { color: '#44403c', style: 'solid', thickness: '1px' },
    image: { borderRadius: '4px' },
  },
  // ── Magazine ─────────────────────────────────────────────
  // Bold sans-serif, compact body, strong color accents.
  // Inspired by digital publication and editorial layouts.
  {
    name: 'Magazine',
    version: 1,
    page: { background: '#ffffff', maxWidth: '880px' },
    body: {
      fontFamily: '"Source Sans Pro", "Open Sans", system-ui, sans-serif',
      fontSize: '15px',
      lineHeight: '1.65',
      color: '#292524',
      paragraphSpacing: '0.8em',
    },
    heading: {
      color: '#0f172a',
      h1: { fontSize: '2.8em', fontWeight: '900' },
      h2: { fontSize: '1.9em', fontWeight: '800' },
      h3: { fontSize: '1.35em', fontWeight: '700' },
    },
    blockquote: {
      borderLeftColor: '#e11d48',
      background: '#fff1f2',
      color: '#4c0519',
    },
    code: {
      inline: {
        fontFamily: 'SF Mono, "Fira Code", monospace',
        background: '#f1f5f9',
        color: '#0f766e',
      },
      block: {
        fontFamily: 'SF Mono, "Fira Code", monospace',
        fontSize: '0.82em',
        background: '#0f172a',
        color: '#e2e8f0',
      },
    },
    link: { color: '#e11d48', underline: false },
    table: { borderColor: '#e2e8f0', headerBackground: '#f8fafc' },
    hr: { color: '#e11d48', style: 'solid', thickness: '2px' },
    image: { borderRadius: '6px', maxWidth: '100%' },
    list: { bulletStyle: 'square' },
  },
  // ── Warm Novel ───────────────────────────────────────────
  // Cream paper, generous margins, Garamond-style type.
  // Optimized for fiction, essays, and immersive long-form reading.
  {
    name: 'Warm Novel',
    version: 1,
    page: { background: '#fdf6e3', maxWidth: '680px', paperSize: 'a5' },
    body: {
      fontFamily: '"EB Garamond", Garamond, "Times New Roman", serif',
      fontSize: '19px',
      lineHeight: '1.9',
      color: '#3c3226',
      paragraphSpacing: '0.5em',
    },
    heading: {
      color: '#2c1810',
      h1: { fontSize: '2.4em', fontWeight: '600' },
      h2: { fontSize: '1.7em', fontWeight: '600' },
      h3: { fontSize: '1.3em', fontWeight: '600' },
    },
    blockquote: {
      borderLeftColor: '#92400e',
      background: '#fef3c7',
      color: '#78350f',
      fontStyle: 'italic',
    },
    code: {
      inline: {
        fontFamily: '"Courier Prime", "Courier New", monospace',
        background: '#fef9ef',
        color: '#92400e',
      },
      block: {
        fontFamily: '"Courier Prime", "Courier New", monospace',
        fontSize: '0.82em',
        background: '#fffbeb',
        color: '#422006',
      },
    },
    link: { color: '#b45309', underline: true },
    table: { borderColor: '#d6cbb5', headerBackground: '#fef9ef' },
    hr: { color: '#d6cbb5', style: 'solid', thickness: '1px' },
  },
  // ── Swiss Minimal ────────────────────────────────────────
  // Ultra-clean Helvetica/system sans, lots of whitespace,
  // no decorative accents — lets the content breathe.
  {
    name: 'Swiss Minimal',
    version: 1,
    page: { background: '#ffffff', maxWidth: '720px' },
    body: {
      fontFamily: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',
      fontSize: '15px',
      lineHeight: '1.7',
      color: '#111111',
      paragraphSpacing: '1em',
    },
    heading: {
      color: '#000000',
      h1: { fontSize: '2.6em', fontWeight: '300' },
      h2: { fontSize: '1.8em', fontWeight: '400' },
      h3: { fontSize: '1.2em', fontWeight: '600' },
    },
    blockquote: {
      borderLeftColor: '#111111',
      background: '',
      color: '#555555',
    },
    code: {
      inline: {
        fontFamily: 'SF Mono, "Cascadia Code", monospace',
        background: '#f5f5f5',
        color: '#333333',
      },
      block: {
        fontFamily: 'SF Mono, "Cascadia Code", monospace',
        fontSize: '0.84em',
        background: '#fafafa',
        color: '#222222',
      },
    },
    link: { color: '#111111', underline: true },
    table: { borderColor: '#e5e5e5', headerBackground: '#fafafa' },
    hr: { color: '#e5e5e5', style: 'solid', thickness: '1px' },
    list: { bulletStyle: 'dash' },
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return clone(base);
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = mergeDeep(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function normalizeDocumentTemplate(template = {}) {
  const merged = mergeDeep(defaultDocumentTemplate, template || {});
  if (!merged.name) merged.name = 'Untitled Template';
  if (!merged.version) merged.version = 1;
  return merged;
}

export function cloneDocumentTemplate(template) {
  return clone(normalizeDocumentTemplate(template));
}

export function findDocumentTemplatePreset(name) {
  return documentTemplatePresets.find((t) => t.name === name) || null;
}

const HEADING_MARK_CONTEXT_SELECTORS = ['.cm-md-h1', '.cm-md-h2', '.cm-md-h3', '.cm-md-h4', '.cm-md-h5', '.cm-md-h6'];

/**
 * Build CSS rule objects for inline mark overrides (bold, italic, underline, strikethrough).
 * `parentSel` can be empty, a selector string, or an array of selector strings.
 *
 * Important detail for CodeMirror decorations:
 * overlapping mark decorations often end up on the SAME span, not only in a
 * parent/child DOM relationship. So for contextual mark styling we emit both:
 *
 *   .cm-md-h1.cm-md-bold
 *   .cm-md-h1 .cm-md-bold
 *
 * Cascading order:
 *   inlineMarks.bold  →  heading.bold  →  heading.h1.bold
 * More-specific selectors win via normal CSS specificity.
 */
function inlineMarkCSS(scopeFn, source, parentSel) {
  if (!source) return {};
  const rules = {};
  const parents = Array.isArray(parentSel)
    ? parentSel.filter(Boolean)
    : parentSel
      ? String(parentSel).split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  const mk = (cls) => {
    const leaf = `.${cls}`;
    if (!parents.length) return scopeFn(leaf);
    return parents
      .flatMap((parent) => [scopeFn(`${parent}${leaf}`), scopeFn(`${parent} ${leaf}`)])
      .join(', ');
  };

  // Color precedence for inline marks is handled by the override extension.
  // This structural theme keeps only non-color typography + decoration rules.

  // --- Bold ---
  const b = source.bold;
  if (b) {
    const decls = {};
    if (b.fontFamily) decls.fontFamily = `${b.fontFamily} !important`;
    if (b.fontWeight) decls.fontWeight = `${b.fontWeight} !important`;
    if (b.relativeSize) decls.fontSize = `${b.relativeSize}em !important`;
    if (b.textTransform) decls.textTransform = `${b.textTransform} !important`;
    if (Object.keys(decls).length) rules[mk('cm-md-bold')] = decls;
  }

  // --- Italic ---
  const it = source.italic;
  if (it) {
    const decls = {};
    if (it.fontFamily) decls.fontFamily = `${it.fontFamily} !important`;
    if (it.fontStyle) decls.fontStyle = `${it.fontStyle} !important`;
    if (it.relativeSize) decls.fontSize = `${it.relativeSize}em !important`;
    if (it.textTransform) decls.textTransform = `${it.textTransform} !important`;
    if (Object.keys(decls).length) rules[mk('cm-md-italic')] = decls;
  }

  // --- Underline ---
  const ul = source.underline;
  if (ul) {
    const decls = {};
    if (ul.lineColor) decls.textDecorationColor = `${ul.lineColor} !important`;
    if (ul.lineStyle) decls.textDecorationStyle = `${ul.lineStyle} !important`;
    if (ul.textTransform) decls.textTransform = `${ul.textTransform} !important`;
    if (Object.keys(decls).length) rules[mk('cm-md-underline')] = decls;
  }

  // --- Strikethrough ---
  const st = source.strikethrough;
  if (st) {
    const decls = {};
    if (st.lineColor) decls.textDecorationColor = `${st.lineColor} !important`;
    if (st.textTransform) decls.textTransform = `${st.textTransform} !important`;
    if (Object.keys(decls).length) rules[mk('cm-md-strikethrough')] = decls;
  }

  return rules;
}

export function compileDocumentTemplateCSS(template, scope = '&') {
  const t = normalizeDocumentTemplate(template);
  const bodyFont = t.body.fontFamily || '';
  const bodySize = t.body.fontSize || '';
  const bodyLineHeight = t.body.lineHeight || '';
  const applyDocumentStyles = t.editor?.applyDocumentStyles !== false;

  if (!applyDocumentStyles) {
    return {};
  }

  const s = (sel) => `${scope} ${sel}`;

  return {
    // --- Page-level background covers the whole editor ---
    [scope]: {
      ...(t.page.background ? { backgroundColor: t.page.background } : {}),
      // Neutralize theme influence inside the document surface when document
      // styling is explicitly enabled. App chrome theme stays outside this scope.
      '--editor-background': t.page.background || '#ffffff',
      '--editor-foreground': t.body.color || '#222222',
      '--editor-selection': (() => {
        // Derive a visible selection color from the page background.
        // If the page is dark, use a lighter blue; if light, use a subtle blue tint.
        const bg = t.page.background || '#ffffff';
        const hex = bg.match(/^#([\da-f]{6})$/i);
        if (hex) {
          const r = parseInt(hex[1].slice(0, 2), 16);
          const g = parseInt(hex[1].slice(2, 4), 16);
          const b = parseInt(hex[1].slice(4, 6), 16);
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          return lum < 0.5 ? 'rgba(100, 149, 237, 0.4)' : 'rgba(59, 130, 246, 0.22)';
        }
        return 'rgba(59, 130, 246, 0.22)';
      })(),
      '--md-heading-color': t.heading?.color || (t.body.color || '#111827'),
      '--md-link-color': t.link?.color || '#1d4ed8',
      '--md-link-decoration': t.link?.underline === false ? 'none' : 'underline',
      '--md-code-background': t.code?.inline?.background || '#f3f4f6',
      '--md-code-color': t.code?.inline?.color || '#a31515',
      '--md-blockquote-color': t.blockquote?.color || (t.body.color || '#4b5563'),
      '--md-marker-color': '#9ca3af',
      '--md-list-marker-color': '#6b7280',
      '--md-hr-color': t.hr?.color || '#d1d5db',
      '--widget-text': t.body.color || '#222222',
      '--widget-text-muted': '#6b7280',
      '--widget-text-accent': t.link?.color || '#1d4ed8',
      '--widget-border': t.table?.borderColor || '#d1d5db',
      '--widget-surface': t.code?.block?.background || '#f8fafc',
      '--widget-surface-inset': '#f3f4f6',
    },
    [`${scope} .cm-scroller`]: {
      ...(t.page.background ? { backgroundColor: t.page.background } : {}),
      ...(t.page.maxWidth ? { ['--document-max-width']: t.page.maxWidth } : {}),
      ...(bodyFont ? { fontFamily: bodyFont } : {}),
      ...(bodySize ? { fontSize: bodySize } : {}),
      ...(bodyLineHeight ? { lineHeight: bodyLineHeight } : {}),
    },
    [`${scope} .cm-content`]: {
      ...(t.page.maxWidth ? { maxWidth: t.page.maxWidth } : {}),
    },
    // --- Body text ---
    [`${scope} .cm-line`]: {
      ...(bodyFont ? { fontFamily: bodyFont } : {}),
      ...(bodySize ? { fontSize: bodySize } : {}),
      ...(bodyLineHeight ? { lineHeight: bodyLineHeight } : {}),
      ...(t.body.textTransform ? { textTransform: t.body.textTransform } : {}),
    },
    // --- Paragraph spacing (applied as margin between paragraphs via empty lines) ---
    ...(t.body.paragraphSpacing ? {
      [`${scope} .cm-line:empty + .cm-line:not(:empty)`]: {
        marginTop: t.body.paragraphSpacing,
      },
    } : {}),
    // --- Headings h1-h6 ---
    [s('.cm-md-h1') + ', ' + s('.cm-frontmatter-title-input')]: {
      ...(t.heading?.h1?.fontSize ? { fontSize: t.heading.h1.fontSize } : {}),
      ...(t.heading?.h1?.fontWeight ? { fontWeight: t.heading.h1.fontWeight } : {}),
      ...((t.heading?.h1?.fontFamily || t.heading?.fontFamily || bodyFont) ? { fontFamily: t.heading?.h1?.fontFamily || t.heading?.fontFamily || bodyFont } : {}),
      ...((t.heading?.h1?.textTransform || t.heading?.textTransform || t.body?.textTransform) ? { textTransform: t.heading?.h1?.textTransform || t.heading?.textTransform || t.body?.textTransform } : {}),
    },
    [s('.cm-md-h2')]: {
      ...(t.heading?.h2?.fontSize ? { fontSize: t.heading.h2.fontSize } : {}),
      ...(t.heading?.h2?.fontWeight ? { fontWeight: t.heading.h2.fontWeight } : {}),
      ...((t.heading?.h2?.fontFamily || t.heading?.fontFamily || bodyFont) ? { fontFamily: t.heading?.h2?.fontFamily || t.heading?.fontFamily || bodyFont } : {}),
      ...((t.heading?.h2?.textTransform || t.heading?.textTransform || t.body?.textTransform) ? { textTransform: t.heading?.h2?.textTransform || t.heading?.textTransform || t.body?.textTransform } : {}),
    },
    [s('.cm-md-h3')]: {
      ...(t.heading?.h3?.fontSize ? { fontSize: t.heading.h3.fontSize } : {}),
      ...(t.heading?.h3?.fontWeight ? { fontWeight: t.heading.h3.fontWeight } : {}),
      ...((t.heading?.h3?.fontFamily || t.heading?.fontFamily || bodyFont) ? { fontFamily: t.heading?.h3?.fontFamily || t.heading?.fontFamily || bodyFont } : {}),
      ...((t.heading?.h3?.textTransform || t.heading?.textTransform || t.body?.textTransform) ? { textTransform: t.heading?.h3?.textTransform || t.heading?.textTransform || t.body?.textTransform } : {}),
    },
    [s('.cm-md-h4')]: {
      ...(t.heading?.h4?.fontSize ? { fontSize: t.heading.h4.fontSize } : {}),
      ...(t.heading?.h4?.fontWeight ? { fontWeight: t.heading.h4.fontWeight } : {}),
      ...((t.heading?.h4?.fontFamily || t.heading?.fontFamily || bodyFont) ? { fontFamily: t.heading?.h4?.fontFamily || t.heading?.fontFamily || bodyFont } : {}),
      ...((t.heading?.h4?.textTransform || t.heading?.textTransform || t.body?.textTransform) ? { textTransform: t.heading?.h4?.textTransform || t.heading?.textTransform || t.body?.textTransform } : {}),
    },
    [s('.cm-md-h5')]: {
      ...(t.heading?.h5?.fontSize ? { fontSize: t.heading.h5.fontSize } : {}),
      ...(t.heading?.h5?.fontWeight ? { fontWeight: t.heading.h5.fontWeight } : {}),
      ...((t.heading?.h5?.fontFamily || t.heading?.fontFamily || bodyFont) ? { fontFamily: t.heading?.h5?.fontFamily || t.heading?.fontFamily || bodyFont } : {}),
      ...((t.heading?.h5?.textTransform || t.heading?.textTransform || t.body?.textTransform) ? { textTransform: t.heading?.h5?.textTransform || t.heading?.textTransform || t.body?.textTransform } : {}),
    },
    [s('.cm-md-h6')]: {
      ...(t.heading?.h6?.fontSize ? { fontSize: t.heading.h6.fontSize } : {}),
      ...(t.heading?.h6?.fontWeight ? { fontWeight: t.heading.h6.fontWeight } : {}),
      ...((t.heading?.h6?.fontFamily || t.heading?.fontFamily || bodyFont) ? { fontFamily: t.heading?.h6?.fontFamily || t.heading?.fontFamily || bodyFont } : {}),
      ...((t.heading?.h6?.textTransform || t.heading?.textTransform || t.body?.textTransform) ? { textTransform: t.heading?.h6?.textTransform || t.heading?.textTransform || t.body?.textTransform } : {}),
    },
    [[
      s('.cm-frontmatter-subtitle'),
      s('.cm-frontmatter-author'),
      s('.cm-frontmatter-author-affiliation'),
      s('.cm-frontmatter-date'),
      s('.cm-frontmatter-abstract'),
      s('.cm-frontmatter-keyword'),
    ].join(', ')]: {
      ...(bodyFont ? { fontFamily: bodyFont } : {}),
      ...(t.body?.textTransform ? { textTransform: t.body.textTransform } : {}),
    },
    // --- Blockquotes ---
    [s('.cm-md-blockquote-line')]: {
      ...(t.blockquote?.borderLeftColor ? { borderLeftColor: t.blockquote.borderLeftColor } : {}),
      ...(t.blockquote?.background ? { backgroundColor: t.blockquote.background } : {}),
      ...(t.blockquote?.fontFamily ? { fontFamily: t.blockquote.fontFamily } : bodyFont ? { fontFamily: bodyFont } : {}),
      ...(t.blockquote?.fontStyle ? { fontStyle: t.blockquote.fontStyle } : {}),
      ...((t.blockquote?.textTransform || t.body?.textTransform) ? { textTransform: t.blockquote?.textTransform || t.body?.textTransform } : {}),
    },
    // --- Inline marks: base styles ---
    ...inlineMarkCSS(s, t.inlineMarks, ''),
    // --- Inline marks: heading-wide overrides (all h1-h6) ---
    ...inlineMarkCSS(s, t.heading, HEADING_MARK_CONTEXT_SELECTORS),
    // --- Inline marks: per-heading-level overrides (h1-h6) ---
    ...inlineMarkCSS(s, t.heading?.h1, '.cm-md-h1'),
    ...inlineMarkCSS(s, t.heading?.h2, '.cm-md-h2'),
    ...inlineMarkCSS(s, t.heading?.h3, '.cm-md-h3'),
    ...inlineMarkCSS(s, t.heading?.h4, '.cm-md-h4'),
    ...inlineMarkCSS(s, t.heading?.h5, '.cm-md-h5'),
    ...inlineMarkCSS(s, t.heading?.h6, '.cm-md-h6'),
    // --- Inline marks: blockquote overrides ---
    ...inlineMarkCSS(s, t.blockquote, '.cm-md-blockquote-line'),
    // --- Inline code ---
    [s('.cm-md-inline-code')]: {
      ...(t.code?.inline?.fontFamily ? { fontFamily: t.code.inline.fontFamily } : {}),
      ...(t.code?.inline?.background ? { backgroundColor: t.code.inline.background } : {}),
    },
    // --- Code blocks (source) ---
    // Use box-shadow instead of background-color on .cm-line elements so
    // CM6's selection layer (which paints below .cm-line) stays visible.
    [s('.cm-codeblock-line') + ', ' + s('.cm-codeblock-fence') + ', ' + s('.cm-wysiwyg-code-fence-line')]: {
      ...(t.code?.block?.fontFamily ? { fontFamily: t.code.block.fontFamily } : {}),
      ...(t.code?.block?.fontSize ? { fontSize: t.code.block.fontSize } : {}),
      ...(t.code?.block?.background ? { boxShadow: `inset 0 0 0 9999px ${t.code.block.background}` } : {}),
    },
    [s('.cm-wysiwyg-code-fence-widget') + ', ' + s('.cm-wysiwyg-code-header')]: {
      ...(t.code?.block?.background ? { backgroundColor: t.code.block.background } : {}),
    },
    // --- Output widgets: inherit page background so they don't punch holes ---
    ...(t.page.background ? {
      [s('.cm-output-widget') + ', ' + s('.cm-html-output-widget') + ', ' + s('.cm-css-output-widget') + ', ' + s('.cm-scroll-output-widget') + ', ' + s('.cm-json-output-widget')]: {
        background: `color-mix(in srgb, ${t.page.background} 85%, black)`,
      },
    } : {}),
    // --- Links ---
    [s('.cm-md-link-text') + ', ' + s('.cm-external-link') + ', ' + s('.cm-file-link') + ', ' + s('.cm-wiki-link')]: {
      ...(t.link?.underline === false ? { textDecoration: 'none' } : {}),
    },
    // --- Tables ---
    [s('.cm-table-widget table') + ', ' + s('.cm-table-widget th') + ', ' + s('.cm-table-widget td')]: {
      ...(t.table?.borderColor ? { borderColor: t.table.borderColor } : {}),
    },
    [s('.cm-table-widget table')]: {
      ...(t.table?.fontFamily ? { fontFamily: t.table.fontFamily } : bodyFont ? { fontFamily: bodyFont } : {}),
      ...(t.table?.fontSize ? { fontSize: t.table.fontSize } : {}),
    },
    [s('.cm-table-widget th')]: {
      ...(t.table?.headerBackground ? { backgroundColor: t.table.headerBackground } : {}),
      ...(t.table?.headerColor ? { color: t.table.headerColor } : {}),
      ...(t.table?.headerFontWeight ? { fontWeight: t.table.headerFontWeight } : {}),
    },
    [s('.cm-table-widget td')]: {
      ...(t.table?.color ? { color: t.table.color } : {}),
      ...(t.table?.cellPadding ? { padding: t.table.cellPadding } : {}),
    },
    // Striped rows
    ...(t.table?.stripedRows && t.table?.stripedColor ? {
      [s(`.cm-table-widget tbody tr:nth-child(${t.table.stripedRows}) td`)]: {
        backgroundColor: t.table.stripedColor,
      },
    } : {}),
    // --- Math ---
    // KaTeX renders its own elements inside .cm-math-* containers.
    // We must target .katex and internal spans to override KaTeX's own color.
    ...(t.math?.color || t.math?.fontSize ? {
      [s('.cm-math-inline') + ', ' + s('.cm-math-display')]: {
        ...(t.math.color ? { color: t.math.color } : {}),
        ...(t.math.fontSize ? { fontSize: t.math.fontSize } : {}),
      },
      // KaTeX internal elements need explicit override
      [s('.cm-math-inline .katex') + ', ' + s('.cm-math-display .katex')]: {
        ...(t.math.color ? { color: `${t.math.color} !important` } : {}),
        ...(t.math.fontSize ? { fontSize: t.math.fontSize } : {}),
      },
    } : {}),
    ...(t.math?.displayBackground || t.math?.displayPadding || t.math?.displayBorderRadius ? {
      [s('.cm-math-display')]: {
        ...(t.math.displayBackground ? { backgroundColor: t.math.displayBackground } : {}),
        ...(t.math.displayPadding ? { padding: t.math.displayPadding } : {}),
        ...(t.math.displayBorderRadius ? { borderRadius: t.math.displayBorderRadius } : {}),
      },
    } : {}),
    // --- Horizontal rules ---
    ...(t.hr?.color || t.hr?.thickness ? {
      [s('.cm-md-hr-line::after')]: {
        ...(t.hr.color ? { background: t.hr.color } : {}),
        ...(t.hr.thickness ? { height: t.hr.thickness } : {}),
      },
    } : {}),
    // --- List markers ---
    ...(t.list?.bulletStyle ? {
      [s('.cm-md-list-bullet')]: {
        content: ({ disc: '"•"', circle: '"○"', square: '"■"', dash: '"—"' })[t.list.bulletStyle] || undefined,
      },
    } : {}),
    // --- Neutralize syntax-theme token colors inside ALL code surfaces ---
    // ALWAYS neutralize ͼN (CodeMirror HighlightStyle) classes so the
    // app theme's syntax colors don't leak through.  Document-template-owned
    // token colors are applied via deterministic .cm-dt-* classes stamped by
    // our tagHighlighter extension; those rules use higher specificity and
    // !important in the override <style> element, so they win here.
    // When no highlight tokens are set, code blocks simply inherit
    // code.block.color (or body.color) — clean, theme-neutral look.
    [s('.cm-codeblock-line span[class^="ͼ"], .cm-codeblock-line span[class*=" ͼ"], .cm-codeblock-line span[class*="ͼ"], .cm-codeblock-fence span[class^="ͼ"], .cm-codeblock-fence span[class*=" ͼ"], .cm-codeblock-fence span[class*="ͼ"], .cm-wysiwyg-code-fence-line span[class^="ͼ"], .cm-wysiwyg-code-fence-line span[class*=" ͼ"], .cm-wysiwyg-code-fence-line span[class*="ͼ"], .cm-md-inline-code span[class^="ͼ"], .cm-md-inline-code span[class*=" ͼ"], .cm-md-inline-code span[class*="ͼ"]')]: {
      color: 'inherit !important',
      backgroundColor: 'transparent !important',
      fontStyle: 'inherit !important',
      fontWeight: 'inherit !important',
      textDecorationColor: 'inherit !important',
    },
    // --- Code block additional properties ---
    ...(t.code?.block?.lineHeight ? {
      [s('.cm-codeblock-line')]: {
        ...((rules) => rules)({}),
        lineHeight: t.code.block.lineHeight,
      },
    } : {}),
    ...(t.code?.block?.borderRadius ? {
      [s('.cm-codeblock-fence:first-child, .cm-codeblock-line:first-child')]: {
        borderTopLeftRadius: t.code.block.borderRadius,
        borderTopRightRadius: t.code.block.borderRadius,
      },
      [s('.cm-codeblock-fence:last-child, .cm-codeblock-line:last-child')]: {
        borderBottomLeftRadius: t.code.block.borderRadius,
        borderBottomRightRadius: t.code.block.borderRadius,
      },
    } : {}),
    ...(t.code?.block?.borderColor ? {
      [s('.cm-codeblock-fence') + ', ' + s('.cm-codeblock-line')]: {
        borderLeft: `1px solid ${t.code.block.borderColor}`,
        borderRight: `1px solid ${t.code.block.borderColor}`,
      },
      [s('.cm-codeblock-fence:first-of-type')]: {
        borderTop: `1px solid ${t.code.block.borderColor}`,
      },
      [s('.cm-codeblock-fence:last-of-type')]: {
        borderBottom: `1px solid ${t.code.block.borderColor}`,
      },
    } : {}),
    ...(t.code?.block?.padding ? {
      [s('.cm-codeblock-line')]: {
        paddingLeft: t.code.block.padding,
        paddingRight: t.code.block.padding,
      },
    } : {}),
    // --- Code cell chrome ---
    ...(t.code?.cell?.headerBackground || t.code?.cell?.headerColor || t.code?.cell?.headerBorderColor ? {
      [s('.cm-wysiwyg-code-header')]: {
        ...(t.code.cell.headerBackground ? { backgroundColor: `${t.code.cell.headerBackground} !important` } : {}),
        ...(t.code.cell.headerColor ? { color: `${t.code.cell.headerColor} !important` } : {}),
        ...(t.code.cell.headerBorderColor ? { borderBottomColor: `${t.code.cell.headerBorderColor} !important` } : {}),
      },
    } : {}),
    ...(t.code?.cell?.outputBackground || t.code?.cell?.outputColor || t.code?.cell?.outputBorderColor ||
        t.code?.cell?.outputFontFamily || t.code?.cell?.outputFontSize || t.code?.cell?.outputLineHeight ? {
      [s('.cm-output-widget') + ', ' + s('.cm-html-output-widget') + ', ' + s('.cm-css-output-widget') + ', ' + s('.cm-scroll-output-widget') + ', ' + s('.cm-json-output-widget')]: {
        ...(t.code.cell.outputBackground ? { backgroundColor: `${t.code.cell.outputBackground} !important` } : {}),
        ...(t.code.cell.outputColor ? { color: `${t.code.cell.outputColor} !important` } : {}),
        ...(t.code.cell.outputBorderColor ? { borderTopColor: `${t.code.cell.outputBorderColor} !important` } : {}),
        ...(t.code.cell.outputFontFamily ? { fontFamily: `${t.code.cell.outputFontFamily} !important` } : {}),
        ...(t.code.cell.outputFontSize ? { fontSize: `${t.code.cell.outputFontSize} !important` } : {}),
        ...(t.code.cell.outputLineHeight ? { lineHeight: `${t.code.cell.outputLineHeight} !important` } : {}),
      },
    } : {}),
    // Output content (pre blocks inside output widgets)
    ...(t.code?.cell?.outputFontFamily || t.code?.cell?.outputFontSize ? {
      [s('.cm-output-content') + ', ' + s('.cm-scroll-output-content')]: {
        ...(t.code.cell.outputFontFamily ? { fontFamily: `${t.code.cell.outputFontFamily} !important` } : {}),
        ...(t.code.cell.outputFontSize ? { fontSize: `${t.code.cell.outputFontSize} !important` } : {}),
      },
    } : {}),
    // Scroll output header bar
    ...(t.code?.cell?.headerBackground || t.code?.cell?.headerColor ? {
      [s('.cm-scroll-output-header')]: {
        ...(t.code.cell.headerBackground ? { backgroundColor: `${t.code.cell.headerBackground} !important` } : {}),
        ...(t.code.cell.headerColor ? { color: `${t.code.cell.headerColor} !important` } : {}),
      },
    } : {}),
    // --- Images ---
    [s('.cm-image-block-img')]: {
      ...(t.image?.borderRadius ? { borderRadius: t.image.borderRadius } : {}),
      ...(t.image?.maxWidth ? { maxWidth: t.image.maxWidth } : {}),
    },
    [s('.cm-image-caption')]: {
      ...(bodyFont ? { fontFamily: bodyFont } : {}),
      ...(t.image?.captionFontSize ? { fontSize: t.image.captionFontSize } : {}),
      ...(t.image?.captionColor ? { color: t.image.captionColor } : t.body.color ? { color: t.body.color } : {}),
      opacity: '0.8',
    },
    // --- Page break markers ---
    [s('.cm-pagebreak-line')]: {
      position: 'relative',
      height: '3em',
      lineHeight: '3em',
      textAlign: 'center',
      color: 'transparent',
      userSelect: 'none',
    },
    [s('.cm-pagebreak-line::after')]: {
      content: '"— page break —"',
      position: 'absolute',
      left: '0',
      right: '0',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--text-secondary, #999)',
      fontSize: '11px',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      borderTop: '2px dashed var(--border, #ddd)',
      paddingTop: '8px',
    },
  };
}

function cssDecls(obj = {}) {
  return Object.entries(obj)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `  ${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${value};`)
    .join('\n');
}

export function serializeDocumentTemplateToCss(template, scope = '.markdown-body') {
  const t = normalizeDocumentTemplate(template);
  const bodyFont = t.body.fontFamily || undefined;
  const bodySize = t.body.fontSize || undefined;
  const bodyLineHeight = t.body.lineHeight || undefined;

  return [
    `${scope} {\n${cssDecls({
      backgroundColor: t.page.background || undefined,
      color: t.body.color || undefined,
      fontFamily: bodyFont,
      fontSize: bodySize,
      lineHeight: bodyLineHeight,
      textTransform: t.body?.textTransform || undefined,
      maxWidth: t.page.maxWidth || undefined,
    })}\n}`,
    `${scope} h1 {\n${cssDecls({
      color: t.heading?.color || undefined,
      fontFamily: t.heading?.h1?.fontFamily || t.heading?.fontFamily || bodyFont,
      fontSize: t.heading?.h1?.fontSize || undefined,
      fontWeight: t.heading?.h1?.fontWeight || undefined,
      textTransform: t.heading?.h1?.textTransform || t.heading?.textTransform || t.body?.textTransform || undefined,
    })}\n}`,
    `${scope} h2 {\n${cssDecls({
      color: t.heading?.color || undefined,
      fontFamily: t.heading?.h2?.fontFamily || t.heading?.fontFamily || bodyFont,
      fontSize: t.heading?.h2?.fontSize || undefined,
      fontWeight: t.heading?.h2?.fontWeight || undefined,
      textTransform: t.heading?.h2?.textTransform || t.heading?.textTransform || t.body?.textTransform || undefined,
    })}\n}`,
    `${scope} h3 {\n${cssDecls({
      color: t.heading?.color || undefined,
      fontFamily: t.heading?.h3?.fontFamily || t.heading?.fontFamily || bodyFont,
      fontSize: t.heading?.h3?.fontSize || undefined,
      fontWeight: t.heading?.h3?.fontWeight || undefined,
      textTransform: t.heading?.h3?.textTransform || t.heading?.textTransform || t.body?.textTransform || undefined,
    })}\n}`,
    `${scope} blockquote {\n${cssDecls({
      borderLeftColor: t.blockquote?.borderLeftColor || undefined,
      backgroundColor: t.blockquote?.background || undefined,
      color: t.blockquote?.color || undefined,
      fontFamily: t.blockquote?.fontFamily || bodyFont,
      fontStyle: t.blockquote?.fontStyle || undefined,
      textTransform: t.blockquote?.textTransform || t.body?.textTransform || undefined,
    })}\n}`,
    `${scope} code {\n${cssDecls({
      fontFamily: t.code?.inline?.fontFamily || undefined,
      backgroundColor: t.code?.inline?.background || undefined,
      color: t.code?.inline?.color || undefined,
    })}\n}`,
    `${scope} pre, ${scope} pre code {\n${cssDecls({
      fontFamily: t.code?.block?.fontFamily || undefined,
      fontSize: t.code?.block?.fontSize || undefined,
      backgroundColor: t.code?.block?.background || undefined,
      color: t.code?.block?.color || undefined,
    })}\n}`,
    `${scope} a {\n${cssDecls({
      color: t.link?.color || undefined,
      textDecoration: t.link?.underline === false ? 'none' : undefined,
    })}\n}`,
    `${scope} table {\n${cssDecls({
      borderCollapse: 'collapse',
      width: '100%',
      fontFamily: t.table?.fontFamily || bodyFont || undefined,
      fontSize: t.table?.fontSize || undefined,
    })}\n}`,
    `${scope} table, ${scope} th, ${scope} td {\n${cssDecls({ borderColor: t.table?.borderColor || undefined })}\n}`,
    `${scope} th {\n${cssDecls({
      backgroundColor: t.table?.headerBackground || undefined,
      color: t.table?.headerColor || undefined,
      fontWeight: t.table?.headerFontWeight || undefined,
    })}\n}`,
    `${scope} td {\n${cssDecls({
      color: t.table?.color || undefined,
      padding: t.table?.cellPadding || undefined,
    })}\n}`,
    ...(t.table?.stripedRows && t.table?.stripedColor ? [
      `${scope} tbody tr:nth-child(${t.table.stripedRows}) td {\n${cssDecls({
        backgroundColor: t.table.stripedColor,
      })}\n}`,
    ] : []),
    ...(t.math?.color || t.math?.fontSize ? [
      `${scope} .math, ${scope} .MathJax, ${scope} .katex {\n${cssDecls({
        color: t.math?.color || undefined,
        fontSize: t.math?.fontSize || undefined,
      })}\n}`,
    ] : []),
    // Syntax highlighting token classes for code blocks (used by highlight.js / Pandoc)
    ...(() => {
      const hl = t.code?.highlight;
      if (!hl) return [];
      // Map our token names to common highlight.js / Pandoc CSS classes
      const hlMap = {
        keyword: '.hljs-keyword, .kw',
        controlKeyword: '.hljs-keyword.hljs-control',
        string: '.hljs-string, .st',
        number: '.hljs-number, .fl, .dv',
        comment: '.hljs-comment, .co',
        function: '.hljs-function, .hljs-title.function_, .fu',
        variable: '.hljs-variable, .va',
        type: '.hljs-type, .hljs-title.class_, .dt',
        operator: '.hljs-operator, .op',
        punctuation: '.hljs-punctuation',
        property: '.hljs-property, .hljs-attr',
        constant: '.hljs-literal, .hljs-built_in, .cn',
        regexp: '.hljs-regexp, .ss',
        escape: '.hljs-char.escape_, .sc',
        tag: '.hljs-tag, .hljs-name',
        attribute: '.hljs-attr',
        meta: '.hljs-meta, .an',
      };
      const rules = [];
      for (const [token, sel] of Object.entries(hlMap)) {
        if (hl[token]) {
          const selectors = sel.split(',').map((s) => `${scope} pre ${s.trim()}`).join(', ');
          const decls = { color: hl[token] || undefined };
          if (token === 'keyword' && hl.keywordStyle) Object.assign(decls, parseStyleModifier(hl.keywordStyle));
          if (token === 'comment' && hl.commentStyle) Object.assign(decls, parseStyleModifier(hl.commentStyle));
          if (token === 'function' && hl.functionStyle) Object.assign(decls, parseStyleModifier(hl.functionStyle));
          if (token === 'type' && hl.typeStyle) Object.assign(decls, parseStyleModifier(hl.typeStyle));
          rules.push(`${selectors} {\n${cssDecls(decls)}\n}`);
        }
      }
      return rules;
    })(),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Font mapping: CSS font-family → system font names for Pandoc (xelatex/lualatex)
// and LaTeX package names for pdflatex fallback.
// ---------------------------------------------------------------------------

const FONT_MAP = [
  // CSS family pattern → { system: <OTF/TTF name for xelatex>, latex: <package for pdflatex>, category }
  { css: /charter/i,             system: 'XCharter',            latex: 'XCharter',          category: 'serif' },
  { css: /georgia/i,             system: 'Georgia',             latex: 'mathpazo',          category: 'serif' },
  { css: /times\s*new\s*roman/i, system: 'Times New Roman',     latex: 'mathptmx',          category: 'serif' },
  { css: /palatino/i,            system: 'Palatino Linotype',   latex: 'mathpazo',          category: 'serif' },
  { css: /garamond/i,            system: 'EB Garamond',         latex: 'ebgaramond',        category: 'serif' },
  { css: /alegreya/i,            system: 'Alegreya',            latex: 'Alegreya',          category: 'serif' },
  { css: /crimson/i,             system: 'Crimson Pro',         latex: 'CrimsonPro',        category: 'serif' },
  { css: /libre\s*baskerville/i, system: 'Libre Baskerville',   latex: 'LibreBaskerville',  category: 'serif' },
  { css: /source\s*serif/i,      system: 'Source Serif Pro',    latex: 'sourceserifpro',    category: 'serif' },
  { css: /inter/i,               system: 'Inter',               latex: 'Inter',             category: 'sans' },
  { css: /helvetica/i,           system: 'Helvetica Neue',      latex: 'helvet',            category: 'sans' },
  { css: /arial/i,               system: 'Arial',               latex: 'helvet',            category: 'sans' },
  { css: /open\s*sans/i,         system: 'Open Sans',           latex: 'opensans',          category: 'sans' },
  { css: /lato/i,                system: 'Lato',                latex: 'lato',              category: 'sans' },
  { css: /roboto/i,              system: 'Roboto',              latex: 'roboto',            category: 'sans' },
  { css: /source\s*sans/i,       system: 'Source Sans Pro',     latex: 'sourcesanspro',     category: 'sans' },
  { css: /jetbrains\s*mono/i,    system: 'JetBrains Mono',      latex: '',                  category: 'mono' },
  { css: /sf\s*mono/i,           system: 'SF Mono',             latex: '',                  category: 'mono' },
  { css: /cascadia\s*code/i,     system: 'Cascadia Code',       latex: '',                  category: 'mono' },
  { css: /fira\s*code/i,         system: 'Fira Code',           latex: '',                  category: 'mono' },
  { css: /source\s*code\s*pro/i, system: 'Source Code Pro',     latex: 'sourcecodepro',     category: 'mono' },
  { css: /inconsolata/i,         system: 'Inconsolata',         latex: 'inconsolata',       category: 'mono' },
  { css: /courier\s*new/i,       system: 'Courier New',         latex: 'courier',           category: 'mono' },
  // Generic fallbacks
  { css: /\bserif\b/i,           system: '',                    latex: '',                  category: 'serif' },
  { css: /\bsans-serif\b/i,      system: '',                    latex: '',                  category: 'sans' },
  { css: /\bsans\b/i,            system: '',                    latex: '',                  category: 'sans' },
  { css: /\bmonospace\b/i,       system: '',                    latex: '',                  category: 'mono' },
  { css: /\bmono\b/i,            system: '',                    latex: '',                  category: 'mono' },
  { css: /system-ui/i,           system: '',                    latex: '',                  category: 'sans' },
];

/**
 * Look up a CSS font-family string in the font map.
 * Returns { system, latex, category } for the best match, or null.
 */
export function resolveFontForExport(cssFontFamily) {
  if (!cssFontFamily) return null;
  for (const entry of FONT_MAP) {
    if (entry.css.test(cssFontFamily)) return { system: entry.system, latex: entry.latex, category: entry.category };
  }
  // If it's a single unquoted name, assume it's a system font name
  const trimmed = cssFontFamily.replace(/["']/g, '').split(',')[0].trim();
  if (trimmed && !/\b(serif|sans|mono|system|inherit)\b/i.test(trimmed)) {
    return { system: trimmed, latex: '', category: 'serif' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// CSS size → pt conversion (best-effort for LaTeX)
// ---------------------------------------------------------------------------

function cssSizeToPt(size) {
  if (!size) return '';
  const num = parseFloat(size);
  if (isNaN(num)) return '';
  if (/pt$/i.test(size)) return `${num}pt`;
  if (/px$/i.test(size)) return `${Math.round(num * 0.75)}pt`;
  if (/em$/i.test(size)) return `${Math.round(num * 12)}pt`; // rough: 1em ≈ 12pt
  if (/rem$/i.test(size)) return `${Math.round(num * 12)}pt`;
  // bare number → assume px
  return `${Math.round(num * 0.75)}pt`;
}

function hexToRgbNormalized(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

// ---------------------------------------------------------------------------
// Pandoc YAML metadata serializer
//
// Generates YAML frontmatter variables that Pandoc understands for PDF (via
// LaTeX), HTML, and Word output.  The recommended Pandoc engine is xelatex
// or lualatex so that system fonts (mainfont, monofont) work.  For pdflatex,
// a header-includes fallback with \usepackage is also emitted.
// ---------------------------------------------------------------------------

/**
 * Serialize a document template to a Pandoc-compatible YAML metadata object.
 *
 * The returned object can be merged into a document's frontmatter or written
 * as a standalone defaults file.  Values that are empty/unset are omitted so
 * Pandoc uses its own defaults.
 *
 * @param {object} template
 * @returns {object} Plain JS object suitable for YAML serialization
 */
export function serializeDocumentTemplateToPandocMeta(template) {
  const t = normalizeDocumentTemplate(template);
  const meta = {};

  // --- PDF engine recommendation -------------------------------------------
  // We always recommend xelatex so system font names work via mainfont/monofont.
  // The caller can override this.
  meta['pdf-engine'] = 'xelatex';

  // --- Fonts ---------------------------------------------------------------
  const bodyFontInfo = resolveFontForExport(t.body.fontFamily);
  const monoFontInfo = resolveFontForExport(t.code?.block?.fontFamily || t.code?.inline?.fontFamily);

  if (bodyFontInfo?.system) meta.mainfont = bodyFontInfo.system;
  if (monoFontInfo?.system) meta.monofont = monoFontInfo.system;

  // If body font is sans, also set sansfont and documentclass hint
  if (bodyFontInfo?.category === 'sans') {
    if (bodyFontInfo.system) meta.sansfont = bodyFontInfo.system;
  }

  // --- Font size -----------------------------------------------------------
  const bodyPt = cssSizeToPt(t.body.fontSize);
  if (bodyPt) meta.fontsize = bodyPt;

  // --- Line height / stretch -----------------------------------------------
  const lh = parseFloat(t.body.lineHeight);
  if (!isNaN(lh) && lh > 0) meta.linestretch = String(lh);

  // --- Geometry (margins, paper) -------------------------------------------
  const geoParts = [];
  const paper = t.page.paperSize;
  if (paper === 'a4') geoParts.push('a4paper');
  else if (paper === 'a5') geoParts.push('a5paper');
  else if (paper === 'legal') geoParts.push('legalpaper');
  else if (paper === 'letter') geoParts.push('letterpaper');

  if (t.page.marginTop) geoParts.push(`top=${t.page.marginTop}`);
  if (t.page.marginBottom) geoParts.push(`bottom=${t.page.marginBottom}`);
  if (t.page.marginLeft) geoParts.push(`left=${t.page.marginLeft}`);
  if (t.page.marginRight) geoParts.push(`right=${t.page.marginRight}`);

  if (geoParts.length) meta.geometry = geoParts.join(', ');

  // --- Link color ----------------------------------------------------------
  if (t.link.color) {
    meta.colorlinks = true;
    // Pandoc uses LaTeX xcolor names or HTML hex
    meta.linkcolor = t.link.color;
    meta.urlcolor = t.link.color;
    meta.citecolor = t.link.color;
  }

  // --- TOC -----------------------------------------------------------------
  if (t.toc?.enabled === 'true' || t.toc?.enabled === true) {
    meta.toc = true;
    const depth = parseInt(t.toc.depth, 10);
    if (!isNaN(depth) && depth > 0) meta['toc-depth'] = depth;
  }

  // --- Heading numbering ---------------------------------------------------
  if (t.heading.numbering === 'all' || t.heading.numbering === 'h2+') {
    meta['number-sections'] = true;
  } else if (t.heading.numbering === 'none') {
    meta['number-sections'] = false;
  }

  // --- Code highlighting ---------------------------------------------------
  if (t.code?.block?.lineNumbers === 'true' || t.code?.block?.lineNumbers === true) {
    meta['code-line-numbers'] = true;
  }

  // --- Background page color (rare, but supported) -------------------------
  // Pandoc doesn't natively handle page background; this goes in header-includes.

  // Clean empty
  for (const key of Object.keys(meta)) {
    if (meta[key] === '' || meta[key] === undefined || meta[key] === null) delete meta[key];
  }

  return meta;
}

/**
 * Serialize the Pandoc metadata to a YAML string.
 * @param {object} template
 * @returns {string}
 */
export function serializeDocumentTemplateToPandocYaml(template) {
  const meta = serializeDocumentTemplateToPandocMeta(template);
  const lines = [];
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else {
      // Quote strings that contain special YAML chars
      const str = String(value);
      const needsQuote = /[:#\[\]{}&*!|>'"%@`]/.test(str) || str.includes(', ');
      lines.push(`${key}: ${needsQuote ? `"${str.replace(/"/g, '\\"')}"` : str}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LaTeX preamble serializer
//
// Generates \usepackage / \definecolor / \titleformat commands for fine-grained
// PDF styling that goes beyond what Pandoc YAML variables support.
// This is meant to be included via Pandoc's header-includes or as a .tex file.
// ---------------------------------------------------------------------------

/**
 * Serialize a document template to a LaTeX preamble string.
 *
 * Covers: colors (heading, blockquote, link, code), font weight overrides,
 * paragraph spacing, blockquote styling, code block appearance, HR, lists.
 *
 * @param {object} template
 * @returns {string} LaTeX preamble commands
 */
export function serializeDocumentTemplateToLatexPreamble(template) {
  const t = normalizeDocumentTemplate(template);
  const lines = [];

  lines.push('% Generated by mrmd document template system');
  lines.push('% Include via: header-includes in Pandoc YAML or \\input{style.tex}');
  lines.push('');

  // --- Required packages ---------------------------------------------------
  lines.push('\\usepackage{xcolor}');
  lines.push('\\usepackage{hyperref}');

  // --- Define colors from template -----------------------------------------
  const defineColor = (name, hex) => {
    const rgb = hexToRgbNormalized(hex);
    if (!rgb) return;
    lines.push(`\\definecolor{${name}}{rgb}{${rgb.r.toFixed(3)}, ${rgb.g.toFixed(3)}, ${rgb.b.toFixed(3)}}`);
  };

  if (t.body.color) defineColor('mrmd-body', t.body.color);
  if (t.heading.color) defineColor('mrmd-heading', t.heading.color);
  if (t.link.color) defineColor('mrmd-link', t.link.color);
  if (t.blockquote.color) defineColor('mrmd-blockquote-text', t.blockquote.color);
  if (t.blockquote.borderLeftColor) defineColor('mrmd-blockquote-accent', t.blockquote.borderLeftColor);
  if (t.blockquote.background) defineColor('mrmd-blockquote-bg', t.blockquote.background);
  if (t.code?.inline?.color) defineColor('mrmd-code-inline', t.code.inline.color);
  if (t.code?.inline?.background) defineColor('mrmd-code-inline-bg', t.code.inline.background);
  if (t.code?.block?.color) defineColor('mrmd-code-block', t.code.block.color);
  if (t.code?.block?.background) defineColor('mrmd-code-block-bg', t.code.block.background);
  if (t.table?.borderColor) defineColor('mrmd-table-border', t.table.borderColor);
  if (t.table?.headerBackground) defineColor('mrmd-table-header-bg', t.table.headerBackground);
  if (t.hr?.color) defineColor('mrmd-hr', t.hr.color);

  lines.push('');

  // --- Body text color -----------------------------------------------------
  if (t.body.color) {
    lines.push('\\color{mrmd-body}');
  }

  // --- Paragraph spacing ---------------------------------------------------
  if (t.body.paragraphSpacing) {
    const pt = cssSizeToPt(t.body.paragraphSpacing);
    if (pt) {
      lines.push(`\\setlength{\\parskip}{${pt}}`);
      lines.push('\\setlength{\\parindent}{0pt}');
    }
  }

  // --- Link styling --------------------------------------------------------
  if (t.link.color) {
    lines.push('\\hypersetup{');
    lines.push('  colorlinks=true,');
    lines.push('  linkcolor=mrmd-link,');
    lines.push('  urlcolor=mrmd-link,');
    lines.push('  citecolor=mrmd-link,');
    lines.push('}');
  }

  // --- Heading colors (requires titlesec) -----------------------------------
  if (t.heading.color) {
    lines.push('');
    lines.push('\\usepackage{titlesec}');
    for (const level of ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']) {
      lines.push(`\\titleformat{\\${level}}{\\normalfont\\bfseries\\color{mrmd-heading}}{\\the${level}}{1em}{}`);
    }
  }

  // --- Blockquote styling (tcolorbox or mdframed) --------------------------
  if (t.blockquote.borderLeftColor || t.blockquote.background || t.blockquote.color) {
    lines.push('');
    lines.push('% Blockquote styling via mdframed');
    lines.push('\\usepackage{mdframed}');
    const opts = [
      'skipabove=\\topsep',
      'skipbelow=\\topsep',
      t.blockquote.borderLeftColor ? 'leftline=true, linewidth=3pt, linecolor=mrmd-blockquote-accent' : 'leftline=true, linewidth=3pt',
      t.blockquote.background ? 'backgroundcolor=mrmd-blockquote-bg' : '',
      t.blockquote.color ? 'fontcolor=mrmd-blockquote-text' : '',
      'rightline=false, topline=false, bottomline=false',
      'innerleftmargin=10pt, innerrightmargin=10pt, innertopmargin=8pt, innerbottommargin=8pt',
    ].filter(Boolean).join(',\n  ');
    lines.push(`\\newmdenv[${opts}]{mrmdblockquote}`);
    lines.push('% To use: wrap blockquotes in \\begin{mrmdblockquote}...\\end{mrmdblockquote}');
    lines.push('% Pandoc does this automatically if you add a Lua filter.');
  }

  // --- Inline code background ----------------------------------------------
  if (t.code?.inline?.background || t.code?.inline?.color) {
    lines.push('');
    lines.push('% Inline code styling');
    lines.push('\\usepackage{soul}');
    if (t.code.inline.background) {
      lines.push('\\sethlcolor{mrmd-code-inline-bg}');
    }
    lines.push('% Apply with a custom Pandoc Lua filter on Code inlines');
  }

  // --- Code block background -----------------------------------------------
  if (t.code?.block?.background || t.code?.block?.color) {
    lines.push('');
    lines.push('% Code block styling');
    lines.push('\\usepackage{fancyvrb}');
    lines.push('\\DefineVerbatimEnvironment{Highlighting}{Verbatim}{');
    const vOpts = [];
    if (t.code.block.color) vOpts.push('formatcom=\\color{mrmd-code-block}');
    vOpts.push('commandchars=\\\\\\{\\}');
    lines.push('  ' + vOpts.join(', '));
    lines.push('}');
    if (t.code.block.background) {
      lines.push('\\usepackage{framed}');
      lines.push('\\definecolor{shadecolor}{named}{mrmd-code-block-bg}');
    }
  }

  // --- Syntax highlighting token colors (Pandoc/LaTeX) ----------------------
  const hl = t.code?.highlight;
  if (hl) {
    const tokenLatexMap = {
      keyword:  'KeywordTok',
      string:   'StringTok',
      number:   'DecValTok',
      comment:  'CommentTok',
      function: 'FunctionTok',
      variable: 'VariableTok',
      type:     'DataTypeTok',
      operator: 'OperatorTok',
      constant: 'ConstantTok',
      regexp:   'SpecialStringTok',
      escape:   'SpecialCharTok',
      meta:     'AnnotationTok',
    };
    lines.push('');
    lines.push('% Syntax highlighting token colors');
    for (const [token, latexCmd] of Object.entries(tokenLatexMap)) {
      if (hl[token]) {
        const colorName = `mrmd-tok-${token}`;
        defineColor(colorName, hl[token]);
        lines.push(`\\newcommand{\\${latexCmd}}[1]{\\textcolor{${colorName}}{#1}}`);
      }
    }
  }

  // --- Page background color -----------------------------------------------
  if (t.page.background && t.page.background !== '#ffffff' && t.page.background !== '#fff') {
    lines.push('');
    defineColor('mrmd-page-bg', t.page.background);
    lines.push('\\usepackage{pagecolor}');
    lines.push('\\pagecolor{mrmd-page-bg}');
  }

  // --- HR styling ----------------------------------------------------------
  if (t.hr?.color || t.hr?.thickness) {
    lines.push('');
    lines.push('% Horizontal rule styling');
    const thickness = cssSizeToPt(t.hr.thickness) || '0.4pt';
    if (t.hr.color) {
      lines.push(`\\renewcommand{\\rule}[2]{\\textcolor{mrmd-hr}{\\vrule width #1 height #2}}`);
    }
    lines.push(`% Default HR thickness: ${thickness}`);
  }

  // --- List styling --------------------------------------------------------
  if (t.list?.bulletStyle || t.list?.numberStyle) {
    lines.push('');
    lines.push('\\usepackage{enumitem}');
    if (t.list.bulletStyle) {
      const bulletMap = {
        disc: '$\\bullet$',
        circle: '$\\circ$',
        square: '$\\blacksquare$',
        dash: '--',
      };
      const bullet = bulletMap[t.list.bulletStyle] || '$\\bullet$';
      lines.push(`\\setlist[itemize]{label=${bullet}}`);
    }
    if (t.list.numberStyle) {
      const numMap = {
        decimal: '\\arabic*.',
        'lower-alpha': '\\alph*.',
        'lower-roman': '\\roman*.',
        'upper-alpha': '\\Alph*.',
        'upper-roman': '\\Roman*.',
      };
      const numFmt = numMap[t.list.numberStyle] || '\\arabic*.';
      lines.push(`\\setlist[enumerate]{label=${numFmt}}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML wrapper serializer
//
// Generates a standalone HTML page that wraps markdown-rendered HTML with the
// template's CSS.  This is what users would use if they want to self-host or
// render their MRMD docs on the web with the same styling.
// ---------------------------------------------------------------------------

/**
 * Generate a standalone HTML wrapper with the template CSS embedded.
 *
 * @param {object} template
 * @param {object} [options]
 * @param {string} [options.title] - HTML <title>
 * @param {string} [options.bodyHtml] - Pre-rendered HTML body (if available)
 * @param {string} [options.scope] - CSS scope class (default: 'markdown-body')
 * @returns {string} Complete HTML document string
 */
export function serializeDocumentTemplateToHtml(template, options = {}) {
  const scope = options.scope || 'markdown-body';
  const css = serializeDocumentTemplateToCss(template, `.${scope}`);
  const t = normalizeDocumentTemplate(template);
  const title = options.title || 'Document';
  const bodyHtml = options.bodyHtml || '';

  // Collect Google Fonts URLs for web font loading
  const fontUrls = [];
  const addGoogleFont = (family) => {
    if (!family) return;
    // Extract first font name from CSS font stack
    const name = family.replace(/["']/g, '').split(',')[0].trim();
    if (!name || /^(serif|sans-serif|monospace|system-ui|inherit|Georgia|Times New Roman|Arial|Helvetica|Courier New)$/i.test(name)) return;
    const encoded = name.replace(/\s+/g, '+');
    fontUrls.push(`https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,400;0,700;0,800;1,400&display=swap`);
  };
  addGoogleFont(t.body.fontFamily);
  addGoogleFont(t.code?.inline?.fontFamily);
  addGoogleFont(t.code?.block?.fontFamily);

  const fontLinks = [...new Set(fontUrls)].map((url) => `  <link rel="stylesheet" href="${url}">`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title.replace(/</g, '&lt;')}</title>
${fontLinks}
  <style>
    /* Reset */
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      background: ${t.page.background || '#ffffff'};
    }
    .${scope} {
      width: 100%;
      max-width: ${t.page.maxWidth || '800px'};
      padding: 2rem 1.5rem;
      margin: 0 auto;
    }
    /* Template styles */
${css.split('\n').map((l) => '    ' + l).join('\n')}
    /* Base prose defaults (only if template doesn't override) */
    .${scope} img { max-width: ${t.image?.maxWidth || '100%'}; height: auto; ${t.image?.borderRadius ? `border-radius: ${t.image.borderRadius};` : ''} }
    .${scope} table { border-collapse: collapse; width: 100%; }
    .${scope} th, .${scope} td { padding: 8px 12px; text-align: left; }
    .${scope} hr { border: none; ${t.hr?.color ? `border-top-color: ${t.hr.color};` : ''} border-top-style: ${t.hr?.style || 'solid'}; border-top-width: ${t.hr?.thickness || '1px'}; }
    .${scope} pre { padding: 1em; border-radius: 6px; overflow-x: auto; }
    .${scope} code { padding: 2px 5px; border-radius: 3px; }
    .${scope} pre code { padding: 0; background: none; }
    .${scope} blockquote { margin: 1em 0; padding: 0.5em 1em; border-left-width: 4px; border-left-style: solid; }
  </style>
</head>
<body>
  <article class="${scope}">
${bodyHtml}
  </article>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Word (docx) export hints
//
// Word styling through Pandoc works best via --reference-doc.  We can't
// generate a .docx from JS alone, but we can output the mapping between
// template properties and Word style names that a reference doc should use.
// ---------------------------------------------------------------------------

/**
 * Return a mapping object describing how the template properties correspond
 * to Word style names.  This can be used to:
 * 1. Guide users on which Word styles to customize in a reference .docx
 * 2. Drive automated reference doc generation (via a server-side tool)
 *
 * @param {object} template
 * @returns {object}
 */
export function serializeDocumentTemplateToWordStyleMap(template) {
  const t = normalizeDocumentTemplate(template);
  const map = {
    _comment: 'Map of mrmd template properties to Word style names for --reference-doc',
    body: {
      wordStyle: 'Body Text',
      fontFamily: t.body.fontFamily || '(default)',
      fontSize: t.body.fontSize || '(default)',
      lineHeight: t.body.lineHeight || '(default)',
      color: t.body.color || '(default)',
    },
    headings: [
      { level: 1, wordStyle: 'Heading 1', fontSize: t.heading?.h1?.fontSize || '(default)', fontWeight: t.heading?.h1?.fontWeight || '(default)', color: t.heading?.color || '(default)' },
      { level: 2, wordStyle: 'Heading 2', fontSize: t.heading?.h2?.fontSize || '(default)', fontWeight: t.heading?.h2?.fontWeight || '(default)', color: t.heading?.color || '(default)' },
      { level: 3, wordStyle: 'Heading 3', fontSize: t.heading?.h3?.fontSize || '(default)', fontWeight: t.heading?.h3?.fontWeight || '(default)', color: t.heading?.color || '(default)' },
      { level: 4, wordStyle: 'Heading 4', fontSize: t.heading?.h4?.fontSize || '(default)', fontWeight: t.heading?.h4?.fontWeight || '(default)', color: t.heading?.color || '(default)' },
      { level: 5, wordStyle: 'Heading 5', fontSize: t.heading?.h5?.fontSize || '(default)', fontWeight: t.heading?.h5?.fontWeight || '(default)', color: t.heading?.color || '(default)' },
      { level: 6, wordStyle: 'Heading 6', fontSize: t.heading?.h6?.fontSize || '(default)', fontWeight: t.heading?.h6?.fontWeight || '(default)', color: t.heading?.color || '(default)' },
    ],
    blockquote: { wordStyle: 'Block Text', color: t.blockquote?.color || '(default)' },
    codeInline: { wordStyle: 'Verbatim Char', fontFamily: t.code?.inline?.fontFamily || '(default)' },
    codeBlock: { wordStyle: 'Source Code', fontFamily: t.code?.block?.fontFamily || '(default)', fontSize: t.code?.block?.fontSize || '(default)' },
    link: { wordStyle: 'Hyperlink', color: t.link?.color || '(default)' },
    table: { wordStyle: 'Table', borderColor: t.table?.borderColor || '(default)', headerBackground: t.table?.headerBackground || '(default)' },
  };
  return map;
}

// ---------------------------------------------------------------------------
// Pandoc command-line builder
//
// Generates the recommended Pandoc invocation for a given template + format.
// ---------------------------------------------------------------------------

/**
 * Generate a Pandoc CLI command string for exporting a document.
 *
 * @param {object} template
 * @param {object} options
 * @param {'pdf'|'html'|'docx'|'latex'} options.format
 * @param {string} options.input - Input file path
 * @param {string} [options.output] - Output file path
 * @param {string} [options.referenceDoc] - Path to Word reference doc
 * @param {string} [options.preambleFile] - Path to LaTeX preamble .tex file
 * @returns {string}
 */
export function buildPandocCommand(template, options = {}) {
  const meta = serializeDocumentTemplateToPandocMeta(template);
  const format = options.format || 'pdf';
  const input = options.input || 'document.md';
  const output = options.output || input.replace(/\.md$/, `.${format}`);

  const args = ['pandoc', input, '-o', output];

  // Format-specific settings
  if (format === 'pdf') {
    args.push('--pdf-engine=xelatex');
    if (options.preambleFile) {
      args.push(`-H ${options.preambleFile}`);
    }
  } else if (format === 'html') {
    args.push('--standalone');
    // CSS can be passed with --css
  } else if (format === 'docx') {
    if (options.referenceDoc) {
      args.push(`--reference-doc=${options.referenceDoc}`);
    }
  }

  // Add metadata variables
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'pdf-engine') continue; // already handled
    if (typeof value === 'boolean') {
      if (value) args.push(`-V ${key}`);
    } else {
      args.push(`-V ${key}="${String(value).replace(/"/g, '\\"')}"`);
    }
  }

  if (meta.toc) args.push('--toc');
  if (meta['number-sections']) args.push('--number-sections');

  return args.join(' \\\n  ');
}

let documentTemplateOverrideId = 0;

function pushInlineMarkColorRules(rules, scopeSelector, source, parentSel = '') {
  if (!source) return;
  const parents = Array.isArray(parentSel)
    ? parentSel.filter(Boolean)
    : parentSel
      ? String(parentSel).split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  const selectorsFor = (cls) => {
    const leaf = `.${cls}`;
    if (!parents.length) return [`${scopeSelector} ${leaf}`];
    return parents.flatMap((parent) => [
      `${scopeSelector} ${parent}${leaf}`,
      `${scopeSelector} ${parent} ${leaf}`,
    ]);
  };

  const pushColor = (cls, value) => {
    if (!value) return;
    rules.push(`${selectorsFor(cls).join(', ')} { color: ${value} !important; }`);
  };

  pushColor('cm-md-bold', source.bold?.color);
  pushColor('cm-md-italic', source.italic?.color);
  pushColor('cm-md-underline', source.underline?.color);
  pushColor('cm-md-strikethrough', source.strikethrough?.color);
}

function buildDocumentTemplateOverrideCSS(template, scopeSelector) {
  const t = normalizeDocumentTemplate(template);
  if (t.editor?.applyDocumentStyles === false) return '';

  const rules = [];
  const rule = (selectors, prop, value) => {
    if (!value) return;
    const parts = (Array.isArray(selectors) ? selectors : String(selectors).split(','))
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (!parts.length) return;
    rules.push(`${parts.map((s) => `${scopeSelector} ${s}`).join(', ')} { ${prop}: ${value} !important; }`);
  };

  // --- Heading color ---
  if (t.heading?.color) {
    for (let i = 1; i <= 6; i++) {
      rule(`.cm-md-h${i}`, 'color', t.heading.color);
    }
    rule('.cm-frontmatter-title-input', 'color', t.heading.color);
  }

  // --- Per-heading color ---
  for (let i = 1; i <= 6; i++) {
    const h = t.heading?.[`h${i}`];
    if (h?.color) rule(`.cm-md-h${i}`, 'color', h.color);
  }

  // --- Body color baseline ---
  if (t.body?.color) {
    rule(['.cm-line', '.cm-content'], 'color', t.body.color);
  }

  // --- Inline-mark color precedence ---
  pushInlineMarkColorRules(rules, scopeSelector, t.inlineMarks, '');
  pushInlineMarkColorRules(rules, scopeSelector, t.heading, HEADING_MARK_CONTEXT_SELECTORS);
  for (let i = 1; i <= 6; i++) {
    pushInlineMarkColorRules(rules, scopeSelector, t.heading?.[`h${i}`], `.cm-md-h${i}`);
  }

  // --- Blockquote inline marks + text ---
  pushInlineMarkColorRules(rules, scopeSelector, t.blockquote, '.cm-md-blockquote-line');
  if (t.blockquote?.color) {
    rule('.cm-md-blockquote-line', 'color', t.blockquote.color);
  }

  // --- Links ---
  if (t.link?.color) {
    rule(['.cm-md-link-text', '.cm-external-link', '.cm-file-link', '.cm-wiki-link'], 'color', t.link.color);
  }

  // --- Inline code ---
  if (t.code?.inline?.color) rule('.cm-md-inline-code', 'color', t.code.inline.color);
  if (t.code?.inline?.background) rule('.cm-md-inline-code', 'background-color', t.code.inline.background);

  // --- Code blocks ---
  if (t.code?.block?.color) {
    rule([
      '.cm-codeblock-line',
      '.cm-codeblock-fence',
      '.cm-wysiwyg-code-fence-line',
      '.cm-wysiwyg-code-fence-widget',
      '.cm-wysiwyg-code-header',
    ], 'color', t.code.block.color);
  }
  if (t.code?.block?.background) {
    // Use box-shadow on .cm-line elements so CM6's selection layer stays visible.
    // background-color on .cm-line hides the selection layer painted below it.
    rule([
      '.cm-codeblock-line',
      '.cm-codeblock-fence',
      '.cm-wysiwyg-code-fence-line',
    ], 'box-shadow', `inset 0 0 0 9999px ${t.code.block.background}`);
    // Non-line elements (widgets, headers) can keep background-color safely.
    rule([
      '.cm-wysiwyg-code-fence-widget',
      '.cm-wysiwyg-code-header',
    ], 'background-color', t.code.block.background);
  }

  // --- Frontmatter secondary text ---
  if (t.body?.color) {
    rule([
      '.cm-frontmatter-subtitle',
      '.cm-frontmatter-author',
      '.cm-frontmatter-author-affiliation',
      '.cm-frontmatter-date',
      '.cm-frontmatter-abstract',
      '.cm-frontmatter-keyword',
    ], 'color', t.body.color);
  }

  // --- Token inheritance ---
  // Syntax-highlight token spans set color directly, which blocks color
  // inheritance from parent prose/mark spans. When document styling owns the
  // preview, prose tokens should inherit from the document template instead.
  const tokenSel = 'span[class*="ͼ"]';
  rules.push(`${scopeSelector} .cm-line:not(.cm-codeblock-line):not(.cm-codeblock-fence) ${tokenSel} { color: inherit !important; }`);

  // --- Syntax highlighting: document-template-owned token colors ---
  //
  // The tagHighlighter extension stamps deterministic .cm-dt-* classes on
  // syntax token spans.  The ͼN classes from the app theme are neutralised
  // above (color: inherit !important).  Here we output rules that give
  // our .cm-dt-* classes the template's colors.
  //
  // Scoped inside code-block lines so they don't affect prose.  The selector
  // uses the data-attribute on the editor root for maximum specificity.
  //
  // Cascade:
  //   code.block.color (inherited base)
  //     → code.highlight.{token}  (base token – all code blocks)
  //       → code.highlight.languages.{lang}.{token}  (per-language)
  //
  const hl = t.code?.highlight;
  if (hl) {
    pushSyntaxTokenRules(rules, scopeSelector, hl);
  }

  // --- Code block font overrides (guaranteed precedence) ---
  // The built-in codeBlockStyles uses EditorView.theme() which may have
  // equal specificity to our template theme.  Repeat here with !important.
  if (t.code?.block?.fontSize) {
    rule(['.cm-codeblock-line', '.cm-codeblock-fence', '.cm-wysiwyg-code-fence-line'], 'font-size', t.code.block.fontSize);
  }
  if (t.code?.block?.fontFamily) {
    rule(['.cm-codeblock-line', '.cm-codeblock-fence', '.cm-wysiwyg-code-fence-line'], 'font-family', t.code.block.fontFamily);
  }
  if (t.code?.block?.lineHeight) {
    rule(['.cm-codeblock-line', '.cm-wysiwyg-code-fence-line'], 'line-height', t.code.block.lineHeight);
  }

  // --- Output widget font overrides ---
  if (t.code?.cell?.outputFontFamily) {
    rule(['.cm-output-widget', '.cm-output-content', '.cm-scroll-output-widget', '.cm-scroll-output-content'], 'font-family', t.code.cell.outputFontFamily);
  }
  if (t.code?.cell?.outputFontSize) {
    rule(['.cm-output-widget', '.cm-output-content', '.cm-scroll-output-widget', '.cm-scroll-output-content'], 'font-size', t.code.cell.outputFontSize);
  }
  if (t.code?.cell?.outputLineHeight) {
    rule(['.cm-output-widget', '.cm-scroll-output-widget'], 'line-height', t.code.cell.outputLineHeight);
  }

  // --- Table overrides ---
  if (t.table?.color) {
    rule('.cm-table-widget td', 'color', t.table.color);
  }
  if (t.table?.headerColor) {
    rule('.cm-table-widget th', 'color', t.table.headerColor);
  }
  if (t.table?.headerFontWeight) {
    rule('.cm-table-widget th', 'font-weight', t.table.headerFontWeight);
  }
  if (t.table?.fontSize) {
    rule('.cm-table-widget table', 'font-size', t.table.fontSize);
  }
  if (t.table?.fontFamily) {
    rule('.cm-table-widget table', 'font-family', t.table.fontFamily);
  }

  // --- Math overrides ---
  // KaTeX generates its own elements that set color directly.
  // Must target .katex inside our containers to override.
  if (t.math?.color) {
    rule(['.cm-math-inline', '.cm-math-display'], 'color', t.math.color);
    rule(['.cm-math-inline .katex', '.cm-math-display .katex'], 'color', t.math.color);
    rule(['.cm-math-inline .katex *', '.cm-math-display .katex *'], 'color', t.math.color);
  }
  if (t.math?.fontSize) {
    rule(['.cm-math-inline', '.cm-math-display'], 'font-size', t.math.fontSize);
  }
  if (t.math?.displayBorderRadius) {
    rule('.cm-math-display', 'border-radius', t.math.displayBorderRadius);
  }

  return rules.join('\n');
}

/**
 * Generate CSS rules targeting the deterministic .cm-dt-* token classes
 * inside code block lines.  Uses !important to win over the neutralised
 * ͼN classes.
 *
 * For base tokens the selector is:
 *   ${scope} .cm-codeblock-line .cm-dt-keyword { color: #xxx !important; }
 *
 * For per-language overrides the selector adds [data-lang]:
 *   ${scope} .cm-codeblock-line[data-lang="python"] .cm-dt-keyword { … }
 */
function pushSyntaxTokenRules(rules, scopeSelector, hl) {
  const CODE_LINE_SCOPES = ['.cm-codeblock-line', '.cm-wysiwyg-code-fence-line'];

  const pushTokenColor = (tokenName, color, styleModifier, langAttr) => {
    if (!color && !styleModifier) return;
    const cls = DT_TOKEN_CLASS_MAP[tokenName];
    if (!cls) return;

    const decls = [];
    if (color) decls.push(`color: ${color} !important`);
    if (styleModifier) {
      const { fontWeight, fontStyle } = parseStyleModifier(styleModifier);
      if (fontWeight) decls.push(`font-weight: ${fontWeight} !important`);
      if (fontStyle) decls.push(`font-style: ${fontStyle} !important`);
    }
    if (!decls.length) return;

    const body = decls.join('; ');
    const selectors = CODE_LINE_SCOPES.map((scope) => {
      const lineScope = langAttr ? `${scope}[data-lang="${langAttr}"]` : scope;
      return `${scopeSelector} ${lineScope} .${cls}`;
    });
    rules.push(`${selectors.join(', ')} { ${body}; }`);
  };

  // Style modifier lookup: token → style modifier key
  const STYLE_KEYS = {
    keyword: 'keywordStyle', controlKeyword: 'keywordStyle',
    comment: 'commentStyle', function: 'functionStyle', type: 'typeStyle',
  };

  // --- Base token rules (all code blocks) ---
  for (const tokenName of Object.keys(DT_TOKEN_CLASS_MAP)) {
    const color = hl[tokenName] || '';
    const styleMod = hl[STYLE_KEYS[tokenName]] || '';
    pushTokenColor(tokenName, color, styleMod, null);
  }

  // --- Per-language overrides ---
  const languages = hl.languages;
  if (languages) {
    for (const [lang, langTokens] of Object.entries(languages)) {
      if (!langTokens || typeof langTokens !== 'object') continue;
      for (const tokenName of Object.keys(DT_TOKEN_CLASS_MAP)) {
        const color = langTokens[tokenName] || '';
        const styleMod = langTokens[STYLE_KEYS[tokenName]] || '';
        if (color || styleMod) {
          pushTokenColor(tokenName, color, styleMod, lang);
        }
      }
    }
  }
}

function parseStyleModifier(value) {
  if (!value) return {};
  const lower = String(value).toLowerCase().trim();
  const result = {};
  if (lower.includes('bold')) result.fontWeight = 'bold';
  if (lower.includes('italic')) result.fontStyle = 'italic';
  return result;
}

function createDocumentTemplateOverrideExtension(template) {
  const t = normalizeDocumentTemplate(template);
  if (t.editor?.applyDocumentStyles === false) return [];

  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.ownerDocument = view.dom.ownerDocument;
      this.attrName = 'data-mrmd-document-template-id';
      this.attrValue = `dt-${++documentTemplateOverrideId}`;
      this.styleEl = this.ownerDocument.createElement('style');
      this.styleEl.id = `mrmd-document-template-overrides-${this.attrValue}`;
      view.dom.setAttribute(this.attrName, this.attrValue);
      this.styleEl.textContent = buildDocumentTemplateOverrideCSS(
        t,
        `.cm-editor[${this.attrName}="${this.attrValue}"]`
      );
      (this.ownerDocument.head || this.ownerDocument.documentElement).appendChild(this.styleEl);
    }

    destroy() {
      this.styleEl?.remove?.();
      this.view?.dom?.removeAttribute?.(this.attrName);
    }
  });
}

// ---------------------------------------------------------------------------
// Document-template-owned syntax token classes.
//
// We use @lezer/highlight's tagHighlighter to stamp deterministic CSS class
// names (cm-dt-keyword, cm-dt-string, …) on syntax token spans.  These
// classes coexist with CodeMirror's generated ͼN classes.  The ͼN classes
// are neutralised (color: inherit !important) by the theme rules above.
// Our cm-dt-* classes are then coloured in the override <style> element
// with even higher specificity + !important, so they always win.
//
// This is the same pattern used for heading colors and inline mark colors.
// ---------------------------------------------------------------------------

/**
 * Mapping from our template token names to their deterministic CSS class.
 */
const DT_TOKEN_CLASS_MAP = {
  keyword:        'cm-dt-keyword',
  controlKeyword: 'cm-dt-control-keyword',
  string:         'cm-dt-string',
  number:         'cm-dt-number',
  comment:        'cm-dt-comment',
  function:       'cm-dt-function',
  variable:       'cm-dt-variable',
  type:           'cm-dt-type',
  operator:       'cm-dt-operator',
  punctuation:    'cm-dt-punctuation',
  property:       'cm-dt-property',
  constant:       'cm-dt-constant',
  regexp:         'cm-dt-regexp',
  escape:         'cm-dt-escape',
  tag:            'cm-dt-tag',
  attribute:      'cm-dt-attribute',
  attributeValue: 'cm-dt-attribute-value',
  meta:           'cm-dt-meta',
  inserted:       'cm-dt-inserted',
  deleted:        'cm-dt-deleted',
  changed:        'cm-dt-changed',
};

/**
 * Build the tagHighlighter extension that stamps cm-dt-* classes on
 * syntax token spans.  This is always active when document styles own
 * the preview — the classes are harmless when no highlight tokens are
 * set (they just exist on the spans without any matching CSS rule).
 */
function createDocumentTemplateTokenClasses(template) {
  const t = normalizeDocumentTemplate(template);
  if (t.editor?.applyDocumentStyles === false) return [];

  const th = tagHighlighter([
    // Keywords
    { tag: [lezerTags.keyword, lezerTags.operatorKeyword, lezerTags.definitionKeyword, lezerTags.moduleKeyword],
      class: DT_TOKEN_CLASS_MAP.keyword },
    { tag: lezerTags.controlKeyword,
      class: DT_TOKEN_CLASS_MAP.controlKeyword },
    // Strings
    { tag: [lezerTags.string, lezerTags.docString, lezerTags.character, lezerTags.special(lezerTags.string)],
      class: DT_TOKEN_CLASS_MAP.string },
    // Numbers
    { tag: [lezerTags.number, lezerTags.integer, lezerTags.float],
      class: DT_TOKEN_CLASS_MAP.number },
    // Comments
    { tag: [lezerTags.comment, lezerTags.lineComment, lezerTags.blockComment, lezerTags.docComment],
      class: DT_TOKEN_CLASS_MAP.comment },
    // Functions
    { tag: [lezerTags.function(lezerTags.variableName), lezerTags.definition(lezerTags.function(lezerTags.variableName))],
      class: DT_TOKEN_CLASS_MAP.function },
    // Variables
    { tag: [lezerTags.variableName, lezerTags.definition(lezerTags.variableName), lezerTags.local(lezerTags.variableName)],
      class: DT_TOKEN_CLASS_MAP.variable },
    // Types & classes
    { tag: [lezerTags.typeName, lezerTags.className, lezerTags.namespace, lezerTags.macroName],
      class: DT_TOKEN_CLASS_MAP.type },
    // Operators
    { tag: lezerTags.operator,
      class: DT_TOKEN_CLASS_MAP.operator },
    // Punctuation
    { tag: [lezerTags.punctuation, lezerTags.separator, lezerTags.bracket, lezerTags.paren, lezerTags.brace, lezerTags.squareBracket, lezerTags.angleBracket],
      class: DT_TOKEN_CLASS_MAP.punctuation },
    // Properties
    { tag: [lezerTags.propertyName, lezerTags.definition(lezerTags.propertyName), lezerTags.special(lezerTags.propertyName)],
      class: DT_TOKEN_CLASS_MAP.property },
    // Constants / booleans / null
    { tag: [lezerTags.constant(lezerTags.variableName), lezerTags.standard(lezerTags.variableName), lezerTags.bool, lezerTags.null, lezerTags.atom],
      class: DT_TOKEN_CLASS_MAP.constant },
    // Regexp
    { tag: lezerTags.regexp,
      class: DT_TOKEN_CLASS_MAP.regexp },
    // Escape sequences
    { tag: lezerTags.escape,
      class: DT_TOKEN_CLASS_MAP.escape },
    // HTML/XML tags
    { tag: lezerTags.tagName,
      class: DT_TOKEN_CLASS_MAP.tag },
    // HTML/XML attributes
    { tag: lezerTags.attributeName,
      class: DT_TOKEN_CLASS_MAP.attribute },
    { tag: lezerTags.attributeValue,
      class: DT_TOKEN_CLASS_MAP.attributeValue },
    // Meta / decorators / annotations
    { tag: [lezerTags.meta, lezerTags.processingInstruction, lezerTags.annotation],
      class: DT_TOKEN_CLASS_MAP.meta },
    // Diff
    { tag: lezerTags.inserted, class: DT_TOKEN_CLASS_MAP.inserted },
    { tag: lezerTags.deleted,  class: DT_TOKEN_CLASS_MAP.deleted },
    { tag: lezerTags.changed,  class: DT_TOKEN_CLASS_MAP.changed },
  ]);

  return [syntaxHighlighting(th)];
}

export function createDocumentTemplateExtension(template) {
  return [
    EditorView.theme(compileDocumentTemplateCSS(template)),
    createDocumentTemplateOverrideExtension(template),
    ...createDocumentTemplateTokenClasses(template),
  ];
}

// Make the class map available for external consumers
export { DT_TOKEN_CLASS_MAP };
