// Long lines wrap by default, and the host can switch it, in both editors.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.setContent('<div id="doc" style="width:400px;height:200px"></div><div id="code" style="width:400px;height:200px"></div>');
  await page.evaluate(readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8'));
  const long = 'word '.repeat(200);
  const state = () => page.evaluate(() => [doc, code].map(e => [e.view.contentDOM.classList.contains('cm-lineWrapping'), e.view.scrollDOM.scrollWidth > e.view.scrollDOM.clientWidth + 1]));
  await page.evaluate(long => {
    window.doc = mrmdDocument.createDocumentEditor('#doc', { doc: long });
    window.code = mrmdDocument.createCodeEditor('#code', { doc: long, filename: 'a.txt', lineWrapping: false });
  }, long);
  assert.deepEqual(await state(), [[true, false], [false, true]], 'the document wraps by default; the code editor as asked');
  await page.evaluate(() => { doc.setLineWrapping(false); code.setLineWrapping(true); });
  assert.deepEqual(await page.evaluate(() => [doc, code].map(e => e.view.contentDOM.classList.contains('cm-lineWrapping'))), [false, true]);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await page.evaluate(() => code.view.scrollDOM.scrollWidth > code.view.scrollDOM.clientWidth + 1), false, 'wrapped: no sideways scroll');
  assert.deepEqual(errors, []);
  console.log('line-wrapping: ok');
} finally {
  await browser.close();
}
