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
   BLOCK SPACER (Stable Layout)

   When editing raw markdown that will render to a taller widget (tables,
   images, display math), this spacer prevents layout shift by filling
   the height difference. Provides visual feedback that space is reserved.
   ========================================================================== */

/* Line-based spacer (uses padding-bottom, doesn't block navigation) */
.cm-block-spacer-line {
  position: relative;
}

/* Visual indicator for the padding area */
.cm-block-spacer-line::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(100% - 1.5em); /* Everything below the text line */
  background: linear-gradient(
    to bottom,
    transparent 0%,
    var(--md-spacer-color, rgba(128, 128, 128, 0.03)) 30%,
    var(--md-spacer-color, rgba(128, 128, 128, 0.05)) 70%,
    transparent 100%
  );
  border-left: 2px dotted var(--md-spacer-border, rgba(128, 128, 128, 0.15));
  margin-left: 0.5em;
  pointer-events: none;
}

/* ==========================================================================
   TABLES (StateField + Decoration.replace)

   Tables use Decoration.replace from a StateField (not ViewPlugin) because
   they span multiple lines. The widget replaces the entire table source.
   When cursor enters, the StateField removes the decoration, showing source.
   ========================================================================== */

/* ==========================================================================
   TABLES (Tufte-inspired: maximize data-ink ratio)

   Design philosophy:
   - Tufte: Maximize data-ink ratio, no chartjunk
   - Rams: Less but better, honest materials
   - Minimal borders: only bottom borders for separation
   ========================================================================== */

/* Container - replaces entire table source, flows naturally */
.cm-table-widget {
  display: block;
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

/* Images in table cells (Tufte: sparklines, icons, thumbnails) */
.cm-table-cell-img {
  max-width: var(--md-table-img-max-width, 120px);
  max-height: var(--md-table-img-max-height, 80px);
  height: auto;
  vertical-align: middle;
  border-radius: 3px;
}

/* Multiple images in a cell */
.cm-table td img + img,
.cm-table th img + img {
  margin-left: 0.5em;
}

/* ==========================================================================
   IMAGES (Stable Layout Pattern)

   Two modes:
   - Inline images: Embedded in text flow, replaced with <img> element
   - Block images: Standalone on a line, uses stable layout pattern
     (text line hidden but takes space, widget overlays)
   ========================================================================== */

/* Image syntax (shown when editing/cursor on line) */
.cm-md-image-syntax {
  color: var(--md-marker-color);
  font-family: var(--md-marker-font);
  font-size: 0.95em;
}

/* Image syntax placeholder (for unresolved references) */
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

/* --------------------------------------------------------------------------
   INLINE IMAGES (embedded in text)
   -------------------------------------------------------------------------- */

.cm-image-inline {
  display: inline-block;
  vertical-align: middle;
  line-height: 0; /* Prevent extra space from line-height */
}

.cm-image-inline-img {
  max-width: var(--md-image-inline-max-width, 300px);
  max-height: var(--md-image-inline-max-height, 200px);
  height: auto;
  border-radius: var(--md-image-border-radius, 4px);
  vertical-align: middle;
}

.cm-image-inline.cm-image-loading {
  background: var(--widget-surface);
  padding: 0.25em 0.5em;
  border-radius: var(--md-image-border-radius, 4px);
  color: var(--widget-text-muted);
  font-size: 0.85em;
  font-style: italic;
  line-height: 1.2;
}

.cm-image-inline.cm-image-loading::before {
  content: '🖼 ';
}

.cm-image-inline.cm-image-error {
  background: rgba(239, 68, 68, 0.1);
  padding: 0.25em 0.5em;
  border-radius: var(--md-image-border-radius, 4px);
  color: var(--widget-error, #ef4444);
  font-size: 0.85em;
  line-height: 1.2;
}

.cm-image-inline.cm-image-error::before {
  content: '⚠️ ';
}

/* Link wrapper for clickable images */
.cm-image-link {
  display: inline-block;
  text-decoration: none;
  cursor: pointer;
}

.cm-image-link:hover img {
  opacity: 0.9;
  outline: 2px solid var(--md-link-color, #3b82f6);
  outline-offset: 2px;
}

/* --------------------------------------------------------------------------
   BLOCK IMAGES (Replace Decoration)

   Design:
   - Uses Decoration.replace to replace entire line with image widget
   - Widget is display:block, takes natural height
   - No hidden lines or absolute positioning needed
   - Image pushes content down naturally
   -------------------------------------------------------------------------- */

/* Block image widget container - replaces entire line */
.cm-image-block {
  display: block;
  padding: 0.75em 0;
  text-align: center; /* Default: centered */
}

.cm-image-block-wrapper {
  display: inline-block;
  max-width: 100%;
  text-align: center;
}

.cm-image-block-img {
  max-width: var(--md-image-max-width, 100%);
  max-height: var(--md-image-max-height, 500px);
  height: auto;
  border-radius: var(--md-image-border-radius, 4px);
  box-shadow: var(--md-image-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));
}

.cm-image-block-wrapper.cm-image-loading {
  background: var(--widget-surface);
  padding: 1em 1.5em;
  border-radius: var(--md-image-border-radius, 4px);
  color: var(--widget-text-muted);
  font-style: italic;
  min-width: 150px;
  min-height: 80px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.cm-image-block-wrapper.cm-image-error {
  background: rgba(239, 68, 68, 0.1);
  padding: 1em 1.5em;
  border-radius: var(--md-image-border-radius, 4px);
  color: var(--widget-error, #ef4444);
}

.cm-image-error-text {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.cm-image-error-text::before {
  content: '⚠️';
}

/* Image caption - inherits alignment from parent position modifier */
.cm-image-caption {
  font-size: 0.85em;
  color: var(--widget-text-muted);
  font-style: italic;
  margin-top: 0.5em;
  /* text-align inherited from .cm-image-pos-* parent */
}

/* Linked block images */
.cm-image-block .cm-image-link {
  display: inline-block;
}

.cm-image-block .cm-image-link:hover img {
  opacity: 0.95;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

/* --------------------------------------------------------------------------
   POSITION MODIFIERS

   Syntax: ![alt](url)> for right-align, etc.

   Note: True CSS floats don't work well in line-based editors.
   Instead, we use alignment for block widgets.

   >  → align right
   <  → align left
   ^  → wide/full-bleed
   _  → small/thumbnail
   -------------------------------------------------------------------------- */

/* Default: block (centered) */
.cm-image-pos-block {
  text-align: center;
}

/* Align right - image and caption align to the right */
.cm-image-pos-right {
  text-align: right;
  padding-right: 1em;
}

.cm-image-pos-right .cm-image-block-img {
  max-width: var(--md-image-align-max-width, 50%);
}

.cm-image-pos-right .cm-image-block-wrapper {
  text-align: right;  /* Caption follows image alignment */
}

/* Align left - image and caption align to the left */
.cm-image-pos-left {
  text-align: left;
  padding-left: 1em;
}

.cm-image-pos-left .cm-image-block-img {
  max-width: var(--md-image-align-max-width, 50%);
}

.cm-image-pos-left .cm-image-block-wrapper {
  text-align: left;  /* Caption follows image alignment */
}

/* Wide: full-bleed, breaks out of content column */
.cm-image-pos-wide {
  width: 100vw;
  max-width: none;
  margin-left: calc(-50vw + 50%);
  margin-right: calc(-50vw + 50%);
  text-align: center;
  padding: 1em 0;
}

.cm-image-pos-wide .cm-image-block-img {
  max-width: var(--md-image-wide-max-width, 90vw);
  max-height: var(--md-image-wide-max-height, 70vh);
}

.cm-image-pos-wide .cm-image-caption {
  max-width: var(--md-content-width, 65ch);
  margin: 0.5em auto 0;
}

/* Small: thumbnail size, centered */
.cm-image-pos-small {
  text-align: center;
}

.cm-image-pos-small .cm-image-block-img {
  max-width: var(--md-image-small-max-width, 200px);
  max-height: var(--md-image-small-max-height, 150px);
}

.cm-image-pos-small .cm-image-caption {
  font-size: 0.8em;
}

/* ==========================================================================
   MATH (LaTeX with KaTeX)

   Design philosophy:
   - Tufte: Math should be beautiful and readable
   - Inline math flows with text
   - Display math is centered and prominent

   Display math uses StateField + Decoration.replace (same as tables)
   because it can span multiple lines.
   ========================================================================== */

/* Display math widget container - replaces entire math source */
.cm-math-display {
  display: block;
  text-align: center;
  padding: 0.75em 0;
  background: transparent;
}

.cm-math-display .katex-display {
  margin: 0;
  background: transparent;
}

.cm-math-display .katex {
  font-size: var(--md-math-display-size, 1.2em);
  color: var(--widget-text);
  background: transparent;
}

/* Override any KaTeX background colors */
.cm-math-display .katex-html,
.cm-math-display .base {
  background: transparent;
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
