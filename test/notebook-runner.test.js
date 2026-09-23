// The notebook runner with a scripted transport: what a run does on the
// page and in the document, and other clients' runs from `rat events`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const until = async (expr, what) => { for (let i = 0; i < 100; i++) { if (await page.evaluate(expr)) return; await new Promise(r => setTimeout(r, 20)); } assert.fail(what); };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
try {
  await page.setContent('<div id="editor" style="width:800px;height:700px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  const source = '# Doc\n\n```python\nplot()\n```\n\n```python\nask()\n```\n\n```text\nnot code\n```\n\n```python\nshared()\n```\n';
  await page.evaluate((doc, png) => {
    window.editor = mrmdDocument.createDocumentEditor('#editor', { doc, onRunCell() {} });
    window.calls = []; window.pending = {};
    window.runner = mrmdDocument.createNotebookRunner(editor, {
      runnable: lang => lang === 'python',
      transport: {
        run: (req, onEvent) => new Promise(resolve => { calls.push(['run', req.code]); pending[req.code] = { onEvent, resolve, runId: req.runId }; }),
        answer: (runId, text) => { calls.push(['answer', text]); return Promise.resolve({ ok: true }); },
        cancel: runId => { calls.push(['cancel']); return Promise.resolve(); },
        interrupt: () => { calls.push(['interrupt']); return Promise.resolve(); },
        plotUrl: path => png,
        savePlots: paths => { calls.push(['save', paths]); return Promise.resolve(paths.map((p, i) => ({ src: '_assets/generated/p' + i + '.png', alt: 'plot' }))); },
      },
      hooks: { onRunEnd: e => calls.push(['end', e.ok, e.wrote]) },
    });
  }, source, PNG);
  const cells = () => page.evaluate(() => editor.listCells().map(c => c.code));
  assert.deepEqual(await cells(), ['plot()', 'ask()', 'not code', 'shared()']);

  // 1. A run with a plot: shown live, saved, written after the output.
  await page.evaluate(() => { window.done = runner.run(editor.listCells()[0]); });
  await until(`!!pending['plot()']`, 'run not started');
  await page.evaluate(() => { const p = pending['plot()']; p.onEvent({ type: 'started', ratRunId: 'rat-1' }); p.onEvent({ type: 'output', text: 'drawing\n__RAT_PL' }); p.onEvent({ type: 'output', text: 'OT__:/c/fig-1-0.png\n' }); });
  await until(`document.querySelector('.mrmd-cell-run-images img') && document.querySelector('.mrmd-cell-run-output').textContent === 'drawing\\n'`, 'live plot not shown');
  // Text is inserted above the cell while it runs: the result follows the cell.
  await page.evaluate(() => editor.view.dispatch({ changes: { from: 0, insert: 'Intro.\n\n' } }));
  await page.evaluate(() => { pending['plot()'].resolve({ code: 0, out: 'drawing\n__RAT_PLOT__:/c/fig-1-0.png\n\n✓ 40ms | 1 var', ms: 40 }); return done; });
  let doc = await page.evaluate(() => editor.getContent());
  assert.ok(doc.includes('```python\nplot()\n```\n\n```output\ndrawing\n```\n\n![plot](_assets/generated/p0.png)\n\n```python\nask()'), doc);
  assert.deepEqual(await page.evaluate(() => calls.filter(c => c[0] === 'save')), [['save', ['/c/fig-1-0.png']]]);
  assert.equal(await page.$eval('.mrmd-cell-toolbar', el => el.textContent), '✓ 40ms▶ Run');

  // A rerun without plots replaces the output and removes the old image;
  // a person's own image right after it is kept.
  await page.evaluate(() => { const c = editor.listCells()[0]; editor.view.dispatch({ changes: { from: editor.getContent().indexOf('![plot](_assets/generated/p0.png)') + '![plot](_assets/generated/p0.png)'.length, insert: '\n\n![my photo](me.png)' } }); window.done = runner.run(c); });
  await until(`!!pending['plot()'] && pending['plot()'].resolve`, 'rerun');
  await page.evaluate(() => { pending['plot()'].resolve({ code: 0, out: 'plain', ms: 5 }); return done; });
  doc = await page.evaluate(() => editor.getContent());
  assert.ok(doc.includes('```output\nplain\n```\n\n![my photo](me.png)') && !doc.includes('p0.png'), doc);

  // 2. A prompt: answered from the panel; the code edited meanwhile, so the
  // result is not written over a cell that no longer holds that code.
  await page.evaluate(() => { window.done = runner.run(editor.listCells()[1]); });
  await until(`!!pending['ask()']`, 'ask run');
  await page.evaluate(() => pending['ask()'].onEvent({ type: 'input_request', prompt: 'Name: ', secret: false }));
  await until(`/^waiting for input/.test([...document.querySelectorAll('.mrmd-cell-toolbar')][1].textContent)`, 'waiting status');
  await page.evaluate(() => { const f = document.querySelector('.mrmd-cell-run-field'); f.value = 'Ada'; f.form.requestSubmit(); });
  await until(`calls.some(c => c[0] === 'answer' && c[1] === 'Ada')`, 'answer not sent');
  await page.evaluate(() => { pending['ask()'].onEvent({ type: 'input_done' }); const c = editor.listCells()[1]; editor.view.dispatch({ changes: { from: c.to - 4, insert: '  # edited' } }); pending['ask()'].resolve({ code: 0, out: 'Name: Ada\nhi Ada', ms: 9 }); return done; });
  assert.deepEqual(await page.evaluate(() => calls.filter(c => c[0] === 'end').at(-1)), ['end', true, false]);
  assert.ok(!(await page.evaluate(() => editor.getContent())).includes('hi Ada'), 'a result was written over edited code');

  // 3. Another client's run: drawn on its cell, kept with a note, not saved.
  await page.evaluate(() => {
    runner.external({ event: 'run_started', run_id: 'agent-1', caller: "Lilly's agent", code: 'shared()', ts: Date.now() - 3000 });
    runner.external({ event: 'run_output', run_id: 'agent-1', text: 'epoch 1\n' });
    runner.external({ event: 'run_waiting', run_id: 'agent-1', prompt: 'Go? ' });
  });
  const lastToolbar = () => page.evaluate(() => [...document.querySelectorAll('.mrmd-cell-toolbar')].at(-1).textContent);
  assert.match(await lastToolbar(), /^Lilly's agent · waiting for input · [34]s$/);
  assert.equal(await page.evaluate(() => runner.cancelCell('waiting', editor.listCells().at(-1))), 'other');
  assert.deepEqual(await page.evaluate(() => calls.at(-1)), ['interrupt'], 'Stop on another client’s run interrupts the kernel');
  assert.equal(await page.$$eval('.mrmd-cell-run-field', f => f.filter(x => x.offsetParent).length), 0, 'another client\u2019s prompt is not answerable here');
  await page.evaluate(() => runner.external({ event: 'run_ended', run_id: 'agent-1', ok: true, duration_ms: 3100, output: 'epoch 1\nepoch 2\n__RAT_PLOT__:/c/a.png' }));
  await until(`/epoch 2/.test(document.querySelector('.mrmd-cell-run-output')?.textContent || '')`, 'the end did not fill in the output');
  assert.match(await page.$eval('.mrmd-cell-run-footer', f => f.textContent), /Lilly's agent’s run — shown here, not saved/);
  assert.equal(await lastToolbar(), "✓ Lilly's agent · 3.1s▶ Run");
  assert.ok(!(await page.evaluate(() => editor.getContent())).includes('epoch'), 'another client\u2019s output was written');
  await page.click('.mrmd-cell-run-close');
  assert.equal(await page.$$eval('.mrmd-cell-run', els => els.length), 0);

  // 4. Our own run reported by `rat events` before `rat run` says its id.
  await page.evaluate(() => { window.done = runner.run(editor.listCells().at(-1)); });
  await until(`!!pending['shared()'] && pending['shared()'].resolve && runner.running`, 'shared run');
  await page.evaluate(() => { runner.external({ event: 'run_started', run_id: 'rat-9', caller: 'Maxime (Chattering)', code: 'shared()' }); runner.external({ event: 'run_output', run_id: 'rat-9', text: 'x\n' }); pending['shared()'].onEvent({ type: 'started', ratRunId: 'rat-9' }); pending['shared()'].resolve({ code: 0, out: 'x', ms: 3 }); return done; });
  assert.equal(await page.$$eval('.mrmd-cell-run', els => els.length), 0, 'our own run was also drawn as someone else\u2019s');

  // 5. Run all: prose fences skipped, queued marks, stop from a queued cell.
  await page.evaluate(() => { for (const k of Object.keys(pending)) delete pending[k]; window.all = runner.runAll(); });
  await until(`!!pending['plot()']`, 'run all first cell');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.mrmd-cell-toolbar')].filter(t => t.textContent.startsWith('queued')).length), 2);
  assert.equal(await page.evaluate(() => runner.cancelCell('queued')), 'queue');
  await page.evaluate(() => { pending['plot()'].resolve({ code: 0, out: 'again', ms: 1 }); });
  assert.deepEqual(await page.evaluate(() => all.then(r => [r.ok, r.stoppedBefore])), [false, 1]);
  assert.equal(await page.evaluate(() => calls.filter(c => c[0] === 'run' && c[1] === 'not code').length), 0);

  // 6. The kernel restarts while another client runs: the run is closed out.
  await page.evaluate(() => { runner.external({ event: 'run_started', run_id: 'agent-2', caller: 'Lilly', code: 'plot()' }); runner.external({ event: 'kernel', state: 'running', restarted: true }); });
  assert.match(await page.$eval('.mrmd-cell-toolbar', el => el.textContent), /^✗ Lilly · kernel restarted/);

  await page.evaluate(() => { runner.destroy(); editor.destroy(); });
  assert.deepEqual(errors, []);
  console.log('notebook-runner: ok');
} finally {
  await browser.close();
}
