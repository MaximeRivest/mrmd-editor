// AI commands in the whole-file editor: what a command acts on without a
// selection (the construct at the cursor in a source file, with the
// comments above it; the paragraph in plain text), the ✦ beside the line,
// the box, suggestions and review — the same surface as in documents.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const until = async (expr, what) => { for (let i = 0; i < 150; i++) { if (await page.evaluate(expr)) return; await new Promise(r => setTimeout(r, 20)); } assert.fail(what); };
try {
  await page.setContent('<div id="py" style="width:800px;height:420px"></div><div id="json" style="width:800px;height:200px"></div><div id="txt" style="width:800px;height:200px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  await page.emulateFocusedPage(true);
  const PY = [
    'import os',
    'import sys',
    '',
    '# Adds two numbers.',
    '# Used by the CLI.',
    'def add(a, b):',
    '    total = a + b',
    '',
    '    return total',
    '',
    '',
    'x = 1',
  ].join('\n');
  await page.evaluate(PY => {
    window.asked = []; window.outcomes = [];
    const commands = [
      { id: 'grammar', label: 'Fix grammar', scope: 'prose', target: 'selection-or-block', kind: 'replace' },
      { id: 'comments', label: 'Document the code', scope: 'code', target: 'selection-or-block', kind: 'replace' },
      { id: 'code-line', label: 'Finish this line', scope: 'code', target: 'cursor', kind: 'insert' },
    ];
    const ai = extra => ({
      commands, ...extra,
      run: request => { asked.push(request); return Promise.resolve({ text: request.target.text.replace('total', 'sum'), model: 'test-model' }); },
      onOutcome: o => outcomes.push(o),
    });
    window.py = mrmdDocument.createCodeEditor('#py', { doc: PY, filename: 'calc.py', ai: ai({ scope: 'code', language: 'python' }) });
    window.json = mrmdDocument.createCodeEditor('#json', { doc: JSON.stringify({ a: { b: [1, 2], c: 'x'.repeat(40) }, d: 'x'.repeat(13000) }, null, 2), filename: 'data.json', ai: ai({ scope: 'code', language: 'json' }) });
    window.txt = mrmdDocument.createCodeEditor('#txt', { doc: 'Their going.\nStill the first paragraph.\n\nSecond one.', filename: 'notes.txt', ai: ai({ scope: 'prose' }) });
  }, PY);
  const at = (ed, needle, offset = 0) => page.evaluate((ed, n, o) => { const e = window[ed]; const p = e.getContent().indexOf(n) + o; e.view.dispatch({ selection: { anchor: p } }); e.focus(); return p; }, ed, needle, offset);
  const lastTarget = () => page.evaluate(() => asked.at(-1).target.text);

  // A source file: "Document the code" in a function takes the function,
  // blank lines inside it, and the comments right above it.
  await at('py', 'total = a');
  assert.equal(await page.evaluate(() => py.runAiCommand('comments')), true);
  await until(`document.querySelector('.mrmd-ai-panel')?.dataset.state === 'ready'`, 'no suggestion in the source file');
  assert.equal(await lastTarget(), '# Adds two numbers.\n# Used by the CLI.\ndef add(a, b):\n    total = a + b\n\n    return total');
  assert.deepEqual(await page.evaluate(() => [asked.at(-1).scope, asked.at(-1).block.language]), ['code', 'python']);
  assert.match(await page.$eval('.mrmd-ai-panel-body', e => e.innerHTML), /<del class="mrmd-ai-del">total<\/del><ins class="mrmd-ai-ins">sum<\/ins>/);
  await page.keyboard.press('Tab');
  await until(`py.getContent().includes('sum = a + b')`, 'Tab did not accept in the source file');
  assert.equal(await page.evaluate(() => outcomes.at(-1).decision), 'accepted');

  // A one-line statement gives way to its group; a blank line has no block.
  await at('py', 'import sys');
  await page.evaluate(() => py.runAiCommand('comments'));
  await until(`asked.length === 2`, 'no second request');
  assert.equal(await lastTarget(), 'import os\nimport sys');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const e = py; const line = e.view.state.doc.line(11); e.view.dispatch({ selection: { anchor: line.from } }); });
  assert.equal(await page.evaluate(() => py.runAiCommand('comments')), false, 'nothing to act on between blocks');

  // Prose commands are not code commands; the box lists the file's own.
  await at('py', 'x = 1');
  assert.equal(await page.evaluate(() => py.runAiCommand('grammar')), false);
  await page.keyboard.down('Control'); await page.keyboard.press('j'); await page.keyboard.up('Control');
  await page.waitForSelector('.mrmd-ai-menu-input');
  assert.deepEqual(await page.$$eval('.mrmd-ai-menu-label', els => els.map(e => e.textContent)), ['Document the code', 'Finish this line']);
  assert.match(await page.$eval('.mrmd-ai-menu-head', e => e.textContent), /line 12/);
  await page.keyboard.press('Escape');

  // The ✦ beside the cursor's line, and the key help.
  await until(`document.querySelector('#py .mrmd-ai-spark-gutter .cm-gutterElement:not([style*="visibility"]) .mrmd-ai-spark')`, 'no spark in the source file');
  assert.deepEqual(await page.evaluate(() => py.keyHelp().map(s => s.label)), ['python file']);

  // A huge construct gives way to the one inside it that fits.
  await at('json', '"b"');
  await page.evaluate(() => json.runAiCommand('comments'));
  await until(`asked.length === 3`, 'no JSON request');
  assert.match(await lastTarget(), /^ {2}"a": \{\n[\s\S]*\n {2}\},?$/);
  await page.keyboard.press('Escape');

  // Plain text: prose commands, on the paragraph.
  await at('txt', 'Their', 2);
  assert.equal(await page.evaluate(() => txt.runAiCommand('comments')), false);
  await page.evaluate(() => txt.runAiCommand('grammar'));
  await until(`asked.length === 4`, 'no text request');
  assert.deepEqual(await page.evaluate(() => [asked.at(-1).target.text, asked.at(-1).scope]), ['Their going.\nStill the first paragraph.', 'prose']);
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, []);
  console.log('file-ai: ok');
} finally {
  await browser.close();
}
