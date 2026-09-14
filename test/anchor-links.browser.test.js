/**
 * Anchor links in a real browser: the widget, the click, the event, the caret.
 *
 * Drives tests/anchor-links.html against the built bundle with puppeteer and
 * a system Chromium (PUPPETEER_EXECUTABLE_PATH, or the usual paths). Skips,
 * rather than fails, when there is no bundle or no browser.
 *
 * Run: npm run build && node --test test/anchor-links.browser.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + path.join(here, '../tests/anchor-links.html');
const dist = path.join(here, '../dist/mrmd.iife.js');
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  const { default: puppeteer } = await import('puppeteer');
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
  return puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-gpu'] });
}

test('Feature: a [text](#heading) link carries the reader to that heading', async (t) => {
  if (!existsSync(dist)) return t.skip('no dist/mrmd.iife.js — run npm run build');
  let browser;
  try { browser = await launch(); } catch (e) { return t.skip('no browser available: ' + e.message); }
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(pageUrl);
    // Fail fast, and say what the page threw, instead of a silent 30 s timeout.
    try {
      await page.waitForFunction('window.scenario && window.editor && window.editor.view', { timeout: 8000 });
    } catch (e) {
      assert.fail('the page did not build the editor: ' + (pageErrors[0] || e.message));
    }
    await page.evaluate(() => scenario.caretToTop());
    await settle(250);

    // Scenario: both links render as anchors; the one with no heading is marked broken
    const widgets = await page.evaluate(() => scenario.widgets());
    assert.deepEqual(widgets, [
      { text: 'the details', fragment: 'details', broken: false },
      { text: 'nowhere', fragment: 'missing', broken: true },
    ]);

    // Scenario: clicking moves the caret to the heading and tells the host which line
    const headingLine = await page.evaluate(() => scenario.headingLine('## Details'));
    assert.ok(headingLine > 3, 'the heading sits well below the link');
    const followed = await page.evaluate(() => scenario.click('the details'));
    assert.equal(followed.clicked, true);
    assert.deepEqual(followed.event, { fragment: 'details', line: headingLine, cancelable: true });
    assert.equal(followed.caretLine, headingLine);

    // Scenario: a host that takes over (preventDefault) keeps the caret where it was
    await page.evaluate(() => scenario.caretToTop());
    await settle(150);
    const taken = await page.evaluate(() => scenario.click('the details', { preventDefault: true }));
    assert.equal(taken.event.line, headingLine, 'the host still learns the target line');
    assert.equal(taken.caretLine, 1);

    // Scenario: a broken anchor reports no line and moves nothing
    const broken = await page.evaluate(() => scenario.click('nowhere'));
    assert.deepEqual(broken.event, { fragment: 'missing', line: null, cancelable: true });
    assert.equal(broken.caretLine, 1);

    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
});
