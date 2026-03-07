import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFrontmatterTemplate,
  createArticleFrontmatterTemplate,
} from '../src/frontmatter-updater.js';

function applyChange(content, change) {
  return content.slice(0, change.from) + change.insert + content.slice(change.to);
}

describe('createArticleFrontmatterTemplate', () => {
  it('uses the provided date for date and copyright year', () => {
    const template = createArticleFrontmatterTemplate(new Date('2008-02-29T12:00:00'));

    assert.equal(template.date, '2008-02-29');
    assert.equal(template.copyright.year, 2008);
    assert.equal(template.author[0].name, 'Your Name');
  });
});

describe('applyFrontmatterTemplate', () => {
  it('inserts a full frontmatter template at the top of a document', () => {
    const result = applyFrontmatterTemplate('# Hello\n');
    assert.ok(result);

    const next = applyChange('# Hello\n', result.changes);
    assert.ok(next.startsWith('---\n'));
    assert.ok(next.includes('title: Untitled'));
    assert.ok(next.includes('author:\n  - name: Your Name'));
    assert.ok(next.includes('abstract: |'));
    assert.ok(next.includes('keywords:\n  - Keyword 1\n  - Keyword 2'));
    assert.ok(next.includes('citation:\n  container-title: Journal or Venue'));
    assert.ok(next.endsWith('\n\n# Hello\n'));
    assert.deepEqual(result.selection, { from: 11, to: 19 });
  });

  it('merges missing template fields into existing frontmatter while preserving values', () => {
    const content = `---
title: Existing Title
author:
  - name: Existing Author
copyright:
  holder: Existing Author
---

# Notes
`;

    const result = applyFrontmatterTemplate(content);
    assert.ok(result);

    const next = applyChange(content, result.changes);
    assert.ok(next.includes('title: Existing Title'));
    assert.ok(next.includes('author:\n  - name: Existing Author'));
    assert.ok(next.includes('date: '));
    assert.ok(next.includes('license: CC BY'));
    assert.ok(next.includes('year: '));
    assert.ok(next.includes('funding: Add funding information here.'));
    assert.ok(next.endsWith('\n\n# Notes\n'));
  });

  it('returns null when existing frontmatter YAML is invalid', () => {
    const content = `---
title: [unterminated
---

# Broken\n`;
    assert.equal(applyFrontmatterTemplate(content), null);
  });
});
