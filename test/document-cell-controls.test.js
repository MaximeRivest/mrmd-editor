// Cell controls: a Run button on runnable cells, and the run state drawn
// on the cell (queued, running with elapsed time, waiting, verdict).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 900, height: 700 });
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const texts = () => page.$$eval('.mrmd-cell-toolbar', els => els.map(el => el.textContent));
try {
  await page.setContent('<style>button { min-height: 30px; padding: 4px 12px; font: 14px serif; }</style><div id="editor" style="width:860px;height:660px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  const source = '# Doc\n\n```python\nx = 1\nprint(x)\n```\n\n```output\n1\n```\n\n```\nplain fence\n```\n\n```sh\necho hi\n```\n\n```text\nnot code\n```\n\nafter\n';
  await page.evaluate(doc => {
    window.runs = []; window.cancels = [];
    window.editor = mrmdDocument.createDocumentEditor('#editor', {
      doc,
      runnableLanguages: ['python', 'sh'],
      onRunCell: (cell, o) => runs.push({ code: cell.code, advance: o.advance }),
      onCancelCell: (cell, info) => cancels.push([cell.code, info.state]),
    });
  }, source);
  await frame();

  // Runnable cells only: python and sh — not output, a bare fence, or text.
  assert.deepEqual(await texts(), ['▶ Run', '▶ Run']);
  assert.equal(await page.$eval('.mrmd-cell-btn-run', b => b.getBoundingClientRect().height), 19, 'a host button style does not stretch the control');

  // The button runs its own cell and leaves the document and cursor alone.
  await page.evaluate(() => editor.view.dispatch({ selection: { anchor: 2 } }));
  const buttons = await page.$$('.mrmd-cell-btn-run');
  await buttons[1].click();
  assert.deepEqual(await page.evaluate(() => runs), [{ code: 'echo hi', advance: false }]);
  assert.equal(await page.evaluate(() => editor.view.state.selection.main.head), 2);
  assert.equal(await page.evaluate(() => editor.getContent()), source);

  // Running: elapsed time ticks, Stop replaces Run, every row carries the bar.
  await page.evaluate(() => editor.setCellStatus(editor.listCells()[0], { state: 'running', startedAt: Date.now() - 5000 }));
  await frame();
  const first = (await texts())[0];
  assert.match(first, /^running · [56]s■ Stop$/);
  assert.equal(await page.$$eval('.cm-line.mrmd-cell-running', els => els.length), 4, 'fence, two code rows, fence');
  await new Promise(r => setTimeout(r, 1100));
  assert.notEqual((await texts())[0], first, 'the elapsed time moves on its own');
  await (await page.$('.mrmd-cell-btn-stop')).click();
  assert.deepEqual(await page.evaluate(() => cancels), [['x = 1\nprint(x)', 'running']]);

  // Waiting: the reader's turn — no pulsing bar, a steady one.
  await page.evaluate(() => editor.setCellStatus(editor.listCells()[0], { state: 'waiting', startedAt: Date.now() - 65000 }));
  await frame();
  assert.match((await texts())[0], /^waiting for input · 1m 0[56]s■ Stop$/);
  assert.equal(await page.$$eval('.cm-line.mrmd-cell-waiting', els => els.length), 4);
  assert.equal(await page.$eval('.cm-line.mrmd-cell-waiting', el => getComputedStyle(el, '::before').animationName), 'none');
  assert.notEqual(await page.$eval('.cm-line.mrmd-cell-running, .cm-line.mrmd-cell-waiting', el => getComputedStyle(el, '::before').content), 'none');

  // Queued (run all), on the second cell.
  await page.evaluate(() => editor.setCellStatus(editor.listCells()[1], { state: 'queued' }));
  await frame();
  assert.equal((await texts())[1], 'queued■ Stop');
  await page.screenshot({ path: '/tmp/mrmd-cell-controls-busy.png' });

  // Verdicts; Run comes back.
  await page.evaluate(() => {
    editor.setCellStatus(editor.listCells()[0], { state: 'ok', ms: 1234 });
    editor.setCellStatus(editor.listCells()[1], { state: 'error', ms: 400, label: 'cancelled' });
  });
  await frame();
  assert.deepEqual(await texts(), ['✓ 1.2s▶ Run', '✗ cancelled · 400ms▶ Run']);
  assert.equal(await page.$$eval('.mrmd-cell-busy', els => els.length), 0);
  await page.screenshot({ path: '/tmp/mrmd-cell-controls-done.png' });

  // A result written under the cell, or an edit elsewhere, keeps the
  // verdict; editing the cell's code drops it.
  await page.evaluate(() => {
    editor.setCellOutput(editor.listCells()[0], '1\n2');
    editor.view.dispatch({ changes: { from: 0, insert: 'Intro\n\n' } });
  });
  await frame();
  assert.deepEqual(await texts(), ['✓ 1.2s▶ Run', '✗ cancelled · 400ms▶ Run']);
  await page.evaluate(() => {
    const cell = editor.listCells()[0];
    editor.view.dispatch({ changes: { from: cell.to - 4, insert: '\ny = 2' } });
  });
  await frame();
  assert.deepEqual(await texts(), ['▶ Run', '✗ cancelled · 400ms▶ Run']);

  // A run owns its cell's status: edits above the cell move it, and the
  // run still finds it; its verdict outlives the panel.
  await page.evaluate(() => {
    window.run = editor.showCellRun(editor.listCells()[0]);
    run.setStatus({ state: 'running', startedAt: Date.now() });
    editor.view.dispatch({ changes: { from: 0, insert: 'More\n\n' } });
  });
  await frame();
  assert.match((await texts())[0], /^running · /);
  await page.evaluate(() => { run.setStatus({ state: 'ok', ms: 2500 }); run.dispose(); });
  await frame();
  assert.equal((await texts())[0], '✓ 2.5s▶ Run');
  assert.equal(await page.evaluate(() => run.setStatus({ state: 'running' })), false, 'a disposed run no longer speaks for the cell');

  // Stop reports the state it was pressed in; queued marks clear together.
  await page.evaluate(() => { cancels.length = 0; editor.setCellStatus(editor.listCells()[1], { state: 'queued' }); editor.setCellStatus(editor.listCells()[0], { state: 'queued' }); });
  await frame();
  await (await page.$('.mrmd-cell-btn-stop')).click();
  assert.deepEqual(await page.evaluate(() => cancels), [['x = 1\nprint(x)\ny = 2', 'queued']]);
  await page.evaluate(() => editor.clearCellStatuses(['queued']));
  await frame();
  assert.deepEqual(await texts(), ['▶ Run', '▶ Run']);

  // A stale cell is refused.
  assert.equal(await page.evaluate(() => editor.setCellStatus({ from: 3, to: 9, code: 'x' }, { state: 'running' })), false);

  // Without onRunCell, no buttons.
  await page.evaluate(doc => { editor.destroy(); window.editor = mrmdDocument.createDocumentEditor('#editor', { doc }); }, source);
  await frame();
  assert.equal(await page.$$eval('.mrmd-cell-toolbar', els => els.length), 0);

  await page.evaluate(() => editor.destroy());
  assert.deepEqual(errors, []);
  console.log('document-cell-controls: ok');
} finally {
  await browser.close();
}
