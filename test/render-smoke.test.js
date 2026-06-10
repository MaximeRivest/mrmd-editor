/**
 * Headless rendering smoke test — seed of a golden-corpus harness.
 *
 * Loads the built IIFE bundle in a real browser, feeds it documents that
 * historically broke rendering (R `$` in inline code, currency, `$$` inside
 * fenced code), and asserts on the resulting DOM.
 *
 * Run: node test/render-smoke.test.js   (requires `npm run build` first)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundle = readFileSync(path.join(root, 'dist', 'mrmd.iife.js'), 'utf8');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function render(doc) {
  const page = await browser.newPage();
  page.on('pageerror', (err) => {
    throw new Error(`page error: ${err.message}`);
  });
  await page.setContent('<div id="editor" style="height:600px"></div>');
  await page.evaluate(bundle);
  await page.evaluate((content) => {
    window.editor = window.mrmd.create('#editor', { doc: content });
    // Move the cursor to the end so no content line is the "active" line.
    const len = window.editor.view.state.doc.length;
    window.editor.view.dispatch({ selection: { anchor: len } });
  }, doc);
  // Let decorations settle.
  await new Promise((r) => setTimeout(r, 300));
  const result = await page.evaluate(() => ({
    mathWidgets: document.querySelectorAll('.cm-md-math, [class*="math-inline"], .katex').length,
    text: document.querySelector('#editor').innerText,
  }));
  await page.close();
  return result;
}

// 1. R-flavored prose: `df$col` in inline code must not become math.
{
  const r = await render('Use `df$col` and `df$other` to select columns.\n\nmore prose\n');
  assert.equal(r.mathWidgets, 0, `R inline code rendered as math (${r.mathWidgets} widgets)`);
}

// 2. Currency must not become math.
{
  const r = await render('It costs $5 and $10 more than expected.\n\nmore prose\n');
  assert.equal(r.mathWidgets, 0, `currency rendered as math (${r.mathWidgets} widgets)`);
}

// 3. Real math must still render.
{
  const r = await render('Euler: $e^{i\\pi} + 1 = 0$ is famous.\n\nmore prose\n');
  assert.ok(r.mathWidgets > 0, 'real inline math did not render');
}

// 4. `$$` inside a fenced code block must not pair with prose math.
{
  const doc = [
    '```python',
    's = "$$"',
    '```',
    '',
    'plain text after the code block',
    '',
    '$$',
    'x = y',
    '$$',
    '',
    'tail prose',
    '',
  ].join('\n');
  const r = await render(doc);
  // The prose between the code block and the real display math must survive.
  assert.ok(
    r.text.includes('plain text after the code block'),
    'prose was swallowed by $$ pairing across a code block'
  );
}

// ── Layout stability (the "typing fast makes the page jump" bug) ──

const tableRows = Array.from({ length: 8 }, (_, i) => `| r${i}a | r${i}b | r${i}c |`).join('\n');
const stabilityDoc = [
  '---',
  'title: Stability',
  'author: test',
  '---',
  '',
  '| A | B | C |',
  '|---|---|---|',
  tableRows,
  '',
  '$$',
  '\\int_0^1 x^2 dx',
  '$$',
  '',
  'paragraph below everything',
  '',
].join('\n');

// 5. Typing below rendered blocks must not shift their heights.
{
  const page = await browser.newPage();
  page.on('pageerror', (err) => { throw new Error(`page error: ${err.message}`); });
  await page.setContent('<div id="editor" style="height:600px"></div>');
  await page.evaluate(bundle);
  await page.evaluate((content) => {
    window.editor = window.mrmd.create('#editor', { doc: content });
    const len = window.editor.view.state.doc.length;
    window.editor.view.dispatch({ selection: { anchor: len } });
  }, stabilityDoc);
  await new Promise((r) => setTimeout(r, 400)); // widgets render + measure

  const drift = await page.evaluate(async () => {
    const view = window.editor.view;
    const anchorPos = view.state.doc.toString().indexOf('paragraph below');
    const before = view.lineBlockAt(anchorPos).top;
    // Type 20 characters quickly at the end of the document.
    for (let i = 0; i < 20; i++) {
      const len = view.state.doc.length;
      view.dispatch({ changes: { from: len, insert: 'x' }, selection: { anchor: len + 1 } });
    }
    await new Promise((r) => setTimeout(r, 250));
    const after = view.lineBlockAt(view.state.doc.toString().indexOf('paragraph below')).top;
    return Math.abs(after - before);
  });
  assert.ok(drift <= 2, `blocks above shifted by ${drift}px while typing below them`);
  await page.close();
}

// 6. Editing INSIDE a revealed table must keep its reserved height
//    (regression: content hash changes per keystroke → padding vanished → jump).
{
  const page = await browser.newPage();
  page.on('pageerror', (err) => { throw new Error(`page error: ${err.message}`); });
  await page.setContent('<div id="editor" style="height:600px"></div>');
  await page.evaluate(bundle);
  await page.evaluate((content) => {
    window.editor = window.mrmd.create('#editor', { doc: content });
    const len = window.editor.view.state.doc.length;
    window.editor.view.dispatch({ selection: { anchor: len } });
  }, stabilityDoc);
  await new Promise((r) => setTimeout(r, 400)); // table renders, height cached

  const result = await page.evaluate(async () => {
    const view = window.editor.view;
    const text = view.state.doc.toString();
    // Put the cursor inside a table cell → widget reveals as raw source + spacer.
    const cellPos = text.indexOf('r4b');
    view.dispatch({ selection: { anchor: cellPos } });
    await new Promise((r) => setTimeout(r, 100));
    const heightRevealed = view.contentHeight;
    // Type 10 characters into the cell — the content hash now differs from the
    // cached rendered table on every keystroke.
    let pos = cellPos;
    let maxDrift = 0;
    for (let i = 0; i < 10; i++) {
      view.dispatch({ changes: { from: pos, insert: 'z' }, selection: { anchor: pos + 1 } });
      pos += 1;
      maxDrift = Math.max(maxDrift, Math.abs(view.contentHeight - heightRevealed));
    }
    await new Promise((r) => setTimeout(r, 150));
    maxDrift = Math.max(maxDrift, Math.abs(view.contentHeight - heightRevealed));
    return { maxDrift };
  });
  assert.ok(
    result.maxDrift <= 4,
    `document height drifted ${result.maxDrift}px while editing inside a table`
  );
  await page.close();
}

await browser.close();
console.log('render-smoke tests passed');
