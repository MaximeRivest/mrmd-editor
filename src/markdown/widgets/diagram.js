/**
 * Diagram Widget
 *
 * A fenced code block whose language the host draws (```mermaid, for
 * instance) renders as a figure while the cursor is outside it and as source
 * while the cursor is inside — the blur→render rule display math follows.
 *
 * The bundle draws nothing itself. A diagram library is large (mermaid alone
 * outweighs this whole bundle) and a host already ships one for the rest of
 * its pages, so the host declares which fence languages it draws and how:
 *
 *   createDocumentEditor(el, {
 *     diagrams: {
 *       languages: ['mermaid'],
 *       render: (lang, source) => Promise<Node>,
 *     },
 *   });
 *
 * The render contract:
 * - resolve with a DOM Node; the editor inserts a clone, so one result can
 *   serve every place the same source appears
 * - reject with an Error to show the source under its message
 * - the node is inserted as returned: it comes from the host's own renderer,
 *   so the host owns sanitization (mermaid's `securityLevel`, for instance)
 *
 * Results are cached per render function, keyed by language and source, so
 * a decoration rebuild (every keystroke elsewhere in the document) never
 * draws a diagram twice. Failures are not cached: the next blur retries.
 *
 * @module markdown/widgets/diagram
 */

import { WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { memoizeSyntaxScan } from '../document-cache.js';

// =============================================================================
// Host configuration
// =============================================================================

/**
 * Normalize and validate the host's `diagrams` option into the facet value.
 * A misconfigured host fails here, at editor creation, rather than silently
 * leaving every diagram as code.
 *
 * @param {{languages: string[], render: Function} | null | undefined} option
 * @returns {{languages: Set<string>, render: Function} | null}
 */
export function diagramsConfig(option) {
  if (option === null || option === undefined) return null;
  if (typeof option !== 'object') {
    throw new TypeError('mrmd-document: `diagrams` must be an object with `languages` and `render`');
  }
  if (typeof option.render !== 'function') {
    throw new TypeError('mrmd-document: `diagrams.render` must be a function (lang, source) => Promise<Node>');
  }
  const languages = Array.isArray(option.languages)
    ? option.languages.map((l) => String(l).trim().toLowerCase()).filter(Boolean)
    : [];
  if (languages.length === 0) {
    throw new TypeError('mrmd-document: `diagrams.languages` must name at least one fence language');
  }
  return { languages: new Set(languages), render: option.render };
}

// =============================================================================
// Fence scan
// =============================================================================

const FENCE_OPEN = /^\s*(?:`{3,}|~{3,})\s*(\S*)/;
const FENCE_CLOSE = /^\s*(?:`{3,}|~{3,})\s*$/;

/**
 * Every fenced code block in the document, in order, with its language word
 * (lowercased, '' when bare) and body. Language-independent so the scan is
 * shared across host configurations; callers filter by language.
 *
 * An open fence — the user is still typing it — has `closed: false` and no
 * body: nothing should render until the block is whole.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @returns {Array<{lang: string, closed: boolean, source: string, from: number, to: number, startLine: number, endLine: number}>}
 */
export const findFencedBlocks = memoizeSyntaxScan(function findFencedBlocks(state) {
  const doc = state.doc;
  const blocks = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const first = doc.lineAt(node.from);
      const last = doc.lineAt(node.to);
      const lang = ((first.text.match(FENCE_OPEN) || [])[1] || '').toLowerCase();
      const closed = last.number > first.number && FENCE_CLOSE.test(last.text);
      const bodyFrom = Math.min(first.to + 1, doc.length);
      const bodyTo = closed ? Math.max(bodyFrom, last.from - 1) : bodyFrom;
      blocks.push({
        lang,
        closed,
        source: doc.sliceString(bodyFrom, bodyTo),
        from: node.from,
        to: node.to,
        startLine: first.number,
        endLine: last.number,
      });
      return false; // a fence's body is not markdown
    },
  });
  return blocks;
});

/**
 * The fenced blocks a host configuration draws: closed, non-blank, and in a
 * declared language.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {{languages: Set<string>}} config
 */
export function findDiagramBlocks(state, config) {
  return findFencedBlocks(state).filter(
    (block) => block.closed && config.languages.has(block.lang) && block.source.trim() !== ''
  );
}

// =============================================================================
// Render cache
// =============================================================================

const CACHE_LIMIT = 64;

/** @type {WeakMap<Function, Map<string, Promise<Node>>>} */
const caches = new WeakMap();

function cacheFor(render) {
  let cache = caches.get(render);
  if (!cache) {
    cache = new Map();
    caches.set(render, cache);
  }
  return cache;
}

/**
 * Draw `source` through the host renderer, reusing an earlier result for the
 * same language and source. Bounded and least-recently-used: a long document
 * with many diagrams keeps the ones on screen.
 *
 * @param {Function} render
 * @param {string} lang
 * @param {string} source
 * @returns {Promise<Node>}
 */
export function renderDiagram(render, lang, source) {
  const cache = cacheFor(render);
  const key = `${lang}\n${source}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // most recent at the end
    return hit;
  }
  const pending = Promise.resolve()
    .then(() => render(lang, source))
    .then((node) => {
      if (!(node instanceof Node)) {
        throw new TypeError(`diagrams.render must resolve with a DOM Node, got ${node === null ? 'null' : typeof node}`);
      }
      return node;
    });
  // A failure is shown once and forgotten, so the next blur tries again — a
  // renderer that was still loading, or a fence the user is about to fix,
  // must not be remembered as broken.
  pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  cache.set(key, pending);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return pending;
}

/**
 * Forget every result drawn through `render`. Hosts call this when the
 * drawing itself should change — a theme switch — before asking the editor
 * to redraw.
 *
 * @param {Function} render
 */
export function clearDiagramCache(render) {
  caches.delete(render);
}

// =============================================================================
// Widget
// =============================================================================

/** Widget DOM still owned by a live decoration. Cleared by `destroy`. */
const liveDoms = new WeakSet();

function sourceBlock(source) {
  const pre = document.createElement('pre');
  pre.className = 'cm-diagram-source';
  pre.textContent = source;
  return pre;
}

/**
 * Renders one diagram fence. Shows the source while the host draws, then the
 * drawing; on failure, the message above the source.
 *
 * `generation` is the host's redraw counter (see `refreshDiagramsEffect`):
 * two widgets with equal source but different generations are not equal, so
 * CodeMirror rebuilds the DOM and the diagram is drawn again.
 */
export class DiagramWidget extends WidgetType {
  /**
   * @param {string} lang
   * @param {string} source
   * @param {Function} render - the host renderer
   * @param {number} generation
   */
  constructor(lang, source, render, generation) {
    super();
    this.lang = lang;
    this.source = source;
    this.render = render;
    this.generation = generation;
  }

  eq(other) {
    return (
      other.lang === this.lang &&
      other.source === this.source &&
      other.render === this.render &&
      other.generation === this.generation
    );
  }

  toDOM(view) {
    const dom = document.createElement('div');
    dom.className = 'cm-diagram cm-diagram-pending';
    dom.dataset.lang = this.lang;
    dom.setAttribute('aria-busy', 'true');
    dom.appendChild(sourceBlock(this.source));
    liveDoms.add(dom);

    renderDiagram(this.render, this.lang, this.source).then(
      (node) => {
        if (!liveDoms.has(dom)) return; // the decoration went away while drawing
        dom.replaceChildren(node.cloneNode(true));
        dom.classList.remove('cm-diagram-pending');
        dom.removeAttribute('aria-busy');
        this.settled(dom, view);
      },
      (error) => {
        if (!liveDoms.has(dom)) return;
        const message = document.createElement('div');
        message.className = 'cm-diagram-error-message';
        message.textContent = `⚠ ${this.lang}: ${String(error?.message || error || 'render failed').split('\n')[0]}`;
        dom.replaceChildren(message, sourceBlock(this.source));
        dom.classList.remove('cm-diagram-pending');
        dom.classList.add('cm-diagram-error');
        dom.removeAttribute('aria-busy');
        this.settled(dom, view);
      }
    );

    return dom;
  }

  destroy(dom) {
    liveDoms.delete(dom);
  }

  /**
   * The drawing (or its failure) is in the DOM. Subclasses measure here;
   * the base widget has nothing to do.
   *
   * @param {HTMLElement} dom
   * @param {import('@codemirror/view').EditorView | undefined} view
   */
  settled(dom, view) {} // eslint-disable-line no-unused-vars

  ignoreEvent() {
    return true; // events bubble; click-to-edit is attached by the block layer
  }
}
