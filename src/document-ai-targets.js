/**
 * What an AI command acts on, and what goes along with it — pure functions
 * of the editor state, no DOM, no model.
 *
 * Where commands act is a place, found by the editor's place finder:
 *   {kind: 'prose', block: {from, to} | null}        a paragraph or heading
 *   {kind: 'code', language, bounds: {from, to},     code: a document's cell
 *    block: {from, to} | null, label}                 (bounds = block = its
 *                                                     code), or a source file
 *                                                     (bounds = the file,
 *                                                     block = the construct
 *                                                     at the cursor)
 *   {kind: 'none', reason}                           nothing to act on here
 * documentPlaceAt is the document editor's (Markdown with cells);
 * filePlaceFinder(scope, language) the whole-file editor's.
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

import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
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
 * Where a position is in a Markdown document, for AI commands: never the
 * YAML header or a result block; in a cell, its code; else prose.
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {(state, pos) => ({lang: string, code: string, from: number, to: number} | null)} cellAt
 *   the fenced block at pos (document-entry's codeBlockAt)
 */
export function documentPlaceAt(state, pos, cellAt) {
  const header = findFrontmatterRange(state.doc);
  if (header && pos >= header.from && pos <= header.to) {
    return { kind: 'none', reason: 'AI commands leave the document header alone' };
  }
  const cell = cellAt(state, pos);
  if (cell) {
    if (isOutputFence('```' + cell.lang)) return { kind: 'none', reason: 'a result block is rewritten by the next run' };
    const codeFrom = Math.min(state.doc.lineAt(cell.from).to + 1, state.doc.length);
    const code = { from: codeFrom, to: codeFrom + cell.code.length };
    const language = (cell.lang || 'text').toLowerCase();
    return { kind: 'code', language, bounds: code, block: code, label: language + ' cell' };
  }
  return { kind: 'prose', block: proseBlockAt(state, pos) };
}

// A block a command acts on without a selection is at most this long: past
// it, a smaller one is taken (the answer is slower and costlier than the
// person expects from "this block").
export const FILE_BLOCK_MAX = 12000;

/**
 * The place finder of a whole-file editor. `scope` 'code' (a source file:
 * the block is the construct at the cursor) or 'prose' (plain text: the
 * block is the paragraph); `language` names the code for the model.
 */
export function filePlaceFinder(scope, language = 'text') {
  if (scope === 'prose') return (state, pos) => ({ kind: 'prose', block: paragraphAround(state, pos) });
  return (state, pos) => {
    const block = codeBlockAround(state, pos);
    const label = block ? linesLabel(state, block) : 'at the cursor';
    return { kind: 'code', language, bounds: { from: 0, to: state.doc.length }, block, label };
  };
}

function linesLabel(state, range) {
  const a = state.doc.lineAt(range.from).number, b = state.doc.lineAt(Math.max(range.from, range.to)).number;
  return a === b ? 'line ' + a : `lines ${a}\u2013${b}`;
}

const isBlank = line => !line.text.trim();

/** The lines around pos up to the nearest blank lines, or null on a blank line. */
export function paragraphAround(state, pos) {
  const doc = state.doc;
  let first = doc.lineAt(pos);
  if (isBlank(first)) return null;
  let last = first;
  while (first.number > 1 && !isBlank(doc.line(first.number - 1))) first = doc.line(first.number - 1);
  while (last.number < doc.lines && !isBlank(doc.line(last.number + 1))) last = doc.line(last.number + 1);
  return { from: first.from, to: last.to };
}

/**
 * The code a command without a selection acts on in a source file: the
 * outermost syntax construct at the cursor that fits FILE_BLOCK_MAX (a
 * function, a class, a statement; in a huge one, the construct inside it),
 * whole lines, with the comment lines right above it. A construct on one
 * line (or a language without a real parser, whose tree holds only tokens)
 * gives way to the lines around it up to blank lines. Null on a blank line
 * between blocks.
 */
export function codeBlockAround(state, pos) {
  const doc = state.doc;
  const tree = ensureSyntaxTree(state, Math.min(doc.length, pos + 2000), 50) || syntaxTree(state);
  let range = null;
  for (const side of [1, -1]) {
    let node = tree.resolveInner(pos, side);
    const chain = [];
    for (; node && node.parent; node = node.parent) chain.push(node);
    // chain: innermost … child of the top node; take the outermost that fits.
    for (let i = chain.length - 1; i >= 0; i--) {
      const n = chain[i];
      // A node that ends after a line break (Python's bodies do) ends on the line before.
      const end = n.to > n.from && doc.lineAt(n.to).from === n.to ? n.to - 1 : n.to;
      const from = doc.lineAt(n.from).from, to = doc.lineAt(end).to;
      if (to - from <= FILE_BLOCK_MAX && n.from <= pos && n.to >= pos) { range = { from, to }; break; }
    }
    if (range) break;
  }
  if (range && doc.lineAt(range.from).number !== doc.lineAt(range.to).number) {
    // Comments right above belong to what they describe.
    let first = doc.lineAt(range.from);
    while (first.number > 1) {
      const above = doc.line(first.number - 1);
      if (isBlank(above) || !isCommentLine(tree, above)) break;
      first = above;
    }
    return { from: first.from, to: range.to };
  }
  const paragraph = paragraphAround(state, pos);
  if (paragraph && paragraph.to - paragraph.from <= FILE_BLOCK_MAX) return paragraph;
  return range || (isBlank(doc.lineAt(pos)) ? null : { from: doc.lineAt(pos).from, to: doc.lineAt(pos).to });
}

// A line that is only a comment: the syntax at its first non-space character is one.
function isCommentLine(tree, line) {
  const indent = line.text.length - line.text.trimStart().length;
  const node = tree.resolveInner(line.from + indent, 1);
  return /comment/i.test(node.name) && node.to >= line.to - (line.text.length - line.text.trimEnd().length);
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
 * @param {(state, pos) => object} placeAt  the editor's place finder
 * @returns {{error: string}
 *   | {scope: 'prose'|'code', kind: string,
 *      target: {from: number, to: number, text: string},
 *      before: string, after: string,
 *      block: {type: 'prose'|'code', language: string|null, from: number, to: number, text: string}}}
 */
export function resolveAiTarget(state, command, placeAt) {
  const doc = state.doc;
  const sel = state.selection.main;
  const place = placeAt(state, sel.head);
  if (place.kind === 'none') return { error: place.reason };
  if (command.scope !== 'any' && command.scope !== place.kind) {
    return { error: place.kind === 'code' ? 'this command is for prose, not code' : 'this command works on code' };
  }

  let from, to, block;
  if (place.kind === 'code') {
    const { bounds, language } = place;
    if (!sel.empty && (sel.from < bounds.from || sel.to > bounds.to)) return { error: 'the selection goes beyond this cell' };
    const head = Math.min(Math.max(sel.head, bounds.from), bounds.to);
    const line = doc.lineAt(head);
    const lineRange = { from: Math.max(line.from, bounds.from), to: Math.min(line.to, bounds.to) };
    // What goes along as "the block": the construct, else the cursor's line.
    const around = place.block || lineRange;
    block = { type: 'code', language, from: around.from, to: around.to };
    if (command.target === 'cursor') {
      from = to = head;
    } else if (!sel.empty) {
      ({ from, to } = sel);
    } else if (command.target === 'selection-or-line') {
      if (sel.head < bounds.from || sel.head > bounds.to) return { error: 'put the cursor on a line of code' };
      ({ from, to } = lineRange);
    } else if (place.block) {
      ({ from, to } = place.block);
    } else {
      return { error: 'put the cursor in the code, or select some' };
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
  if (place.kind === 'code') return selected || place.label;
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
