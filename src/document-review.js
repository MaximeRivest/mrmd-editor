/**
 * Reviewing changes in the text: proposed changes are applied to the
 * document and shown against what the text was before — the old lines
 * struck through above the new ones, with Accept and Reject on each
 * change — until the person decides. The proposed text is ordinary
 * document text meanwhile: rendered like the rest, and editable, so a
 * change can be corrected before it is accepted.
 *
 * Built on @codemirror/merge's unified merge view. The review holds an
 * "original" document; every difference between it and the text is a
 * change to review. Accepting a change copies it into the original,
 * rejecting it copies the original back into the text.
 *
 * Only proposals are reviewed. A change becomes a proposal when it is
 * made through proposeChange(), or while a capture is open
 * (captureChanges(): an agent writing the file). Every other edit — the
 * person typing elsewhere, a collaborator, a cell's result being written —
 * is copied into the original as it happens, so it never shows as a
 * change to review. An edit inside a change under review is an edit of
 * that proposal.
 *
 * Each proposal remembers, per changed region (lines), the text before,
 * the text proposed and — once no change to review is left in the region
 * — the text the person kept. The host gets that as the proposal's
 * outcome (onResolved): what was accepted, rejected or edited, for
 * provenance and for improving what proposed it.
 *
 * Keys (REVIEW_KEYS): Alt-y accepts the change at the cursor, Alt-n
 * rejects it, Alt-Shift-y / Alt-Shift-n all of them, Alt-] / Alt-[ go to
 * the next / previous change. A panel under the text counts the changes
 * and carries the same actions.
 */

import { StateField, StateEffect, Annotation, Compartment, ChangeSet, EditorState, Prec, Facet } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, showPanel } from '@codemirror/view';
import {
  unifiedMergeView, getChunks, getOriginalDoc, originalDocChangeEffect, updateOriginalDoc,
  acceptChunk, rejectChunk, goToNextChunk, goToPreviousChunk, presentableDiff,
} from '@codemirror/merge';
import { formatKey } from './key-names.js';

/** The keys of a review, in CodeMirror notation. */
export const REVIEW_KEYS = Object.freeze({
  accept: 'Alt-y',
  reject: 'Alt-n',
  acceptAll: 'Alt-Shift-y',
  rejectAll: 'Alt-Shift-n',
  next: 'Alt-]',
  previous: 'Alt-[',
});

/** On a transaction whose changes are a proposal (proposeChange sets it). */
export const reviewProposal = Annotation.define();

// The host's callbacks: {onResolved(outcome), onChange(summary)}.
const reviewHost = Facet.define({ combine: values => values[values.length - 1] || {} });

const beginCapture = StateEffect.define();   // {id, meta}
const endCapture = StateEffect.define();     // id
const closeReview = StateEffect.define();    // null — the review is over
const dropProposal = StateEffect.define();   // id — its outcome was reported

/**
 * @typedef {{from: number, to: number, before: string, proposed: string}} Hunk
 *   a changed region: whole lines with their line breaks, [from, to) in the current text
 * @typedef {{id: string, meta: object, startedAt: number, hunks: Hunk[]}} Proposal
 * @typedef {{active: boolean, capture: null | {id: string, meta: object, startDoc: import('@codemirror/state').Text, changes: ChangeSet, startedAt: number},
 *   proposals: Proposal[]}} ReviewState
 */

// Line-aligned regions of what `changes` did to `startDoc` (giving `endDoc`):
// each changed range widened to whole lines, their line break included, on
// both sides; touching ones merged. Whole lines are what the merge view
// shows as one change and what Accept / Reject act on.
const lineEnd = (doc, pos) => Math.min(doc.length, doc.lineAt(pos).to + 1);
function hunksOf(changes, startDoc, endDoc) {
  const out = [];
  changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const a0 = startDoc.lineAt(fromA).from, a1 = lineEnd(startDoc, toA);
    const b0 = endDoc.lineAt(fromB).from, b1 = lineEnd(endDoc, toB);
    const last = out[out.length - 1];
    if (last && b0 <= last.to) {
      last.to = Math.max(last.to, b1);
      last.a1 = Math.max(last.a1, a1);
    } else {
      out.push({ from: b0, to: b1, a0, a1 });
    }
  });
  return out
    .map(h => ({ from: h.from, to: h.to, before: startDoc.sliceString(h.a0, h.a1), proposed: endDoc.sliceString(h.from, h.to) }))
    .filter(h => h.before !== h.proposed);
}

const reviewField = StateField.define({
  create: () => ({ active: false, capture: null, proposals: [] }),
  update(value, tr) {
    let { active, capture, proposals } = value;
    if (tr.docChanged) {
      if (capture) capture = { ...capture, changes: capture.changes.compose(tr.changes) };
      // Typing at the start of a region's first line belongs to it (the
      // merge view counts it in the change too); typing at the start of the
      // line after it does not. A replacement of the whole region (Reject)
      // maps its end to the end of the new text.
      proposals = proposals.map(p => ({
        ...p,
        hunks: p.hunks.map(h => {
          const from = tr.changes.mapPos(h.from, -1);
          return { ...h, from, to: Math.max(from, tr.changes.mapPos(h.to, -1)) };
        }),
      }));
    }
    for (const e of tr.effects) {
      if (e.is(beginCapture)) {
        active = true;
        capture = { id: e.value.id, meta: e.value.meta, startDoc: tr.startState.doc, changes: ChangeSet.empty(tr.startState.doc.length), startedAt: Date.now() };
        if (tr.docChanged) capture.changes = tr.changes; // a change made in the same transaction is part of it
      } else if (e.is(endCapture) && capture && capture.id === e.value) {
        const hunks = hunksOf(capture.changes, capture.startDoc, tr.state.doc);
        if (hunks.length) proposals = [...proposals, { id: capture.id, meta: capture.meta, startedAt: capture.startedAt, hunks }];
        capture = null;
      } else if (e.is(dropProposal)) {
        proposals = proposals.filter(p => p.id !== e.value);
      } else if (e.is(closeReview)) {
        active = false; capture = null; proposals = [];
      }
    }
    return active === value.active && capture === value.capture && proposals === value.proposals ? value : { active, capture, proposals };
  },
});

/** The review state of an editor state: {active, capture, proposals} (read-only). */
export function reviewState(state) {
  return state.field(reviewField, false) || { active: false, capture: null, proposals: [] };
}

// ─── keeping the person's own edits out of the review ───────────────

// A change in the text [from, to] (positions before it) touches a change
// under review when it overlaps its lines, or sits where lines were removed.
function touchesChunk(chunk, from, to) {
  if (chunk.fromB === chunk.toB) return from <= chunk.fromB && to >= chunk.fromB;
  return from < chunk.toB && to >= chunk.fromB;
}

// Edits that are not proposals are copied into the original, at the same
// place: outside changes under review the two texts align, shifted by the
// length difference of the changes before.
const keepOwnEditsOutOfReview = EditorState.transactionExtender.of(tr => {
  if (!tr.docChanged || tr.annotation(reviewProposal)) return null;
  const review = tr.startState.field(reviewField, false);
  if (!review || !review.active || review.capture) return null;
  const merge = getChunks(tr.startState);
  if (!merge) return null;
  const chunks = merge.chunks;
  const original = getOriginalDoc(tr.startState);
  const specs = [];
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    if (chunks.some(c => touchesChunk(c, from, to))) return; // an edit of a proposal
    let shift = 0;
    for (const c of chunks) {
      const before = c.fromB === c.toB ? c.fromB < from : c.toB <= from;
      if (!before) break;
      shift += (c.toA - c.fromA) - (c.toB - c.fromB);
    }
    specs.push({ from: from + shift, to: to + shift, insert: inserted });
  });
  if (!specs.length) return null;
  const valid = specs.every(s => s.from >= 0 && s.to <= original.length && s.from <= s.to);
  if (!valid) return null; // cannot happen with consistent chunks; never corrupt the original
  return { effects: originalDocChangeEffect(tr.startState, ChangeSet.of(specs, original.length)) };
});

// ─── outcomes ───────────────────────────────────────────────────────

function hunkDecision(h, final) {
  if (final === h.proposed) return 'accepted';
  if (final === h.before) return 'rejected';
  return 'edited';
}

function proposalDecision(hunks) {
  const kinds = new Set(hunks.map(h => h.decision));
  return kinds.size === 1 ? [...kinds][0] : 'mixed';
}

// Whether a change under review lies in the region [from, to).
function hunkPending(chunks, h) {
  return chunks.some(c => c.fromB === c.toB ? c.fromB >= h.from && c.fromB <= h.to : c.fromB < Math.max(h.to, h.from + 1) && c.toB > h.from);
}

let proposalSeq = 0;

// Watches the review: records each region's final text the moment nothing
// is left to review in it, reports a proposal once all of its regions are,
// and ends the review when no proposal is left.
const reviewWatcher = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.finals = new Map();   // proposal id → Map(hunk index → final text)
    this.reported = new Set();
    this.scheduled = false;
    this.destroyed = false;
  }

  update(update) {
    this.check(update.state);
    const host = update.state.facet(reviewHost);
    if (typeof host.onChange === 'function' && this.summaryChanged(update)) host.onChange(reviewSummary(update.state));
  }

  summaryChanged(update) {
    const a = getChunks(update.startState), b = getChunks(update.state);
    return update.startState.field(reviewField) !== update.state.field(reviewField) || (a && a.chunks.length) !== (b && b.chunks.length);
  }

  check(state) {
    const review = state.field(reviewField);
    if (!review.active) return;
    const merge = getChunks(state);
    const chunks = merge ? merge.chunks : [];
    const done = [];
    for (const p of review.proposals) {
      if (this.reported.has(p.id)) continue;
      let finals = this.finals.get(p.id);
      if (!finals) this.finals.set(p.id, finals = new Map());
      p.hunks.forEach((h, i) => {
        if (!finals.has(i) && !hunkPending(chunks, h)) finals.set(i, state.doc.sliceString(h.from, h.to));
      });
      if (finals.size === p.hunks.length) done.push(p);
    }
    for (const p of done) this.report(state, p, 'reviewed');
    const remaining = review.proposals.filter(p => !this.reported.has(p.id));
    if (done.length || (!remaining.length && !review.capture)) this.schedule();
  }

  report(state, p, how) {
    this.reported.add(p.id);
    const finals = this.finals.get(p.id) || new Map();
    const hunks = p.hunks.map((h, i) => {
      const final = finals.has(i) ? finals.get(i) : state.doc.sliceString(h.from, h.to);
      return { before: h.before, proposed: h.proposed, final, decision: finals.has(i) ? hunkDecision(h, final) : 'left' };
    });
    this.finals.delete(p.id);
    const outcome = { id: p.id, meta: p.meta, startedAt: p.startedAt, resolvedAt: Date.now(), how, hunks,
      decision: how === 'reviewed' ? proposalDecision(hunks) : 'left' };
    const host = state.facet(reviewHost);
    if (typeof host.onResolved === 'function') {
      try { host.onResolved(outcome); } catch (e) { console.error('review outcome', e); }
    }
  }

  // Drop reported proposals and, with none left, end the review — after
  // this update (an update cannot dispatch).
  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.destroyed) return;
      const view = this.view;
      const review = view.state.field(reviewField, false);
      if (!review || !review.active) return;
      const effects = review.proposals.filter(p => this.reported.has(p.id)).map(p => dropProposal.of(p.id));
      const left = review.proposals.filter(p => !this.reported.has(p.id));
      if (!left.length && !review.capture) effects.push(closeReview.of(null), reviewCompartment.reconfigure([]));
      if (effects.length) view.dispatch({ effects });
    });
  }

  // The editor goes away with changes still under review: they stay in the
  // text; their outcome says so.
  destroy() {
    this.destroyed = true;
    const state = this.view.state;
    const review = state.field(reviewField, false);
    if (!review) return;
    for (const p of review.proposals) if (!this.reported.has(p.id)) this.report(state, p, 'closed');
  }
});

/** What is under review now: {changes: count, proposals: [{id, meta}], capturing}. */
export function reviewSummary(state) {
  const review = state.field(reviewField, false);
  if (!review || !review.active) return { changes: 0, proposals: [], capturing: false };
  const merge = getChunks(state);
  return { changes: merge ? merge.chunks.length : 0, proposals: review.proposals.map(p => ({ id: p.id, meta: p.meta })), capturing: !!review.capture };
}

// ─── starting a review, proposing, capturing ───────────────────────

const reviewCompartment = new Compartment();

function mergeExtension(original) {
  return [
    unifiedMergeView({
      original,
      gutter: true,
      highlightChanges: true,
      syntaxHighlightDeletions: true,
      mergeControls: chunkButton,
      // Proposals come in whole: a line-based diff that gives up on huge
      // texts is still correct, only coarser.
      diffConfig: { scanLimit: 5000, timeout: 300 },
    }),
    EditorView.editorAttributes.of({ class: 'mrmd-review' }),
  ];
}

// Effects that open a capture, starting the review when none is going on
// (the original is the text as it is now).
function beginEffects(state, id, meta) {
  const review = state.field(reviewField, false);
  if (!review) throw new Error('mrmd-document: the editor has no review extension');
  const effects = [];
  if (!review.active) effects.push(reviewCompartment.reconfigure(mergeExtension(state.doc)));
  effects.push(beginCapture.of({ id, meta }));
  return effects;
}

/**
 * Open a capture: every change until end() is one proposal (an agent
 * writing this file). Changes made by anyone meanwhile are part of it.
 * @returns {{id: string, end(): boolean}} end() registers the proposal;
 *   false when nothing changed.
 */
export function captureChanges(view, meta = {}) {
  const review = view.state.field(reviewField);
  if (review.capture) throw new Error('mrmd-document: a capture is already open');
  const id = 'proposal-' + (++proposalSeq);
  view.dispatch({ effects: beginEffects(view.state, id, meta) });
  let open = true;
  return {
    id,
    end() {
      if (!open) return false;
      open = false;
      const current = view.state.field(reviewField, false);
      if (!current || !current.capture || current.capture.id !== id) return false;
      // Nothing proposed: a review opened for this alone closes (the watcher sees it).
      view.dispatch({ effects: endCapture.of(id) });
      return view.state.field(reviewField).proposals.some(p => p.id === id);
    },
  };
}

/**
 * One change as a proposal: {from, to, insert, meta, annotations, selection}.
 * Refused (returns null) over a change still under review: decide that one first.
 * @returns {string|null} the proposal's id
 */
export function proposeChange(view, { from, to, insert, meta = {}, annotations = [], selection, scrollIntoView = true }) {
  const merge = getChunks(view.state);
  if (merge && merge.chunks.some(c => touchesChunk(c, from, to))) return null;
  const capture = captureChanges(view, meta);
  view.dispatch({
    changes: { from, to, insert },
    annotations: [reviewProposal.of(true), ...[].concat(annotations)],
    ...(selection ? { selection } : {}),
    scrollIntoView,
  });
  capture.end();
  return capture.id;
}

/**
 * The smallest changes that turn the text into `text` (a character diff),
 * so the cursor, marks and a review keep their places.
 */
export function minimalChanges(state, text) {
  const current = state.doc.toString();
  if (current === text) return [];
  return presentableDiff(current, text, { scanLimit: 5000, timeout: 300 })
    .map(c => ({ from: c.fromA, to: c.toA, insert: text.slice(c.fromB, c.toB) }));
}

// ─── deciding ───────────────────────────────────────────────────────

function chunkList(state) {
  const merge = getChunks(state);
  return merge ? merge.chunks : [];
}

/** Accept every change under review. */
export function acceptAll(view) {
  const chunks = chunkList(view.state);
  if (!chunks.length) return false;
  const orig = getOriginalDoc(view.state), doc = view.state.doc;
  // As acceptChunk does, for all of them at once.
  const specs = chunks.map(c => {
    let insert = doc.sliceString(c.fromB, Math.max(c.fromB, c.toB - 1));
    if (c.fromB !== c.toB && c.toA <= orig.length) insert += view.state.lineBreak;
    return { from: c.fromA, to: Math.min(orig.length, c.toA), insert };
  });
  const changes = ChangeSet.of(specs, orig.length);
  view.dispatch({ effects: updateOriginalDoc.of({ doc: changes.apply(orig), changes }), userEvent: 'accept' });
  return true;
}

/** Reject every change under review: the text goes back to the original there. */
export function rejectAll(view) {
  const chunks = chunkList(view.state);
  if (!chunks.length) return false;
  const orig = getOriginalDoc(view.state), doc = view.state.doc;
  view.dispatch({
    changes: chunks.map(c => {
      let insert = orig.sliceString(c.fromA, Math.max(c.fromA, c.toA - 1));
      if (c.fromA !== c.toA && c.toB <= doc.length) insert += view.state.lineBreak;
      return { from: c.fromB, to: Math.min(doc.length, c.toB), insert };
    }),
    userEvent: 'revert',
  });
  return true;
}

const reviewing = state => reviewState(state).active && chunkList(state).length > 0;

// ─── look ───────────────────────────────────────────────────────────

function kbd(name) {
  const k = document.createElement('kbd');
  k.className = 'mrmd-review-kbd';
  k.textContent = formatKey(name);
  return k;
}

function reviewButton(label, what, key, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mrmd-review-btn' + (cls ? ' ' + cls : '');
  b.append(label);
  if (key) b.appendChild(kbd(key));
  b.title = key ? `${what} (${formatKey(key)})` : what;
  b.setAttribute('aria-label', b.title);
  // Keep the editor's focus and selection.
  b.addEventListener('mousedown', e => e.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}

// The Accept / Reject pair on each change (the merge view places it).
function chunkButton(type, action) {
  return type === 'accept'
    ? reviewButton('Accept', 'Keep this change', REVIEW_KEYS.accept, action, 'mrmd-review-accept')
    : reviewButton('Reject', 'Go back to the text before this change', REVIEW_KEYS.reject, action, 'mrmd-review-reject');
}

// A panel under the text while there is something to review.
function reviewPanel(view) {
  const dom = document.createElement('div');
  dom.className = 'mrmd-review-panel';
  dom.setAttribute('role', 'region');
  dom.setAttribute('aria-label', 'Changes to review');
  const label = document.createElement('span');
  label.className = 'mrmd-review-label';
  label.setAttribute('aria-live', 'polite');
  const actions = document.createElement('span');
  actions.className = 'mrmd-review-actions';
  const go = cmd => () => { cmd(view); view.focus(); };
  actions.append(
    reviewButton('‹', 'Previous change', REVIEW_KEYS.previous, go(v => goToPreviousChunk(v)), 'mrmd-review-step'),
    reviewButton('›', 'Next change', REVIEW_KEYS.next, go(v => goToNextChunk(v)), 'mrmd-review-step'),
    reviewButton('Accept all', 'Keep every change', REVIEW_KEYS.acceptAll, go(acceptAll), 'mrmd-review-accept'),
    reviewButton('Reject all', 'Go back to the text before every change', REVIEW_KEYS.rejectAll, go(rejectAll), 'mrmd-review-reject'),
  );
  dom.append(label, actions);
  const paint = state => {
    const { changes, proposals, capturing } = reviewSummary(state);
    const what = [...new Set(proposals.map(p => p.meta && p.meta.label).filter(Boolean))];
    label.textContent = '✦ ' + (capturing && !changes ? 'watching for changes…'
      : `${changes} change${changes === 1 ? '' : 's'} to review`) + (what.length ? ' · ' + what.join(' · ') : '');
    actions.hidden = !changes;
  };
  paint(view.state);
  return { dom, bottom: true, update: u => paint(u.state) };
}

const reviewPanelShown = showPanel.compute([reviewField], state => (reviewState(state).active ? reviewPanel : null));

let keyframesInstalled = false;
function installStyles() {
  if (keyframesInstalled || typeof document === 'undefined') return;
  keyframesInstalled = true;
  const style = document.createElement('style');
  style.dataset.mrmd = 'document-review';
  style.textContent = '@media (prefers-reduced-motion: reduce) { .mrmd-review-panel * { transition: none !important; } }';
  document.head.appendChild(style);
}

// Colors are tokens: a host without half-tones (e-ink) sets the two
// backgrounds to transparent; the bars, strike-through and underline still
// say what changed.
const reviewTheme = EditorView.baseTheme({
  '&.mrmd-review.cm-merge-b .cm-changedLine': {
    backgroundColor: 'var(--mrmd-review-inserted, color-mix(in srgb, var(--mrmd-accent, #2a2) 9%, transparent))',
    boxShadow: 'inset 2px 0 0 var(--mrmd-accent, #2a2)',
  },
  '&.mrmd-review.cm-merge-b .cm-changedText': {
    background: 'none', textDecoration: 'underline', textDecorationColor: 'var(--mrmd-accent, #2a2)', textDecorationThickness: '2px', textUnderlineOffset: '3px',
  },
  '&.mrmd-review .cm-deletedChunk': {
    position: 'relative', margin: '2px 0', padding: '22px 8px 4px', boxShadow: 'inset 2px 0 0 var(--mrmd-error, #d43)',
    backgroundColor: 'var(--mrmd-review-deleted, color-mix(in srgb, var(--mrmd-error, #d43) 7%, transparent))',
    color: 'var(--mrmd-fg-muted, inherit)', fontFamily: 'var(--md-marker-font, ui-monospace, monospace)', fontSize: '0.85em',
  },
  // A pure insertion has no old lines: only the buttons, on a thin rule.
  '&.mrmd-review .cm-deletedChunk:not(:has(.cm-deletedLine))': { padding: '20px 8px 0', backgroundColor: 'transparent', boxShadow: 'inset 0 -1px 0 var(--mrmd-accent, #2a2)' },
  '&.mrmd-review .cm-deletedChunk .cm-deletedLine del': { textDecoration: 'line-through', textDecorationColor: 'var(--mrmd-error, #d43)' },
  '&.mrmd-review .cm-deletedChunk .cm-deletedText': { background: 'none', color: 'var(--mrmd-error, inherit)' },
  '&.mrmd-review .cm-deletedChunk .cm-chunkButtons': { position: 'absolute', top: '2px', right: '4px', left: 'auto', display: 'flex', gap: '4px' },
  '&.mrmd-review .cm-changeGutter': { width: '3px', paddingLeft: '0' },
  '&.mrmd-review .cm-changedLineGutter': { background: 'var(--mrmd-accent, #2a2)' },
  '&.mrmd-review .cm-deletedLineGutter': { background: 'var(--mrmd-error, #d43)' },
  '.mrmd-review-btn': {
    font: '11px/1 var(--mrmd-font-ui, system-ui, sans-serif)', boxSizing: 'border-box', height: '19px', minHeight: '0', margin: '0',
    padding: '0 7px', display: 'inline-flex', alignItems: 'center', gap: '5px', fontStyle: 'normal', cursor: 'pointer',
    color: 'var(--mrmd-fg, currentColor)', background: 'var(--mrmd-button-bg, transparent)',
    border: '1px solid var(--mrmd-button-border, var(--mrmd-border, currentColor))', borderRadius: '3px',
  },
  '.mrmd-review-btn:hover, .mrmd-review-btn:focus-visible': { background: 'var(--mrmd-hover-bg, transparent)' },
  '.mrmd-review-btn.mrmd-review-accept': { borderColor: 'var(--mrmd-accent, currentColor)', color: 'var(--mrmd-accent, currentColor)' },
  '.mrmd-review-btn.mrmd-review-reject': { color: 'var(--mrmd-error, currentColor)' },
  '.mrmd-review-kbd': {
    font: '10px/1 var(--mrmd-font-ui, system-ui, sans-serif)', padding: '1px 3px', color: 'var(--mrmd-fg-muted, currentColor)',
    border: '1px solid var(--mrmd-border, currentColor)', borderRadius: '2px',
  },
  '.mrmd-review-panel': {
    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '6px 10px',
    font: '12px/1.4 var(--mrmd-font-ui, system-ui, sans-serif)', color: 'var(--mrmd-fg, inherit)',
    background: 'var(--mrmd-popup-bg, var(--mrmd-bg, Canvas))', borderTop: '1px solid var(--mrmd-accent, currentColor)',
  },
  '.mrmd-review-label': { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.mrmd-review-actions': { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  '.mrmd-review-actions[hidden]': { display: 'none' },
});

// ─── the extension ──────────────────────────────────────────────────

/**
 * Review of proposed changes. `host`: {onResolved(outcome), onChange(summary)}.
 * The outcome: {id, meta, startedAt, resolvedAt, how: 'reviewed' | 'closed',
 * decision: 'accepted' | 'rejected' | 'edited' | 'mixed' | 'left',
 * hunks: [{before, proposed, final, decision}]}.
 */
export function documentReview(host = {}) {
  installStyles();
  return [
    reviewHost.of(host),
    reviewField,
    reviewCompartment.of([]),
    keepOwnEditsOutOfReview,
    reviewWatcher,
    reviewPanelShown,
    reviewTheme,
    Prec.high(keymap.of([
      { key: REVIEW_KEYS.accept, run: view => reviewing(view.state) && acceptChunk(view) },
      { key: REVIEW_KEYS.reject, run: view => reviewing(view.state) && rejectChunk(view) },
      { key: REVIEW_KEYS.acceptAll, run: view => reviewing(view.state) && acceptAll(view) },
      { key: REVIEW_KEYS.rejectAll, run: view => reviewing(view.state) && rejectAll(view) },
      { key: REVIEW_KEYS.next, run: view => reviewing(view.state) && goToNextChunk(view) },
      { key: REVIEW_KEYS.previous, run: view => reviewing(view.state) && goToPreviousChunk(view) },
    ])),
  ];
}

/** The review's keys that act here, now, for a host's key help (or null). */
export function reviewKeyHelp(state) {
  if (!reviewing(state)) return null;
  const head = state.selection.main.head;
  const atChange = chunkList(state).some(c => c.fromB <= head && c.endB >= head);
  const keys = [];
  if (atChange) keys.push([[REVIEW_KEYS.accept], 'accept this change'], [[REVIEW_KEYS.reject], 'reject this change']);
  keys.push(
    [[REVIEW_KEYS.acceptAll], 'accept every change'],
    [[REVIEW_KEYS.rejectAll], 'reject every change'],
    [[REVIEW_KEYS.next, REVIEW_KEYS.previous], 'next / previous change'],
  );
  return { label: 'AI changes to review', keys };
}
