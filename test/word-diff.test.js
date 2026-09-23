import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff, diffTokens } from '../src/word-diff.js';

const render = segments => segments.map(s => s.type === 'same' ? s.text : s.type === 'del' ? `[-${s.text}-]` : `{+${s.text}+}`).join('');

test('tokens keep the text: words, whitespace runs, single punctuation', () => {
  const text = 'Hello,  wörld 42!\n';
  assert.deepEqual(diffTokens(text), ['Hello', ',', '  ', 'wörld', ' ', '42', '!', '\n']);
  assert.equal(diffTokens(text).join(''), text);
});

test('a grammar fix shows only what changed', () => {
  assert.equal(render(wordDiff("Their going to the the store.", "They're going to the store.")),
    "[-Their-]{+They're+} going to[- the-] the store.");
  assert.equal(render(wordDiff('one two three four', 'one five six four')), 'one [-two-]{+five+} [-three-]{+six+} four',
    'an unchanged space between two changed words keeps them apart');
});

test('a changed stretch reads removed-then-added, not token by token', () => {
  assert.equal(render(wordDiff('colour,flavour', 'color;flavor')), '[-colour,flavour-]{+color;flavor+}');
});

test('both sides are rebuilt exactly from the segments', () => {
  const before = 'a b c d e f', after = 'a x c d y f z';
  const segs = wordDiff(before, after);
  assert.equal(segs.filter(s => s.type !== 'ins').map(s => s.text).join(''), before);
  assert.equal(segs.filter(s => s.type !== 'del').map(s => s.text).join(''), after);
});

test('identical texts are one unchanged segment; empty sides are one change', () => {
  assert.deepEqual(wordDiff('same text', 'same text'), [{ type: 'same', text: 'same text' }]);
  assert.deepEqual(wordDiff('', 'new'), [{ type: 'ins', text: 'new' }]);
  assert.deepEqual(wordDiff('old', ''), [{ type: 'del', text: 'old' }]);
});

test('texts too long to align give no diff', () => {
  const long = Array.from({ length: 2000 }, (_, i) => 'w' + i).join(' ');
  const other = Array.from({ length: 2000 }, (_, i) => 'v' + i).join(' ');
  assert.equal(wordDiff(long, other), null);
  assert.notEqual(wordDiff(long, long + ' end'), null, 'a shared prefix costs nothing');
});
