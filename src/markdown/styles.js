/**
 * Markdown Rendering Styles
 *
 * Base CSS for rendered markdown elements.
 * Uses tokens from the theme system - no hardcoded colors.
 *
 * Structure:
 * - Markers (syntax characters like #, **, __)
 * - Headings (h1-h6)
 * - Emphasis (bold, italic, strikethrough)
 * - Links
 * - Inline code
 * - Blockquotes
 * - Lists
 * - Horizontal rules
 * - Tables (stable layout pattern)
 * - Images
 * - Task checkboxes
 * - GitHub-style alerts
 *
 * @module markdown/styles
 */

export const markdownStyles = `
/* ==========================================================================
   MARKERS (the # ** __ \`\` syntax characters)

   Two states:
   - cm-md-hidden: Completely invisible (blur)
   - cm-md-marker: Visible but muted (focus)
   ========================================================================== */

.cm-md-hidden {
  font-size: 0 !important;
  width: 0 !important;
  display: inline-block;
  overflow: hidden;
  vertical-align: baseline;
}

.cm-md-marker {
  color: var(--md-marker-color);
  font-family: var(--md-marker-font);
  font-size: 0.85em;
}

/* ==========================================================================
   HEADINGS
   ========================================================================== */

.cm-md-h1 {
  font-size: var(--md-heading-1-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
}

.cm-md-h2 {
  font-size: var(--md-heading-2-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
}

.cm-md-h3 {
  font-size: var(--md-heading-3-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
}

.cm-md-h4 {
  font-size: var(--md-heading-4-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
}

.cm-md-h5 {
  font-size: var(--md-heading-5-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
}

.cm-md-h6 {
  font-size: var(--md-heading-6-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
}

/* ==========================================================================
   EMPHASIS (bold, italic, strikethrough)
   ========================================================================== */

.cm-md-bold {
  font-weight: 600;
}

.cm-md-italic {
  font-style: italic;
}

.cm-md-strikethrough {
  text-decoration: line-through;
  opacity: 0.7;
}

/* ==========================================================================
   LINKS
   ========================================================================== */

.cm-md-link-text {
  color: var(--md-link-color);
  text-decoration: var(--md-link-decoration);
  text-underline-offset: 2px;
  cursor: pointer;
}

.cm-md-link-text:hover {
  opacity: 0.8;
}

/* ==========================================================================
   INLINE CODE
   ========================================================================== */

.cm-md-inline-code {
  font-family: var(--widget-font-mono);
  font-size: 0.9em;
  background: var(--md-code-background);
  color: var(--md-code-color);
  padding: var(--md-code-padding);
  border-radius: var(--md-code-radius);
}

/* ==========================================================================
   BLOCKQUOTES
   ========================================================================== */

.cm-md-blockquote-line {
  border-left: var(--md-blockquote-border-width) solid var(--md-blockquote-border);
  padding-left: var(--md-blockquote-padding);
  color: var(--md-blockquote-color);
}

/* GitHub-style alerts */
.cm-md-alert {
  border-left-width: var(--md-blockquote-border-width);
  border-left-style: solid;
  padding-left: var(--md-blockquote-padding);
}

.cm-md-alert-note {
  border-left-color: var(--md-alert-note-color);
}

.cm-md-alert-tip {
  border-left-color: var(--md-alert-tip-color);
}

.cm-md-alert-important {
  border-left-color: var(--md-alert-important-color);
}

.cm-md-alert-warning {
  border-left-color: var(--md-alert-warning-color);
}

.cm-md-alert-caution {
  border-left-color: var(--md-alert-caution-color);
}

/* ==========================================================================
   LISTS
   ========================================================================== */

.cm-md-list-marker {
  color: var(--md-list-marker-color);
}

/* ==========================================================================
   HORIZONTAL RULES
   ========================================================================== */

.cm-md-hr {
  color: var(--md-hr-color);
}

.cm-md-hr-line {
  position: relative;
}

.cm-md-hr-line::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: var(--md-hr-height);
  background: var(--md-hr-color);
}

/* ==========================================================================
   TABLES (Stable Layout Pattern)

   Tables use the same pattern as output widgets:
   - Lines ALWAYS take space (text transparent when viewing)
   - Widget overlays using position: absolute
   - No jitter when cursor enters/leaves
   ========================================================================== */

/* Both states: lines always take same space */
.cm-md-table-line-hidden,
.cm-md-table-line-visible {
  position: relative;
}

/* Hidden: text invisible but same space */
.cm-md-table-line-hidden {
  color: transparent !important;
  user-select: none;
}

.cm-md-table-line-hidden > span {
  visibility: hidden !important;
}

/* Visible: text shown for editing - must cover widget underneath */
.cm-md-table-line-visible {
  color: var(--widget-text);
  position: relative;
  z-index: 2;
  background: var(--widget-surface-elevated);
}

/* ==========================================================================
   TABLES (Tufte-inspired: maximize data-ink ratio)

   Design philosophy:
   - Tufte: Maximize data-ink ratio, no chartjunk
   - Rams: Less but better, honest materials
   - Minimal borders: only bottom borders for separation
   ========================================================================== */

/* Container - absolutely positioned to overlay hidden markdown lines */
.cm-table-widget {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  background: var(--md-table-bg, var(--widget-surface));
  padding: 0.5em 0;
}

/* The table element */
.cm-table {
  display: table;
  border-collapse: collapse;
  width: auto;
  min-width: 200px;
  font-size: 0.95em;
  font-family: inherit;
  line-height: 1.5;
  color: var(--widget-text);
}

/* Ensure proper table display (required inside CM widgets) */
.cm-table thead { display: table-header-group; }
.cm-table tbody { display: table-row-group; }
.cm-table tr { display: table-row; }
.cm-table th, .cm-table td { display: table-cell; }

/* Header cells - subtle weight, strong bottom border (Tufte) */
.cm-table th {
  padding: var(--md-table-cell-padding, 0.5em 1em);
  text-align: left;
  font-weight: var(--md-table-header-weight, 600);
  color: var(--widget-text);
  border-bottom: 2px solid var(--md-table-header-border, var(--widget-text-muted));
  white-space: nowrap;
}

/* Data cells - minimal styling (Rams: less but better) */
.cm-table td {
  padding: var(--md-table-cell-padding, 0.5em 1em);
  text-align: left;
  color: var(--widget-text);
  border-bottom: 1px solid var(--md-table-row-border, var(--widget-border));
}

/* Last row has no border (cleaner look) */
.cm-table tbody tr:last-child td {
  border-bottom: none;
}

/* Hover effect - subtle highlight */
.cm-table tbody tr:hover td {
  background: var(--md-table-hover-bg, var(--widget-surface-hover));
}

/* Caption (Tufte: every table needs context) */
.cm-table-caption {
  caption-side: top;
  font-size: 0.875em;
  font-style: italic;
  color: var(--widget-text-muted);
  text-align: left;
  padding: 0.5em 0;
  line-height: 1.4;
}

.cm-table-caption-below {
  caption-side: bottom;
  padding-top: 0.75em;
  padding-bottom: 0;
}

/* Alignment classes */
.cm-table-align-left { text-align: left; }
.cm-table-align-center { text-align: center; }
.cm-table-align-right { text-align: right; }
.cm-table-align-decimal { text-align: right; }

/* Numeric cells - tabular numbers for alignment (Tufte would approve) */
.cm-table-cell-numeric {
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
}

/* Decimal alignment (Tufte's true requirement: align on decimal point) */
.cm-table-cell-decimal-aligned {
  text-align: right;
  font-family: var(--widget-font-mono);
  font-size: 0.9em;
  white-space: nowrap;
}

.cm-table-decimal-int {
  display: inline-block;
  text-align: right;
}

.cm-table-decimal-frac {
  display: inline-block;
  text-align: left;
}

/* Spanning cells (colspan/rowspan) */
.cm-table-cell-spanning {
  vertical-align: middle;
}

/* Inline formatting within cells */
.cm-table td code,
.cm-table th code {
  font-family: var(--widget-font-mono);
  font-size: 0.85em;
  padding: 0.1em 0.3em;
  background: var(--widget-surface);
  border-radius: 3px;
}

.cm-table td strong,
.cm-table th strong {
  font-weight: 600;
}

.cm-table td em,
.cm-table th em {
  font-style: italic;
}

.cm-table td s,
.cm-table th s {
  text-decoration: line-through;
  opacity: 0.7;
}

/* ==========================================================================
   IMAGES (Stable Layout Pattern)
   ========================================================================== */

/* Image syntax placeholder (shown when blurred) */
.cm-image-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  padding: 0.15em 0.4em;
  background: var(--widget-surface);
  border-radius: var(--widget-border-radius);
  font-size: 0.85em;
  color: var(--widget-text-muted);
  cursor: pointer;
}

.cm-image-placeholder:hover {
  background: var(--widget-surface-hover);
}

/* Image widget */
.cm-image-widget {
  display: block;
  margin: 0.5em 0;
}

.cm-image-widget img {
  max-width: var(--md-image-max-width);
  height: auto;
  border-radius: var(--md-image-border-radius);
}

.cm-image-widget.cm-image-loading {
  color: var(--widget-text-muted);
  font-style: italic;
  padding: 1em;
}

.cm-image-widget.cm-image-error {
  color: var(--widget-error);
  padding: 0.5em;
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--widget-border-radius);
}

/* ==========================================================================
   MATH (LaTeX with KaTeX)

   Design philosophy:
   - Tufte: Math should be beautiful and readable
   - Inline math flows with text
   - Display math is centered and prominent
   ========================================================================== */

/* Display math - uses same stable layout pattern as tables */
.cm-md-math-line-hidden,
.cm-md-math-line-visible {
  position: relative;
}

.cm-md-math-line-hidden {
  color: transparent !important;
  user-select: none;
}

.cm-md-math-line-hidden > span {
  visibility: hidden !important;
}

.cm-md-math-line-visible {
  color: var(--md-math-syntax-color, var(--widget-text-muted));
  font-family: var(--widget-font-mono);
  font-size: 0.9em;
}

/* Display math widget container */
.cm-math-display {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0;
  margin-top: -0.5em;  /* Pull up to align with source position */
  background: transparent !important;  /* Override KaTeX defaults */
}

.cm-math-display .katex-display {
  margin: 0;
  background: transparent !important;  /* Override KaTeX defaults */
}

.cm-math-display .katex {
  font-size: var(--md-math-display-size, 1.2em);
  color: var(--widget-text) !important;  /* Explicit color - can't inherit from hidden line */
  background: transparent !important;
}

/* Override any KaTeX background colors */
.cm-math-display .katex-html,
.cm-math-display .base {
  background: transparent !important;
}

/* Inline math widget */
.cm-math-inline {
  display: inline;
  vertical-align: baseline;
}

.cm-math-inline .katex {
  font-size: var(--md-math-inline-size, 1em);
  color: inherit;  /* Use surrounding text color */
}

/* Math syntax when editing (cursor on line) */
.cm-md-math-syntax {
  color: var(--md-math-syntax-color, var(--widget-text-muted));
  font-family: var(--widget-font-mono);
  font-size: 0.9em;
}

/* Fallback when KaTeX not loaded */
.cm-math-fallback {
  font-family: var(--widget-font-mono);
  font-size: 0.9em;
  color: var(--md-math-fallback-color, var(--widget-text-muted));
  background: var(--md-math-fallback-bg, var(--widget-surface));
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

.cm-math-display.cm-math-fallback {
  padding: 1em;
}

.cm-math-fallback-code {
  margin: 0;
  padding: 0.5em 1em;
  background: var(--widget-surface);
  border-radius: var(--widget-border-radius);
  overflow-x: auto;
}

/* Math errors */
.cm-math-error {
  color: var(--widget-error);
  font-size: 0.85em;
  margin-top: 0.5em;
}

.cm-math-warning {
  position: relative;
}

.cm-math-error-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--widget-surface-elevated);
  color: var(--widget-warning);
  padding: 0.25em 0.5em;
  border-radius: 4px;
  font-size: 0.75em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.cm-math-warning:hover .cm-math-error-tooltip {
  opacity: 1;
}

/* Math placeholder (shown when editing) */
.cm-math-placeholder {
  display: inline-flex;
  align-items: center;
  padding: 0.1em 0.4em;
  background: var(--widget-surface);
  border-radius: var(--widget-border-radius);
  font-size: 0.85em;
  color: var(--widget-text-muted);
  font-style: italic;
}

/* ==========================================================================
   TASK CHECKBOXES
   ========================================================================== */

.cm-task-checkbox {
  width: var(--md-checkbox-size);
  height: var(--md-checkbox-size);
  margin: 0;
  margin-right: 0.4em;
  vertical-align: middle;
  cursor: pointer;
  accent-color: var(--md-checkbox-color);
}

/* ==========================================================================
   ALERT TITLE WIDGETS (GitHub-style [!NOTE], [!WARNING], etc.)
   ========================================================================== */

.cm-alert-title {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-weight: 600;
  margin-bottom: 0.25em;
}

.cm-alert-title-note {
  color: var(--md-alert-note-color);
}

.cm-alert-title-tip {
  color: var(--md-alert-tip-color);
}

.cm-alert-title-important {
  color: var(--md-alert-important-color);
}

.cm-alert-title-warning {
  color: var(--md-alert-warning-color);
}

.cm-alert-title-caution {
  color: var(--md-alert-caution-color);
}

/* Alert icons */
.cm-alert-icon {
  font-size: 1.1em;
}
`;

/**
 * Inject markdown styles into the document
 */
export function injectMarkdownStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('mrmd-markdown-styles')) return;

  const style = document.createElement('style');
  style.id = 'mrmd-markdown-styles';
  style.textContent = markdownStyles;
  document.head.appendChild(style);
}
