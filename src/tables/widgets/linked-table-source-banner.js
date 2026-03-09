/**
 * Banner shown when one linked table is in local markdown/source view.
 */

import { WidgetType } from '@codemirror/view';
import { dispatchLinkedTableAction } from '../commands/open-table-workspace.js';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = cloneValue(value[key]);
    return out;
  }
  return value;
}

function buildActionDetail(block, action, extra = {}) {
  return {
    action,
    tableId: block.spec.id,
    label: block.spec.label || block.spec.id,
    spec: cloneValue(block.spec),
    headerFrom: block.headerFrom,
    headerTo: block.headerTo,
    snapshotFrom: block.snapshotFrom,
    snapshotTo: block.snapshotTo,
    tableFrom: block.tableFrom,
    tableTo: block.tableTo,
    startLine: block.startLine,
    endLine: block.endLine,
    ...extra,
  };
}

export class LinkedTableSourceBannerWidget extends WidgetType {
  constructor(block) {
    super();
    this.block = block;
  }

  eq(other) {
    return other?.block?.spec?.id === this.block.spec.id;
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'cm-linked-table-source-banner';
    container.dataset.tableId = this.block.spec.id;

    const text = document.createElement('div');
    text.className = 'cm-linked-table-source-banner-text';
    text.textContent = `${this.block.spec.label || this.block.spec.id}: markdown source view`;
    container.appendChild(text);

    const button = document.createElement('button');
    button.className = 'cm-linked-table-source-banner-action';
    button.type = 'button';
    button.textContent = 'Return to linked view';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dispatchLinkedTableAction(view, buildActionDetail(this.block, 'close-markdown'));
    });
    container.appendChild(button);

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

export default {
  LinkedTableSourceBannerWidget,
};
