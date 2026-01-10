/**
 * Widget Patterns
 *
 * Documented patterns for building widgets that integrate cleanly with
 * CodeMirror's document flow. These patterns prevent common issues like
 * jitter, layout shifts, and selection problems.
 *
 * @module widgets/patterns
 */

// #region STABLE_LAYOUT_PATTERN

/**
 * # Stable Layout Pattern
 *
 * Use this pattern when a widget needs to display rich content (images, formatted
 * output, etc.) while allowing users to edit the underlying markdown when focused.
 *
 * ## The Problem
 *
 * Naive approaches cause "jitter" - content below shifts up/down when entering/leaving
 * a block. This happens when:
 *
 * 1. Using `Decoration.widget()` to ADD a widget on top of text lines
 *    → Total height = text lines + widget = TOO TALL
 *
 * 2. Hiding text with `display: none` or `height: 0`
 *    → Height changes when toggling = JITTER
 *
 * 3. Using `Decoration.replace()` to swap text with widget
 *    → Can cause parser issues, cursor problems
 *
 * ## The Solution
 *
 * Text lines ALWAYS provide vertical space. Widget OVERLAYS with `position: absolute`.
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TEXT LINES (always take space)     WIDGET (position: absolute) │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  Viewing: color: transparent        z-index: 1, visible         │
 * │  Editing: z-index: 2, opaque bg     display: none               │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ### Key CSS Rules
 *
 * ```css
 * // Widget: absolutely positioned, doesn't add to flow
 * .my-widget {
 *   position: absolute;
 *   left: 0;
 *   right: 0;
 *   z-index: 1;
 * }
 *
 * // Hidden when editing
 * .my-widget-hidden {
 *   display: none !important;
 * }
 *
 * // Text lines: always take same space
 * .my-line-hidden,
 * .my-line-visible {
 *   position: relative;
 * }
 *
 * // Viewing mode: text invisible but present
 * .my-line-hidden {
 *   color: transparent !important;
 *   user-select: none;
 * }
 * .my-line-hidden > span {
 *   visibility: hidden !important;
 * }
 *
 * // Editing mode: text visible, covers widget
 * .my-line-visible {
 *   position: relative;
 *   z-index: 2;
 *   background: var(--widget-surface-elevated);  // Opaque!
 * }
 * ```
 *
 * ### Decoration Setup
 *
 * ```javascript
 * function buildDecorations(view) {
 *   const decorations = [];
 *   const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
 *
 *   for (const block of findBlocks(view)) {
 *     const cursorInBlock = cursorLine >= block.startLine && cursorLine <= block.endLine;
 *
 *     // 1. Line decorations for ALL lines (always take space)
 *     for (let i = block.startLine; i <= block.endLine; i++) {
 *       const line = view.state.doc.line(i);
 *       decorations.push(
 *         Decoration.line({
 *           class: cursorInBlock ? 'my-line-visible' : 'my-line-hidden',
 *         }).range(line.from)
 *       );
 *     }
 *
 *     // 2. Widget decoration (always present, hidden via CSS when editing)
 *     decorations.push(
 *       Decoration.widget({
 *         widget: new MyWidget(block.content, cursorInBlock),
 *         side: 1,
 *       }).range(block.startLine.to)
 *     );
 *   }
 *
 *   return Decoration.set(decorations, true);
 * }
 * ```
 *
 * ## Why This Works
 *
 * 1. **Text lines NEVER change height** - they're always present, just transparent
 * 2. **Widget NEVER adds to flow** - position: absolute takes it out of flow
 * 3. **Only visibility changes** - no layout recalculation, no jitter
 * 4. **z-index layering** - editing mode text covers widget cleanly
 *
 * ## Real Example
 *
 * See `output-widget.js` for a complete implementation of this pattern.
 */
export const STABLE_LAYOUT_PATTERN = 'stable-layout';

// #endregion STABLE_LAYOUT_PATTERN

// #region THEME_INTEGRATION

/**
 * # Theme Integration Pattern
 *
 * All widgets should use CSS custom properties from the theme system.
 * This ensures consistent styling and automatic light/dark mode support.
 *
 * ## Available Tokens
 *
 * See `theme.js` for the complete list. Key tokens:
 *
 * ### Spacing
 * - `--widget-line-height` - Use 'inherit' to match editor
 * - `--widget-padding-x`, `--widget-padding-y`
 * - `--widget-margin-y`
 * - `--widget-border-radius`
 *
 * ### Surfaces
 * - `--widget-surface` - Main background
 * - `--widget-surface-hover` - Hover state
 * - `--widget-surface-elevated` - Floating/overlay elements (OPAQUE for z-index layering!)
 * - `--widget-surface-inset` - Recessed areas
 *
 * ### Text
 * - `--widget-text` - Primary text
 * - `--widget-text-muted` - Secondary text
 * - `--widget-text-accent` - Interactive/links
 *
 * ### Borders
 * - `--widget-border` - Default border
 * - `--widget-border-accent` - Accent (e.g., left bar)
 * - `--widget-border-focus` - Focus rings
 *
 * ## Example
 *
 * ```css
 * .my-widget {
 *   font-family: var(--widget-font-mono);
 *   font-size: var(--widget-font-size);
 *   line-height: var(--widget-line-height, inherit);
 *   padding: var(--widget-padding-y) var(--widget-padding-x);
 *   background: var(--widget-surface);
 *   border-radius: var(--widget-border-radius);
 *   color: var(--widget-text);
 * }
 *
 * .my-widget:hover {
 *   background: var(--widget-surface-hover);
 * }
 * ```
 *
 * ## Important: Opaque Backgrounds for Layering
 *
 * When using z-index layering (stable layout pattern), the visible text lines
 * MUST have an opaque background to cover the widget underneath:
 *
 * ```css
 * .my-line-visible {
 *   background: var(--widget-surface-elevated);  // Opaque, not transparent!
 *   z-index: 2;
 * }
 * ```
 */
export const THEME_INTEGRATION_PATTERN = 'theme-integration';

// #endregion THEME_INTEGRATION

// #region WIDGET_EQUALITY

/**
 * # Widget Equality Pattern
 *
 * CodeMirror uses `widget.eq(other)` to determine if a widget needs to be
 * recreated. Proper implementation prevents unnecessary DOM updates.
 *
 * ## Rules
 *
 * 1. Compare ONLY data that affects visual output
 * 2. Do NOT compare transient state (like cursor position)
 * 3. Use `hidden` flag for CSS-based visibility, not for eq() comparison
 *
 * ## Example
 *
 * ```javascript
 * class MyWidget extends WidgetType {
 *   constructor(content, hidden, blockId) {
 *     super();
 *     this.content = content;
 *     this.hidden = hidden;  // For CSS class, not eq()
 *     this.blockId = blockId;
 *   }
 *
 *   eq(other) {
 *     // Compare content and identity, NOT hidden state
 *     // Hidden state changes frequently (cursor movement) but
 *     // we handle that via CSS class, not DOM recreation
 *     return (
 *       other.content === this.content &&
 *       other.blockId === this.blockId
 *     );
 *   }
 *
 *   toDOM() {
 *     const el = document.createElement('div');
 *     el.className = 'my-widget' + (this.hidden ? ' my-widget-hidden' : '');
 *     // ... render content
 *     return el;
 *   }
 * }
 * ```
 *
 * ## Why Exclude `hidden` from eq()?
 *
 * If you include `hidden` in eq(), the widget DOM is recreated every time
 * the cursor enters/leaves the block. This can cause:
 * - Flickering
 * - Loss of scroll position in widget
 * - Re-triggering of image loads
 * - Poor performance
 *
 * Instead, use CSS classes to toggle visibility.
 */
export const WIDGET_EQUALITY_PATTERN = 'widget-equality';

// #endregion WIDGET_EQUALITY

// #region EXPORTS

export default {
  STABLE_LAYOUT_PATTERN,
  THEME_INTEGRATION_PATTERN,
  WIDGET_EQUALITY_PATTERN,
};

// #endregion EXPORTS
