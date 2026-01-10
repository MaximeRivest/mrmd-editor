/**
 * Widget Theme System - Public API
 *
 * The theming system for MRMD widgets (output, cursors, indicators, etc.).
 *
 * ## Quick Start
 *
 * ```javascript
 * import { widgets } from 'mrmd-editor';
 *
 * // Initialize with automatic theme detection
 * const { cleanup } = widgets.initTheme({
 *   editorElement: document.querySelector('.cm-editor'),
 *   watch: true, // Auto-update on system preference change
 * });
 *
 * // Or set a specific theme
 * widgets.applyTheme('daylight');
 * ```
 *
 * ## Built-in Themes
 *
 * - `midnight` - Deep dark theme (default for dark mode)
 * - `daylight` - Clean light theme (default for light mode)
 * - `github` - GitHub-inspired styling
 *
 * ## Creating Custom Themes
 *
 * ```javascript
 * const myTheme = widgets.createTheme({
 *   name: 'my-brand',
 *   base: 'midnight', // Extend from built-in
 *   overrides: {
 *     '--widget-border-accent': '#ff6b6b',
 *     '--widget-text-accent': '#ff6b6b',
 *   }
 * });
 *
 * widgets.registerTheme(myTheme);
 * widgets.applyTheme('my-brand');
 * ```
 *
 * ## CSS Variable Override
 *
 * You can also override CSS variables directly:
 *
 * ```css
 * :root {
 *   --widget-border-accent: #ff6b6b;
 *   --widget-text-accent: #ff6b6b;
 * }
 * ```
 *
 * ## Widget Development Patterns
 *
 * See `patterns.js` for documented patterns including:
 * - **Stable Layout Pattern** - Prevent jitter with absolute positioning
 * - **Theme Integration** - Use CSS variables consistently
 * - **Widget Equality** - Optimize DOM updates
 *
 * @module widgets
 */

// Theme definitions and registry
export {
  // Token schema
  tokenDefinitions,

  // Built-in themes
  midnightTheme,
  daylightTheme,
  githubTheme,

  // Theme registry
  registerTheme,
  getTheme,
  getThemeNames,
  hasTheme,

  // Theme creation
  createTheme,
  getDefaultTokens,
} from './theme.js';

// Theme utilities
export {
  // Detection
  detectTheme,
  systemPrefersDark,

  // Watching
  watchTheme,

  // Injection
  applyTheme,
  removeThemeStyles,
  generateThemeCSS,

  // Initialization
  initTheme,
} from './theme-utils.js';

// Widget development patterns (documentation)
export {
  STABLE_LAYOUT_PATTERN,
  THEME_INTEGRATION_PATTERN,
  WIDGET_EQUALITY_PATTERN,
} from './patterns.js';

// Re-export theme objects for direct import
import {
  midnightTheme,
  daylightTheme,
  githubTheme,
  registerTheme,
  getTheme,
  getThemeNames,
  hasTheme,
  createTheme,
  getDefaultTokens,
  tokenDefinitions,
} from './theme.js';

import {
  detectTheme,
  systemPrefersDark,
  watchTheme,
  applyTheme,
  removeThemeStyles,
  generateThemeCSS,
  initTheme,
} from './theme-utils.js';

import {
  STABLE_LAYOUT_PATTERN,
  THEME_INTEGRATION_PATTERN,
  WIDGET_EQUALITY_PATTERN,
} from './patterns.js';

/**
 * Widget theming API
 *
 * All theme-related functions bundled together for convenience.
 */
export const widgets = {
  // Theme definitions
  themes: {
    midnight: midnightTheme,
    daylight: daylightTheme,
    github: githubTheme,
  },

  // Token schema (useful for building theme editors)
  tokenDefinitions,

  // Theme registry
  registerTheme,
  getTheme,
  getThemeNames,
  hasTheme,

  // Theme creation
  createTheme,
  getDefaultTokens,

  // Detection
  detectTheme,
  systemPrefersDark,

  // Watching
  watchTheme,

  // Application
  applyTheme,
  removeThemeStyles,
  generateThemeCSS,

  // Initialization (recommended entry point)
  initTheme,

  // Widget development patterns (see patterns.js for full documentation)
  patterns: {
    STABLE_LAYOUT: STABLE_LAYOUT_PATTERN,
    THEME_INTEGRATION: THEME_INTEGRATION_PATTERN,
    WIDGET_EQUALITY: WIDGET_EQUALITY_PATTERN,
  },
};

export default widgets;
