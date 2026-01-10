/**
 * @fileoverview Config system
 *
 * Provides reactive configuration for the editor.
 * Config is what you DECLARE - it's serializable and restorable.
 *
 * Usage:
 *   import { createReactiveConfig, normalizeOptions } from './config';
 *
 *   // Normalize flat options to structured config
 *   const config = normalizeOptions({ doc: '# Hello', dark: true });
 *
 *   // Make it reactive
 *   const reactiveConfig = createReactiveConfig(config, (event) => {
 *     console.log('Config changed:', event.path, event.value);
 *   });
 *
 *   // Changes trigger handlers
 *   reactiveConfig.appearance.dark = false;
 */

// Schema and types
export {
  getDefaultConfig,
  normalizeOptions,
  serializeConfig,
  isFullySerializable,
  DEFAULT_APPEARANCE,
  DEFAULT_USER,
  DEFAULT_AWARENESS,
  DEFAULT_DEV_PANEL,
  DEFAULT_CELL_CONTROLS,
  DEFAULT_CELL_BUTTONS,
  DEFAULT_CELL_STATUS,
  DEFAULT_CELL_QUEUE
} from './schema.js';

// Reactive proxy
export {
  createReactiveConfig,
  pathToString,
  stringToPath,
  matchesPattern,
  createPathHandler,
  batchChanges
} from './reactive.js';

// Change handlers
export {
  createConfigHandler,
  defaultCreateRuntime
} from './handlers.js';

/**
 * @typedef {import('./schema.js').EditorConfig} EditorConfig
 * @typedef {import('./schema.js').DriveConfig} DriveConfig
 * @typedef {import('./schema.js').DocumentConfig} DocumentConfig
 * @typedef {import('./schema.js').AppearanceConfig} AppearanceConfig
 * @typedef {import('./schema.js').UserConfig} UserConfig
 * @typedef {import('./schema.js').RuntimeConfig} RuntimeConfig
 * @typedef {import('./schema.js').AIConfig} AIConfig
 * @typedef {import('./schema.js').AwarenessConfig} AwarenessConfig
 * @typedef {import('./schema.js').DevPanelConfig} DevPanelConfig
 * @typedef {import('./reactive.js').ConfigChangeEvent} ConfigChangeEvent
 */
