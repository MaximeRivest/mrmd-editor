/**
 * Linked-table block parsing helpers for the editor.
 *
 * Bridges CodeMirror editor state/doc text to the pure `mrmd-table-spec`
 * block-discovery layer.
 */

import { findLinkedTableBlocks } from '../../../../mrmd-table-spec/src/index.js';

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
export function findLinkedTableBlocksInState(state) {
  const text = state.doc.toString();
  return findLinkedTableBlocks(text).map((block) => ({
    ...block,
    headerText: text.slice(block.headerFrom, block.headerTo),
    tableText: text.slice(block.tableFrom, block.tableTo),
    tableLines: splitLines(text.slice(block.tableFrom, block.tableTo)),
  }));
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
