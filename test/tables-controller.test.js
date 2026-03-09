import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';

import { LINKED_TABLE_EVENT } from '../src/tables/commands/open-table-workspace.js';
import { createLinkedTableController } from '../src/tables/workspace/controller.js';
import { TABLE_JOB_STATUS } from '../src/tables/jobs/client.js';
import {
  revealLinkedTableMarkdownEffect,
  hideLinkedTableMarkdownEffect,
} from '../src/tables/state/linked-table-state.js';

test('LinkedTableController turns sort actions into table jobs and handles local markdown reveal', () => {
  const ydoc = new Y.Doc();
  const yText = ydoc.getText('content');
  yText.insert(0, '0123456789 linked table source');

  const dom = new EventTarget();
  let lastDispatch = null;

  const editor = {
    ydoc,
    getYText() {
      return yText;
    },
    view: {
      dom,
      dispatch(spec) {
        lastDispatch = spec;
      },
    },
  };

  const controller = createLinkedTableController({ editor });

  const sortDetail = {
    action: 'sort',
    tableId: 'sales-summary',
    label: 'Sales summary',
    headerFrom: 2,
    snapshotTo: 12,
    spec: {
      id: 'sales-summary',
      engine: 'r-dplyr',
      sources: [{ name: 'sales', path: '../_assets/tables/sales-summary/source.csv' }],
      transform: { path: '../_assets/tables/sales-summary/transform.R' },
      cache: { path: '../_assets/tables/sales-summary/cache.arrow' },
    },
    column: 'Revenue',
    direction: 'desc',
  };

  dom.dispatchEvent(new CustomEvent(LINKED_TABLE_EVENT, { detail: sortDetail }));

  const jobs = Array.from(ydoc.getMap('tableJobs').values());
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, TABLE_JOB_STATUS.REQUESTED);
  assert.equal(jobs[0].tableId, 'sales-summary');
  assert.equal(jobs[0].opList[0].column, 'Revenue');
  assert.equal(jobs[0].blockAnchor.tableId, 'sales-summary');
  assert.ok(sortDetail.jobId);

  dom.dispatchEvent(new CustomEvent(LINKED_TABLE_EVENT, {
    detail: {
      action: 'open-markdown',
      tableId: 'sales-summary',
      headerFrom: 4,
      snapshotTo: 15,
    },
  }));

  assert.equal(Array.isArray(lastDispatch.effects), true);
  assert.equal(lastDispatch.effects[0].is(revealLinkedTableMarkdownEffect), true);
  assert.deepEqual(lastDispatch.selection, {
    anchor: 4,
    head: 15,
  });
  assert.equal(lastDispatch.scrollIntoView, true);

  controller.closeMarkdown({
    tableId: 'sales-summary',
    headerFrom: 4,
    tableFrom: 6,
  });
  assert.equal(lastDispatch.effects[0].is(hideLinkedTableMarkdownEffect), true);
  assert.deepEqual(lastDispatch.selection, {
    anchor: 6,
  });

  controller.destroy();
});

test('LinkedTableController summarizes table job status', () => {
  const ydoc = new Y.Doc();
  const dom = new EventTarget();
  const editor = {
    ydoc,
    getYText() {
      return ydoc.getText('content');
    },
    view: {
      dom,
      dispatch() {},
    },
  };

  const controller = createLinkedTableController({ editor });
  const jobs = ydoc.getMap('tableJobs');
  jobs.set('job-1', {
    id: 'job-1',
    tableId: 'sales-summary',
    status: 'running',
    requestedAt: 1,
  });
  assert.equal(controller.summarizeTableStatus('sales-summary').status, 'running');

  jobs.set('job-1', {
    id: 'job-1',
    tableId: 'sales-summary',
    status: 'completed',
    requestedAt: 1,
    completedAt: 2,
    result: {
      updatedSpec: {
        snapshot: {
          materializedAt: '2026-03-08T12:00:00Z',
        },
      },
    },
  });
  assert.equal(controller.summarizeTableStatus('sales-summary').status, 'fresh');

  jobs.set('job-2', {
    id: 'job-2',
    tableId: 'sales-summary',
    status: 'error',
    requestedAt: 3,
    completedAt: 4,
    error: { message: 'boom' },
  });
  const status = controller.summarizeTableStatus('sales-summary');
  assert.equal(status.status, 'error');
  assert.match(status.title, /boom/);

  controller.destroy();
});

test('LinkedTableController opens and reveals source paths through the host api', async () => {
  const ydoc = new Y.Doc();
  const dom = new EventTarget();
  const opened = [];
  const revealed = [];

  const hostApi = {
    table: {
      async resolvePaths({ spec }) {
        return {
          tableId: spec.id,
          sourcePaths: [
            { path: '/tmp/project/_assets/tables/sales-summary/source.csv' },
          ],
          transformPath: '/tmp/project/_assets/tables/sales-summary/transform.R',
          cachePath: '/tmp/project/_assets/tables/sales-summary/cache.csv',
        };
      },
    },
    getFileInfo(fullPath) {
      return Promise.resolve({
        success: true,
        modified: '2026-03-09T12:00:00Z',
        path: fullPath,
      });
    },
    openFile(fullPath) {
      opened.push(fullPath);
      return Promise.resolve({ success: true });
    },
    shell: {
      showItemInFolder(fullPath) {
        revealed.push(fullPath);
        return Promise.resolve();
      },
      openPath(fullPath) {
        opened.push(`shell:${fullPath}`);
        return Promise.resolve('');
      },
    },
  };

  const editor = {
    ydoc,
    getYText() {
      return ydoc.getText('content');
    },
    view: {
      dom,
      dispatch() {},
    },
  };

  const controller = createLinkedTableController({
    editor,
    hostApi,
    projectRoot: '/tmp/project',
    documentPath: 'notes/demo.md',
  });

  const detail = {
    tableId: 'sales-summary',
    spec: {
      id: 'sales-summary',
      snapshot: {
        materializedAt: '2026-03-08T12:00:00Z',
      },
      sources: [{ name: 'source', path: '../_assets/tables/sales-summary/source.csv' }],
      transform: { path: '../_assets/tables/sales-summary/transform.R' },
      cache: { path: '../_assets/tables/sales-summary/cache.csv' },
    },
  };

  assert.equal(await controller.openSource(detail), true);
  assert.deepEqual(opened, ['shell:/tmp/project/_assets/tables/sales-summary/source.csv']);

  assert.equal(await controller.revealSource(detail), true);
  assert.deepEqual(revealed, ['/tmp/project/_assets/tables/sales-summary/source.csv']);

  const stale = await controller.refreshTableStaleness({
    spec: detail.spec,
  });
  assert.equal(stale.status, 'stale');
  assert.equal(controller.summarizeTableStatus('sales-summary').status, 'stale');

  controller.destroy();
});
