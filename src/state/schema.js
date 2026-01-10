/**
 * @fileoverview State schema type definitions
 *
 * State is what you OBSERVE. It's derived from running instances.
 * State is read-only from the user's perspective - the editor updates it.
 */

// =============================================================================
// MAIN STATE
// =============================================================================

/**
 * Editor state - everything you can observe
 * @typedef {Object} EditorState
 * @property {ConnectionState} connection - Sync server connection
 * @property {DocumentState} document - Document info
 * @property {Record<string, RuntimeState>} runtimes - Runtime status
 * @property {Record<string, SessionState>} sessions - Execution sessions
 * @property {Record<string, Record<string, VariableInfo>>} variables - Variables by session
 * @property {ExecutionRecord[]} history - Execution history
 * @property {CollaboratorInfo[]} collaborators - Connected collaborators
 * @property {CurrentExecution | null} execution - Current running execution
 * @property {QueueState} queue - Execution queue state
 * @property {Record<number, CellStatusInfo>} cellStatus - Status by cell index
 * @property {AIState} ai - AI endpoint status
 */

// =============================================================================
// CONNECTION STATE
// =============================================================================

/**
 * Connection state to sync server
 * @typedef {Object} ConnectionState
 * @property {'disconnected' | 'connecting' | 'connected' | 'error'} status
 * @property {number} [latency] - Round-trip latency in ms
 * @property {number} [reconnectAttempts] - Number of reconnect attempts
 * @property {number} [lastConnected] - Timestamp of last successful connection
 * @property {string} [error] - Error message if status is 'error'
 */

/** @type {ConnectionState} */
export const INITIAL_CONNECTION_STATE = {
  status: 'disconnected',
  latency: undefined,
  reconnectAttempts: 0,
  lastConnected: undefined,
  error: undefined
};

// =============================================================================
// DOCUMENT STATE
// =============================================================================

/**
 * Document state
 * @typedef {Object} DocumentState
 * @property {boolean} dirty - Has unsaved changes
 * @property {string} [path] - Current path (from config or drive)
 * @property {number} size - Character count
 * @property {number} lines - Line count
 * @property {number} words - Word count
 * @property {number} cells - Code cell count
 * @property {number} [lastModified] - Timestamp of last modification
 * @property {boolean} canUndo - Is undo available?
 * @property {boolean} canRedo - Is redo available?
 * @property {number} undoDepth - Number of undo steps available
 * @property {number} redoDepth - Number of redo steps available
 */

/** @type {DocumentState} */
export const INITIAL_DOCUMENT_STATE = {
  dirty: false,
  path: undefined,
  size: 0,
  lines: 0,
  words: 0,
  cells: 0,
  lastModified: undefined,
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0
};

// =============================================================================
// RUNTIME STATE
// =============================================================================

/**
 * Runtime status
 * @typedef {Object} RuntimeState
 * @property {'initializing' | 'ready' | 'busy' | 'error' | 'stopped'} status
 * @property {string[]} languages - Languages this runtime supports
 * @property {string} [error] - Error message if status is 'error'
 * @property {string} [version] - Runtime/language version
 * @property {string[]} [capabilities] - MRP capabilities
 */

/** @type {RuntimeState} */
export const INITIAL_RUNTIME_STATE = {
  status: 'initializing',
  languages: [],
  error: undefined,
  version: undefined,
  capabilities: undefined
};

// =============================================================================
// SESSION STATE
// =============================================================================

/**
 * Execution session state
 * @typedef {Object} SessionState
 * @property {string} runtime - Which runtime this session belongs to
 * @property {string} language - Language of this session
 * @property {number} executionCount - Number of executions in this session
 * @property {number} [lastActivity] - Timestamp of last activity
 */

// =============================================================================
// VARIABLES
// =============================================================================

/**
 * Variable information
 * @typedef {Object} VariableInfo
 * @property {string} name - Variable name
 * @property {string} type - Type name (number, string, DataFrame, etc.)
 * @property {string} preview - Short preview of value
 * @property {any} [value] - Full value (may be truncated)
 * @property {number} [size] - Size in bytes or element count
 * @property {boolean} [expandable] - Can drill down into this value
 */

// =============================================================================
// EXECUTION HISTORY
// =============================================================================

/**
 * Execution record
 * @typedef {Object} ExecutionRecord
 * @property {string} id - Unique identifier
 * @property {number} cellIndex - Which cell was executed
 * @property {string} language - Language executed
 * @property {string} codePreview - First ~100 chars of code
 * @property {boolean} success - Whether execution succeeded
 * @property {string} [error] - Error message if failed
 * @property {number} startTime - Timestamp when started
 * @property {number} duration - Duration in ms
 * @property {string} [sessionId] - Which session executed it
 */

// =============================================================================
// COLLABORATORS
// =============================================================================

/**
 * Collaborator information
 * @typedef {Object} CollaboratorInfo
 * @property {number} clientId - Yjs client ID
 * @property {string} name - Display name
 * @property {string} color - Cursor/highlight color
 * @property {'human' | 'ai' | 'runtime' | 'sync'} type - Collaborator type
 * @property {'idle' | 'typing' | 'executing' | 'streaming'} status - Current activity
 * @property {{line: number, ch: number}} [cursor] - Cursor position
 */

// =============================================================================
// CURRENT EXECUTION
// =============================================================================

/**
 * Currently running execution
 * @typedef {Object} CurrentExecution
 * @property {number} cellIndex - Which cell is executing
 * @property {string} language - Language being executed
 * @property {number} startTime - When execution started
 * @property {number} [progress] - Progress 0-1 (if available)
 * @property {string} [progressText] - Progress text (e.g., '47/100')
 */

// =============================================================================
// EXECUTION QUEUE
// =============================================================================

/**
 * Execution queue state
 * @typedef {Object} QueueState
 * @property {QueueEntry[]} entries - Queued executions (in order)
 * @property {string|null} running - Currently running execId
 * @property {number} total - Total entries (running + queued)
 */

/**
 * Queue entry
 * @typedef {Object} QueueEntry
 * @property {string} execId - Unique execution ID
 * @property {number} cellIndex - Cell index in document
 * @property {string} language - Language of the cell
 * @property {number} queuePosition - 1-indexed position in queue
 * @property {number} queuedAt - Timestamp when queued
 */

/** @type {QueueState} */
export const INITIAL_QUEUE_STATE = {
  entries: [],
  running: null,
  total: 0
};

// =============================================================================
// CELL STATUS
// =============================================================================

/**
 * Cell status information
 * @typedef {Object} CellStatusInfo
 * @property {'idle'|'queued'|'running'|'success'|'error'} status - Current status
 * @property {number|null} queuePosition - Position in queue (1-indexed), null if not queued
 * @property {string|null} execId - Current or last execution ID
 * @property {number|null} lastRunAt - Timestamp of last run
 * @property {string|null} error - Error message if status is 'error'
 */

/** @type {CellStatusInfo} */
export const INITIAL_CELL_STATUS = {
  status: 'idle',
  queuePosition: null,
  execId: null,
  lastRunAt: null,
  error: null
};

// =============================================================================
// AI STATE
// =============================================================================

/**
 * AI services state
 * @typedef {Object} AIState
 * @property {string} [activeEndpoint] - Currently active endpoint ID
 * @property {Record<string, AIEndpointState>} endpoints - Endpoint status
 */

/**
 * Single AI endpoint state
 * @typedef {Object} AIEndpointState
 * @property {'unconfigured' | 'available' | 'error'} status
 * @property {string} [error] - Error message if status is 'error'
 */

/** @type {AIState} */
export const INITIAL_AI_STATE = {
  activeEndpoint: undefined,
  endpoints: {}
};

// =============================================================================
// INITIAL STATE
// =============================================================================

/**
 * Get initial state with all values filled in
 * @returns {EditorState}
 */
export function getInitialState() {
  return {
    connection: { ...INITIAL_CONNECTION_STATE },
    document: { ...INITIAL_DOCUMENT_STATE },
    runtimes: {},
    sessions: {},
    variables: {},
    history: [],
    collaborators: [],
    execution: null,
    queue: { ...INITIAL_QUEUE_STATE },
    cellStatus: {},
    ai: { ...INITIAL_AI_STATE }
  };
}
