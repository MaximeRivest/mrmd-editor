/**
 * Tests for inline math extraction (Pandoc delimiter rules).
 *
 * Run: node test/math-extraction.test.js
 */
import assert from 'node:assert/strict';
import {
  extractInlineMath,
  hasInlineMath,
  isDisplayMath,
  extractDisplayMath,
} from '../src/markdown/widgets/math.js';

function latexes(text, exclude) {
  return extractInlineMath(text, exclude).map((m) => m.latex);
}

// ── Basic math ──────────────────────────────────────────────

assert.deepEqual(latexes('$x + y$'), ['x + y']);
assert.deepEqual(latexes('Einstein said $E = mc^2$ once.'), ['E = mc^2']);
assert.deepEqual(latexes('$a$ and $b$'), ['a', 'b']);
assert.deepEqual(latexes('inline \\(E = mc^2\\) parens'), ['E = mc^2']);
assert.equal(hasInlineMath('$x$'), true);

// ── Currency must NOT be math (Pandoc rules) ────────────────

// closing $ followed by a digit
assert.deepEqual(latexes('costs $5 and $10 more'), []);
// opening $ followed by space
assert.deepEqual(latexes('price is 20 $ total and 30 $ more'), []);
// space before closing $
assert.deepEqual(latexes('$ x$ should not render'), []);
assert.deepEqual(latexes('$x $ should not render'), []);
// lone dollar
assert.deepEqual(latexes('I have $5.'), []);
assert.equal(hasInlineMath('costs $5 and $10'), false);

// ── Escapes ─────────────────────────────────────────────────

assert.deepEqual(latexes('pay \\$5 and \\$10 now'), []);
// escaped dollar inside math content survives
assert.deepEqual(latexes('$a \\$ b$'), ['a \\$ b']);

// ── $$ display delimiters never match as inline ─────────────

assert.deepEqual(latexes('$$x + y$$'), []);

// ── Exclusion ranges (inline code spans) ────────────────────

// `df$col` and `df$other`: without exclusions Pandoc rules alone would
// match the text between the two dollars; exclusions must remove it.
const rText = 'use `df$col` and `df$other` columns';
const tick1 = { start: rText.indexOf('`df$col`'), end: rText.indexOf('`df$col`') + '`df$col`'.length };
const tick2 = { start: rText.indexOf('`df$other`'), end: rText.indexOf('`df$other`') + '`df$other`'.length };
assert.deepEqual(latexes(rText, [tick1, tick2]), []);

// math outside an excluded range still matches
const mixed = '`code$span` then $k$';
const codeRange = { start: 0, end: '`code$span`'.length };
assert.deepEqual(latexes(mixed, [codeRange]), ['k']);

// ── Display math helpers unchanged ──────────────────────────

assert.equal(isDisplayMath('$$\\int_0^1 x dx$$'), true);
assert.equal(extractDisplayMath('$$ a+b $$'), 'a+b');

console.log('math-extraction tests passed');
