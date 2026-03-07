/**
 * @fileoverview Spellcheck / autocorrect for prose in CodeMirror 6
 *
 * Enables the browser's native spellcheck on the CM6 content element, then
 * disables it in places that are usually not natural-language prose:
 *   - fenced code blocks
 *   - inline code
 *   - markdown link URLs
 *   - quoted literals like 'foo/bar'
 *   - path-like tokens such as ./src/app, /usr/bin, src/utils/file.py
 *
 * Important note about "autocorrect":
 *   On desktop Chromium/Electron, what you mostly get is native spellcheck
 *   (underlines + suggestions), not aggressive iOS-style auto-replacement.
 *   The `autocorrect` attribute is mainly useful in Safari/iOS and is mostly
 *   ignored by Chromium. So in Electron this feature is best thought of as
 *   fast spellcheck with suggestions, not full mobile-style autocorrect.
 */

import { EditorView, Decoration, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/**
 * Enable browser-native spellcheck on the editor's contenteditable element.
 */
const proseSpellcheck = EditorView.contentAttributes.of({
  spellcheck: 'true',
  autocorrect: 'on',           // Safari / iOS; harmless elsewhere
  autocapitalize: 'sentences', // mobile keyboards
});

/**
 * Reused mark decoration for ranges where spellcheck should be disabled.
 */
const noSpellcheckMark = Decoration.mark({
  attributes: { spellcheck: 'false' },
});

/**
 * Markdown syntax nodes where spellcheck should be disabled.
 *
 * Confirmed CM6 markdown node names:
 *   - FencedCode
 *   - InlineCode
 *   - URL
 */
const SUPPRESSED_NODE_NAMES = new Set([
  'FencedCode',
  'InlineCode',
  'URL',
]);

/**
 * Regexes for non-prose tokens that often appear in markdown paragraphs but
 * should not be spellchecked.
 *
 * These are intentionally conservative:
 *   - quoted literals: 'foo/bar', "snake_case"
 *   - unix/relative paths: ./src/app, /usr/bin, ~/work/project
 *   - slash-delimited paths/modules: src/widgets/theme.js
 */
const NON_PROSE_PATTERNS = [
  /'[^'\n]+'/g,
  /"[^"\n]+"/g,
  /(?:\.{1,2}\/|~\/|\/)[^\s'"`<>]+/g,
  /(?:[A-Za-z0-9._-]+\/){1,}[A-Za-z0-9._-]+\/?/g,
];

function addRegexRanges(docText, baseFrom, ranges) {
  for (const pattern of NON_PROSE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(docText))) {
      const from = baseFrom + match.index;
      const to = from + match[0].length;
      if (to > from) ranges.push({ from, to });

      // Safety against zero-length regex matches
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }
}

function mergeRanges(ranges) {
  if (ranges.length <= 1) return ranges;

  const sorted = ranges
    .filter((r) => r && r.to > r.from)
    .sort((a, b) => (a.from - b.from) || (a.to - b.to));

  if (sorted.length === 0) return [];

  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.from <= last.to) {
      last.to = Math.max(last.to, current.to);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * ViewPlugin that disables spellcheck in non-prose regions.
 *
 * Performance:
 *   We only inspect visible ranges instead of the whole document. That keeps
 *   the work small even on long notes and reduces the chance that spellcheck
 *   feels laggy.
 */
const noSpellcheckInNonProse = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view) {
      const collected = [];
      const tree = syntaxTree(view.state);

      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter(node) {
            if (SUPPRESSED_NODE_NAMES.has(node.name) && node.from < node.to) {
              collected.push({ from: node.from, to: node.to });
            }
          },
        });

        const text = view.state.doc.sliceString(from, to);
        addRegexRanges(text, from, collected);
      }

      const merged = mergeRanges(collected);
      return Decoration.set(
        merged.map((r) => noSpellcheckMark.range(r.from, r.to)),
        true,
      );
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Create spellcheck extensions.
 *
 * @returns {import('@codemirror/state').Extension[]}
 */
export function createSpellcheckExtensions() {
  return [proseSpellcheck, noSpellcheckInNonProse];
}
