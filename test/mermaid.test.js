/**
 * Mermaid diagram block tests (pure — no DOM, no browser).
 *
 * Run with: node --test test/mermaid.test.js
 *
 * These drive the StateField directly: `blockDecorations` computes its
 * decorations from EditorState alone, so a mermaid fence, a missing renderer
 * and a caret inside the block can all be asserted without a view.
 * The rendered SVG and the click-to-source behaviour are covered by
 * test/mermaid.browser.test.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EditorState } from '@codemirror/state';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import { blockDecorations } from '../src/markdown/block-decorations.js';
import { mermaidRendererFacet } from '../src/markdown/facets.js';
import { isMermaidFence, mermaidSvgFromResult, MermaidWidget } from '../src/markdown/widgets/mermaid.js';

const renderer = code => `<svg data-code="${code.length}"></svg>`;

function stateWith(doc, { renderer: r = renderer, cursor = null, extra = [] } = {}) {
  const extensions = [cmMarkdown(), blockDecorations, ...extra];
  if (r) extensions.push(mermaidRendererFacet.of(r));
  const state = EditorState.create({ doc, extensions });
  if (cursor === null) return state;
  return state.update({ selection: { anchor: cursor } }).state;
}

/** The replaced ranges the block field produced, with their widget. */
function replacedRanges(state) {
  const found = [];
  state.field(blockDecorations).between(0, state.doc.length, (from, to, value) => {
    if (value.spec && value.spec.widget instanceof MermaidWidget) found.push({ from, to, widget: value.spec.widget });
  });
  return found;
}

const DIAGRAM = '# Title\n\n```mermaid\ngraph LR\n  A --> B\n```\n\ntrailing prose\n';

test('isMermaidFence accepts mermaid fences and nothing else', () => {
  assert.equal(isMermaidFence('mermaid'), true);
  assert.equal(isMermaidFence('mermaid title=x'), true);
  assert.equal(isMermaidFence('  Mermaid '), true);
  assert.equal(isMermaidFence('mermaidjs'), false, 'a longer language name is not mermaid');
  assert.equal(isMermaidFence('js'), false);
  assert.equal(isMermaidFence(''), false);
  assert.equal(isMermaidFence(undefined), false);
});

test('mermaidSvgFromResult refuses anything that is not SVG', () => {
  assert.equal(mermaidSvgFromResult('<svg></svg>'), '<svg></svg>');
  assert.equal(mermaidSvgFromResult({ svg: '<svg viewBox="0 0 1 1"></svg>' }), '<svg viewBox="0 0 1 1"></svg>');
  assert.equal(mermaidSvgFromResult(''), null);
  assert.equal(mermaidSvgFromResult(undefined), null);
  assert.equal(mermaidSvgFromResult('<p>not a diagram</p>'), null, 'HTML is not a diagram');
  assert.equal(mermaidSvgFromResult({ svg: 'nope' }), null);
});

test('a mermaid fence is replaced by a diagram widget when the caret is elsewhere', () => {
  const state = stateWith(DIAGRAM, { cursor: DIAGRAM.length - 2 });
  const replacements = replacedRanges(state);
  assert.equal(replacements.length, 1, 'exactly one diagram');
  const [range] = replacements;
  assert.equal(state.doc.sliceString(range.from, range.to), '```mermaid\ngraph LR\n  A --> B\n```');
  assert.equal(range.widget.code, 'graph LR\n  A --> B', 'the widget gets the body, not the fences');
  assert.equal(range.widget.renderer, renderer);
});

test('the caret inside the fence keeps the source, as editing requires', () => {
  const inside = DIAGRAM.indexOf('A --> B');
  assert.equal(replacedRanges(stateWith(DIAGRAM, { cursor: inside })).length, 0);
  const firstLine = DIAGRAM.indexOf('```mermaid');
  assert.equal(replacedRanges(stateWith(DIAGRAM, { cursor: firstLine })).length, 0);
});

test('without a host renderer the fence stays an ordinary code block', () => {
  assert.equal(replacedRanges(stateWith(DIAGRAM, { renderer: null, cursor: DIAGRAM.length - 2 })).length, 0);
});

test('non-mermaid fences and indented code are never replaced', () => {
  const doc = '```js\nconst a = 1;\n```\n\n    mermaid\n\n```mermaid\nflowchart LR\n  X --> Y\n```\n';
  const replacements = replacedRanges(stateWith(doc, { cursor: 0 }));
  assert.equal(replacements.length, 1, 'only the mermaid fence');
  assert.equal(replacements[0].widget.code, 'flowchart LR\n  X --> Y');
});

test('prose that merely mentions mermaid is untouched', () => {
  const doc = 'A ```mermaid``` inline mention and a word mermaid in prose.\n';
  assert.equal(replacedRanges(stateWith(doc, { cursor: 0 })).length, 0);
});

test('it re-computes when the caret leaves and re-enters the block', () => {
  let state = stateWith(DIAGRAM, { cursor: DIAGRAM.indexOf('A --> B') });
  assert.equal(replacedRanges(state).length, 0);
  state = state.update({ selection: { anchor: 0 } }).state;
  assert.equal(replacedRanges(state).length, 1);
  state = state.update({ selection: { anchor: DIAGRAM.indexOf('  A --> B') } }).state;
  assert.equal(replacedRanges(state).length, 0);
});

test('source mode shows the source even with the caret elsewhere', async () => {
  const { sourceModeFacet } = await import('../src/markdown/facets.js');
  const state = stateWith(DIAGRAM, { cursor: 0, extra: [sourceModeFacet.of(true)] });
  assert.equal(replacedRanges(state).length, 0);
});
