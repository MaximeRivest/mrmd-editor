/**
 * Markdown Rendering Facets
 *
 * Shared facets used by both the ViewPlugin (renderer.js) and
 * the StateField (block-decorations.js). Kept in a separate file
 * to avoid circular dependencies between those modules.
 *
 * @module markdown/facets
 */

import { Facet } from '@codemirror/state';

/**
 * Facet to toggle "source mode" — when true, all markdown syntax is shown
 * as if the cursor were on every line. No rendering/hiding of markers,
 * no widget replacement of syntax.
 *
 * Usage:
 *   sourceModeFacet.of(true)   // enable source mode
 *   sourceModeFacet.of(false)  // normal rendering mode
 *
 * @type {Facet<boolean, boolean>}
 */
export const sourceModeFacet = Facet.define({
  combine: (values) => values.some(v => v),
});

/**
 * Facet to toggle WYSIWYG mode — when true, markdown is rendered everywhere,
 * including the active line/block, and editing is routed through a protected,
 * syntax-safe interaction layer.
 *
 * @type {Facet<boolean, boolean>}
 */
export const wysiwygModeFacet = Facet.define({
  combine: (values) => values.some(v => v),
});

/**
 * Facet for rendering a mermaid fence as a diagram.
 *
 * The renderer belongs to the host: mermaid itself is ~3.5 MB and most hosts
 * that want diagrams already ship it, so nothing is bundled here. Without a
 * renderer a mermaid fence stays an ordinary code block, exactly as today.
 *
 * The renderer receives the fence body and an options object carrying an
 * AbortSignal; it resolves to the SVG markup (or `{ svg }`). A rejected
 * promise, a missing SVG, or an abort is drawn as an error block that keeps
 * the source readable.
 *
 * Usage:
 *   mermaidRendererFacet.of((code, { signal }) => render(code, { signal }))
 *
 * @type {Facet<(code: string, options: { signal: AbortSignal }) => string|Promise<string>|{svg: string}|Promise<{svg: string}>, ((code: string, options: { signal: AbortSignal }) => any) | null>}
 */
export const mermaidRendererFacet = Facet.define({
  combine: (values) => values[values.length - 1] || null,
});
