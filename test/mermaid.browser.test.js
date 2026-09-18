/**
 * Mermaid diagram block tests in a real browser.
 *
 * Run with: node --test test/mermaid.browser.test.js
 * Needs a built bundle (`npm run build`) and a browser. Set
 * PUPPETEER_EXECUTABLE_PATH when the bundled Chromium is not present
 * (on NixOS: PUPPETEER_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium).
 *
 * The page (tests/mermaid.html) supplies a stub renderer through the public
 * `mermaidRenderer` option; nothing here depends on mermaid being installed.
 * Without a built bundle or a browser these tests skip rather than fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'dist/mrmd.iife.js');
const built = fs.existsSync(bundle) && fs.readFileSync(bundle, 'utf8').includes('mermaidRenderer');

let puppeteer = null;
try {
  puppeteer = (await import('puppeteer')).default;
} catch {
  puppeteer = null;
}

// A browser that cannot be launched is a missing dependency, not a failure.
const browserPath = process.env.PUPPETEER_EXECUTABLE_PATH
  || (puppeteer ? (() => { try { return puppeteer.executablePath(); } catch { return null; } })() : null);
const browserReady = !!(puppeteer && browserPath && fs.existsSync(browserPath));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const target = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const skip = !built ? 'dist/ is not built with mermaid support — run npm run build'
  : !puppeteer ? 'puppeteer is not installed'
    : !browserReady ? `no browser at ${browserPath || '(unresolved)'} — set PUPPETEER_EXECUTABLE_PATH`
      : false;

test('mermaid blocks in a real editor', { skip, timeout: 120000 }, async t => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--no-first-run'],
  });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });

  const base = `http://127.0.0.1:${port}/tests/mermaid.html`;

  async function openPage(mode, waitFor) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error && error.message || error)));
    await page.goto(`${base}?renderer=${mode}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.editor && document.querySelector('.cm-content'), { timeout: 30000 });
    if (waitFor) await page.waitForFunction(waitFor, { timeout: 30000 });
    return { page, errors };
  }

  // The host renderer draws the fence; the source is not on screen.
  {
    const { page, errors } = await openPage('stub', () => document.querySelector('.cm-mermaid-block[data-mermaid-state="rendered"]'));
    const seen = await page.evaluate(() => ({
      blocks: document.querySelectorAll('.cm-mermaid-block').length,
      svgs: document.querySelectorAll('.cm-mermaid-block svg').length,
      text: document.querySelector('.cm-editor').textContent,
      rendered: window.__renderedCodes,
    }));
    assert.equal(seen.blocks, 1, 'exactly one diagram block');
    assert.equal(seen.svgs, 1, 'the renderer SVG is in the block');
    assert.ok(!seen.text.includes('```mermaid'), 'the fence source is replaced while the caret is elsewhere');
    assert.ok(seen.text.includes('Prose before.') && seen.text.includes('Prose after.'), 'the rest of the document is untouched');
    assert.match(seen.rendered[0].code, /graph LR/, 'the renderer received the fence body');
    assert.equal(seen.rendered[0].signal, true, 'the renderer received an abort signal');
    assert.deepEqual(errors, [], 'no page errors');
    await page.close();
  }

  // Clicking the diagram puts the caret in the block: the source comes back.
  {
    const { page, errors } = await openPage('stub', () => document.querySelector('.cm-mermaid-block[data-mermaid-state="rendered"]'));
    await page.evaluate(() => {
      const block = document.querySelector('.cm-mermaid-block');
      block.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => !document.querySelector('.cm-mermaid-block'), { timeout: 10000 });
    const text = await page.evaluate(() => document.querySelector('.cm-editor').textContent);
    assert.ok(text.includes('graph LR'), 'the source is readable again');
    assert.deepEqual(errors, [], 'no page errors');
    await page.close();
  }

  // A renderer that fails leaves the reason and the source, never a blank.
  {
    const { page, errors } = await openPage('error', () => document.querySelector('.cm-mermaid-block[data-mermaid-state="error"]'));
    const failure = await page.evaluate(() => ({
      message: (document.querySelector('.cm-mermaid-error') || {}).textContent || '',
      source: (document.querySelector('.cm-mermaid-source') || {}).textContent || '',
      html: document.querySelector('.cm-mermaid-block').innerHTML,
    }));
    assert.match(failure.message, /could not be rendered/, 'the failure is stated');
    assert.match(failure.message, /renderer refused the diagram/, 'with the renderer\'s own reason');
    assert.match(failure.source, /graph LR/, 'the fence source stays readable');
    assert.ok(!failure.html.includes('&lt;svg'), 'no half-injected markup');
    assert.deepEqual(errors, [], 'no page errors');
    await page.close();
  }

  // No renderer: the fence is an ordinary code block, exactly as before.
  {
    const { page, errors } = await openPage('none');
    const state = await page.evaluate(() => ({
      blocks: document.querySelectorAll('.cm-mermaid-block').length,
      text: document.querySelector('.cm-editor').textContent,
    }));
    assert.equal(state.blocks, 0, 'no diagram without a renderer');
    assert.ok(state.text.includes('graph LR'), 'the fence is still readable as code');
    assert.deepEqual(errors, [], 'no page errors');
    await page.close();
  }
});
