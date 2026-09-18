/**
 * Mermaid Diagram Widget
 *
 * Draws a mermaid fenced block as a diagram while the caret is elsewhere in
 * the document. The renderer is supplied by the host through
 * `mermaidRendererFacet` — mermaid itself is not bundled, because hosts that
 * want diagrams already ship it and everyone else should not pay 3.5 MB.
 *
 * Behaviour:
 * - resolved SVG (or `{ svg }`) is inserted into the block;
 * - a rejected renderer, a missing SVG, or a broken diagram draws an error
 *   line *and* the fence source, so a reader is never left with a blank;
 * - clicking the diagram moves the caret into the block, which is what makes
 *   the source come back (the block decorator stops replacing it);
 * - an in-flight render is aborted when the widget is destroyed.
 *
 * @module markdown/widgets/mermaid
 */

import { WidgetType } from '@codemirror/view';

/**
 * Whether a fence info string names mermaid.
 *
 * ` ```mermaid ` and ` ```mermaid ` with trailing options both count; the
 * info string is exactly what the markdown parser saw, so an indented or
 * quoted fence never reaches here as anything else.
 *
 * @param {string} info
 * @returns {boolean}
 */
export function isMermaidFence(info) {
  return typeof info === 'string' && /^mermaid(?:\s|$)/i.test(info.trim());
}

/**
 * Accept a host renderer result as SVG markup.
 *
 * A string or `{ svg }` is accepted; anything without an `<svg` element is
 * refused rather than injected, so a renderer that returns prose or an empty
 * string surfaces as the error state instead of a silent blank block.
 *
 * @param {unknown} result
 * @returns {string|null}
 */
export function mermaidSvgFromResult(result) {
  const svg = typeof result === 'string' ? result : (result && typeof result === 'object' ? result.svg : null);
  if (typeof svg !== 'string') return null;
  return svg.includes('<svg') ? svg : null;
}

export class MermaidWidget extends WidgetType {
  /**
   * @param {{ code: string, from: number, renderer: (code: string, options: { signal: AbortSignal }) => unknown }} spec
   */
  constructor({ code, from, renderer }) {
    super();
    this.code = code;
    this.from = from;
    this.renderer = renderer;
    this.controller = null;
  }

  eq(other) {
    // `from` participates: the click handler dispatches this exact position.
    return other.code === this.code && other.from === this.from && other.renderer === this.renderer;
  }

  toDOM(view) {
    const dom = document.createElement('div');
    dom.className = 'cm-mermaid-block';
    dom.dataset.mermaidState = 'rendering';

    const diagram = document.createElement('div');
    diagram.className = 'cm-mermaid-diagram';
    diagram.textContent = 'Rendering diagram…';
    dom.appendChild(diagram);

    // Clicking the diagram reveals the source: the caret enters the block and
    // the block decorator stops replacing it.
    dom.addEventListener('mousedown', event => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from + 1 }, scrollIntoView: true });
      view.focus();
    });

    this.controller = typeof AbortController === 'function' ? new AbortController() : null;
    const signal = this.controller ? this.controller.signal : undefined;

    Promise.resolve()
      .then(() => this.renderer(this.code, { signal }))
      .then(result => {
        if (signal && signal.aborted) return;
        const svg = mermaidSvgFromResult(result);
        if (!svg) throw new Error('the mermaid renderer returned no SVG');
        diagram.innerHTML = svg;
        dom.dataset.mermaidState = 'rendered';
      })
      .catch(error => {
        if (signal && signal.aborted) return;
        dom.dataset.mermaidState = 'error';
        diagram.remove();
        const message = document.createElement('div');
        message.className = 'cm-mermaid-error';
        message.textContent = '⚠ diagram could not be rendered: ' + String((error && error.message) || error).split('\n')[0];
        const source = document.createElement('pre');
        source.className = 'cm-mermaid-source';
        const code = document.createElement('code');
        code.textContent = this.code; // textContent: the source is never markup
        source.appendChild(code);
        dom.append(message, source);
      });

    return dom;
  }

  ignoreEvent() {
    // The widget owns its clicks; the editor must not treat them as editing.
    return true;
  }

  destroy() {
    try {
      this.controller?.abort();
    } catch {
      // an aborted render is not an error
    }
    this.controller = null;
  }
}
