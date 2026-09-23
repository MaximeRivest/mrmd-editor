/**
 * Live cell runs for the document editor.
 *
 * While a host runs a cell, the reader needs two things the document
 * itself must not carry: the output as it arrives, and a place to answer
 * when the program asks for input (`input()`, a password prompt). Both
 * live in a panel under the cell that is a view decoration, not text: no
 * save, no undo step, no collaboration traffic per chunk. When the run
 * ends the host writes the result once (setCellOutput) and disposes the
 * panel. A result block the cell already owns is dimmed meanwhile, so the
 * old output is not mistaken for the new one.
 *
 * The host owns execution; this module owns only the surface:
 *
 *   const run = editor.showCellRun(cell);
 *   run.append(text);                          // output, as it streams
 *   const reply = await run.ask({prompt, secret});
 *     // {text}             the reader answered
 *     // {dismissed: true}  the reader pressed Esc (hosts stop the run)
 *     // {withdrawn: true}  the question went away: dismissInput(), a newer
 *     //                    ask(), or dispose() — nothing to do
 *   run.dispose();                             // after setCellOutput
 *
 *   run.appendImage(url, alt)   // a plot, as it is made (shown under the text,
 *                               // where the finished result will put it)
 *   run.finish({note})          // someone else's run ended: keep what it showed,
 *                               // with a note and a close button
 */

import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';

// Enough for any progress display; older text is dropped from the live
// view only (the host's final result is unaffected).
const MAX_LIVE_CHARS = 200000;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}]/g;

const addRun = StateEffect.define();
const removeRun = StateEffect.define();

class CellRunWidget extends WidgetType {
  constructor(run) { super(); this.run = run; }
  eq(other) { return other.run === this.run; }
  // The run owns one element for its whole life: the view may detach and
  // re-attach it (scrolling), and it keeps its text and focus state.
  toDOM() { return this.run.dom; }
  ignoreEvent() { return true; }
  destroy() {}
}

const cellRunField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addRun)) deco = deco.update({ add: e.value.ranges, sort: true });
      else if (e.is(removeRun)) deco = deco.update({ filter: (_f, _t, d) => d.spec.cellRun !== e.value });
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

const cellRunTheme = EditorView.baseTheme({
  '.mrmd-cell-run': {
    margin: '2px 0 10px',
    padding: '6px 10px',
    borderLeft: '2px solid var(--mrmd-accent, currentColor)',
    background: 'var(--md-code-background, transparent)',
    color: 'var(--mrmd-fg, inherit)',
    fontFamily: 'var(--md-marker-font, ui-monospace, monospace)',
    fontSize: '0.9em',
    lineHeight: '1.45',
    cursor: 'auto',
  },
  '.mrmd-cell-run[data-empty]': { display: 'none' },
  '.mrmd-cell-run-output': {
    margin: '0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '24em',
    overflowY: 'auto',
    font: 'inherit',
    background: 'transparent',
  },
  '.mrmd-cell-run-output:empty': { display: 'none' },
  '.mrmd-cell-run-images:empty': { display: 'none' },
  '.mrmd-cell-run-images img': { display: 'block', maxWidth: '100%', margin: '6px 0', background: '#fff' },
  '.mrmd-cell-run-footer': { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', color: 'var(--mrmd-fg-muted, inherit)', fontSize: '0.85em' },
  '.mrmd-cell-run-footer[hidden]': { display: 'none' },
  '.mrmd-cell-run-footer span': { flex: '1' },
  '.mrmd-cell-run .mrmd-cell-run-close': { font: 'inherit', minHeight: '0', height: '18px', margin: '0', padding: '0 6px', lineHeight: '16px', color: 'inherit', background: 'transparent', border: '1px solid var(--mrmd-border, currentColor)', borderRadius: '3px', cursor: 'pointer' },
  '.mrmd-cell-run-output a': { color: 'var(--md-link-color, var(--mrmd-accent, inherit))' },
  '.mrmd-cell-run-dropped': { color: 'var(--mrmd-fg-muted, inherit)', fontStyle: 'italic' },
  '.mrmd-cell-run-input': { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' },
  '.mrmd-cell-run-input[hidden]': { display: 'none' },
  '.mrmd-cell-run-prompt': { color: 'var(--mrmd-fg-muted, inherit)', whiteSpace: 'pre-wrap' },
  '.mrmd-cell-run-field': {
    flex: '1 1 16em',
    minWidth: '8em',
    font: 'inherit',
    color: 'inherit',
    background: 'var(--mrmd-input-bg, transparent)',
    border: '1px solid var(--mrmd-input-border, var(--mrmd-border, currentColor))',
    borderRadius: '3px',
    padding: '2px 6px',
  },
  '.mrmd-cell-run-hint': { color: 'var(--mrmd-fg-muted, inherit)', fontSize: '0.85em' },
  '.mrmd-cell-output-stale': { opacity: '0.45' },
});

/** The editor extension: add it once to the document editor. */
export const cellRunExtension = [cellRunField, cellRunTheme];

/**
 * Terminal-style text accumulation: "\r" rewinds to the start of the
 * current line (progress bars redraw in place), ANSI styling is dropped.
 */
export function appendLiveText(current, chunk) {
  let text = current;
  const clean = String(chunk ?? '').replace(ANSI, '').replace(/\r\n/g, '\n');
  const parts = clean.split('\r');
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) text = text.slice(0, text.lastIndexOf('\n') + 1);
    text += parts[i];
  }
  return text;
}

function renderLinked(pre, text) {
  pre.textContent = '';
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) pre.appendChild(document.createTextNode(text.slice(last, m.index)));
    const a = document.createElement('a');
    a.href = m[0];
    a.textContent = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    pre.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) pre.appendChild(document.createTextNode(text.slice(last)));
}

/**
 * Show a live run under `cell` ({from, to} as listCells/codeBlockAt give).
 * `ownedOutput` is the {from, to} of the result block the cell owns, if
 * any — dimmed until the run ends.
 */
export function showCellRun(view, cell, ownedOutput, { dimResult = true } = {}) {
  const dom = document.createElement('div');
  dom.className = 'mrmd-cell-run';
  dom.dataset.state = 'running';
  // Hidden while it has nothing to show (no output yet, no question): the
  // cell's own controls already say it is running.
  dom.dataset.empty = '';
  const pre = document.createElement('pre');
  pre.className = 'mrmd-cell-run-output';
  const form = document.createElement('form');
  form.className = 'mrmd-cell-run-input';
  form.hidden = true;
  const label = document.createElement('label');
  label.className = 'mrmd-cell-run-prompt';
  const field = document.createElement('input');
  field.className = 'mrmd-cell-run-field';
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.setAttribute('autocapitalize', 'off');
  const hint = document.createElement('span');
  hint.className = 'mrmd-cell-run-hint';
  hint.textContent = 'Enter sends · Esc stops the run';
  label.htmlFor = field.id = 'mrmd-cell-run-' + Math.random().toString(36).slice(2);
  form.append(label, field, hint);
  const images = document.createElement('div');
  images.className = 'mrmd-cell-run-images';
  const footer = document.createElement('div');
  footer.className = 'mrmd-cell-run-footer';
  footer.hidden = true;
  dom.append(pre, images, form, footer);

  let text = '';
  let dropped = false;
  let renderPending = false;
  let pending = null; // { resolve } of the open ask()
  let disposed = false;

  const run = { dom };
  const doc = view.state.doc;
  const lineEnd = doc.lineAt(Math.min(cell.to, doc.length)).to;
  const ranges = [Decoration.widget({ widget: new CellRunWidget(run), block: true, side: 1, cellRun: run }).range(lineEnd)];
  if (ownedOutput && dimResult) {
    for (let pos = ownedOutput.from; pos <= ownedOutput.to;) {
      const line = doc.lineAt(pos);
      ranges.push(Decoration.line({ class: 'mrmd-cell-output-stale', cellRun: run }).range(line.from));
      if (line.to + 1 > ownedOutput.to) break;
      pos = line.to + 1;
    }
  }
  view.dispatch({ effects: addRun.of({ ranges }) });

  const render = () => {
    renderPending = false;
    if (disposed) return;
    const nearBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24;
    renderLinked(pre, text);
    if (text) delete dom.dataset.empty;
    if (dropped) {
      const note = document.createElement('span');
      note.className = 'mrmd-cell-run-dropped';
      note.textContent = '… earlier output not shown while running\n';
      pre.prepend(note);
    }
    if (nearBottom) pre.scrollTop = pre.scrollHeight;
    view.requestMeasure();
  };
  const scheduleRender = () => {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(render);
  };

  const finish = value => {
    if (!pending) return;
    const { resolve } = pending;
    pending = null;
    form.hidden = true;
    if (!text && !images.childElementCount) dom.dataset.empty = '';
    field.value = '';
    dom.dataset.state = 'running';
    view.requestMeasure();
    resolve(value);
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const value = field.value;
    const hadFocus = dom.contains(document.activeElement);
    finish({ text: value });
    if (hadFocus) view.focus();
  });
  field.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish({ dismissed: true });
      view.focus();
    }
    e.stopPropagation(); // typing here is not editing the document
  });

  Object.assign(run, {
    /** Append streamed output. */
    append(chunk) {
      if (disposed || !chunk) return;
      text = appendLiveText(text, chunk);
      if (text.length > MAX_LIVE_CHARS) {
        text = text.slice(text.length - MAX_LIVE_CHARS);
        text = text.slice(text.indexOf('\n') + 1);
        dropped = true;
      }
      scheduleRender();
    },
    /**
     * Ask the reader for one line; see the module comment for the reply.
     * A secret prompt uses a password field; its answer is never shown.
     */
    ask({ prompt = '', secret = false } = {}) {
      if (disposed) return Promise.resolve({ withdrawn: true });
      finish({ withdrawn: true }); // a newer question replaces an unanswered one
      label.textContent = String(prompt).trim() || 'The program is waiting for input:';
      field.type = secret ? 'password' : 'text';
      field.value = '';
      form.hidden = false;
      delete dom.dataset.empty;
      dom.dataset.state = 'waiting';
      view.requestMeasure();
      // The reader started this run; take focus unless they are typing
      // somewhere else on the page.
      const active = document.activeElement;
      if (!active || active === document.body || view.dom.contains(active)) {
        requestAnimationFrame(() => { if (!form.hidden) field.focus({ preventScroll: false }); });
      }
      return new Promise(resolve => { pending = { resolve }; });
    },
    /**
     * Where the panel is now (the end of its cell, followed through
     * edits), or null once disposed.
     */
    position() {
      if (disposed) return null;
      let at = null;
      view.state.field(cellRunField).between(0, view.state.doc.length, (from, _to, d) => {
        if (d.spec.cellRun === run && d.spec.widget) { at = from; return false; }
      });
      return at;
    },
    /** The program stopped waiting without this panel's answer. */
    dismissInput() { finish({ withdrawn: true }); },
    appendImage(url, alt = 'plot') {
      if (disposed || !url) return;
      const img = document.createElement('img');
      img.src = url;
      img.alt = alt;
      img.addEventListener('load', () => view.requestMeasure());
      images.appendChild(img);
      delete dom.dataset.empty;
      view.requestMeasure();
    },
    /**
     * The run ended and nothing will be written for it (someone else's
     * run): keep its output visible, say whose it was, offer to close.
     */
    finish({ note = '' } = {}) {
      if (disposed) return;
      finish({ withdrawn: true });
      dom.dataset.state = 'done';
      footer.textContent = '';
      const span = document.createElement('span');
      span.textContent = note;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'mrmd-cell-run-close';
      close.textContent = '×';
      close.title = 'Close';
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('mousedown', e => e.preventDefault());
      close.addEventListener('click', e => { e.preventDefault(); run.dispose(); });
      footer.append(span, close);
      footer.hidden = false;
      if (text || images.childElementCount) delete dom.dataset.empty;
      else dom.dataset.empty = '';
      view.requestMeasure();
    },
    get text() { return text; },
    dispose() {
      if (disposed) return;
      finish({ withdrawn: true });
      disposed = true;
      const hadFocus = dom.contains(document.activeElement);
      view.dispatch({ effects: removeRun.of(run) });
      if (hadFocus) view.focus();
    },
  });
  return run;
}
