import assert from 'node:assert/strict';
import test from 'node:test';
import { Compartment, EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { documentText, memoizeDocumentScan, memoizeSyntaxScan } from '../src/markdown/document-cache.js';
import { blockDecorations, revealedDetailsState } from '../src/markdown/block-decorations.js';
import { sourceModeFacet } from '../src/markdown/facets.js';
import { linkDefinitionsInDocument, updateLinkDefinitionCache, resolveLinkReference } from '../src/markdown/widgets/image.js';

// Identity, not a sampled content hash: equal-length edits and independent
// editors must never share stale data. Returning to an undo state may reuse it.
test('document scans are shared across selections, invalidated by edits, and isolated', () => {
  let calls = 0;
  const scan = memoizeDocumentScan(doc => ({ text: documentText(doc), call: ++calls }));
  const initial = EditorState.create({ doc: 'abc\ndef' });
  const original = scan(initial.doc);
  const moved = initial.update({ selection: { anchor: 2 } }).state;
  assert.equal(scan(moved.doc), original);
  const changed = moved.update({ changes: { from: 1, to: 2, insert: 'z' } }).state;
  assert.equal(scan(changed.doc).text, 'azc\ndef');
  assert.notEqual(scan(changed.doc), original);
  const other = EditorState.create({ doc: 'abc\ndef' });
  assert.notEqual(scan(other.doc), original);
  assert.equal(scan(initial.doc), original);
  assert.equal(calls, 3);
});

test('reference scans isolate editors and invalidate equal-length URL edits', () => {
  const a = EditorState.create({ doc: '![photo][pic]\n\n[pic]: old.png\n\ntail' });
  const b = EditorState.create({ doc: '![photo][pic]\n\n[pic]: two.png\n\ntail' });
  const original = linkDefinitionsInDocument(a.doc);
  assert.equal(linkDefinitionsInDocument(b.doc).get('pic').url, 'two.png');
  assert.equal(linkDefinitionsInDocument(a.doc), original);
  assert.equal(original.get('pic').url, 'old.png');
  const from = a.doc.toString().indexOf('old.png');
  const edited = a.update({ changes: { from, to: from + 3, insert: 'new' } }).state;
  assert.equal(linkDefinitionsInDocument(edited.doc).get('pic').url, 'new.png');
  assert.equal(original.get('pic').url, 'old.png');
});

test('legacy reference lookup stays available after Text and string cache updates', () => {
  const doc = EditorState.create({ doc: '[pic]: one.png' }).doc;
  const lookup = updateLinkDefinitionCache(doc);
  assert.equal(resolveLinkReference('PIC').url, 'one.png');
  updateLinkDefinitionCache('[pic]: two.png');
  assert.equal(resolveLinkReference('pic').url, 'two.png');
  updateLinkDefinitionCache('[pic]: new.png');
  assert.equal(resolveLinkReference('pic').url, 'new.png');
  assert.equal(lookup.get('pic').url, 'one.png');
  updateLinkDefinitionCache(doc);
  assert.equal(resolveLinkReference('pic').url, 'one.png');
});

test('syntax scans invalidate when the parser changes without a text change', () => {
  let calls = 0;
  const scan = memoizeSyntaxScan(() => ++calls);
  const language = new Compartment();
  const initial = EditorState.create({ doc: '**text**', extensions: [language.of([])] });
  assert.equal(scan(initial), 1);
  const parsed = initial.update({ effects: language.reconfigure(markdown()) }).state;
  assert.equal(parsed.doc, initial.doc);
  assert.equal(scan(parsed), 2);
  assert.equal(scan(parsed.update({ selection: { anchor: 1 } }).state), 2);
});

function makeState(doc) {
  return EditorState.create({ doc, extensions: [markdown(), revealedDetailsState, blockDecorations] });
}
function blocks(state) {
  const result = [];
  state.field(blockDecorations).between(0, state.doc.length, (from, to, decoration) => {
    if (decoration.spec.widget) result.push({ from, to, type: decoration.spec.widget.constructor.name });
  });
  return result;
}

test('same-line cursor movement and anchor-fixed dragging reuse block decorations', () => {
  const initial = makeState('prose here\n\n| A | B |\n|---|---|\n| a | b |\n\ntail');
  assert.equal(blocks(initial).length, 1);
  const moved = initial.update({ selection: { anchor: 2 } }).state;
  assert.equal(moved.field(blockDecorations), initial.field(blockDecorations));
  const dragged = moved.update({ selection: { anchor: 2, head: initial.doc.length } }).state;
  assert.equal(dragged.field(blockDecorations), initial.field(blockDecorations));
  const inside = moved.update({ selection: { anchor: moved.doc.line(5).from } }).state;
  assert.equal(blocks(inside).length, 0);
  assert.equal(blocks(inside.update({ selection: { anchor: 0 } }).state).length, 1);
});

test('table fallback offsets survive blank lines, end-of-file, and structural edits', () => {
  let state = makeState('prose\n\n| A | B |\n|---|---|\n| a | b |');
  assert.deepEqual(blocks(state).map(({ from, to }) => ({ from, to })), [{ from: 7, to: state.doc.length }]);
  for (const changes of [
    { from: 0, insert: '\n\n' },
    { from: 0, to: 2, insert: '' },
    { from: state.doc.length, insert: '\n\nnew tail' },
    { from: 18, to: 21, insert: 'xyz' },
  ]) {
    state = state.update({ changes, selection: { anchor: 0 } }).state;
    assert.deepEqual(blocks(state), blocks(makeState(state.doc.toString())));
  }
});

test('both display-math delimiters still render and code-contained dollars stay excluded', () => {
  for (const math of ['$$\nx^2\n$$', '\\[x^2\\]']) {
    const state = makeState('prose\n\n' + math + '\n\ntail');
    assert.equal(blocks(state).filter(b => b.type.includes('Math')).length, 1, math);
  }
  const state = makeState('prose\n\n```python\ns = "$$"\n```\n\nplain\n\n$$\nx\n$$\n\ntail');
  const math = blocks(state).filter(b => b.type.includes('Math'));
  assert.equal(math.length, 1);
  assert.equal(state.doc.sliceString(math[0].from, math[0].to), '$$\nx\n$$');
});

test('source and readonly reconfiguration refresh blocks without edits', () => {
  const mode = new Compartment();
  const lock = new Compartment();
  let state = EditorState.create({ doc: 'prose\n\n$$\nx\n$$', extensions: [
    markdown(), revealedDetailsState, blockDecorations,
    mode.of(sourceModeFacet.of(false)), lock.of(EditorState.readOnly.of(false)),
  ] });
  assert.equal(blocks(state).length, 1);
  state = state.update({ effects: mode.reconfigure(sourceModeFacet.of(true)) }).state;
  assert.equal(blocks(state).length, 0);
  state = state.update({ effects: mode.reconfigure(sourceModeFacet.of(false)) }).state;
  assert.equal(blocks(state).length, 1);
  state = state.update({ selection: { anchor: state.doc.line(4).from } }).state;
  assert.equal(blocks(state).length, 0);
  state = state.update({ effects: lock.reconfigure(EditorState.readOnly.of(true)) }).state;
  assert.equal(blocks(state).length, 1);
});
