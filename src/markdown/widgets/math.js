/**
 * Math Widget
 *
 * Renders LaTeX math expressions using KaTeX (bundled).
 * Supports both inline ($...$) and display ($$...$$) modes.
 *
 * Design philosophy:
 * - Tufte: Math should be beautiful and readable
 * - Bundled KaTeX for zero-config setup
 * - Extensible for custom syntax support
 *
 * Syntax support:
 * - Inline: $E = mc^2$ or \(E = mc^2\)
 * - Display: $$\int_0^\infty e^{-x^2} dx$$ or \[\int_0^\infty e^{-x^2} dx\]
 *
 * @module markdown/widgets/math
 */

import { WidgetType } from '@codemirror/view';
import katex from 'katex';

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Check if a line contains inline math ($...$)
 * Excludes $$...$$ which is display math
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasInlineMath(text) {
  // Match $...$ but not $$...$$
  // Also match \(...\)
  return /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/.test(text) || /\\\((.+?)\\\)/.test(text);
}

/**
 * Check if text is a display math block
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isDisplayMath(text) {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('$$') && trimmed.endsWith('$$')) ||
    (trimmed.startsWith('\\[') && trimmed.endsWith('\\]'))
  );
}

/**
 * Extract inline math expressions from text
 *
 * @param {string} text
 * @returns {Array<{start: number, end: number, latex: string, raw: string}>}
 */
export function extractInlineMath(text) {
  const matches = [];

  // Match $...$ (not $$)
  const dollarRegex = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g;
  let match;
  while ((match = dollarRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      latex: match[1],
      raw: match[0],
    });
  }

  // Match \(...\)
  const parenRegex = /\\\((.+?)\\\)/g;
  while ((match = parenRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      latex: match[1],
      raw: match[0],
    });
  }

  // Sort by position
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

/**
 * Extract display math content from text
 *
 * @param {string} text
 * @returns {string | null}
 */
export function extractDisplayMath(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    return trimmed.slice(2, -2).trim();
  }

  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return trimmed.slice(2, -2).trim();
  }

  return null;
}

/**
 * Generate stable ID for math widget
 *
 * @param {number} from
 * @returns {string}
 */
export function generateMathId(from) {
  return `math-${from}`;
}

// =============================================================================
// KaTeX Integration (Bundled)
// =============================================================================

/**
 * Check if KaTeX is available (always true since bundled)
 *
 * @returns {boolean}
 */
export function isKaTeXAvailable() {
  return true;
}

/**
 * Default macros for common math notation
 * These can be extended by users via the renderLatex options
 */
export const defaultMacros = {
  // Number sets
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  // Greek variants
  '\\eps': '\\varepsilon',
  '\\phi': '\\varphi',
  // Common operators
  '\\argmax': '\\operatorname{argmax}',
  '\\argmin': '\\operatorname{argmin}',
  '\\grad': '\\nabla',
  '\\div': '\\nabla \\cdot',
  '\\curl': '\\nabla \\times',
  // Probability/Statistics
  '\\E': '\\mathbb{E}',
  '\\Var': '\\operatorname{Var}',
  '\\Cov': '\\operatorname{Cov}',
  '\\P': '\\mathbb{P}',
  // Linear algebra
  '\\tr': '\\operatorname{tr}',
  '\\diag': '\\operatorname{diag}',
  '\\rank': '\\operatorname{rank}',
  // Brackets
  '\\abs': '\\left|#1\\right|',
  '\\norm': '\\left\\|#1\\right\\|',
  '\\inner': '\\langle #1, #2 \\rangle',
  '\\floor': '\\lfloor #1 \\rfloor',
  '\\ceil': '\\lceil #1 \\rceil',
};

/**
 * Render LaTeX to HTML using bundled KaTeX
 *
 * @param {string} latex - LaTeX string to render
 * @param {boolean} displayMode - Whether to render in display mode
 * @param {Object} options - Additional KaTeX options
 * @returns {{html: string | null, error: string | null}}
 */
export function renderLatex(latex, displayMode = false, options = {}) {
  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: true,
      errorColor: '#cc0000',
      strict: 'warn',
      trust: false,
      macros: { ...defaultMacros, ...options.macros },
      ...options,
    });
    return { html, error: null };
  } catch (e) {
    // Try with throwOnError: false for partial rendering
    try {
      const html = katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        errorColor: '#cc0000',
        macros: { ...defaultMacros, ...options.macros },
      });
      return { html, error: e.message };
    } catch (e2) {
      return {
        html: null,
        error: e2.message || 'Invalid LaTeX',
      };
    }
  }
}

/**
 * Get KaTeX version
 * @returns {string}
 */
export function getKaTeXVersion() {
  return katex.version || 'unknown';
}

// =============================================================================
// CSS Injection
// =============================================================================

let katexCssInjected = false;

/**
 * Inject KaTeX CSS into the document
 * Called automatically when rendering, but can be called manually for preloading
 */
export function injectKaTeXStyles() {
  if (katexCssInjected || typeof document === 'undefined') return;

  // Import KaTeX CSS as a string and inject it
  // We use a CDN fallback since bundling CSS with JS is complex
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);

  katexCssInjected = true;
}

// =============================================================================
// Widgets
// =============================================================================

/**
 * Widget for rendering inline math ($...$)
 */
export class InlineMathWidget extends WidgetType {
  /**
   * @param {string} latex - LaTeX content without delimiters
   * @param {string} raw - Original raw text including delimiters
   */
  constructor(latex, raw) {
    super();
    this.latex = latex;
    this.raw = raw;
  }

  eq(other) {
    return other.latex === this.latex;
  }

  toDOM() {
    // Ensure KaTeX CSS is loaded
    injectKaTeXStyles();

    const span = document.createElement('span');
    span.className = 'cm-math-inline';
    span.dataset.latex = this.latex;

    const { html, error } = renderLatex(this.latex, false);

    if (html) {
      span.innerHTML = html;
      if (error) {
        span.classList.add('cm-math-warning');
        span.title = error;
      }
    } else {
      // Fallback: show raw LaTeX in code style
      span.classList.add('cm-math-fallback');
      span.textContent = this.raw;
      if (error) {
        span.title = error;
      }
    }

    return span;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Widget for rendering display math ($$...$$)
 */
export class DisplayMathWidget extends WidgetType {
  /**
   * @param {string} latex - LaTeX content without delimiters
   * @param {string} mathId - Unique identifier
   */
  constructor(latex, mathId) {
    super();
    this.latex = latex;
    this.mathId = mathId;
  }

  eq(other) {
    return other.latex === this.latex && other.mathId === this.mathId;
  }

  toDOM() {
    // Ensure KaTeX CSS is loaded
    injectKaTeXStyles();

    const container = document.createElement('div');
    container.className = 'cm-math-display';
    container.dataset.mathId = this.mathId;

    const { html, error } = renderLatex(this.latex, true);

    if (html) {
      container.innerHTML = html;
      if (error) {
        container.classList.add('cm-math-warning');
        // Add error tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'cm-math-error-tooltip';
        tooltip.textContent = error;
        container.appendChild(tooltip);
      }
    } else {
      // Fallback: show LaTeX in preformatted style
      container.classList.add('cm-math-fallback');
      const pre = document.createElement('pre');
      pre.className = 'cm-math-fallback-code';
      pre.textContent = this.latex;
      container.appendChild(pre);

      if (error && error !== 'KaTeX not loaded') {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'cm-math-error';
        errorDiv.textContent = error;
        container.appendChild(errorDiv);
      }
    }

    return container;
  }

  ignoreEvent() {
    return true; // Don't capture events - let them bubble
  }
}

/**
 * Placeholder shown when cursor is on math line (editing mode)
 */
export class MathPlaceholder extends WidgetType {
  /**
   * @param {boolean} isDisplay - Whether this is display math
   */
  constructor(isDisplay) {
    super();
    this.isDisplay = isDisplay;
  }

  eq(other) {
    return other.isDisplay === this.isDisplay;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-math-placeholder';
    span.textContent = this.isDisplay ? '𝑓(x)' : '∑';
    span.title = this.isDisplay ? 'Display math block' : 'Inline math';
    return span;
  }

  ignoreEvent() {
    return true;
  }
}
