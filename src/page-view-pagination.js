/**
 * Page View Pagination
 *
 * Adds per-line bottom padding so content is pushed to the next visual page.
 * This uses Decoration.line (not block widgets), because CodeMirror does not
 * allow block decorations from ViewPlugins.
 *
 * @module page-view-pagination
 */

import { ViewPlugin, Decoration } from '@codemirror/view';

const PAGE_BREAK_RE = /^\\(pagebreak|newpage)$/;
const HTML_PAGE_BREAK_RE = /^<div\s+style\s*=\s*["']page-break-after:\s*always;?["']\s*>\s*<\/div>$/i;

function getPageDimensions(view) {
  if (!document.body.classList.contains('page-view-active')) return null;
  if (!document.body.classList.contains('page-breaks-active')) return null;

  const el = document.getElementById('editor-container');
  if (!el) return null;

  const read = (prop, fallback) => {
    const inline = parseFloat(el.style.getPropertyValue(prop));
    if (inline > 0) return inline;
    const computed = parseFloat(getComputedStyle(el).getPropertyValue(prop));
    return computed > 0 ? computed : fallback;
  };

  const pageHeight = read('--page-view-height', 0);
  if (!pageHeight) return null;

  return {
    pageHeight,
    gap: read('--page-view-gap', 40),
    marginTop: read('--page-view-margin-top', 96),
    marginBottom: read('--page-view-margin-bottom', 96),
  };
}

function buildPageBreaks(view) {
  const dims = getPageDimensions(view);
  if (!dims) return Decoration.none;

  const { pageHeight, gap, marginTop, marginBottom } = dims;
  const contentArea = pageHeight - marginTop - marginBottom;
  if (contentArea <= 0) return Decoration.none;

  const doc = view.state.doc;
  const decorations = [];
  let used = 0;
  let pos = 0;
  let previousLineFrom = null;

  while (pos <= doc.length) {
    const block = view.lineBlockAt(pos);
    const height = block.height;
    const text = doc.sliceString(block.from, block.to).trim();
    const isManualBreak = PAGE_BREAK_RE.test(text) || HTML_PAGE_BREAK_RE.test(text);

    if (isManualBreak) {
      const padding = Math.max(0, pageHeight + gap - used - height);
      decorations.push(
        Decoration.line({
          attributes: {
            class: 'cm-page-break-padding-line',
            style: `padding-bottom: ${padding}px`,
          },
        }).range(block.from),
      );
      used = 0;
      previousLineFrom = block.from;
    } else if (used > 0 && used + height > contentArea && previousLineFrom != null) {
      const padding = Math.max(0, pageHeight + gap - used);
      decorations.push(
        Decoration.line({
          attributes: {
            class: 'cm-page-break-padding-line',
            style: `padding-bottom: ${padding}px`,
          },
        }).range(previousLineFrom),
      );
      used = height;
      previousLineFrom = block.from;
    } else {
      used += height;
      previousLineFrom = block.from;
    }

    if (block.to >= doc.length) break;
    pos = block.to + 1;
  }

  return Decoration.set(decorations, true);
}

export const pageViewPagination = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.pageBreaksEnabled = document.body.classList.contains('page-breaks-active');
      this.pageViewEnabled = document.body.classList.contains('page-view-active');
      this.decorations = buildPageBreaks(view);
    }

    update(update) {
      const pageBreaksEnabled = document.body.classList.contains('page-breaks-active');
      const pageViewEnabled = document.body.classList.contains('page-view-active');
      const modeChanged =
        pageBreaksEnabled !== this.pageBreaksEnabled || pageViewEnabled !== this.pageViewEnabled;

      if (
        modeChanged ||
        update.docChanged ||
        update.geometryChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.pageBreaksEnabled = pageBreaksEnabled;
        this.pageViewEnabled = pageViewEnabled;
        this.decorations = buildPageBreaks(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
