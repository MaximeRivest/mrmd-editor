import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.setContent('<div id="editor" style="width:800px;height:500px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  for (const code of [true, false]) {
    await page.evaluate(code => {
      window.editor?.destroy?.();
      const create = code ? mrmdDocument.createCodeEditor : mrmdDocument.createDocumentEditor;
      window.editor = create('#editor', { filename: 'example.js', doc: 'first\nsecond', lineGutter: true, onLineHover: async () => 'Fixture author' });
      editor.setLineMarks({ 1: { glyph: '▎', title: 'changed', cls: 'first-mark' } }, editor.getContent());
    }, code);
    await page.waitForSelector('.mrmd-line-mark');
    await page.hover('.mrmd-line-mark');
    await page.waitForFunction(() => document.querySelector('.mrmd-line-mark').title === 'Fixture author');
    assert.equal(await page.evaluate(() => editor.setLineMarks({ 2: { glyph: 'x' } }, 'stale')), false);
    await page.evaluate(() => editor.setLineMarks({ 1: { glyph: '▎', title: 'changed', cls: 'new-mark' } }, editor.getContent()));
    await page.waitForFunction(() => document.querySelector('.mrmd-line-mark').classList.contains('new-mark'));
    if (!code) assert.equal(await page.$eval('.cm-lineNumbers', el => getComputedStyle(el).display), 'none');
    await page.evaluate(() => editor.view.dispatch({ changes: { from: 0, insert: 'new ' } }));
    assert.equal(await page.$$eval('.mrmd-line-mark', els => els.length), 0, 'stale provenance survived an edit');
    assert.equal(await page.evaluate(() => editor.setDiagnostics([], 'old content')), false);
    assert.equal(await page.evaluate(() => editor.setDiagnostics([], editor.getContent())), true);
    await page.evaluate(() => editor.openSearch());
    await page.waitForSelector('.cm-search');
  }
  await page.evaluate(() => {
    editor.destroy();
    window.editor = mrmdDocument.createCodeEditor('#editor', { doc: 'const fixtureCompletion = 1;\nfixt', filename: 'test.js', onNavigateLocation: value => window.definition = value });
    editor.view.dispatch({ selection: { anchor: editor.getContent().length } }); editor.focus();
  });
  await page.keyboard.down('Control'); await page.keyboard.press('Space'); await page.keyboard.up('Control');
  await page.waitForFunction(() => document.querySelector('.cm-tooltip-autocomplete')?.textContent.includes('fixtureCompletion'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    editor.setLanguageServices({ complete: ctx => { window.pending = ctx; return new Promise(resolve => window.finish = resolve); }, definition: async () => ({ path: '/fixture.js', line: 3 }) });
  });
  await page.keyboard.down('Control'); await page.keyboard.press('Space'); await page.keyboard.up('Control');
  await page.waitForFunction(() => !!window.pending);
  await page.evaluate(() => { editor.view.dispatch({ changes: { from: editor.getContent().length, insert: 'x' } }); finish({ from: pending.pos - 4, options: [{ label: 'staleResult' }] }); });
  assert.equal(await page.evaluate(() => pending.signal.aborted), true);
  await page.keyboard.press('Escape'); await page.keyboard.press('F12');
  await page.waitForFunction(() => window.definition?.line === 3);
  await page.evaluate(() => editor.destroy());
  assert.deepEqual(errors, []);
  console.log('document host services passed');
} finally { await browser.close(); }
