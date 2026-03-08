/**
 * Semantic inline formatting commands.
 */

import { ChangeSet } from '@codemirror/state';
import {
  cloneMarkSet,
  findInnermostSpanContaining,
  getCaretInlineContext,
  getSelectionInlineContext,
  markToSyntax,
  normalizeWhitespaceSegments,
  serializeSegments,
  splitSegmentsAtPositions,
  syntaxToMark,
} from './inline-model.js';
import {
  clearPendingInlineSplitEffect,
  getPendingInlineSplit,
  setPendingInlineSplitEffect,
} from './inline-state.js';

function clearPendingEffects(state) {
  return getPendingInlineSplit(state) ? [clearPendingInlineSplitEffect.of(null)] : [];
}

function addMarkToSet(marks, mark) {
  const next = cloneMarkSet(marks);
  next.add(mark);
  return next;
}

function removeMarkFromSet(marks, mark) {
  const next = cloneMarkSet(marks);
  next.delete(mark);
  return next;
}

function toggleMarkAtCaret(view, mark) {
  const state = view.state;
  const pos = state.selection.main.head;
  const pending = getPendingInlineSplit(state);

  if (pending && pending.pos === pos && pending.mark === mark) {
    view.dispatch({
      effects: clearPendingInlineSplitEffect.of(null),
      userEvent: 'input.inline.pending-cancel',
    });
    return true;
  }

  const ctx = getCaretInlineContext(state, pos);
  const sameSpan = findInnermostSpanContaining(ctx.model.spans, pos, mark);
  const effects = clearPendingEffects(state);

  if (ctx.insideCode && mark !== 'code') {
    if (effects.length > 0) {
      view.dispatch({ effects, userEvent: 'input.inline.noop' });
    }
    return true;
  }

  if (sameSpan) {
    if (sameSpan.contentFrom === sameSpan.contentTo && pos === sameSpan.contentFrom) {
      view.dispatch({
        changes: { from: sameSpan.from, to: sameSpan.to, insert: '' },
        selection: { anchor: sameSpan.from },
        effects,
        userEvent: 'input.inline.remove-empty',
        scrollIntoView: true,
      });
      return true;
    }

    if (pos === sameSpan.contentFrom) {
      view.dispatch({
        selection: { anchor: sameSpan.from },
        effects,
        userEvent: 'input.inline.exit-left',
      });
      return true;
    }

    if (pos === sameSpan.contentTo) {
      view.dispatch({
        selection: { anchor: sameSpan.to },
        effects,
        userEvent: 'input.inline.exit-right',
      });
      return true;
    }

    view.dispatch({
      selection: { anchor: pos },
      effects: [
        ...effects,
        setPendingInlineSplitEffect.of({
          pos,
          mark,
          marks: Array.from(removeMarkFromSet(ctx.marksAtCaret, mark)),
        }),
      ],
      userEvent: 'input.inline.pending-split',
    });
    return true;
  }

  const syntax = markToSyntax(mark);
  if (!syntax) return false;

  view.dispatch({
    changes: { from: pos, insert: syntax.open + syntax.close },
    selection: { anchor: pos + syntax.open.length },
    effects,
    userEvent: 'input.inline.start',
    scrollIntoView: true,
  });
  return true;
}

function applyMarkToSegment(segment, mark, action) {
  if (mark !== 'code' && segment.marks.has('code')) return segment;

  const next = {
    ...segment,
    marks: cloneMarkSet(segment.marks),
  };

  if (action === 'add') {
    next.marks.add(mark);
  } else {
    next.marks.delete(mark);
  }

  return next;
}

function toggleMarkOnSelection(view, mark) {
  const state = view.state;
  const selection = state.selection.main;
  const ctx = getSelectionInlineContext(state, selection.from, selection.to);
  if (ctx.empty || ctx.selectedTextLength === 0) {
    return toggleMarkAtCaret(view, mark);
  }

  const action = ctx.fullyCoveredBy.has(mark) ? 'remove' : 'add';
  const changes = [];
  const trackedOffsets = new Map();
  const originalAnchor = selection.anchor;
  const originalHead = selection.head;

  for (const info of ctx.lines) {
    if (info.from === info.to) continue;

    let segments = splitSegmentsAtPositions(info.model.segments, [info.from, info.to]);
    let changed = false;

    segments = segments.map((segment) => {
      if (segment.to <= info.from || segment.from >= info.to) return segment;
      const next = applyMarkToSegment(segment, mark, action);
      if (next !== segment) changed = true;
      return next;
    });

    const normalized = normalizeWhitespaceSegments(segments);
    const trackedPositions = [];
    if (originalAnchor >= info.line.from && originalAnchor <= info.line.to) trackedPositions.push(originalAnchor);
    if (originalHead >= info.line.from && originalHead <= info.line.to) trackedPositions.push(originalHead);
    const rendered = serializeSegments(normalized, trackedPositions);

    for (const [oldPos, newPos] of rendered.tracked.entries()) {
      trackedOffsets.set(oldPos, { lineFrom: info.line.from, offset: newPos });
    }

    if (changed || rendered.text !== info.line.text) {
      changes.push({ from: info.line.from, to: info.line.to, insert: rendered.text });
    }
  }

  if (changes.length === 0) {
    const effects = clearPendingEffects(state);
    if (effects.length > 0) view.dispatch({ effects, userEvent: 'input.inline.noop' });
    return true;
  }

  const changeSet = ChangeSet.of(changes, state.doc.length);
  const mappedAnchor = trackedOffsets.has(originalAnchor)
    ? changeSet.mapPos(trackedOffsets.get(originalAnchor).lineFrom, 1) + trackedOffsets.get(originalAnchor).offset
    : changeSet.mapPos(originalAnchor, -1);
  const mappedHead = trackedOffsets.has(originalHead)
    ? changeSet.mapPos(trackedOffsets.get(originalHead).lineFrom, 1) + trackedOffsets.get(originalHead).offset
    : changeSet.mapPos(originalHead, 1);

  view.dispatch({
    changes,
    selection: { anchor: mappedAnchor, head: mappedHead },
    effects: clearPendingEffects(state),
    userEvent: `input.inline.${action}`,
    scrollIntoView: true,
  });
  return true;
}

export function toggleInlineMark(view, mark) {
  if (!view?.state) return false;
  const selection = view.state.selection.main;
  if (selection.empty) return toggleMarkAtCaret(view, mark);
  return toggleMarkOnSelection(view, mark);
}

export function toggleInlineMarkFromSyntax(view, open, close = open) {
  const mark = syntaxToMark(open, close);
  if (!mark) return false;
  return toggleInlineMark(view, mark);
}

export function getActiveInlineMarks(view) {
  const state = view.state;
  const pending = getPendingInlineSplit(state);
  const selection = state.selection.main;

  if (selection.empty && pending && pending.pos === selection.head) {
    return new Set(pending.marks);
  }

  if (selection.empty) {
    return cloneMarkSet(getCaretInlineContext(state, selection.head).marksAtCaret);
  }

  return cloneMarkSet(getSelectionInlineContext(state, selection.from, selection.to).fullyCoveredBy);
}

export function getSelectionFormattingState(view) {
  const active = getActiveInlineMarks(view);
  const selection = view.state.selection.main;
  const mixed = selection.empty
    ? new Set()
    : getSelectionInlineContext(view.state, selection.from, selection.to).mixedMarks;

  return {
    bold: active.has('bold'),
    italic: active.has('italic'),
    underline: active.has('underline'),
    strike: active.has('strike'),
    strikethrough: active.has('strike'),
    code: active.has('code'),
    mixed: {
      bold: mixed.has('bold'),
      italic: mixed.has('italic'),
      underline: mixed.has('underline'),
      strike: mixed.has('strike'),
      strikethrough: mixed.has('strike'),
      code: mixed.has('code'),
    },
  };
}
