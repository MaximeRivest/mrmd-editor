/**
 * @fileoverview Config change handlers
 *
 * Maps config changes to editor actions.
 * Each handler is responsible for reconfiguring a part of the editor
 * when the corresponding config changes.
 */

import { pathToString, matchesPattern } from './reactive.js';
import { applyTheme } from '../widgets/theme-utils.js';
import { getTheme } from '../widgets/theme.js';
import { createCodemirrorTheme } from '../widgets/codemirror-theme.js';

/**
 * @typedef {import('./reactive.js').ConfigChangeEvent} ConfigChangeEvent
 */

/**
 * @typedef {Object} EditorInternals
 * @property {import('@codemirror/view').EditorView} view
 * @property {import('@codemirror/state').Compartment} themeCompartment
 * @property {import('@codemirror/state').Compartment} readonlyCompartment
 * @property {import('yjs').Awareness} awareness
 * @property {Object} registry - RuntimeRegistry
 * @property {Object} [awarenessSystem] - AwarenessSystem
 * @property {Object} [cellControls] - CellControlsSystem
 * @property {Object} [provider] - WebsocketProvider
 * @property {Function} createRuntime - Factory to create runtime from config
 * @property {Object} [config] - The reactive config object (for reading current values)
 */

/**
 * Create config change handler for an editor
 *
 * @param {EditorInternals} internals - Editor internal objects
 * @returns {(event: ConfigChangeEvent) => void}
 */
export function createConfigHandler(internals) {
  const handlers = {
    // Appearance handlers
    'appearance.dark': (event) => handleDarkMode(internals, event),
    'appearance.theme': (event) => handleTheme(internals, event),
    'appearance.readonly': (event) => handleReadonly(internals, event),
    'appearance.placeholder': (event) => handlePlaceholder(internals, event),

    // User handlers
    'user.name': (event) => handleUserChange(internals, event),
    'user.color': (event) => handleUserChange(internals, event),
    'user.type': (event) => handleUserChange(internals, event),

    // Runtime handlers
    'runtimes.*': (event) => handleRuntimeChange(internals, event),

    // Drive handlers
    'drive.url': (event) => handleDriveUrlChange(internals, event),

    // Document handlers
    'document.path': (event) => handleDocumentPathChange(internals, event),

    // Awareness handlers
    'awareness.*': (event) => handleAwarenessChange(internals, event),

    // Cell controls handlers
    'cellControls.*': (event) => handleCellControlsChange(internals, event),
  };

  return (event) => {
    const pathStr = pathToString(event.path);

    // Try exact match first
    if (handlers[pathStr]) {
      handlers[pathStr](event);
      return;
    }

    // Try pattern matches
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (pattern.includes('*') && matchesPattern(event.path, pattern)) {
        handler(event);
        return;
      }
    }

    // No handler - that's fine, not all config changes need immediate action
  };
}

// =============================================================================
// APPEARANCE HANDLERS
// =============================================================================

/**
 * Resolve the effective dark mode value
 * @param {boolean | null} dark
 * @returns {boolean}
 */
function resolveIsDark(dark) {
  if (dark === null) {
    return typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  }
  return dark;
}

/**
 * Resolve the effective theme name based on config
 * @param {string | null} theme - Explicit theme name or null for auto
 * @param {boolean} isDark - Resolved dark mode
 * @returns {string}
 */
function resolveThemeName(theme, isDark) {
  if (theme && getTheme(theme)) {
    return theme;
  }
  return 'plain-light';
}

/**
 * Apply unified theme (both CodeMirror and widget CSS variables)
 * @param {EditorInternals} internals
 * @param {string} themeName
 */
function applyUnifiedTheme(internals, themeName) {
  const { view, themeCompartment } = internals;

  // Get theme object
  const theme = getTheme(themeName);
  if (!theme) {
    console.warn(`Theme "${themeName}" not found`);
    return;
  }

  // Apply widget theme (CSS variables)
  applyTheme(themeName);

  // Apply CodeMirror theme
  const cmTheme = createCodemirrorTheme(theme);
  view.dispatch({
    effects: themeCompartment.reconfigure(cmTheme)
  });
}

/**
 * Handle dark mode change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleDarkMode(internals, event) {
  const { config } = internals;
  const dark = event.value;

  // Determine actual dark mode (null = system preference)
  const isDark = resolveIsDark(dark);

  // Only update theme if no explicit theme is set (auto mode)
  const explicitTheme = config?.appearance?.theme;
  if (!explicitTheme) {
    const themeName = resolveThemeName(null, isDark);
    applyUnifiedTheme(internals, themeName);
  }
}

/**
 * Handle theme change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleTheme(internals, event) {
  const { config } = internals;
  const theme = event.value;

  // Resolve theme name (may be null for auto)
  const isDark = resolveIsDark(config?.appearance?.dark ?? null);
  const themeName = resolveThemeName(theme, isDark);

  // Apply unified theme (CodeMirror + widgets)
  applyUnifiedTheme(internals, themeName);
}

/**
 * Handle readonly mode change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleReadonly(internals, event) {
  const { view, readonlyCompartment } = internals;
  const readonly = event.value;

  import('@codemirror/state').then(({ EditorState }) => {
    view.dispatch({
      effects: readonlyCompartment.reconfigure(
        readonly ? EditorState.readOnly.of(true) : []
      )
    });
  });
}

/**
 * Handle placeholder change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handlePlaceholder(internals, event) {
  // Placeholder requires re-creating the extension
  // For now, log a warning - full implementation would need a compartment
  console.warn('[Config] Placeholder change requires editor recreation. Change will apply on next create().');
}

// =============================================================================
// USER HANDLERS
// =============================================================================

/**
 * Handle user info change (name, color, type)
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleUserChange(internals, event) {
  const { awareness, awarenessSystem } = internals;
  const prop = event.path[event.path.length - 1];

  if (awarenessSystem) {
    // Use awareness system's state manager for proper state structure
    const stateManager = awarenessSystem.getStateManager();
    const current = stateManager.getLocalState() || {};

    stateManager.setLocalState({
      ...current,
      [prop]: event.value,
      lastActivity: Date.now()
    });
  } else {
    // Direct awareness update
    const currentUser = awareness.getLocalState()?.user || {};
    awareness.setLocalStateField('user', {
      ...currentUser,
      [prop]: event.value,
      lastActivity: Date.now()
    });
  }
}

// =============================================================================
// RUNTIME HANDLERS
// =============================================================================

/**
 * Handle runtime config change (add, update, remove)
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleRuntimeChange(internals, event) {
  const { registry, createRuntime } = internals;

  // Path is ['runtimes', runtimeName] or ['runtimes', runtimeName, property]
  const runtimeName = event.path[1];

  if (event.path.length === 2) {
    // Direct assignment to runtimes.name
    if (event.type === 'delete' || event.value === undefined) {
      // Remove runtime
      if (registry.has(runtimeName)) {
        registry.unregister(runtimeName);
      }
    } else {
      // Add or replace runtime
      const runtimeConfig = event.value;

      // Remove existing if present
      if (registry.has(runtimeName)) {
        registry.unregister(runtimeName);
      }

      // Create and register new runtime
      const runtime = createRuntime(runtimeConfig);
      if (runtime) {
        registry.register(runtimeName, runtime);
      }
    }
  } else {
    // Nested property change (e.g., runtimes.python.url)
    // For now, trigger full runtime re-creation
    console.warn(`[Config] Runtime property change (${pathToString(event.path)}) - consider replacing entire runtime config`);
  }
}

// =============================================================================
// DRIVE HANDLERS
// =============================================================================

/**
 * Handle drive URL change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleDriveUrlChange(internals, event) {
  const { provider } = internals;

  if (!provider) {
    console.warn('[Config] Cannot change drive URL - editor was not created with drive connection');
    return;
  }

  // Reconnecting to a different server is complex - warn for now
  console.warn('[Config] Changing drive URL requires editor recreation. Disconnect and create new editor.');

  // Future: Could implement:
  // provider.disconnect();
  // Create new provider with new URL
  // Re-sync document
}

/**
 * Handle document path change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleDocumentPathChange(internals, event) {
  const { provider } = internals;

  if (!provider) {
    console.warn('[Config] Cannot change document path - editor was not created with drive connection');
    return;
  }

  // Changing document requires loading new content
  console.warn('[Config] Changing document path requires editor recreation. Use drive.open() for new document.');
}

// =============================================================================
// AWARENESS HANDLERS
// =============================================================================

/**
 * Handle awareness config change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleAwarenessChange(internals, event) {
  const { awarenessSystem } = internals;

  if (!awarenessSystem) {
    console.warn('[Config] Awareness system not enabled');
    return;
  }

  const prop = event.path[event.path.length - 1];

  switch (prop) {
    case 'enabled':
      // Enabling/disabling awareness requires extension reconfiguration
      console.warn('[Config] Toggling awareness requires editor recreation');
      break;

    case 'showCursors':
    case 'showNames':
    case 'showActivity':
      // These could potentially be toggled via CSS or config
      // For now, awareness system would need to support runtime config
      if (awarenessSystem.setConfig) {
        awarenessSystem.setConfig({ [prop]: event.value });
      } else {
        console.warn(`[Config] Awareness ${prop} change requires editor recreation`);
      }
      break;
  }
}

// =============================================================================
// CELL CONTROLS HANDLERS
// =============================================================================

/**
 * Handle cell controls config change
 * @param {EditorInternals} internals
 * @param {ConfigChangeEvent} event
 */
function handleCellControlsChange(internals, event) {
  const { cellControls, view } = internals;

  if (!cellControls) {
    // Cell controls not initialized yet - will be used on creation
    return;
  }

  const pathStr = pathToString(event.path);

  // Handle enabled toggle
  if (pathStr === 'cellControls.enabled') {
    // Toggling enabled requires extension reconfiguration
    console.warn('[Config] Toggling cellControls.enabled requires editor recreation');
    return;
  }

  // Handle position change
  if (pathStr === 'cellControls.position') {
    // Position change requires extension reconfiguration (line vs gutter)
    console.warn('[Config] Changing cellControls.position requires editor recreation');
    return;
  }

  // Handle button visibility changes
  if (event.path[1] === 'buttons') {
    cellControls.updateConfig({
      buttons: { ...cellControls.config.buttons, [event.path[2]]: event.value }
    });
    // Trigger decoration rebuild
    if (view) {
      import('../cell-controls/plugin.js').then(({ rebuildCellControlsEffect }) => {
        view.dispatch({ effects: rebuildCellControlsEffect.of(null) });
      });
    }
    return;
  }

  // Handle status config changes
  if (event.path[1] === 'status') {
    cellControls.updateConfig({
      status: { ...cellControls.config.status, [event.path[2]]: event.value }
    });
    return;
  }

  // Handle queue config changes
  if (event.path[1] === 'queue') {
    // Queue mode changes don't require rebuild - just update config
    cellControls.updateConfig({
      queue: { ...cellControls.config.queue, [event.path[2]]: event.value }
    });
    return;
  }
}

// =============================================================================
// HELPER: Runtime Factory
// =============================================================================

/**
 * Create a runtime instance from config
 * This is passed to createConfigHandler and should be implemented by the editor.
 *
 * @param {import('./schema.js').RuntimeConfig} config
 * @returns {import('./schema.js').RuntimeInstance | null}
 */
export function defaultCreateRuntime(config) {
  if (!config) return null;

  switch (config.type) {
    case 'builtin':
      // The editor will import and create mrmd-js runtime
      // This is a placeholder - actual implementation in index.js
      console.warn('[Config] Builtin runtime creation should be handled by editor');
      return null;

    case 'mrp':
      // Create MRPClient
      // This is a placeholder - actual implementation in index.js
      console.warn('[Config] MRP runtime creation should be handled by editor');
      return null;

    case 'custom':
      // Already have the instance
      return config.instance;

    default:
      console.warn(`[Config] Unknown runtime type: ${config.type}`);
      return null;
  }
}
