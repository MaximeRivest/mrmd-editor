/**
 * Shared inline formatting model.
 *
 * This module provides a tolerant inline parser plus helpers for caret/selection
 * semantics, segment rewriting, and serialization. It is intentionally more
 * forgiving than CommonMark so editing can stay stable while the user is in the
 * middle of typing malformed markdown.
 */

export const INLINE_MARK_ORDER = ['underline', 'strike', 'italic', 'bold', 'code'];

export const INLINE_MARK_SPECS = {
  underline: { mark: 'underline', open: '<u>', close: '</u>', kind: 'html' },
  strike: { mark: 'strike', open: '~~', close: '~~', kind: 'markdown' },
  bold: { mark: 'bold', open: '**', close: '**', kind: 'markdown' },
  italic: { mark: 'italic', open: '*', close: '*', kind: 'markdown' },
  code: { mark: 'code', open: '`', close: '`', kind: 'markdown' },
};

const INLINE_OPEN_ORDER = [
  INLINE_MARK_SPECS.underline,
  INLINE_MARK_SPECS.bold,
  INLINE_MARK_SPECS.strike,
  INLINE_MARK_SPECS.italic,
  INLINE_MARK_SPECS.code,
];

export function cloneMarkSet(value) {
  return new Set(value ? Array.from(value) : []);
}

export function markSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export function commonMarkSet(a, b) {
  const out = new Set();
  for (const value of a) {
    if (b.has(value)) out.add(value);
  }
  return out;
}

export function syntaxToMark(open, close = open) {
  for (const spec of Object.values(INLINE_MARK_SPECS)) {
    if (spec.open === open && spec.close === close) return spec.mark;
  }
  return null;
}

export function markToSyntax(mark) {
  return INLINE_MARK_SPECS[mark] || null;
}

export function inlineClassForMark(mark) {
  switch (mark) {
    case 'bold': return 'cm-md-bold';
    case 'italic': return 'cm-md-italic';
    case 'underline': return 'cm-md-underline';
    case 'strike': return 'cm-md-strikethrough';
    case 'code': return 'cm-md-inline-code';
    default: return null;
  }
}

function isEscapedMarkdownDelimiter(text, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return (backslashes % 2) === 1;
}

function matchesSpecToken(text, index, token, spec) {
  if (!text.startsWith(token, index)) return false;
  if (spec.kind === 'markdown') {
    return !isEscapedMarkdownDelimiter(text, index);
  }
  return true;
}

function matchOpenSpec(text, index) {
  for (const spec of INLINE_OPEN_ORDER) {
    if (!matchesSpecToken(text, index, spec.open, spec)) continue;
    if (spec.mark === 'italic' && text.startsWith('**', index)) continue;
    if (spec.mark === 'code' && text.startsWith('```', index)) continue;
    return spec;
  }
  return null;
}

function parseInlineNodes(text, index = 0, endSpec = null, activeMarks = new Set()) {
  const nodes = [];
  let cursor = index;
  let textStart = index;

  const flushText = (to) => {
    if (to <= textStart) return;
    nodes.push({
      type: 'text',
      from: textStart,
      to,
      text: text.slice(textStart, to),
    });
  };

  while (cursor < text.length) {
    if (endSpec && matchesSpecToken(text, cursor, endSpec.close, endSpec)) {
      flushText(cursor);
      return {
        nodes,
        index: cursor + endSpec.close.length,
        closeStart: cursor,
        closed: true,
      };
    }

    const spec = matchOpenSpec(text, cursor);
    if (!spec || activeMarks.has(spec.mark)) {
      cursor++;
      continue;
    }

    if (spec.mark === 'code') {
      let close = cursor + spec.open.length;
      while (close <= text.length - spec.close.length) {
        if (matchesSpecToken(text, close, spec.close, spec)) break;
        close++;
      }
      if (close <= text.length - spec.close.length) {
        flushText(cursor);
        const contentFrom = cursor + spec.open.length;
        const contentTo = close;
        nodes.push({
          type: 'mark',
          mark: spec.mark,
          from: cursor,
          to: close + spec.close.length,
          contentFrom,
          contentTo,
          children: contentFrom < contentTo
            ? [{ type: 'text', from: contentFrom, to: contentTo, text: text.slice(contentFrom, contentTo) }]
            : [],
        });
        cursor = close + spec.close.length;
        textStart = cursor;
        continue;
      }
      cursor++;
      continue;
    }

    const nextActive = new Set(activeMarks);
    nextActive.add(spec.mark);
    const inner = parseInlineNodes(text, cursor + spec.open.length, spec, nextActive);
    if (inner.closed && inner.closeStart >= cursor + spec.open.length) {
      flushText(cursor);
      nodes.push({
        type: 'mark',
        mark: spec.mark,
        from: cursor,
        to: inner.index,
        contentFrom: cursor + spec.open.length,
        contentTo: inner.closeStart,
        children: inner.nodes,
      });
      cursor = inner.index;
      textStart = cursor;
      continue;
    }

    cursor++;
  }

  flushText(text.length);
  return {
    nodes,
    index: text.length,
    closeStart: -1,
    closed: false,
  };
}

function buildTextSegments(nodes, lineFrom, activeMarks = new Set(), out = []) {
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.from < node.to) {
        out.push({
          from: lineFrom + node.from,
          to: lineFrom + node.to,
          text: node.text,
          marks: cloneMarkSet(activeMarks),
        });
      }
      continue;
    }

    const nextMarks = cloneMarkSet(activeMarks);
    nextMarks.add(node.mark);
    buildTextSegments(node.children || [], lineFrom, nextMarks, out);
  }
  return out;
}

function collectSpans(nodes, lineFrom, out = []) {
  for (const node of nodes) {
    if (node.type !== 'mark') continue;
    out.push({
      mark: node.mark,
      from: lineFrom + node.from,
      to: lineFrom + node.to,
      contentFrom: lineFrom + node.contentFrom,
      contentTo: lineFrom + node.contentTo,
      openLength: node.contentFrom - node.from,
      closeLength: node.to - node.contentTo,
      children: node.children || [],
    });
    collectSpans(node.children || [], lineFrom, out);
  }
  return out;
}

export function mergeAdjacentSegments(segments) {
  const out = [];
  for (const segment of segments) {
    if (!segment || segment.text.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev && prev.to === segment.from && markSetsEqual(prev.marks, segment.marks)) {
      prev.to = segment.to;
      prev.text += segment.text;
      continue;
    }
    out.push({
      from: segment.from,
      to: segment.to,
      text: segment.text,
      marks: cloneMarkSet(segment.marks),
    });
  }
  return out;
}

export function cloneSegments(segments) {
  return segments.map((segment) => ({
    ...segment,
    from: segment.from,
    to: segment.to,
    text: segment.text,
    marks: cloneMarkSet(segment.marks),
  }));
}

function stripBoundaryWhitespace(segment, side) {
  if (!segment || segment.text.length === 0 || segment.marks.size === 0 || segment.marks.has('code')) {
    return '';
  }

  if (side === 'leading') {
    const match = segment.text.match(/^[ \t]+/);
    if (!match) return '';
    segment.text = segment.text.slice(match[0].length);
    segment.from += match[0].length;
    return match[0];
  }

  const match = segment.text.match(/[ \t]+$/);
  if (!match) return '';
  segment.text = segment.text.slice(0, -match[0].length);
  segment.to -= match[0].length;
  return match[0];
}

export function normalizeWhitespaceSegments(segments) {
  const working = cloneSegments(segments).filter((segment) => segment.text.length > 0);
  if (working.length === 0) return working;

  const firstLeading = stripBoundaryWhitespace(working[0], 'leading');
  if (firstLeading) {
    working.unshift({
      from: working[0].from - firstLeading.length,
      to: working[0].from,
      text: firstLeading,
      marks: new Set(),
    });
  }

  const lastTrailing = stripBoundaryWhitespace(working[working.length - 1], 'trailing');
  if (lastTrailing) {
    const last = working[working.length - 1];
    working.push({
      from: last.to,
      to: last.to + lastTrailing.length,
      text: lastTrailing,
      marks: new Set(),
    });
  }

  for (let i = 0; i < working.length - 1; i++) {
    const left = working[i];
    const right = working[i + 1];
    if (!left || !right) continue;
    if (left.text.length === 0 || right.text.length === 0) continue;
    if (left.marks.has('code') || right.marks.has('code')) continue;

    const trailing = stripBoundaryWhitespace(left, 'trailing');
    const leading = stripBoundaryWhitespace(right, 'leading');
    if (!trailing && !leading) continue;

    const boundaryText = trailing + leading;
    if (!boundaryText) continue;
    const boundaryFrom = left.to;
    const boundaryMarks = commonMarkSet(left.marks, right.marks);
    working.splice(i + 1, 0, {
      from: boundaryFrom,
      to: boundaryFrom + boundaryText.length,
      text: boundaryText,
      marks: boundaryMarks,
    });
    i++;
  }

  return mergeAdjacentSegments(working.filter((segment) => segment.text.length > 0));
}

export function orderedMarks(marks) {
  return INLINE_MARK_ORDER.filter((mark) => marks.has(mark));
}

export function getLineInlineModel(lineText, lineFrom = 0) {
  const parsed = parseInlineNodes(lineText);
  const segments = mergeAdjacentSegments(buildTextSegments(parsed.nodes, lineFrom));
  const spans = collectSpans(parsed.nodes, lineFrom);
  return {
    nodes: parsed.nodes,
    segments,
    spans,
  };
}

export function visitInlineSpans(spans, visitor) {
  for (const span of spans) visitor(span);
}

export function findDelimitedRange(lineText, posInLine, open, close = open) {
  const mark = syntaxToMark(open, close);
  if (!mark) return null;
  const model = getLineInlineModel(lineText, 0);
  let found = null;

  for (const span of model.spans) {
    if (span.mark !== mark) continue;
    if (posInLine < span.contentFrom || posInLine > span.contentTo) continue;
    if (!found || ((span.contentTo - span.contentFrom) <= (found.contentTo - found.contentFrom))) {
      found = {
        start: span.from,
        end: span.to,
        contentStart: span.contentFrom,
        contentEnd: span.contentTo,
      };
    }
  }

  return found;
}

export function findInnermostSpanContaining(spans, pos, mark = null) {
  let found = null;
  for (const span of spans) {
    if (mark && span.mark !== mark) continue;
    if (pos < span.contentFrom || pos > span.contentTo) continue;
    if (!found || ((span.contentTo - span.contentFrom) <= (found.contentTo - found.contentFrom))) {
      found = span;
    }
  }
  return found;
}

export function getCaretInlineContext(state, pos) {
  const line = state.doc.lineAt(pos);
  const model = getLineInlineModel(line.text, line.from);
  const marksAtCaret = new Set();
  const spansAtCaret = [];
  const atStartOf = [];
  const atEndOf = [];
  const insideEmptyOf = [];
  const insideMiddleOf = [];

  for (const span of model.spans) {
    if (pos < span.contentFrom || pos > span.contentTo) continue;
    marksAtCaret.add(span.mark);
    spansAtCaret.push(span);
    if (span.contentFrom === span.contentTo && pos === span.contentFrom) {
      insideEmptyOf.push(span.mark);
    } else if (pos === span.contentFrom) {
      atStartOf.push(span.mark);
    } else if (pos === span.contentTo) {
      atEndOf.push(span.mark);
    } else {
      insideMiddleOf.push(span.mark);
    }
  }

  return {
    pos,
    line,
    model,
    marksAtCaret,
    spansAtCaret,
    insideCode: marksAtCaret.has('code'),
    boundary: { atStartOf, atEndOf, insideEmptyOf, insideMiddleOf },
  };
}

export function getSelectionInlineContext(state, from, to) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const doc = state.doc;
  const startLine = doc.lineAt(start).number;
  const endLine = doc.lineAt(Math.max(start, end)).number;
  const lineInfos = [];
  const coverage = new Map(INLINE_MARK_ORDER.map((mark) => [mark, 0]));
  let selectedTextLength = 0;
  let intersectsCode = false;

  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
    const line = doc.line(lineNumber);
    const model = getLineInlineModel(line.text, line.from);
    const lineFrom = Math.max(start, line.from);
    const lineTo = Math.min(end, line.to);
    lineInfos.push({ line, model, from: lineFrom, to: lineTo });

    for (const segment of model.segments) {
      const overlapFrom = Math.max(lineFrom, segment.from);
      const overlapTo = Math.min(lineTo, segment.to);
      if (overlapFrom >= overlapTo) continue;
      const overlapLen = overlapTo - overlapFrom;
      selectedTextLength += overlapLen;
      if (segment.marks.has('code')) intersectsCode = true;
      for (const mark of segment.marks) {
        coverage.set(mark, (coverage.get(mark) || 0) + overlapLen);
      }
    }
  }

  const fullyCoveredBy = new Set();
  const partiallyCoveredBy = new Set();
  for (const mark of INLINE_MARK_ORDER) {
    const len = coverage.get(mark) || 0;
    if (selectedTextLength > 0 && len === selectedTextLength) {
      fullyCoveredBy.add(mark);
    } else if (len > 0) {
      partiallyCoveredBy.add(mark);
    }
  }

  return {
    from: start,
    to: end,
    empty: start === end,
    selectedTextLength,
    fullyCoveredBy,
    partiallyCoveredBy,
    mixedMarks: new Set([...partiallyCoveredBy].filter((mark) => !fullyCoveredBy.has(mark))),
    intersectsCode,
    lines: lineInfos,
  };
}

export function splitSegmentsAtPositions(segments, positions) {
  const sorted = Array.from(new Set(positions)).sort((a, b) => a - b);
  let working = cloneSegments(segments);

  for (const pos of sorted) {
    const next = [];
    for (const segment of working) {
      if (pos <= segment.from || pos >= segment.to) {
        next.push(segment);
        continue;
      }
      const offset = pos - segment.from;
      next.push({
        from: segment.from,
        to: pos,
        text: segment.text.slice(0, offset),
        marks: cloneMarkSet(segment.marks),
      });
      next.push({
        from: pos,
        to: segment.to,
        text: segment.text.slice(offset),
        marks: cloneMarkSet(segment.marks),
      });
    }
    working = next;
  }

  return working;
}

export function serializeSegments(segments, trackPositions = [], options = {}) {
  const sortedSegments = segments.filter((segment) => segment.text.length > 0);

  const wantedPositions = Array.from(new Set(trackPositions)).sort((a, b) => a - b);
  const tracked = new Map(wantedPositions.map((pos) => [pos, null]));
  let trackIndex = 0;

  let out = '';
  let openMarks = [];
  let insertedCaret = null;

  const closeToCommonPrefix = (desired) => {
    let prefix = 0;
    while (
      prefix < openMarks.length &&
      prefix < desired.length &&
      openMarks[prefix] === desired[prefix]
    ) {
      prefix++;
    }
    for (let i = openMarks.length - 1; i >= prefix; i--) {
      out += INLINE_MARK_SPECS[openMarks[i]].close;
    }
    openMarks = openMarks.slice(0, prefix);
    for (let i = prefix; i < desired.length; i++) {
      out += INLINE_MARK_SPECS[desired[i]].open;
      openMarks.push(desired[i]);
    }
  };

  const mapBeforeBoundary = (boundaryPos) => {
    while (trackIndex < wantedPositions.length && wantedPositions[trackIndex] < boundaryPos) {
      if (tracked.get(wantedPositions[trackIndex]) == null) tracked.set(wantedPositions[trackIndex], out.length);
      trackIndex++;
    }
  };

  const mapAtBoundary = (boundaryPos) => {
    while (trackIndex < wantedPositions.length && wantedPositions[trackIndex] === boundaryPos) {
      if (tracked.get(wantedPositions[trackIndex]) == null) tracked.set(wantedPositions[trackIndex], out.length);
      trackIndex++;
    }
  };

  for (const segment of sortedSegments) {
    mapBeforeBoundary(segment.from);
    closeToCommonPrefix(orderedMarks(segment.marks));
    mapAtBoundary(segment.from);

    const startOut = out.length;
    out += segment.text;

    for (let i = trackIndex; i < wantedPositions.length; i++) {
      const pos = wantedPositions[i];
      if (pos <= segment.from || pos >= segment.to) break;
      if (tracked.get(pos) == null) tracked.set(pos, startOut + (pos - segment.from));
    }
    while (trackIndex < wantedPositions.length && wantedPositions[trackIndex] < segment.to) trackIndex++;
    mapAtBoundary(segment.to);

    if (segment.trackCaretAfter) {
      insertedCaret = out.length;
    }
  }

  closeToCommonPrefix([]);
  while (trackIndex < wantedPositions.length) {
    if (tracked.get(wantedPositions[trackIndex]) == null) tracked.set(wantedPositions[trackIndex], out.length);
    trackIndex++;
  }

  return {
    text: out,
    tracked,
    insertedCaret,
  };
}
