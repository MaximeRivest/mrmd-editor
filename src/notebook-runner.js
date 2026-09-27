/**
 * The notebook runner: running cells of a document editor on rat, the
 * same way in every host. It owns the run's life on the page — the cell's
 * status, the live panel, input prompts, plots, the result written under
 * the cell, run-all's queue — and other clients' runs followed through
 * `rat events`. The host lends only the transport (how its page reaches
 * rat) and draws its own chrome from the hooks.
 *
 *   const runner = mrmdDocument.createNotebookRunner(editor, {
 *     transport: {
 *       run({lang, code, runId}, onEvent) → Promise<result>
 *           onEvent: {type:'started', ratRunId} | {type:'output', text}
 *                  | {type:'input_request', prompt, secret} | {type:'input_done'}
 *           result:  {code, out, ms, cancelled?, error?}  (error: it did not run)
 *       answer(runId, text) → Promise<{error?}>
 *       cancel(runId) → Promise
 *       interrupt?(cell) → Promise          interrupt whatever runs on that cell's
 *                                           kernel (Stop on a cell another client runs)
 *       plotUrl(path) → string              a URL to show a plot while running
 *       savePlots(paths) → Promise<[{src, alt}]>  make them durable; src relative to the document
 *       displayUrl?(path) → string          a URL showing a display bundle (a page)
 *       saveOutputs?(items) → Promise<[part]>  items [{kind:'plot'|'display', path}] →
 *           [{kind:'image', src, alt} | {kind:'embed', src, height} | {kind:'text', text}]
 *           what each becomes in the document (a host without it: plots only)
 *       prepare?(cell) → Promise<{ok, error?, label?}>   before a run (prerequisites)
 *     },
 *     runnable(lang) → boolean,
 *     hooks: { onRunStart, onRunState, onRunEnd, onExternal, onKernelEvent },
 *   });
 *   runner.run(cell, {advance})   runner.runAll()   runner.cancel()
 *   runner.cancelCell(state)      runner.external(event)   runner.running
 *
 * See rat-notebook.js for what a run leaves in the document.
 */

import {
  createLiveOutputFilter, finishedOutput, finishedParts, cellForCode, createRunFollower,
} from './rat-notebook.js';

const norm = s => String(s ?? '').replace(/\s+$/, '').replace(/\r\n/g, '\n');

export function createNotebookRunner(editor, options = {}) {
  const transport = options.transport;
  if (!transport || typeof transport.run !== 'function') throw new TypeError('createNotebookRunner: transport.run is required');
  const hooks = options.hooks || {};
  const runnable = typeof options.runnable === 'function' ? options.runnable : () => true;
  const call = (name, ...args) => { try { return hooks[name] && hooks[name](...args); } catch (e) { console.error('[notebook-runner]', name, e); } };
  const setStatus = (panel, cell, status) => {
    if (panel && panel.setStatus && panel.setStatus(status)) return;
    if (cell && editor.setCellStatus) editor.setCellStatus(cell, status);
  };

  let seq = 0;
  let current = null;            // the run this page started: {runId, ratRunId, cell, panel, cancel}
  const ownRatRuns = new Set();  // rat run ids of this page's runs
  const others = new Map();      // rat run id → {panel, run} for other clients' runs
  const follower = createRunFollower();
  let stopQueue = false;

  function closeOther(id) {
    const o = others.get(id);
    if (!o) return;
    others.delete(id);
    try { o.panel && o.panel.dispose(); } catch {}
  }
  function closeOthersOn(cell) {
    for (const [id, o] of others) {
      const at = o.panel && o.panel.cell && o.panel.cell();
      if (at && at.from === cell.from) closeOther(id);
    }
  }

  async function run(cell, { advance = false } = {}) {
    if (!cell || !norm(cell.code)) return { ok: false };
    if (current) return { ok: false, busy: true };
    const runId = 'run-' + (++seq) + '-' + Date.now();
    const t0 = Date.now();
    closeOthersOn(cell);
    const panel = editor.showCellRun ? editor.showCellRun(cell) : null;
    const state = { runId, ratRunId: null, cell, panel, t0, waiting: false };
    current = state;
    state.cancel = () => transport.cancel(runId);
    const statusNow = extra => setStatus(panel, cell, { state: state.waiting ? 'waiting' : 'running', startedAt: t0, ...extra });
    statusNow();
    call('onRunStart', { cell, runId, cancel: state.cancel });

    const end = (result, extra = {}) => {
      current = null;
      const ok = !result.error && result.code === 0;
      const verdict = result.error ? { state: 'error', ms: Date.now() - t0, label: extra.label || 'not run' }
        : { state: ok ? 'ok' : 'error', ms: result.ms ?? Date.now() - t0, label: result.cancelled ? 'stopped' : undefined };
      setStatus(panel, cell, verdict);
      return ok;
    };

    if (typeof transport.prepare === 'function') {
      statusNow({ label: 'preparing' });
      let prep;
      try { prep = await transport.prepare(cell); } catch (e) { prep = { ok: false, error: String(e && e.message || e) }; }
      if (!prep || !prep.ok) {
        const result = { error: (prep && prep.error) || 'could not prepare the run' };
        end(result, { label: (prep && prep.label) || 'not run' });
        try { panel && panel.dispose(); } catch {}
        call('onRunEnd', { cell, runId, result, ok: false, wrote: false });
        return { ok: false, result };
      }
      statusNow();
    }

    const live = createLiveOutputFilter();
    const showLive = ({ text, plots, displays = [] }) => {
      if (!panel) return;
      if (text) panel.append(text);
      for (const p of plots) panel.appendImage(transport.plotUrl ? transport.plotUrl(p) : '', 'plot');
      if (panel.appendFrame && transport.displayUrl) for (const d of displays) panel.appendFrame(transport.displayUrl(d));
    };
    const onEvent = ev => {
      if (current !== state) return;
      if (ev.type === 'started' && ev.ratRunId) {
        state.ratRunId = ev.ratRunId;
        ownRatRuns.add(ev.ratRunId);
        closeOther(ev.ratRunId); // `rat events` may have reported it first
      } else if (ev.type === 'output') {
        showLive(live.feed(ev.text));
      } else if (ev.type === 'input_request') {
        state.waiting = true;
        statusNow();
        call('onRunState', { cell, runId, waiting: true });
        const asked = panel ? panel.ask({ prompt: ev.prompt, secret: ev.secret }) : Promise.resolve({ withdrawn: true });
        asked.then(async reply => {
          if (current !== state) return;
          if (typeof reply.text === 'string') {
            const r = await transport.answer(runId, reply.text);
            if (r && r.error) call('onRunState', { cell, runId, error: r.error });
          } else if (reply.dismissed) state.cancel();
        });
      } else if (ev.type === 'input_done') {
        state.waiting = false;
        statusNow();
        if (panel) panel.dismissInput();
        call('onRunState', { cell, runId, waiting: false });
      }
    };

    let result;
    try { result = await transport.run({ lang: cell.lang, code: cell.code, runId }, onEvent); }
    catch (e) { result = { error: String(e && e.message || e) }; }
    result = result || { error: 'no result' };
    showLive(live.flush());
    const ok = end(result);
    if (result.error) {
      try { panel && panel.dispose(); } catch {}
      call('onRunEnd', { cell, runId, result, ok: false, wrote: false });
      return { ok: false, result };
    }

    // The result goes under the cell where it is now (edits above it move
    // it; the panel followed), and only if its code is still what ran.
    const { text, plots } = finishedOutput(result.out);
    const series = finishedParts(result.out);
    let images = [];
    let parts = null;
    let saveError = null;
    const items = series.filter(p => p.kind !== 'text');
    if (items.length && transport.saveOutputs) {
      // The ordered result: each plot and display where it was printed.
      try {
        const saved = await transport.saveOutputs(items);
        let i = 0;
        parts = series.map(p => p.kind === 'text' ? p : (saved[i++] || { kind: 'text', text: '' }));
      } catch (e) { saveError = String(e && e.message || e); parts = series.filter(p => p.kind === 'text'); }
      if (saveError) parts.push({ kind: 'text', text: '[outputs not saved: ' + saveError + ']' });
    } else if (plots.length && transport.savePlots) {
      try { images = await transport.savePlots(plots); } catch (e) { saveError = String(e && e.message || e); }
    }
    const note = saveError && !parts ? '\n[plots not saved: ' + saveError + ']' : '';
    const cellNow = (panel && panel.cell && panel.cell()) || cell;
    const wrote = !!cellNow && norm(cellNow.code) === norm(cell.code) && editor.setCellOutput(cellNow, text + note, parts ? { parts } : { images });
    try { panel && panel.dispose(); } catch {}
    call('onRunEnd', { cell: cellNow || cell, runId, result, ok, wrote, text, images });
    if (advance && ok && cellNow) editor.advanceToNextCell(cellNow);
    return { ok, result, wrote };
  }

  function runnableCells() {
    return editor.listCells().filter(c => runnable(String(c.lang || '').toLowerCase()));
  }

  async function runAll() {
    if (current) return { ok: false, busy: true };
    const cells = runnableCells();
    if (!cells.length) return { ok: false, empty: true };
    stopQueue = false;
    for (const c of cells) editor.setCellStatus && editor.setCellStatus(c, { state: 'queued' });
    const clearQueue = () => { stopQueue = false; try { editor.clearCellStatuses && editor.clearCellStatuses(['queued']); } catch {} };
    for (let i = 0; i < cells.length; i++) {
      // Re-list before each run: earlier results moved the later cells.
      const fresh = runnableCells();
      if (i >= fresh.length) break;
      if (stopQueue) { clearQueue(); return { ok: false, stoppedBefore: i, total: fresh.length }; }
      const r = await run(fresh[i]);
      if (!r.ok) { clearQueue(); return { ok: false, failedAt: i, total: fresh.length, result: r.result }; }
    }
    clearQueue();
    return { ok: true, total: cells.length };
  }

  function cancel() { if (current) return current.cancel(); }

  /**
   * Stop pressed on a cell: run all's queue, this page's run, or another
   * client's run on that cell (an interrupt: the kernel keeps its
   * variables; a person may stop an agent).
   */
  function cancelCell(state, cell) {
    if (state === 'queued') {
      stopQueue = true;
      try { editor.clearCellStatuses && editor.clearCellStatuses(['queued']); } catch {}
      return 'queue';
    }
    if (current && (!cell || current.cell.from === cell.from || (current.panel && current.panel.cell && current.panel.cell()?.from === cell.from))) {
      cancel();
      return 'run';
    }
    if (cell && transport.interrupt) {
      for (const o of others.values()) {
        const at = o.panel && o.panel.cell && o.panel.cell();
        if (at && at.from === cell.from) { transport.interrupt(at); return 'other'; }
      }
    }
    return null;
  }

  /**
   * One event from `rat events --json`. Runs this page started are
   * ignored (the page shows them already); other clients' runs are drawn
   * on the cell whose code they ran, when exactly one cell has it.
   */
  function external(ev) {
    const kind = ev && (ev.event || ev.kind);
    if (!kind) return;
    if (kind === 'kernel' || kind === 'gap' || kind === 'ctl_called' || kind === 'look_called') {
      if (kind === 'kernel' && (ev.state === 'stopped' || ev.restarted)) {
        for (const [id, o] of others) {
          setStatus(o.panel, null, { state: 'error', ms: Date.now() - o.run.startedAt, label: o.run.caller + ' · ' + (ev.state === 'stopped' ? 'kernel stopped' : 'kernel restarted') });
          try { o.panel.finish({ note: o.run.caller + '\u2019s run did not finish' }); } catch {}
          others.delete(id);
        }
        follower.runs.clear();
      }
      call('onKernelEvent', ev);
      return;
    }
    const id = ev.run_id;
    if (!id || ownRatRuns.has(id)) return;
    if (kind === 'run_started' && current && !current.ratRunId && norm(ev.code) === norm(current.cell.code)) {
      // Our own run, reported by `rat events` before `rat run` said its id.
      current.ratRunId = id;
      ownRatRuns.add(id);
      return;
    }
    const change = follower.apply(ev);
    const r = change.run;
    if (!r) return;
    if (kind === 'run_started') {
      if (typeof ev.ts === 'number') r.startedAt = ev.ts;
      const cell = cellForCode(runnableCells(), r.code);
      let panel = null;
      if (cell && !(current && current.cell.from === cell.from)) {
        closeOthersOn(cell);
        panel = editor.showCellRun ? editor.showCellRun(cell, { dimResult: false }) : null;
        if (panel) {
          others.set(id, { panel, run: r });
          setStatus(panel, cell, { state: 'running', startedAt: r.startedAt, label: r.caller + ' · running' });
        }
      }
      call('onExternal', { kind, run: r, cell, shown: !!panel });
      return;
    }
    const o = others.get(id);
    if (o) {
      if (change.text) o.panel.append(change.text);
      for (const p of change.plots || []) o.panel.appendImage(transport.plotUrl ? transport.plotUrl(p) : '', 'plot');
      if (o.panel.appendFrame && transport.displayUrl) for (const d of change.displays || []) o.panel.appendFrame(transport.displayUrl(d));
      if (kind === 'run_waiting') setStatus(o.panel, null, { state: 'waiting', startedAt: r.startedAt, label: r.caller + ' · waiting for input' });
      if (kind === 'run_input_done') setStatus(o.panel, null, { state: 'running', startedAt: r.startedAt, label: r.caller + ' · running' });
      if (kind === 'run_ended') {
        setStatus(o.panel, null, { state: r.ok ? 'ok' : 'error', ms: r.ms, label: r.caller });
        o.panel.finish({ note: r.caller + '\u2019s run \u2014 shown here, not saved in the document' });
        others.delete(id);
      }
    }
    call('onExternal', { kind, run: r, text: change.text, plots: change.plots, shown: !!o });
  }

  function destroy() {
    for (const id of [...others.keys()]) closeOther(id);
  }

  return {
    run, runAll, cancel, cancelCell, external, destroy,
    get running() { return current ? { cell: current.cell, runId: current.runId, waiting: current.waiting } : null; },
  };
}
