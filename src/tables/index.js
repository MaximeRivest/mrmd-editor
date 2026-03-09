/**
 * Linked-table editor integration exports.
 */

export { findLinkedTableBlocksInState, getLinkedTableBlockRange, isRangeInsideLinkedTable } from './parsing/linked-table-blocks.js';
export { createLinkedTableBlockAnchor, resolveLinkedTableBlockAnchor } from './parsing/anchors.js';
export {
  linkedTableMarkdownState,
  revealLinkedTableMarkdownEffect,
  hideLinkedTableMarkdownEffect,
  clearLinkedTableMarkdownEffect,
  isLinkedTableMarkdownOpen,
} from './state/linked-table-state.js';
export { LINKED_TABLE_EVENT, dispatchLinkedTableAction, openLinkedTableWorkspace } from './commands/open-table-workspace.js';
export {
  canImportLinkedTableFromHost,
  normalizeLinkedTableBlockInsertion,
  insertLinkedTableBlock,
  importLinkedTableFromHost,
} from './commands/insert-linked-table.js';
export { TableJobsClient, TABLE_JOB_STATUS, createTableJobsClient } from './jobs/client.js';
export { LinkedTableController, createLinkedTableController } from './workspace/controller.js';
export { LinkedTableWidget } from './widgets/linked-table-widget.js';
export { LinkedTableSourceBannerWidget } from './widgets/linked-table-source-banner.js';
