/**
 * Cache scans by CodeMirror's immutable Text identity, not content hashes.
 * Selection/viewport transactions share their Text; edits get a new one.
 * Weak keys let closed editors and discarded undo states be collected.
 */
import { syntaxTree } from '@codemirror/language';

export function memoizeDocumentScan(scan) {
  const cache = new WeakMap();
  return (doc) => {
    if (!cache.has(doc)) cache.set(doc, scan(doc));
    return cache.get(doc);
  };
}

export const documentText = memoizeDocumentScan(doc => doc.toString());

/** Parsing can advance without a text edit. Never reuse tree-derived ranges
 * just because Text stayed the same (background parsing/reconfiguration).
 */
export function memoizeSyntaxScan(scan) {
  const cache = new WeakMap();
  return (state) => {
    const tree = syntaxTree(state);
    const previous = cache.get(state.doc);
    if (previous && previous.tree === tree) return previous.value;
    const value = scan(state);
    cache.set(state.doc, { tree, value });
    return value;
  };
}
