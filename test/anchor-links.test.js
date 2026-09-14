/**
 * Anchor links — [text](#heading) inside the same document.
 *
 * Scenarios are written Given / When / Then. They cover the pure parts:
 * how a heading becomes an anchor, and how a fragment finds its heading.
 * The click behaviour lives in test/anchor-links.browser.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

import { headingSlug, headingAnchors, resolveAnchor } from '../src/markdown/headings.js';

const stateOf = (doc) => EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });

test('Scenario: a heading becomes the anchor GitHub would give it', () => {
  // Given a heading with punctuation, capitals, inline markup and non-ASCII letters
  // When its slug is computed
  // Then it matches GitHub: lowercase, punctuation dropped, spaces to dashes, letters kept
  assert.equal(headingSlug('1. Candidate, decision requested and limits'), '1-candidate-decision-requested-and-limits');
  assert.equal(headingSlug('RFC03 — owner-supported local task-session contract'), 'rfc03--owner-supported-local-task-session-contract');
  assert.equal(headingSlug('With [a link](x.md) and <b>tags</b> and `code`'), 'with-a-link-and-tags-and-code');
  assert.equal(headingSlug('Ümlauts & 日本語 keep their letters'), 'ümlauts--日本語-keep-their-letters');
  assert.equal(headingSlug('  trailing spaces  '), 'trailing-spaces');
});

test('Scenario: every heading in a document is an anchor, numbered when repeated', () => {
  // Given a document with ATX and setext headings, a fenced block and YAML front matter
  const doc = [
    '---', 'title: front matter', '# not a heading', '---',
    '# Intro',                   // 5
    '', 'Setext heading', '==============', // 7
    '```md', '# fenced, ignored', '```',
    '## Repeated', '## Repeated', // 12, 13
    '### 1. Candidate, decision requested and limits', // 14
  ].join('\n');
  // When the anchors are listed
  const anchors = headingAnchors(stateOf(doc));
  // Then front matter and fenced code contribute nothing, and duplicates get -1, -2…
  assert.deepEqual(anchors.map((a) => [a.slug, a.line]), [
    ['intro', 5],
    ['setext-heading', 7],
    ['repeated', 12],
    ['repeated-1', 13],
    ['1-candidate-decision-requested-and-limits', 14],
  ]);
});

test('Scenario: a fragment finds its heading, by slug or by exact text, or says it cannot', () => {
  // Given a document with a heading
  const state = stateOf('# Intro\n\ntext\n\n## Details & more\n\nbody\n');
  // When a link names it by slug, by percent-encoded slug, or by its exact text
  // Then each resolves to the heading line
  assert.equal(resolveAnchor(state, 'details--more').line, 5);
  assert.equal(resolveAnchor(state, 'details%20%26%20more').line, null, 'an encoded non-slug is not a heading');
  assert.equal(resolveAnchor(state, 'Details & more').line, 5, 'exact heading text is accepted too');
  assert.equal(resolveAnchor(state, encodeURIComponent('Details & more')).line, 5, 'and it may be percent-encoded');
  // When a link names a heading that does not exist
  // Then the answer is null, not a guess
  assert.equal(resolveAnchor(state, 'missing').line, null);
  assert.equal(resolveAnchor(state, '').line, null);
});

test('Scenario: the anchor list is computed once per document version', () => {
  // Given one document
  const state = stateOf('# A\n## B\n');
  // When anchors are asked for twice without an edit
  const first = headingAnchors(state), second = headingAnchors(state);
  // Then the same list comes back (no rescan)
  assert.equal(first, second);
  // And after an edit a new list reflects the change
  const edited = state.update({ changes: { from: state.doc.length, insert: '## C\n' } }).state;
  assert.notEqual(headingAnchors(edited), first);
  assert.equal(headingAnchors(edited).at(-1).slug, 'c');
});
