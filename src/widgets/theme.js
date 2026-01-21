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
    default: "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
  },
  '--widget-font-sans': {
    description: 'Sans-serif font stack for UI elements',
    category: 'typography',
    default: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
  '--widget-font-mono': "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
  '--widget-font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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

  // Collaborator defaults
  '--collab-human': '#3b82f6',
  '--collab-ai': '#8b5cf6',
  '--collab-runtime': '#10b981',

  // Editor (VS Code Dark inspired)
  '--editor-background': '#1e1e1e',
  '--editor-foreground': '#d4d4d4',
  '--editor-line-number': '#858585',
  '--editor-line-number-active': '#c6c6c6',
  '--editor-selection': '#264f78',
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
  '--md-marker-font': "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
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
  '--mrmd-ui-font': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
 * Clean light theme for well-lit environments.
 * Good contrast without being harsh.
 */
export const daylightTheme = {
  name: 'daylight',
  description: 'Clean light theme. Default for light mode.',
  isDark: false,  // Controls CodeMirror editor theme

  // Spacing (same as midnight)
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '12px',
  '--widget-padding-y': '8px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '3px',

  // Text layout (same as midnight)
  '--widget-white-space': 'pre-wrap',
  '--widget-word-break': 'break-word',

  // Typography (same as midnight)
  '--widget-font-mono': "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
  '--widget-font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  '--widget-font-size': '0.9em',
  '--widget-font-size-small': '0.8em',
  '--widget-font-size-label': '11px',

  // Surfaces (light backgrounds)
  '--widget-surface': 'rgba(0, 0, 0, 0.04)',
  '--widget-surface-hover': 'rgba(0, 0, 0, 0.07)',
  '--widget-surface-elevated': '#ffffff',
  '--widget-surface-inset': 'rgba(0, 0, 0, 0.03)',

  // Borders
  '--widget-border': 'rgba(0, 0, 0, 0.1)',
  '--widget-border-accent': 'rgba(59, 130, 246, 0.5)',
  '--widget-border-focus': '#3b82f6',

  // Text (dark text on light backgrounds)
  '--widget-text': '#1a1a1a',
  '--widget-text-muted': '#666666',
  '--widget-text-accent': '#2563eb',

  // Semantic (slightly darker for light backgrounds)
  '--widget-success': '#16a34a',
  '--widget-warning': '#d97706',
  '--widget-error': '#dc2626',
  '--widget-info': '#2563eb',

  // ANSI colors (darker for light backgrounds)
  '--ansi-black': '#1e1e1e',
  '--ansi-red': '#dc2626',
  '--ansi-green': '#16a34a',
  '--ansi-yellow': '#ca8a04',
  '--ansi-blue': '#2563eb',
  '--ansi-magenta': '#9333ea',
  '--ansi-cyan': '#0891b2',
  '--ansi-white': '#f5f5f5',
  '--ansi-bright-black': '#6b7280',
  '--ansi-bright-red': '#ef4444',
  '--ansi-bright-green': '#22c55e',
  '--ansi-bright-yellow': '#eab308',
  '--ansi-bright-blue': '#3b82f6',
  '--ansi-bright-magenta': '#a855f7',
  '--ansi-bright-cyan': '#06b6d4',
  '--ansi-bright-white': '#ffffff',

  // Collaborator defaults (same as midnight, work well on light)
  '--collab-human': '#3b82f6',
  '--collab-ai': '#8b5cf6',
  '--collab-runtime': '#10b981',

  // Editor (VS Code Light inspired)
  '--editor-background': '#ffffff',
  '--editor-foreground': '#1e1e1e',
  '--editor-line-number': '#6e7681',
  '--editor-line-number-active': '#1e1e1e',
  '--editor-selection': '#add6ff',
  '--editor-selection-match': '#e8e8e8',
  '--editor-cursor': '#1e1e1e',
  '--editor-active-line': 'rgba(0, 0, 0, 0.04)',
  '--editor-gutter': '#ffffff',
  '--editor-matching-bracket': 'rgba(0, 0, 0, 0.1)',

  // Syntax highlighting (VS Code Light inspired)
  '--syntax-keyword': '#0000ff',
  '--syntax-control': '#af00db',
  '--syntax-string': '#a31515',
  '--syntax-number': '#098658',
  '--syntax-comment': '#008000',
  '--syntax-function': '#795e26',
  '--syntax-variable': '#001080',
  '--syntax-variable-special': '#0000ff',
  '--syntax-property': '#001080',
  '--syntax-operator': '#1e1e1e',
  '--syntax-punctuation': '#1e1e1e',
  '--syntax-type': '#267f99',
  '--syntax-class': '#267f99',
  '--syntax-constant': '#0000ff',
  '--syntax-parameter': '#001080',
  '--syntax-regexp': '#811f3f',
  '--syntax-escape': '#ee0000',
  '--syntax-tag': '#800000',
  '--syntax-attribute': '#ff0000',
  '--syntax-attribute-value': '#0000ff',
  '--syntax-heading': '#0000ff',
  '--syntax-link': '#0000ff',
  '--syntax-link-text': '#a31515',
  '--syntax-emphasis': '#0000ff',
  '--syntax-strong': '#0000ff',
  '--syntax-strikethrough': '#6e7681',
  '--syntax-quote': '#008000',
  '--syntax-code': '#a31515',
  '--syntax-code-background': 'rgba(175, 184, 193, 0.2)',
  '--syntax-meta': '#6e7681',
  '--syntax-inserted': '#098658',
  '--syntax-deleted': '#a31515',
  '--syntax-changed': '#0000ff',

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
  '--md-marker-color': '#9ca3af',
  '--md-marker-font': "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
  '--md-link-color': '#2563eb',
  '--md-link-decoration': 'underline',
  '--md-code-background': 'rgba(175, 184, 193, 0.2)',
  '--md-code-color': '#a31515',
  '--md-code-padding': '0.15em 0.35em',
  '--md-code-radius': '3px',
  '--md-blockquote-border': 'rgba(59, 130, 246, 0.4)',
  '--md-blockquote-border-width': '3px',
  '--md-blockquote-color': '#666666',
  '--md-blockquote-padding': '1em',
  '--md-list-marker-color': '#666666',
  '--md-hr-color': 'rgba(0, 0, 0, 0.1)',
  '--md-hr-height': '1px',
  '--md-hr-margin': '1.5em 0',
  '--md-table-border': 'rgba(0, 0, 0, 0.1)',
  '--md-table-header-bg': 'rgba(0, 0, 0, 0.04)',
  '--md-table-header-weight': '600',
  '--md-table-cell-padding': '0.5em 0.75em',
  '--md-table-stripe-bg': 'transparent',
  '--md-image-max-width': '100%',
  '--md-image-border-radius': '6px',
  '--md-checkbox-size': '1em',
  '--md-checkbox-color': '#2563eb',
  '--md-alert-note-color': '#2563eb',
  '--md-alert-tip-color': '#16a34a',
  '--md-alert-important-color': '#0000ff',
  '--md-alert-warning-color': '#d97706',
  '--md-alert-caution-color': '#dc2626',

  // Shell (status bar, menus, dialogs) - Light theme
  '--mrmd-ui-font': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  '--mrmd-ui-font-size': '13px',
  '--mrmd-ui-font-size-sm': '11px',
  '--mrmd-panel-bg': '#f5f5f5',
  '--mrmd-popup-bg': '#ffffff',
  '--mrmd-bg': '#ffffff',
  '--mrmd-fg': '#333333',
  '--mrmd-fg-muted': '#666666',
  '--mrmd-border': '#e0e0e0',
  '--mrmd-hover-bg': 'rgba(0, 0, 0, 0.04)',
  '--mrmd-active-bg': 'rgba(0, 0, 0, 0.08)',
  '--mrmd-selection-bg': 'rgba(37, 99, 235, 0.15)',
  '--mrmd-accent': '#2563eb',
  '--mrmd-accent-hover': '#1d4ed8',
  '--mrmd-success': '#16a34a',
  '--mrmd-warning': '#d97706',
  '--mrmd-error': '#dc2626',
  '--mrmd-shadow-md': '0 4px 12px rgba(0, 0, 0, 0.1)',
  '--mrmd-shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.15)',
  '--mrmd-shadow-xl': '0 16px 48px rgba(0, 0, 0, 0.2)',
  '--mrmd-menu-border': '#d0d0d0',
  '--mrmd-dialog-border': '#d0d0d0',
  '--mrmd-input-border': '#d0d0d0',
  '--mrmd-button-bg': '#f0f0f0',
  '--mrmd-button-border': '#d0d0d0',
  '--mrmd-button-hover': '#e8e8e8',
  '--mrmd-button-active': '#e0e0e0',
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

  // Typography (GitHub's font stack)
  '--widget-font-mono': "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  '--widget-font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
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

  // Collaborator defaults
  '--collab-human': '#58a6ff',
  '--collab-ai': '#d2a8ff',
  '--collab-runtime': '#7ee787',

  // Editor (GitHub Dark)
  '--editor-background': '#0d1117',
  '--editor-foreground': '#c9d1d9',
  '--editor-line-number': '#6e7681',
  '--editor-line-number-active': '#c9d1d9',
  '--editor-selection': '#264f78',
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
  '--md-marker-font': "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
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
  '--mrmd-ui-font': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
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
  // Nord works well with most monospace fonts. We use a stack that prioritizes
  // fonts known to render well with Nord's color palette.
  // ===========================================================================
  '--widget-font-mono': "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, Consolas, monospace",
  '--widget-font-sans': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
  '--editor-selection': '#434c5e',         // nord2
  '--editor-selection-match': '#3b4252',   // nord1 - subtle match highlight
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
  '--md-marker-font': "'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, Consolas, monospace",
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
