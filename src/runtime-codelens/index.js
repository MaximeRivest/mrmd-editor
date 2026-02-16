/**
 * Runtime CodeLens Extension
 *
 * Provides inline controls for starting/stopping/restarting runtimes
 * directly above yaml config blocks and frontmatter.
 *
 * @example
 * ```javascript
 * import { createRuntimeCodeLensExtensions } from './runtime-codelens';
 *
 * const extensions = createRuntimeCodeLensExtensions({
 *   projectName: 'my-project',
 *   getSessionStatus: (name) => shellState.get(`runtimes.sessions.${name}`),
 *   onStart: async (runtime) => { await electronAPI.runtime.start(runtime); },
 *   onStop: async (name) => { await electronAPI.runtime.stop(name); },
 *   onRestart: async (name) => { await electronAPI.runtime.restart(name); },
 *   onRestartAll: async () => { ... },
 * });
 * ```
 */

import { runtimeCodeLensFacet, runtimeCodeLensPlugin, rebuildRuntimeCodeLensEffect } from './plugin.js';
import { injectRuntimeCodeLensStyles } from './styles.js';

// Re-export for external use
export { runtimeCodeLensFacet, runtimeCodeLensPlugin, rebuildRuntimeCodeLensEffect };
export { injectRuntimeCodeLensStyles, removeRuntimeCodeLensStyles } from './styles.js';
export { findRuntimeBlocks, findYamlConfigBlocks, findSessionFrontmatter } from './detector.js';
export { RuntimeCodeLensWidget } from './widgets.js';

/**
 * @typedef {Object} RuntimeCodeLensOptions
 * @property {string} [projectName='default'] - Project name for session naming
 * @property {(name: string) => Object|null} getSessionStatus - Get session status by name
 * @property {(runtime: Object) => void|Promise<void>} onStart - Start a runtime
 * @property {(name: string) => void|Promise<void>} onStop - Stop a runtime
 * @property {(name: string) => void|Promise<void>} onRestart - Restart a runtime
 * @property {() => void|Promise<void>} [onRestartAll] - Restart all runtimes
 */

/**
 * Create CodeMirror extensions for runtime CodeLens
 *
 * @param {RuntimeCodeLensOptions} options - Configuration options
 * @returns {import('@codemirror/state').Extension[]} Array of CodeMirror extensions
 */
export function createRuntimeCodeLensExtensions(options) {
  // Inject styles on first use
  injectRuntimeCodeLensStyles();

  const context = {
    projectName: options.projectName || 'default',
    getSessionStatus: options.getSessionStatus || (() => null),
    onStart: options.onStart || (() => {}),
    onStop: options.onStop || (() => {}),
    onRestart: options.onRestart || (() => {}),
    onRestartAll: options.onRestartAll || (() => {}),
  };

  return [
    runtimeCodeLensFacet.of(context),
    runtimeCodeLensPlugin,
  ];
}

/**
 * Dispatch effect to rebuild runtime CodeLens decorations
 * Call this when session status changes to update the UI
 *
 * @param {import('@codemirror/view').EditorView} view - Editor view
 */
export function rebuildRuntimeCodeLens(view) {
  view.dispatch({
    effects: rebuildRuntimeCodeLensEffect.of(null),
  });
}
