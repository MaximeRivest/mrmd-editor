// Reviewing proposed changes in the text: a proposal shows against the old
// text with Accept / Reject, the person's own edits elsewhere never become
// changes to review, a proposal can be edited before it is accepted, and
// each proposal's outcome (before, proposed, kept) reaches the host. AI
// commands in review mode answer this way and report every outcome.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
const until = async (expr, what) => { for (let i = 0; i < 150; i++) { if (await page.evaluate(expr)) return; await new Promise(r => setTimeout(r, 20)); } assert.fail(what); };
const content = () => page.evaluate(() => editor.getContent());
const key = async (combo) => {
  const parts = combo.split('+'), k = parts.pop();
  for (const m of parts) await page.keyboard.down(m);
  await page.keyboard.press(k);
  for (const m of parts.reverse()) await page.keyboard.up(m);
};
try {
  await page.setContent('<div id="editor" style="width:800px;height:700px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  const source = '# Doc\n\nFirst paragraph stays.\n\nTheir going to the store.\n\nLast paragraph.\n';
  await page.evaluate(doc => {
    window.resolved = []; window.outcomes = []; window.mode = 'review';
    window.editor = mrmdDocument.createDocumentEditor('#editor', {
      doc,
      review: { onResolved: o => resolved.push(o) },
      ai: {
        commands: [{ id: 'grammar', label: 'Fix grammar', scope: 'prose', target: 'selection-or-block', kind: 'replace' }],
        run: request => Promise.resolve({ text: request.target.text.replace('Their', "They're"), model: 'test-model' }),
        mode: { get: () => mode, set: m => { mode = m; } },
        onOutcome: o => outcomes.push(o),
      },
    });
    editor.focus();
  }, source);
  const at = (needle, offset = 0) => page.evaluate((n, o) => editor.getContent().indexOf(n) + o, needle, offset);

  // A proposal: the text changes, the old line shows struck through above
  // it with Accept / Reject, and the panel counts it.
  const from = await at('Their'), to = await at('store.', 6);
  const id = await page.evaluate((from, to) => editor.review.propose({ from, to, insert: "They're going to the shop.", meta: { label: 'Test' } }), from, to);
  assert.ok(id);
  assert.ok((await content()).includes("They're going to the shop."));
  assert.equal(await page.$eval('.cm-deletedChunk .cm-deletedLine', e => e.textContent), 'Their going to the store.');
  assert.deepEqual(await page.$$eval('.cm-deletedChunk .mrmd-review-btn', els => els.map(e => e.textContent)), ['AcceptAlt+Y', 'RejectAlt+N']);
  assert.match(await page.$eval('.mrmd-review-panel', e => e.textContent), /1 change to review · Test/);
  assert.equal(await page.evaluate(() => editor.review.summary().changes), 1);

  // The person's own typing elsewhere is not a change to review.
  await page.evaluate(() => { const p = editor.getContent().indexOf('stays.'); editor.view.dispatch({ changes: { from: p, insert: 'really ' } }); });
  assert.equal(await page.evaluate(() => editor.review.summary().changes), 1, 'typing elsewhere stays out of the review');

  // A second proposal over the first is refused: decide that one first.
  assert.equal(await page.evaluate(p => editor.review.propose({ from: p, to: p + 4, insert: 'X' }), await at("They're")), null);

  // Edited before it is accepted: the kept text is the edited one.
  await page.evaluate(() => { const p = editor.getContent().indexOf('shop'); editor.view.dispatch({ changes: { from: p, to: p + 4, insert: 'market' }, selection: { anchor: p } }); editor.focus(); });
  assert.equal(await page.evaluate(() => editor.review.summary().changes), 1, 'an edit of the proposal is part of it');
  await key('Alt+KeyY');
  await until(`resolved.length === 1`, 'accepting did not resolve the proposal');
  assert.deepEqual(await page.evaluate(() => [resolved[0].id, resolved[0].decision, resolved[0].meta.label, resolved[0].hunks]), [id, 'edited', 'Test',
    [{ before: 'Their going to the store.\n', proposed: "They're going to the shop.\n", final: "They're going to the market.\n", decision: 'edited' }]]);
  await until(`!document.querySelector('.mrmd-review-panel') && !document.querySelector('.cm-editor.mrmd-review')`, 'the review did not end');
  assert.ok((await content()).includes('First paragraph really stays.'));

  // Rejected with its button: the text goes back.
  const before = await content();
  const p2 = await at('Last paragraph.');
  await page.evaluate(p => editor.review.propose({ from: p, to: p + 15, insert: 'Final words.' }), p2);
  await page.click('.cm-deletedChunk .mrmd-review-reject');
  await until(`resolved.length === 2`, 'rejecting did not resolve');
  assert.equal(await page.evaluate(() => resolved[1].decision), 'rejected');
  assert.equal(await content(), before);

  // The cursor lands on the first changed line, not on the proposal's first
  // (unchanged) line: that is where Alt-y acts.
  await page.evaluate(() => { window.earlier = resolved.splice(0); });
  const landed = await page.evaluate(() => { const p = editor.getContent().indexOf('# Doc'); editor.review.propose({ from: p, to: p + '# Doc\n\nFirst'.length, insert: '# Doc\n\nOpening' }); return editor.view.state.selection.main.head === editor.view.state.doc.lineAt(editor.getContent().indexOf('Opening')).from; });
  assert.equal(landed, true);
  // Two proposals a blank line apart show as one change: one Reject undoes
  // both, and each records exactly what its own lines became.
  await page.evaluate(() => { const p = editor.getContent().indexOf("They're"); editor.review.propose({ from: p, to: p + 7, insert: 'We are' }); const q = editor.getContent().indexOf('Opening'); editor.view.dispatch({ selection: { anchor: q } }); editor.focus(); });
  assert.equal(await page.evaluate(() => editor.review.summary().changes), 1, 'shown as one change');
  await key('Alt+KeyN');
  await until(`resolved.length === 2`, 'rejecting the joined change did not resolve both');
  assert.deepEqual(await page.evaluate(() => resolved.map(r => [r.decision, r.hunks[0].final])),
    [['rejected', '# Doc\n\nFirst paragraph really stays.\n'], ['rejected', "They're going to the market.\n"]]);
  await page.evaluate(() => { resolved.splice(0, resolved.length, ...earlier); });

  // A capture: an agent writes two places; accept all keeps both.
  await page.evaluate(() => {
    window.cap = editor.review.capture({ label: 'Agent' });
    editor.updateContent(editor.getContent().replace('# Doc', '# Document').replace('Last paragraph.', 'Last paragraph, longer.'));
    window.capEnded = cap.end();
  });
  assert.equal(await page.evaluate(() => capEnded), true);
  assert.equal(await page.evaluate(() => editor.review.summary().changes), 2);
  assert.equal(await page.evaluate(() => (editor.view.dispatch({ selection: { anchor: editor.getContent().length } }), editor.review.first(), editor.view.state.selection.main.head)), 0, 'first() goes to the first change, even on line 1');
  await page.click('.mrmd-review-panel .mrmd-review-accept');
  await until(`resolved.length === 3`, 'accept all did not resolve');
  assert.deepEqual(await page.evaluate(() => [resolved[2].decision, resolved[2].hunks.length]), ['accepted', 2]);

  // A capture in which nothing changed proposes nothing and leaves no review.
  assert.equal(await page.evaluate(() => editor.review.capture({}).end()), false);
  await until(`!document.querySelector('.mrmd-review-panel')`, 'an empty capture left a review open');

  // An AI command in review mode: the answer goes into the text as a change
  // to review; rejecting it is reported with the command's outcome.
  await page.evaluate(() => { const p = editor.getContent().indexOf("They're"); editor.view.dispatch({ changes: { from: p, to: p + 7, insert: 'Their' }, selection: { anchor: p + 2 } }); });
  assert.equal(await page.evaluate(() => editor.runAiCommand('grammar')), true);
  await until(`editor.review.summary().changes === 1`, 'the answer did not go into the text');
  assert.deepEqual(await page.evaluate(() => [outcomes.at(-1).decision, outcomes.at(-1).mode, outcomes.at(-1).answers[0].text]), ['review', 'review', "They're going to the market."]);
  const op = await page.evaluate(() => outcomes.at(-1).op);
  await page.evaluate(() => editor.focus());
  await key('Alt+KeyN');
  await until(`resolved.length === 4`, 'the command\u2019s change was not resolved');
  assert.deepEqual(await page.evaluate(() => [resolved[3].meta.op, resolved[3].meta.command, resolved[3].decision]), [op, 'grammar', 'rejected']);

  // Suggest mode: the answer waits beside the text; "Edit in text" moves it in.
  await page.evaluate(() => { mode = 'suggest'; const p = editor.getContent().indexOf('Their'); editor.view.dispatch({ selection: { anchor: p } }); editor.runAiCommand('grammar'); });
  await until(`document.querySelector('.mrmd-ai-panel')?.dataset.state === 'ready'`, 'no suggestion');
  assert.equal(await page.evaluate(() => editor.review.summary().changes), 0, 'a suggestion is not in the text');
  await page.evaluate(() => [...document.querySelectorAll('.mrmd-ai-panel .mrmd-ai-btn')].find(b => b.textContent.startsWith('Edit in text')).click());
  await until(`editor.review.summary().changes === 1`, 'Edit in text did not put it in the text');
  await page.evaluate(() => editor.review.acceptAll());
  await until(`resolved.length === 5`, 'accept all did not resolve the command');
  assert.equal(await page.evaluate(() => resolved[4].decision), 'accepted');

  // Discarding a suggestion is an outcome too.
  await page.evaluate(() => { const p = editor.getContent().indexOf('First'); editor.view.dispatch({ selection: { anchor: p } }); editor.runAiCommand('grammar'); });
  await until(`['ready', 'error'].includes(document.querySelector('.mrmd-ai-panel')?.dataset.state)`, 'no second answer'); // nothing to fix there: an error, discarded all the same
  await page.evaluate(() => editor.focus());
  await key('Escape');
  await until(`outcomes.at(-1).decision === 'discarded'`, 'discarding was not reported');

  // The key help names the review keys while there is something to review.
  await page.evaluate(() => { const p = editor.getContent().indexOf('# Document'); editor.review.propose({ from: p, to: p + 10, insert: '# Title' }); editor.view.dispatch({ selection: { anchor: p + 3 } }); });
  const help = await page.evaluate(() => editor.keyHelp().find(s => s.label === 'AI changes to review'));
  assert.deepEqual(help.keys.slice(0, 2).map(k => k[0].join()), ['Alt-y', 'Alt-n']);

  // Closing the editor with a change under review: it stays, and says so.
  await page.evaluate(() => editor.destroy());
  assert.deepEqual(await page.evaluate(() => [resolved.at(-1).how, resolved.at(-1).decision]), ['closed', 'left']);

  // The code editor reviews the same way.
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="code" style="width:600px;height:300px"></div>');
    window.codeResolved = [];
    window.code = mrmdDocument.createCodeEditor('#code', { doc: 'a = 1\nb = 2\n', filename: 'x.py', review: { onResolved: o => codeResolved.push(o) } });
    const c = code.review.capture({ label: 'Agent' });
    code.updateContent('a = 1\nb = 3\n');
    c.end();
  });
  assert.equal(await page.evaluate(() => code.review.summary().changes), 1);
  await page.evaluate(() => code.review.rejectAll());
  await until(`codeResolved.length === 1`, 'the code editor did not resolve');
  assert.equal(await page.evaluate(() => code.getContent()), 'a = 1\nb = 2\n');

  assert.deepEqual(errors, []);
  console.log('document-review: ok');
} finally {
  await browser.close();
}
