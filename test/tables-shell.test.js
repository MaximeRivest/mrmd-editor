import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import * as Y from 'yjs';

import { findLinkedTableBlocksInState } from '../src/tables/parsing/linked-table-blocks.js';
import { TableJobsClient, TABLE_JOB_STATUS } from '../src/tables/jobs/client.js';

test('findLinkedTableBlocksInState enriches linked table blocks for editor use', () => {
  const state = EditorState.create({
    doc: `# Demo

<!--mrmd:table
id: sales-summary
engine: r-dplyr
sources:
  - name: sales
    path: ../_assets/tables/sales-summary/source.csv
transform:
  path: ../_assets/tables/sales-summary/transform.R
cache:
  path: ../_assets/tables/sales-summary/cache.arrow
-->
_Table 1: Sales summary_
| Region | Revenue |
| :--{40%} | ---{60%}. |
| North | 12.50 |
| South | 8.25 |

_Source: internal_
`,
  });

  const blocks = findLinkedTableBlocksInState(state);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].spec.id, 'sales-summary');
  assert.equal(blocks[0].captionAboveText, '_Table 1: Sales summary_');
  assert.equal(blocks[0].captionBelowText, '_Source: internal_');
  assert.ok(blocks[0].tableText.includes('| North | 12.50 |'));
  assert.equal(blocks[0].tableLines.length, 4);
});

test('TableJobsClient requests and cancels table jobs', () => {
  const ydoc = new Y.Doc();
  const client = new TableJobsClient(ydoc, 123);

  const jobId = client.requestSort({
    tableId: 'sales-summary',
    column: 'Revenue',
    direction: 'desc',
  });

  const requested = client.getJob(jobId);
  assert.equal(requested.tableId, 'sales-summary');
  assert.equal(requested.status, TABLE_JOB_STATUS.REQUESTED);
  assert.deepEqual(requested.opList, [{ type: 'sort', column: 'Revenue', direction: 'desc' }]);

  let observedStatus = null;
  const unsubscribe = client.onStatusChange(jobId, (status) => {
    observedStatus = status;
  });

  client.cancelJob(jobId);
  assert.equal(client.getJob(jobId).status, TABLE_JOB_STATUS.CANCELLED);
  assert.equal(observedStatus, TABLE_JOB_STATUS.CANCELLED);

  unsubscribe();
  client.destroy();
});
