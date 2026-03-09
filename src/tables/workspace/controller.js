/**
 * Linked-table document/workspace controller.
 *
 * The first implementation keeps the embedded widget actions and `tableJobs`
 * map in sync.
 */

import { LINKED_TABLE_EVENT } from '../commands/open-table-workspace.js';
import { TableJobsClient } from '../jobs/client.js';
import { createLinkedTableBlockAnchor } from '../parsing/anchors.js';
import { findLinkedTableBlocksInState } from '../parsing/linked-table-blocks.js';
import {
  revealLinkedTableMarkdownEffect,
  hideLinkedTableMarkdownEffect,
} from '../state/linked-table-state.js';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = cloneValue(value[key]);
    return out;
  }
  return value;
}

const TERMINAL_JOB_STATUSES = new Set(['completed', 'error', 'cancelled']);
const ACTIVE_JOB_STATUSES = new Set(['requested', 'claimed', 'running', 'writing']);
const STALE_CHECK_TTL_MS = 5000;

function createActionMetadata(detail) {
  return {
    action: detail.action || null,
    label: detail.label || detail.tableId || null,
    source: 'linked-table-widget',
  };
}

function summarizeStatusLabel(status) {
  switch (status) {
    case 'requested':
    case 'claimed':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'writing':
      return 'Writing';
    case 'error':
      return 'Error';
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return 'Fresh';
    default:
      return status || 'Fresh';
  }
}

function isTextLikePath(filePath) {
  const textLikeExtensions = new Set([
    'md', 'qmd', 'txt', 'csv', 'tsv', 'json', 'yaml', 'yml', 'r', 'py', 'js', 'ts', 'sql', 'html', 'css', 'xml', 'toml'
  ]);
  const match = String(filePath || '').match(/\.([^.]+)$/);
  return !!(match && textLikeExtensions.has(match[1].toLowerCase()));
}

function isEditorDocumentPath(filePath) {
  const match = String(filePath || '').match(/\.([^.]+)$/);
  if (!match) return false;
  return new Set(['md', 'qmd']).has(match[1].toLowerCase());
}

function toTimestamp(value) {
  const date = new Date(value || '');
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function formatTimestamp(value) {
  const time = toTimestamp(value);
  return time === null ? '' : new Date(time).toLocaleString();
}

function latestJobTimestamp(job) {
  if (!job) return 0;
  return job.completedAt || job.startedAt || job.claimedAt || job.requestedAt || 0;
}

export class LinkedTableController {
  constructor(options = {}) {
    this.editor = options.editor || null;
    this.view = options.view || this.editor?.view || null;
    this.ydoc = options.ydoc || this.editor?.ydoc || null;
    this.yText = options.yText || this.editor?.getYText?.() || this.editor?.yText || null;
    this.jobsClient = options.jobsClient || (this.ydoc ? new TableJobsClient(this.ydoc, this.ydoc.clientID) : null);
    this.ownsJobsClient = !options.jobsClient;
    this.hostApi = options.hostApi || null;
    this.hostContext = {
      projectRoot: options.projectRoot || null,
      documentPath: options.documentPath || null,
    };
    this.onAction = typeof options.onAction === 'function' ? options.onAction : null;
    this.onJobRequested = typeof options.onJobRequested === 'function' ? options.onJobRequested : null;
    this.onJobStatusChange = typeof options.onJobStatusChange === 'function' ? options.onJobStatusChange : null;
    this.handleSortJobs = options.handleSortJobs !== false;
    this.handleRefreshJobs = options.handleRefreshJobs !== false;
    this.handleOpenMarkdown = options.handleOpenMarkdown !== false;
    this._staleInfoCache = new Map();
    this._staleRefreshScheduled = false;
    this._stalePollingTimer = null;
    this._boundHandleAction = this._handleAction.bind(this);
    this._boundJobsObserver = this._handleJobsMapChange.bind(this);

    if (this.view?.dom?.addEventListener) {
      this.view.dom.addEventListener(LINKED_TABLE_EVENT, this._boundHandleAction);
    }

    if (this.jobsClient?.jobs?.observe) {
      this.jobsClient.jobs.observe(this._boundJobsObserver);
    }

    const host = this.getHostApi();
    if (host?.table?.resolvePaths && host?.getFileInfo && typeof setInterval === 'function') {
      this._stalePollingTimer = setInterval(() => {
        this.refreshVisibleTableStaleness().catch((error) => {
          console.warn('[mrmd-editor/tables] stale polling failed:', error);
        });
      }, STALE_CHECK_TTL_MS);
    }

    this.syncWidgetStatuses();
  }

  _notifyAction(detail, event) {
    if (!this.onAction) return;
    try {
      this.onAction(detail, event, this);
    } catch (error) {
      console.warn('[mrmd-editor/tables] linked-table action callback failed:', error);
    }
  }

  _notifyRequested(jobId, detail) {
    if (!this.onJobRequested) return;
    try {
      this.onJobRequested(jobId, detail, this.jobsClient?.getJob(jobId) || null, this);
    } catch (error) {
      console.warn('[mrmd-editor/tables] linked-table job request callback failed:', error);
    }
  }

  _watchJob(jobId, detail) {
    if (!this.jobsClient || !this.onJobStatusChange) return;

    const unsubscribe = this.jobsClient.onStatusChange(jobId, (status, job) => {
      try {
        this.onJobStatusChange(status, job, detail, this);
      } catch (error) {
        console.warn('[mrmd-editor/tables] linked-table job status callback failed:', error);
      }

      if (detail?.tableId && status === 'completed') {
        this._staleInfoCache.delete(detail.tableId);
      }

      this.syncWidgetStatuses();

      if (TERMINAL_JOB_STATUSES.has(status)) {
        unsubscribe();
      }
    });
  }

  _handleJobsMapChange() {
    this.syncWidgetStatuses();
  }

  _listVisibleTableIds() {
    if (!this.view?.dom?.querySelectorAll) return [];
    return Array.from(this.view.dom.querySelectorAll('.cm-linked-table-widget[data-table-id]'))
      .map((element) => element.dataset.tableId)
      .filter(Boolean);
  }

  _findBlockByTableId(tableId) {
    if (!tableId || !this.view?.state) return null;
    return findLinkedTableBlocksInState(this.view.state).find((block) => block?.spec?.id === tableId) || null;
  }

  _scheduleStalenessRefresh() {
    if (this._staleRefreshScheduled) return;
    const host = this.getHostApi();
    if (!host?.table?.resolvePaths || !host?.getFileInfo) return;

    this._staleRefreshScheduled = true;
    queueMicrotask(() => {
      this._staleRefreshScheduled = false;
      this.refreshVisibleTableStaleness().catch((error) => {
        console.warn('[mrmd-editor/tables] stale refresh failed:', error);
      });
    });
  }

  _listJobsForTable(tableId) {
    if (!this.jobsClient?.jobs || !tableId) return [];
    return Array.from(this.jobsClient.jobs.values())
      .filter((job) => job?.tableId === tableId)
      .sort((left, right) => latestJobTimestamp(right) - latestJobTimestamp(left));
  }

  findActiveJobForTable(tableId) {
    return this._listJobsForTable(tableId).find((job) => ACTIVE_JOB_STATUSES.has(job.status)) || null;
  }

  summarizeTableStatus(tableId, fallbackMaterializedAt = '') {
    const jobs = this._listJobsForTable(tableId);
    const activeJob = jobs.find((job) => ACTIVE_JOB_STATUSES.has(job.status));
    if (activeJob) {
      const phaseTitle = activeJob.status === 'writing'
        ? 'Writing updated markdown snapshot'
        : activeJob.status === 'running'
          ? 'Materializing linked-table result'
          : 'Queued linked-table job';
      return {
        status: activeJob.status,
        label: summarizeStatusLabel(activeJob.status),
        title: activeJob.error?.message || phaseTitle,
        busy: true,
      };
    }

    const latest = jobs[0] || null;
    if (latest?.status === 'error') {
      return {
        status: 'error',
        label: 'Error',
        title: latest.error?.message || 'Linked-table job failed',
        busy: false,
      };
    }

    if (latest?.status === 'cancelled') {
      return {
        status: 'cancelled',
        label: 'Cancelled',
        title: 'Linked-table job cancelled',
        busy: false,
      };
    }

    const materializedAt = latest?.result?.updatedSpec?.snapshot?.materializedAt || fallbackMaterializedAt || '';
    const staleInfo = this._staleInfoCache.get(tableId);
    if (staleInfo?.status === 'stale') {
      return {
        status: 'stale',
        label: 'Stale',
        title: staleInfo.title || 'Linked-table source changed after the last materialization',
        busy: false,
      };
    }

    const rowCount = latest?.result?.snapshot?.rowCount ?? latest?.result?.materialized?.rowCount ?? null;
    return {
      status: 'fresh',
      label: 'Fresh',
      title: materializedAt
        ? `Last materialized ${formatTimestamp(materializedAt)}${Number.isInteger(rowCount) ? ` • ${rowCount} rows` : ''}`
        : 'Linked-table snapshot is current',
      busy: false,
    };
  }

  async refreshTableStaleness(tableIdOrBlock) {
    const block = typeof tableIdOrBlock === 'string'
      ? this._findBlockByTableId(tableIdOrBlock)
      : tableIdOrBlock;
    if (!block?.spec?.id) return null;

    const tableId = block.spec.id;
    if (this.findActiveJobForTable(tableId)) return null;

    const host = this.getHostApi();
    if (!host?.table?.resolvePaths || !host?.getFileInfo) return null;

    const materializedAt = block.spec?.snapshot?.materializedAt || '';
    const materializedTime = toTimestamp(materializedAt);
    if (materializedTime === null) {
      this._staleInfoCache.delete(tableId);
      return null;
    }

    const cached = this._staleInfoCache.get(tableId);
    if (cached && cached.materializedAt === materializedAt && (Date.now() - cached.checkedAt) < STALE_CHECK_TTL_MS) {
      return cached;
    }

    const resolved = await this.resolveHostPaths({ tableId, spec: block.spec });
    const sourcePaths = resolved?.sourcePaths || [];
    if (sourcePaths.length === 0) {
      this._staleInfoCache.set(tableId, {
        status: 'fresh',
        checkedAt: Date.now(),
        materializedAt,
      });
      return this._staleInfoCache.get(tableId);
    }

    let latestModified = null;
    let latestPath = null;
    for (const source of sourcePaths) {
      const info = await host.getFileInfo(source.path);
      if (!info?.success || !info.modified) continue;
      const modifiedTime = toTimestamp(info.modified);
      if (modifiedTime === null) continue;
      if (latestModified === null || modifiedTime > latestModified) {
        latestModified = modifiedTime;
        latestPath = source.path;
      }
    }

    const stale = latestModified !== null && latestModified > materializedTime;
    const entry = stale
      ? {
          status: 'stale',
          checkedAt: Date.now(),
          materializedAt,
          title: `Source changed ${formatTimestamp(latestModified)}${latestPath ? ` • ${latestPath.split('/').pop()}` : ''}`,
        }
      : {
          status: 'fresh',
          checkedAt: Date.now(),
          materializedAt,
        };

    this._staleInfoCache.set(tableId, entry);
    return entry;
  }

  async refreshVisibleTableStaleness() {
    const visibleTableIds = this._listVisibleTableIds();
    await Promise.all(visibleTableIds.map((tableId) => this.refreshTableStaleness(tableId)));
    this.syncWidgetStatuses({ scheduleStalenessCheck: false });
  }

  syncWidgetStatuses(options = {}) {
    if (!this.view?.dom?.querySelectorAll) return;

    const widgets = this.view.dom.querySelectorAll('.cm-linked-table-widget[data-table-id]');
    for (const widget of widgets) {
      const tableId = widget.dataset.tableId;
      if (!tableId) continue;

      const statusInfo = this.summarizeTableStatus(tableId, widget.dataset.materializedAt || '');
      widget.dataset.jobStatus = statusInfo.status;
      widget.setAttribute('aria-busy', statusInfo.busy ? 'true' : 'false');
      widget.title = statusInfo.title || '';

      const badges = widget.querySelector('.cm-linked-table-badges');
      if (badges) {
        badges.querySelectorAll('.cm-linked-table-status-badge').forEach((badge) => badge.remove());
        const badge = document.createElement('span');
        badge.className = `cm-linked-table-badge cm-linked-table-status-badge cm-linked-table-status-${statusInfo.status}${statusInfo.busy ? ' cm-linked-table-status-active' : ''}`;
        badge.textContent = statusInfo.busy ? `${statusInfo.label}…` : statusInfo.label;
        if (statusInfo.title) badge.title = statusInfo.title;
        badges.appendChild(badge);
      }

      const refreshButton = widget.querySelector('.cm-linked-table-action[data-linked-table-action="refresh"]');
      if (refreshButton) {
        refreshButton.textContent = statusInfo.busy ? 'Working…' : 'Refresh';
      }

      const actions = widget.querySelectorAll('.cm-linked-table-action, .cm-linked-table-sortable');
      actions.forEach((actionEl) => {
        if (actionEl.matches('.cm-linked-table-action[data-linked-table-action="open-markdown"], .cm-linked-table-action[data-linked-table-action="open-grid"], .cm-linked-table-action[data-linked-table-action="open-source"], .cm-linked-table-action[data-linked-table-action="reveal-source"]')) {
          return;
        }
        if ('disabled' in actionEl) {
          actionEl.disabled = !!statusInfo.busy;
        }
        if (statusInfo.busy) {
          actionEl.setAttribute('aria-disabled', 'true');
        } else {
          actionEl.removeAttribute('aria-disabled');
        }
      });
    }

    if (options.scheduleStalenessCheck !== false) {
      this._scheduleStalenessRefresh();
    }
  }

  getHostApi() {
    if (this.hostApi) return this.hostApi;
    if (typeof window !== 'undefined' && window?.electronAPI) return window.electronAPI;
    return null;
  }

  setHostContext(context = {}) {
    this.hostContext = {
      ...this.hostContext,
      ...context,
    };
    return this.getHostContext();
  }

  getHostContext() {
    return { ...this.hostContext };
  }

  createBlockAnchor(detail) {
    if (!this.yText) {
      throw new Error('LinkedTableController requires a Y.Text to create block anchors');
    }

    return createLinkedTableBlockAnchor(this.yText, {
      tableId: detail.tableId,
      headerFrom: detail.headerFrom,
      snapshotTo: detail.snapshotTo,
    });
  }

  async resolveHostPaths(detail) {
    const host = this.getHostApi();
    const projectRoot = this.hostContext.projectRoot;
    const documentPath = this.hostContext.documentPath;
    if (!host?.table?.resolvePaths) return null;
    if (!projectRoot || !documentPath || !detail?.spec) return null;

    return host.table.resolvePaths({
      projectRoot,
      documentPath,
      spec: cloneValue(detail.spec),
    });
  }

  requestSort(detail) {
    if (!this.jobsClient) {
      throw new Error('LinkedTableController requires a TableJobsClient to request sort jobs');
    }

    const activeJob = this.findActiveJobForTable(detail.tableId);
    if (activeJob) {
      return activeJob.id;
    }

    this._staleInfoCache.delete(detail.tableId);

    const blockAnchor = this.createBlockAnchor(detail);
    const jobId = this.jobsClient.requestSort({
      tableId: detail.tableId,
      blockAnchor,
      spec: cloneValue(detail.spec),
      column: detail.column,
      direction: detail.direction || 'asc',
      metadata: createActionMetadata(detail),
    });

    this._notifyRequested(jobId, detail);
    this._watchJob(jobId, detail);
    this.syncWidgetStatuses();
    return jobId;
  }

  requestRefresh(detail) {
    if (!this.jobsClient) {
      throw new Error('LinkedTableController requires a TableJobsClient to request refresh jobs');
    }

    const activeJob = this.findActiveJobForTable(detail.tableId);
    if (activeJob) {
      return activeJob.id;
    }

    this._staleInfoCache.delete(detail.tableId);

    const blockAnchor = this.createBlockAnchor(detail);
    const jobId = this.jobsClient.requestRefresh({
      tableId: detail.tableId,
      blockAnchor,
      spec: cloneValue(detail.spec),
      metadata: createActionMetadata(detail),
    });

    this._notifyRequested(jobId, detail);
    this._watchJob(jobId, detail);
    this.syncWidgetStatuses();
    return jobId;
  }

  openMarkdown(detail) {
    if (!this.handleOpenMarkdown) return false;

    if (this.view?.dispatch && detail.tableId) {
      this.view.dispatch({
        effects: [revealLinkedTableMarkdownEffect.of({ tableId: detail.tableId })],
        selection: {
          anchor: Number.isInteger(detail.headerFrom) ? detail.headerFrom : (detail.snapshotFrom || 0),
          head: Number.isInteger(detail.snapshotTo) ? detail.snapshotTo : (detail.headerFrom || 0),
        },
        scrollIntoView: true,
      });
      return true;
    }

    return false;
  }

  async openSource(detail) {
    const host = this.getHostApi();
    if (!host) return false;

    const resolved = await this.resolveHostPaths(detail);
    const primarySourcePath = resolved?.sourcePaths?.[0]?.path || null;
    if (!primarySourcePath) return false;

    if (host.openFile && isEditorDocumentPath(primarySourcePath)) {
      await host.openFile(primarySourcePath);
      return true;
    }

    if (host.shell?.openPath && isTextLikePath(primarySourcePath)) {
      await host.shell.openPath(primarySourcePath);
      return true;
    }

    if (host.shell?.showItemInFolder) {
      await host.shell.showItemInFolder(primarySourcePath);
      return true;
    }

    return false;
  }

  async revealSource(detail) {
    const host = this.getHostApi();
    if (!host?.shell?.showItemInFolder) return false;

    const resolved = await this.resolveHostPaths(detail);
    const primarySourcePath = resolved?.sourcePaths?.[0]?.path || null;
    if (!primarySourcePath) return false;

    await host.shell.showItemInFolder(primarySourcePath);
    return true;
  }

  closeMarkdown(detail) {
    if (!this.view?.dispatch || !detail?.tableId) return false;
    this.view.dispatch({
      effects: [hideLinkedTableMarkdownEffect.of({ tableId: detail.tableId })],
      selection: {
        anchor: Number.isInteger(detail.tableFrom) ? detail.tableFrom : (detail.headerFrom || 0),
      },
      scrollIntoView: true,
    });
    return true;
  }

  _handleAction(event) {
    const detail = event?.detail || {};
    if (!detail?.action) return;

    let jobId = null;

    if (detail.action === 'sort' && this.handleSortJobs && detail.tableId && detail.spec && detail.column) {
      jobId = this.requestSort(detail);
      detail.jobId = jobId;
    } else if (detail.action === 'refresh' && this.handleRefreshJobs && detail.tableId && detail.spec) {
      jobId = this.requestRefresh(detail);
      detail.jobId = jobId;
    } else if (detail.action === 'open-markdown') {
      this.openMarkdown(detail);
    } else if (detail.action === 'close-markdown') {
      this.closeMarkdown(detail);
    } else if (detail.action === 'open-source') {
      Promise.resolve(this.openSource(detail)).catch((error) => {
        console.warn('[mrmd-editor/tables] open-source action failed:', error);
      });
    } else if (detail.action === 'reveal-source') {
      Promise.resolve(this.revealSource(detail)).catch((error) => {
        console.warn('[mrmd-editor/tables] reveal-source action failed:', error);
      });
    }

    this._notifyAction(detail, event);
  }

  destroy() {
    if (this.view?.dom?.removeEventListener) {
      this.view.dom.removeEventListener(LINKED_TABLE_EVENT, this._boundHandleAction);
    }

    if (this.jobsClient?.jobs?.unobserve && this._boundJobsObserver) {
      this.jobsClient.jobs.unobserve(this._boundJobsObserver);
    }

    if (this._stalePollingTimer) {
      clearInterval(this._stalePollingTimer);
      this._stalePollingTimer = null;
    }

    if (this.ownsJobsClient && this.jobsClient?.destroy) {
      this.jobsClient.destroy();
    }
  }
}

export function createLinkedTableController(options = {}) {
  return new LinkedTableController(options);
}

export default {
  LinkedTableController,
  createLinkedTableController,
};
