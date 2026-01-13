/**
 * Math Widget
 *
 * Renders LaTeX math expressions using KaTeX.
 * Supports both inline ($...$) and display ($$...$$) modes.
 *
 * Design philosophy:
 * - Tufte: Math should be beautiful and readable
 * - Graceful degradation when KaTeX not available
 * - Clear error messages for invalid LaTeX
 *
 * Syntax support:
 * - Inline: $E = mc^2$ or \(E = mc^2\)
 * - Display: $$\int_0^\infty e^{-x^2} dx$$ or \[\int_0^\infty e^{-x^2} dx\]
 *
 * @module markdown/widgets/math
 */

import { WidgetType } from '@codemirror/view';

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
// KaTeX Integration
// =============================================================================

/**
 * Check if KaTeX is available
 *
 * @returns {boolean}
 */
export function isKaTeXAvailable() {
  return typeof window !== 'undefined' && typeof window.katex !== 'undefined';
}

/**
 * Render LaTeX to HTML using KaTeX
 *
 * @param {string} latex
 * @param {boolean} displayMode
 * @returns {{html: string, error: string | null}}
 */
export function renderLatex(latex, displayMode = false) {
  if (!isKaTeXAvailable()) {
    return {
      html: null,
      error: 'KaTeX not loaded',
    };
  }

  try {
    const html = window.katex.renderToString(latex, {
      displayMode,
      throwOnError: true,
      errorColor: '#cc0000',
      strict: 'warn',
      trust: false,
      macros: {
        // Common macros
        '\\R': '\\mathbb{R}',
        '\\N': '\\mathbb{N}',
        '\\Z': '\\mathbb{Z}',
        '\\Q': '\\mathbb{Q}',
        '\\C': '\\mathbb{C}',
        '\\eps': '\\varepsilon',
        '\\phi': '\\varphi',
      },
    });
    return { html, error: null };
  } catch (e) {
    // Try with throwOnError: false for partial rendering
    try {
      const html = window.katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        errorColor: '#cc0000',
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
