/**
 * Linked-table widget for the embedded document view.
 */

import { WidgetType } from '@codemirror/view';
import { TableWidget, parseTable } from '../../markdown/widgets/table.js';
import { dispatchLinkedTableAction } from '../commands/open-table-workspace.js';

function stripCaptionMarkers(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('_') && trimmed.endsWith('_')) || (trimmed.startsWith('*') && trimmed.endsWith('*'))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = cloneValue(value[key]);
    return out;
  }
  return value;
}

function getSortableHeaderCells(table) {
  const headerRow = table?.rows?.find((row) => row.isHeader && !row.isDelimiter);
  if (!headerRow) return [];
  return headerRow.cells.filter((cell) => !cell.hidden && cell.content.trim() !== '' && cell.content.trim() !== '>' && cell.content.trim() !== '^');
}

function inferFormats(spec) {
  return Array.from(new Set((spec?.sources || []).map((source) => String(source.format || source.kind || '').trim()).filter(Boolean)));
}

function buildActionDetail(baseDetail, action, extra = {}) {
  return {
    ...baseDetail,
    action,
    ...extra,
  };
}

function formatMaterializedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export class LinkedTableWidget extends WidgetType {
  constructor(block, parsedTable, contentHash, options = {}) {
    super();
    this.block = block;
    this.parsedTable = parsedTable;
    this.contentHash = contentHash;
    this.options = options;
  }

  eq(other) {
    return other?.contentHash === this.contentHash;
  }

  _baseDetail() {
    return {
      tableId: this.block.spec.id,
      label: this.block.spec.label || this.block.spec.id,
      spec: cloneValue(this.block.spec),
      headerFrom: this.block.headerFrom,
      headerTo: this.block.headerTo,
      snapshotFrom: this.block.snapshotFrom,
      snapshotTo: this.block.snapshotTo,
      tableFrom: this.block.tableFrom,
      tableTo: this.block.tableTo,
      startLine: this.block.startLine,
      endLine: this.block.endLine,
    };
  }

  _dispatch(view, action, extra = {}) {
    return dispatchLinkedTableAction(view, buildActionDetail(this._baseDetail(), action, extra));
  }

  _buildChrome(view) {
    const chrome = document.createElement('div');
    chrome.className = 'cm-linked-table-chrome';

    const left = document.createElement('div');
    left.className = 'cm-linked-table-chrome-left';

    const title = document.createElement('div');
    title.className = 'cm-linked-table-title';
    title.textContent = this.block.spec.label || this.block.spec.id || 'Linked table';
    left.appendChild(title);

    const badges = document.createElement('div');
    badges.className = 'cm-linked-table-badges';

    const linkedBadge = document.createElement('span');
    linkedBadge.className = 'cm-linked-table-badge cm-linked-table-badge-linked';
    linkedBadge.textContent = 'Linked';
    badges.appendChild(linkedBadge);

    const engineBadge = document.createElement('span');
    engineBadge.className = 'cm-linked-table-badge';
    engineBadge.textContent = this.block.spec.engine || 'engine';
    badges.appendChild(engineBadge);

    const sourceCountBadge = document.createElement('span');
    sourceCountBadge.className = 'cm-linked-table-badge';
    sourceCountBadge.textContent = `${(this.block.spec.sources || []).length} source${(this.block.spec.sources || []).length === 1 ? '' : 's'}`;
    badges.appendChild(sourceCountBadge);

    for (const format of inferFormats(this.block.spec)) {
      const badge = document.createElement('span');
      badge.className = 'cm-linked-table-badge';
      badge.textContent = format;
      badges.appendChild(badge);
    }

    const statusBadge = document.createElement('span');
    statusBadge.className = 'cm-linked-table-badge cm-linked-table-status-badge cm-linked-table-status-fresh';
    statusBadge.textContent = 'Fresh';
    const materializedAt = this.block.spec?.snapshot?.materializedAt;
    if (materializedAt) {
      statusBadge.title = `Last materialized ${formatMaterializedAt(materializedAt)}`;
    }
    badges.appendChild(statusBadge);

    left.appendChild(badges);
    chrome.appendChild(left);

    const right = document.createElement('div');
    right.className = 'cm-linked-table-actions';

    const makeButton = (label, action, title, extra = {}) => {
      const button = document.createElement('button');
      button.className = 'cm-linked-table-action';
      button.type = 'button';
      button.textContent = label;
      button.dataset.linkedTableAction = action;
      if (title) button.title = title;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._dispatch(view, action, extra);
      });
      return button;
    };

    right.appendChild(makeButton('Open grid', 'open-grid', 'Open full linked-table workspace'));
    right.appendChild(makeButton('Open source', 'open-source', 'Open the primary linked-table source file'));
    right.appendChild(makeButton('Reveal source', 'reveal-source', 'Reveal the primary linked-table source in the host file manager'));
    right.appendChild(makeButton('Open markdown', 'open-markdown', 'Open raw markdown for this linked table'));
    right.appendChild(makeButton('Refresh', 'refresh', 'Refresh linked table materialization'));

    chrome.appendChild(right);
    return chrome;
  }

  _buildCaption(text, position) {
    const captionText = stripCaptionMarkers(text);
    if (!captionText) return null;
    const el = document.createElement('div');
    el.className = `cm-linked-table-caption cm-linked-table-caption-${position}`;
    el.textContent = captionText;
    return el;
  }

  _decorateSortableHeaders(view, tableContainer) {
    const sortableHeaders = getSortableHeaderCells(this.parsedTable);
    if (sortableHeaders.length === 0) return;

    const headerRow = tableContainer.querySelector('thead tr');
    if (!headerRow) return;

    const domHeaders = Array.from(headerRow.querySelectorAll('th'));
    const count = Math.min(domHeaders.length, sortableHeaders.length);

    for (let index = 0; index < count; index++) {
      const th = domHeaders[index];
      const headerCell = sortableHeaders[index];
      const column = headerCell.content.trim();
      if (!column) continue;

      th.classList.add('cm-linked-table-sortable');
      th.title = `Sort by ${column}`;
      th.dataset.linkedTableColumn = column;
      th.dataset.linkedTableSortDirection = th.dataset.linkedTableSortDirection || 'none';

      th.addEventListener('click', (event) => {
        if (th.getAttribute('aria-disabled') === 'true') {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const current = th.dataset.linkedTableSortDirection || 'none';
        const next = current === 'asc' ? 'desc' : 'asc';
        th.dataset.linkedTableSortDirection = next;
        this._dispatch(view, 'sort', { column, direction: next });
      });
    }
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'cm-linked-table-widget';
    container.dataset.tableId = this.block.spec.id;
    container.dataset.engine = this.block.spec.engine || '';
    container.dataset.materializedAt = this.block.spec?.snapshot?.materializedAt || '';

    container.appendChild(this._buildChrome(view));

    const aboveCaption = this._buildCaption(this.block.captionAboveText, 'above');
    if (aboveCaption) container.appendChild(aboveCaption);

    const body = document.createElement('div');
    body.className = 'cm-linked-table-body';

    const renderedTable = new TableWidget(this.parsedTable, `linked-${this.block.spec.id}`).toDOM(view);
    body.appendChild(renderedTable);
    this._decorateSortableHeaders(view, renderedTable);

    container.appendChild(body);

    const belowCaption = this._buildCaption(this.block.captionBelowText, 'below');
    if (belowCaption) container.appendChild(belowCaption);

    return container;
  }

  ignoreEvent() {
    return false;
  }

  get estimatedHeight() {
    return this.options.estimatedHeight || -1;
  }
}

export function createLinkedTableWidgetFromBlock(block, contentHash, options = {}) {
  const parsed = parseTable(block.tableLines || []);
  if (!parsed || !parsed.rows || parsed.rows.length === 0) return null;
  return new LinkedTableWidget(block, parsed, contentHash, options);
}

export default {
  LinkedTableWidget,
  createLinkedTableWidgetFromBlock,
};
