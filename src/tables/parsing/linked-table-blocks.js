/**
 * Linked-table block parsing helpers for the editor.
 *
 * Bridges CodeMirror editor state/doc text to the pure `mrmd-table-spec`
 * block-discovery layer.
 */

import { findLinkedTableBlocks } from '../../../../mrmd-table-spec/src/index.js';
import { documentText, memoizeDocumentScan } from '../../markdown/document-cache.js';

function splitLines(text) {
  return String(text || '').split(/\r?\n/);
}

/**
 * Find linked-table blocks in the current editor state.
 * Enriches pure spec blocks with table text/lines for widget rendering.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @returns {Array<Object>}
 */
const blocksInDocument = memoizeDocumentScan((doc) => {
  const text = documentText(doc);
  // The spec parser requires this exact header. Avoid constructing a line
  // table for ordinary documents which cannot contain a linked table.
  if (!text.includes('<!--mrmd:table')) return [];
  return findLinkedTableBlocks(text).map((block) => ({
    ...block,
    headerText: text.slice(block.headerFrom, block.headerTo),
    tableText: text.slice(block.tableFrom, block.tableTo),
    tableLines: splitLines(text.slice(block.tableFrom, block.tableTo)),
  }));
});

export function findLinkedTableBlocksInState(state) {
  return blocksInDocument(state.doc);
}

/**
 * Get the full replacement range for a linked table block.
 * Includes hidden metadata header + visible snapshot region.
 *
 * @param {Object} block
 * @returns {{from:number,to:number}}
 */
export function getLinkedTableBlockRange(block) {
  return {
    from: block.headerFrom,
    to: block.snapshotTo,
  };
}

/**
 * Whether a normal markdown table range is covered by a linked-table block.
 * Used to suppress the legacy plain-table renderer for linked snapshots.
 *
 * @param {{from:number,to:number}} range
 * @param {Array<Object>} linkedBlocks
 * @returns {boolean}
 */
export function isRangeInsideLinkedTable(range, linkedBlocks) {
  return linkedBlocks.some((block) => range.from >= block.tableFrom && range.to <= block.tableTo);
}

export default {
  findLinkedTableBlocksInState,
  getLinkedTableBlockRange,
  isRangeInsideLinkedTable,
};
