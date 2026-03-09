import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canImportLinkedTableFromHost,
  normalizeLinkedTableBlockInsertion,
  importLinkedTableFromHost,
} from '../src/tables/commands/insert-linked-table.js';

test('canImportLinkedTableFromHost detects host support', () => {
  assert.equal(canImportLinkedTableFromHost(null), false);
  assert.equal(canImportLinkedTableFromHost({ table: {} }), false);
  assert.equal(canImportLinkedTableFromHost({ table: { importDelimited() {} } }), true);
});

test('normalizeLinkedTableBlockInsertion adds surrounding blank lines when needed', () => {
  const result = normalizeLinkedTableBlockInsertion(
    '# Title\nParagraph',
    7,
    7,
    '<!--mrmd:table-->\n| A |\n| --- |\n| 1 |'
  );

  assert.equal(result.insert, '\n\n<!--mrmd:table-->\n| A |\n| --- |\n| 1 |\n');
});

test('importLinkedTableFromHost calls host api and inserts returned block markdown', async () => {
  const calls = [];
  const editor = {
    getLinkedTableHostContext() {
      return {
        projectRoot: '/tmp/project',
        documentPath: 'notes/demo.md',
      };
    },
    view: {
      state: {
        doc: {
          toString() {
            return '# Demo';
          },
        },
        selection: {
          main: {
            from: 6,
            to: 6,
          },
        },
      },
      dispatch(spec) {
        calls.push(spec);
      },
    },
  };

  const hostApi = {
    table: {
      async importDelimited(payload) {
        assert.equal(payload.projectRoot, '/tmp/project');
        assert.equal(payload.documentPath, 'notes/demo.md');
        assert.equal(payload.sourceFilePath, '/tmp/incoming/sales.csv');
        return {
          tableId: 'sales-summary',
          blockMarkdown: '<!--mrmd:table-->\n| A |\n| --- |\n| 1 |',
        };
      },
    },
  };

  const result = await importLinkedTableFromHost(editor, {
    hostApi,
    sourceFilePath: '/tmp/incoming/sales.csv',
  });

  assert.equal(result.tableId, 'sales-summary');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].changes.insert, '\n\n<!--mrmd:table-->\n| A |\n| --- |\n| 1 |');
  assert.equal(calls[0].selection.anchor, calls[0].changes.from + calls[0].changes.insert.length);
});
