/**
 * Runtime CodeLens Plugin
 *
 * CodeMirror StateField that renders runtime control widgets
 * above yaml config blocks and frontmatter with session config.
 *
 * Note: Block decorations MUST come from StateField, not ViewPlugin.
 */

import { EditorView, Decoration } from '@codemirror/view';
import { Facet, StateEffect, StateField } from '@codemirror/state';
import { findRuntimeBlocks } from './detector.js';
import { RuntimeCodeLensWidget } from './widgets.js';

/**
 * @typedef {Object} RuntimeCodeLensContext
 * @property {(name: string) => Object|null} getSessionStatus - Get status for session name
 * @property {(runtime: Object) => void} onStart - Start a runtime
 * @property {(name: string) => void} onStop - Stop a runtime
 * @property {(name: string) => void} onRestart - Restart a runtime
 * @property {() => void} onRestartAll - Restart all runtimes
 * @property {string} [projectName] - Project name for session naming
 */

/**
 * Facet for passing context (callbacks, state) to the plugin
 */
export const runtimeCodeLensFacet = Facet.define({
  combine: (values) => values[0] || null,
});

/**
 * Effect to trigger decoration rebuild (e.g., when session status changes)
 */
export const rebuildRuntimeCodeLensEffect = StateEffect.define();

/**
 * Get full session name (project:name format)
 * @param {string} name - Runtime name from config
 * @param {string} projectName - Project name
 * @returns {string}
 */
function getSessionName(name, projectName) {
  return `${projectName || 'default'}:${name || 'default'}`;
}

/**
 * Build decorations for all detected runtime blocks
 * @param {import('@codemirror/state').EditorState} state
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildDecorations(state) {
  const context = state.facet(runtimeCodeLensFacet);

  if (!context) {
    return Decoration.none;
  }

  const content = state.doc.toString();
  const blocks = findRuntimeBlocks(content);

  if (blocks.length === 0) {
    return Decoration.none;
  }

  const decorations = [];

  for (const block of blocks) {
    // Create a separate widget for each runtime at its line position
    for (const runtime of block.runtimes) {
      const sessionName = getSessionName(runtime.name, context.projectName);
      const status = context.getSessionStatus?.(sessionName) || null;

      const runtimeWithStatus = {
        ...runtime,
        name: sessionName,
        status,
      };

      // Create widget for this single runtime
      const widget = new RuntimeCodeLensWidget({
        runtimes: [runtimeWithStatus],
        callbacks: {
          onStart: (rt) => context.onStart?.(rt),
          onStop: (name) => context.onStop?.(name),
          onRestart: (name) => context.onRestart?.(name),
          onRestartAll: () => context.onRestartAll?.(),
        },
        blockType: block.type,
      });

      // Place widget at the runtime's line position, or fallback to block start
      const position = runtime.lineOffset ?? block.fenceLineEnd;

      decorations.push(
        Decoration.widget({
          widget,
          side: 1, // After the position
          block: true, // Render as block element (requires StateField)
        }).range(position)
      );
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * StateField for runtime CodeLens decorations
 * Block decorations must come from StateField, not ViewPlugin
 */
export const runtimeCodeLensField = StateField.define({
  create(state) {
    return buildDecorations(state);
  },

  update(decorations, tr) {
    // Check if we need to rebuild
    const hasRebuildEffect = tr.effects.some((e) => e.is(rebuildRuntimeCodeLensEffect));

    if (tr.docChanged || hasRebuildEffect) {
      return buildDecorations(tr.state);
    }

    // Check if context changed
    const oldContext = tr.startState.facet(runtimeCodeLensFacet);
    const newContext = tr.state.facet(runtimeCodeLensFacet);
    if (oldContext !== newContext) {
      return buildDecorations(tr.state);
    }

    return decorations;
  },

  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Extension array that includes the StateField
 * Use this as the plugin export for backwards compatibility
 */
export const runtimeCodeLensPlugin = runtimeCodeLensField;
