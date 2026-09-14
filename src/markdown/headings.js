/**
 * Headings as anchors.
 *
 * The slug GitHub gives a heading, the anchors a document offers, and the
 * heading a [text](#fragment) link points at. Anchors are read from the
 * syntax tree, so fenced code never contributes a heading; YAML front matter
 * is skipped explicitly, because a `key: value` line above its closing `---`
 * parses as a setext heading.
 *
 * @module markdown/headings
 */

import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';

/**
 * The anchor GitHub derives from heading text: inline links and HTML dropped,
 * lowercased, punctuation removed, whitespace to dashes. Letters, digits,
 * marks, `_` and `-` survive, so non-Latin headings keep their anchors.
 *
 * @param {string} text
 * @returns {string}
 */
export function headingSlug(text) {
  return String(text || '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
    .replace(/\s/g, '-');
}

/** End offset of a leading `---` front matter block, or 0. */
function frontmatterEnd(doc) {
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return 0;
  for (let n = 2; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (/^(---|\.\.\.)\s*$/.test(line.text)) return line.to;
  }
  return 0;
}

/** The text of a heading node: ATX markers and closing hashes removed; setext underline dropped. */
function headingText(nodeName, raw) {
  if (nodeName.startsWith('ATX')) {
    return raw.replace(/^\s{0,3}#{1,6}[ \t]+/, '').replace(/[ \t]+#+[ \t]*$/, '').trim();
  }
  const lines = raw.split('\n');
  return lines.slice(0, -1).join(' ').trim();
}

// One anchor list per document version: the renderer asks on every pass.
const anchorsByDoc = new WeakMap();

/**
 * Every heading in the document as an anchor, in order. Repeated headings
 * get `-1`, `-2`, … as GitHub numbers duplicate anchors.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @returns {Array<{slug: string, text: string, line: number, from: number, level: number}>}
 */
export function headingAnchors(state) {
  const doc = state.doc;
  const cached = anchorsByDoc.get(doc);
  if (cached) return cached;

  const tree = ensureSyntaxTree(state, doc.length, 200) || syntaxTree(state);
  const skipTo = frontmatterEnd(doc);
  const seen = new Set();
  const anchors = [];
  tree.iterate({
    enter(node) {
      const match = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
      if (!match) return;
      if (node.from >= skipTo) {
        const line = doc.lineAt(node.from);
        const text = headingText(node.name, doc.sliceString(node.from, node.to));
        const base = headingSlug(text);
        let slug = base;
        for (let n = 1; seen.has(slug); n++) slug = `${base}-${n}`;
        seen.add(slug);
        anchors.push({ slug, text, line: line.number, from: line.from, level: Number(match[1]) });
      }
      return false;
    },
  });
  anchorsByDoc.set(doc, anchors);
  return anchors;
}

/**
 * The heading a fragment names: by slug, or by the heading's exact text.
 * Percent-encoding is undone first. Nothing is guessed: an unknown fragment
 * resolves to `{ line: null, from: null }`.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {string} fragment - The part after `#`
 * @returns {{ line: number | null, from: number | null }}
 */
export function resolveAnchor(state, fragment) {
  let wanted = String(fragment || '');
  try { wanted = decodeURIComponent(wanted); } catch { /* keep the raw fragment */ }
  if (!wanted) return { line: null, from: null };
  const anchors = headingAnchors(state);
  const hit = anchors.find((a) => a.slug === wanted) || anchors.find((a) => a.text === wanted);
  return hit ? { line: hit.line, from: hit.from } : { line: null, from: null };
}
