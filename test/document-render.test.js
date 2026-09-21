/** Browser regressions for the lightweight document entry used by hosts.
 * npm run build:document && npm run test:document
 * PUPPETEER_EXECUTABLE_PATH may select a system Chromium.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const bundle = readFileSync(new URL('../dist/mrmd-document.iife.min.js', import.meta.url), 'utf8');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && /plugin|RangeError|TypeError/i.test(message.text())) errors.push(message.text()); });
await page.setContent('<div id="editor" style="height:600px;width:800px"></div>');
await page.evaluate(bundle);
const settle = () => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 150));
});
async function mount(doc) {
  await page.evaluate(doc => {
    window.editor?.destroy?.();
    window.editor = mrmdDocument.createDocumentEditor('#editor', { doc });
    editor.view.dispatch({ selection: { anchor: doc.length } });
  }, doc);
  await settle();
}

try {
  const doc = '---\ntitle: Example\n---\n\n| A | B |\n|---|---|\n| a | b |\n\n$$\nx^2\n$$\n\n<details>\n<summary>Appendix</summary>\n\nHidden **text**\n\n</details>\n\ntail';
  await mount(doc);
  const widgets = () => page.evaluate(() => ({
    tables: document.querySelectorAll('table').length,
    math: document.querySelectorAll('.cm-math-display').length,
    details: document.querySelectorAll('.cm-details-widget').length,
  }));
  assert.deepEqual(await widgets(), { tables: 1, math: 1, details: 1 });

  // Table reveal, typing, undo, and leaving the table must keep the original data.
  await page.evaluate(() => {
    document.querySelector('table').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    editor.focus();
  });
  assert.equal((await widgets()).tables, 0);
  await page.keyboard.type('new text');
  await page.keyboard.down('Control');
  await page.keyboard.press('z');
  await page.keyboard.up('Control');
  assert.equal(await page.evaluate(() => editor.getContent()), doc);
  await page.evaluate(() => editor.view.dispatch({ selection: { anchor: editor.getContent().length } }));
  await settle();
  assert.equal((await widgets()).tables, 1);

  // Reconfigure immediately, without a dummy edit/selection to refresh plugins.
  await page.evaluate(() => editor.setSourceMode(true));
  await settle();
  assert.deepEqual(await widgets(), { tables: 0, math: 0, details: 0 });
  await page.evaluate(() => editor.setSourceMode(false));
  await settle();
  assert.deepEqual(await widgets(), { tables: 1, math: 1, details: 1 });
  await page.evaluate(() => {
    editor.setReadonly(true);
    editor.view.dispatch({ selection: { anchor: editor.getContent().indexOf('| a |') } });
  });
  assert.equal((await widgets()).tables, 1);
  await page.evaluate(() => editor.setReadonly(false));
  assert.equal((await widgets()).tables, 0);

  // Explicit details reveal expires even when only the selection head leaves
  // and the anchor stays on the same line (the block fast path must notice).
  await page.evaluate(() => {
    editor.view.dispatch({ selection: { anchor: editor.getContent().length } });
    document.querySelector('.cm-details-edit').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await settle();
  assert.equal((await widgets()).details, 0);
  await page.evaluate(() => editor.view.dispatch({ selection: {
    anchor: editor.view.state.selection.main.anchor, head: editor.getContent().length,
  } }));
  await settle();
  assert.equal((await widgets()).details, 1);

  // Bracket display math must survive the no-dollar fast path.
  await mount('before\n\n\\[x^2\\]\n\nafter');
  assert.equal((await widgets()).math, 1);

  // Long fenced blocks: only visible lines are decorated, but the fence
  // boundaries and language must still be known when scrolled into the middle.
  const code = ['before', '', '```output', ...Array(700).fill('print("$x$ [[not a link]]")'), '```', '', 'after'].join('\n');
  await mount(code);
  await page.evaluate(() => editor.gotoLine(350));
  await settle();
  const middle = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('.cm-line')].filter(el => el.textContent.includes('print(')).map(el => ({ cls: el.className, lang: el.dataset.lang })),
    math: document.querySelectorAll('.cm-math-inline, .katex').length,
    links: document.querySelectorAll('.cm-wiki-link').length,
  }));
  assert.ok(middle.lines.length > 0 && middle.lines.length < 100);
  assert.ok(middle.lines.every(line => line.cls.includes('cm-md-codeblock-line') && !line.cls.includes('cm-md-codeblock-first') && !line.cls.includes('cm-md-codeblock-last') && line.lang === 'output'));
  assert.equal(middle.math, 0);
  assert.equal(middle.links, 0);
  await page.evaluate(() => editor.gotoLine(704));
  await settle();
  assert.equal(await page.evaluate(() => document.querySelectorAll('.cm-md-codeblock-last').length), 1);
  await page.evaluate(() => editor.gotoLine(3));
  await settle();
  assert.equal(await page.evaluate(() => document.querySelectorAll('.cm-md-codeblock-first').length), 1);

  // Admonition headers may be above the viewport; their visible body still
  // needs styling. Iterating past one block must not skip the next header.
  await mount('!!! tip\n' + '    body\n'.repeat(100) + '\n!!! warning\n    beware\n\ntail');
  await page.evaluate(() => editor.gotoLine(110));
  await settle();
  assert.ok(await page.evaluate(() => !!document.querySelector('.cm-md-alert-warning')));
  await page.evaluate(() => editor.gotoLine(50));
  await settle();
  // Active admonitions intentionally show source. Keep the anchor outside,
  // then scroll the container without changing selection.
  await page.evaluate(() => {
    editor.view.dispatch({ selection: { anchor: editor.getContent().length } });
    editor.view.scrollDOM.scrollTop = 1000;
  });
  await settle();
  assert.ok(await page.evaluate(() => !!document.querySelector('.cm-md-admonition-line')));

  // Diagram fences: drawn through the host renderer when the cursor is
  // outside, source when inside; other languages stay code; an open fence
  // is never drawn; the renderer runs once per distinct source; a rejection
  // shows the message over the source and is retried on the next draw;
  // refreshDiagrams() draws everything again.
  const diagramDoc = 'intro\n\n```mermaid\ngraph LR; A-->B\n```\n\n```mermaid\ngraph LR; A-->B\n```\n\n```js\nconst x = 1;\n```\n\n```mermaid\nbroken\n```\n\n```mermaid\ngraph TD; C-->D';
  await page.evaluate(doc => {
    window.editor?.destroy?.();
    window.draws = [];
    window.failBroken = true;
    window.editor = mrmdDocument.createDocumentEditor('#editor', {
      doc,
      diagrams: {
        languages: ['Mermaid'],
        render: async (lang, source) => {
          window.draws.push(source);
          if (source === 'broken' && window.failBroken) throw new Error('Parse error on line 1\nmore detail');
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.dataset.source = source;
          return svg;
        },
      },
    });
    editor.view.dispatch({ selection: { anchor: 0 } });
  }, diagramDoc);
  await settle();
  const diagrams = () => page.evaluate(() => ({
    drawn: document.querySelectorAll('.cm-diagram:not(.cm-diagram-pending):not(.cm-diagram-error) svg').length,
    errors: [...document.querySelectorAll('.cm-diagram-error .cm-diagram-error-message')].map(el => el.textContent),
    pending: document.querySelectorAll('.cm-diagram-pending').length,
    codeLines: document.querySelectorAll('.cm-md-codeblock-line[data-lang="js"]').length,
    draws: window.draws.slice(),
  }));
  let state = await diagrams();
  assert.equal(state.drawn, 2, 'two closed mermaid fences drawn');
  assert.deepEqual(state.errors, ['⚠ mermaid: Parse error on line 1']);
  assert.equal(state.pending, 0);
  assert.ok(state.codeLines >= 1, 'the js fence stays code');
  assert.deepEqual(state.draws, ['graph LR; A-->B', 'broken'], 'identical sources share one draw; the open fence is not drawn');

  // Cursor inside a diagram reveals its source; leaving draws it again from cache.
  await page.evaluate(() => editor.view.dispatch({ selection: { anchor: editor.getContent().indexOf('A-->B') } }));
  await settle();
  state = await diagrams();
  assert.equal(state.drawn, 1);
  await page.evaluate(() => editor.view.dispatch({ selection: { anchor: 0 } }));
  await settle();
  state = await diagrams();
  assert.equal(state.drawn, 2);
  assert.equal(state.draws.length, 2, 'no redraw for an unchanged source');

  // A failure is retried: fix the renderer, redraw, and the error is gone.
  await page.evaluate(() => { window.failBroken = false; editor.refreshDiagrams(); });
  await settle();
  state = await diagrams();
  assert.equal(state.drawn, 3);
  assert.deepEqual(state.errors, []);
  assert.equal(state.draws.length, 4, 'refreshDiagrams draws every diagram again');

  // Source mode and reading mode follow the block rules.
  await page.evaluate(() => editor.setSourceMode(true));
  await settle();
  assert.equal((await diagrams()).drawn, 0);
  await page.evaluate(() => { editor.setSourceMode(false); editor.setReadonly(true); editor.view.dispatch({ selection: { anchor: editor.getContent().indexOf('A-->B') } }); });
  await settle();
  assert.equal((await diagrams()).drawn, 3, 'reading mode never reveals source');
  await page.evaluate(() => editor.setReadonly(false));

  // Misconfiguration fails at creation, not silently.
  assert.match(await page.evaluate(() => {
    try { mrmdDocument.createDocumentEditor('#editor', { doc: '', diagrams: { languages: [] } }); return ''; }
    catch (e) { return e.message; }
  }), /diagrams\.render/);

  // Without a renderer, mermaid fences are ordinary code.
  await mount('```mermaid\ngraph LR; A-->B\n```\n');
  assert.equal((await diagrams()).drawn, 0);
  assert.ok(await page.evaluate(() => document.querySelectorAll('.cm-md-codeblock-line[data-lang="mermaid"]').length >= 1));

  // File links report the modifier keys of the click. (The cursor lands on
  // the last line, so the link line renders.)
  await mount('see [the spec](./spec.md)\n\ntail');
  const linkEvent = await page.evaluate(() => new Promise(resolve => {
    editor.view.dom.addEventListener('file-link-navigate', e => resolve(e.detail), { once: true });
    document.querySelector('.cm-file-link').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
  }));
  assert.deepEqual(linkEvent, { path: './spec.md', modifiers: { ctrl: true, meta: false, shift: false, alt: false } });

  assert.deepEqual(errors, [], 'browser errors');
  console.log('document rendering regressions passed');
} finally {
  await browser.close();
}
