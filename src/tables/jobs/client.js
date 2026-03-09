/**
 * Browser-side linked-table job coordination.
 *
 * Mirrors the monitor execution coordination pattern but for `tableJobs`.
 */

import * as Y from 'yjs';

export const TABLE_JOB_STATUS = {
  REQUESTED: 'requested',
  CLAIMED: 'claimed',
  RUNNING: 'running',
  WRITING: 'writing',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
};

export class TableJobsClient {
  constructor(ydoc, clientId = ydoc?.clientID) {
    this.ydoc = ydoc;
    this.clientId = clientId;
    this.jobs = ydoc.getMap('tableJobs');
    this._statusCallbacks = new Map();
    this._observers = new Set();
    this._setupObserver();
  }

  static generateJobId() {
    return `tablejob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  _setupObserver() {
    const observer = (event) => {
      event.changes.keys.forEach((change, jobId) => {
        const job = this.jobs.get(jobId);
        const callback = this._statusCallbacks.get(jobId);
        if (callback && job) {
          callback(job.status, job);
        }
      });
    };

    this.jobs.observe(observer);
    this._observers.add(observer);
  }

  requestJob({ tableId, blockAnchor = null, spec = null, jobType = 'applyOps', opList = [], metadata = {} }) {
    const jobId = TableJobsClient.generateJobId();
    this.jobs.set(jobId, {
      id: jobId,
      tableId,
      jobType,
      status: TABLE_JOB_STATUS.REQUESTED,
      requestedBy: this.clientId,
      requestedAt: Date.now(),
      claimedBy: null,
      claimedAt: null,
      completedAt: null,
      blockAnchor,
      spec,
      opList,
      metadata,
      result: null,
      error: null,
    });
    return jobId;
  }

  requestSort({ tableId, blockAnchor = null, spec = null, column, direction = 'asc', metadata = {} }) {
    return this.requestJob({
      tableId,
      blockAnchor,
      spec,
      jobType: 'applyOps',
      opList: [{ type: 'sort', column, direction }],
      metadata,
    });
  }

  requestRefresh({ tableId, blockAnchor = null, spec = null, metadata = {} }) {
    return this.requestJob({
      tableId,
      blockAnchor,
      spec,
      jobType: 'refresh',
      opList: [],
      metadata,
    });
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if ([TABLE_JOB_STATUS.COMPLETED, TABLE_JOB_STATUS.ERROR, TABLE_JOB_STATUS.CANCELLED].includes(job.status)) {
      return;
    }
    this.jobs.set(jobId, {
      ...job,
      status: TABLE_JOB_STATUS.CANCELLED,
      completedAt: Date.now(),
    });
  }

  onStatusChange(jobId, callback) {
    this._statusCallbacks.set(jobId, callback);
    return () => {
      this._statusCallbacks.delete(jobId);
    };
  }

  waitForStatus(jobId, targetStatus, timeout = 30000) {
    const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];

    return new Promise((resolve, reject) => {
      const current = this.getJob(jobId);
      if (current && statuses.includes(current.status)) {
        resolve(current);
        return;
      }

      let timeoutId = null;
      const unsubscribe = this.onStatusChange(jobId, (status, job) => {
        if (!statuses.includes(status)) return;
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();
        resolve(job);
      });

      timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for table job status ${statuses.join('/')} on ${jobId}`));
      }, timeout);
    });
  }

  destroy() {
    for (const observer of this._observers) {
      this.jobs.unobserve(observer);
    }
    this._observers.clear();
    this._statusCallbacks.clear();
  }
}

export function createTableJobsClient(ydoc) {
  return new TableJobsClient(ydoc, ydoc.clientID);
}

export default {
  TABLE_JOB_STATUS,
  TableJobsClient,
  createTableJobsClient,
};
