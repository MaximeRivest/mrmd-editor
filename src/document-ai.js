/**
 * AI commands for the document editor: a command box at the cursor, and
 * the answer shown as a suggestion beside the text until it is accepted.
 *
 * The editor owns the surface — where a command acts, how a suggestion
 * looks, accepting, discarding, asking again — and the host lends the
 * model, the same way a host lends the diagram renderer:
 *
 *   createDocumentEditor(el, {
 *     ai: {
 *       commands: [{ id, label, hint?, keywords?, scope, target, kind, instruction? }],
 *       run(request, { signal, onText }) → Promise<{ text, model? }>,
 *       model?()        → the label of the model that answers (menu footer)
 *       available?()    → true, or the reason AI commands are off here
 *       beforeAccept?(event) → Promise|void   before an accepted suggestion is applied;
 *                                               event.result() is the document as it will be.
 *                                               A rejection abandons the accept (and is notified).
 *       onAccept?(event)                        after it was applied (provenance)
 *       notify?(message)                        a short message for the person
 *       escalate?: { label, run(text) }         hand a request to something bigger
 *     },
 *   })
 *
 * A suggestion is never document text until it is accepted: nothing of it
 * is saved, shared with collaborators, or put on the undo stack. Accepting
 * is one transaction (userEvent "input.ai", its own undo step) and is
 * refused if the text it replaces changed meanwhile. Editing inside the
 * suggested range discards the suggestion — it would describe text that
 * no longer exists; edits elsewhere only move it.
 *
 * One suggestion at a time: a new command replaces the current one, as in
 * every mainstream editor. Several answers to the same command ("Another")
 * are kept side by side and can be stepped through.
 *
 * Keys (AI_KEYS): Mod-j opens the command box. Tab accepts (with the
 * cursor in the suggested range; elsewhere Tab keeps its meaning), Escape
 * discards, Alt-] and Alt-[ step through the answers (Alt-] past the last
 * asks for another).
 *
 * Finding them without knowing them: a ✦ in the margin beside the
 * cursor's line opens the box on a click, and says what it is doing — at
 * rest, lit for a selection or an open box, pulsing while an answer is
 * written. Every button that has a key shows it, the box opened any other
 * way than its key names that key, and aiKeyHelp() tells the host which
 * keys act here, now (editor.keyHelp()).
 */

import { StateField, StateEffect, Annotation, Transaction, Facet, Prec, RangeSet } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin, keymap, showTooltip, gutter, GutterMarker } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { AI_SCOPES, AI_TARGETS, AI_KINDS, aiPlaceAt, describeAiPlace, resolveAiTarget, shapeAiAnswer } from './document-ai-targets.js';
import { wordDiff } from './word-diff.js';
import { formatKey } from './key-names.js';

/** The keys of AI commands, in CodeMirror notation. Labels spell them with formatKey. */
export const AI_KEYS = Object.freeze({
  open: 'Mod-j',
  accept: 'Tab',
  discard: 'Escape',
  next: 'Alt-]',
  previous: 'Alt-[',
});

/** On an accepted suggestion's transaction: {command, model, instruction}. */
export const aiEditAnnotation = Annotation.define();

// The host's configuration and the editor's cell finder, for the
// controller and the command box (they belong to the editor, not to a state).
const aiHostFacet = Facet.define({
  combine: values => values[values.length - 1] || { config: null, cellAt: () => null },
});

// Short answers without a line break read best inline, as ghost text; the
// rest reads best as a panel under the text.
const INLINE_MAX = 160;

// ─── host configuration ─────────────────────────────────────────────

/** Validate the `ai` option. Throws on a malformed one, like `diagrams`. */
export function aiConfig(option) {
  if (option == null) return null;
  if (typeof option !== 'object' || typeof option.run !== 'function' || !Array.isArray(option.commands)) {
    throw new TypeError('mrmd-document: `ai` must be an object with `commands` (array) and `run` (function)');
  }
  const ids = new Set();
  const commands = option.commands.map(c => {
    const bad = what => new TypeError(`mrmd-document: ai command ${JSON.stringify(c && c.id)}: ${what}`);
    if (!c || typeof c.id !== 'string' || !c.id) throw bad('needs an id');
    if (ids.has(c.id)) throw bad('duplicate id');
    ids.add(c.id);
    if (typeof c.label !== 'string' || !c.label) throw bad('needs a label');
    if (!AI_SCOPES.includes(c.scope)) throw bad('scope must be ' + AI_SCOPES.join(', '));
    if (!AI_TARGETS.includes(c.target)) throw bad('target must be ' + AI_TARGETS.join(', '));
    if (!AI_KINDS.includes(c.kind)) throw bad('kind must be ' + AI_KINDS.join(', '));
    return Object.freeze({
      id: c.id, label: c.label, hint: String(c.hint || ''),
      keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
      scope: c.scope, target: c.target, kind: c.kind, instruction: c.instruction === true,
    });
  });
  if (commands.filter(c => c.instruction).length > 1) throw new TypeError('mrmd-document: at most one ai command takes an instruction');
  const escalate = option.escalate && typeof option.escalate.run === 'function'
    ? { label: String(option.escalate.label || 'Hand it to an agent'), run: option.escalate.run } : null;
  return { ...option, commands, escalate };
}

// ─── state ──────────────────────────────────────────────────────────

const setMenu = StateEffect.define();        // {pos, byKey} | null — byKey: opened with AI_KEYS.open
const setOp = StateEffect.define();          // Operation | null
const patchAnswer = StateEffect.define();    // {opId, index, text?, model?, status?, error?}
const addAnswer = StateEffect.define();      // {opId}
const selectAnswer = StateEffect.define();   // {opId, index}

/**
 * @typedef {{text: string, model: string|null, status: 'loading'|'ready'|'error', error: string|null}} Answer
 * @typedef {{id: string, command: object, instruction: string, request: object,
 *   target: {from: number, to: number, text: string}, answers: Answer[], index: number}} Operation
 */
const loadingAnswer = () => ({ text: '', model: null, status: 'loading', error: null });

const aiState = StateField.define({
  create: () => ({ menu: null, op: null }),
  update(value, tr) {
    let { menu, op } = value;
    if (tr.docChanged) {
      if (menu) {
        const pos = tr.changes.mapPos(menu.pos);
        if (pos !== menu.pos) menu = { ...menu, pos };
      }
      if (op) {
        const { from, to } = op.target;
        op = tr.changes.touchesRange(from, to)
          ? null
          : { ...op, target: { ...op.target, from: tr.changes.mapPos(from, 1), to: tr.changes.mapPos(to, -1) } };
        if (op && op.target.to < op.target.from) op = null;
      }
    }
    for (const e of tr.effects) {
      if (e.is(setMenu)) menu = e.value;
      else if (e.is(setOp)) op = e.value;
      else if (op && e.value && e.value.opId === op.id) {
        if (e.is(patchAnswer)) {
          const answers = op.answers.slice();
          const { opId, index, ...patch } = e.value;
          if (answers[index]) answers[index] = { ...answers[index], ...patch };
          op = { ...op, answers };
        } else if (e.is(addAnswer)) {
          op = { ...op, answers: [...op.answers, loadingAnswer()], index: op.answers.length };
        } else if (e.is(selectAnswer)) {
          op = { ...op, index: Math.max(0, Math.min(e.value.index, op.answers.length - 1)) };
        }
      }
    }
    return menu === value.menu && op === value.op ? value : { menu, op };
  },
});

// ─── the suggestion on screen ───────────────────────────────────────

/** A key as it reads, for a label. */
function kbd(name) {
  const k = document.createElement('kbd');
  k.className = 'mrmd-ai-kbd';
  k.textContent = formatKey(name);
  return k;
}

/** The glyph of AI commands; `busy` makes it pulse (an answer is being written). */
function glyph(busy = false) {
  const g = document.createElement('span');
  g.className = 'mrmd-ai-glyph' + (busy ? ' mrmd-ai-glyph-busy' : '');
  g.textContent = '✦';
  g.setAttribute('aria-hidden', 'true');
  return g;
}

/**
 * A button that keeps the editor's selection. With `key`, the key that does
 * the same shows on the button and in its title: using the mouse teaches
 * the keyboard.
 */
function button(label, what, onClick, { cls = '', key = null } = {}) {
  const title = key ? `${what} (${formatKey(key)})` : what;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mrmd-ai-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  if (key) b.appendChild(kbd(key));
  b.title = title;
  b.setAttribute('aria-label', title);
  // Keep the editor's selection where it is.
  b.addEventListener('mousedown', e => e.preventDefault());
  b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); onClick(); });
  return b;
}

const controllerOf = view => view.plugin(aiController);

/** Ghost text at the cursor, for a short insertion. */
class GhostWidget extends WidgetType {
  constructor(op) { super(); this.op = op; this.answer = op.answers[op.index]; }
  eq(other) {
    return other.op.id === this.op.id && other.answer.text === this.answer.text && other.answer.status === this.answer.status;
  }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'mrmd-ai-ghost';
    wrap.dataset.state = this.answer.status;
    const text = document.createElement('span');
    text.className = 'mrmd-ai-ghost-text';
    text.textContent = this.answer.text;
    wrap.appendChild(text);
    const chip = document.createElement('span');
    chip.className = 'mrmd-ai-chip';
    const ctl = controllerOf(view);
    if (this.answer.status === 'loading') {
      chip.append(glyph(true), button('×', 'Stop', () => ctl?.discard(), { key: AI_KEYS.discard }));
    } else {
      chip.append(
        button('✓', 'Accept', () => ctl?.accept(), { cls: 'mrmd-ai-accept', key: AI_KEYS.accept }),
        button('×', 'Discard', () => ctl?.discard(), { key: AI_KEYS.discard }),
      );
    }
    wrap.appendChild(chip);
    return wrap;
  }
  ignoreEvent() { return true; }
}

/** A panel under the text: the proposal, a word diff for a replacement, actions. */
class ProposalWidget extends WidgetType {
  constructor(op, code) { super(); this.op = op; this.code = code; this.answer = op.answers[op.index]; }
  eq(other) {
    const a = other.answer, b = this.answer;
    return other.op.id === this.op.id && other.op.index === this.op.index && other.op.answers.length === this.op.answers.length
      && a.text === b.text && a.status === b.status && a.model === b.model && a.error === b.error;
  }
  toDOM(view) {
    const { op, answer } = this;
    const ctl = controllerOf(view);
    const panel = document.createElement('div');
    panel.className = 'mrmd-ai-panel';
    panel.dataset.state = answer.status;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'AI suggestion');

    const head = document.createElement('div');
    head.className = 'mrmd-ai-panel-head';
    const title = document.createElement('span');
    title.className = 'mrmd-ai-panel-title';
    title.append(glyph(answer.status === 'loading'), ' ' + op.command.label + (op.instruction ? ' — “' + op.instruction + '”' : ''));
    head.appendChild(title);
    const meta = document.createElement('span');
    meta.className = 'mrmd-ai-panel-meta';
    meta.textContent = [
      answer.status === 'loading' ? 'writing…' : answer.model || '',
      op.answers.length > 1 ? `${op.index + 1} / ${op.answers.length}` : '',
    ].filter(Boolean).join(' · ');
    head.appendChild(meta);
    panel.appendChild(head);

    const body = document.createElement('div');
    body.className = 'mrmd-ai-panel-body' + (this.code ? ' mrmd-ai-code' : '');
    if (answer.status === 'error') {
      body.classList.add('mrmd-ai-error');
      body.textContent = answer.error || 'The model did not answer.';
    } else if (op.command.kind === 'replace' && answer.status === 'ready') {
      const segments = wordDiff(op.target.text, answer.text);
      if (segments) {
        for (const seg of segments) {
          const span = document.createElement(seg.type === 'same' ? 'span' : seg.type === 'del' ? 'del' : 'ins');
          if (seg.type !== 'same') span.className = 'mrmd-ai-' + seg.type;
          span.textContent = seg.text;
          body.appendChild(span);
        }
      } else {
        body.textContent = answer.text;
      }
    } else {
      body.textContent = answer.text;
      if (answer.status === 'loading' && !answer.text) body.classList.add('mrmd-ai-waiting');
    }
    panel.appendChild(body);

    const foot = document.createElement('div');
    foot.className = 'mrmd-ai-panel-foot';
    if (op.answers.length > 1) {
      foot.append(
        button('‹', 'Previous answer', () => ctl?.step(-1), { cls: 'mrmd-ai-step', key: AI_KEYS.previous }),
        button('›', 'Next answer', () => ctl?.step(1), { cls: 'mrmd-ai-step', key: AI_KEYS.next }),
      );
    }
    if (answer.status === 'ready') foot.appendChild(button('Accept', 'Accept', () => ctl?.accept(), { cls: 'mrmd-ai-accept', key: AI_KEYS.accept }));
    // Alt-] asks again only from the last answer (before it, it steps on):
    // the key is shown only where it does what the button does.
    if (answer.status !== 'loading') {
      const last = op.index === op.answers.length - 1;
      foot.appendChild(button(answer.status === 'error' ? 'Try again' : 'Another', 'Ask for another answer', () => ctl?.another(), { key: last ? AI_KEYS.next : null }));
    }
    const stop = answer.status === 'loading' ? 'Stop' : 'Discard';
    foot.appendChild(button(stop, stop, () => ctl?.discard(), { key: AI_KEYS.discard }));
    panel.appendChild(foot);
    return panel;
  }
  ignoreEvent() { return true; }
}

function buildDecorations(state) {
  const { op } = state.field(aiState);
  if (!op) return Decoration.none;
  const answer = op.answers[op.index];
  const { from, to } = op.target;
  const ranges = [];
  if (op.command.kind === 'replace' && to > from) {
    const waiting = answer.status === 'loading' && !answer.text;
    ranges.push(Decoration.mark({ class: 'mrmd-ai-target ' + (waiting ? 'mrmd-ai-target-busy' : 'mrmd-ai-target-replaced') }).range(from, to));
  }
  const inline = op.command.kind === 'insert' && answer.status !== 'error'
    && op.answers.length === 1 && !answer.text.includes('\n') && answer.text.length <= INLINE_MAX;
  if (inline) {
    ranges.push(Decoration.widget({ widget: new GhostWidget(op), side: 1 }).range(from));
  } else {
    const lineEnd = state.doc.lineAt(to).to;
    ranges.push(Decoration.widget({ widget: new ProposalWidget(op, op.request.scope === 'code'), side: 1, block: true }).range(lineEnd));
  }
  return Decoration.set(ranges, true);
}

const aiDecorations = StateField.define({
  create: state => buildDecorations(state),
  update(deco, tr) {
    if (tr.startState.field(aiState) !== tr.state.field(aiState)) return buildDecorations(tr.state);
    return tr.docChanged ? deco.map(tr.changes) : deco;
  },
  provide: f => EditorView.decorations.from(f),
});

// ─── the command box ────────────────────────────────────────────────

/** Commands for the box, best first: a word of the label or a keyword starting with the query. */
function rankCommands(commands, query) {
  const q = query.trim().toLowerCase();
  if (!q) return commands.filter(c => !c.instruction);
  const words = c => [...c.label.toLowerCase().split(/[^\p{L}\p{N}]+/u), ...c.keywords.map(k => k.toLowerCase())].filter(Boolean);
  const scored = [];
  for (const c of commands) {
    if (c.instruction) continue;
    const ws = words(c);
    const score = c.label.toLowerCase().startsWith(q) ? 3 : ws.some(w => w.startsWith(q)) ? 2 : c.label.toLowerCase().includes(q) ? 1 : 0;
    if (score) scored.push([score, c]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, c]) => c);
}

class AiMenuView {
  constructor(view, ctl) {
    this.view = view;
    this.ctl = ctl;
    const state = view.state;
    this.place = aiPlaceAt(state, state.selection.main.head, ctl.cellAt);
    this.commands = this.place.kind === 'none' ? [] : ctl.config.commands.filter(c => c.scope === 'any' || c.scope === this.place.kind);
    this.instructionCommand = this.commands.find(c => c.instruction) || null;
    this.active = 0;

    const dom = this.dom = document.createElement('div');
    dom.className = 'mrmd-ai-menu';
    dom.setAttribute('role', 'dialog');
    dom.setAttribute('aria-label', 'AI commands');
    const head = document.createElement('div');
    head.className = 'mrmd-ai-menu-head';
    head.textContent = '✦ ' + describeAiPlace(state, this.place);
    const input = this.input = document.createElement('input');
    input.className = 'mrmd-ai-menu-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = this.instructionCommand ? 'Type a command, or say what to change…' : 'Type a command…';
    input.setAttribute('aria-label', input.placeholder);
    input.value = ctl.menuDraft;
    this.list = document.createElement('div');
    this.list.className = 'mrmd-ai-menu-list';
    this.list.setAttribute('role', 'listbox');
    dom.append(head, input, this.list, this.foot(state.field(aiState).menu));

    input.addEventListener('input', () => { ctl.menuDraft = input.value; this.active = 0; this.render(); });
    input.addEventListener('keydown', e => this.key(e));
    // Leaving the box closes it (focus moved elsewhere on the page). Not
    // while the editor updates — a box being replaced also loses focus —
    // and never for a box that was replaced.
    this.destroyed = false;
    dom.addEventListener('focusout', e => {
      if (dom.contains(e.relatedTarget)) return;
      setTimeout(() => {
        if (!this.destroyed && !dom.contains(document.activeElement)) ctl.closeMenu({ refocus: false });
      }, 0);
    });
    this.render();
  }

  /**
   * The model that answers and the box's keys. A box opened any other way
   * than its key (the ✦, a button) also names that key: the next time is
   * one keystroke.
   */
  foot(menu) {
    const foot = document.createElement('div');
    foot.className = 'mrmd-ai-menu-foot';
    const model = typeof this.ctl.config.model === 'function' ? this.ctl.config.model() : '';
    const parts = [];
    if (model) parts.push(['model: ' + model]);
    if (!menu || !menu.byKey) parts.push([kbd(AI_KEYS.open), ' opens this box']);
    parts.push([kbd('Enter'), ' runs'], [kbd('Escape'), ' closes']);
    parts.forEach((part, i) => foot.append(...(i ? [' · '] : []), ...part));
    return foot;
  }

  /** The rows for the current query. */
  items() {
    const query = this.input.value.trim();
    const rows = rankCommands(this.commands, query).map(c => ({ kind: 'command', command: c }));
    if (query && this.instructionCommand) {
      const row = { kind: 'instruction', command: this.instructionCommand, text: query };
      // A query that names no command is an instruction: first. One that
      // does stays an instruction option, after the commands.
      if (rows.length) rows.push(row); else rows.unshift(row);
    }
    if (this.ctl.config.escalate && query) rows.push({ kind: 'escalate', text: query });
    return rows;
  }

  render() {
    const rows = this.rows = this.items();
    this.active = Math.min(this.active, Math.max(0, rows.length - 1));
    this.list.textContent = '';
    if (this.place.kind === 'none' || !rows.length) {
      const empty = document.createElement('div');
      empty.className = 'mrmd-ai-menu-empty';
      empty.textContent = this.place.kind === 'none' ? this.place.reason : 'No command matches.';
      this.list.appendChild(empty);
      return;
    }
    rows.forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'mrmd-ai-menu-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(i === this.active));
      const label = document.createElement('span');
      label.className = 'mrmd-ai-menu-label';
      const hint = document.createElement('span');
      hint.className = 'mrmd-ai-menu-hint';
      if (row.kind === 'command') { label.textContent = row.command.label; hint.textContent = row.command.hint; }
      else if (row.kind === 'instruction') { label.textContent = row.command.label + ': “' + row.text + '”'; hint.textContent = row.command.hint; }
      else { label.textContent = this.ctl.config.escalate.label + ': “' + row.text + '”'; }
      item.append(label, hint);
      item.addEventListener('mousedown', e => e.preventDefault());
      item.addEventListener('click', () => this.choose(i));
      this.list.appendChild(item);
    });
  }

  key(e) {
    // The box owns its keys: none of them reaches the editor or the page.
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.ctl.closeMenu({ refocus: true }); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.rows.length) return;
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + this.rows.length) % this.rows.length;
      this.render();
    } else if (e.key === 'Enter') { e.preventDefault(); this.choose(this.active); }
  }

  choose(i) {
    const row = this.rows[i];
    if (!row) return;
    this.ctl.menuDraft = '';
    this.ctl.closeMenu({ refocus: true });
    if (row.kind === 'escalate') this.ctl.config.escalate.run(row.text);
    else this.ctl.run(row.command.id, row.kind === 'instruction' ? { instruction: row.text } : {});
  }

  // Focus with the caret after any draft: a box rebuilt while open (its
  // position moved) must not select what was typed, or the next key
  // would erase it.
  mount() {
    this.input.focus();
    const end = this.input.value.length;
    this.input.setSelectionRange(end, end);
  }

  destroy() { this.destroyed = true; }
}

// One tooltip object per menu state: CodeMirror keeps a tooltip's view
// while the object is the same, so the box is not rebuilt (losing focus)
// each time an answer streams in elsewhere.
const menuTooltips = new WeakMap();
const aiMenuTooltip = showTooltip.compute([aiState], state => {
  const { menu } = state.field(aiState);
  if (!menu) return null;
  let tooltip = menuTooltips.get(menu);
  if (!tooltip) {
    tooltip = { pos: menu.pos, above: false, create: view => new AiMenuView(view, controllerOf(view)) };
    menuTooltips.set(menu, tooltip);
  }
  return tooltip;
});

// ─── the controller: requests, answers, accept ──────────────────────

let opSeq = 0;

class AiController {
  constructor(view) {
    this.view = view;
    this.requests = new Map(); // "opId:index" → AbortController
    this.menuDraft = '';
    this.accepting = false;
  }

  get config() { return this.view.state.facet(aiHostFacet).config; }
  get cellAt() { return this.view.state.facet(aiHostFacet).cellAt; }

  update(update) {
    // An operation that went away (discarded, stale, replaced) stops asking.
    const before = update.startState.field(aiState).op;
    const after = update.state.field(aiState).op;
    if (before && (!after || after.id !== before.id)) this.abort(before.id);
  }

  destroy() { for (const c of this.requests.values()) c.abort(); this.requests.clear(); }

  notify(message) {
    const { notify } = this.config;
    if (typeof notify === 'function') notify(message);
  }

  unavailable() {
    if (this.view.state.readOnly) return 'the document is read-only';
    const { available } = this.config;
    const answer = typeof available === 'function' ? available() : true;
    return answer === true ? null : String(answer || 'AI commands are off');
  }

  /** Open the command box at the cursor. `byKey`: opened with AI_KEYS.open (the box then does not teach it). */
  openMenu({ byKey = false } = {}) {
    const reason = this.unavailable();
    if (reason) { this.notify(reason); return false; }
    this.view.dispatch({ effects: setMenu.of({ pos: this.view.state.selection.main.head, byKey }) });
    return true;
  }

  closeMenu({ refocus }) {
    if (!this.view.state.field(aiState).menu) return;
    this.view.dispatch({ effects: setMenu.of(null) });
    if (refocus) this.view.focus();
  }

  /** Run a command on the current selection or cursor. */
  run(commandId, { instruction = '' } = {}) {
    const reason = this.unavailable();
    if (reason) { this.notify(reason); return false; }
    const command = this.config.commands.find(c => c.id === commandId);
    if (!command) { this.notify('no AI command “' + commandId + '”'); return false; }
    const text = String(instruction).trim();
    if (command.instruction && !text) { this.notify('say what to change'); return false; }
    const state = this.view.state;
    const resolved = resolveAiTarget(state, command, this.cellAt);
    if (resolved.error) { this.notify(resolved.error); return false; }
    const op = {
      id: 'ai-' + (++opSeq),
      command,
      instruction: command.instruction ? text : '',
      target: resolved.target,
      request: {
        command: command.id,
        instruction: command.instruction ? text : '',
        ...resolved,
        document: state.doc.toString(),
      },
      answers: [loadingAnswer()],
      index: 0,
    };
    this.view.dispatch({ effects: [setMenu.of(null), setOp.of(op)] });
    this.ask(op, 0);
    return true;
  }

  /** Ask the host for answer `index` of `op`, streaming it in. */
  ask(op, index) {
    const key = op.id + ':' + index;
    const controller = new AbortController();
    this.requests.set(key, controller);
    // Streamed text is redrawn at most once per frame.
    let pending = null, frame = 0;
    const flush = () => {
      frame = 0;
      if (pending === null || controller.signal.aborted) return;
      const text = pending;
      pending = null;
      this.view.dispatch({ effects: patchAnswer.of({ opId: op.id, index, text }) });
    };
    const onText = text => {
      if (controller.signal.aborted) return;
      pending = String(text ?? '');
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const settle = patch => {
      cancelAnimationFrame(frame);
      this.requests.delete(key);
      if (!controller.signal.aborted) this.view.dispatch({ effects: patchAnswer.of({ opId: op.id, index, ...patch }) });
    };
    Promise.resolve()
      .then(() => this.config.run(op.request, { signal: controller.signal, onText }))
      .then(result => {
        const text = shapeAiAnswer(op.request, result && result.text);
        const model = result && result.model ? String(result.model) : null;
        if (!text.trim()) settle({ status: 'error', model, error: op.command.kind === 'insert' ? 'The model had nothing to add here.' : 'The model returned no text.' });
        else if (op.command.kind === 'replace' && text === op.target.text) settle({ status: 'error', model, error: 'The model found nothing to change.' });
        else settle({ status: 'ready', text, model, error: null });
      })
      .catch(error => settle({ status: 'error', error: error && error.message ? error.message : String(error) }));
  }

  abort(opId) {
    for (const [key, c] of this.requests) {
      if (key.startsWith(opId + ':')) { c.abort(); this.requests.delete(key); }
    }
  }

  current() {
    const { op } = this.view.state.field(aiState);
    return op ? { op, answer: op.answers[op.index] } : null;
  }

  discard() {
    if (!this.view.state.field(aiState).op) return false;
    this.view.dispatch({ effects: setOp.of(null) });
    return true;
  }

  /** Another answer to the same command, on the same text. */
  another() {
    const cur = this.current();
    if (!cur || cur.answer.status === 'loading') return false;
    const { op } = cur;
    // Reuse a failed slot rather than keeping the failure in the list.
    if (cur.answer.status === 'error') {
      this.view.dispatch({ effects: patchAnswer.of({ opId: op.id, index: op.index, ...loadingAnswer() }) });
      this.ask(op, op.index);
    } else {
      this.view.dispatch({ effects: addAnswer.of({ opId: op.id }) });
      this.ask(op, op.answers.length);
    }
    return true;
  }

  /** Step through the answers; past the last one, ask for another. */
  step(delta) {
    const cur = this.current();
    if (!cur) return false;
    const index = cur.op.index + delta;
    if (index >= cur.op.answers.length) return this.another();
    if (index < 0) return false;
    this.view.dispatch({ effects: selectAnswer.of({ opId: cur.op.id, index }) });
    return true;
  }

  /** Apply the shown answer: one transaction, its own undo step. */
  async accept() {
    const cur = this.current();
    if (!cur || cur.answer.status !== 'ready' || this.accepting) return false;
    const { op, answer } = cur;
    const view = this.view;
    const event = {
      command: op.command.id, label: op.command.label, instruction: op.instruction, model: answer.model,
      scope: op.request.scope, from: op.target.from, to: op.target.to, replaced: op.target.text, text: answer.text,
      /** The whole document as accepting would leave it, from the state now (null once the suggestion is gone). */
      result() {
        const now = view.state.field(aiState).op;
        if (!now || now.id !== op.id) return null;
        return view.state.doc.sliceString(0, now.target.from) + answer.text + view.state.doc.sliceString(now.target.to);
      },
    };
    this.accepting = true;
    try {
      if (typeof this.config.beforeAccept === 'function') {
        try { await this.config.beforeAccept(event); }
        catch (error) {
          // The host could not prepare (saving, bookkeeping): do not apply.
          this.notify(error && error.message ? error.message : String(error));
          return false;
        }
      }
      // The host's work was asynchronous: accept only what is still shown,
      // over text that is still what the answer was written for.
      const now = this.view.state.field(aiState).op;
      if (!now || now.id !== op.id || now.index !== op.index) return false;
      const { from, to, text: original } = now.target;
      if (this.view.state.doc.sliceString(from, to) !== original) {
        this.view.dispatch({ effects: setOp.of(null) });
        this.notify('the text changed, so the suggestion was dropped');
        return false;
      }
      this.view.dispatch({
        changes: { from, to, insert: answer.text },
        selection: { anchor: from + answer.text.length },
        effects: setOp.of(null),
        annotations: [
          aiEditAnnotation.of({ command: op.command.id, model: answer.model, instruction: op.instruction }),
          Transaction.userEvent.of('input.ai'),
          isolateHistory.of('full'),
        ],
        scrollIntoView: true,
      });
      if (typeof this.config.onAccept === 'function') this.config.onAccept({ ...event, from, to: from + answer.text.length });
      return true;
    } finally {
      this.accepting = false;
    }
  }

  /** Tab accepts when the cursor is in the suggested range. */
  acceptAtCursor() {
    const cur = this.current();
    if (!cur || cur.answer.status !== 'ready') return false;
    const head = this.view.state.selection.main.head;
    if (head < cur.op.target.from || head > cur.op.target.to) return false;
    void this.accept();
    return true;
  }
}

const aiController = ViewPlugin.fromClass(AiController);

// ─── the spark: AI commands, beside the cursor's line ───────────────
//
// A ✦ in its own narrow gutter, on the line of the cursor, while the
// editor has focus and AI commands can act there. In the margin, not in
// the text: it never moves a character, covers one, or stands between
// two for the cursor. A click opens the command box. Its look says what
// is happening here:
//   rest       faint — commands are available
//   selection  lit   — there is a selection to act on
//   open       lit   — the command box is open
//   busy       pulsing — an answer for the text at the cursor is being written
//   ready      lit   — that answer is ready (the cursor is on it: Tab accepts)
//   error      in the error color — that command failed

function sparkTitle(mode) {
  switch (mode) {
    case 'busy': return `An AI answer is being written here (${formatKey(AI_KEYS.discard)} stops it)`;
    case 'ready': return `A suggestion is ready: ${formatKey(AI_KEYS.accept)} accepts, ${formatKey(AI_KEYS.discard)} discards`;
    case 'error': return `The AI command failed: ${formatKey(AI_KEYS.next)} tries again`;
    case 'selection': return `AI commands for the selection (${formatKey(AI_KEYS.open)})`;
    default: return `AI commands (${formatKey(AI_KEYS.open)})`;
  }
}

class SparkMarker extends GutterMarker {
  constructor(mode) { super(); this.mode = mode; }
  eq(other) { return other.mode === this.mode; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'mrmd-ai-spark';
    el.dataset.mode = this.mode;
    el.textContent = '✦';
    el.title = sparkTitle(this.mode);
    // A pointer's way to the box. The keyboard has AI_KEYS.open (named by
    // the host's key help); a screen reader need not read a margin glyph.
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

const sparkMarkerOf = Object.fromEntries(['rest', 'selection', 'open', 'busy', 'ready', 'error'].map(m => [m, new SparkMarker(m)]));

/** The suggestion the cursor is on (the range Tab accepts from), or null. */
function opAtCursor(state) {
  const { op } = state.field(aiState);
  const head = state.selection.main.head;
  return op && head >= op.target.from && head <= op.target.to ? op : null;
}

function sparkMode(state) {
  const { menu } = state.field(aiState);
  if (menu) return 'open';
  const op = opAtCursor(state);
  if (op) {
    const { status } = op.answers[op.index];
    return status === 'loading' ? 'busy' : status;
  }
  return state.selection.main.empty ? 'rest' : 'selection';
}

// Markers are asked for on every view update; the answer changes only with
// the state, focus, or the host's availability.
const sparkMemo = new WeakMap(); // view → {state, shown, set}

function sparkMarkers(view) {
  const ctl = controllerOf(view);
  if (!ctl) return RangeSet.empty;
  const state = view.state;
  const shown = (view.hasFocus || !!state.field(aiState).menu) && !ctl.unavailable();
  const memo = sparkMemo.get(view);
  if (memo && memo.state === state && memo.shown === shown) return memo.set;
  let set = RangeSet.empty;
  if (shown) {
    const head = state.selection.main.head;
    if (aiPlaceAt(state, head, ctl.cellAt).kind !== 'none') {
      set = RangeSet.of([sparkMarkerOf[sparkMode(state)].range(state.doc.lineAt(head).from)]);
    }
  }
  sparkMemo.set(view, { state, shown, set });
  return set;
}

const aiSparkGutter = gutter({
  class: 'mrmd-ai-spark-gutter',
  markers: sparkMarkers,
  // The gutter keeps its width while no line shows the spark: the text
  // never shifts when it comes and goes.
  initialSpacer: () => sparkMarkerOf.rest,
  domEventHandlers: {
    mousedown(view, _line, event) {
      if (!(event.target instanceof Element) || !event.target.closest('.mrmd-ai-spark')) return false;
      // Keep the editor's focus and selection: the box acts on them.
      event.preventDefault();
      controllerOf(view)?.openMenu();
      return true;
    },
  },
});

// ─── key help for the host ─────────────────────────────────────────────────

/**
 * The AI keys that act in `view` now, for a host's keyboard help.
 *
 * `sections` — [{label, keys: [[names, what]], exclusive?}], most local
 * first; `names` are CodeMirror key names (formatKey spells them). An
 * `exclusive` section owns the keyboard: while the command box is open no
 * other key reaches the editor or the page.
 * `open` — the entry for the key that opens the box here, or null where AI
 * commands are off or cannot act; the host places it among its own keys.
 *
 * @param {EditorView} view
 * @returns {{sections: Array<{label: string, keys: Array<[string[], string]>, exclusive?: boolean}>, open: [string[], string] | null}}
 */
export function aiKeyHelp(view) {
  const ctl = controllerOf(view);
  if (!ctl) return { sections: [], open: null };
  const state = view.state;
  const { menu, op } = state.field(aiState);
  if (menu) {
    return {
      sections: [{ label: 'AI command box', exclusive: true, keys: [
        [['ArrowUp', 'ArrowDown'], 'choose a command'],
        [['Enter'], 'run it'],
        [[AI_KEYS.discard], 'close the box'],
      ] }],
      open: null,
    };
  }
  const sections = [];
  if (op) {
    const { status } = op.answers[op.index];
    const last = op.index === op.answers.length - 1;
    const keys = [];
    if (status === 'ready') keys.push([[AI_KEYS.accept], opAtCursor(state) ? 'accept' : 'accept, with the cursor on the suggestion']);
    if (status !== 'loading' || !last) keys.push([[AI_KEYS.next], !last ? 'next answer' : status === 'error' ? 'try again' : 'another answer']);
    if (op.index > 0) keys.push([[AI_KEYS.previous], 'previous answer']);
    keys.push([[AI_KEYS.discard], status === 'loading' ? 'stop' : status === 'error' ? 'close' : 'discard']);
    sections.push({ label: 'AI suggestion', keys });
  }
  let open = null;
  if (!ctl.unavailable()) {
    const place = aiPlaceAt(state, state.selection.main.head, ctl.cellAt);
    if (place.kind !== 'none') open = [[AI_KEYS.open], `AI commands: ${describeAiPlace(state, place)} — or click the ✦ beside the line`];
  }
  return { sections, open };
}

// ─── look ───────────────────────────────────────────────────────────

let keyframesInstalled = false;
function installKeyframes() {
  if (keyframesInstalled || typeof document === 'undefined') return;
  keyframesInstalled = true;
  const style = document.createElement('style');
  style.dataset.mrmd = 'document-ai';
  style.textContent = `
@keyframes mrmd-ai-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@keyframes mrmd-ai-blink { from { opacity: 1; } to { opacity: .3; } }
@keyframes mrmd-ai-pulse { from { opacity: 1; transform: scale(1); } to { opacity: .35; transform: scale(.72); } }
@media (prefers-reduced-motion: reduce) {
  .mrmd-ai-target-busy, .mrmd-ai-glyph-busy, .mrmd-ai-spark, .mrmd-ai-waiting::after { animation: none !important; }
}
@media (pointer: coarse) {
  .cm-editor .cm-gutter .mrmd-ai-spark { padding: 0 8px; }
}`;
  document.head.appendChild(style);
}

const aiTheme = EditorView.baseTheme({
  '.mrmd-ai-target-busy': {
    backgroundImage: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--mrmd-accent, currentColor) 22%, transparent) 50%, transparent 100%)',
    backgroundSize: '200% 100%',
    animation: 'mrmd-ai-shimmer 1.4s linear infinite',
  },
  '.mrmd-ai-target-replaced': { opacity: '.55' },
  '.mrmd-ai-ghost': { whiteSpace: 'pre-wrap' },
  '.mrmd-ai-ghost-text': { color: 'var(--mrmd-fg-muted, currentColor)', fontStyle: 'italic', opacity: '.8' },
  '.mrmd-ai-chip': { display: 'inline-flex', alignItems: 'center', gap: '2px', marginLeft: '6px', verticalAlign: 'baseline' },
  // ✦ is the mark of AI commands everywhere: the spark, the box, the
  // suggestion. Pulsing, it means an answer is being written.
  '.mrmd-ai-glyph': { display: 'inline-block', color: 'var(--mrmd-accent, currentColor)', fontStyle: 'normal' },
  '.mrmd-ai-glyph-busy': { animation: 'mrmd-ai-pulse .9s ease-in-out infinite alternate' },
  '.mrmd-ai-chip > .mrmd-ai-glyph': { margin: '0 3px' },
  '.mrmd-ai-btn': {
    font: '11px/1 var(--mrmd-font-ui, system-ui, sans-serif)', boxSizing: 'border-box', minHeight: '0', height: '19px', margin: '0',
    padding: '0 7px', lineHeight: '17px', color: 'var(--mrmd-fg, currentColor)', background: 'var(--mrmd-button-bg, transparent)',
    border: '1px solid var(--mrmd-button-border, var(--mrmd-border, currentColor))', borderRadius: '3px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '5px', fontStyle: 'normal',
  },
  // A key on a button or in the box: quieter than the label it follows.
  '.mrmd-ai-kbd': {
    font: '10px/1 var(--mrmd-font-ui, system-ui, sans-serif)', padding: '1px 3px', color: 'var(--mrmd-fg-muted, currentColor)',
    border: '1px solid var(--mrmd-border, currentColor)', borderRadius: '2px', background: 'transparent',
  },
  // The spark in the margin (see "the spark" above). Its rest opacity is a
  // token: a host without half-tones (e-ink) sets --mrmd-ai-spark-rest: 1.
  '.mrmd-ai-spark-gutter .cm-gutterElement': { textAlign: 'center' },
  '.mrmd-ai-spark': {
    display: 'inline-block', padding: '0 4px', fontSize: '0.8em', fontStyle: 'normal', cursor: 'pointer', userSelect: 'none',
    color: 'var(--mrmd-accent, currentColor)', opacity: 'var(--mrmd-ai-spark-rest, .38)', transition: 'opacity .15s',
  },
  '.mrmd-ai-spark:hover, .mrmd-ai-spark[data-mode="selection"], .mrmd-ai-spark[data-mode="open"], .mrmd-ai-spark[data-mode="ready"], .mrmd-ai-spark[data-mode="busy"]': { opacity: '1' },
  '.mrmd-ai-spark[data-mode="busy"]': { animation: 'mrmd-ai-pulse .9s ease-in-out infinite alternate' },
  '.mrmd-ai-spark[data-mode="error"]': { opacity: '1', color: 'var(--mrmd-error, currentColor)' },
  '.mrmd-ai-btn:hover, .mrmd-ai-btn:focus-visible': { background: 'var(--mrmd-hover-bg, transparent)' },
  '.mrmd-ai-btn.mrmd-ai-accept': { borderColor: 'var(--mrmd-accent, currentColor)', color: 'var(--mrmd-accent, currentColor)' },
  '.mrmd-ai-panel': {
    margin: '4px 0 8px', padding: '6px 10px', borderLeft: '2px solid var(--mrmd-accent, currentColor)',
    background: 'var(--md-code-background, transparent)', color: 'var(--mrmd-fg, inherit)', cursor: 'auto',
  },
  '.mrmd-ai-panel-head': { display: 'flex', gap: '8px', alignItems: 'baseline', font: '11px/1.4 var(--mrmd-font-ui, system-ui, sans-serif)', color: 'var(--mrmd-fg-muted, inherit)' },
  '.mrmd-ai-panel-title': { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.mrmd-ai-panel-body': { margin: '4px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '28em', overflowY: 'auto' },
  '.mrmd-ai-panel-body.mrmd-ai-code': { fontFamily: 'var(--md-marker-font, ui-monospace, monospace)', fontSize: '0.9em' },
  '.mrmd-ai-panel-body del.mrmd-ai-del': { color: 'var(--mrmd-error, currentColor)', textDecoration: 'line-through', opacity: '.75' },
  '.mrmd-ai-panel-body ins.mrmd-ai-ins': { color: 'var(--mrmd-accent, currentColor)', textDecoration: 'none', background: 'color-mix(in srgb, var(--mrmd-accent, currentColor) 12%, transparent)' },
  '.mrmd-ai-panel-body.mrmd-ai-error': { color: 'var(--mrmd-error, currentColor)' },
  '.mrmd-ai-waiting::after': { content: '"…"', animation: 'mrmd-ai-blink .8s ease-in-out infinite alternate' },
  '.mrmd-ai-panel-foot': { display: 'flex', gap: '6px', justifyContent: 'flex-end' },
  '.mrmd-ai-menu': {
    width: 'min(420px, calc(100vw - 24px))', padding: '6px', font: '12px/1.4 var(--mrmd-font-ui, system-ui, sans-serif)',
    color: 'var(--mrmd-fg, inherit)', background: 'var(--mrmd-popup-bg, var(--mrmd-bg, Canvas))',
    border: '1px solid var(--mrmd-border, currentColor)', boxShadow: '0 6px 24px rgba(0,0,0,.18)',
  },
  '.mrmd-ai-menu-head': { padding: '2px 4px 6px', color: 'var(--mrmd-fg-muted, inherit)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  '.mrmd-ai-menu-input': {
    width: '100%', boxSizing: 'border-box', font: 'inherit', padding: '4px 6px', color: 'inherit',
    background: 'var(--mrmd-input-bg, transparent)', border: '1px solid var(--mrmd-input-border, var(--mrmd-border, currentColor))', borderRadius: '3px',
  },
  '.mrmd-ai-menu-list': { margin: '6px 0 4px', maxHeight: '16em', overflowY: 'auto' },
  '.mrmd-ai-menu-item': { display: 'flex', gap: '10px', padding: '4px 6px', cursor: 'pointer', borderRadius: '3px' },
  '.mrmd-ai-menu-item[aria-selected="true"], .mrmd-ai-menu-item:hover': { background: 'var(--mrmd-active-bg, var(--mrmd-hover-bg, transparent))' },
  '.mrmd-ai-menu-label': { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.mrmd-ai-menu-hint': { color: 'var(--mrmd-fg-muted, inherit)', whiteSpace: 'nowrap' },
  '.mrmd-ai-menu-empty': { padding: '4px 6px', color: 'var(--mrmd-fg-muted, inherit)' },
  '.mrmd-ai-menu-foot': { padding: '2px 4px', color: 'var(--mrmd-fg-muted, inherit)', fontSize: '11px' },
});

// ─── the extension ──────────────────────────────────────────────────

/**
 * The AI-commands extension. `config` is the validated `ai` option
 * (aiConfig); `cellAt(state, pos)` finds the fenced block at pos.
 */
export function documentAi(config, cellAt) {
  installKeyframes();
  return [
    aiHostFacet.of({ config, cellAt }),
    aiState,
    aiDecorations,
    aiController,
    aiMenuTooltip,
    aiSparkGutter,
    aiTheme,
    Prec.highest(keymap.of([
      { key: AI_KEYS.open, preventDefault: true, run: view => controllerOf(view)?.openMenu({ byKey: true }) ?? false },
      { key: AI_KEYS.accept, run: view => controllerOf(view)?.acceptAtCursor() ?? false },
      { key: AI_KEYS.discard, run: view => controllerOf(view)?.discard() ?? false },
      { key: AI_KEYS.next, run: view => controllerOf(view)?.step(1) ?? false },
      { key: AI_KEYS.previous, run: view => controllerOf(view)?.step(-1) ?? false },
    ])),
  ];
}

/** The controller of a view with AI commands (for the editor API), or null. */
export function aiControllerOf(view) {
  return controllerOf(view);
}
