/**
 * Linked-table import/insert helpers.
 */

function getHostApi(hostApi) {
  if (hostApi) return hostApi;
  if (typeof window !== 'undefined') return window.electronAPI || null;
  return null;
}

function ensureTrailingNewlinePair(text, side) {
  const value = String(text || '');
  if (!value) return '';

  if (side === 'before') {
    if (value.endsWith('\n\n')) return '';
    if (value.endsWith('\n')) return '\n';
    return '\n\n';
  }

  if (value.startsWith('\n\n')) return '';
  if (value.startsWith('\n')) return '\n';
  return '\n\n';
}

export function canImportLinkedTableFromHost(hostApi) {
  const host = getHostApi(hostApi);
  return typeof host?.table?.importDelimited === 'function';
}

export function normalizeLinkedTableBlockInsertion(docText, from, to, blockMarkdown) {
  const fullText = String(docText || '');
  const safeFrom = Math.max(0, Math.min(fullText.length, Number.isInteger(from) ? from : 0));
  const safeTo = Math.max(safeFrom, Math.min(fullText.length, Number.isInteger(to) ? to : safeFrom));
  const before = fullText.slice(0, safeFrom);
  const after = fullText.slice(safeTo);
  const block = String(blockMarkdown || '').trim();

  if (!block) {
    return {
      from: safeFrom,
      to: safeTo,
      insert: '',
      selectionAnchor: safeFrom,
    };
  }

  const prefix = before.length > 0 ? ensureTrailingNewlinePair(before, 'before') : '';
  const suffix = after.length > 0 ? ensureTrailingNewlinePair(after, 'after') : '';
  const insert = `${prefix}${block}${suffix}`;

  return {
    from: safeFrom,
    to: safeTo,
    insert,
    selectionAnchor: safeFrom + insert.length,
  };
}

export function insertLinkedTableBlock(editor, blockMarkdown, options = {}) {
  const view = editor?.view || options.view;
  if (!view?.state || typeof view.dispatch !== 'function') {
    throw new Error('insertLinkedTableBlock requires an editor/view with dispatch support');
  }

  const selection = options.selection || view.state.selection?.main || { from: 0, to: 0 };
  const docText = view.state.doc?.toString?.() || '';
  const normalized = normalizeLinkedTableBlockInsertion(docText, selection.from, selection.to, blockMarkdown);

  view.dispatch({
    changes: {
      from: normalized.from,
      to: normalized.to,
      insert: normalized.insert,
    },
    selection: {
      anchor: normalized.selectionAnchor,
    },
    scrollIntoView: true,
  });

  return normalized;
}

export async function importLinkedTableFromHost(editor, options = {}) {
  const host = getHostApi(options.hostApi);
  if (!canImportLinkedTableFromHost(host)) {
    throw new Error('Linked-table import requires an Electron host exposing `electronAPI.table.importDelimited()`');
  }

  const projectRoot = options.projectRoot || editor?.getLinkedTableHostContext?.()?.projectRoot || null;
  const documentPath = options.documentPath || editor?.getLinkedTableHostContext?.()?.documentPath || null;
  const sourceFilePath = options.sourceFilePath;

  if (!projectRoot) throw new Error('Linked-table import requires a project root');
  if (!documentPath) throw new Error('Linked-table import requires a document path');
  if (!sourceFilePath) throw new Error('Linked-table import requires a source file path');

  const result = await host.table.importDelimited({
    projectRoot,
    documentPath,
    sourceFilePath,
    tableId: options.tableId,
    label: options.label,
    cacheFormat: options.cacheFormat,
    maxRows: options.maxRows,
    overflow: options.overflow,
  });

  insertLinkedTableBlock(editor, result.blockMarkdown, {
    selection: options.selection,
  });

  return result;
}

export default {
  canImportLinkedTableFromHost,
  normalizeLinkedTableBlockInsertion,
  insertLinkedTableBlock,
  importLinkedTableFromHost,
};
