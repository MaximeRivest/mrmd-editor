// showCellRun: a running cell's live output and input prompts, drawn under
// the cell without touching the document text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
try {
  await page.setContent('<div id="editor" style="width:800px;height:600px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  const source = '# Doc\n\n```python\nname = input()\n```\n\n```output\nold result\n```\n\nafter\n';
  await page.evaluate(doc => {
    window.changes = 0;
    window.editor = mrmdDocument.createDocumentEditor('#editor', { doc, onChange: () => window.changes++ });
    window.cell = editor.listCells()[0];
    window.run = editor.showCellRun(cell);
  }, source);

  // Output streams in; carriage returns redraw a progress line in place;
  // ANSI styling is dropped; links are clickable.
  await page.evaluate(() => {
    run.append('step 1\n');
    run.append('progress 10%\rprogress 90%');
    run.append('\r\x1b[32mprogress 100%\x1b[0m\nOpen https://example.org/device?code=AB-12.\n');
  });
  await frame();
  const shown = await page.$eval('.mrmd-cell-run-output', el => el.textContent);
  assert.equal(shown, 'step 1\nprogress 100%\nOpen https://example.org/device?code=AB-12.\n');
  assert.equal(await page.$eval('.mrmd-cell-run-output a', a => a.href), 'https://example.org/device?code=AB-12');
  assert.equal(await page.$$eval('.mrmd-cell-output-stale', els => els.length), 3, 'the owned result block is dimmed');

  // A prompt: text field, focused; Enter answers.
  await page.evaluate(() => { window.reply = null; run.ask({ prompt: 'Your name: ' }).then(r => window.reply = r); });
  await page.waitForFunction(() => document.activeElement?.classList.contains('mrmd-cell-run-field'));
  assert.equal(await page.$eval('.mrmd-cell-run-field', el => el.type), 'text');
  assert.equal(await page.$eval('.mrmd-cell-run-prompt', el => el.textContent), 'Your name:');
  await page.keyboard.type('Alice');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.reply);
  assert.deepEqual(await page.evaluate(() => window.reply), { text: 'Alice' });
  assert.equal(await page.$eval('.mrmd-cell-run-input', el => el.hidden), true);

  // A secret prompt: password field; Esc dismisses.
  await page.evaluate(() => { window.reply = null; run.ask({ prompt: 'Password: ', secret: true }).then(r => window.reply = r); });
  await page.waitForFunction(() => document.activeElement?.type === 'password');
  await page.keyboard.type('hunter2');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.reply);
  assert.deepEqual(await page.evaluate(() => window.reply), { dismissed: true });
  assert.equal(await page.$eval('.mrmd-cell-run-field', el => el.value), '', 'a dismissed secret is cleared');

  // The question can be withdrawn (answered elsewhere, or the run ended).
  await page.evaluate(() => { window.reply = null; run.ask({ prompt: 'again' }).then(r => window.reply = r); run.dismissInput(); });
  await page.waitForFunction(() => window.reply);
  assert.deepEqual(await page.evaluate(() => window.reply), { withdrawn: true });

  // Edits above the cell move the panel with it.
  await page.evaluate(() => editor.view.dispatch({ changes: { from: 0, insert: 'Intro line\n\n' } }));
  await frame();
  const below = await page.evaluate(() => {
    const fence = [...document.querySelectorAll('.cm-line')].find(l => l.textContent.includes('name = input()'));
    return document.querySelector('.mrmd-cell-run').getBoundingClientRect().top > fence.getBoundingClientRect().top;
  });
  assert.equal(below, true, 'the panel stays under its cell');

  // None of that was document text: the only change so far is the edit.
  assert.equal(await page.evaluate(() => window.changes), 1);
  assert.equal(await page.evaluate(() => editor.getContent()), 'Intro line\n\n' + source);

  // The host writes the result once, then disposes the panel.
  await page.evaluate(() => {
    const fresh = editor.listCells()[0];
    editor.setCellOutput(fresh, 'hello Alice');
    run.dispose();
  });
  await frame();
  assert.equal(await page.$$eval('.mrmd-cell-run', els => els.length), 0);
  assert.equal(await page.$$eval('.mrmd-cell-output-stale', els => els.length), 0);
  assert.match(await page.evaluate(() => editor.getContent()), /```output\nhello Alice\n```/);
  assert.equal(await page.evaluate(() => { run.append('late'); return editor.getContent().includes('late'); }), false, 'a disposed run ignores late output');

  await page.evaluate(() => editor.destroy());
  assert.deepEqual(errors, []);
  console.log('document-cell-run: ok');
} finally {
  await browser.close();
}
