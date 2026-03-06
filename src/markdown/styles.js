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
  color: var(--md-heading-color, inherit);
}

.cm-md-h2 {
  font-size: var(--md-heading-2-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
  color: var(--md-heading-color, inherit);
}

.cm-md-h3 {
  font-size: var(--md-heading-3-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
  color: var(--md-heading-color, inherit);
}

.cm-md-h4 {
  font-size: var(--md-heading-4-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
  color: var(--md-heading-color, inherit);
}

.cm-md-h5 {
  font-size: var(--md-heading-5-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
  color: var(--md-heading-color, inherit);
}

.cm-md-h6 {
  font-size: var(--md-heading-6-size);
  font-weight: var(--md-heading-weight);
  line-height: var(--md-heading-line-height);
  color: var(--md-heading-color, inherit);
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

/* Wiki-links [[target]] */
.cm-wiki-link {
  color: var(--md-link-color);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.cm-wiki-link:hover {
  opacity: 0.8;
}

/* Wiki-link syntax (when editing) */
.cm-wiki-link-syntax {
  color: var(--md-link-color);
}

/* Broken wiki-link (target doesn't exist) */
.cm-broken-link {
  color: var(--text-muted, #6b7280);
  text-decoration: underline dashed;
  text-decoration-thickness: 1px;
}

/* External links [text](https://...) */
.cm-external-link {
  color: var(--md-link-color);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.cm-external-link::after {
  content: ' \\2197';
  font-size: 0.75em;
  opacity: 0.6;
}

.cm-external-link:hover {
  opacity: 0.8;
}

/* File links [text](./path) */
.cm-file-link {
  color: var(--md-link-color);
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.cm-file-link:hover {
  opacity: 0.8;
}

/* Anchor links [text](#heading) */
.cm-anchor-link {
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
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
  --md-alert-accent: var(--md-alert-note-color);
}

.cm-md-alert-tip {
  border-left-color: var(--md-alert-tip-color);
  --md-alert-accent: var(--md-alert-tip-color);
}

.cm-md-alert-important {
  border-left-color: var(--md-alert-important-color);
  --md-alert-accent: var(--md-alert-important-color);
}

.cm-md-alert-warning {
  border-left-color: var(--md-alert-warning-color);
  --md-alert-accent: var(--md-alert-warning-color);
}

.cm-md-alert-caution {
  border-left-color: var(--md-alert-caution-color);
  --md-alert-accent: var(--md-alert-caution-color);
}

/* MkDocs-style !!! admonitions (card style with title bar) */
.cm-md-admonition-line {
  border-left: var(--md-admonition-border-width, 1px) solid var(--md-admonition-border-color, color-mix(in srgb, var(--md-alert-accent, var(--widget-border-accent)) 46%, var(--widget-border) 54%));
  border-right: var(--md-admonition-border-width, 1px) solid var(--md-admonition-border-color, color-mix(in srgb, var(--md-alert-accent, var(--widget-border-accent)) 46%, var(--widget-border) 54%));
  background: var(--md-admonition-body-background, var(--md-admonition-background, color-mix(in srgb, var(--md-alert-accent, var(--widget-border-accent)) 5%, var(--editor-background, transparent) 95%)));
  color: var(--md-admonition-text-color, inherit);
  padding-left: var(--md-admonition-padding-x, 0.9em);
  padding-right: var(--md-admonition-padding-x, 0.9em);
}

.cm-md-admonition-start {
  border-top: var(--md-admonition-border-width, 1px) solid var(--md-admonition-border-color, color-mix(in srgb, var(--md-alert-accent, var(--widget-border-accent)) 46%, var(--widget-border) 54%));
  border-top-left-radius: var(--md-admonition-radius, 6px);
  border-top-right-radius: var(--md-admonition-radius, 6px);
  background: var(--md-admonition-title-background, color-mix(in srgb, var(--md-alert-accent, var(--widget-border-accent)) 14%, var(--editor-background, transparent) 86%));
  padding-top: var(--md-admonition-padding-y, 0.35em);
  padding-bottom: var(--md-admonition-padding-y, 0.35em);
  border-bottom: 1px solid color-mix(in srgb, var(--md-admonition-border-color, var(--md-alert-accent, var(--widget-border-accent))) 55%, transparent);
}

.cm-md-admonition-end {
  border-bottom: var(--md-admonition-border-width, 1px) solid var(--md-admonition-border-color, color-mix(in srgb, var(--md-alert-accent, var(--widget-border-accent)) 46%, var(--widget-border) 54%));
  border-bottom-left-radius: var(--md-admonition-radius, 6px);
  border-bottom-right-radius: var(--md-admonition-radius, 6px);
  padding-bottom: calc(var(--md-admonition-padding-y, 0.35em) + 0.05em);
}

.cm-md-admonition-title-line {
  color: var(--md-admonition-title-color, var(--md-alert-accent, var(--widget-text-accent)));
}

/* ==========================================================================
   LISTS
   ========================================================================== */

.cm-md-list-marker {
  color: var(--md-list-marker-color);
  font-variant-numeric: tabular-nums;
}

.cm-md-list-number {
  font-weight: var(--md-list-number-weight, 600);
}

.cm-md-list-bullet {
  display: inline-block;
  width: var(--md-list-bullet-width, 0.75em);
  color: var(--md-list-marker-color);
  font-weight: var(--md-list-bullet-weight, 700);
  text-align: center;
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
  background: var(--md-table-bg, var(--editor-background));
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
  gap: 0.45em;
  font-weight: 650;
  margin-bottom: 0.25em;
}

.cm-md-admonition-title-line .cm-alert-title {
  margin-bottom: 0;
  color: var(--md-admonition-title-color, var(--md-alert-accent, var(--widget-text-accent)));
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
  width: 1.2em;
  height: 1.2em;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75em;
  font-weight: 700;
  line-height: 1;
  color: var(--md-admonition-title-color, currentColor);
  border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
  background: color-mix(in srgb, currentColor 12%, transparent);
}

/* ==========================================================================
   INLINE HTML

   Full HTML rendering support. HTML elements are rendered directly
   without sanitization for maximum flexibility.
   ========================================================================== */

/* Container for rendered inline HTML */
.cm-inline-html {
  display: inline;
}

/* HTML syntax when editing (cursor on line) */
.cm-html-syntax {
  color: var(--md-html-syntax-color, var(--md-marker-color));
  font-family: var(--md-marker-font);
  font-size: 0.95em;
}

/* Style HTML elements rendered in markdown */
.cm-inline-html kbd {
  font-family: var(--widget-font-mono);
  font-size: 0.85em;
  padding: 0.1em 0.4em;
  background: var(--widget-surface);
  border: 1px solid var(--widget-border);
  border-radius: 3px;
  box-shadow: 0 1px 0 var(--widget-border);
}

.cm-inline-html mark {
  background: var(--md-mark-background, #fef08a);
  color: var(--md-mark-color, inherit);
  padding: 0.1em 0.2em;
  border-radius: 2px;
}

.cm-inline-html abbr {
  text-decoration: underline dotted;
  cursor: help;
}

.cm-inline-html sub {
  font-size: 0.75em;
  vertical-align: sub;
}

.cm-inline-html sup {
  font-size: 0.75em;
  vertical-align: super;
}

.cm-inline-html small {
  font-size: 0.85em;
}

.cm-inline-html ins {
  text-decoration: underline;
  background: var(--md-ins-background, rgba(34, 197, 94, 0.15));
}

.cm-inline-html del {
  text-decoration: line-through;
  opacity: 0.7;
}

.cm-inline-html var {
  font-style: italic;
  font-family: var(--widget-font-mono);
}

.cm-inline-html samp {
  font-family: var(--widget-font-mono);
  font-size: 0.9em;
  background: var(--widget-surface);
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

.cm-inline-html cite {
  font-style: italic;
}

.cm-inline-html q {
  quotes: '"' '"' ''' ''';
}

.cm-inline-html q::before {
  content: open-quote;
}

.cm-inline-html q::after {
  content: close-quote;
}

.cm-inline-html dfn {
  font-style: italic;
  font-weight: 600;
}

.cm-inline-html time {
  font-variant-numeric: tabular-nums;
}

.cm-inline-html data {
  font-family: var(--widget-font-mono);
  font-size: 0.9em;
}

/* Ruby annotations (for East Asian text) */
.cm-inline-html ruby {
  display: ruby;
}

.cm-inline-html rt {
  font-size: 0.6em;
  color: var(--widget-text-muted);
}

.cm-inline-html rp {
  display: none;
}

/* Bidirectional text */
.cm-inline-html bdi {
  unicode-bidi: isolate;
}

.cm-inline-html bdo {
  unicode-bidi: bidi-override;
}

/* ==========================================================================
   MOBILE RESPONSIVE
   
   Quarto/Astro-inspired: content reads beautifully on narrow screens.
   Tables scroll horizontally, images scale, code wraps or scrolls.
   ========================================================================== */

@media (max-width: 768px) {

  /* Tables: horizontal scroll when they're wider than the viewport.
     This is the exact pattern Quarto and MkDocs Material use. */
  .cm-table-widget {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-left: -4px;
    margin-right: -4px;
    padding-left: 4px;
    padding-right: 4px;
  }

  /* Subtle fade on the right edge when table overflows */
  .cm-table-widget::after {
    content: '';
    position: sticky;
    right: 0;
    display: block;
    width: 16px;
    margin-top: -100%;
    height: 100%;
    background: linear-gradient(to right, transparent, var(--editor-background, #fff) 80%);
    pointer-events: none;
    float: right;
    opacity: 0.5;
  }

  .cm-table {
    font-size: 0.88em;
  }

  .cm-table th,
  .cm-table td {
    padding: 0.4em 0.65em;
    white-space: nowrap;
  }

  /* Images: full-width, never overflow the screen */
  .cm-image-block-img {
    max-width: 100%;
    max-height: 50vh;
  }

  .cm-image-inline-img {
    max-width: 100%;
  }

  /* Wide images: don't break out of viewport */
  .cm-image-pos-wide {
    width: 100%;
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
  }

  .cm-image-pos-wide .cm-image-block-img {
    max-width: 100%;
  }

  /* Right/left aligned images: go full width on mobile */
  .cm-image-pos-right,
  .cm-image-pos-left {
    text-align: center;
    padding-left: 0;
    padding-right: 0;
  }

  .cm-image-pos-right .cm-image-block-img,
  .cm-image-pos-left .cm-image-block-img {
    max-width: 100%;
  }

  /* Display math: horizontal scroll for wide equations */
  .cm-math-display {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Blockquotes: slightly tighter */
  .cm-md-blockquote-line {
    padding-left: 0.75em;
  }

  /* Headings: slightly smaller on mobile for better fit */
  .cm-md-h1 {
    font-size: clamp(1.4em, 5vw, var(--md-heading-1-size, 1.75em));
  }

  .cm-md-h2 {
    font-size: clamp(1.2em, 4vw, var(--md-heading-2-size, 1.4em));
  }

  /* Horizontal rule: full width */
  .cm-md-hr-line::after {
    left: 0;
    right: 0;
  }
}

/* Touch-specific: make interactive elements more tappable */
@media (pointer: coarse) {

  /* Checkboxes: bigger for finger tapping */
  .cm-task-checkbox {
    width: 1.2em;
    height: 1.2em;
    margin-right: 0.5em;
  }

  /* Links: slightly more padding to enlarge tap area */
  .cm-md-link-text,
  .cm-external-link,
  .cm-file-link,
  .cm-wiki-link {
    padding: 2px 0;
  }
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
