/**
 * rat-notebook — what a Markdown notebook run on rat means, as plain
 * functions: no editor, no DOM, no transport. Every host (Chattering, the
 * VS Code extension, a test) uses these, so a notebook behaves the same
 * wherever it is run.
 *
 * The result format a run leaves in the document:
 *
 *   ```python
 *   plt.plot(x); plt.show()
 *   ```
 *
 *   ```output
 *   what the program printed
 *   ```
 *
 *   ![plot](../_assets/generated/3f9a1c2b7d4e.png)
 *
 *   <iframe class="rat-output" src="../_assets/generated/9b1e….html" sandbox="allow-scripts" loading="lazy" style="width:100%;height:440px;border:0"></iframe>
 *
 * - Program output only: no timing or status (they change on every run and
 *   would show in Git when the output did not). A fence longer than any
 *   backtick run in the output keeps the output byte-for-byte.
 * - Plots are images after the block, saved in the project's
 *   `_assets/generated/`, named by content. A result owns only the images
 *   the runner made (alt `plot`, a path inside `_assets/`): an image a
 *   person placed there is never replaced.
 * - Rich displays (a kernel's __RAT_DISPLAY__:<bundle.json>, Jupyter's
 *   display_data) keep their place among the text: the result is an
 *   ordered series of output blocks, images and embeds. The host picks
 *   what each display becomes — an image, an interactive page saved in
 *   `_assets/generated/` and embedded (sandboxed), or its text.
 * - Older forms are read and replaced: ```output:<execId> (MRMD) and
 *   ```output | ✓ 1.5s | 1 var (VS Code before this module).
 */

/** Where generated images go, relative to the project root. */
export const GENERATED_ASSETS_DIR = '_assets/generated';

const PLOT_MARKER = '__RAT_PLOT__:';
const PLOT_LINE = /^__RAT_PLOT__:(.+?)\s*$/;
const DISPLAY_MARKER = '__RAT_DISPLAY__:';
const DISPLAY_LINE = /^__RAT_DISPLAY__:(.+?)\s*$/;
const OWNED_EMBED = /^<iframe class="rat-output" src="([^"\s]*_assets\/[^"\s]*)"[^>]*><\/iframe>\s*$/;
const BANNER_LINE = /^[a-z0-9@._-]+ (?:started|restarted) on http[^\n]*\n?/im;
const STATUS_TAIL = /\n?[✓✗] \d+(?:\.\d+)?m?s( \| \d+ vars?)?\s*$/;
const OWNED_IMAGE = /^!\[plot(?:-\d+)?\]\(([^)\s]*_assets\/[^)\s]*)\)\s*$/;

/** A fence line's language word, lowercased ('' when bare). */
export function fenceLanguage(line) {
  return ((String(line).match(/^\s{0,3}(?:`{3,}|~{3,})\s*([^\s|]*)/) || [])[1] || '').toLowerCase();
}

/** True for every spelling of a result fence: output, output:<id>, output | … */
export function isOutputFence(line) {
  const lang = fenceLanguage(line);
  return lang === 'output' || lang.startsWith('output:');
}

/** True for an image line a run made (and a rerun may replace). */
export function isOwnedImageLine(line) {
  return OWNED_IMAGE.test(String(line));
}

/** True for an embed line a run made (an interactive display). */
export function isOwnedEmbedLine(line) {
  return OWNED_EMBED.test(String(line));
}

/** An owned image or embed line. */
export function isOwnedResultLine(line) {
  return isOwnedImageLine(line) || isOwnedEmbedLine(line);
}

/**
 * Finished output as an ordered series:
 * [{kind:'text', text} | {kind:'plot', path} | {kind:'display', path}].
 */
export function splitParts(text) {
  const parts = [];
  let buf = [];
  const flush = () => {
    const t = buf.join('\n').replace(/\s+$/, '');
    if (t.trim()) parts.push({ kind: 'text', text: t });
    buf = [];
  };
  for (const line of String(text || '').split('\n')) {
    const p = line.match(PLOT_LINE);
    const d = !p && line.match(DISPLAY_LINE);
    if (p || d) { flush(); parts.push(p ? { kind: 'plot', path: p[1] } : { kind: 'display', path: d[1] }); }
    else buf.push(line);
  }
  flush();
  return parts;
}

/** The run's output as an ordered series (see splitParts). */
export function finishedParts(out) {
  return splitParts(cleanRunOutput(out));
}

/**
 * rat's final text for a run, as a document keeps it: without rat's
 * kernel-start banner and its "✓ 21ms | 1 var" status line.
 */
export function cleanRunOutput(out) {
  return String(out || '').replace(BANNER_LINE, '').replace(STATUS_TAIL, '').replace(/\s+$/, '');
}

/** Split plot markers out of finished output: {text, plots: [path]}. */
export function splitPlots(text) {
  const plots = [];
  const kept = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(PLOT_LINE);
    if (m) plots.push(m[1]);
    else if (!DISPLAY_LINE.test(line)) kept.push(line);
  }
  return { text: kept.join('\n').replace(/\s+$/, ''), plots };
}

/**
 * The same, for output that arrives in chunks: a marker may be split
 * across chunks, so a partial last line is held back — but only while it
 * could still become a marker (a prompt like "Name: " passes at once).
 * feed(chunk) → {text, plots}; flush() → the rest.
 */
export function createLiveOutputFilter() {
  let pending = '';
  const take = (final) => {
    // items keeps the order of text and displays for hosts that draw
    // them in place; text and plots stay for older hosts.
    const out = { text: '', plots: [], displays: [], items: [] };
    const addText = t => { out.text += t; const last = out.items[out.items.length - 1]; if (last && last.kind === 'text') last.text += t; else out.items.push({ kind: 'text', text: t }); };
    const take1 = line => {
      const m = line.match(PLOT_LINE);
      const d = !m && line.match(DISPLAY_LINE);
      if (m) { out.plots.push(m[1]); out.items.push({ kind: 'plot', path: m[1] }); return true; }
      if (d) { out.displays.push(d[1]); out.items.push({ kind: 'display', path: d[1] }); return true; }
      return false;
    };
    let start = 0;
    for (;;) {
      const nl = pending.indexOf('\n', start);
      if (nl < 0) break;
      const line = pending.slice(start, nl);
      if (!take1(line)) addText(line + '\n');
      start = nl + 1;
    }
    let rest = pending.slice(start);
    const couldBe = marker => marker.startsWith(rest.slice(0, marker.length));
    if (rest && (final || (!couldBe(PLOT_MARKER) && !couldBe(DISPLAY_MARKER)))) {
      if (!(final && take1(rest))) addText(rest);
      rest = '';
    }
    pending = rest;
    return out;
  };
  return {
    feed(chunk) { pending += String(chunk ?? ''); return take(false); },
    flush() { return take(true); },
  };
}

/** Backticks for a fence around `text`: longer than any run inside it. */
export function fenceFor(text) {
  let longest = 0;
  for (const m of String(text).matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** An embed line for an interactive display saved at `src`. */
export function embedLine(src, height = 440) {
  const h = Math.max(120, Math.min(2000, Math.round(Number(height) || 440)));
  return '<iframe class="rat-output" src="' + String(src).replace(/"/g, '%22') + '" sandbox="allow-scripts" loading="lazy" style="width:100%;height:' + h + 'px;border:0"></iframe>';
}

/**
 * The Markdown of an ordered result: parts are {kind:'text', text},
 * {kind:'image', src, alt} and {kind:'embed', src, height}. Consecutive
 * text joins in one output block.
 */
export function formatParts(parts) {
  const out = [];
  let text = '';
  const flush = () => {
    const body = text.replace(/\s+$/, '');
    if (body.trim()) { const ticks = fenceFor(body); out.push(ticks + 'output\n' + body + '\n' + ticks); }
    text = '';
  };
  for (const p of parts || []) {
    if (p.kind === 'text') { text += (text && !text.endsWith('\n') ? '\n' : '') + String(p.text ?? ''); continue; }
    flush();
    if (p.kind === 'image') out.push('![' + (p.alt || 'plot') + '](' + p.src + ')');
    else if (p.kind === 'embed') out.push(embedLine(p.src, p.height));
  }
  flush();
  return out.join('\n\n');
}

/**
 * The Markdown a run leaves under its cell: the output block (when there
 * is output) and the plot images (each `{src, alt}`), or '' for neither.
 */
export function formatResult(text, images = []) {
  const body = String(text ?? '').replace(/\s+$/, '');
  const parts = [];
  if (body) {
    const ticks = fenceFor(body);
    parts.push(ticks + 'output\n' + body + '\n' + ticks);
  }
  for (const img of images) parts.push('![' + (img.alt || 'plot') + '](' + img.src + ')');
  return parts.join('\n\n');
}

/**
 * The run's output as a finished document keeps it, given what rat
 * reported at the end: {text, plots}. `ok`=false keeps the error text.
 */
export function finishedOutput(out) {
  return splitPlots(cleanRunOutput(out));
}

/**
 * Which cell another client's run belongs to: the only cell whose code is
 * the run's code (trailing whitespace aside). Two identical cells, or
 * none: null — a guess would draw someone's run on the wrong cell.
 */
export function cellForCode(cells, code) {
  const norm = s => String(s ?? '').replace(/\s+$/, '').replace(/\r\n/g, '\n');
  const want = norm(code);
  if (!want) return null;
  const hits = cells.filter(c => norm(c.code) === want);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Follows other clients' runs from `rat events` (run_started/output/
 * waiting/input_done/ended, as parsed JSON). Live chunks are a preview
 * sent every 50 ms — a quick run has none — so the end event's whole
 * output fills in what the chunks did not. Returns per event what changed:
 * {run, kind, text?, plots?} — the host draws it.
 */
export function createRunFollower() {
  const runs = new Map();
  return {
    runs,
    apply(ev) {
      const kind = ev.event || ev.kind;
      const id = ev.run_id;
      if (!id) return { kind, run: null };
      if (kind === 'run_started') {
        const run = { id, caller: ev.caller || 'rat', code: ev.code || '', startedAt: Date.now(), seen: '', filter: createLiveOutputFilter(), waiting: null, replay: !!ev.replay };
        runs.set(id, run);
        return { kind, run };
      }
      const run = runs.get(id);
      if (!run) return { kind, run: null };
      if (kind === 'run_output') {
        run.seen += ev.text || '';
        return { kind, run, ...run.filter.feed(ev.text || '') };
      }
      if (kind === 'run_waiting') { run.waiting = { prompt: ev.prompt || '', secret: !!ev.secret }; return { kind, run }; }
      if (kind === 'run_input_done') { run.waiting = null; return { kind, run }; }
      if (kind === 'run_ended') {
        runs.delete(id);
        run.waiting = null;
        const tail = run.filter.flush();
        const full = ev.ok === false && ev.error ? String(ev.error) : String(ev.output || '');
        const seen = run.seen.replace(/\s+$/, '');
        let rest = '';
        if (!seen) rest = full;
        else if (full.startsWith(seen)) rest = full.slice(seen.length).replace(/^\n/, '');
        const more = splitPlots(rest);
        const moreDisplays = splitParts(rest).filter(p => p.kind === 'display').map(p => p.path);
        run.ok = ev.ok !== false;
        run.ms = typeof ev.duration_ms === 'number' ? ev.duration_ms : Date.now() - run.startedAt;
        return { kind, run, text: tail.text + (more.text ? (tail.text && !tail.text.endsWith('\n') ? '\n' : '') + more.text + '\n' : ''), plots: [...tail.plots, ...more.plots], displays: [...tail.displays, ...moreDisplays] };
      }
      return { kind, run };
    },
  };
}
