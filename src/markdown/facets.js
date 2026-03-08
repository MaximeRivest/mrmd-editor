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
