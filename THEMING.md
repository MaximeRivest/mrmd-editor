# Theming Guide

MRMD Editor has a unified theming system that controls the entire visual appearance:
- **Editor** - Background, cursor, selection, gutters
- **Syntax highlighting** - Keywords, strings, comments, etc.
- **Widgets** - Output blocks, stdin prompts, cell controls
- **Collaboration UI** - Cursor labels, avatars, status indicators

One theme controls everything, ensuring visual coherence.

## Quick Start

```javascript
// Use a built-in theme
const editor = mrmd.create('#editor', {
  theme: 'nord'  // or 'midnight', 'daylight', 'github', 'nord-outputs'
});

// Switch themes at runtime
editor.setTheme('github');

// List available themes
console.log(editor.getThemeNames());
// ['midnight', 'daylight', 'github', 'nord', 'nord-outputs']
```

## Built-in Themes

| Theme | Description | Dark/Light |
|-------|-------------|------------|
| `midnight` | VS Code Dark inspired. Default for dark mode. | Dark |
| `daylight` | VS Code Light inspired. Default for light mode. | Light |
| `github` | GitHub Dark colors | Dark |
| `nord` | Arctic, north-bluish palette. Eye comfort focused. | Dark |
| `nord-outputs` | Nord variant with outputs attached to code blocks | Dark |

## Theme Tokens

Themes are objects mapping CSS custom property names to values. Tokens are organized into categories:

### Editor Tokens

Control the CodeMirror editor appearance:

```javascript
'--editor-background': '#1e1e1e',        // Main background
'--editor-foreground': '#d4d4d4',        // Default text color
'--editor-line-number': '#858585',       // Line number color
'--editor-line-number-active': '#c6c6c6',// Active line number
'--editor-selection': '#264f78',         // Selection background
'--editor-selection-match': '#515c6a',   // Search/match highlight
'--editor-cursor': '#aeafad',            // Cursor color
'--editor-active-line': 'rgba(...)',     // Active line background
'--editor-gutter': '#1e1e1e',            // Gutter background
'--editor-matching-bracket': 'rgba(...)',// Bracket match highlight
```

### Syntax Highlighting Tokens

Control code syntax colors:

```javascript
// Keywords and control flow
'--syntax-keyword': '#569cd6',           // if, else, function, class
'--syntax-control': '#c586c0',           // return, break, continue

// Literals
'--syntax-string': '#ce9178',            // "hello"
'--syntax-number': '#b5cea8',            // 42, 3.14
'--syntax-constant': '#569cd6',          // true, false, null

// Identifiers
'--syntax-function': '#dcdcaa',          // Function names
'--syntax-variable': '#9cdcfe',          // Variables
'--syntax-variable-special': '#569cd6',  // this, self
'--syntax-property': '#9cdcfe',          // Object properties
'--syntax-parameter': '#9cdcfe',         // Function parameters

// Types
'--syntax-type': '#4ec9b0',              // Type names
'--syntax-class': '#4ec9b0',             // Class names

// Other
'--syntax-comment': '#6a9955',           // Comments
'--syntax-operator': '#d4d4d4',          // +, -, =
'--syntax-punctuation': '#d4d4d4',       // (), {}, []
'--syntax-regexp': '#d16969',            // Regular expressions
'--syntax-escape': '#d7ba7d',            // \n, \t

// Markup (HTML/Markdown)
'--syntax-tag': '#569cd6',               // <div>
'--syntax-attribute': '#9cdcfe',         // class=
'--syntax-attribute-value': '#ce9178',   // "value"
'--syntax-heading': '#569cd6',           // # Heading
'--syntax-link': '#3794ff',              // [text](url)
'--syntax-emphasis': '#569cd6',          // *italic*
'--syntax-strong': '#569cd6',            // **bold**
'--syntax-code': '#ce9178',              // `code`
'--syntax-quote': '#6a9955',             // > quote

// Diff
'--syntax-inserted': '#b5cea8',          // Added lines
'--syntax-deleted': '#ce9178',           // Removed lines
'--syntax-changed': '#569cd6',           // Modified lines
```

### Widget Tokens

Control output widgets, cell controls, and UI elements:

```javascript
// Surfaces (backgrounds)
'--widget-surface': 'rgba(0, 0, 0, 0.35)',    // Main widget background
'--widget-surface-hover': 'rgba(...)',         // Hover state
'--widget-surface-elevated': '#1e1e1e',        // Tooltips, dropdowns
'--widget-surface-inset': 'rgba(...)',         // Input backgrounds

// Borders
'--widget-border': 'rgba(255, 255, 255, 0.1)', // Default border
'--widget-border-accent': 'rgba(...)',         // Accent bar (left side of output)
'--widget-border-focus': '#6495ed',            // Focus ring

// Text
'--widget-text': '#e0e0e0',                    // Primary text
'--widget-text-muted': '#888888',              // Secondary text
'--widget-text-accent': '#6495ed',             // Links, interactive

// Semantic colors
'--widget-success': '#22c55e',                 // Green
'--widget-warning': '#f59e0b',                 // Yellow/Orange
'--widget-error': '#ef4444',                   // Red
'--widget-info': '#3b82f6',                    // Blue

// Spacing
'--widget-padding-x': '12px',                  // Horizontal padding
'--widget-padding-y': '8px',                   // Vertical padding
'--widget-border-radius': '6px',               // Corner radius
'--widget-border-accent-width': '3px',         // Accent bar width

// Layout (for "attached" output styles)
'--widget-inset-left': '0',                    // Left indent
'--widget-offset-top': '0',                    // Vertical offset (can be negative)

// Typography
'--widget-font-mono': "'SF Mono', Monaco, ...",
'--widget-font-sans': "-apple-system, ...",
'--widget-font-size': '0.9em',
```

### ANSI Terminal Colors

For terminal output in code cells:

```javascript
'--ansi-black': '#1e1e1e',
'--ansi-red': '#f87171',
'--ansi-green': '#4ade80',
'--ansi-yellow': '#facc15',
'--ansi-blue': '#60a5fa',
'--ansi-magenta': '#c084fc',
'--ansi-cyan': '#22d3ee',
'--ansi-white': '#e0e0e0',
// Plus bright variants: --ansi-bright-black, etc.
```

### Collaborator Colors

For multi-user presence indicators:

```javascript
'--collab-human': '#3b82f6',    // Human collaborators
'--collab-ai': '#8b5cf6',       // AI collaborators
'--collab-runtime': '#10b981',  // Runtime indicators
```

## Creating Custom Themes

### Extend an Existing Theme

The easiest way to create a custom theme:

```javascript
const myTheme = mrmd.widgets.createTheme({
  name: 'my-brand',
  base: 'nord',  // Start from Nord
  overrides: {
    // Change just what you need
    '--widget-border-accent': '#ff6b6b',
    '--syntax-keyword': '#ff6b6b',
    '--editor-selection': '#ff6b6b33',
  }
});

// Register it
mrmd.widgets.registerTheme(myTheme);

// Use it
editor.setTheme('my-brand');
```

### Create from Scratch

For full control, define all tokens:

```javascript
const myTheme = {
  name: 'my-custom-theme',
  description: 'A fully custom theme',
  isDark: true,  // Affects CodeMirror base styles

  // Editor
  '--editor-background': '#0a0a0a',
  '--editor-foreground': '#ffffff',
  // ... all editor tokens

  // Syntax
  '--syntax-keyword': '#ff0000',
  // ... all syntax tokens

  // Widgets
  '--widget-surface': '#1a1a1a',
  // ... all widget tokens

  // ANSI
  '--ansi-red': '#ff0000',
  // ... all ANSI tokens
};

mrmd.widgets.registerTheme(myTheme);
```

### CSS Override (Simplest)

For quick tweaks, override CSS variables directly:

```css
:root {
  --widget-border-accent: #ff6b6b;
  --syntax-keyword: #ff6b6b;
}
```

## Theme Variants: Layout vs Colors

Themes can control both visual appearance AND layout. The `nord-outputs` theme demonstrates this:

```javascript
// Nord Outputs: same colors as Nord, different layout
const nordOutputsTheme = {
  ...nordTheme,  // Inherit all Nord colors

  name: 'nord-outputs',

  // Layout changes only
  '--widget-offset-top': '-20px',    // Pull outputs up (attach to code)
  '--widget-inset-left': '24px',     // Indent from left
  '--widget-border-accent-width': '0px',  // No accent bar
  '--widget-border-radius': '0 0 4px 4px', // Square top, round bottom
};
```

This creates outputs that feel "attached" to their code blocks:

```
┌─────────────────────────────────────┐
│ console.log("hello");               │  ← Code block
│ ```                                 │
│    ┌────────────────────────────┐   │
│    │ hello                      │   │  ← Output (indented, pulled up)
│    └────────────────────────────┘   │
└─────────────────────────────────────┘
```

## API Reference

### Editor Methods

```javascript
// Set theme by name
editor.setTheme('nord');
editor.setTheme('my-custom-theme');
editor.setTheme(null);  // Auto-select based on dark mode

// Get available theme names
editor.getThemeNames();  // ['midnight', 'daylight', 'github', 'nord', ...]

// Set dark mode (auto-selects matching theme if theme is null)
editor.setDark(true);   // Dark mode
editor.setDark(false);  // Light mode
editor.setDark(null);   // System preference
```

### Widget Utilities

```javascript
import { widgets } from 'mrmd-editor';

// Theme registry
widgets.registerTheme(myTheme);
widgets.getTheme('nord');           // Returns theme object
widgets.getThemeNames();            // ['midnight', ...]
widgets.hasTheme('my-theme');       // true/false

// Theme creation
widgets.createTheme({ name, base, overrides });
widgets.getDefaultTokens();         // All tokens with defaults

// Direct application (advanced)
widgets.applyTheme('nord');         // Apply CSS variables
widgets.generateThemeCSS('nord');   // Get CSS string

// CodeMirror theme generation
widgets.createCodemirrorTheme(themeObject);  // Returns CM extension
```

### Config Options

```javascript
mrmd.create('#editor', {
  // Theme by name
  theme: 'nord',

  // Or auto-select based on dark mode
  dark: null,    // System preference → midnight/daylight
  dark: true,    // Force dark → midnight (unless theme is set)
  dark: false,   // Force light → daylight (unless theme is set)
});
```

## Best Practices

### 1. Start by Extending

Don't create themes from scratch unless necessary. Extend a built-in theme:

```javascript
const myTheme = widgets.createTheme({
  name: 'my-brand',
  base: 'midnight',  // Get all the defaults right
  overrides: {
    '--widget-border-accent': '#your-brand-color',
  }
});
```

### 2. Test Both Light and Dark

If creating a light theme, ensure ANSI colors have sufficient contrast:

```javascript
// Dark theme ANSI red
'--ansi-red': '#f87171',  // Bright on dark

// Light theme ANSI red
'--ansi-red': '#dc2626',  // Darker on light
```

### 3. Keep Widget Surface Close to Editor

For seamless integration, widget backgrounds should relate to editor background:

```javascript
// Seamless (same background)
'--editor-background': '#1e1e1e',
'--widget-surface': '#1e1e1e',

// Subtle distinction
'--editor-background': '#1e1e1e',
'--widget-surface': 'rgba(0, 0, 0, 0.2)',  // Slightly darker

// Strong distinction
'--editor-background': '#1e1e1e',
'--widget-surface': '#2d2d2d',  // Noticeably different
```

### 4. Document Your Theme

Follow the Nord theme's documentation pattern - explain your color choices:

```javascript
/**
 * My Brand Theme
 *
 * Based on our brand guidelines:
 * - Primary: #ff6b6b (used for keywords, accents)
 * - Secondary: #4ecdc4 (used for strings, success)
 * - Background: #1a1a2e (dark navy)
 */
export const myBrandTheme = {
  // ...
};
```

## Examples

### Minimal Dark Theme

```javascript
const minimalDark = widgets.createTheme({
  name: 'minimal-dark',
  base: 'midnight',
  overrides: {
    '--widget-border-accent-width': '0',
    '--widget-border-radius': '0',
    '--widget-surface': 'transparent',
  }
});
```

### High Contrast Theme

```javascript
const highContrast = widgets.createTheme({
  name: 'high-contrast',
  base: 'daylight',
  overrides: {
    '--editor-background': '#ffffff',
    '--editor-foreground': '#000000',
    '--syntax-keyword': '#0000ff',
    '--syntax-string': '#008000',
    '--syntax-comment': '#808080',
  }
});
```

### Brand Color Accent

```javascript
const branded = widgets.createTheme({
  name: 'branded',
  base: 'midnight',
  overrides: {
    '--widget-border-accent': '#ff6b6b',
    '--widget-text-accent': '#ff6b6b',
    '--widget-border-focus': '#ff6b6b',
    '--syntax-keyword': '#ff6b6b',
    '--editor-cursor': '#ff6b6b',
  }
});
```
