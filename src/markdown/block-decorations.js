/**
 * Block Decorations StateField
 *
 * Handles multi-line decorations that require Decoration.replace across line breaks.
 * CodeMirror 6 only allows these from StateFields, not ViewPlugins.
 *
 * This handles:
 * - Tables (multi-line)
 * - Display math (multi-line)
 *
 * Also implements "stable height" feature to prevent layout shift when
 * switching between rendered widgets and raw markdown.
 *
 * @module markdown/block-decorations
 */


import { StateField } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { sourceModeFacet, wysiwygModeFacet } from './facets.js';

// =============================================================================
// Line Height Tracking for Accurate Spacing
// =============================================================================

/**
 * Module-level cache for line height.
 * Updated by ViewPlugin, read by StateField.
 * This is simpler and more reliable than StateEffect-based approach.
 */
let cachedLineHeight = 22; // Default fallback

/**
 * Get the current line height
 */
function getLineHeight() {
  return cachedLineHeight;
}

/**
 * Update the cached line height (called by ViewPlugin)
 * Invalidates widget height cache if line height changed significantly
 * (indicates font/zoom change)
 */
function setLineHeight(height) {
  if (height > 0 && height !== cachedLineHeight) {
    // If line height changed significantly (>1px), cached widget heights are stale
    if (cacheLineHeight > 0 && Math.abs(height - cacheLineHeight) > 1) {
      clearHeightCache();
    }
    cacheLineHeight = height;
    cachedLineHeight = height;
  }
}
import {
  TableWidget,
  parseTable,
  isTableLine,
  isTableDelimiter,
  generateTableId,
} from './widgets/table.js';
import {
  DisplayMathWidget,
  extractDisplayMath,
  generateMathId,
} from './widgets/math.js';
import {
  FrontmatterWidget,
} from './widgets/frontmatter.js';
import {
  DetailsBlockWidget,
  extractDetailsBlocks,
} from './html-inline.js';
import {
  LinkedTableWidget,
} from '../tables/widgets/linked-table-widget.js';
import {
  LinkedTableSourceBannerWidget,
} from '../tables/widgets/linked-table-source-banner.js';
import {
  findLinkedTableBlocksInState,
  getLinkedTableBlockRange,
  isRangeInsideLinkedTable,
} from '../tables/parsing/linked-table-blocks.js';
import {
  linkedTableMarkdownState,
} from '../tables/state/linked-table-state.js';

// =============================================================================
// Height Cache for Stable Layout
// =============================================================================

/**
 * Cache of rendered widget heights, keyed by content hash.
 * Used to pad raw markdown to prevent layout shift.
 *
 * Cache is invalidated when line height changes (font/zoom change).
 */
const widgetHeightCache = new Map();

/**
 * Track the line height when cache was populated.
 * If line height changes significantly, cache is invalidated.
 */
let cacheLineHeight = 0;

/**
 * Clear the height cache (called when font/zoom changes)
 */
export function clearHeightCache() {
  widgetHeightCache.clear();
}

/**
 * Re-measure when webfonts finish loading.
 *
 * Widget DOM heights change when fonts swap in (KaTeX loads its fonts lazily
 * on first math render). CodeMirror only measures during update cycles, so
 * without this the stale height sits in the height map until the user's next
 * keystroke forces a measure — and the page visibly jumps at the start of
 * typing. Instead: drop cached heights and request a measure immediately,
 * at idle, when each font batch lands.
 */
export const fontRemeasurePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.onFontsChanged = () => {
        clearHeightCache();
        // Double rAF: ensure the font swap has actually reflowed the DOM
        // before CodeMirror reads heights, otherwise we measure the old
        // fallback-font layout and keep the stale value.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this.view.requestMeasure());
        });
      };
      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.addEventListener?.('loadingdone', this.onFontsChanged);
        document.fonts.ready?.then(() => this.onFontsChanged()).catch(() => {});
      }
    }

    destroy() {
      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.removeEventListener?.('loadingdone', this.onFontsChanged);
      }
    }
  },
);

// =============================================================================
// Stable height reservation while editing inside a block region
// =============================================================================
//
// When the cursor enters a rendered block (table, math, frontmatter, ...) the
// widget is swapped for raw source padded to the widget's cached height. The
// cache is keyed by content hash — but the user is *editing*, so after the
// first keystroke the hash no longer matches and the padding used to vanish,
// making everything below the block jump up and later back down. Fix: when a
// region is revealed for editing, reserve its last known rendered height under
// a stable region key and keep using that reservation until the cursor leaves.

let activeEditReservations = new Map();
let pendingEditReservations = null;

function beginEditReservationPass() {
  pendingEditReservations = new Map();
}

function endEditReservationPass() {
  if (pendingEditReservations) activeEditReservations = pendingEditReservations;
  pendingEditReservations = null;
}

/**
 * Compute the spacer padding for a block region revealed for editing.
 * Falls back to the reservation made when the region was first revealed if
 * the live content hash no longer matches the height cache.
 *
 * @param {string} regionKey - stable identity, e.g. `table:42`
 * @param {string} contentHash - live content hash for the region
 * @param {number} lineCount - current number of raw source lines
 * @returns {number} padding-bottom in px (0 when nothing should be reserved)
 */
function editingSpacerPadding(regionKey, contentHash, lineCount) {
  let reserved = getCachedHeight(contentHash);
  if (!reserved) reserved = activeEditReservations.get(regionKey);
  if (!reserved) return 0;

  if (pendingEditReservations) pendingEditReservations.set(regionKey, reserved);

  const padding = reserved - lineCount * getLineHeight();
  return padding > 0 ? padding : 0;
}

/**
 * Make a rendered block widget enter edit mode on click: place the cursor at
 * the widget's current document position so the StateField reveals the raw
 * source. Uses posAtDOM so positions are never stale after document edits.
 *
 * @param {HTMLElement} dom
 * @param {import('@codemirror/view').EditorView | undefined} view
 * @param {number} lineOffset - lines to move the cursor past the region start
 *   (e.g. 1 to land inside `$$ ... $$` rather than on the opening fence)
 */
function attachClickToEdit(dom, view, lineOffset = 0) {
  if (!view) return;
  dom.style.cursor = 'text';
  dom.addEventListener('mousedown', (event) => {
    // Leave interactive elements (links, buttons, inputs) alone.
    if (event.target.closest('a, button, input, textarea, select')) return;
    event.preventDefault();
    let pos = view.posAtDOM(dom);
    if (lineOffset > 0) {
      const startLine = view.state.doc.lineAt(pos).number;
      const target = Math.min(startLine + lineOffset, view.state.doc.lines);
      pos = view.state.doc.line(target).from;
    }
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  });
}

/**
 * Build the standard spacer line decoration for a revealed block region.
 *
 * @param {import('@codemirror/state').Text} doc
 * @param {number} endLineNumber - 1-based last line of the region
 * @param {number} padding - px
 */
function editingSpacerDecoration(doc, endLineNumber, padding) {
  const lastLine = doc.line(endLineNumber);
  return Decoration.line({
    attributes: {
      class: 'cm-block-spacer-line',
      style: `padding-bottom: ${padding}px`,
    },
  }).range(lastLine.from);
}

/**
 * Simple hash function for content-based caching
 */
function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Store widget height in cache
 */
export function cacheWidgetHeight(contentHash, height) {
  widgetHeightCache.set(contentHash, height);
}

/**
 * Get cached widget height
 */
export function getCachedHeight(contentHash) {
  return widgetHeightCache.get(contentHash);
}

// =============================================================================
// Spacer Widget for Stable Layout
// =============================================================================

/**
 * A simple spacer widget that adds vertical padding to prevent layout shift
 * when switching from rendered widget to raw markdown.
 */
class SpacerWidget extends WidgetType {
  constructor(height, label = 'content') {
    super();
    this.height = height;
    this.label = label;
  }

  eq(other) {
    return other.height === this.height && other.label === this.label;
  }

  toDOM() {
    const spacer = document.createElement('div');
    spacer.className = 'cm-block-spacer';
    spacer.style.height = `${this.height}px`;
    // Subtle visual indicator
    spacer.setAttribute('data-spacer-for', this.label);
    // Make non-focusable and non-interactive for navigation
    spacer.setAttribute('tabindex', '-1');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.pointerEvents = 'none';
    spacer.style.userSelect = 'none';
    return spacer;
  }

  ignoreEvent() {
    return true;
  }

  // Don't let this widget be a cursor target
  get estimatedHeight() {
    return this.height;
  }
}

/**
 * TableWidget wrapper that caches its rendered height for stable layout.
 */
class TableWidgetWithHeightCache extends TableWidget {
  constructor(table, tableId, contentHash) {
    super(table, tableId);
    this.contentHash = contentHash;
    this.rowCount = (table?.rows?.length ?? 0) + 1; // + header row
  }

  eq(other) {
    return super.eq(other) && other.contentHash === this.contentHash;
  }

  // Tell CodeMirror's height map how tall this widget really is *before* it
  // renders. Without this, off-screen widgets are assumed to be ~one line
  // tall and the page jumps when the measured height corrects the estimate.
  get estimatedHeight() {
    return getCachedHeight(this.contentHash) ??
      Math.round((this.rowCount + 1) * getLineHeight());
  }

  toDOM(view) {
    const dom = super.toDOM(view);
    const contentHash = this.contentHash;
    attachClickToEdit(dom, view);

    // Cache the LINE height (not widget height) after render
    // The line includes widget buffers and other CM overhead
    requestAnimationFrame(() => {
      // Find the parent .cm-line element
      const line = dom.closest('.cm-line');
      const height = line ? line.offsetHeight : dom.offsetHeight;
      if (height > 0) {
        cacheWidgetHeight(contentHash, height);
      }
    });

    return dom;
  }
}

/**
 * LinkedTableWidget wrapper that caches its rendered height for stable layout.
 */
class LinkedTableWidgetWithHeightCache extends LinkedTableWidget {
  constructor(block, parsedTable, contentHash, options = {}) {
    super(block, parsedTable, contentHash, options);
    this.contentHash = contentHash;
    this.rowCount = (parsedTable?.rows?.length ?? 0) + 1;
  }

  eq(other) {
    return super.eq(other) && other.contentHash === this.contentHash;
  }

  get estimatedHeight() {
    return getCachedHeight(this.contentHash) ??
      Math.round((this.rowCount + 2) * getLineHeight());
  }

  toDOM(view) {
    const dom = super.toDOM(view);
    const contentHash = this.contentHash;

    requestAnimationFrame(() => {
      const line = dom.closest('.cm-line');
      const height = line ? line.offsetHeight : dom.offsetHeight;
      if (height > 0) {
        cacheWidgetHeight(contentHash, height);
      }
    });

    return dom;
  }
}

/**
 * DisplayMathWidget wrapper that caches its rendered height for stable layout.
 */
class DetailsBlockWidgetWithHeightCache extends DetailsBlockWidget {
  constructor(summary, content, open, contentHash) {
    super(summary, content, open);
    this.contentHash = contentHash;
  }

  eq(other) {
    return super.eq(other) && other.contentHash === this.contentHash;
  }

  get estimatedHeight() {
    return getCachedHeight(this.contentHash) ??
      Math.round(getLineHeight() * 1.5);
  }

  toDOM() {
    const dom = super.toDOM();
    requestAnimationFrame(() => {
      const height = dom.offsetHeight;
      if (height > 0) cacheWidgetHeight(this.contentHash, height);
    });
    return dom;
  }
}

class DisplayMathWidgetWithHeightCache extends DisplayMathWidget {
  constructor(latex, mathId, contentHash) {
    super(latex, mathId);
    this.contentHash = contentHash;
  }

  eq(other) {
    return super.eq(other) && other.contentHash === this.contentHash;
  }

  get estimatedHeight() {
    return getCachedHeight(this.contentHash) ??
      Math.round(getLineHeight() * 3);
  }

  toDOM(view) {
    const dom = super.toDOM(view);
    const contentHash = this.contentHash;
    // Land inside the $$ ... $$ body, not on the opening delimiter line.
    attachClickToEdit(dom, view, 1);

    // Cache the LINE height (not widget height) after render
    // The line includes widget buffers and other CM overhead
    requestAnimationFrame(() => {
      const line = dom.closest('.cm-line');
      const height = line ? line.offsetHeight : dom.offsetHeight;
      if (height > 0) {
        cacheWidgetHeight(contentHash, height);
      }
    });

    return dom;
  }
}

/**
 * Find all table ranges in the document using syntax tree + fallback scanner
 */
function findTableRanges(state) {
  const doc = state.doc;
  const ranges = [];
  const processedStarts = new Set();

  // First pass: use syntax tree
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(node.to);

        if (!processedStarts.has(startLine.number)) {
          processedStarts.add(startLine.number);
          ranges.push({
            type: 'table',
            from: node.from,
            to: node.to,
            startLine: startLine.number,
            endLine: endLine.number,
          });
        }
        return false; // Don't recurse
      }
    },
  });

  // Second pass: fallback scanner for tables not in syntax tree
  // (GFM tables sometimes parsed as paragraphs)
  let inTable = false;
  let tableStart = -1;
  let tableStartLine = -1;
  let hasDelimiter = false;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const isTable = isTableLine(text);
    const isDelim = isTableDelimiter(text);

    if (isTable && !inTable) {
      // Check if already processed
      if (!processedStarts.has(i)) {
        inTable = true;
        tableStart = line.from;
        tableStartLine = i;
        hasDelimiter = isDelim;
      }
    } else if (isTable && inTable) {
      if (isDelim) hasDelimiter = true;
    } else if (!isTable && inTable) {
      // End of table
      if (hasDelimiter && tableStartLine > 0) {
        const prevLine = doc.line(i - 1);
        ranges.push({
          type: 'table',
          from: tableStart,
          to: prevLine.to,
          startLine: tableStartLine,
          endLine: i - 1,
        });
      }
      inTable = false;
      tableStart = -1;
      tableStartLine = -1;
      hasDelimiter = false;
    }
  }

  // Handle table at end of document
  if (inTable && hasDelimiter && tableStartLine > 0) {
    const lastLine = doc.line(doc.lines);
    ranges.push({
      type: 'table',
      from: tableStart,
      to: lastLine.to,
      startLine: tableStartLine,
      endLine: doc.lines,
    });
  }

  return ranges;
}

/**
 * Find all display math ranges in the document
 */
function findDisplayMathRanges(state) {
  const doc = state.doc;
  const text = doc.toString();
  const ranges = [];

  // Positions inside fenced/inline code must never participate in math
  // delimiter pairing. Otherwise a `$$` in a Python string or shell heredoc
  // pairs with real math elsewhere and swallows everything between them.
  const codeRanges = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode') {
        codeRanges.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });
  const inCode = (pos) => codeRanges.some((r) => pos >= r.from && pos < r.to);

  // Collect `$$` delimiter positions outside code, then pair them
  // sequentially (1st with 2nd, 3rd with 4th, ...). This also stops an odd
  // `$$` inside code from flipping math rendering for the rest of the file.
  const delimiters = [];
  const delimPattern = /\$\$/g;
  let match;
  while ((match = delimPattern.exec(text)) !== null) {
    if (!inCode(match.index)) delimiters.push(match.index);
  }

  for (let d = 0; d + 1 < delimiters.length; d += 2) {
    const from = delimiters[d];
    const to = delimiters[d + 1] + 2;
    const content = text.slice(from + 2, to - 2);

    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);

    // Check if it's on its own line (block display math)
    const lineText = startLine.text.trim();
    const isBlock = lineText.startsWith('$$');

    if (isBlock) {
      ranges.push({
        type: 'displayMath',
        from,
        to,
        startLine: startLine.number,
        endLine: endLine.number,
        content: content.trim(),
      });
    }
  }

  // Match \[ ... \] (LaTeX display math)
  const bracketPattern = /\\\[([\s\S]*?)\\\]/g;

  while ((match = bracketPattern.exec(text)) !== null) {
    const from = match.index;
    const to = match.index + match[0].length;
    if (inCode(from) || inCode(to - 1)) continue;
    const content = match[1];
    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);

    ranges.push({
      type: 'displayMath',
      from,
      to,
      startLine: startLine.number,
      endLine: endLine.number,
      content: content.trim(),
    });
  }

  return ranges;
}

/**
 * FrontmatterWidget wrapper that caches its rendered height for stable layout.
 */
class FrontmatterWidgetWithHeightCache extends FrontmatterWidget {
  constructor(yamlContent, contentHash, sourceFrom, sourceTo) {
    super(yamlContent, contentHash, sourceFrom, sourceTo);
    this.yamlLineCount = String(yamlContent ?? '').split('\n').length;
  }

  get estimatedHeight() {
    return getCachedHeight(this.contentHash) ??
      Math.round((this.yamlLineCount + 2) * getLineHeight());
  }

  toDOM(view) {
    const dom = super.toDOM(view);
    const contentHash = this.contentHash;

    requestAnimationFrame(() => {
      const line = dom.closest('.cm-line');
      const height = line ? line.offsetHeight : dom.offsetHeight;
      if (height > 0) {
        cacheWidgetHeight(contentHash, height);
      }
    });

    return dom;
  }
}

/**
 * Find frontmatter range at the start of the document (--- ... ---)
 */
function findFrontmatterRange(state) {
  const doc = state.doc;
  if (doc.lines < 2) return null;

  const firstLine = doc.line(1);
  if (firstLine.text.trim() !== '---') return null;

  // Find closing ---
  for (let i = 2; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.text.trim() === '---') {
      // YAML content is between line 2 and line i-1
      const yamlLines = [];
      for (let j = 2; j < i; j++) {
        yamlLines.push(doc.line(j).text);
      }
      return {
        type: 'frontmatter',
        from: firstLine.from,
        to: line.to,
        startLine: 1,
        endLine: i,
        content: yamlLines.join('\n'),
      };
    }
    // If we hit a line that looks like content (not YAML), stop
    // Frontmatter can't contain blank lines followed by markdown
  }
  return null;
}

/**
 * Build decorations for all block elements
 */
function buildBlockDecorations(state) {
  const doc = state.doc;
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  const decorations = [];
  beginEditReservationPass();

  // Mode flags
  const isSourceMode = state.facet(sourceModeFacet);
  const isWysiwygMode = state.facet(wysiwygModeFacet);
  const revealedLinkedTables = state.field(linkedTableMarkdownState, false) || new Set();

  // Find and process linked tables first
  const linkedTableBlocks = findLinkedTableBlocksInState(state);

  for (const block of linkedTableBlocks) {
    const blockRange = getLinkedTableBlockRange(block);
    const contentHash = 'linked-table-' + hashContent(doc.sliceString(blockRange.from, blockRange.to));
    const showLinkedSource = isSourceMode || revealedLinkedTables.has(block.spec.id);

    if (!showLinkedSource) {
      const parsed = parseTable(block.tableLines || []);
      if (parsed && parsed.rows.length > 0) {
        decorations.push(
          Decoration.replace({
            widget: new LinkedTableWidgetWithHeightCache(block, parsed, contentHash),
          }).range(blockRange.from, blockRange.to)
        );
      }
    } else {
      if (!isSourceMode && revealedLinkedTables.has(block.spec.id)) {
        decorations.push(
          Decoration.widget({
            widget: new LinkedTableSourceBannerWidget(block),
            side: -1,
            block: true,
          }).range(block.headerFrom)
        );
      }

      const padding = editingSpacerPadding(
        `linked-table:${block.startLine}`,
        contentHash,
        block.endLine - block.startLine + 1,
      );
      if (padding > 0) {
        decorations.push(editingSpacerDecoration(doc, block.endLine, padding));
      }
    }
  }

  // Find and process plain tables
  const tableRanges = findTableRanges(state);

  for (const range of tableRanges) {
    if (isRangeInsideLinkedTable(range, linkedTableBlocks)) {
      continue;
    }

    const cursorInTable = isSourceMode || (!isWysiwygMode && cursorLine >= range.startLine && cursorLine <= range.endLine);

    // Collect lines for both rendering and height calculation
    const lines = [];
    for (let i = range.startLine; i <= range.endLine; i++) {
      lines.push(doc.line(i).text);
    }
    const contentHash = 'table-' + hashContent(lines.join('\n'));

    if (!cursorInTable) {
      // Cursor outside: replace entire table with widget
      const parsed = parseTable(lines);

      if (parsed && parsed.rows.length > 0) {
        const tableId = generateTableId(range.from);
        decorations.push(
          Decoration.replace({
            widget: new TableWidgetWithHeightCache(parsed, tableId, contentHash),
          }).range(range.from, range.to)
        );
      }
    } else {
      // Cursor inside: show raw markdown, but add spacer to prevent layout shift
      const padding = editingSpacerPadding(
        `table:${range.startLine}`,
        contentHash,
        range.endLine - range.startLine + 1,
      );
      if (padding > 0) {
        decorations.push(editingSpacerDecoration(doc, range.endLine, padding));
      }
    }
  }

  // Find and process display math
  const mathRanges = findDisplayMathRanges(state);

  for (const range of mathRanges) {
    const cursorInMath = isSourceMode || (!isWysiwygMode && cursorLine >= range.startLine && cursorLine <= range.endLine);
    const contentHash = 'math-' + hashContent(range.content);

    if (!cursorInMath) {
      // Cursor outside: replace entire math block with widget
      const mathId = generateMathId(range.from);
      decorations.push(
        Decoration.replace({
          widget: new DisplayMathWidgetWithHeightCache(range.content, mathId, contentHash),
        }).range(range.from, range.to)
      );
    } else {
      // Cursor inside: show raw LaTeX, but add spacer to prevent layout shift
      const padding = editingSpacerPadding(
        `math:${range.startLine}`,
        contentHash,
        range.endLine - range.startLine + 1,
      );
      if (padding > 0) {
        decorations.push(editingSpacerDecoration(doc, range.endLine, padding));
      }
    }
  }

  // Find and process raw HTML <details>/<summary> blocks.
  // These can span multiple lines and contain fenced code, so they must live in
  // this StateField rather than the line-oriented inline HTML ViewPlugin.
  const detailsRanges = extractDetailsBlocks(doc.toString());
  for (const range of detailsRanges) {
    const startLine = doc.lineAt(range.start).number;
    const endLine = doc.lineAt(range.end).number;
    // Unlike tables/math, <details> is itself interactive. Clicking the
    // summary moves CodeMirror's selection into the replaced source range; if
    // we reveal raw source on cursor entry the disclosure immediately collapses
    // into literal <details> text. Keep it rendered unless explicit source mode
    // is enabled.
    const cursorInDetails = isSourceMode;
    const contentHash = 'details-' + hashContent(doc.sliceString(range.start, range.end));

    if (!cursorInDetails) {
      decorations.push(
        Decoration.replace({
          widget: new DetailsBlockWidgetWithHeightCache(range.summary, range.content, range.open, contentHash),
        }).range(range.start, range.end)
      );
    } else {
      const padding = editingSpacerPadding(
        `details:${startLine}`,
        contentHash,
        endLine - startLine + 1,
      );
      if (padding > 0) {
        decorations.push(editingSpacerDecoration(doc, endLine, padding));
      }
    }
  }

  // Find and process frontmatter
  const fmRange = findFrontmatterRange(state);

  if (fmRange) {
    const cursorInFrontmatter = isSourceMode || (!isWysiwygMode && cursorLine >= fmRange.startLine && cursorLine <= fmRange.endLine);
    const contentHash = 'fm-' + hashContent(fmRange.content);

    if (!cursorInFrontmatter) {
      decorations.push(
        Decoration.replace({
          widget: new FrontmatterWidgetWithHeightCache(
            fmRange.content,
            contentHash,
            fmRange.from,
            fmRange.to
          ),
        }).range(fmRange.from, fmRange.to)
      );
    } else {
      // Cursor inside: show raw YAML with spacer for stable height
      const padding = editingSpacerPadding(
        `frontmatter:${fmRange.startLine}`,
        contentHash,
        fmRange.endLine - fmRange.startLine + 1,
      );
      if (padding > 0) {
        decorations.push(editingSpacerDecoration(doc, fmRange.endLine, padding));
      }
    }
  }

  endEditReservationPass();
  return Decoration.set(decorations, true);
}

/**
 * StateField for block decorations (tables, display math)
 *
 * This MUST be a StateField (not ViewPlugin) because it uses
 * Decoration.replace across line breaks.
 */
export const blockDecorations = StateField.define({
  create(state) {
    return buildBlockDecorations(state);
  },

  update(decorations, tr) {
    // Rebuild on any change that could affect block elements
    // For efficiency, we could map positions and only rebuild affected ranges,
    // but for now, full rebuild is acceptable
    if (tr.docChanged || tr.selection || tr.reconfigured) {
      return buildBlockDecorations(tr.state);
    }
    return decorations;
  },

  provide: (f) => EditorView.decorations.from(f),
});

/**
 * ViewPlugin to track and update the actual line height from the editor.
 * This ensures spacer calculations use the real line height, not estimates.
 *
 * Note: StateFields run before ViewPlugins, so we need to trigger a
 * re-render after updating the line height cache.
 */
export const lineHeightTracker = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      const oldHeight = cachedLineHeight;
      setLineHeight(view.defaultLineHeight);

      // If line height changed, trigger a re-render so StateField uses correct value
      if (oldHeight !== cachedLineHeight) {
        // Use requestAnimationFrame to avoid dispatching during construction
        requestAnimationFrame(() => {
          // Dispatch empty transaction to trigger StateField rebuild
          view.dispatch({});
        });
      }
    }

    update(update) {
      // Check if line height changed (e.g., due to font loading or resize)
      const oldHeight = cachedLineHeight;
      setLineHeight(this.view.defaultLineHeight);

      // If height changed mid-session (font load, resize), trigger rebuild
      // Use requestAnimationFrame to avoid dispatching during update
      if (oldHeight !== cachedLineHeight) {
        requestAnimationFrame(() => {
          this.view.dispatch({});
        });
      }
    }
  }
);
