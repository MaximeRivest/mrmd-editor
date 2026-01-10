/**
 * @fileoverview State system
 *
 * Provides observable state for the editor.
 * State is what you OBSERVE - it's derived from running instances.
 *
 * Usage:
 *   import { createStateManager } from './state';
 *
 *   const stateManager = createStateManager();
 *
 *   // Get read-only proxy for users
 *   const state = stateManager.getReadOnlyProxy();
 *   console.log(state.connection.status);  // 'disconnected'
 *
 *   // Subscribe to changes
 *   stateManager.subscribe((event) => {
 *     console.log('State changed:', event.path, event.value);
 *   });
 *
 *   // Internal: Update state (users can't do this)
 *   stateManager.setConnectionStatus('connected');
 */

// Schema and types
export {
  getInitialState,
  INITIAL_CONNECTION_STATE,
  INITIAL_DOCUMENT_STATE,
  INITIAL_RUNTIME_STATE,
  INITIAL_AI_STATE
} from './schema.js';

// State manager
export {
  StateManager,
  createStateManager
} from './manager.js';

/**
 * @typedef {import('./schema.js').EditorState} EditorState
 * @typedef {import('./schema.js').ConnectionState} ConnectionState
 * @typedef {import('./schema.js').DocumentState} DocumentState
 * @typedef {import('./schema.js').RuntimeState} RuntimeState
 * @typedef {import('./schema.js').SessionState} SessionState
 * @typedef {import('./schema.js').VariableInfo} VariableInfo
 * @typedef {import('./schema.js').ExecutionRecord} ExecutionRecord
 * @typedef {import('./schema.js').CollaboratorInfo} CollaboratorInfo
 * @typedef {import('./schema.js').CurrentExecution} CurrentExecution
 * @typedef {import('./schema.js').AIState} AIState
 * @typedef {import('./manager.js').StateChangeEvent} StateChangeEvent
 */
