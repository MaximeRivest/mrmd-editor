/** Reproducible browser benchmark, not a machine-dependent pass/fail test.
 * npm run build:document && npm run bench:document
 * MRMD_BUNDLE=/path/to/old/bundle.js npm run bench:document compares releases.
 * Measures synchronous dispatch only, excluding subsequent paint/layout.
 */
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  // Match the host's external scroll container instead of assuming the
  // editor's default fixed-height scroller.
  await page.setContent(`<style>
    .host { height:700px; overflow:auto }
    .host>div { max-width:900px; margin:0 auto; padding:28px 20px 50vh; min-height:100% }
    .host .cm-editor { height:auto } .host .cm-scroller { overflow:visible }
  </style><div class="host"><div id="editor"></div></div>`);
  await page.addScriptTag({ path: process.env.MRMD_BUNDLE || fileURLToPath(new URL('../dist/mrmd-document.iife.min.js', import.meta.url)) });
  for (const count of [100, 1000, 5000]) {
    for (const kind of ['markdown', 'source', 'code']) {
      const result = await page.evaluate(async ({ count, kind }) => {
        window.ed?.destroy();
        const paragraph = '## A heading\n\nSome **formatted** prose with a [link](https://example.com) and `code`.\n\n';
        const doc = paragraph.repeat(count);
        const options = { doc, sourceMode: kind === 'source', filename: 'plain.txt' };
        window.ed = kind === 'code'
          ? mrmdDocument.createCodeEditor('#editor', options)
          : mrmdDocument.createDocumentEditor('#editor', options);
        await new Promise(r => setTimeout(r, 700));
        const result = { chars: doc.length, lines: ed.view.state.doc.lines, kind };
        for (const action of ['typing', 'cursor']) {
          const times = [];
          for (let i = 0; i < 30; i++) {
            const t = performance.now();
            ed.view.dispatch(action === 'typing'
              ? { changes: { from: 25, insert: 'a' }, selection: { anchor: 26 } }
              : { selection: { anchor: 25 + i % 2 } });
            times.push(performance.now() - t);
            await new Promise(requestAnimationFrame);
          }
          times.sort((a, b) => a - b);
          result[action] = { median: Math.round(times[15] * 10) / 10, p95: Math.round(times[28] * 10) / 10 };
        }
        result.visibleLines = document.querySelectorAll('.cm-line').length;
        return result;
      }, { count, kind });
      console.log(JSON.stringify(result));
    }
  }
} finally {
  await browser.close();
}
