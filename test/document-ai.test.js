// AI commands in the document editor, with a scripted host: the command
// box, suggestions that are not document text until accepted, accepting as
// one undo step, discarding, asking again, and the guards.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const until = async (expr, what) => { for (let i = 0; i < 150; i++) { if (await page.evaluate(expr)) return; await new Promise(r => setTimeout(r, 20)); } assert.fail(what); };
const content = () => page.evaluate(() => editor.getContent());
try {
  await page.setContent('<div id="editor" style="width:800px;height:700px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  const source = '---\ntitle: T\n---\n\n# Doc\n\nTheir going to the store.\n\nSecond paragraph ends\n\n```python\nx = 1\n```\n\n```output\n1\n```\n';
  await page.evaluate(doc => {
    window.asked = []; window.accepted = []; window.before = []; window.notes = []; window.changes = 0;
    window.answers = {}; // command → answer text; a function receives the request
    window.editor = mrmdDocument.createDocumentEditor('#editor', {
      doc, onRunCell() {}, onChange: () => changes++,
      ai: {
        commands: [
          { id: 'grammar', label: 'Fix grammar', scope: 'prose', target: 'selection-or-block', kind: 'replace', keywords: ['spelling'] },
          { id: 'continue', label: 'Finish the sentence', scope: 'prose', target: 'cursor', kind: 'insert' },
          { id: 'names', label: 'Improve names', scope: 'code', target: 'selection-or-block', kind: 'replace' },
          { id: 'edit', label: 'Change it', scope: 'any', target: 'selection-or-block', kind: 'replace', instruction: true },
        ],
        run: (request, { signal, onText }) => new Promise((resolve, reject) => {
          asked.push(request);
          const answer = answers[request.command];
          const text = typeof answer === 'function' ? answer(request) : answer;
          if (text instanceof Error) return reject(text);
          onText(text.slice(0, 5));
          // With `hold` set, the answer waits for release(): a test can look at a command in flight.
          const deliver = () => resolve({ text, model: 'test-model' });
          const t = window.hold ? (window.release = deliver, 0) : setTimeout(deliver, 60);
          signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
        }),
        model: () => 'test-model',
        beforeAccept: e => { before.push(e.command); },
        onAccept: e => accepted.push(e),
        notify: m => notes.push(m),
      },
    });
  }, source);
  const cursorIn = (needle, offset = 0) => page.evaluate((n, o) => { editor.view.dispatch({ selection: { anchor: editor.getContent().indexOf(n) + o } }); editor.focus(); }, needle, offset);
  const openBox = async () => { await page.keyboard.down('Control'); await page.keyboard.press('j'); await page.keyboard.up('Control'); await page.waitForSelector('.mrmd-ai-menu-input'); };
  // The spark on screen (the gutter's width spacer is a hidden copy).
  const SPARK = `document.querySelector('.mrmd-ai-spark-gutter .cm-gutterElement:not([style*="visibility"]) .mrmd-ai-spark')`;
  const sparkMode = () => page.evaluate(`${SPARK}?.dataset.mode ?? null`);
  const keyHelp = () => page.evaluate(() => editor.keyHelp().map(s => ({ ...s, keys: s.keys.map(([names, what]) => [names.join(' '), what]) })));
  await page.emulateFocusedPage(true); // the spark shows while the editor has focus, in a focused page

  // The spark: a ✦ in the margin of the cursor's line, faint at rest; lit
  // for a selection. It is not document text.
  await cursorIn('Their going', 3);
  await until(`${SPARK}?.dataset.mode === 'rest'`, 'no spark beside the cursor');
  assert.ok(await page.evaluate(`(() => {
    const pos = editor.getContent().indexOf('Their going');
    const block = editor.view.lineBlockAt(pos);
    const top = ${SPARK}.closest('.cm-gutterElement').getBoundingClientRect().top;
    return Math.abs(top - (editor.view.documentTop + block.top)) < 1.5;
  })()`), 'the spark is on the line of the cursor');
  assert.equal(await content(), source);
  await page.evaluate(() => { const at = editor.getContent().indexOf('Their'); editor.view.dispatch({ selection: { anchor: at, head: at + 5 } }); });
  assert.equal(await sparkMode(), 'selection');
  assert.match(await page.evaluate(`${SPARK}.title`), /AI commands for the selection \(Ctrl\+J\)/);

  // Clicking it opens the box on the selection, and the box names its key
  // (it was not opened with it).
  await page.evaluate(`${SPARK}.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))`);
  await page.waitForSelector('.mrmd-ai-menu-input');
  assert.match(await page.$eval('.mrmd-ai-menu-head', e => e.textContent), /selection · 5 characters/);
  assert.match(await page.$eval('.mrmd-ai-menu-foot', e => e.textContent), /Ctrl\+J opens this box/);
  assert.equal(await sparkMode(), 'open', 'the box has the focus; the spark stays, lit');
  assert.deepEqual((await keyHelp()).map(s => [s.label, !!s.exclusive]), [['AI command box', true]], 'the open box owns the keyboard');
  await page.keyboard.press('Escape');

  // The editor's keys here, now: the box's key where commands act; the
  // run keys in a cell; nothing where AI commands cannot act.
  await cursorIn('Their going', 3);
  assert.deepEqual(await keyHelp(), [{ label: 'document', keys: [['Mod-j', 'AI commands: this paragraph — or click the ✦ beside the line']] }]);
  await cursorIn('x = 1', 1);
  assert.deepEqual(await keyHelp(), [{ label: 'python cell', keys: [
    ['Mod-Enter', 'run this cell'], ['Shift-Enter', 'run this cell, then go to the next'],
    ['Mod-j', 'AI commands: python cell — or click the ✦ beside the line'],
  ] }]);
  await cursorIn('title: T', 2);
  assert.deepEqual(await keyHelp(), []);
  assert.equal(await sparkMode(), null, 'no spark on the header');
  assert.equal(await page.evaluate(() => mrmdDocument.formatKey('Mod-j', { mac: false })), 'Ctrl+J');

  // The box: commands for prose here (not the code command), the model named.
  await cursorIn('Their going', 3);
  await openBox();
  assert.equal(await page.evaluate(() => document.activeElement.className), 'mrmd-ai-menu-input');
  assert.deepEqual(await page.$$eval('.mrmd-ai-menu-label', els => els.map(e => e.textContent)), ['Fix grammar', 'Finish the sentence']);
  assert.match(await page.$eval('.mrmd-ai-menu-head', e => e.textContent), /this paragraph/);
  assert.match(await page.$eval('.mrmd-ai-menu-foot', e => e.textContent), /model: test-model/);

  assert.doesNotMatch(await page.$eval('.mrmd-ai-menu-foot', e => e.textContent), /opens this box/, 'opened with its key: no need to teach it');

  // Typing filters (a keyword counts); Enter runs the first. While the
  // answer is written the spark pulses; ready, it is lit, and the buttons
  // show their keys.
  await page.evaluate(() => { answers.grammar = "They're going to the store."; window.hold = true; });
  await page.keyboard.type('spell');
  assert.deepEqual(await page.$$eval('.mrmd-ai-menu-label', els => els.map(e => e.textContent)), ['Fix grammar', 'Change it: “spell”']);
  await page.keyboard.press('Enter');
  await until(`${SPARK}?.dataset.mode === 'busy'`, 'the spark does not show the command in flight');
  assert.equal(await page.$$eval('.mrmd-ai-panel-title .mrmd-ai-glyph-busy', els => els.length), 1);
  assert.deepEqual((await keyHelp())[0], { label: 'AI suggestion', keys: [['Escape', 'stop']] });
  await page.evaluate(() => { window.hold = false; release(); });
  await until(`document.querySelector('.mrmd-ai-panel')?.dataset.state === 'ready'`, 'no ready suggestion');
  assert.equal(await sparkMode(), 'ready');
  assert.deepEqual(await page.$$eval('.mrmd-ai-panel-foot .mrmd-ai-btn', els => els.map(b => b.textContent)), ['Edit in text', 'AcceptTab', 'AnotherAlt+]', 'DiscardEsc']);
  assert.deepEqual((await keyHelp())[0], { label: 'AI suggestion', keys: [['Tab', 'accept'], ['Alt-]', 'another answer'], ['Escape', 'discard']] });
  assert.equal(await page.$$eval('.mrmd-ai-menu', els => els.length), 0, 'the box closed');
  assert.equal(await page.evaluate(() => asked.at(-1).target.text), 'Their going to the store.');
  assert.match(await page.$eval('.mrmd-ai-panel-body', e => e.innerHTML), /<del class="mrmd-ai-del">Their<\/del><ins class="mrmd-ai-ins">They're<\/ins>/);
  assert.equal(await content(), source, 'a suggestion is not document text');
  assert.equal(await page.evaluate(() => changes), 0, 'nothing reached the host as an edit');

  // Tab accepts: one transaction, one undo step, the host told.
  await page.keyboard.press('Tab');
  await until(`accepted.length === 1`, 'accept did not reach the host');
  assert.ok((await content()).includes("They're going to the store.\n\nSecond"));
  assert.deepEqual(await page.evaluate(() => [before, accepted[0].command, accepted[0].model, accepted[0].replaced]), [['grammar'], 'grammar', 'test-model', 'Their going to the store.']);
  assert.equal(await page.$$eval('.mrmd-ai-panel', els => els.length), 0);
  await page.evaluate(() => mrmdDocument && editor.view.focus());
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.equal(await content(), source, 'one undo step takes the whole suggestion back');

  // An insertion shows as ghost text; Escape discards; the repeat of the
  // text before the cursor is dropped.
  await cursorIn('ends', 4);
  await page.evaluate(() => { answers.continue = r => r.before.slice(-14) + ' here, and more.'; });
  await page.evaluate(() => editor.runAiCommand('continue'));
  await until(`document.querySelector('.mrmd-ai-ghost')?.dataset.state === 'ready'`, 'no ghost text');
  assert.equal(await page.$eval('.mrmd-ai-ghost-text', e => e.textContent), ' here, and more.');
  await page.keyboard.press('Escape');
  assert.equal(await page.$$eval('.mrmd-ai-ghost', els => els.length), 0);
  assert.equal(await content(), source);

  // Another answer: kept side by side; the panel steps through them.
  await page.evaluate(() => { window.n = 0; answers.continue = () => ' answer ' + (++window.n) + '.'; });
  await page.evaluate(() => editor.runAiCommand('continue'));
  await until(`document.querySelector('.mrmd-ai-ghost')?.dataset.state === 'ready'`, 'first answer');
  await page.keyboard.down('Alt'); await page.keyboard.press(']'); await page.keyboard.up('Alt');
  await until(`/2 \\/ 2/.test(document.querySelector('.mrmd-ai-panel-meta')?.textContent || '') && document.querySelector('.mrmd-ai-panel').dataset.state === 'ready'`, 'second answer');
  assert.equal(await page.$eval('.mrmd-ai-panel-body', e => e.textContent), ' answer 2.');
  await page.keyboard.down('Alt'); await page.keyboard.press('['); await page.keyboard.up('Alt');
  assert.equal(await page.$eval('.mrmd-ai-panel-body', e => e.textContent), ' answer 1.');

  // Editing inside the suggested range discards it (it would describe
  // other text); a stopped request is aborted.
  await page.evaluate(() => { const at = editor.getContent().indexOf('ends') + 4; editor.view.dispatch({ changes: { from: at, insert: '!' } }); });
  assert.equal(await page.$$eval('.mrmd-ai-panel', els => els.length), 0);
  await page.evaluate(() => { const at = editor.getContent().indexOf('ends!'); editor.view.dispatch({ changes: { from: at + 4, to: at + 5 } }); });

  // An instruction: typed into the box, it becomes the instruction command.
  await cursorIn('Second', 2);
  await page.evaluate(() => { answers.edit = r => r.target.text.toUpperCase(); });
  await openBox();
  await page.keyboard.type('shout it');
  assert.equal(await page.$eval('.mrmd-ai-menu-item[aria-selected="true"] .mrmd-ai-menu-label', e => e.textContent), 'Change it: “shout it”');
  await page.keyboard.press('Enter');
  await until(`document.querySelector('.mrmd-ai-panel')?.dataset.state === 'ready'`, 'instruction suggestion');
  assert.equal(await page.evaluate(() => asked.at(-1).instruction), 'shout it');
  assert.match(await page.$eval('.mrmd-ai-panel-title', e => e.textContent), /Change it — “shout it”/);
  await page.click('.mrmd-ai-accept');
  await until(`editor.getContent().includes('SECOND PARAGRAPH ENDS')`, 'the accept button did not apply');

  // Code: the cell's ✦ selects its code and opens the box on it, with the
  // code commands; the result block and the header are left alone.
  await page.click('.mrmd-cell-btn-ai');
  await page.waitForSelector('.mrmd-ai-menu-input');
  assert.deepEqual(await page.$$eval('.mrmd-ai-menu-label', els => els.map(e => e.textContent)), ['Improve names']);
  assert.match(await page.$eval('.mrmd-ai-menu-head', e => e.textContent), /selection · 5 characters/);
  await page.keyboard.press('Escape');
  await cursorIn('```output\n1', '```output\n'.length);
  await openBox();
  assert.match(await page.$eval('.mrmd-ai-menu-empty', e => e.textContent), /result block/);
  await page.keyboard.press('Escape');
  await cursorIn('title: T', 2);
  assert.equal(await page.evaluate(() => editor.runAiCommand('grammar')), false);
  assert.match(await page.evaluate(() => notes.at(-1)), /header/);

  // Failures are shown and can be retried; nothing is written.
  await cursorIn('Doc', 1);
  const beforeFail = await content();
  await page.evaluate(() => { answers.grammar = new Error('model is down'); editor.runAiCommand('grammar'); });
  await until(`document.querySelector('.mrmd-ai-panel')?.dataset.state === 'error'`, 'no error shown');
  assert.match(await page.$eval('.mrmd-ai-panel-body', e => e.textContent), /model is down/);
  assert.equal(await content(), beforeFail);
  await page.keyboard.press('Escape');

  // Read-only documents have no AI commands.
  await page.evaluate(() => editor.setReadonly(true));
  assert.equal(await page.evaluate(() => editor.openAiMenu()), false);
  assert.match(await page.evaluate(() => notes.at(-1)), /read-only/);

  await page.evaluate(() => editor.destroy());
  assert.deepEqual(errors, []);
  console.log('document-ai: ok');
} finally {
  await browser.close();
}
