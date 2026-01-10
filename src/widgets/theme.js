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

  // Spacing (shared across themes)
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '12px',
  '--widget-padding-y': '8px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '3px',

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

  // Spacing (same as midnight)
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '12px',
  '--widget-padding-y': '8px',
  '--widget-margin-y': '4px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '3px',

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
};

/**
 * GitHub Theme
 *
 * GitHub-inspired styling for familiarity.
 * Based on GitHub's code block and UI colors.
 */
export const githubTheme = {
  name: 'github',
  description: 'GitHub-inspired theme. Familiar for developers.',

  // Spacing
  '--widget-line-height': 'inherit',
  '--widget-padding-x': '16px',
  '--widget-padding-y': '12px',
  '--widget-margin-y': '8px',
  '--widget-border-radius': '6px',
  '--widget-border-width': '1px',
  '--widget-border-accent-width': '4px',

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
