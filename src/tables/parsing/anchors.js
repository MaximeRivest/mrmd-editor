/**
 * Linked-table Yjs anchor helpers.
 *
 * These anchors let table jobs survive surrounding document edits.
 */

import * as Y from 'yjs';

function assertRange(range) {
  const from = range?.headerFrom ?? range?.from;
  const to = range?.snapshotTo ?? range?.to;

  if (!Number.isInteger(from) || from < 0) {
    throw new TypeError('Linked-table anchor range must include a non-negative `from`/`headerFrom`');
  }
  if (!Number.isInteger(to) || to < from) {
    throw new TypeError('Linked-table anchor range must include a `to`/`snapshotTo` >= `from`');
  }

  return { from, to };
}

function toRelativePositionJson(yText, index, assoc) {
  const relPos = Y.createRelativePositionFromTypeIndex(yText, index, assoc);
  return Y.relativePositionToJSON(relPos);
}

function toAbsoluteIndex(ydoc, relPosJson) {
  if (!relPosJson) return null;

  try {
    const relPos = Y.createRelativePositionFromJSON(relPosJson);
    const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc);
    return absPos?.index ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a Yjs-stable anchor for one linked-table block.
 *
 * Start uses right association so inserts at the exact start stay outside the block.
 * End uses left association so inserts at the exact end stay outside the block.
 */
export function createLinkedTableBlockAnchor(yText, range, options = {}) {
  if (!yText?.doc) {
    throw new TypeError('createLinkedTableBlockAnchor requires a Y.Text attached to a Y.Doc');
  }

  const resolved = assertRange(range);

  return {
    type: 'linked-table-block-anchor-v1',
    tableId: options.tableId || range?.tableId || range?.spec?.id || null,
    from: toRelativePositionJson(yText, resolved.from, 1),
    to: toRelativePositionJson(yText, resolved.to, -1),
    createdAt: Date.now(),
  };
}

/**
 * Resolve a linked-table anchor back to absolute document offsets.
 */
export function resolveLinkedTableBlockAnchor(ydoc, anchor) {
  if (!ydoc || !anchor) return null;

  const from = toAbsoluteIndex(ydoc, anchor.from);
  const to = toAbsoluteIndex(ydoc, anchor.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) return null;

  return {
    from,
    to,
    tableId: anchor.tableId || null,
  };
}

export default {
  createLinkedTableBlockAnchor,
  resolveLinkedTableBlockAnchor,
};
