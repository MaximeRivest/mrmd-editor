/**
 * Widget Theme Utilities
 *
 * Detection, injection, and management utilities for the theme system.
 *
 * ## Theme Detection
 *
 * Themes are detected in this priority:
 * 1. Explicit config (config.appearance.widgetTheme)
 * 2. CodeMirror theme class (.cm-theme-dark)
 * 3. System preference (prefers-color-scheme)
 * 4. Default: 'midnight' (dark)
 *
 * ## Watching for Changes
 *
 * The `watchTheme()` function monitors for:
 * - System preference changes (user toggles OS dark mode)
 * - CodeMirror theme class changes (editor.setDark())
 *
 * @module widgets/theme-utils
 */

import { getTheme, midnightTheme, daylightTheme } from './theme.js';

// #region DETECTION

/**
 * Detect the appropriate theme based on context.
 *
 * Priority:
 * 1. Explicit theme name passed as parameter
 * 2. CodeMirror theme class on the editor element
 * 3. System color scheme preference
 * 4. Default: 'midnight'
 *
 * @param {Object} [options]
 * @param {string} [options.themeName] - Explicit theme name (highest priority)
 * @param {HTMLElement} [options.editorElement] - Editor DOM element to check for .cm-theme-dark
 * @returns {string} Theme name ('midnight', 'daylight', etc.)
 *
 * @example
 * // Detect based on CodeMirror and system preference
 * const theme = detectTheme({ editorElement: document.querySelector('.cm-editor') });
 *
 * // Force a specific theme
 * const theme = detectTheme({ themeName: 'github' });
 */
export function detectTheme({ themeName, editorElement } = {}) {
  // 1. Explicit theme name
  if (themeName && getTheme(themeName)) {
    return themeName;
  }

  // 2. CodeMirror theme class
  if (editorElement) {
    // Check if the editor or any ancestor has .cm-theme-dark
    // CodeMirror adds this class when using oneDark or similar dark themes
    const hasDarkTheme = editorElement.closest('.cm-theme-dark') !== null;
    if (hasDarkTheme) {
      return 'midnight';
    }

    // If there's any cm-theme class but not dark, assume light
    const hasAnyTheme = editorElement.matches('[class*="cm-theme"]') ||
      editorElement.closest('[class*="cm-theme"]') !== null;
    if (hasAnyTheme) {
      return 'daylight';
    }
  }

  // 3. System preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'midnight' : 'daylight';
  }

  // 4. Default
  return 'midnight';
}

/**
 * Check if the system prefers dark mode
 * @returns {boolean}
 */
export function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return true; // Default to dark if can't detect
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// #endregion DETECTION

// #region WATCHING

/**
 * Watch for theme changes and call callback when detected.
 *
 * Monitors:
 * - System color scheme preference changes
 * - CodeMirror theme class mutations on the editor element
 *
 * @param {Object} options
 * @param {HTMLElement} [options.editorElement] - Editor element to watch
 * @param {string} [options.currentTheme] - Current theme name (to detect changes)
 * @param {function(string): void} options.onThemeChange - Callback with new theme name
 * @returns {function(): void} Cleanup function to stop watching
 *
 * @example
 * const unwatch = watchTheme({
 *   editorElement: document.querySelector('.cm-editor'),
 *   onThemeChange: (themeName) => {
 *     console.log('Theme changed to:', themeName);
 *     applyTheme(themeName);
 *   }
 * });
 *
 * // Later, stop watching
 * unwatch();
 */
export function watchTheme({ editorElement, currentTheme, onThemeChange }) {
  const cleanups = [];

  // Watch system preference changes
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleMediaChange = () => {
      const newTheme = detectTheme({ editorElement });
      if (newTheme !== currentTheme) {
        currentTheme = newTheme;
        onThemeChange(newTheme);
      }
    };

    // Use addEventListener (modern) or addListener (legacy)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
      cleanups.push(() => mediaQuery.removeEventListener('change', handleMediaChange));
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleMediaChange);
      cleanups.push(() => mediaQuery.removeListener(handleMediaChange));
    }
  }

  // Watch CodeMirror class changes via MutationObserver
  if (editorElement && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      // Check if any mutation affected class attribute
      const classChanged = mutations.some(m =>
        m.type === 'attributes' && m.attributeName === 'class'
      );

      if (classChanged) {
        const newTheme = detectTheme({ editorElement });
        if (newTheme !== currentTheme) {
          currentTheme = newTheme;
          onThemeChange(newTheme);
        }
      }
    });

    // Watch the editor element and ancestors for class changes
    // CodeMirror's theme class might be on a parent element
    let target = editorElement;
    while (target && target !== document.body) {
      observer.observe(target, {
        attributes: true,
        attributeFilter: ['class'],
      });
      target = target.parentElement;
    }

    cleanups.push(() => observer.disconnect());
  }

  // Return cleanup function
  return () => {
    cleanups.forEach(fn => fn());
  };
}

// #endregion WATCHING

// #region INJECTION

/**
 * Style element ID for theme variables
 */
const THEME_STYLE_ID = 'mrmd-widget-theme';

/**
 * Style element ID for theme fonts
 */
const THEME_FONTS_ID = 'mrmd-widget-theme-fonts';

/**
 * Apply a theme by injecting CSS custom properties.
 *
 * Creates or updates a <style> element with CSS variables from the theme.
 * Also injects @font-face rules if the theme has a `fontFace` property.
 *
 * @param {string|Object} themeOrName - Theme name or theme object
 * @param {Object} [options]
 * @param {HTMLElement} [options.target] - Target element (default: document.documentElement)
 * @param {boolean} [options.useStyleTag=true] - Use style tag injection vs inline styles
 * @returns {void}
 *
 * @example
 * // Apply by name
 * applyTheme('midnight');
 *
 * // Apply custom theme object
 * applyTheme({
 *   name: 'custom',
 *   '--widget-surface': '#000',
 *   '--widget-text': '#fff',
 * });
 */
export function applyTheme(themeOrName, { target, useStyleTag = true } = {}) {
  // Resolve theme object
  const theme = typeof themeOrName === 'string'
    ? getTheme(themeOrName)
    : themeOrName;

  if (!theme) {
    console.warn(`Theme "${themeOrName}" not found, using midnight`);
    return applyTheme('midnight', { target, useStyleTag });
  }

  // Get token values (exclude name, description, fontFace, isDark)
  const tokens = {};
  for (const [key, value] of Object.entries(theme)) {
    if (key.startsWith('--')) {
      tokens[key] = value;
    }
  }

  if (useStyleTag && typeof document !== 'undefined') {
    // Inject font-face if present
    if (theme.fontFace) {
      injectFontFace(theme.fontFace);
    }
    // Inject via style tag (recommended)
    injectThemeStyleTag(tokens);
  } else if (target) {
    // Apply as inline styles on target element
    for (const [key, value] of Object.entries(tokens)) {
      target.style.setProperty(key, value);
    }
  }
}

/**
 * Inject @font-face rules
 * @param {string} fontFaceCSS - CSS @font-face declaration(s)
 */
function injectFontFace(fontFaceCSS) {
  // Check if already injected
  const existing = document.getElementById(THEME_FONTS_ID);
  if (existing) {
    // Update if different
    if (existing.textContent !== fontFaceCSS) {
      existing.textContent = fontFaceCSS;
    }
    return;
  }

  // Create and inject (before other styles so fonts load early)
  const style = document.createElement('style');
  style.id = THEME_FONTS_ID;
  style.textContent = fontFaceCSS;

  // Insert at the beginning of head for early loading
  if (document.head.firstChild) {
    document.head.insertBefore(style, document.head.firstChild);
  } else {
    document.head.appendChild(style);
  }
}

/**
 * Inject theme tokens as a style tag
 * @param {Object} tokens - CSS custom property key-value pairs
 */
function injectThemeStyleTag(tokens) {
  // Remove existing
  const existing = document.getElementById(THEME_STYLE_ID);
  if (existing) {
    existing.remove();
  }

  // Build CSS
  const vars = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const css = `:root {\n${vars}\n}`;

  // Create and inject
  const style = document.createElement('style');
  style.id = THEME_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Remove the injected theme style tags (both variables and fonts)
 */
export function removeThemeStyles() {
  if (typeof document === 'undefined') return;

  const existingVars = document.getElementById(THEME_STYLE_ID);
  if (existingVars) {
    existingVars.remove();
  }

  const existingFonts = document.getElementById(THEME_FONTS_ID);
  if (existingFonts) {
    existingFonts.remove();
  }
}

/**
 * Generate CSS string for a theme (useful for SSR or manual injection)
 *
 * @param {string|Object} themeOrName - Theme name or object
 * @param {Object} [options]
 * @param {boolean} [options.includeFontFace=true] - Include @font-face rules
 * @returns {string} CSS string with :root variables and optional font-face
 *
 * @example
 * const css = generateThemeCSS('midnight');
 * // :root {
 * //   --widget-surface: rgba(0, 0, 0, 0.35);
 * //   ...
 * // }
 *
 * const css = generateThemeCSS('openresponses');
 * // @font-face { font-family: 'OpenAI Sans'; ... }
 * // :root { ... }
 */
export function generateThemeCSS(themeOrName, { includeFontFace = true } = {}) {
  const theme = typeof themeOrName === 'string'
    ? getTheme(themeOrName)
    : themeOrName;

  if (!theme) {
    return generateThemeCSS('midnight', { includeFontFace });
  }

  const vars = Object.entries(theme)
    .filter(([k]) => k.startsWith('--'))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const rootCSS = `:root {\n${vars}\n}`;

  // Include font-face if present and requested
  if (includeFontFace && theme.fontFace) {
    return `${theme.fontFace}\n\n${rootCSS}`;
  }

  return rootCSS;
}

// #endregion INJECTION

// #region INITIALIZATION

/**
 * Initialize the theme system.
 *
 * Detects the appropriate theme, applies it, and optionally
 * watches for changes.
 *
 * @param {Object} options
 * @param {string} [options.themeName] - Force a specific theme
 * @param {HTMLElement} [options.editorElement] - Editor element for detection
 * @param {boolean} [options.watch=true] - Watch for theme changes
 * @param {function(string): void} [options.onThemeChange] - Callback on theme change
 * @returns {{themeName: string, cleanup: function}} Current theme and cleanup function
 *
 * @example
 * const { themeName, cleanup } = initTheme({
 *   editorElement: document.querySelector('.cm-editor'),
 *   watch: true,
 *   onThemeChange: (name) => console.log('Theme changed:', name)
 * });
 */
export function initTheme({
  themeName,
  editorElement,
  watch = true,
  onThemeChange,
} = {}) {
  // Detect initial theme
  const detectedTheme = detectTheme({ themeName, editorElement });

  // Apply it
  applyTheme(detectedTheme);

  // Setup watching if requested
  let cleanup = () => {};
  if (watch) {
    cleanup = watchTheme({
      editorElement,
      currentTheme: detectedTheme,
      onThemeChange: (newTheme) => {
        applyTheme(newTheme);
        onThemeChange?.(newTheme);
      },
    });
  }

  return {
    themeName: detectedTheme,
    cleanup,
  };
}

// #endregion INITIALIZATION

// #region EXPORTS

export default {
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
};

// #endregion EXPORTS
