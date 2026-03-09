/**
 * Linked-table local editor state.
 *
 * Phase 1 uses this to reveal one linked table's raw markdown without forcing
 * the whole editor into global source mode.
 */

import { StateEffect, StateField } from '@codemirror/state';

export const revealLinkedTableMarkdownEffect = StateEffect.define();
export const hideLinkedTableMarkdownEffect = StateEffect.define();
export const clearLinkedTableMarkdownEffect = StateEffect.define();

function normalizeTableId(value) {
  const tableId = String(value || '').trim();
  return tableId || null;
}

export const linkedTableMarkdownState = StateField.define({
  create() {
    return new Set();
  },

  update(value, tr) {
    let next = value;

    for (const effect of tr.effects) {
      if (effect.is(clearLinkedTableMarkdownEffect)) {
        if (next.size > 0) next = new Set();
        continue;
      }

      if (effect.is(revealLinkedTableMarkdownEffect)) {
        const tableId = normalizeTableId(effect.value?.tableId ?? effect.value);
        if (tableId && !next.has(tableId)) {
          next = new Set(next);
          next.add(tableId);
        }
        continue;
      }

      if (effect.is(hideLinkedTableMarkdownEffect)) {
        const tableId = normalizeTableId(effect.value?.tableId ?? effect.value);
        if (tableId && next.has(tableId)) {
          next = new Set(next);
          next.delete(tableId);
        }
      }
    }

    return next;
  },
});

export function isLinkedTableMarkdownOpen(state, tableId) {
  const normalized = normalizeTableId(tableId);
  if (!normalized) return false;
  const revealed = state.field(linkedTableMarkdownState, false);
  return !!(revealed && revealed.has(normalized));
}

export default {
  linkedTableMarkdownState,
  revealLinkedTableMarkdownEffect,
  hideLinkedTableMarkdownEffect,
  clearLinkedTableMarkdownEffect,
  isLinkedTableMarkdownOpen,
};
