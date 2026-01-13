/**
 * Markdown Rendering Extension
 *
 * Provides blur→render / focus→source markdown rendering for CodeMirror.
 *
 * Usage:
 * ```javascript
 * import { markdown } from 'mrmd-editor/markdown';
 *
 * const view = new EditorView({
 *   extensions: [
 *     markdown(),
 *     // ... other extensions
 *   ],
 * });
 * ```
 *
 * The rendering is opinionated and follows MRMD's design:
 * - Markers (# ** __) hidden on blur, muted on focus
 * - Block elements (tables, images) use stable layout pattern
 * - No jitter when cursor moves
 *
 * Theming is done via CSS variables (--md-*) from the theme system.
 * See widgets/theme.js for available tokens.
 *
 * @module markdown
 */

import { markdownRenderer } from './renderer.js';
import { markdownStyles, injectMarkdownStyles } from './styles.js';

/**
 * Create the markdown rendering extension.
 *
 * @returns {import('@codemirror/state').Extension}
 */
export function markdown() {
  // Inject styles on first use
  injectMarkdownStyles();

  return [
    markdownRenderer,
  ];
}

// Export individual pieces for advanced use
export { markdownRenderer } from './renderer.js';
export { markdownStyles, injectMarkdownStyles } from './styles.js';

// Widget exports
export {
  TaskCheckboxWidget,
  ImageWidget,
  ImagePlaceholder,
  parseImageMarkdown,
  TableWidget,
  parseTable,
  isTableLine,
  isTableDelimiter,
  generateTableId,
  AlertTitleWidget,
  // Math widgets
  InlineMathWidget,
  DisplayMathWidget,
  MathPlaceholder,
  hasInlineMath,
  isDisplayMath,
  extractInlineMath,
  extractDisplayMath,
  generateMathId,
  isKaTeXAvailable,
  renderLatex,
} from './widgets/index.js';
