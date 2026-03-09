/**
 * Linked-table workspace command/event helpers.
 */

export const LINKED_TABLE_EVENT = 'mrmd-linked-table-action';

/**
 * Dispatch a linked-table UI action from the editor surface.
 * Host/app code can listen on `view.dom` or `window`.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Object} detail
 * @returns {boolean}
 */
export function dispatchLinkedTableAction(view, detail) {
  if (!view?.dom) return false;
  const event = new CustomEvent(LINKED_TABLE_EVENT, {
    bubbles: true,
    detail,
  });
  view.dom.dispatchEvent(event);
  return true;
}

/**
 * Convenience helper for opening the full linked-table workspace.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Object} detail
 * @returns {boolean}
 */
export function openLinkedTableWorkspace(view, detail) {
  return dispatchLinkedTableAction(view, {
    action: 'open-grid',
    ...detail,
  });
}

export default {
  LINKED_TABLE_EVENT,
  dispatchLinkedTableAction,
  openLinkedTableWorkspace,
};
