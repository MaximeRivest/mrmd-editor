/**
 * Inline editing state.
 *
 * Tracks pending caret splits for semantic inline formatting toggles. This lets
 * the editor keep the caret in place when the user toggles a mark off in the
 * middle of a span, and only materialize the split once actual text is typed.
 */

import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  cloneMarkSet,
  getLineInlineModel,
  serializeSegments,
  splitSegmentsAtPositions,
} from './inline-model.js';

export const setPendingInlineSplitEffect = StateEffect.define();
export const clearPendingInlineSplitEffect = StateEffect.define();

export const inlinePendingSplitField = StateField.define({
  create() {
    return null;
  },
  update(value, tr) {
    let next = value;

    for (const effect of tr.effects) {
      if (effect.is(setPendingInlineSplitEffect)) next = effect.value;
      if (effect.is(clearPendingInlineSplitEffect)) next = null;
    }

    if (next) {
      const sel = tr.state.selection.main;
      if (!sel.empty || sel.head !== next.pos) {
        next = null;
      } else if (tr.docChanged) {
        next = null;
      }
    }

    return next;
  },
});

export function getPendingInlineSplit(state) {
  return state.field(inlinePendingSplitField, false) || null;
}

function getSimpleInsertion(tr, pos) {
  let change = null;
  let count = 0;
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    count++;
    change = { fromA, toA, fromB, toB, inserted: inserted.toString() };
  });

  if (count !== 1 || !change) return null;
  if (change.fromA !== pos || change.toA !== pos) return null;
  if (!change.inserted || change.inserted.includes('\n')) return null;
  return change.inserted;
}

export const inlinePendingSplitFilter = EditorState.transactionFilter.of((tr) => {
  const pending = getPendingInlineSplit(tr.startState);
  if (!pending || !tr.docChanged) return tr;

  const startSel = tr.startState.selection.main;
  if (!startSel.empty || startSel.head !== pending.pos) return tr;

  const insertedText = getSimpleInsertion(tr, pending.pos);
  if (!insertedText) return tr;

  const line = tr.startState.doc.lineAt(pending.pos);
  const model = getLineInlineModel(line.text, line.from);
  const segments = splitSegmentsAtPositions(model.segments, [pending.pos]);
  const insertAt = segments.findIndex((segment) => segment.from >= pending.pos);
  const insertionIndex = insertAt === -1 ? segments.length : insertAt;
  segments.splice(insertionIndex, 0, {
    from: pending.pos,
    to: pending.pos + insertedText.length,
    text: insertedText,
    marks: cloneMarkSet(pending.marks),
    trackCaretAfter: true,
  });

  const rendered = serializeSegments(segments);
  const caretPos = line.from + (rendered.insertedCaret ?? rendered.text.length);

  return {
    changes: { from: line.from, to: line.to, insert: rendered.text },
    selection: { anchor: caretPos },
    effects: clearPendingInlineSplitEffect.of(null),
    userEvent: 'input.inline.pending-split',
    scrollIntoView: true,
  };
});

export function createInlineEditingExtensions() {
  return [
    inlinePendingSplitField,
    inlinePendingSplitFilter,
  ];
}
