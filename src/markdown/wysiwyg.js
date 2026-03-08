/**
 * WYSIWYG mode support for the markdown editor.
 *
 * Provides:
 * - atomic protection around markdown syntax markers
 * - transaction filtering to avoid accidental syntax corruption
 * - WYSIWYG-native key layer (Backspace demotion/merge, Enter continuation, Mod-B/I/`)
 * - code block protection (no backspace out of code, no editing fence lines)
 * - proper bold/italic/code toggling (unwrap when already formatted)
 *
 * @module markdown/wysiwyg
 */

import { EditorState, Transaction } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { sourceModeFacet, wysiwygModeFacet } from './facets.js';
import {
  findDelimitedRange as sharedFindDelimitedRange,
  getLineInlineModel,
  inlineClassForMark,
  markToSyntax,
  syntaxToMark,
} from './inline-model.js';
import { toggleInlineMark } from './inline-commands.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWysiwygActive(state) {
  return state.facet(wysiwygModeFacet) && !state.facet(sourceModeFacet);
}

function pushRange(ranges, from, to) {
  if (from >= to) return;
  ranges.push({ from, to });
}

// ---------------------------------------------------------------------------
// Protected-range collection
// ---------------------------------------------------------------------------

function collectProtectedRanges(state, from = 0, to = state.doc.length) {
  const doc = state.doc;
  const ranges = [];

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (
        node.name === 'HeaderMark' ||
        node.name === 'EmphasisMark' ||
        node.name === 'StrikethroughMark' ||
        node.name === 'QuoteMark' ||
        node.name === 'ListMark'
      ) {
        pushRange(ranges, node.from, node.to);
        return;
      }

      if (node.name === 'CodeMark') {
        const text = doc.sliceString(node.from, node.to);
        pushRange(ranges, node.from, node.to);

        // For fenced code blocks, also protect the full fence line so the user
        // cannot accidentally edit the language/info string.
        if (text.length >= 3) {
          const line = doc.lineAt(node.from);
          pushRange(ranges, line.from, line.to);
        }
        return;
      }

      // Links and images are rendered as widgets – protect full syntax range.
      if (node.name === 'Link' || node.name === 'Image') {
        pushRange(ranges, node.from, node.to);
        return false;
      }

      if (node.name === 'FencedCode') {
        const startLine = doc.lineAt(node.from);
        const endLine = doc.lineAt(node.to);
        pushRange(ranges, startLine.from, startLine.to);
        pushRange(ranges, endLine.from, endLine.to);
        return false;
      }
    },
  });

  // Protect wiki-link raw syntax when rendered as widgets.
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(Math.max(from, to)).number;
  const wikiRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
  for (let i = startLine; i <= endLine; i++) {
    const line = doc.line(i);
    wikiRegex.lastIndex = 0;
    let match;
    while ((match = wikiRegex.exec(line.text)) !== null) {
      pushRange(ranges, line.from + match.index, line.from + match.index + match[0].length);
    }
  }

  // Sort by from position (wiki-link ranges appended after tree ranges may be out of order)
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return ranges;
}

// ---------------------------------------------------------------------------
// Atomic ranges plugin
// ---------------------------------------------------------------------------

const wysiwygAtomicPlugin = ViewPlugin.fromClass(
  class {
    constructor() {
      this.decorations = Decoration.none;
    }

    update() {
      this.decorations = Decoration.none;
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// ---------------------------------------------------------------------------
// Code-fence header widget
// ---------------------------------------------------------------------------

/** Tiny invisible widget used to replace the closing ``` fence line. */
class CodeFenceCloseWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-wysiwyg-code-fence-close';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  ignoreEvent() { return true; }
}

class CodeFenceHeaderWidget extends WidgetType {
  constructor(lang, blockFrom, blockTo) {
    super();
    this.lang = lang;
    this.blockFrom = blockFrom;
    this.blockTo = blockTo;
  }

  eq(other) {
    return other.lang === this.lang && other.blockFrom === this.blockFrom && other.blockTo === this.blockTo;
  }

  toDOM(view) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-wysiwyg-code-header';

    // Language label (editable on click)
    const langEl = document.createElement('span');
    langEl.className = 'cm-wysiwyg-code-header-lang';
    langEl.textContent = this.lang || 'plain text';
    langEl.title = 'Click to change language';

    const blockFrom = this.blockFrom;
    const blockTo = this.blockTo;
    const editorView = view;

    langEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cm-wysiwyg-code-header-lang-input';
      input.value = langEl.textContent === 'plain text' ? '' : langEl.textContent;
      input.placeholder = 'language';

      const commit = () => {
        const newLang = input.value.trim();
        if (input.parentNode) {
          input.parentNode.replaceChild(langEl, input);
        }
        langEl.textContent = newLang || 'plain text';

        const doc = editorView.state.doc;
        const fenceLine = doc.lineAt(blockFrom);
        const fenceMatch = fenceLine.text.match(/^(`{3,})(.*)/);
        if (fenceMatch) {
          editorView.dispatch({
            changes: { from: fenceLine.from, to: fenceLine.to, insert: fenceMatch[1] + (newLang || '') },
            userEvent: 'input.wysiwyg.change-lang',
          });
        }
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { ev.preventDefault(); input.value = ''; input.blur(); }
      });

      langEl.parentNode.replaceChild(input, langEl);
      // Defer focus so the input is in the DOM
      requestAnimationFrame(() => { input.focus(); input.select(); });
    });

    wrapper.appendChild(langEl);

    // ⋯ menu button with dropdown
    const menuWrap = document.createElement('span');
    menuWrap.className = 'cm-wysiwyg-code-header-menu-wrap';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'cm-wysiwyg-code-header-btn';
    menuBtn.title = 'Code block options';
    menuBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
    menuWrap.appendChild(menuBtn);

    // Dropdown menu (hidden by default)
    const menu = document.createElement('div');
    menu.className = 'cm-wysiwyg-code-header-dropdown';
    menu.style.display = 'none';

    const makeItem = (label, icon, action) => {
      const item = document.createElement('button');
      item.className = 'cm-wysiwyg-code-header-dropdown-item';
      item.innerHTML = icon + '<span>' + label + '</span>';
      item.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        menu.style.display = 'none';
        action();
      });
      return item;
    };

    // Copy
    menu.appendChild(makeItem('Copy code',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      () => {
        const doc = editorView.state.doc;
        const startLine = doc.lineAt(blockFrom);
        const endLine = doc.lineAt(blockTo);
        const codeFrom = startLine.to + 1;
        const codeTo = endLine.from > 0 ? endLine.from - 1 : endLine.from;
        if (codeFrom < codeTo) {
          navigator.clipboard?.writeText(doc.sliceString(codeFrom, codeTo));
        }
      }));

    // Delete
    menu.appendChild(makeItem('Delete block',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      () => {
        const doc = editorView.state.doc;
        let delFrom = blockFrom;
        let delTo = Math.min(blockTo, doc.length);
        if (delFrom > 0 && doc.sliceString(delFrom - 1, delFrom) === '\n') delFrom--;
        if (delTo < doc.length && doc.sliceString(delTo, delTo + 1) === '\n') delTo++;
        editorView.dispatch({
          changes: { from: delFrom, to: delTo, insert: '' },
          userEvent: 'delete.wysiwyg.delete-codeblock',
        });
      }));

    menuWrap.appendChild(menu);

    // Toggle menu on button click
    menuBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const isOpen = menu.style.display !== 'none';
      menu.style.display = isOpen ? 'none' : '';
      if (!isOpen) {
        // Close on outside click
        const close = (ev) => {
          if (!menuWrap.contains(ev.target)) {
            menu.style.display = 'none';
            document.removeEventListener('mousedown', close, true);
          }
        };
        // Defer so this mousedown doesn't immediately close it
        requestAnimationFrame(() => {
          document.addEventListener('mousedown', close, true);
        });
      }
    });

    wrapper.appendChild(menuWrap);

    return wrapper;
  }

  ignoreEvent(event) {
    // Let mousedown through so our buttons work, but ignore everything else
    return event.type !== 'mousedown';
  }
}

// ---------------------------------------------------------------------------
// Fence decorations plugin
// ---------------------------------------------------------------------------

const wysiwygFencePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
    }

    update(update) {
      const modeChanged =
        update.startState.facet(wysiwygModeFacet) !== update.state.facet(wysiwygModeFacet) ||
        update.startState.facet(sourceModeFacet) !== update.state.facet(sourceModeFacet);

      if (update.docChanged || update.viewportChanged || modeChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view) {
      if (!isWysiwygActive(view.state)) return Decoration.none;

      const decorations = [];
      const doc = view.state.doc;
      syntaxTree(view.state).iterate({
        from: view.viewport.from,
        to: view.viewport.to,
        enter: (node) => {
          if (node.name !== 'FencedCode') return;

          const startLine = doc.lineAt(node.from);
          const endLine = doc.lineAt(node.to);
          const firstText = startLine.text.trim();
          const lang = firstText.replace(/^`{3,}/, '').trim();

          decorations.push(
            Decoration.line({ class: 'cm-wysiwyg-code-fence-line cm-wysiwyg-code-fence-start' }).range(startLine.from),
            Decoration.replace({ widget: new CodeFenceHeaderWidget(lang, node.from, node.to) }).range(startLine.from, startLine.to),
          );
          // Closing fence — only add decorations if the end is distinct from the start
          if (endLine.from !== startLine.from) {
            decorations.push(
              Decoration.line({ class: 'cm-wysiwyg-code-fence-line cm-wysiwyg-code-fence-end' }).range(endLine.from),
              Decoration.replace({ widget: new CodeFenceCloseWidget() }).range(endLine.from, endLine.to),
            );
          }

          return false;
        },
      });

      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations }
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const wysiwygStyles = EditorView.theme({
  '.cm-md-wysiwyg-atomic': {
    pointerEvents: 'none',
  },

  // ---- Code block styling ----

  '.cm-wysiwyg-code-fence-line': {
    backgroundColor: 'color-mix(in srgb, var(--widget-surface, #f5f5f5) 85%, transparent)',
  },
  '.cm-wysiwyg-code-fence-line.cm-wysiwyg-code-fence-end': {
    fontSize: '0 !important',
    lineHeight: '0 !important',
    padding: '0 !important',
    minHeight: '0 !important',
    height: '4px !important',
    borderBottom: '1px solid color-mix(in srgb, var(--widget-border, #ddd) 60%, transparent)',
    borderRadius: '0 0 6px 6px',
    overflow: 'hidden',
  },
  '.cm-wysiwyg-code-fence-close': {
    display: 'none',
  },

  // Header bar
  '.cm-wysiwyg-code-header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    fontFamily: 'var(--widget-font-ui, system-ui, sans-serif)',
    fontSize: '12px',
    padding: '4px 10px',
    borderBottom: '1px solid color-mix(in srgb, var(--widget-border, #ddd) 50%, transparent)',
    userSelect: 'none',
  },

  // Language label
  '.cm-wysiwyg-code-header-lang': {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    color: 'var(--widget-text-muted, #777)',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '4px',
    transition: 'background 0.15s, color 0.15s',
  },
  '.cm-wysiwyg-code-header-lang:hover': {
    background: 'color-mix(in srgb, var(--widget-text-muted, #777) 12%, transparent)',
    color: 'var(--widget-text, #333)',
  },

  // Language inline input
  '.cm-wysiwyg-code-header-lang-input': {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.03em',
    fontFamily: 'var(--widget-font-ui, system-ui, sans-serif)',
    padding: '2px 8px',
    border: '1px solid var(--widget-border-accent, #aaa)',
    borderRadius: '4px',
    background: 'var(--widget-surface, #f5f5f5)',
    color: 'var(--widget-text, #333)',
    outline: 'none',
    width: '100px',
  },

  // Menu wrapper (positioned relative for dropdown)
  '.cm-wysiwyg-code-header-menu-wrap': {
    position: 'relative',
    display: 'inline-flex',
  },

  // Menu trigger button
  '.cm-wysiwyg-code-header-btn': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    border: 'none',
    background: 'transparent',
    color: 'var(--widget-text-muted, #999)',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
    padding: '0',
  },
  '.cm-wysiwyg-code-header-btn:hover': {
    background: 'color-mix(in srgb, var(--widget-text-muted, #777) 14%, transparent)',
    color: 'var(--widget-text, #333)',
  },

  // Dropdown menu
  '.cm-wysiwyg-code-header-dropdown': {
    position: 'absolute',
    top: '100%',
    right: '0',
    marginTop: '4px',
    minWidth: '160px',
    background: 'var(--widget-surface, #fff)',
    border: '1px solid var(--widget-border, #ddd)',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    padding: '4px',
    zIndex: '100',
    fontFamily: 'var(--widget-font-ui, system-ui, sans-serif)',
  },
  '.cm-wysiwyg-code-header-dropdown-item': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '6px 10px',
    border: 'none',
    background: 'transparent',
    color: 'var(--widget-text, #333)',
    fontSize: '12px',
    fontFamily: 'inherit',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  '.cm-wysiwyg-code-header-dropdown-item:hover': {
    background: 'color-mix(in srgb, var(--widget-text-muted, #777) 10%, transparent)',
  },
  '.cm-wysiwyg-code-header-dropdown-item:last-child:hover': {
    background: 'color-mix(in srgb, #ef4444 10%, transparent)',
    color: '#ef4444',
  },
});

// ---------------------------------------------------------------------------
// Transaction filter – block edits inside protected regions
// ---------------------------------------------------------------------------

function rangeTouchesProtected(changeFrom, changeTo, protectedFrom, protectedTo) {
  if (changeFrom === changeTo) {
    return changeFrom > protectedFrom && changeFrom < protectedTo;
  }
  return changeFrom < protectedTo && changeTo > protectedFrom;
}

const wysiwygTransactionFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  if (!isWysiwygActive(tr.startState)) return tr;
  if (!tr.annotation(Transaction.userEvent)) return tr;
  if (tr.isUserEvent('input.wysiwyg') || tr.isUserEvent('delete.wysiwyg')) return tr;

  const protectedRanges = collectProtectedRanges(tr.startState);

  let blocked = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (blocked) return;
    for (const range of protectedRanges) {
      if (rangeTouchesProtected(fromA, toA, range.from, range.to)) {
        blocked = true;
        break;
      }
    }
  });

  return blocked ? [] : tr;
});

// ---------------------------------------------------------------------------
// Inline formatting toggle helpers
// ---------------------------------------------------------------------------

function isEscapedDelimiter(lineText, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && lineText[i] === '\\'; i--) backslashes++;
  return (backslashes % 2) === 1;
}

function inlineMarkerAt(lineText, index) {
  if (index < 0 || index >= lineText.length) return null;
  if (isEscapedDelimiter(lineText, index)) return null;
  if (lineText.startsWith('**', index)) return '**';
  if (lineText.startsWith('~~', index)) return '~~';
  if (lineText[index] === '*') return '*';
  if (lineText[index] === '`') return '`';
  return null;
}

function inlineClassForMarker(marker) {
  return inlineClassForMark(syntaxToMark(marker, marker === '<u>' ? '</u>' : marker));
}

function parseInlineSequence(lineText, index = 0, endMarker = null, activeMarkers = new Set()) {
  const spans = [];
  let cursor = index;

  while (cursor < lineText.length) {
    if (endMarker && !isEscapedDelimiter(lineText, cursor) && lineText.startsWith(endMarker, cursor)) {
      return {
        spans,
        index: cursor + endMarker.length,
        closeStart: cursor,
        closed: true,
      };
    }

    const marker = inlineMarkerAt(lineText, cursor);
    if (!marker) {
      cursor++;
      continue;
    }

    // Inline code is atomic: find the next matching backtick and do not parse inside.
    if (marker === '`') {
      let close = cursor + 1;
      while (close < lineText.length) {
        if (lineText[close] === '`' && !isEscapedDelimiter(lineText, close)) break;
        close++;
      }

      if (close < lineText.length && close > cursor + 1) {
        spans.push({
          marker,
          start: cursor,
          end: close + 1,
          contentStart: cursor + 1,
          contentEnd: close,
          children: [],
        });
        cursor = close + 1;
        continue;
      }

      cursor += 1;
      continue;
    }

    // Prevent same-format nesting in the tolerant parser. The enclosing level
    // owns the next close marker for that delimiter type.
    if (activeMarkers.has(marker)) {
      cursor += marker.length;
      continue;
    }

    const nextActive = new Set(activeMarkers);
    nextActive.add(marker);
    const inner = parseInlineSequence(lineText, cursor + marker.length, marker, nextActive);

    if (inner.closed && inner.closeStart > cursor + marker.length) {
      spans.push({
        marker,
        start: cursor,
        end: inner.index,
        contentStart: cursor + marker.length,
        contentEnd: inner.closeStart,
        children: inner.spans,
      });
      cursor = inner.index;
      continue;
    }

    cursor += marker.length;
  }

  return {
    spans,
    index: cursor,
    closeStart: -1,
    closed: false,
  };
}

function parseInlineFormatting(lineText) {
  const model = getLineInlineModel(lineText, 0);
  return model.spans.map((span) => ({
    marker: markToSyntax(span.mark)?.open || '',
    start: span.from,
    end: span.to,
    contentStart: span.contentFrom,
    contentEnd: span.contentTo,
    openLength: span.openLength,
    closeLength: span.closeLength,
    children: [],
  }));
}

function visitInlineSpans(spans, visitor) {
  for (const span of spans) {
    visitor(span);
    if (span.children?.length) visitInlineSpans(span.children, visitor);
  }
}

/**
 * Find the delimited range (e.g. **…** or *…*) that contains `posInLine`.
 * Returns { start, end, contentStart, contentEnd } (offsets within line text) or null.
 */
function findDelimitedRange(lineText, posInLine, open, close) {
  return sharedFindDelimitedRange(lineText, posInLine, open, close);
}

function findEmptyDelimitedPairAtCursor(lineText, posInLine, open, close = open) {
  const before = posInLine - open.length;
  const after = posInLine + close.length;
  if (before < 0 || after > lineText.length) return null;
  if (lineText.slice(before, posInLine) === open && lineText.slice(posInLine, after) === close) {
    return {
      start: before,
      end: after,
      contentStart: posInLine,
      contentEnd: posInLine,
    };
  }
  return null;
}

function findDelimitedRangeCoveringSelection(lineText, selStartInLine, selEndInLine, open, close = open) {
  const probeStart = findDelimitedRange(lineText, selStartInLine, open, close);
  if (!probeStart) return null;
  if (probeStart.contentStart <= selStartInLine && probeStart.contentEnd >= selEndInLine) {
    return probeStart;
  }
  return null;
}

/**
 * Toggle inline formatting (bold / italic / inline code).
 *
 * Rich-text style behavior:
 * - empty selection outside same-format span -> start formatted typing (insert open+close, place cursor inside)
 * - empty selection inside same-format span -> exit that typing mode by moving cursor after the closing marker
 * - empty selection inside an empty open|close pair -> also move cursor after closing marker
 * - selection fully inside same-format span -> no-op (guard against double nesting)
 * - selection exactly matches the full content of same-format span -> unwrap
 * - otherwise wrap selection
 */
function toggleInlineFormat(view, open, close) {
  const mark = syntaxToMark(open, close || open);
  if (!mark) return false;
  return toggleInlineMark(view, mark);
}

// ---------------------------------------------------------------------------
// Backspace handler
// ---------------------------------------------------------------------------

/**
 * Find the FencedCode node that contains `pos`, if any.
 */
function findFencedCodeAt(state, pos) {
  let found = null;
  syntaxTree(state).iterate({
    from: Math.max(0, pos - 1),
    to: pos + 1,
    enter: (node) => {
      if (node.name === 'FencedCode' && node.from <= pos && node.to >= pos) {
        found = { from: node.from, to: node.to };
      }
    },
  });
  return found;
}

function backspaceWysiwyg(view) {
  const state = view.state;
  if (!isWysiwygActive(state)) return false;

  const sel = state.selection.main;
  if (!sel.empty) return false;

  const pos = sel.head;
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const text = line.text;

  // ── Code-block protection ──
  // If inside a fenced code block at the start of the first code line → block
  const fence = findFencedCodeAt(state, pos);
  if (fence) {
    const fenceStartLine = doc.lineAt(fence.from);
    const firstCodeLine = fenceStartLine.number + 1 <= doc.lines ? doc.line(fenceStartLine.number + 1) : null;
    if (firstCodeLine && pos === firstCodeLine.from) {
      // Block backspace – would escape into the fence header
      return true;
    }
  }

  // ── Heading backspace ──
  const headingMatch = text.match(/^(#{1,6})\s+/);
  if (headingMatch) {
    const contentStart = line.from + headingMatch[0].length;
    if (pos === contentStart) {
      // At the beginning of heading content
      if (line.number > 1) {
        const prev = doc.line(line.number - 1);
        if (prev.text.trim() === '') {
          // Previous line is empty → delete it, keep heading intact
          view.dispatch({
            changes: { from: prev.from, to: prev.to + 1, insert: '' },
            userEvent: 'delete.wysiwyg.heading-eat-blank',
          });
          return true;
        }
        // Previous line has content → merge
        const prevIsHeading = /^#{1,6}\s+/.test(prev.text);
        if (prevIsHeading) {
          // Previous line is also a heading → just delete the newline between them
          // The current heading content joins the previous heading (keeping previous heading's level)
          const headingContent = text.slice(headingMatch[0].length);
          view.dispatch({
            changes: { from: prev.to, to: line.to, insert: headingContent ? ' ' + headingContent : '' },
            selection: { anchor: prev.to },
            userEvent: 'delete.wysiwyg.merge-heading-up',
          });
          return true;
        }
        // Previous line is a paragraph → heading becomes paragraph, joins with prev
        const headingContent = text.slice(headingMatch[0].length);
        view.dispatch({
          changes: { from: prev.to, to: line.to, insert: headingContent ? ' ' + headingContent : '' },
          selection: { anchor: prev.to },
          userEvent: 'delete.wysiwyg.merge-heading-up',
        });
        return true;
      }
      // First line – just block, don't delete hashes
      return true;
    }
  }

  // ── List backspace ──
  const listMatch = text.match(/^(\s*)(?:[-+*]|\d+\.)\s+/);
  if (listMatch) {
    const contentStart = line.from + listMatch[0].length;
    if (pos === contentStart) {
      view.dispatch({
        changes: { from: line.from, to: contentStart, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'delete.wysiwyg.demote-list',
      });
      return true;
    }
  }

  // ── Blockquote backspace ──
  const quoteMatch = text.match(/^(\s*>\s?)+/);
  if (quoteMatch) {
    const contentStart = line.from + quoteMatch[0].length;
    if (pos === contentStart) {
      view.dispatch({
        changes: { from: line.from, to: contentStart, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'delete.wysiwyg.demote-quote',
      });
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Enter handler
// ---------------------------------------------------------------------------

function enterWysiwyg(view) {
  const state = view.state;
  if (!isWysiwygActive(state)) return false;

  const sel = state.selection.main;
  if (!sel.empty) return false;

  const pos = sel.head;
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const text = line.text;

  // ── Heading: Enter at end → new paragraph ──
  const headingMatch = text.match(/^(#{1,6})\s+/);
  if (headingMatch && pos === line.to) {
    view.dispatch({
      changes: { from: pos, insert: '\n' },
      selection: { anchor: pos + 1 },
      userEvent: 'input.wysiwyg.new-paragraph',
    });
    return true;
  }

  // ── List continuation ──
  const listMatch = text.match(/^(\s*)([-+*]|\d+\.)\s+/);
  if (listMatch) {
    const prefix = listMatch[0];
    const content = text.slice(prefix.length);
    if (content.trim() === '') {
      // Empty list item → exit list
      view.dispatch({
        changes: { from: line.from, to: line.from + prefix.length, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input.wysiwyg.exit-list',
      });
      return true;
    }
    const marker = listMatch[2];
    const nextPrefix = /\d+\./.test(marker)
      ? `${listMatch[1]}${Number.parseInt(marker, 10) + 1}. `
      : prefix;
    view.dispatch({
      changes: { from: pos, insert: `\n${nextPrefix}` },
      selection: { anchor: pos + 1 + nextPrefix.length },
      userEvent: 'input.wysiwyg.continue-list',
    });
    return true;
  }

  // ── Blockquote continuation ──
  const quoteMatch = text.match(/^(\s*>\s?)+/);
  if (quoteMatch) {
    const prefix = quoteMatch[0];
    const content = text.slice(prefix.length);
    if (content.trim() === '') {
      view.dispatch({
        changes: { from: line.from, to: line.from + prefix.length, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input.wysiwyg.exit-quote',
      });
      return true;
    }
    view.dispatch({
      changes: { from: pos, insert: `\n${prefix}` },
      selection: { anchor: pos + 1 + prefix.length },
      userEvent: 'input.wysiwyg.continue-quote',
    });
    return true;
  }

  // ── Fenced code: prevent Enter on fence lines ──
  const fencedCodeMatch = text.match(/^`{3,}/);
  if (fencedCodeMatch && text.slice(pos - line.from).trim() === '') {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Pending-format hider
//
// When typing inside **...**  or *...* or `...`, a trailing space or other
// character may cause the markdown parser to stop recognizing the markers
// as EmphasisMark nodes. In WYSIWYG mode we still want them hidden.
// This ViewPlugin scans the cursor line for paired markers that the tree
// missed and applies cm-md-hidden decorations to them.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pending-format plugin
//
// The CommonMark spec says **hello ** (space before closing **) is NOT valid
// emphasis. The Lezer parser follows this, so mid-typing the markers lose
// their StrongEmphasis/Emphasis tree status, causing bold/italic to flicker.
//
// We patch this in rendered modes: scan every visible line for paired markers
// the tree missed, and apply the formatting class while either hiding the
// markers (rendered/WYSIWYG) or muting them (source mode).
//
// Also auto-cleans empty marker pairs (e.g. ****) when the cursor leaves.
// ---------------------------------------------------------------------------

/**
 * Collect absolute positions of all inline formatting marker nodes the tree
 * already recognises on a given line range.
 */
function collectTreeMarks(state, from, to) {
  const marks = new Set();
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (
        node.name === 'EmphasisMark' ||
        node.name === 'CodeMark' ||
        node.name === 'StrikethroughMark'
      ) {
        for (let i = node.from; i < node.to; i++) marks.add(i);
      }
    },
  });
  return marks;
}

/**
 * Check whether the syntax tree already provides inline formatting coverage
 * for the range [from, to).
 */
function treeHasFormattingAt(state, from, to) {
  let found = false;
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (
        (
          node.name === 'StrongEmphasis' ||
          node.name === 'Emphasis' ||
          node.name === 'InlineCode' ||
          node.name === 'Strikethrough'
        ) &&
        node.from <= from && node.to >= to
      ) {
        found = true;
      }
    },
  });
  return found;
}

const wysiwygPendingFormatPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
      this.prevCursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
    }

    update(update) {
      const modeChanged =
        update.startState.facet(wysiwygModeFacet) !== update.state.facet(wysiwygModeFacet) ||
        update.startState.facet(sourceModeFacet) !== update.state.facet(sourceModeFacet);

      if (update.docChanged || update.selectionSet || update.viewportChanged || modeChanged) {
        // Auto-clean empty markers when cursor leaves a line (WYSIWYG only)
        if (isWysiwygActive(update.state) && update.selectionSet && !update.docChanged) {
          const curLine = update.state.doc.lineAt(update.state.selection.main.head).number;
          if (curLine !== this.prevCursorLine) {
            this.cleanEmptyMarkers(update.view, this.prevCursorLine);
          }
          this.prevCursorLine = curLine;
        } else if (update.docChanged && isWysiwygActive(update.state)) {
          this.prevCursorLine = update.state.doc.lineAt(update.state.selection.main.head).number;
        }

        this.decorations = this.build(update.view);
      }
    }

    /**
     * Remove empty marker pairs on a given line number.
     * Only removes truly empty/whitespace-only pairs where NEITHER the
     * opening nor closing marker is an EmphasisMark in the syntax tree
     * (which would mean it belongs to a real formatting span).
     */
    cleanEmptyMarkers(view, lineNumber) {
      const doc = view.state.doc;
      if (lineNumber < 1 || lineNumber > doc.lines) return;
      const line = doc.line(lineNumber);
      const text = line.text;

      // Collect all tree-recognised emphasis/code mark positions on this line
      const treeMark = collectTreeMarks(view.state, line.from, line.to);

      // Patterns that match empty pairs
      const emptyPatterns = [
        { re: /<u>(\s*)<\/u>/g, markerLen: 3, closeMarkerLen: 4 },
        { re: /\*\*(\s*)\*\*/g, markerLen: 2 },
        { re: /~~(\s*)~~/g, markerLen: 2 },
        { re: /(?<!\*)\*(\s*)\*(?!\*)/g, markerLen: 1 },
        { re: /`(\s*)`/g, markerLen: 1 },
      ];

      const changes = [];
      for (const { re, markerLen, closeMarkerLen = markerLen } of emptyPatterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          // Only whitespace (or nothing) between markers
          if (m[1].trim() !== '') continue;

          const absFrom = line.from + m.index;
          const absTo = absFrom + m[0].length;
          const openStart = absFrom;
          const closeStart = absTo - closeMarkerLen;

          // If either marker is tree-recognised, it belongs to real formatting — skip
          if (treeMark.has(openStart) || treeMark.has(closeStart)) continue;

          changes.push({ from: absFrom, to: absTo, insert: '' });
        }
      }

      if (changes.length > 0) {
        view.dispatch({
          changes,
          userEvent: 'delete.wysiwyg.auto-clean',
        });
      }
    }

    build(view) {
      const state = view.state;
      const isSource = state.facet(sourceModeFacet);
      const isWysiwyg = isWysiwygActive(state);
      const cursorLine = state.doc.lineAt(state.selection.main.head).number;

      const decorations = [];
      const { from: vpFrom, to: vpTo } = view.viewport;

      // Collect tree-recognised marker positions across viewport
      const treeMarks = collectTreeMarks(state, vpFrom, vpTo);

      const doc = state.doc;
      const startLine = doc.lineAt(vpFrom).number;
      const endLine = doc.lineAt(vpTo).number;

      for (let ln = startLine; ln <= endLine; ln++) {
        // In normal rendered mode, skip the cursor line — the renderer already
        // shows raw markers there as cm-md-marker (standard behavior).
        // In source mode and WYSIWYG mode, patch every visible line.
        if (!isSource && !isWysiwyg && ln === cursorLine) continue;

        const line = doc.line(ln);
        const text = line.text;
        const spans = parseInlineFormatting(text);

        visitInlineSpans(spans, (span) => {
          const cls = inlineClassForMarker(span.marker);
          if (!cls) return;

          const openFrom = line.from + span.start;
          const openTo = openFrom + span.openLength;
          const closeFrom = line.from + span.contentEnd;
          const closeTo = closeFrom + span.closeLength;
          const contentFrom = line.from + span.contentStart;
          const contentTo = line.from + span.contentEnd;
          const matchFrom = line.from + span.start;
          const matchTo = line.from + span.end;

          if (treeHasFormattingAt(state, matchFrom, matchTo)) return;
          if (treeMarks.has(openFrom) && treeMarks.has(closeFrom)) return;

          if (contentFrom < contentTo) {
            decorations.push(
              Decoration.mark({ class: cls }).range(contentFrom, contentTo)
            );
          }

          const markerClass = isSource ? 'cm-md-marker' : 'cm-md-hidden';

          if (!treeMarks.has(openFrom)) {
            decorations.push(
              Decoration.mark({ class: markerClass }).range(openFrom, openTo)
            );
          }
          if (!treeMarks.has(closeFrom)) {
            decorations.push(
              Decoration.mark({ class: markerClass }).range(closeFrom, closeTo)
            );
          }
        });
      }

      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations }
);

// ---------------------------------------------------------------------------
// Keymap
// ---------------------------------------------------------------------------

const wysiwygKeymap = keymap.of([
  { key: 'Backspace', run: backspaceWysiwyg },
  { key: 'Enter', run: enterWysiwyg },
  { key: 'Mod-b', run: (view) => toggleInlineMark(view, 'bold') },
  { key: 'Mod-i', run: (view) => toggleInlineMark(view, 'italic') },
  { key: 'Mod-u', run: (view) => toggleInlineMark(view, 'underline') },
  { key: 'Mod-`', run: (view) => toggleInlineMark(view, 'code') },
]);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { toggleInlineFormat, findDelimitedRange, findFencedCodeAt };

export function createWysiwygExtensions() {
  return [
    wysiwygAtomicPlugin,
    wysiwygFencePlugin,
    wysiwygPendingFormatPlugin,
    wysiwygTransactionFilter,
    wysiwygKeymap,
    wysiwygStyles,
  ];
}
