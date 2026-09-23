/**
 * What an AI command acts on, and what goes along with it — pure functions
 * of the editor state, no DOM, no model.
 *
 * A command declares
 *   scope:  'prose' | 'code' | 'any'   where it makes sense
 *   target: 'cursor'                   insert at the cursor
 *           'selection-or-block'       the selection, else the paragraph or
 *                                      heading (prose) / the cell's code (code)
 *           'selection-or-line'        the selection, else the cursor's line
 *   kind:   'insert' | 'replace'
 * and this module turns the cursor and selection into the exact range the
 * suggestion will replace, plus the surrounding text a model needs.
 *
 * AI commands never act on the YAML header (front matter) or on a result
 * block (```output): the first is configuration, the second is written by
 * runs and rewritten on the next one.
 */

import { syntaxTree } from '@codemirror/language';
import { findFrontmatterRange } from './markdown/block-decorations.js';
import { isOutputFence } from './rat-notebook.js';

export const AI_SCOPES = Object.freeze(['prose', 'code', 'any']);
export const AI_TARGETS = Object.freeze(['cursor', 'selection-or-block', 'selection-or-line']);
export const AI_KINDS = Object.freeze(['insert', 'replace']);

// Text around the target that goes along as context. The whole document
// goes too (the host decides how much of it a model gets).
const CONTEXT_BEFORE = 6000;
const CONTEXT_AFTER = 2000;

// Markdown nodes that are one prose block: the unit a command without a
// selection acts on.
const PROSE_BLOCK = /^(?:Paragraph|ATXHeading[1-6]|SetextHeading[12]|HTMLBlock)$/;

/**
 * Where a position is, for AI commands.
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {(state, pos) => ({lang: string, code: string, from: number, to: number} | null)} cellAt
 *   the fenced block at pos (document-entry's codeBlockAt)
 * @returns {{kind: 'prose', block: {from: number, to: number} | null}
 *   | {kind: 'code', cell: {from: number, to: number, codeFrom: number, codeTo: number, language: string}}
 *   | {kind: 'none', reason: string}}
 */
export function aiPlaceAt(state, pos, cellAt) {
  const header = findFrontmatterRange(state.doc);
  if (header && pos >= header.from && pos <= header.to) {
    return { kind: 'none', reason: 'AI commands leave the document header alone' };
  }
  const cell = cellAt(state, pos);
  if (cell) {
    if (isOutputFence('```' + cell.lang)) return { kind: 'none', reason: 'a result block is rewritten by the next run' };
    const codeFrom = Math.min(state.doc.lineAt(cell.from).to + 1, state.doc.length);
    return {
      kind: 'code',
      cell: { from: cell.from, to: cell.to, codeFrom, codeTo: codeFrom + cell.code.length, language: (cell.lang || 'text').toLowerCase() },
    };
  }
  return { kind: 'prose', block: proseBlockAt(state, pos) };
}

/** The paragraph or heading around pos, else its non-blank line, else null. */
export function proseBlockAt(state, pos) {
  // Side -1 first: a cursor at the very end of a paragraph belongs to it.
  for (const side of [-1, 1]) {
    for (let node = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
      if (PROSE_BLOCK.test(node.name)) return { from: node.from, to: node.to };
      if (node.name === 'Document') break;
    }
  }
  const line = state.doc.lineAt(pos);
  return line.text.trim() ? { from: line.from, to: line.to } : null;
}

/**
 * The range a command acts on, and the request a host needs to answer it.
 * @param {import('@codemirror/state').EditorState} state
 * @param {{id: string, scope: string, target: string, kind: string}} command
 * @param {Function} cellAt
 * @returns {{error: string}
 *   | {scope: 'prose'|'code', kind: string,
 *      target: {from: number, to: number, text: string},
 *      before: string, after: string,
 *      block: {type: 'prose'|'code', language: string|null, from: number, to: number, text: string}}}
 */
export function resolveAiTarget(state, command, cellAt) {
  const doc = state.doc;
  const sel = state.selection.main;
  const place = aiPlaceAt(state, sel.head, cellAt);
  if (place.kind === 'none') return { error: place.reason };
  if (command.scope !== 'any' && command.scope !== place.kind) {
    return { error: place.kind === 'code' ? 'this command is for prose, not code' : 'this command works inside a code cell' };
  }

  let from, to, block;
  if (place.kind === 'code') {
    const { codeFrom, codeTo, language } = place.cell;
    block = { type: 'code', language, from: codeFrom, to: codeTo };
    if (!sel.empty && (sel.from < codeFrom || sel.to > codeTo)) return { error: 'the selection goes beyond this cell' };
    const head = Math.min(Math.max(sel.head, codeFrom), codeTo);
    if (command.target === 'cursor') {
      from = to = head;
    } else if (!sel.empty) {
      ({ from, to } = sel);
    } else if (command.target === 'selection-or-line') {
      if (sel.head < codeFrom || sel.head > codeTo) return { error: 'put the cursor on a line of code' };
      const line = doc.lineAt(head);
      from = Math.max(line.from, codeFrom); to = Math.min(line.to, codeTo);
    } else {
      from = codeFrom; to = codeTo;
    }
  } else {
    const around = place.block || { from: doc.lineAt(sel.head).from, to: doc.lineAt(sel.head).to };
    block = { type: 'prose', language: null, from: around.from, to: around.to };
    if (command.target === 'cursor') {
      from = to = sel.head;
    } else if (!sel.empty) {
      ({ from, to } = sel);
    } else if (command.target === 'selection-or-line') {
      const line = doc.lineAt(sel.head);
      from = line.from; to = line.to;
    } else if (place.block) {
      ({ from, to } = place.block);
    } else {
      return { error: 'put the cursor in a paragraph, or select some text' };
    }
  }

  const text = doc.sliceString(from, to);
  if (command.kind === 'replace' && !text.trim()) return { error: 'there is no text here to change' };
  return {
    scope: place.kind,
    kind: command.kind,
    target: { from, to, text },
    before: doc.sliceString(Math.max(0, from - CONTEXT_BEFORE), from),
    after: doc.sliceString(to, Math.min(doc.length, to + CONTEXT_AFTER)),
    block: { ...block, text: doc.sliceString(block.from, block.to) },
  };
}

/** Words for the menu: what the commands will act on, from the place and selection. */
export function describeAiPlace(state, place) {
  const sel = state.selection.main;
  if (place.kind === 'none') return place.reason;
  const selected = sel.empty ? '' : `selection · ${sel.to - sel.from} characters`;
  if (place.kind === 'code') return selected || `${place.cell.language} cell`;
  return selected || (place.block ? 'this paragraph' : 'at the cursor');
}

/**
 * The model's answer, shaped into exactly what replaces the target. Three
 * deterministic repairs, each for a habit of language models, none a guess
 * about content:
 * - a wrapping code fence (```lang … ```) around an answer for text that is
 *   not itself fenced is removed;
 * - a replacement keeps the target's leading and trailing whitespace (a
 *   fixed paragraph must not eat the blank line after it);
 * - an insertion that starts by repeating the end of the text before the
 *   cursor (12 characters or more) loses the repeat.
 * @param {{kind: string, target: {text: string}, before: string}} request
 * @param {string} answer
 */
export function shapeAiAnswer(request, answer) {
  let text = String(answer ?? '');
  const fenced = text.match(/^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\1\s*$/);
  if (fenced && !/^\s*(`{3,}|~{3,})/.test(request.target.text)) text = fenced[2];

  if (request.kind === 'replace') {
    const original = request.target.text;
    const lead = original.match(/^\s*/)[0];
    const trail = original.slice(lead.length).match(/\s*$/)[0];
    return lead + text.trim() + trail;
  }

  const before = request.before;
  for (let k = Math.min(text.length, before.length, 400); k >= 12; k--) {
    if (before.endsWith(text.slice(0, k))) return text.slice(k);
  }
  return text;
}
