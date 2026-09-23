/**
 * Cell controls for the document editor: a Run button on every runnable
 * code cell, and the cell's run state drawn on the cell itself.
 *
 * The control sits at the right of the cell's opening fence row (the row
 * that reads as the language label). The host owns execution and tells the
 * editor what each cell is doing:
 *
 *   editor.setCellStatus(cell, { state: 'queued' | 'running' | 'waiting' | 'ok' | 'error',
 *                                startedAt, ms, label })   // null clears
 *
 *   queued   — will run (run all)                      "queued"          ■ Stop
 *   running  — computing; elapsed time ticks, a bar slides along the top
 *              edge and pulses down the left side      "running · 12s"   ■ Stop
 *   waiting  — blocked on the reader (an input prompt); the bar holds
 *              still: it is the reader's turn          "waiting for input · 12s"
 *   ok/error — the last run's verdict and duration     "✓ 1.2s"          ▶ Run
 *              (dropped when the cell's code is edited: it no longer
 *              describes that code)
 *
 * Nothing here is document text. Motion stops for readers who ask for
 * reduced motion.
 */

import { StateField, StateEffect, MapMode } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { formatKey } from './key-names.js';
import { AI_KEYS } from './document-ai.js';

/** The keys that run the cell at the cursor (bound by the document editor), in CodeMirror notation. */
export const CELL_KEYS = Object.freeze({
  run: 'Mod-Enter',
  runAndAdvance: 'Shift-Enter',
});

const setStatusEffect = StateEffect.define();

// [{ from, codeFrom, codeTo, status }] — `from` is the cell's first
// character (its opening fence), mapped through every change.
const statusField = StateField.define({
  create: () => [],
  update(list, tr) {
    let next = list;
    if (tr.docChanged) {
      next = [];
      for (const entry of list) {
        const from = tr.changes.mapPos(entry.from, 1, MapMode.TrackDel);
        if (from == null) continue; // the cell's fence was deleted
        const settled = entry.status.state === 'ok' || entry.status.state === 'error';
        if (settled && entry.codeTo >= entry.codeFrom && tr.changes.touchesRange(entry.codeFrom, entry.codeTo)) continue;
        next.push({
          ...entry,
          from,
          codeFrom: tr.changes.mapPos(entry.codeFrom, -1),
          codeTo: tr.changes.mapPos(entry.codeTo, 1),
        });
      }
    }
    for (const effect of tr.effects) {
      if (effect.is(clearStatusesEffect)) {
        next = effect.value ? next.filter(entry => !effect.value.has(entry.status.state)) : [];
        continue;
      }
      if (!effect.is(setStatusEffect)) continue;
      next = next.filter(entry => entry.from !== effect.value.from);
      if (effect.value.status) next.push(effect.value);
    }
    return next;
  },
});

const BUSY = new Set(['queued', 'running', 'waiting']);

function formatDuration(ms) {
  if (!(ms >= 0)) return '';
  if (ms < 1000) return Math.round(ms) + 'ms';
  const s = ms / 1000;
  if (s < 10) return s.toFixed(1) + 's';
  if (s < 60) return Math.round(s) + 's';
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  if (m < 60) return m + 'm ' + String(rest).padStart(2, '0') + 's';
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

// A live counter moves in whole seconds (a verdict keeps its precision).
function elapsed(status) {
  const s = Math.max(0, Math.floor((Date.now() - (status.startedAt || Date.now())) / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

function statusText(status) {
  if (!status) return '';
  switch (status.state) {
    case 'queued': return status.label || 'queued';
    case 'running': return (status.label || 'running') + ' · ' + elapsed(status);
    case 'waiting': return (status.label || 'waiting for input') + ' · ' + elapsed(status);
    case 'ok': return '✓ ' + (status.label ? status.label + ' · ' : '') + formatDuration(status.ms);
    case 'error': return '✗ ' + (status.label ? status.label + ' · ' : '') + formatDuration(status.ms);
    default: return status.label || '';
  }
}

class CellToolbarWidget extends WidgetType {
  constructor(status, config) {
    super();
    this.status = status;
    this.config = config;
  }
  eq(other) { return other.status === this.status && other.config === this.config; }
  toDOM(view) {
    const { status, config } = this;
    const bar = document.createElement('span');
    bar.className = 'mrmd-cell-toolbar';
    bar.dataset.state = status ? status.state : 'idle';
    const text = document.createElement('span');
    text.className = 'mrmd-cell-status';
    text.setAttribute('aria-live', 'polite');
    text.textContent = statusText(status);
    bar.appendChild(text);
    const cellHere = () => {
      const pos = view.posAtDOM(bar);
      return config.cellAt(view.state, view.state.doc.lineAt(pos).from);
    };
    const button = (cls, label, title, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mrmd-cell-btn ' + cls;
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      // Keep the editor's selection and focus where they are.
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const cell = cellHere();
        if (cell) onClick(cell);
      });
      return b;
    };
    if (status && BUSY.has(status.state)) {
      if (config.onCancel) {
        const title = status.state === 'queued' ? 'Stop: do not run the cells still queued' : 'Stop this run (the kernel keeps its variables)';
        bar.appendChild(button('mrmd-cell-btn-stop', '■ Stop', title, cell => config.onCancel(cell, { state: status.state })));
      }
    } else {
      if (config.onAi) bar.appendChild(button('mrmd-cell-btn-ai', '✦', `AI commands for this cell (${formatKey(AI_KEYS.open)})`, config.onAi));
      bar.appendChild(button('mrmd-cell-btn-run', '▶ Run', `Run this cell (${formatKey(CELL_KEYS.run)})`, config.onRun));
    }
    if (status && (status.state === 'running' || status.state === 'waiting')) {
      bar._timer = setInterval(() => { text.textContent = statusText(status); }, 1000);
    }
    return bar;
  }
  destroy(dom) { if (dom._timer) clearInterval(dom._timer); }
  ignoreEvent() { return true; }
}

function buildDecorations(view, config) {
  const state = view.state;
  const doc = state.doc;
  const statuses = state.field(statusField);
  const byFrom = new Map(statuses.map(entry => [entry.from, entry.status]));
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter(node) {
        if (node.name !== 'FencedCode') return;
        const first = doc.lineAt(node.from);
        const last = doc.lineAt(node.to);
        const lang = ((first.text.match(/^\s*(?:`{3,}|~{3,})\s*(\S*)/) || [])[1] || '').toLowerCase();
        const hasClose = last.number > first.number && /^\s*(?:`{3,}|~{3,})\s*$/.test(last.text);
        if (!hasClose || !config.runnable(lang)) return false;
        const status = byFrom.get(node.from) || null;
        ranges.push(Decoration.widget({ widget: new CellToolbarWidget(status, config), side: 1 }).range(first.to));
        if (status && BUSY.has(status.state)) {
          const cls = 'mrmd-cell-' + status.state;
          for (let n = first.number; n <= last.number; n++) {
            ranges.push(Decoration.line({ class: 'mrmd-cell-busy ' + cls }).range(doc.line(n).from));
          }
        }
        return false;
      },
    });
  }
  return Decoration.set(ranges, true);
}

// Keyframes live in one document-level style element: theme rules are
// scoped per editor, animation names are not.
let keyframesInstalled = false;
function installKeyframes() {
  if (keyframesInstalled || typeof document === 'undefined') return;
  keyframesInstalled = true;
  const style = document.createElement('style');
  style.dataset.mrmd = 'cell-controls';
  style.textContent = `
@keyframes mrmd-cell-slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }
@keyframes mrmd-cell-pulse { from { opacity: 1; } to { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
  .mrmd-cell-busy::before, .mrmd-cell-busy::after, .mrmd-cell-toolbar .mrmd-cell-status::before { animation: none !important; }
}`;
  document.head.appendChild(style);
}

const controlsTheme = EditorView.baseTheme({
  '.cm-line.cm-md-codeblock-first': { position: 'relative' },
  '.mrmd-cell-toolbar': {
    position: 'absolute',
    right: '6px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    font: '11px/1 var(--mrmd-font-ui, system-ui, sans-serif)',
    color: 'var(--mrmd-fg-muted, currentColor)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    zIndex: '1',
  },
  '.mrmd-cell-status:empty': { display: 'none' },
  '.mrmd-cell-toolbar[data-state="running"] .mrmd-cell-status::before, .mrmd-cell-toolbar[data-state="waiting"] .mrmd-cell-status::before': {
    content: '""',
    display: 'inline-block',
    width: '7px', height: '7px',
    borderRadius: '50%',
    marginRight: '6px',
    verticalAlign: '1px',
    background: 'var(--mrmd-accent, currentColor)',
  },
  '.mrmd-cell-toolbar[data-state="running"] .mrmd-cell-status::before': { animation: 'mrmd-cell-pulse .8s ease-in-out infinite alternate' },
  '.mrmd-cell-toolbar[data-state="waiting"] .mrmd-cell-status': { color: 'var(--mrmd-fg, currentColor)' },
  '.mrmd-cell-toolbar[data-state="error"] .mrmd-cell-status': { color: 'var(--mrmd-error, currentColor)' },
  // Sized in full: host pages often style every <button> (min-height,
  // padding, font), and the control must fit the fence row regardless.
  '.mrmd-cell-toolbar .mrmd-cell-btn': {
    font: 'inherit',
    boxSizing: 'border-box',
    height: '19px',
    minHeight: '0',
    lineHeight: '17px',
    margin: '0',
    padding: '0 8px',
    color: 'var(--mrmd-fg, currentColor)',
    background: 'var(--mrmd-button-bg, transparent)',
    border: '1px solid var(--mrmd-button-border, var(--mrmd-border, currentColor))',
    borderRadius: '3px',
    cursor: 'pointer',
    opacity: '.8',
  },
  '.mrmd-cell-toolbar .mrmd-cell-btn:hover, .mrmd-cell-toolbar .mrmd-cell-btn:focus-visible': { opacity: '1', background: 'var(--mrmd-hover-bg, transparent)' },
  '.mrmd-cell-toolbar .mrmd-cell-btn-stop': { color: 'var(--mrmd-error, currentColor)' },
  // The busy cell: a bar down its left side on every row; while it
  // computes the bar pulses and a highlight slides along the top edge.
  '.cm-line.mrmd-cell-busy': { position: 'relative' },
  '.cm-line.mrmd-cell-busy::before': {
    content: '""',
    position: 'absolute',
    left: '0', top: '0', bottom: '0',
    width: '3px',
    background: 'var(--mrmd-accent, currentColor)',
    pointerEvents: 'none',
  },
  '.cm-line.mrmd-cell-running::before': { animation: 'mrmd-cell-pulse 1s ease-in-out infinite alternate' },
  '.cm-line.mrmd-cell-queued::before': { opacity: '.3' },
  '.cm-line.mrmd-cell-running.cm-md-codeblock-first::after': {
    content: '""',
    position: 'absolute',
    left: '0', right: '0', top: '-1px',
    height: '2px',
    backgroundImage: 'linear-gradient(90deg, transparent, var(--mrmd-accent, currentColor), transparent)',
    backgroundSize: '40% 100%',
    backgroundRepeat: 'no-repeat',
    animation: 'mrmd-cell-slide 1.4s linear infinite',
    pointerEvents: 'none',
  },
});

/**
 * The extension. `config`:
 *   cellAt(state, pos)  → the cell ({lang, code, from, to}) at pos, or null
 *   runnable(lang)      → whether a cell in this fence language gets a Run button
 *   onRun(cell)         → the Run button was pressed
 *   onAi(cell)          → the ✦ button: AI commands for this cell (omit: no button)
 *   onCancel(cell, {state}) → the Stop button was pressed on a cell in that
 *                         state ('queued' | 'running' | 'waiting'); omit: no
 *                         Stop button
 */
export function cellControls(config) {
  installKeyframes();
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = buildDecorations(view, config); }
    update(update) {
      if (update.docChanged || update.viewportChanged
        || update.startState.field(statusField) !== update.state.field(statusField)
        || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = buildDecorations(update.view, config);
      }
    }
  }, { decorations: v => v.decorations });
  return [statusField, plugin, controlsTheme];
}

const clearStatusesEffect = StateEffect.define();

/** Clear every status, or those in `states` (e.g. ['queued']). */
export function clearCellStatuses(view, states) {
  view.dispatch({ effects: clearStatusesEffect.of(states ? new Set(states) : null) });
}

/** Set (or clear, with null) the run state shown on `cell`. */
export function setCellStatus(view, cell, status) {
  if (!cell) return false;
  const doc = view.state.doc;
  if (cell.from > doc.length) return false;
  const first = doc.lineAt(cell.from);
  const last = doc.lineAt(Math.min(cell.to, doc.length));
  const codeFrom = Math.min(first.to + 1, doc.length);
  const codeTo = last.number > first.number ? Math.max(codeFrom, last.from - 1) : codeFrom;
  const value = status ? { from: cell.from, codeFrom, codeTo, status: { ...status } } : { from: cell.from, status: null };
  view.dispatch({ effects: setStatusEffect.of(value) });
  return true;
}

export { formatDuration };
