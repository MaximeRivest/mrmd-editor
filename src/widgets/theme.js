/**
 * Widget Theme System
 *
 * Design tokens and built-in themes for MRMD widgets.
 * Themes are plain objects mapping semantic token names to CSS values.
 *
 * ## Creating a Custom Theme
 *
 * Themes are just objects. Extend a built-in theme:
 *
 * ```javascript
 * import { midnightTheme, createTheme } from 'mrmd-editor/widgets';
 *
 * const myTheme = createTheme({
 *   name: 'my-brand',
 *   base: 'midnight',
 *   overrides: {
 *     '--widget-border-accent': '#ff6b6b',
 *     '--widget-text-accent': '#ff6b6b',
 *   }
 * });
 * ```
 *
 * Or override CSS variables directly:
 *
 * ```css
 * :root {
 *   --widget-border-accent: #ff6b6b;
 * }
 * ```
 *
 * @module widgets/theme
 */

// #region TOKEN_DEFINITIONS

/**
 * All available design tokens with their descriptions.
 * This serves as documentation and schema for themes.
 *
 * @type {Record<string, {description: string, category: string, default: string}>}
 */
export const tokenDefinitions = {
  // ===========================================================================
  // SPACING
  // ===========================================================================
  '--widget-line-height': {
    description: 'Line height for widget content. Use "inherit" to match editor.',
    category: 'spacing',
    default: 'inherit',
  },
  '--widget-padding-x': {
    description: 'Horizontal padding inside widgets',
    category: 'spacing',
    default: '12px',
  },
  '--widget-padding-y': {
    description: 'Vertical padding inside widgets',
    category: 'spacing',
    default: '8px',
  },
  '--widget-margin-y': {
    description: 'Vertical margin around widgets',
    category: 'spacing',
    default: '4px',
  },
  '--widget-border-radius': {
    description: 'Border radius for widgets',
    category: 'spacing',
    default: '6px',
  },
  '--widget-border-width': {
    description: 'Default border width',
    category: 'spacing',
    default: '1px',
  },
  '--widget-border-accent-width': {
    description: 'Width of accent border (e.g., left bar on output)',
    category: 'spacing',
    default: '3px',
  },
  '--widget-inset-left': {
    description: 'Left inset/indent for widgets (creates visual hierarchy)',
    category: 'spacing',
    default: '0',
  },
  '--widget-offset-top': {
    description: 'Vertical offset for widgets. Use negative values to pull widgets closer to code blocks.',
    category: 'spacing',
    default: '0',
  },

  // ===========================================================================
  // TEXT LAYOUT
  // ===========================================================================
  '--widget-white-space': {
    description: 'White-space handling for widget content. Use "pre" for no wrapping with horizontal scroll, "pre-wrap" for wrapping.',
    category: 'text-layout',
    default: 'pre-wrap',
  },
  '--widget-word-break': {
    description: 'Word break behavior for widget content. Use "normal" with white-space: pre, or "break-word" with pre-wrap.',
    category: 'text-layout',
    default: 'break-word',
  },

  // ===========================================================================
  // TYPOGRAPHY
  // ===========================================================================
  '--widget-font-mono': {
    description: 'Monospace font stack for code/output',
    category: 'typography',
    default: "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  },
  '--widget-font-sans': {
    description: 'Serif font stack for prose and UI elements',
    category: 'typography',
    default: "Literata, Charter, Georgia, serif",
  },
  '--widget-font-size': {
    description: 'Base font size for widgets (relative to editor)',
    category: 'typography',
    default: '0.9em',
  },
  '--widget-font-size-small': {
    description: 'Small font size for secondary text',
    category: 'typography',
    default: '0.8em',
  },
  '--widget-font-size-label': {
    description: 'Font size for labels (cursor labels, badges)',
    category: 'typography',
    default: '11px',
  },

  // ===========================================================================
  // SURFACES (backgrounds)
  // ===========================================================================
  '--widget-surface': {
    description: 'Main widget background',
    category: 'surfaces',
    default: 'rgba(0, 0, 0, 0.35)',
  },
  '--widget-surface-hover': {
    description: 'Widget background on hover',
    category: 'surfaces',
    default: 'rgba(0, 0, 0, 0.45)',
  },
  '--widget-surface-elevated': {
    description: 'Background for floating elements (tooltips, menus)',
    category: 'surfaces',
    default: '#1e1e1e',
  },
  '--widget-surface-inset': {
    description: 'Background for inset/recessed areas (inputs)',
    category: 'surfaces',
    default: 'rgba(0, 0, 0, 0.2)',
  },

  // ===========================================================================
  // BORDERS
  // ===========================================================================
  '--widget-border': {
    description: 'Default border color',
    category: 'borders',
    default: 'rgba(255, 255, 255, 0.1)',
  },
  '--widget-border-accent': {
    description: 'Accent border color (left bar on output widget)',
    category: 'borders',
    default: 'rgba(100, 149, 237, 0.6)',
  },
  '--widget-border-focus': {
    description: 'Border color for focused elements',
    category: 'borders',
    default: '#6495ed',
  },

  // ===========================================================================
  // TEXT COLORS
  // ===========================================================================
  '--widget-text': {
    description: 'Primary text color',
    category: 'text',
    default: '#e0e0e0',
  },
  '--widget-text-muted': {
    description: 'Secondary/dimmed text color',
    category: 'text',
    default: '#888888',
  },
  '--widget-text-accent': {
    description: 'Accent text color (links, interactive)',
    category: 'text',
    default: '#6495ed',
  },

  // ===========================================================================
  // SEMANTIC COLORS
  // ===========================================================================
  '--widget-success': {
    description: 'Success state color (green)',
    category: 'semantic',
    default: '#22c55e',
  },
  '--widget-warning': {
    description: 'Warning state color (yellow/orange)',
    category: 'semantic',
    default: '#f59e0b',
  },
  '--widget-error': {
    description: 'Error state color (red)',
    category: 'semantic',
    default: '#ef4444',
  },
  '--widget-info': {
    description: 'Info state color (blue)',
    category: 'semantic',
    default: '#3b82f6',
  },

  // ===========================================================================
  // ANSI TERMINAL COLORS
  // ===========================================================================
  '--ansi-black': { description: 'ANSI black', category: 'ansi', default: '#1e1e1e' },
  '--ansi-red': { description: 'ANSI red', category: 'ansi', default: '#f87171' },
  '--ansi-green': { description: 'ANSI green', category: 'ansi', default: '#4ade80' },
  '--ansi-yellow': { description: 'ANSI yellow', category: 'ansi', default: '#facc15' },
  '--ansi-blue': { description: 'ANSI blue', category: 'ansi', default: '#60a5fa' },
  '--ansi-magenta': { description: 'ANSI magenta', category: 'ansi', default: '#c084fc' },
  '--ansi-cyan': { description: 'ANSI cyan', category: 'ansi', default: '#22d3ee' },
  '--ansi-white': { description: 'ANSI white', category: 'ansi', default: '#e0e0e0' },
  // Bright variants
  '--ansi-bright-black': { description: 'ANSI bright black (gray)', category: 'ansi', default: '#6b7280' },
  '--ansi-bright-red': { description: 'ANSI bright red', category: 'ansi', default: '#fca5a5' },
  '--ansi-bright-green': { description: 'ANSI bright green', category: 'ansi', default: '#86efac' },
  '--ansi-bright-yellow': { description: 'ANSI bright yellow', category: 'ansi', default: '#fde047' },
  '--ansi-bright-blue': { description: 'ANSI bright blue', category: 'ansi', default: '#93c5fd' },
  '--ansi-bright-magenta': { description: 'ANSI bright magenta', category: 'ansi', default: '#d8b4fe' },
  '--ansi-bright-cyan': { description: 'ANSI bright cyan', category: 'ansi', default: '#67e8f9' },
  '--ansi-bright-white': { description: 'ANSI bright white', category: 'ansi', default: '#ffffff' },

  // ===========================================================================
  // TERMINAL (xterm.js terminal widget)
  // ===========================================================================
  '--term-background': { description: 'Terminal background color', category: 'terminal', default: 'var(--editor-background)' },
  '--term-foreground': { description: 'Terminal text color', category: 'terminal', default: 'var(--editor-foreground)' },
  '--term-cursor': { description: 'Terminal cursor color', category: 'terminal', default: 'var(--editor-cursor)' },
  '--term-cursor-accent': { description: 'Terminal cursor text color', category: 'terminal', default: 'var(--editor-background)' },
  '--term-selection': { description: 'Terminal selection background', category: 'terminal', default: 'var(--editor-selection)' },
  '--term-border': { description: 'Terminal border color', category: 'terminal', default: 'var(--widget-border)' },
  '--term-header-bg': { description: 'Terminal header background', category: 'terminal', default: 'var(--mrmd-popup-bg, #252526)' },
  '--term-header-fg': { description: 'Terminal header text color', category: 'terminal', default: 'var(--widget-text-muted)' },

  // ===========================================================================
  // COLLABORATOR COLORS (used by awareness system)
  // ===========================================================================
  '--collab-human': { description: 'Default color for human collaborators', category: 'collab', default: '#3b82f6' },
  '--collab-ai': { description: 'Default color for AI collaborators', category: 'collab', default: '#8b5cf6' },
  '--collab-runtime': { description: 'Default color for runtime collaborators', category: 'collab', default: '#10b981' },

  // ===========================================================================
  // EDITOR (CodeMirror editor appearance)
  // ===========================================================================
  '--editor-background': { description: 'Editor background color', category: 'editor', default: '#1e1e1e' },
  '--editor-foreground': { description: 'Default editor text color', category: 'editor', default: '#d4d4d4' },
  '--editor-line-number': { description: 'Line number color', category: 'editor', default: '#858585' },
  '--editor-line-number-active': { description: 'Active line number color', category: 'editor', default: '#c6c6c6' },
  '--editor-selection': { description: 'Selection background', category: 'editor', default: '#264f78' },
  '--editor-selection-match': { description: 'Matching selection/search highlight', category: 'editor', default: '#515c6a' },
  '--editor-cursor': { description: 'Cursor color', category: 'editor', default: '#aeafad' },
  '--editor-active-line': { description: 'Active line background', category: 'editor', default: 'rgba(255, 255, 255, 0.05)' },
  '--editor-gutter': { description: 'Gutter background', category: 'editor', default: '#1e1e1e' },
  '--editor-matching-bracket': { description: 'Matching bracket highlight', category: 'editor', default: 'rgba(255, 255, 255, 0.1)' },

  // ===========================================================================
  // SYNTAX HIGHLIGHTING (Code syntax colors)
  // ===========================================================================
  '--syntax-keyword': { description: 'Keywords (if, else, function, class)', category: 'syntax', default: '#569cd6' },
  '--syntax-control': { description: 'Control flow (return, break, continue)', category: 'syntax', default: '#c586c0' },
  '--syntax-string': { description: 'String literals', category: 'syntax', default: '#ce9178' },
  '--syntax-number': { description: 'Number literals', category: 'syntax', default: '#b5cea8' },
  '--syntax-comment': { description: 'Comments', category: 'syntax', default: '#6a9955' },
  '--syntax-function': { description: 'Function names', category: 'syntax', default: '#dcdcaa' },
  '--syntax-variable': { description: 'Variables', category: 'syntax', default: '#9cdcfe' },
  '--syntax-variable-special': { description: 'Special variables (this, self)', category: 'syntax', default: '#569cd6' },
  '--syntax-property': { description: 'Object properties', category: 'syntax', default: '#9cdcfe' },
  '--syntax-operator': { description: 'Operators (+, -, =)', category: 'syntax', default: '#d4d4d4' },
  '--syntax-punctuation': { description: 'Punctuation (brackets, commas)', category: 'syntax', default: '#d4d4d4' },
  '--syntax-type': { description: 'Type names', category: 'syntax', default: '#4ec9b0' },
  '--syntax-class': { description: 'Class names', category: 'syntax', default: '#4ec9b0' },
  '--syntax-constant': { description: 'Constants (true, false, null)', category: 'syntax', default: '#569cd6' },
  '--syntax-parameter': { description: 'Function parameters', category: 'syntax', default: '#9cdcfe' },
  '--syntax-regexp': { description: 'Regular expressions', category: 'syntax', default: '#d16969' },
  '--syntax-escape': { description: 'Escape characters', category: 'syntax', default: '#d7ba7d' },

  // Markdown/Markup specific
  '--syntax-tag': { description: 'HTML/XML tags', category: 'syntax', default: '#569cd6' },
  '--syntax-attribute': { description: 'HTML/XML attributes', category: 'syntax', default: '#9cdcfe' },
  '--syntax-attribute-value': { description: 'HTML attribute values', category: 'syntax', default: '#ce9178' },
  '--syntax-heading': { description: 'Markdown headings', category: 'syntax', default: '#569cd6' },
  '--syntax-link': { description: 'Links', category: 'syntax', default: '#3794ff' },
  '--syntax-link-text': { description: 'Link text', category: 'syntax', default: '#ce9178' },
  '--syntax-emphasis': { description: 'Italic/emphasis', category: 'syntax', default: '#569cd6' },
  '--syntax-strong': { description: 'Bold/strong', category: 'syntax', default: '#569cd6' },
  '--syntax-strikethrough': { description: 'Strikethrough text', category: 'syntax', default: '#858585' },
  '--syntax-quote': { description: 'Block quotes', category: 'syntax', default: '#6a9955' },
  '--syntax-code': { description: 'Inline code', category: 'syntax', default: '#ce9178' },
  '--syntax-code-background': { description: 'Inline code background', category: 'syntax', default: 'rgba(110, 118, 129, 0.2)' },
  '--syntax-meta': { description: 'Meta syntax (fences, front matter)', category: 'syntax', default: '#858585' },
  '--syntax-inserted': { description: 'Inserted/added content (diffs)', category: 'syntax', default: '#b5cea8' },
  '--syntax-deleted': { description: 'Deleted content (diffs)', category: 'syntax', default: '#ce9178' },
  '--syntax-changed': { description: 'Changed content (diffs)', category: 'syntax', default: '#569cd6' },

  // ===========================================================================
  // MARKDOWN RENDERING (blur/focus rendered view)
  // ===========================================================================
  // These tokens control how markdown appears when rendered (cursor not on element).
  // When the cursor IS on an element, it shows as raw markdown syntax.

  // Headings
  '--md-heading-1-size': { description: 'H1 font size', category: 'markdown', default: '1.75em' },
  '--md-heading-2-size': { description: 'H2 font size', category: 'markdown', default: '1.4em' },
  '--md-heading-3-size': { description: 'H3 font size', category: 'markdown', default: '1.2em' },
  '--md-heading-4-size': { description: 'H4 font size', category: 'markdown', default: '1.1em' },
  '--md-heading-5-size': { description: 'H5 font size', category: 'markdown', default: '1.05em' },
  '--md-heading-6-size': { description: 'H6 font size', category: 'markdown', default: '1em' },
  '--md-heading-weight': { description: 'Heading font weight', category: 'markdown', default: '600' },
  '--md-heading-line-height': { description: 'Heading line height', category: 'markdown', default: '1.3' },
  '--md-heading-margin-top': { description: 'Space above headings', category: 'markdown', default: '0.5em' },

  // Markers (the #, **, __, ``` syntax characters)
  '--md-marker-color': { description: 'Color of visible markdown syntax markers', category: 'markdown', default: 'var(--widget-text-muted)' },
  '--md-marker-font': { description: 'Font for markdown markers', category: 'markdown', default: 'var(--widget-font-mono)' },

  // Links
  '--md-link-color': { description: 'Link text color', category: 'markdown', default: 'var(--syntax-link)' },
  '--md-link-decoration': { description: 'Link text decoration', category: 'markdown', default: 'underline' },

  // Inline code
  '--md-code-background': { description: 'Inline code background', category: 'markdown', default: 'var(--syntax-code-background)' },
  '--md-code-color': { description: 'Inline code text color', category: 'markdown', default: 'var(--syntax-code)' },
  '--md-code-padding': { description: 'Inline code padding', category: 'markdown', default: '0.15em 0.35em' },
  '--md-code-radius': { description: 'Inline code border radius', category: 'markdown', default: '3px' },

  // Blockquotes
  '--md-blockquote-border': { description: 'Blockquote left border color', category: 'markdown', default: 'var(--widget-border-accent)' },
  '--md-blockquote-border-width': { description: 'Blockquote left border width', category: 'markdown', default: '3px' },
  '--md-blockquote-color': { description: 'Blockquote text color', category: 'markdown', default: 'var(--widget-text-muted)' },
  '--md-blockquote-padding': { description: 'Blockquote left padding', category: 'markdown', default: '1em' },

  // Lists
  '--md-list-marker-color': { description: 'List bullet/number color', category: 'markdown', default: 'var(--widget-text-muted)' },

  // Horizontal rules
  '--md-hr-color': { description: 'Horizontal rule color', category: 'markdown', default: 'var(--widget-border)' },
  '--md-hr-height': { description: 'Horizontal rule thickness', category: 'markdown', default: '1px' },
  '--md-hr-margin': { description: 'Horizontal rule vertical margin', category: 'markdown', default: '1.5em 0' },

  // Tables (Tufte-inspired: maximize data-ink ratio)
  '--md-table-bg': { description: 'Table background', category: 'markdown', default: 'var(--widget-surface)' },
  '--md-table-header-weight': { description: 'Table header font weight', category: 'markdown', default: '600' },
  '--md-table-header-border': { description: 'Table header bottom border color', category: 'markdown', default: 'var(--widget-text-muted)' },
  '--md-table-row-border': { description: 'Table row separator color', category: 'markdown', default: 'var(--widget-border)' },
  '--md-table-cell-padding': { description: 'Table cell padding', category: 'markdown', default: '0.5em 1em' },
  '--md-table-hover-bg': { description: 'Table row hover background', category: 'markdown', default: 'var(--widget-surface-hover)' },

  // Images
  '--md-image-max-width': { description: 'Maximum image width', category: 'markdown', default: '100%' },
  '--md-image-border-radius': { description: 'Image border radius', category: 'markdown', default: 'var(--widget-border-radius)' },

  // Math (LaTeX with KaTeX)
  '--md-math-display-size': { description: 'Display math font size', category: 'markdown', default: '1.2em' },
  '--md-math-inline-size': { description: 'Inline math font size', category: 'markdown', default: '1em' },
  '--md-math-syntax-color': { description: 'Math syntax color (when editing)', category: 'markdown', default: 'var(--widget-text-muted)' },
  '--md-math-fallback-color': { description: 'Math fallback text color', category: 'markdown', default: 'var(--widget-text-muted)' },
  '--md-math-fallback-bg': { description: 'Math fallback background', category: 'markdown', default: 'var(--widget-surface)' },

  // Task checkboxes
  '--md-checkbox-size': { description: 'Checkbox size', category: 'markdown', default: '1em' },
  '--md-checkbox-color': { description: 'Checkbox accent color', category: 'markdown', default: 'var(--widget-text-accent)' },

  // GitHub-style alerts [!NOTE], [!WARNING], etc.
  '--md-alert-note-color': { description: 'Note alert accent color', category: 'markdown', default: 'var(--widget-info)' },
  '--md-alert-tip-color': { description: 'Tip alert accent color', category: 'markdown', default: 'var(--widget-success)' },
  '--md-alert-important-color': { description: 'Important alert accent color', category: 'markdown', default: 'var(--syntax-keyword)' },
  '--md-alert-warning-color': { description: 'Warning alert accent color', category: 'markdown', default: 'var(--widget-warning)' },
  '--md-alert-caution-color': { description: 'Caution alert accent color', category: 'markdown', default: 'var(--widget-error)' },

  // ===========================================================================
  // SHELL (Status bar, menus, dialogs)
  // ===========================================================================
  '--mrmd-ui-font': { description: 'UI font family for shell components', category: 'shell', default: 'var(--widget-font-sans)' },
  '--mrmd-ui-font-size': { description: 'UI font size', category: 'shell', default: '13px' },
  '--mrmd-ui-font-size-sm': { description: 'Small UI font size', category: 'shell', default: '11px' },
  '--mrmd-panel-bg': { description: 'Panel/surface background', category: 'shell', default: '#1e1e1e' },
  '--mrmd-popup-bg': { description: 'Popup/menu background', category: 'shell', default: '#252526' },
  '--mrmd-bg': { description: 'Main background', category: 'shell', default: '#1e1e1e' },
  '--mrmd-fg': { description: 'Primary foreground color', category: 'shell', default: '#cccccc' },
  '--mrmd-fg-muted': { description: 'Muted foreground color', category: 'shell', default: '#888888' },
  '--mrmd-border': { description: 'Border color', category: 'shell', default: '#3c3c3c' },
  '--mrmd-hover-bg': { description: 'Hover background', category: 'shell', default: 'rgba(255, 255, 255, 0.05)' },
  '--mrmd-active-bg': { description: 'Active/pressed background', category: 'shell', default: 'rgba(255, 255, 255, 0.08)' },
  '--mrmd-selection-bg': { description: 'Selection background', category: 'shell', default: 'rgba(0, 122, 204, 0.3)' },
  '--mrmd-accent': { description: 'Accent color', category: 'shell', default: '#007acc' },
  '--mrmd-accent-hover': { description: 'Accent hover color', category: 'shell', default: '#0098ff' },
  '--mrmd-success': { description: 'Success color', category: 'shell', default: '#4caf50' },
  '--mrmd-warning': { description: 'Warning color', category: 'shell', default: '#ff9800' },
  '--mrmd-error': { description: 'Error color', category: 'shell', default: '#f44336' },
  '--mrmd-shadow-md': { description: 'Medium shadow', category: 'shell', default: '0 4px 12px rgba(0, 0, 0, 0.3)' },
  '--mrmd-shadow-lg': { description: 'Large shadow', category: 'shell', default: '0 8px 32px rgba(0, 0, 0, 0.4)' },
  '--mrmd-shadow-xl': { description: 'Extra large shadow', category: 'shell', default: '0 16px 48px rgba(0, 0, 0, 0.5)' },
  // Status bar specific
  '--mrmd-statusbar-bg': { description: 'Status bar background', category: 'shell', default: 'var(--mrmd-panel-bg)' },
  '--mrmd-statusbar-fg': { description: 'Status bar foreground', category: 'shell', default: 'var(--mrmd-fg-muted)' },
  '--mrmd-statusbar-fg-muted': { description: 'Status bar muted foreground', category: 'shell', default: 'var(--mrmd-fg-muted)' },
  '--mrmd-statusbar-border': { description: 'Status bar border', category: 'shell', default: 'var(--mrmd-border)' },
  '--mrmd-statusbar-hover': { description: 'Status bar hover background', category: 'shell', default: 'var(--mrmd-hover-bg)' },
  '--mrmd-statusbar-active': { description: 'Status bar active background', category: 'shell', default: 'var(--mrmd-active-bg)' },
  '--mrmd-statusbar-separator': { description: 'Status bar separator color', category: 'shell', default: 'var(--mrmd-border)' },
  // Menu specific
  '--mrmd-menu-bg': { description: 'Menu background', category: 'shell', default: 'var(--mrmd-popup-bg)' },
  '--mrmd-menu-border': { description: 'Menu border', category: 'shell', default: '#454545' },
  '--mrmd-menu-hover': { description: 'Menu item hover background', category: 'shell', default: 'var(--mrmd-hover-bg)' },
  '--mrmd-menu-active': { description: 'Menu item active background', category: 'shell', default: 'var(--mrmd-selection-bg)' },
  '--mrmd-menu-divider': { description: 'Menu divider color', category: 'shell', default: 'var(--mrmd-border)' },
  // Dialog specific
  '--mrmd-dialog-bg': { description: 'Dialog background', category: 'shell', default: 'var(--mrmd-popup-bg)' },
  '--mrmd-dialog-border': { description: 'Dialog border', category: 'shell', default: '#454545' },
  // Input specific
  '--mrmd-input-bg': { description: 'Input background', category: 'shell', default: 'var(--mrmd-bg)' },
  '--mrmd-input-border': { description: 'Input border', category: 'shell', default: '#454545' },
  // Button specific
  '--mrmd-button-bg': { description: 'Button background', category: 'shell', default: '#3c3c3c' },
  '--mrmd-button-border': { description: 'Button border', category: 'shell', default: '#5a5a5a' },
  '--mrmd-button-hover': { description: 'Button hover background', category: 'shell', default: '#4a4a4a' },
  '--mrmd-button-active': { description: 'Button active background', category: 'shell', default: '#555555' },
};

// #endregion TOKEN_DEFINITIONS

// #region FONT_FACES

/**
 * Shared @font-face declarations for Monaspace Neon and Literata.
 * These are the default fonts used across most themes.
 *
 * Fonts are bundled in src/fonts/ and should be served from your app's assets.
 * Adjust the paths below to match your deployment setup.
 */
export const defaultFontFace = `
@font-face {
  font-family: 'Monaspace Neon Var';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./assets/fonts/MonaspaceNeon-Variable.woff2') format('woff2');
}

@font-face {
  font-family: 'Literata';
  font-style: normal;
  font-weight: 200 900;
  font-display: swap;
  src: url('./assets/fonts/Literata-Variable.ttf') format('truetype');
  font-optical-sizing: auto;
}

@font-face {
  font-family: 'Literata';
  font-style: italic;
  font-weight: 200 900;
  font-display: swap;
  src: url('./assets/fonts/Literata-Italic-Variable.ttf') format('truetype');
  font-optical-sizing: auto;
}
`;

// #endregion FONT_FACES

// #region BUILT_IN_THEMES

/**
 * Midnight Theme (Default Dark)
 *
 * Deep dark theme with blue accents.
 * Designed for comfortable extended editing sessions.
 */
export const midnightTheme = {
  name: 'midnight',
  description: 'Deep dark theme with blue accents. Default for dark mode.',
  isDark: true,  // Controls CodeMirror editor theme
  fontFace: defaultFontFace,

  // Spacing (shared across themes)
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '12px',
  '--widget-padding-y': '8px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '3px',

  // Text layout
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // Typography (shared across themes)
  '--widget-font-mono': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--widget-font-sans': "Literata, Charter, Georgia, serif",
  '--editor-font-family': "Literata, Charter, Georgia, serif",
  '--widget-font-size': '0.9em',
  '--widget-font-size-small': '0.8em',
  '--widget-font-size-label': '11px',

  // Surfaces
  '--widget-surface': 'rgba(0, 0, 0, 0.35)',
  '--widget-surface-hover': 'rgba(0, 0, 0, 0.45)',
  '--widget-surface-elevated': '#1e1e1e',
  '--widget-surface-inset': 'rgba(0, 0, 0, 0.2)',

  // Borders
  '--widget-border': 'rgba(255, 255, 255, 0.1)',
  '--widget-border-accent': 'rgba(100, 149, 237, 0.6)',
  '--widget-border-focus': '#6495ed',

  // Text
  '--widget-text': '#e0e0e0',
  '--widget-text-muted': '#888888',
  '--widget-text-accent': '#6495ed',

  // Semantic
  '--widget-success': '#22c55e',
  '--widget-warning': '#f59e0b',
  '--widget-error': '#ef4444',
  '--widget-info': '#3b82f6',

  // ANSI colors (optimized for dark backgrounds)
  '--ansi-black': '#1e1e1e',
  '--ansi-red': '#f87171',
  '--ansi-green': '#4ade80',
  '--ansi-yellow': '#facc15',
  '--ansi-blue': '#60a5fa',
  '--ansi-magenta': '#c084fc',
  '--ansi-cyan': '#22d3ee',
  '--ansi-white': '#e0e0e0',
  '--ansi-bright-black': '#6b7280',
  '--ansi-bright-red': '#fca5a5',
  '--ansi-bright-green': '#86efac',
  '--ansi-bright-yellow': '#fde047',
  '--ansi-bright-blue': '#93c5fd',
  '--ansi-bright-magenta': '#d8b4fe',
  '--ansi-bright-cyan': '#67e8f9',
  '--ansi-bright-white': '#ffffff',

  // Terminal colors
  '--term-background': '#1e1e1e',
  '--term-foreground': '#d4d4d4',
  '--term-cursor': '#aeafad',
  '--term-cursor-accent': '#1e1e1e',
  '--term-selection': '#37608c',
  '--term-border': 'rgba(255, 255, 255, 0.1)',
  '--term-header-bg': '#252526',
  '--term-header-fg': '#888888',

  // Collaborator defaults
  '--collab-human': '#3b82f6',
  '--collab-ai': '#8b5cf6',
  '--collab-runtime': '#10b981',

  // Editor (VS Code Dark inspired)
  '--editor-background': '#1e1e1e',
  '--editor-foreground': '#d4d4d4',
  '--editor-line-number': '#858585',
  '--editor-line-number-active': '#c6c6c6',
  '--editor-selection': '#37608c',        // Brighter blue for better contrast
  '--editor-selection-match': '#515c6a',
  '--editor-cursor': '#aeafad',
  '--editor-active-line': 'rgba(255, 255, 255, 0.05)',
  '--editor-gutter': '#1e1e1e',
  '--editor-matching-bracket': 'rgba(255, 255, 255, 0.1)',

  // Syntax highlighting (VS Code Dark inspired)
  '--syntax-keyword': '#569cd6',
  '--syntax-control': '#c586c0',
  '--syntax-string': '#ce9178',
  '--syntax-number': '#b5cea8',
  '--syntax-comment': '#6a9955',
  '--syntax-function': '#dcdcaa',
  '--syntax-variable': '#9cdcfe',
  '--syntax-variable-special': '#569cd6',
  '--syntax-property': '#9cdcfe',
  '--syntax-operator': '#d4d4d4',
  '--syntax-punctuation': '#d4d4d4',
  '--syntax-type': '#4ec9b0',
  '--syntax-class': '#4ec9b0',
  '--syntax-constant': '#569cd6',
  '--syntax-parameter': '#9cdcfe',
  '--syntax-regexp': '#d16969',
  '--syntax-escape': '#d7ba7d',
  '--syntax-tag': '#569cd6',
  '--syntax-attribute': '#9cdcfe',
  '--syntax-attribute-value': '#ce9178',
  '--syntax-heading': '#569cd6',
  '--syntax-link': '#3794ff',
  '--syntax-link-text': '#ce9178',
  '--syntax-emphasis': '#569cd6',
  '--syntax-strong': '#569cd6',
  '--syntax-strikethrough': '#858585',
  '--syntax-quote': '#6a9955',
  '--syntax-code': '#ce9178',
  '--syntax-code-background': 'rgba(110, 118, 129, 0.2)',
  '--syntax-meta': '#858585',
  '--syntax-inserted': '#b5cea8',
  '--syntax-deleted': '#ce9178',
  '--syntax-changed': '#569cd6',

  // Markdown rendering
  '--md-heading-1-size': '1.75em',
  '--md-heading-2-size': '1.4em',
  '--md-heading-3-size': '1.2em',
  '--md-heading-4-size': '1.1em',
  '--md-heading-5-size': '1.05em',
  '--md-heading-6-size': '1em',
  '--md-heading-weight': '600',
  '--md-heading-line-height': '1.3',
  '--md-heading-margin-top': '0.5em',
  '--md-marker-color': '#6b7280',
  '--md-marker-font': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--md-link-color': '#6495ed',
  '--md-link-decoration': 'underline',
  '--md-code-background': 'rgba(110, 118, 129, 0.2)',
  '--md-code-color': '#ce9178',
  '--md-code-padding': '0.15em 0.35em',
  '--md-code-radius': '3px',
  '--md-blockquote-border': 'rgba(100, 149, 237, 0.5)',
  '--md-blockquote-border-width': '3px',
  '--md-blockquote-color': '#888888',
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#888888',
  '--md-hr-color': 'rgba(255, 255, 255, 0.1)',
  '--md-hr-height': '1px',
  '--md-hr-margin': '1.5em 0',
  '--md-table-border': 'rgba(255, 255, 255, 0.1)',
  '--md-table-header-bg': 'rgba(0, 0, 0, 0.2)',
  '--md-table-header-weight': '600',
  '--md-table-cell-padding': '0.5em 0.75em',
  '--md-table-stripe-bg': 'transparent',
  '--md-image-max-width': '100%',
  '--md-image-border-radius': '6px',
  '--md-checkbox-size': '1em',
  '--md-checkbox-color': '#6495ed',
  '--md-alert-note-color': '#3b82f6',
  '--md-alert-tip-color': '#22c55e',
  '--md-alert-important-color': '#569cd6',
  '--md-alert-warning-color': '#f59e0b',
  '--md-alert-caution-color': '#ef4444',

  // Shell (status bar, menus, dialogs)
  '--mrmd-ui-font': "Literata, Charter, Georgia, serif",
  '--mrmd-ui-font-size': '13px',
  '--mrmd-ui-font-size-sm': '11px',
  '--mrmd-panel-bg': '#1e1e1e',
  '--mrmd-popup-bg': '#252526',
  '--mrmd-bg': '#1e1e1e',
  '--mrmd-fg': '#cccccc',
  '--mrmd-fg-muted': '#888888',
  '--mrmd-border': '#3c3c3c',
  '--mrmd-hover-bg': 'rgba(255, 255, 255, 0.05)',
  '--mrmd-active-bg': 'rgba(255, 255, 255, 0.08)',
  '--mrmd-selection-bg': 'rgba(100, 149, 237, 0.3)',
  '--mrmd-accent': '#6495ed',
  '--mrmd-accent-hover': '#7ba6f7',
  '--mrmd-success': '#4caf50',
  '--mrmd-warning': '#ff9800',
  '--mrmd-error': '#f44336',
  '--mrmd-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.3)',
  '--mrmd-shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.4)',
  '--mrmd-shadow-xl': '0 16px 48px rgba(0, 0, 0, 0.5)',
};

/**
 * Daylight Theme (Default Light)
 *
 * Clean light theme inspired by Material for MkDocs.
 * Professional documentation-style appearance.
 */
export const daylightTheme = {
  name: 'daylight',
  description: 'Clean light theme inspired by Material for MkDocs.',
  isDark: false,  // Controls CodeMirror editor theme
  fontFace: defaultFontFace,

  // Spacing
  '--widget-line-height': '1.6',
  '--widget-padding-x': '16px',
  '--widget-padding-y': '12px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '4px',
  '--widget-border-width': '0',
  '--widget-border-accent-width': '0',

  // Output styling - typewriter/console feel
  '--widget-inset-left': '24px',
  '--widget-offset-top': '0',

  // Text layout
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // Typography (Material Design - Roboto family)
  '--widget-font-mono': "'Roboto Mono', 'SF Mono', Monaco, Consolas, monospace",
  '--widget-font-sans': "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--widget-font-size': '0.85em',

  // Main editor font
  '--editor-font-family': "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--widget-font-size-small': '0.75em',
  '--widget-font-size-label': '11px',

  // Surfaces - light gray code background like Material
  '--widget-surface': '#f5f5f5',
  '--widget-surface-hover': '#eeeeee',
  '--widget-surface-elevated': '#ffffff',
  '--widget-surface-inset': '#fafafa',

  // Borders - subtle
  '--widget-border': 'rgba(0, 0, 0, 0.08)',
  '--widget-border-accent': 'rgba(0, 0, 0, 0.12)',
  '--widget-border-focus': '#1976d2',

  // Text (dark text on light backgrounds)
  '--widget-text': '#37474f',
  '--widget-text-muted': '#78909c',
  '--widget-text-accent': '#1976d2',

  // Semantic colors (Material palette)
  '--widget-success': '#4caf50',
  '--widget-warning': '#ff9800',
  '--widget-error': '#f44336',
  '--widget-info': '#2196f3',

  // ANSI colors (Material-inspired, darker for light backgrounds)
  '--ansi-black': '#263238',
  '--ansi-red': '#f44336',
  '--ansi-green': '#4caf50',
  '--ansi-yellow': '#ff9800',
  '--ansi-blue': '#2196f3',
  '--ansi-magenta': '#9c27b0',
  '--ansi-cyan': '#00bcd4',
  '--ansi-white': '#fafafa',
  '--ansi-bright-black': '#546e7a',
  '--ansi-bright-red': '#e57373',
  '--ansi-bright-green': '#81c784',
  '--ansi-bright-yellow': '#ffb74d',
  '--ansi-bright-blue': '#64b5f6',
  '--ansi-bright-magenta': '#ba68c8',
  '--ansi-bright-cyan': '#4dd0e1',
  '--ansi-bright-white': '#ffffff',

  // Terminal colors (light theme)
  '--term-background': '#fafafa',
  '--term-foreground': '#37474f',
  '--term-cursor': '#37474f',
  '--term-cursor-accent': '#ffffff',
  '--term-selection': '#bbdefb',
  '--term-border': 'rgba(0, 0, 0, 0.12)',
  '--term-header-bg': '#f5f5f5',
  '--term-header-fg': '#78909c',

  // Collaborator defaults
  '--collab-human': '#1976d2',
  '--collab-ai': '#7b1fa2',
  '--collab-runtime': '#388e3c',

  // Editor - clean white background
  '--editor-background': '#ffffff',
  '--editor-foreground': '#37474f',
  '--editor-line-number': '#90a4ae',
  '--editor-line-number-active': '#546e7a',
  '--editor-selection': '#bbdefb',        // More saturated blue for better visibility
  '--editor-selection-match': '#fff9c4',
  '--editor-cursor': '#37474f',
  '--editor-active-line': 'rgba(0, 0, 0, 0.02)',
  '--editor-gutter': '#ffffff',
  '--editor-matching-bracket': '#c8e6c9',

  // Syntax highlighting - Material for MkDocs inspired
  '--syntax-keyword': '#0d47a1',      // Blue for keywords (from, import, def, class)
  '--syntax-control': '#0d47a1',      // Blue for control flow
  '--syntax-string': '#2e7d32',       // Green for strings
  '--syntax-number': '#e65100',       // Orange for numbers
  '--syntax-comment': '#757575',      // Gray for comments
  '--syntax-function': '#6a1b9a',     // Purple for functions
  '--syntax-variable': '#37474f',     // Dark gray for variables
  '--syntax-variable-special': '#0d47a1',  // Blue for self/this
  '--syntax-property': '#0d47a1',     // Blue for properties/keys (YAML keys)
  '--syntax-operator': '#37474f',     // Dark for operators
  '--syntax-punctuation': '#37474f',  // Dark for punctuation
  '--syntax-type': '#00695c',         // Teal for types
  '--syntax-class': '#00695c',        // Teal for class names
  '--syntax-constant': '#0d47a1',     // Blue for constants
  '--syntax-parameter': '#37474f',    // Dark for parameters
  '--syntax-regexp': '#c62828',       // Red for regex
  '--syntax-escape': '#e65100',       // Orange for escapes
  '--syntax-tag': '#c62828',          // Red for HTML tags
  '--syntax-attribute': '#6a1b9a',    // Purple for attributes
  '--syntax-attribute-value': '#2e7d32',  // Green for attribute values
  '--syntax-heading': '#000000',      // Black for headings
  '--syntax-link': '#1976d2',         // Blue for links
  '--syntax-link-text': '#1976d2',    // Blue for link text
  '--syntax-emphasis': '#37474f',     // Dark for emphasis
  '--syntax-strong': '#000000',       // Black for strong/bold
  '--syntax-strikethrough': '#757575',
  '--syntax-quote': '#757575',
  '--syntax-code': '#c62828',         // Red for inline code (like Material)
  '--syntax-code-background': '#f5f5f5',
  '--syntax-meta': '#757575',
  '--syntax-inserted': '#2e7d32',
  '--syntax-deleted': '#c62828',
  '--syntax-changed': '#1565c0',

  // Markdown rendering - Material for MkDocs style headings
  '--md-heading-1-size': '2em',
  '--md-heading-2-size': '1.5625em',
  '--md-heading-3-size': '1.25em',
  '--md-heading-4-size': '1em',
  '--md-heading-5-size': '0.875em',
  '--md-heading-6-size': '0.75em',
  '--md-heading-weight': '700',
  '--md-heading-line-height': '1.4',
  '--md-heading-margin-top': '0.8em',
  '--md-heading-color': '#000000',
  '--md-marker-color': '#90a4ae',
  '--md-marker-font': "'Roboto Mono', 'SF Mono', Monaco, monospace",
  '--md-link-color': '#1976d2',
  '--md-link-decoration': 'none',
  '--md-code-background': '#f5f5f5',
  '--md-code-color': '#c62828',
  '--md-code-padding': '0.2em 0.4em',
  '--md-code-radius': '4px',
  '--md-blockquote-border': '#e0e0e0',
  '--md-blockquote-border-width': '4px',
  '--md-blockquote-color': '#78909c',
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#78909c',
  '--md-hr-color': '#e0e0e0',
  '--md-hr-height': '1px',
  '--md-hr-margin': '2em 0',
  '--md-table-border': '#e0e0e0',
  '--md-table-header-bg': '#fafafa',
  '--md-table-header-weight': '500',
  '--md-table-cell-padding': '0.75em 1em',
  '--md-table-stripe-bg': 'transparent',
  '--md-image-max-width': '100%',
  '--md-image-border-radius': '4px',
  '--md-checkbox-size': '1.1em',
  '--md-checkbox-color': '#1976d2',
  '--md-alert-note-color': '#1976d2',
  '--md-alert-tip-color': '#388e3c',
  '--md-alert-important-color': '#7b1fa2',
  '--md-alert-warning-color': '#f57c00',
  '--md-alert-caution-color': '#d32f2f',

  // Shell (status bar, menus, dialogs) - Material Light
  '--mrmd-ui-font': "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--mrmd-ui-font-size': '14px',
  '--mrmd-ui-font-size-sm': '12px',
  '--mrmd-panel-bg': '#fafafa',
  '--mrmd-popup-bg': '#ffffff',
  '--mrmd-bg': '#ffffff',
  '--mrmd-fg': '#37474f',
  '--mrmd-fg-muted': '#78909c',
  '--mrmd-border': '#e0e0e0',
  '--mrmd-hover-bg': 'rgba(0, 0, 0, 0.04)',
  '--mrmd-active-bg': 'rgba(0, 0, 0, 0.08)',
  '--mrmd-selection-bg': 'rgba(25, 118, 210, 0.12)',
  '--mrmd-accent': '#1976d2',
  '--mrmd-accent-hover': '#1565c0',
  '--mrmd-success': '#4caf50',
  '--mrmd-warning': '#ff9800',
  '--mrmd-error': '#f44336',
  '--mrmd-shadow-md': '0 2px 4px rgba(0, 0, 0, 0.1)',
  '--mrmd-shadow-lg': '0 4px 8px rgba(0, 0, 0, 0.12)',
  '--mrmd-shadow-xl': '0 8px 16px rgba(0, 0, 0, 0.15)',
  '--mrmd-menu-border': '#e0e0e0',
  '--mrmd-dialog-border': '#e0e0e0',
  '--mrmd-input-border': '#e0e0e0',
  '--mrmd-button-bg': '#fafafa',
  '--mrmd-button-border': '#e0e0e0',
  '--mrmd-button-hover': '#f5f5f5',
  '--mrmd-button-active': '#eeeeee',
};

/**
 * GitHub Theme (Dark)
 *
 * GitHub-inspired styling for familiarity.
 * Based on GitHub's code block and UI colors.
 */
export const githubTheme = {
  name: 'github',
  description: 'GitHub-inspired theme. Familiar for developers.',
  isDark: true,  // GitHub dark theme - controls CodeMirror editor theme
  fontFace: defaultFontFace,

  // Spacing
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '16px',
  '--widget-padding-y': '12px',
  '--widget-margin-y': '8px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '4px',

  // Text layout
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // Typography
  '--widget-font-mono': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--widget-font-sans': "Literata, Charter, Georgia, serif",
  '--editor-font-family': "Literata, Charter, Georgia, serif",
  '--widget-font-size': '0.875em',
  '--widget-font-size-small': '0.75em',
  '--widget-font-size-label': '12px',

  // Surfaces (GitHub dark default)
  '--widget-surface': '#161b22',
  '--widget-surface-hover': '#21262d',
  '--widget-surface-elevated': '#0d1117',
  '--widget-surface-inset': '#010409',

  // Borders (GitHub-style)
  '--widget-border': '#30363d',
  '--widget-border-accent': '#238636',
  '--widget-border-focus': '#58a6ff',

  // Text (GitHub colors)
  '--widget-text': '#c9d1d9',
  '--widget-text-muted': '#8b949e',
  '--widget-text-accent': '#58a6ff',

  // Semantic (GitHub palette)
  '--widget-success': '#238636',
  '--widget-warning': '#d29922',
  '--widget-error': '#f85149',
  '--widget-info': '#58a6ff',

  // ANSI colors (GitHub terminal colors)
  '--ansi-black': '#0d1117',
  '--ansi-red': '#ff7b72',
  '--ansi-green': '#7ee787',
  '--ansi-yellow': '#d29922',
  '--ansi-blue': '#79c0ff',
  '--ansi-magenta': '#d2a8ff',
  '--ansi-cyan': '#a5d6ff',
  '--ansi-white': '#c9d1d9',
  '--ansi-bright-black': '#484f58',
  '--ansi-bright-red': '#ffa198',
  '--ansi-bright-green': '#a5d6ff',
  '--ansi-bright-yellow': '#e3b341',
  '--ansi-bright-blue': '#a5d6ff',
  '--ansi-bright-magenta': '#d2a8ff',
  '--ansi-bright-cyan': '#b6e3ff',
  '--ansi-bright-white': '#ffffff',

  // Terminal colors (GitHub Dark)
  '--term-background': '#0d1117',
  '--term-foreground': '#c9d1d9',
  '--term-cursor': '#c9d1d9',
  '--term-cursor-accent': '#0d1117',
  '--term-selection': '#3a6ea5',
  '--term-border': '#30363d',
  '--term-header-bg': '#161b22',
  '--term-header-fg': '#8b949e',

  // Collaborator defaults
  '--collab-human': '#58a6ff',
  '--collab-ai': '#d2a8ff',
  '--collab-runtime': '#7ee787',

  // Editor (GitHub Dark)
  '--editor-background': '#0d1117',
  '--editor-foreground': '#c9d1d9',
  '--editor-line-number': '#6e7681',
  '--editor-line-number-active': '#c9d1d9',
  '--editor-selection': '#3a6ea5',        // Brighter blue for better contrast on dark github bg
  '--editor-selection-match': '#3b5070',
  '--editor-cursor': '#c9d1d9',
  '--editor-active-line': 'rgba(110, 118, 129, 0.1)',
  '--editor-gutter': '#0d1117',
  '--editor-matching-bracket': 'rgba(110, 118, 129, 0.3)',

  // Syntax highlighting (GitHub Dark)
  '--syntax-keyword': '#ff7b72',
  '--syntax-control': '#ff7b72',
  '--syntax-string': '#a5d6ff',
  '--syntax-number': '#79c0ff',
  '--syntax-comment': '#8b949e',
  '--syntax-function': '#d2a8ff',
  '--syntax-variable': '#ffa657',
  '--syntax-variable-special': '#ff7b72',
  '--syntax-property': '#c9d1d9',
  '--syntax-operator': '#ff7b72',
  '--syntax-punctuation': '#c9d1d9',
  '--syntax-type': '#ffa657',
  '--syntax-class': '#ffa657',
  '--syntax-constant': '#79c0ff',
  '--syntax-parameter': '#ffa657',
  '--syntax-regexp': '#7ee787',
  '--syntax-escape': '#79c0ff',
  '--syntax-tag': '#7ee787',
  '--syntax-attribute': '#79c0ff',
  '--syntax-attribute-value': '#a5d6ff',
  '--syntax-heading': '#79c0ff',
  '--syntax-link': '#58a6ff',
  '--syntax-link-text': '#a5d6ff',
  '--syntax-emphasis': '#c9d1d9',
  '--syntax-strong': '#c9d1d9',
  '--syntax-strikethrough': '#8b949e',
  '--syntax-quote': '#8b949e',
  '--syntax-code': '#79c0ff',
  '--syntax-code-background': 'rgba(110, 118, 129, 0.2)',
  '--syntax-meta': '#8b949e',
  '--syntax-inserted': '#7ee787',
  '--syntax-deleted': '#ff7b72',
  '--syntax-changed': '#79c0ff',

  // Markdown rendering
  '--md-heading-1-size': '1.75em',
  '--md-heading-2-size': '1.4em',
  '--md-heading-3-size': '1.2em',
  '--md-heading-4-size': '1.1em',
  '--md-heading-5-size': '1.05em',
  '--md-heading-6-size': '1em',
  '--md-heading-weight': '600',
  '--md-heading-line-height': '1.3',
  '--md-heading-margin-top': '0.5em',
  '--md-marker-color': '#6e7681',
  '--md-marker-font': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--md-link-color': '#58a6ff',
  '--md-link-decoration': 'underline',
  '--md-code-background': 'rgba(110, 118, 129, 0.2)',
  '--md-code-color': '#79c0ff',
  '--md-code-padding': '0.15em 0.35em',
  '--md-code-radius': '6px',
  '--md-blockquote-border': '#30363d',
  '--md-blockquote-border-width': '4px',
  '--md-blockquote-color': '#8b949e',
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#8b949e',
  '--md-hr-color': '#30363d',
  '--md-hr-height': '1px',
  '--md-hr-margin': '1.5em 0',
  '--md-table-border': '#30363d',
  '--md-table-header-bg': '#161b22',
  '--md-table-header-weight': '600',
  '--md-table-cell-padding': '0.5em 0.75em',
  '--md-table-stripe-bg': 'transparent',
  '--md-image-max-width': '100%',
  '--md-image-border-radius': '6px',
  '--md-checkbox-size': '1em',
  '--md-checkbox-color': '#58a6ff',
  '--md-alert-note-color': '#58a6ff',
  '--md-alert-tip-color': '#238636',
  '--md-alert-important-color': '#a371f7',
  '--md-alert-warning-color': '#d29922',
  '--md-alert-caution-color': '#f85149',

  // Shell (status bar, menus, dialogs) - GitHub dark
  '--mrmd-ui-font': "Literata, Charter, Georgia, serif",
  '--mrmd-ui-font-size': '14px',
  '--mrmd-ui-font-size-sm': '12px',
  '--mrmd-panel-bg': '#161b22',
  '--mrmd-popup-bg': '#1c2128',
  '--mrmd-bg': '#0d1117',
  '--mrmd-fg': '#c9d1d9',
  '--mrmd-fg-muted': '#8b949e',
  '--mrmd-border': '#30363d',
  '--mrmd-hover-bg': 'rgba(177, 186, 196, 0.12)',
  '--mrmd-active-bg': 'rgba(177, 186, 196, 0.18)',
  '--mrmd-selection-bg': 'rgba(88, 166, 255, 0.2)',
  '--mrmd-accent': '#58a6ff',
  '--mrmd-accent-hover': '#79c0ff',
  '--mrmd-success': '#238636',
  '--mrmd-warning': '#d29922',
  '--mrmd-error': '#f85149',
  '--mrmd-shadow-md': '0 8px 24px rgba(1, 4, 9, 0.75)',
  '--mrmd-shadow-lg': '0 12px 28px rgba(1, 4, 9, 0.8)',
  '--mrmd-shadow-xl': '0 16px 36px rgba(1, 4, 9, 0.85)',
  '--mrmd-menu-border': '#30363d',
  '--mrmd-dialog-border': '#30363d',
  '--mrmd-input-border': '#30363d',
  '--mrmd-button-bg': '#21262d',
  '--mrmd-button-border': '#30363d',
  '--mrmd-button-hover': '#30363d',
  '--mrmd-button-active': '#3c444d',
};

/**
 * Nord Theme
 *
 * An arctic, north-bluish color palette inspired by the Nord design system.
 * https://www.nordtheme.com/
 *
 * ## Color Philosophy
 *
 * Nord uses a carefully crafted palette of 16 colors organized into 4 groups:
 *
 * **Polar Night (dark backgrounds)**
 * - nord0 (#2e3440) - Base background
 * - nord1 (#3b4252) - Elevated surfaces
 * - nord2 (#434c5e) - Selection, highlights
 * - nord3 (#4c566a) - Comments, invisibles
 *
 * **Snow Storm (light text)**
 * - nord4 (#d8dee9) - Primary text
 * - nord5 (#e5e9f0) - Subtle highlights
 * - nord6 (#eceff4) - Bright/emphasized text
 *
 * **Frost (accent colors - cold)**
 * - nord7  (#8fbcbb) - Strings, classes (teal)
 * - nord8  (#88c0d0) - Constants, attributes (light blue)
 * - nord9  (#81a1c1) - Functions, keywords (medium blue)
 * - nord10 (#5e81ac) - Types, links (dark blue)
 *
 * **Aurora (accent colors - warm)**
 * - nord11 (#bf616a) - Errors, deleted (red)
 * - nord12 (#d08770) - Warnings, changed (orange)
 * - nord13 (#ebcb8b) - Numbers, special (yellow)
 * - nord14 (#a3be8c) - Success, strings, inserted (green)
 * - nord15 (#b48ead) - Keywords (purple)
 *
 * ## Design Decisions
 *
 * 1. **Low contrast by design** - Nord prioritizes eye comfort over maximum
 *    contrast. This makes it excellent for long coding sessions.
 *
 * 2. **Consistent accent usage** - Each color has a semantic meaning that
 *    stays consistent across syntax elements:
 *    - Frost colors = structural elements (types, functions, keywords)
 *    - Aurora colors = values and states (strings, numbers, errors)
 *
 * 3. **Widget integration** - Widgets use the same Polar Night backgrounds
 *    so they blend seamlessly with the editor.
 *
 * ## Creating Variants
 *
 * To create a "Nord Light" variant, you would:
 * 1. Swap Snow Storm ↔ Polar Night for backgrounds/foregrounds
 * 2. Adjust Frost colors for higher contrast on light backgrounds
 * 3. Keep Aurora colors similar (they work on both)
 *
 * @example
 * // Use the built-in Nord theme
 * editor.setTheme('nord');
 *
 * @example
 * // Extend Nord with custom overrides
 * const myNord = mrmd.widgets.createTheme({
 *   name: 'my-nord',
 *   base: 'nord',
 *   overrides: {
 *     '--widget-border-accent': '#88c0d0',  // Use frost blue for accents
 *   }
 * });
 */
export const nordTheme = {
  name: 'nord',
  description: 'Arctic, north-bluish theme. Optimized for eye comfort during long sessions.',
  isDark: true,
  fontFace: defaultFontFace,

  // ===========================================================================
  // SPACING
  // Standard spacing values - Nord doesn't specify spacing, so we use defaults
  // that work well with the overall aesthetic.
  // ===========================================================================
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '12px',
  '--widget-padding-y': '8px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '4px',  // Slightly less rounded than default
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '3px',

  // Text layout
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // ===========================================================================
  // TYPOGRAPHY
  // ===========================================================================
  '--widget-font-mono': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--widget-font-sans': "Literata, Charter, Georgia, serif",
  '--editor-font-family': "Literata, Charter, Georgia, serif",
  '--widget-font-size': '0.9em',
  '--widget-font-size-small': '0.8em',
  '--widget-font-size-label': '11px',

  // ===========================================================================
  // SURFACES (Polar Night palette)
  //
  // nord0 (#2e3440) - Darkest, main background
  // nord1 (#3b4252) - Slightly elevated
  // nord2 (#434c5e) - UI elements, selections
  // nord3 (#4c566a) - Subtle highlights, disabled states
  // ===========================================================================
  '--widget-surface': '#2e3440',           // nord0 - matches editor background
  '--widget-surface-hover': '#3b4252',     // nord1 - subtle hover state
  '--widget-surface-elevated': '#3b4252',  // nord1 - tooltips, dropdowns
  '--widget-surface-inset': '#242933',     // Darker than nord0 for inputs

  // ===========================================================================
  // BORDERS
  //
  // Borders use Polar Night colors for subtlety, with Frost accent for focus.
  // The accent border uses nord9 (medium blue) for a calm but visible indicator.
  // ===========================================================================
  '--widget-border': '#3b4252',            // nord1 - subtle dividers
  '--widget-border-accent': '#81a1c1',     // nord9 - accent bar on outputs
  '--widget-border-focus': '#88c0d0',      // nord8 - bright focus ring

  // ===========================================================================
  // TEXT COLORS (Snow Storm palette)
  //
  // nord4 (#d8dee9) - Primary text
  // nord5 (#e5e9f0) - Emphasized text
  // nord6 (#eceff4) - Brightest, used sparingly
  //
  // Muted text uses nord3 from Polar Night for sufficient contrast.
  // ===========================================================================
  '--widget-text': '#d8dee9',              // nord4 - primary text
  '--widget-text-muted': '#4c566a',        // nord3 - secondary text
  '--widget-text-accent': '#88c0d0',       // nord8 - links, interactive

  // ===========================================================================
  // SEMANTIC COLORS (Aurora palette)
  //
  // These use the Aurora (warm) colors which stand out against the cold
  // Polar Night backgrounds, making status indicators immediately visible.
  // ===========================================================================
  '--widget-success': '#a3be8c',           // nord14 - green
  '--widget-warning': '#ebcb8b',           // nord13 - yellow
  '--widget-error': '#bf616a',             // nord11 - red
  '--widget-info': '#81a1c1',              // nord9 - blue

  // ===========================================================================
  // ANSI TERMINAL COLORS
  //
  // Maps standard ANSI colors to Nord palette. This ensures terminal output
  // in code cells matches the overall theme aesthetic.
  //
  // Standard colors use Aurora, bright variants are slightly desaturated
  // to maintain the Nord aesthetic of "calm but readable".
  // ===========================================================================
  '--ansi-black': '#3b4252',               // nord1 (not pure black)
  '--ansi-red': '#bf616a',                 // nord11
  '--ansi-green': '#a3be8c',               // nord14
  '--ansi-yellow': '#ebcb8b',              // nord13
  '--ansi-blue': '#81a1c1',                // nord9
  '--ansi-magenta': '#b48ead',             // nord15
  '--ansi-cyan': '#88c0d0',                // nord8
  '--ansi-white': '#e5e9f0',               // nord5
  // Bright variants
  '--ansi-bright-black': '#4c566a',        // nord3
  '--ansi-bright-red': '#bf616a',          // nord11 (same, already bright)
  '--ansi-bright-green': '#a3be8c',        // nord14
  '--ansi-bright-yellow': '#ebcb8b',       // nord13
  '--ansi-bright-blue': '#81a1c1',         // nord9
  '--ansi-bright-magenta': '#b48ead',      // nord15
  '--ansi-bright-cyan': '#8fbcbb',         // nord7
  '--ansi-bright-white': '#eceff4',        // nord6

  // Terminal colors (using Nord Polar Night for bg, Snow Storm for text)
  '--term-background': '#2e3440',          // nord0 - matches editor
  '--term-foreground': '#d8dee9',          // nord4
  '--term-cursor': '#d8dee9',              // nord4
  '--term-cursor-accent': '#2e3440',       // nord0
  '--term-selection': '#5e81ac',           // nord10
  '--term-border': '#3b4252',              // nord1
  '--term-header-bg': '#3b4252',           // nord1
  '--term-header-fg': '#4c566a',           // nord3

  // ===========================================================================
  // COLLABORATOR COLORS
  //
  // Using Frost colors for collaborators - they're distinct from Aurora
  // (used for status) and provide good differentiation between user types.
  // ===========================================================================
  '--collab-human': '#88c0d0',             // nord8 - humans are "cool"
  '--collab-ai': '#b48ead',                // nord15 - AI uses purple
  '--collab-runtime': '#a3be8c',           // nord14 - runtime is "alive" green

  // ===========================================================================
  // EDITOR (Polar Night + Snow Storm)
  //
  // The editor background is nord0, the darkest Polar Night color.
  // This creates a calm, focused editing environment.
  // ===========================================================================
  '--editor-background': '#2e3440',        // nord0
  '--editor-foreground': '#d8dee9',        // nord4
  '--editor-line-number': '#4c566a',       // nord3 - subtle but readable
  '--editor-line-number-active': '#d8dee9',// nord4 - matches text
  '--editor-selection': '#5e81ac',         // nord10 - much better contrast than nord2
  '--editor-selection-match': '#4c566a',   // nord3 - visible match highlight
  '--editor-cursor': '#d8dee9',            // nord4 - matches text
  '--editor-active-line': 'rgba(67, 76, 94, 0.5)',  // nord2 at 50%
  '--editor-gutter': '#2e3440',            // nord0 - matches background
  '--editor-matching-bracket': 'rgba(136, 192, 208, 0.3)',  // nord8 at 30%

  // ===========================================================================
  // SYNTAX HIGHLIGHTING
  //
  // Nord's syntax philosophy:
  // - Frost (cold blues/teals) = Structural elements (types, functions)
  // - Aurora (warm colors) = Values and literals (strings, numbers)
  // - Snow Storm (whites) = Plain text, operators
  // - Polar Night = Comments (nord3)
  //
  // This creates a visual hierarchy where structure is cool/calm and
  // data/values "pop" with warmer colors.
  // ===========================================================================

  // Keywords and control flow - nord9 (medium blue) and nord15 (purple)
  '--syntax-keyword': '#81a1c1',           // nord9 - structural keywords
  '--syntax-control': '#81a1c1',           // nord9 - return, if, else

  // Literals - Aurora colors
  '--syntax-string': '#a3be8c',            // nord14 - green for strings
  '--syntax-number': '#b48ead',            // nord15 - purple for numbers
  '--syntax-constant': '#81a1c1',          // nord9 - true, false, null

  // Comments - nord3 (muted Polar Night)
  '--syntax-comment': '#616e88',           // Slightly brighter than nord3

  // Functions and variables - Frost colors
  '--syntax-function': '#88c0d0',          // nord8 - function names pop
  '--syntax-variable': '#d8dee9',          // nord4 - plain text color
  '--syntax-variable-special': '#81a1c1',  // nord9 - this, self
  '--syntax-property': '#88c0d0',          // nord8 - object properties
  '--syntax-parameter': '#d8dee9',         // nord4 - function params

  // Operators and punctuation - Snow Storm (subtle)
  '--syntax-operator': '#81a1c1',          // nord9 - slightly colored
  '--syntax-punctuation': '#eceff4',       // nord6 - bright but neutral

  // Types and classes - nord7 (teal, distinct from functions)
  '--syntax-type': '#8fbcbb',              // nord7
  '--syntax-class': '#8fbcbb',             // nord7

  // Special syntax
  '--syntax-regexp': '#ebcb8b',            // nord13 - yellow stands out
  '--syntax-escape': '#d08770',            // nord12 - orange for escapes

  // HTML/XML - Frost colors
  '--syntax-tag': '#81a1c1',               // nord9 - tags are structural
  '--syntax-attribute': '#8fbcbb',         // nord7 - attributes
  '--syntax-attribute-value': '#a3be8c',   // nord14 - values are strings

  // Markdown - varied to distinguish heading levels
  '--syntax-heading': '#88c0d0',           // nord8 - headings pop
  '--syntax-link': '#88c0d0',              // nord8 - clickable
  '--syntax-link-text': '#a3be8c',         // nord14 - link text
  '--syntax-emphasis': '#eceff4',          // nord6 - stands out
  '--syntax-strong': '#eceff4',            // nord6 - bold is bright
  '--syntax-strikethrough': '#4c566a',     // nord3 - de-emphasized
  '--syntax-quote': '#616e88',             // Like comments
  '--syntax-code': '#a3be8c',              // nord14 - inline code
  '--syntax-code-background': 'rgba(67, 76, 94, 0.5)',  // nord2 at 50%
  '--syntax-meta': '#5e81ac',              // nord10 - fences, front matter

  // Diff colors
  '--syntax-inserted': '#a3be8c',          // nord14 - green = added
  '--syntax-deleted': '#bf616a',           // nord11 - red = removed
  '--syntax-changed': '#ebcb8b',           // nord13 - yellow = modified

  // ===========================================================================
  // MARKDOWN RENDERING
  // Using Nord palette for rendered markdown elements
  // ===========================================================================
  '--md-heading-1-size': '1.75em',
  '--md-heading-2-size': '1.4em',
  '--md-heading-3-size': '1.2em',
  '--md-heading-4-size': '1.1em',
  '--md-heading-5-size': '1.05em',
  '--md-heading-6-size': '1em',
  '--md-heading-weight': '600',
  '--md-heading-line-height': '1.3',
  '--md-heading-margin-top': '0.5em',
  '--md-marker-color': '#4c566a',          // nord3
  '--md-marker-font': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--md-link-color': '#88c0d0',            // nord8
  '--md-link-decoration': 'underline',
  '--md-code-background': 'rgba(67, 76, 94, 0.5)',  // nord2 at 50%
  '--md-code-color': '#a3be8c',            // nord14
  '--md-code-padding': '0.15em 0.35em',
  '--md-code-radius': '3px',
  '--md-blockquote-border': '#81a1c1',     // nord9
  '--md-blockquote-border-width': '3px',
  '--md-blockquote-color': '#616e88',      // Brighter than nord3
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#4c566a',     // nord3
  '--md-hr-color': '#3b4252',              // nord1
  '--md-hr-height': '1px',
  '--md-hr-margin': '1.5em 0',
  '--md-table-border': '#3b4252',          // nord1
  '--md-table-header-bg': '#3b4252',       // nord1
  '--md-table-header-weight': '600',
  '--md-table-cell-padding': '0.5em 0.75em',
  '--md-table-stripe-bg': 'transparent',
  '--md-image-max-width': '100%',
  '--md-image-border-radius': '4px',
  '--md-checkbox-size': '1em',
  '--md-checkbox-color': '#88c0d0',        // nord8
  '--md-alert-note-color': '#81a1c1',      // nord9
  '--md-alert-tip-color': '#a3be8c',       // nord14
  '--md-alert-important-color': '#b48ead', // nord15
  '--md-alert-warning-color': '#ebcb8b',   // nord13
  '--md-alert-caution-color': '#bf616a',   // nord11
};

/**
 * Nord Outputs Theme
 *
 * A variant of Nord where output widgets are clearly "attached" to their
 * code blocks rather than floating in the document.
 *
 * ## Key Differences from base Nord:
 *
 * 1. **Left indent** - Outputs are indented to show hierarchy
 * 2. **No accent border** - Removes the left color bar for cleaner attachment
 * 3. **Subtle background** - Slightly darker than editor to show it's "output"
 * 4. **Tighter spacing** - Less margin to feel connected to code above
 * 5. **Smaller text** - Outputs are secondary to the code
 *
 * This creates a visual hierarchy:
 * ```
 * [Code block - full width, editor background]
 *    [Output - indented, darker, clearly subordinate]
 * ```
 */
export const nordOutputsTheme = {
  // Inherit all base Nord values
  ...nordTheme,

  name: 'nord-outputs',
  description: 'Nord variant with outputs visually attached to code blocks.',

  // ===========================================================================
  // LAYOUT CHANGES - Make outputs feel "attached"
  // ===========================================================================

  // Pull widget up closer to the code block above
  '--widget-offset-top': '-20px',        // Negative pulls it up into the code block's space

  // Indent from left to show hierarchy (output belongs to code)
  '--widget-inset-left': '24px',         // Indented from editor edge
  '--widget-padding-x': '12px',          // Internal padding

  // Remove the accent border - we're using indent instead
  '--widget-border-accent-width': '0px',
  '--widget-border-width': '0px',

  // Rounder corners on bottom, square on top to "attach" visually
  '--widget-border-radius': '0 0 4px 4px',

  // ===========================================================================
  // SURFACE CHANGES - Distinguish output from editor
  // ===========================================================================

  // Darker than editor to show "this is output, not code"
  '--widget-surface': '#252b35',         // Between nord0 and a darker shade
  '--widget-surface-hover': '#2e3440',   // Hover brings it to editor level

  // ===========================================================================
  // TYPOGRAPHY - Outputs are secondary
  // ===========================================================================

  '--widget-font-size': '0.85em',        // Slightly smaller than code
  '--widget-font-size-small': '0.75em',
};

// =============================================================================
// GRAYSCALE THEMES
// =============================================================================

/**
 * Grayscale Dark Theme
 *
 * A pure grayscale dark theme - no colors, just shades of gray.
 * Perfect for distraction-free writing or reduced eye strain.
 */
export const grayscaleDarkTheme = {
  name: 'grayscale-dark',
  description: 'Pure grayscale dark theme - no colors, just gray tones.',
  isDark: true,

  // Spacing
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '12px',
  '--widget-padding-y': '8px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '2px',

  // Text layout
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // Typography - Romantic programming aesthetic
  // Code: Courier Prime - old typewriter feel, calm and nostalgic
  // Prose: EB Garamond - 16th century elegance, Voltaire's quill
  '--widget-font-mono': "'Courier Prime', 'Courier New', Courier, monospace",
  '--widget-font-sans': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--widget-font-serif': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--widget-font-size': '0.95em',
  '--widget-font-size-small': '0.85em',
  '--widget-font-size-label': '12px',

  // Surfaces - dark grays
  '--widget-surface': 'rgba(255, 255, 255, 0.06)',
  '--widget-surface-hover': 'rgba(255, 255, 255, 0.1)',
  '--widget-surface-elevated': '#252525',
  '--widget-surface-inset': 'rgba(0, 0, 0, 0.3)',

  // Borders - subtle grays
  '--widget-border': 'rgba(255, 255, 255, 0.12)',
  '--widget-border-accent': 'rgba(255, 255, 255, 0.25)',
  '--widget-border-focus': '#888888',

  // Text - gray tones
  '--widget-text': '#d0d0d0',
  '--widget-text-muted': '#808080',
  '--widget-text-accent': '#a0a0a0',

  // Semantic - grayscale versions
  '--widget-success': '#a0a0a0',
  '--widget-warning': '#909090',
  '--widget-error': '#707070',
  '--widget-info': '#888888',

  // ANSI colors - all grayscale
  '--ansi-black': '#1a1a1a',
  '--ansi-red': '#909090',
  '--ansi-green': '#a8a8a8',
  '--ansi-yellow': '#b0b0b0',
  '--ansi-blue': '#888888',
  '--ansi-magenta': '#989898',
  '--ansi-cyan': '#a0a0a0',
  '--ansi-white': '#d0d0d0',
  '--ansi-bright-black': '#505050',
  '--ansi-bright-red': '#a0a0a0',
  '--ansi-bright-green': '#b8b8b8',
  '--ansi-bright-yellow': '#c8c8c8',
  '--ansi-bright-blue': '#989898',
  '--ansi-bright-magenta': '#a8a8a8',
  '--ansi-bright-cyan': '#b0b0b0',
  '--ansi-bright-white': '#e8e8e8',

  // Terminal colors (grayscale dark)
  '--term-background': '#1a1a1a',
  '--term-foreground': '#c8c8c8',
  '--term-cursor': '#a0a0a0',
  '--term-cursor-accent': '#1a1a1a',
  '--term-selection': '#404040',
  '--term-border': '#333333',
  '--term-header-bg': '#252525',
  '--term-header-fg': '#707070',

  // Collaborator - grayscale
  '--collab-human': '#909090',
  '--collab-ai': '#707070',
  '--collab-runtime': '#808080',

  // Editor - EB Garamond for prose, literary romanticism
  '--editor-background': '#1a1a1a',
  '--editor-foreground': '#c8c8c8',
  '--editor-font-family': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--editor-font-size': '18px',
  '--editor-line-height': '1.7',
  '--editor-line-number': '#505050',
  '--editor-line-number-active': '#808080',
  '--editor-selection': '#404040',
  '--editor-selection-match': '#353535',
  '--editor-cursor': '#a0a0a0',
  '--editor-active-line': 'rgba(255, 255, 255, 0.04)',
  '--editor-gutter': '#1a1a1a',
  '--editor-matching-bracket': 'rgba(255, 255, 255, 0.15)',

  // Syntax highlighting - all grayscale with varied intensities
  '--syntax-keyword': '#b0b0b0',
  '--syntax-control': '#a0a0a0',
  '--syntax-string': '#909090',
  '--syntax-number': '#989898',
  '--syntax-comment': '#606060',
  '--syntax-function': '#c0c0c0',
  '--syntax-variable': '#b8b8b8',
  '--syntax-variable-special': '#a8a8a8',
  '--syntax-property': '#b0b0b0',
  '--syntax-operator': '#c8c8c8',
  '--syntax-punctuation': '#888888',
  '--syntax-type': '#a0a0a0',
  '--syntax-class': '#b8b8b8',
  '--syntax-constant': '#a8a8a8',
  '--syntax-parameter': '#b0b0b0',
  '--syntax-regexp': '#909090',
  '--syntax-escape': '#989898',
  '--syntax-tag': '#a8a8a8',
  '--syntax-attribute': '#b0b0b0',
  '--syntax-attribute-value': '#909090',
  '--syntax-heading': '#d0d0d0',
  '--syntax-link': '#a0a0a0',
  '--syntax-link-text': '#909090',
  '--syntax-emphasis': '#b8b8b8',
  '--syntax-strong': '#d0d0d0',
  '--syntax-strikethrough': '#606060',
  '--syntax-quote': '#707070',
  '--syntax-code': '#a0a0a0',
  '--syntax-code-background': 'rgba(255, 255, 255, 0.06)',
  '--syntax-meta': '#707070',
  '--syntax-inserted': '#a0a0a0',
  '--syntax-deleted': '#808080',
  '--syntax-changed': '#909090',

  // Markdown rendering
  '--md-heading-1-size': '1.75em',
  '--md-heading-2-size': '1.4em',
  '--md-heading-3-size': '1.2em',
  '--md-heading-4-size': '1.1em',
  '--md-heading-5-size': '1.05em',
  '--md-heading-6-size': '1em',
  '--md-heading-weight': '600',
  '--md-heading-line-height': '1.3',
  '--md-heading-margin-top': '0.5em',
  '--md-marker-color': '#606060',
  '--md-marker-font': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--md-link-color': '#a0a0a0',
  '--md-link-decoration': 'underline',
  '--md-code-background': 'rgba(255, 255, 255, 0.08)',
  '--md-code-color': '#a0a0a0',
  '--md-code-padding': '0.15em 0.35em',
  '--md-code-radius': '3px',
  '--md-blockquote-border': 'rgba(255, 255, 255, 0.2)',
  '--md-blockquote-border-width': '2px',
  '--md-blockquote-color': '#707070',
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#606060',
  '--md-hr-color': 'rgba(255, 255, 255, 0.15)',
  '--md-hr-height': '1px',
  '--md-hr-margin': '1.5em 0',
  '--md-table-border': 'rgba(255, 255, 255, 0.1)',
  '--md-table-header-bg': 'rgba(255, 255, 255, 0.05)',
  '--md-table-header-weight': '600',
  '--md-table-cell-padding': '0.5em 0.75em',
  '--md-table-stripe-bg': 'transparent',
  '--md-image-max-width': '100%',
  '--md-image-border-radius': '6px',
  '--md-checkbox-size': '1em',
  '--md-checkbox-color': '#808080',
  '--md-alert-note-color': '#808080',
  '--md-alert-tip-color': '#909090',
  '--md-alert-important-color': '#888888',
  '--md-alert-warning-color': '#787878',
  '--md-alert-caution-color': '#686868',

  // Shell - Uses EB Garamond for literary feel
  '--mrmd-ui-font': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--mrmd-ui-font-size': '14px',
  '--mrmd-ui-font-size-sm': '12px',
  '--mrmd-panel-bg': '#1a1a1a',
  '--mrmd-popup-bg': '#252525',
  '--mrmd-bg': '#1a1a1a',
  '--mrmd-fg': '#c0c0c0',
  '--mrmd-fg-muted': '#707070',
  '--mrmd-border': '#333333',
  '--mrmd-hover-bg': 'rgba(255, 255, 255, 0.06)',
  '--mrmd-active-bg': 'rgba(255, 255, 255, 0.1)',
  '--mrmd-selection-bg': 'rgba(255, 255, 255, 0.15)',
  '--mrmd-accent': '#909090',
  '--mrmd-accent-hover': '#a0a0a0',
  '--mrmd-success': '#909090',
  '--mrmd-warning': '#808080',
  '--mrmd-error': '#707070',
  '--mrmd-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.4)',
  '--mrmd-shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.5)',
  '--mrmd-shadow-xl': '0 16px 48px rgba(0, 0, 0, 0.6)',
};

/**
 * Grayscale Light Theme
 *
 * A pure grayscale light theme - no colors, just shades of gray.
 * Clean, minimal, distraction-free.
 */
export const grayscaleLightTheme = {
  name: 'grayscale-light',
  description: 'Pure grayscale light theme - no colors, just gray tones.',
  isDark: false,

  // Spacing
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '12px',
  '--widget-padding-y': '8px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '2px',

  // Text layout
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // Typography - Romantic programming aesthetic
  // Code: Courier Prime - old typewriter feel, calm and nostalgic
  // Prose: EB Garamond - 16th century elegance, Voltaire's quill
  '--widget-font-mono': "'Courier Prime', 'Courier New', Courier, monospace",
  '--widget-font-sans': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--widget-font-serif': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--widget-font-size': '0.95em',
  '--widget-font-size-small': '0.85em',
  '--widget-font-size-label': '12px',

  // Surfaces - light grays
  '--widget-surface': 'rgba(0, 0, 0, 0.04)',
  '--widget-surface-hover': 'rgba(0, 0, 0, 0.07)',
  '--widget-surface-elevated': '#ffffff',
  '--widget-surface-inset': 'rgba(0, 0, 0, 0.03)',

  // Borders - subtle grays
  '--widget-border': 'rgba(0, 0, 0, 0.12)',
  '--widget-border-accent': 'rgba(0, 0, 0, 0.25)',
  '--widget-border-focus': '#666666',

  // Text - gray tones
  '--widget-text': '#333333',
  '--widget-text-muted': '#777777',
  '--widget-text-accent': '#555555',

  // Semantic - grayscale versions
  '--widget-success': '#555555',
  '--widget-warning': '#666666',
  '--widget-error': '#444444',
  '--widget-info': '#5a5a5a',

  // ANSI colors - all grayscale
  '--ansi-black': '#333333',
  '--ansi-red': '#555555',
  '--ansi-green': '#4a4a4a',
  '--ansi-yellow': '#5a5a5a',
  '--ansi-blue': '#606060',
  '--ansi-magenta': '#505050',
  '--ansi-cyan': '#484848',
  '--ansi-white': '#888888',
  '--ansi-bright-black': '#666666',
  '--ansi-bright-red': '#4a4a4a',
  '--ansi-bright-green': '#404040',
  '--ansi-bright-yellow': '#505050',
  '--ansi-bright-blue': '#555555',
  '--ansi-bright-magenta': '#454545',
  '--ansi-bright-cyan': '#3a3a3a',
  '--ansi-bright-white': '#777777',

  // Terminal colors (grayscale light)
  '--term-background': '#fafafa',
  '--term-foreground': '#333333',
  '--term-cursor': '#333333',
  '--term-cursor-accent': '#fafafa',
  '--term-selection': '#d0d0d0',
  '--term-border': '#e0e0e0',
  '--term-header-bg': '#f0f0f0',
  '--term-header-fg': '#888888',

  // Collaborator - grayscale
  '--collab-human': '#555555',
  '--collab-ai': '#666666',
  '--collab-runtime': '#5a5a5a',

  // Editor - EB Garamond for prose, literary romanticism
  '--editor-background': '#fafafa',
  '--editor-foreground': '#333333',
  '--editor-font-family': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--editor-font-size': '18px',
  '--editor-line-height': '1.7',
  '--editor-line-number': '#aaaaaa',
  '--editor-line-number-active': '#666666',
  '--editor-selection': '#d0d0d0',
  '--editor-selection-match': '#e0e0e0',
  '--editor-cursor': '#333333',
  '--editor-active-line': 'rgba(0, 0, 0, 0.03)',
  '--editor-gutter': '#fafafa',
  '--editor-matching-bracket': 'rgba(0, 0, 0, 0.1)',

  // Syntax highlighting - all grayscale with varied intensities
  '--syntax-keyword': '#444444',
  '--syntax-control': '#4a4a4a',
  '--syntax-string': '#555555',
  '--syntax-number': '#505050',
  '--syntax-comment': '#999999',
  '--syntax-function': '#333333',
  '--syntax-variable': '#3a3a3a',
  '--syntax-variable-special': '#454545',
  '--syntax-property': '#404040',
  '--syntax-operator': '#333333',
  '--syntax-punctuation': '#666666',
  '--syntax-type': '#4a4a4a',
  '--syntax-class': '#3a3a3a',
  '--syntax-constant': '#454545',
  '--syntax-parameter': '#404040',
  '--syntax-regexp': '#555555',
  '--syntax-escape': '#505050',
  '--syntax-tag': '#454545',
  '--syntax-attribute': '#404040',
  '--syntax-attribute-value': '#555555',
  '--syntax-heading': '#222222',
  '--syntax-link': '#555555',
  '--syntax-link-text': '#4a4a4a',
  '--syntax-emphasis': '#3a3a3a',
  '--syntax-strong': '#222222',
  '--syntax-strikethrough': '#999999',
  '--syntax-quote': '#777777',
  '--syntax-code': '#555555',
  '--syntax-code-background': 'rgba(0, 0, 0, 0.05)',
  '--syntax-meta': '#888888',
  '--syntax-inserted': '#4a4a4a',
  '--syntax-deleted': '#666666',
  '--syntax-changed': '#555555',

  // Markdown rendering
  '--md-heading-1-size': '1.75em',
  '--md-heading-2-size': '1.4em',
  '--md-heading-3-size': '1.2em',
  '--md-heading-4-size': '1.1em',
  '--md-heading-5-size': '1.05em',
  '--md-heading-6-size': '1em',
  '--md-heading-weight': '600',
  '--md-heading-line-height': '1.3',
  '--md-heading-margin-top': '0.5em',
  '--md-marker-color': '#999999',
  '--md-marker-font': "'Monaspace Neon Var', 'SF Mono', Monaco, Consolas, monospace",
  '--md-link-color': '#555555',
  '--md-link-decoration': 'underline',
  '--md-code-background': 'rgba(0, 0, 0, 0.06)',
  '--md-code-color': '#555555',
  '--md-code-padding': '0.15em 0.35em',
  '--md-code-radius': '3px',
  '--md-blockquote-border': 'rgba(0, 0, 0, 0.2)',
  '--md-blockquote-border-width': '2px',
  '--md-blockquote-color': '#777777',
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#888888',
  '--md-hr-color': 'rgba(0, 0, 0, 0.15)',
  '--md-hr-height': '1px',
  '--md-hr-margin': '1.5em 0',
  '--md-table-border': 'rgba(0, 0, 0, 0.1)',
  '--md-table-header-bg': 'rgba(0, 0, 0, 0.03)',
  '--md-table-header-weight': '600',
  '--md-table-cell-padding': '0.5em 0.75em',
  '--md-table-stripe-bg': 'transparent',
  '--md-image-max-width': '100%',
  '--md-image-border-radius': '6px',
  '--md-checkbox-size': '1em',
  '--md-checkbox-color': '#666666',
  '--md-alert-note-color': '#666666',
  '--md-alert-tip-color': '#555555',
  '--md-alert-important-color': '#5a5a5a',
  '--md-alert-warning-color': '#6a6a6a',
  '--md-alert-caution-color': '#7a7a7a',

  // Shell - Uses EB Garamond for literary feel
  '--mrmd-ui-font': "'EB Garamond', Georgia, 'Times New Roman', serif",
  '--mrmd-ui-font-size': '14px',
  '--mrmd-ui-font-size-sm': '12px',
  '--mrmd-panel-bg': '#f5f5f5',
  '--mrmd-popup-bg': '#ffffff',
  '--mrmd-bg': '#fafafa',
  '--mrmd-fg': '#333333',
  '--mrmd-fg-muted': '#888888',
  '--mrmd-border': '#e0e0e0',
  '--mrmd-hover-bg': 'rgba(0, 0, 0, 0.04)',
  '--mrmd-active-bg': 'rgba(0, 0, 0, 0.07)',
  '--mrmd-selection-bg': 'rgba(0, 0, 0, 0.1)',
  '--mrmd-accent': '#555555',
  '--mrmd-accent-hover': '#444444',
  '--mrmd-success': '#555555',
  '--mrmd-warning': '#666666',
  '--mrmd-error': '#777777',
  '--mrmd-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.1)',
  '--mrmd-shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.12)',
  '--mrmd-shadow-xl': '0 16px 48px rgba(0, 0, 0, 0.15)',
};

// ===========================================================================
// OPEN RESPONSES THEME
// ===========================================================================
/**
 * Open Responses Theme
 *
 * A clean, professional light theme inspired by openresponses.org.
 * Uses the Tailwind slate color palette with orange accents.
 *
 * Key characteristics:
 * - White background (matches openresponses.org)
 * - Slate text colors for excellent readability
 * - Orange accent color for interactive elements (cursor, active TOC item)
 * - Dark code blocks (slate-800) for contrast
 * - Clean, minimal aesthetic with subtle borders
 */
export const openresponsesTheme = {
  name: 'openresponses',
  description: 'Clean, professional light theme inspired by openresponses.org',
  isDark: false,

  // ===========================================================================
  // FONT FACE (injected separately)
  // ===========================================================================
  fontFace: `@font-face {
    font-family: 'OpenAI Sans';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url(https://www.openresponses.org/fonts/openaiSansVariableVF.woff2) format('woff2-variations');
  }`,

  // ===========================================================================
  // SPACING
  // ===========================================================================
  '--widget-line-height': '1.75',
  '--widget-padding-x': '16px',
  '--widget-padding-y': '12px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '3px',

  // Text layout
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // ===========================================================================
  // TYPOGRAPHY - OpenAI Sans
  // ===========================================================================
  '--widget-font-mono': "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  '--widget-font-sans': "'OpenAI Sans', system-ui, sans-serif",
  '--widget-font-size': '1rem',
  '--widget-font-size-small': '0.875rem',
  '--widget-font-size-label': '0.75rem',
  '--widget-font-weight': '300',
  '--widget-font-weight-medium': '500',
  '--widget-font-weight-semibold': '600',
  '--widget-font-weight-bold': '700',

  // ===========================================================================
  // SURFACES (Tailwind slate palette like openresponses.org)
  // ===========================================================================
  '--widget-surface': '#f8fafc',           // slate-50 (main background like openresponses.org)
  '--widget-surface-hover': '#f1f5f9',     // slate-100
  '--widget-surface-elevated': '#ffffff',  // white for popups
  '--widget-surface-inset': '#e2e8f0',     // slate-200 for inputs

  // ===========================================================================
  // BORDERS
  // ===========================================================================
  '--widget-border': '#e2e8f0',            // slate-200
  '--widget-border-accent': '#ea580c',     // orange-600 accent
  '--widget-border-focus': '#ea580c',      // orange-600

  // ===========================================================================
  // TEXT COLORS
  // ===========================================================================
  '--widget-text': '#0f172a',              // slate-900 (darker for better contrast)
  '--widget-text-muted': '#64748b',        // slate-500
  '--widget-text-accent': '#ea580c',       // orange-600

  // ===========================================================================
  // SEMANTIC COLORS
  // ===========================================================================
  '--widget-success': '#16a34a',           // green-600
  '--widget-warning': '#d97706',           // amber-600
  '--widget-error': '#dc2626',             // red-600
  '--widget-info': '#2563eb',              // blue-600

  // ===========================================================================
  // ANSI COLORS (optimized for light background)
  // ===========================================================================
  '--ansi-black': '#0f172a',               // slate-900
  '--ansi-red': '#dc2626',                 // red-600
  '--ansi-green': '#16a34a',               // green-600
  '--ansi-yellow': '#d97706',              // amber-600
  '--ansi-blue': '#2563eb',                // blue-600
  '--ansi-magenta': '#9333ea',             // purple-600
  '--ansi-cyan': '#0891b2',                // cyan-600
  '--ansi-white': '#f1f5f9',               // slate-100
  '--ansi-bright-black': '#64748b',        // slate-500
  '--ansi-bright-red': '#ef4444',          // red-500
  '--ansi-bright-green': '#22c55e',        // green-500
  '--ansi-bright-yellow': '#f59e0b',       // amber-500
  '--ansi-bright-blue': '#3b82f6',         // blue-500
  '--ansi-bright-magenta': '#a855f7',      // purple-500
  '--ansi-bright-cyan': '#06b6d4',         // cyan-500
  '--ansi-bright-white': '#ffffff',        // white

  // ===========================================================================
  // TERMINAL COLORS
  // ===========================================================================
  '--term-background': '#1e293b',          // slate-800 (dark for contrast)
  '--term-foreground': '#e2e8f0',          // slate-200
  '--term-cursor': '#f97316',              // orange-500 accent
  '--term-cursor-accent': '#1e293b',       // slate-800
  '--term-selection': '#334155',           // slate-700
  '--term-border': '#e2e8f0',              // slate-200
  '--term-header-bg': '#f1f5f9',           // slate-100
  '--term-header-fg': '#64748b',           // slate-500

  // ===========================================================================
  // COLLABORATOR COLORS
  // ===========================================================================
  '--collab-human': '#3b82f6',             // blue-500
  '--collab-ai': '#a855f7',                // purple-500
  '--collab-runtime': '#22c55e',           // green-500

  // ===========================================================================
  // EDITOR
  // ===========================================================================
  '--editor-background': '#f8fafc',        // slate-50 (matches openresponses.org)
  '--editor-foreground': '#0f172a',        // slate-900
  '--editor-font-family': "'OpenAI Sans', system-ui, sans-serif",
  '--editor-font-size': '1rem',
  '--editor-line-height': '1.75',
  '--editor-line-number': '#94a3b8',       // slate-400
  '--editor-line-number-active': '#64748b',// slate-500
  '--editor-selection': '#e2e8f0',         // slate-200
  '--editor-selection-match': '#f1f5f9',   // slate-100
  '--editor-cursor': '#ea580c',            // orange-600 (accent)
  '--editor-active-line': 'rgba(241, 245, 249, 0.5)', // slate-100 semi
  '--editor-gutter': '#f8fafc',            // slate-50
  '--editor-matching-bracket': '#e2e8f0',  // slate-200

  // ===========================================================================
  // SYNTAX HIGHLIGHTING (Professional, readable)
  // ===========================================================================
  '--syntax-keyword': '#7c3aed',           // violet-600
  '--syntax-control': '#7c3aed',           // violet-600
  '--syntax-string': '#059669',            // emerald-600
  '--syntax-number': '#2563eb',            // blue-600
  '--syntax-comment': '#94a3b8',           // slate-400
  '--syntax-function': '#c2410c',          // orange-700
  '--syntax-variable': '#334155',          // slate-700
  '--syntax-variable-special': '#dc2626',  // red-600
  '--syntax-property': '#0891b2',          // cyan-600
  '--syntax-operator': '#64748b',          // slate-500
  '--syntax-punctuation': '#94a3b8',       // slate-400
  '--syntax-type': '#0d9488',              // teal-600
  '--syntax-class': '#c2410c',             // orange-700
  '--syntax-constant': '#7c3aed',          // violet-600
  '--syntax-parameter': '#0891b2',         // cyan-600
  '--syntax-regexp': '#be185d',            // pink-700
  '--syntax-escape': '#be185d',            // pink-700
  '--syntax-tag': '#c2410c',               // orange-700
  '--syntax-attribute': '#0891b2',         // cyan-600
  '--syntax-attribute-value': '#059669',   // emerald-600
  '--syntax-heading': '#0f172a',           // slate-900
  '--syntax-link': '#2563eb',              // blue-600
  '--syntax-link-text': '#334155',         // slate-700
  '--syntax-emphasis': '#334155',          // slate-700
  '--syntax-strong': '#0f172a',            // slate-900
  '--syntax-strikethrough': '#94a3b8',     // slate-400
  '--syntax-quote': '#64748b',             // slate-500
  '--syntax-code': '#c2410c',              // orange-700
  '--syntax-code-background': '#f1f5f9',   // slate-100
  '--syntax-meta': '#64748b',              // slate-500
  '--syntax-inserted': '#16a34a',          // green-600
  '--syntax-deleted': '#dc2626',           // red-600
  '--syntax-changed': '#d97706',           // amber-600

  // ===========================================================================
  // MARKDOWN RENDERING
  // ===========================================================================
  '--md-heading-1-size': '2em',
  '--md-heading-2-size': '1.5em',
  '--md-heading-3-size': '1.25em',
  '--md-heading-4-size': '1.1em',
  '--md-heading-5-size': '1em',
  '--md-heading-6-size': '0.9em',
  '--md-heading-weight': '600',
  '--md-heading-line-height': '1.3',
  '--md-heading-margin-top': '1.5em',
  '--md-marker-color': '#94a3b8',          // slate-400
  '--md-marker-font': "ui-monospace, SFMono-Regular, monospace",
  '--md-link-color': '#2563eb',            // blue-600
  '--md-link-decoration': 'underline',
  '--md-code-background': '#f1f5f9',       // slate-100
  '--md-code-color': '#c2410c',            // orange-700
  '--md-code-padding': '0.2em 0.4em',
  '--md-code-radius': '4px',
  '--md-blockquote-border': '#e2e8f0',     // slate-200
  '--md-blockquote-border-width': '4px',
  '--md-blockquote-color': '#64748b',      // slate-500
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#94a3b8',     // slate-400
  '--md-hr-color': '#e2e8f0',              // slate-200
  '--md-table-header-bg': '#f1f5f9',       // slate-100
  '--md-table-header-border': '#cbd5e1',   // slate-300
  '--md-table-row-border': '#e2e8f0',      // slate-200
  '--md-table-stripe-bg': '#f8fafc',       // slate-50
  '--md-image-border-radius': '8px',
  '--md-checkbox-size': '1.1em',
  '--md-checkbox-color': '#f97316',        // orange-500
  '--md-alert-note-color': '#2563eb',      // blue-600
  '--md-alert-tip-color': '#16a34a',       // green-600
  '--md-alert-important-color': '#7c3aed', // violet-600
  '--md-alert-warning-color': '#d97706',   // amber-600
  '--md-alert-caution-color': '#dc2626',   // red-600

  // ===========================================================================
  // SHELL/UI
  // ===========================================================================
  '--mrmd-ui-font': "'OpenAI Sans', system-ui, sans-serif",
  '--mrmd-ui-font-size': '14px',
  '--mrmd-ui-font-size-sm': '12px',
  '--mrmd-ui-font-size-xs': '10px',
  '--mrmd-panel-bg': '#f8fafc',            // slate-50 like openresponses.org
  '--mrmd-popup-bg': '#ffffff',            // white for popups
  '--mrmd-bg': '#f8fafc',                  // slate-50 (main background like openresponses.org)
  '--mrmd-fg': '#0f172a',                  // slate-900
  '--mrmd-fg-muted': '#64748b',            // slate-500
  '--mrmd-fg-dim': '#94a3b8',              // slate-400
  '--mrmd-border': '#e2e8f0',              // slate-200
  '--mrmd-hover-bg': '#f1f5f9',            // slate-100
  '--mrmd-active-bg': '#e2e8f0',           // slate-200
  '--mrmd-selection-bg': '#cbd5e1',        // slate-300
  '--mrmd-accent': '#ea580c',              // orange-600
  '--mrmd-accent-hover': '#c2410c',        // orange-700
  '--mrmd-success': '#16a34a',             // green-600
  '--mrmd-warning': '#d97706',             // amber-600
  '--mrmd-error': '#dc2626',               // red-600
  '--mrmd-shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  '--mrmd-shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  '--mrmd-shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '--mrmd-button-bg': '#f1f5f9',           // slate-100
  '--mrmd-button-fg': '#334155',           // slate-700
  '--mrmd-button-hover': '#e2e8f0',        // slate-200
  '--mrmd-button-active': '#cbd5e1',       // slate-300

  // ===========================================================================
  // DOCS LAYOUT - Grid structure like openresponses.org
  // ===========================================================================
  '--docs-layout-max-width': '72rem',      // max-w-6xl (1152px)
  '--docs-layout-gap': '2.5rem',           // gap-10
  '--docs-layout-padding-x': '1rem',       // px-4
  '--docs-layout-padding-y': '2.5rem',     // py-10
  '--docs-sidebar-width': '200px',
  '--docs-toc-width': '220px',
  '--docs-content-max-width': '65ch',      // prose max-width

  // ===========================================================================
  // LEFT SIDEBAR / NAVIGATION
  // ===========================================================================
  '--sidebar-bg': 'transparent',
  '--sidebar-fg': '#334155',               // slate-700
  '--sidebar-fg-muted': '#64748b',         // slate-500
  '--sidebar-font': "'OpenAI Sans', system-ui, sans-serif",
  '--sidebar-font-size': '0.875rem',       // text-sm
  '--sidebar-font-weight': '400',
  '--sidebar-item-padding-x': '0.75rem',   // px-3
  '--sidebar-item-padding-y': '0.5rem',    // py-2
  '--sidebar-item-radius': '0.75rem',      // rounded-xl
  '--sidebar-item-hover-bg': '#f1f5f9',    // slate-100
  '--sidebar-item-active-bg': '#f1f5f9',   // slate-100
  '--sidebar-item-active-fg': '#0f172a',   // slate-900
  '--sidebar-group-label-size': '0.625rem', // text-[10px]
  '--sidebar-group-label-weight': '600',   // font-semibold
  '--sidebar-group-label-spacing': '0.08em', // tracking-[0.08em]
  '--sidebar-group-label-color': '#94a3b8', // slate-400
  '--sidebar-border': '#e2e8f0',           // slate-200

  // ===========================================================================
  // RIGHT TABLE OF CONTENTS (TOC)
  // ===========================================================================
  '--toc-bg': 'transparent',
  '--toc-fg': '#64748b',                   // slate-500
  '--toc-fg-active': '#ea580c',            // orange-600
  '--toc-font': "'OpenAI Sans', system-ui, sans-serif",
  '--toc-font-size': '0.875rem',           // text-sm
  '--toc-font-weight': '400',
  '--toc-title-size': '0.625rem',          // text-[10px]
  '--toc-title-weight': '600',             // font-semibold
  '--toc-title-spacing': '0.2em',          // tracking-[0.2em]
  '--toc-title-color': '#94a3b8',          // slate-400
  '--toc-item-padding-y': '0.25rem',       // py-1
  '--toc-item-hover-color': '#334155',     // slate-700
  '--toc-border-left': '1px solid #e2e8f0', // border-l slate-200
  '--toc-indicator-color': '#ea580c',      // orange-600
  '--toc-indicator-width': '2px',
  '--toc-depth-indent': '0.75rem',         // indent per depth level

  // ===========================================================================
  // HEADER
  // ===========================================================================
  '--header-height': '4rem',               // h-16
  '--header-bg': 'transparent',
  '--header-bg-scrolled': 'rgba(248, 250, 252, 0.9)', // slate-50 with opacity
  '--header-border': '#e2e8f0',            // slate-200
  '--header-fg': '#334155',                // slate-700
  '--header-fg-hover': '#0f172a',          // slate-900
};

// #endregion BUILT_IN_THEMES

// #region THEME_REGISTRY

/**
 * Built-in themes registry
 * @type {Map<string, object>}
 */
const themeRegistry = new Map([
  ['midnight', midnightTheme],
  ['daylight', daylightTheme],
  ['github', githubTheme],
  ['nord', nordTheme],
  ['nord-outputs', nordOutputsTheme],
  ['grayscale-dark', grayscaleDarkTheme],
  ['grayscale-light', grayscaleLightTheme],
  ['openresponses', openresponsesTheme],
]);

/**
 * Register a custom theme
 * @param {object} theme - Theme object with 'name' property
 */
export function registerTheme(theme) {
  if (!theme.name) {
    throw new Error('Theme must have a name property');
  }
  themeRegistry.set(theme.name, theme);
}

/**
 * Get a theme by name
 * @param {string} name - Theme name
 * @returns {object|null}
 */
export function getTheme(name) {
  return themeRegistry.get(name) || null;
}

/**
 * Get all registered theme names
 * @returns {string[]}
 */
export function getThemeNames() {
  return Array.from(themeRegistry.keys());
}

/**
 * Check if a theme is registered
 * @param {string} name
 * @returns {boolean}
 */
export function hasTheme(name) {
  return themeRegistry.has(name);
}

// #endregion THEME_REGISTRY

// #region THEME_CREATION

/**
 * Create a custom theme by extending a base theme.
 *
 * @param {Object} options
 * @param {string} options.name - Name for the new theme
 * @param {string} [options.base='midnight'] - Base theme to extend
 * @param {string} [options.description] - Theme description
 * @param {Object} options.overrides - Token overrides
 * @returns {Object} New theme object
 *
 * @example
 * const myTheme = createTheme({
 *   name: 'my-brand',
 *   base: 'midnight',
 *   description: 'Custom brand theme',
 *   overrides: {
 *     '--widget-border-accent': '#ff6b6b',
 *     '--widget-text-accent': '#ff6b6b',
 *   }
 * });
 */
export function createTheme({ name, base = 'midnight', description, overrides = {} }) {
  const baseTheme = getTheme(base);
  if (!baseTheme) {
    throw new Error(`Base theme "${base}" not found`);
  }

  return {
    ...baseTheme,
    ...overrides,
    name,
    description: description || `Custom theme based on ${base}`,
  };
}

/**
 * Get the default tokens (useful for creating themes from scratch)
 * @returns {Object} Default token values
 */
export function getDefaultTokens() {
  const tokens = {};
  for (const [name, def] of Object.entries(tokenDefinitions)) {
    tokens[name] = def.default;
  }
  return tokens;
}

// #endregion THEME_CREATION

// #region EXPORTS

export default {
  // Token definitions (schema)
  tokenDefinitions,

  // Built-in themes
  midnightTheme,
  daylightTheme,
  githubTheme,
  nordTheme,
  nordOutputsTheme,

  // Theme registry
  registerTheme,
  getTheme,
  getThemeNames,
  hasTheme,

  // Theme creation
  createTheme,
  getDefaultTokens,
};

// #endregion EXPORTS
