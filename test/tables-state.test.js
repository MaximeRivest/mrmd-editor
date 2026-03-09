import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';

import {
  linkedTableMarkdownState,
  revealLinkedTableMarkdownEffect,
  hideLinkedTableMarkdownEffect,
  isLinkedTableMarkdownOpen,
} from '../src/tables/state/linked-table-state.js';

test('linkedTableMarkdownState tracks per-table local markdown reveal state', () => {
  let state = EditorState.create({
    extensions: [linkedTableMarkdownState],
  });

  assert.equal(isLinkedTableMarkdownOpen(state, 'sales-summary'), false);

  state = state.update({
    effects: [revealLinkedTableMarkdownEffect.of({ tableId: 'sales-summary' })],
  }).state;
  assert.equal(isLinkedTableMarkdownOpen(state, 'sales-summary'), true);

  state = state.update({
    effects: [hideLinkedTableMarkdownEffect.of({ tableId: 'sales-summary' })],
  }).state;
  assert.equal(isLinkedTableMarkdownOpen(state, 'sales-summary'), false);
});
