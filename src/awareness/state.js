/**
 * Awareness State Schema and Helpers
 *
 * Defines the rich awareness state model for mrmd collaboration.
 * All collaborators (humans, runtimes, AI) share state via Yjs Awareness.
 *
 * @module awareness/state
 */

// #region TYPES

/**
 * @typedef {'human' | 'ai' | 'runtime' | 'sync'} CollaboratorType
 */

/**
 * @typedef {'idle' | 'typing' | 'selecting' | 'executing' | 'streaming' | 'thinking'} CollaboratorStatus
 */

/**
 * @typedef {Object} HoverState
 * @property {string} symbol - The symbol being hovered (e.g., 'df')
 * @property {string} [type] - Type of the symbol (e.g., 'DataFrame')
 * @property {string} [info] - Short description or value preview
 * @property {{line: number, ch: number}} position - Document position
 * @property {number} [cellIndex] - Which cell the hover is in
 */

/**
 * @typedef {Object} AutocompleteState
 * @property {string} query - The completion query (e.g., 'df.he')
 * @property {string[]} items - Top completion items (e.g., ['head()', 'hist()'])
 * @property {{line: number, ch: number}} position - Document position
 * @property {number} [cellIndex] - Which cell the autocomplete is in
 */

/**
 * @typedef {Object} ExecutionState
 * @property {number} cellIndex - Which cell is being executed
 * @property {number} startTime - Timestamp when execution started
 * @property {number} [progress] - Progress 0-1 if available (e.g., from tqdm)
 * @property {string} [progressText] - Progress text (e.g., '47/100 [00:23<00:26]')
 * @property {string} [language] - Language being executed
 */

/**
 * @typedef {Object} GenerationState
 * @property {number} [targetCell] - Which cell AI is writing to
 * @property {number} [tokensGenerated] - Number of tokens generated so far
 * @property {string} [model] - Model being used (e.g., 'claude-3.5-sonnet')
 */

/**
 * @typedef {Object} CursorState
 * @property {number} anchor - Selection anchor (relative position in Yjs)
 * @property {number} head - Selection head (relative position in Yjs)
 */

/**
 * @typedef {Object} AwarenessUserState
 * @property {CollaboratorType} type - Type of collaborator
 * @property {string} name - Display name
 * @property {string} color - Hex color for UI
 * @property {CollaboratorStatus} [status] - Current status
 * @property {HoverState} [hover] - What they're hovering over
 * @property {AutocompleteState} [autocomplete] - Active autocomplete
 * @property {ExecutionState} [execution] - Active execution (for runtimes)
 * @property {GenerationState} [generation] - Active generation (for AI)
 * @property {number} [activeCellIndex] - Which cell cursor is in
 * @property {number} [lastActivity] - Timestamp of last activity
 */

// #endregion TYPES

// #region COLORS

/**
 * Default colors for collaborators
 */
export const COLLABORATOR_COLORS = {
  human: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'],
  ai: ['#8b5cf6', '#a855f7', '#d946ef'],
  runtime: ['#3572A5', '#f1e05a', '#e34c26', '#b07219', '#563d7c'], // Python, JS, HTML, Java, CSS colors
  sync: ['#6b7280'],
};

/**
 * Generate a random color for a collaborator type
 * @param {CollaboratorType} type
 * @returns {string}
 */
export function generateColor(type = 'human') {
  const colors = COLLABORATOR_COLORS[type] || COLLABORATOR_COLORS.human;
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Well-known runtime colors by language
 */
export const LANGUAGE_COLORS = {
  python: '#3572A5',
  javascript: '#f1e05a',
  typescript: '#3178c6',
  html: '#e34c26',
  css: '#563d7c',
  java: '#b07219',
  rust: '#dea584',
  go: '#00ADD8',
  ruby: '#701516',
  julia: '#9558b2',
  r: '#198ce7',
  bash: '#89e051',
  shell: '#89e051',
};

/**
 * Get color for a language runtime
 * @param {string} language
 * @returns {string}
 */
export function getLanguageColor(language) {
  const lang = language?.toLowerCase();
  return LANGUAGE_COLORS[lang] || generateColor('runtime');
}

// #endregion COLORS

// #region STATE_HELPERS

/**
 * Create initial awareness state for a human collaborator
 * @param {Object} options
 * @param {string} [options.name='Anonymous']
 * @param {string} [options.color]
 * @returns {AwarenessUserState}
 */
export function createHumanState({ name = 'Anonymous', color } = {}) {
  return {
    type: 'human',
    name,
    color: color || generateColor('human'),
    status: 'idle',
    lastActivity: Date.now(),
  };
}

/**
 * Create initial awareness state for a runtime collaborator
 * @param {Object} options
 * @param {string} options.language - Runtime language
 * @param {string} [options.name]
 * @param {string} [options.color]
 * @returns {AwarenessUserState}
 */
export function createRuntimeState({ language, name, color } = {}) {
  const lang = language?.toLowerCase() || 'unknown';
  return {
    type: 'runtime',
    name: name || `${language || 'Runtime'}`,
    color: color || getLanguageColor(lang),
    status: 'idle',
    lastActivity: Date.now(),
  };
}

/**
 * Create initial awareness state for an AI collaborator
 * @param {Object} options
 * @param {string} [options.name='AI Assistant']
 * @param {string} [options.model]
 * @param {string} [options.color]
 * @returns {AwarenessUserState}
 */
export function createAIState({ name = 'AI Assistant', model, color } = {}) {
  return {
    type: 'ai',
    name,
    color: color || generateColor('ai'),
    status: 'idle',
    generation: model ? { model } : undefined,
    lastActivity: Date.now(),
  };
}

/**
 * Create initial awareness state for a sync service
 * @param {Object} options
 * @param {string} [options.name='Sync']
 * @returns {AwarenessUserState}
 */
export function createSyncState({ name = 'Sync' } = {}) {
  return {
    type: 'sync',
    name,
    color: generateColor('sync'),
    status: 'idle',
    lastActivity: Date.now(),
  };
}

// #endregion STATE_HELPERS

// #region STATE_UPDATES

/**
 * Update hover state
 * @param {AwarenessUserState} state
 * @param {HoverState|null} hover
 * @returns {AwarenessUserState}
 */
export function withHover(state, hover) {
  return {
    ...state,
    hover: hover || undefined,
    lastActivity: Date.now(),
  };
}

/**
 * Update autocomplete state
 * @param {AwarenessUserState} state
 * @param {AutocompleteState|null} autocomplete
 * @returns {AwarenessUserState}
 */
export function withAutocomplete(state, autocomplete) {
  return {
    ...state,
    autocomplete: autocomplete || undefined,
    lastActivity: Date.now(),
  };
}

/**
 * Update execution state
 * @param {AwarenessUserState} state
 * @param {ExecutionState|null} execution
 * @returns {AwarenessUserState}
 */
export function withExecution(state, execution) {
  return {
    ...state,
    status: execution ? 'executing' : 'idle',
    execution: execution || undefined,
    lastActivity: Date.now(),
  };
}

/**
 * Update generation state (for AI)
 * @param {AwarenessUserState} state
 * @param {GenerationState|null} generation
 * @returns {AwarenessUserState}
 */
export function withGeneration(state, generation) {
  return {
    ...state,
    status: generation ? 'streaming' : 'idle',
    generation: generation ? { ...state.generation, ...generation } : state.generation,
    lastActivity: Date.now(),
  };
}

/**
 * Update status
 * @param {AwarenessUserState} state
 * @param {CollaboratorStatus} status
 * @returns {AwarenessUserState}
 */
export function withStatus(state, status) {
  return {
    ...state,
    status,
    lastActivity: Date.now(),
  };
}

/**
 * Update active cell index
 * @param {AwarenessUserState} state
 * @param {number|null} cellIndex
 * @returns {AwarenessUserState}
 */
export function withActiveCell(state, cellIndex) {
  return {
    ...state,
    activeCellIndex: cellIndex ?? undefined,
    lastActivity: Date.now(),
  };
}

/**
 * Clear transient state (hover, autocomplete) - useful on blur/idle
 * @param {AwarenessUserState} state
 * @returns {AwarenessUserState}
 */
export function clearTransientState(state) {
  return {
    ...state,
    hover: undefined,
    autocomplete: undefined,
    status: 'idle',
    lastActivity: Date.now(),
  };
}

// #endregion STATE_UPDATES

// #region AWARENESS_HELPERS

/**
 * Helper class to manage awareness state updates
 */
export class AwarenessStateManager {
  /**
   * @param {import('y-protocols/awareness').Awareness} awareness
   */
  constructor(awareness) {
    this.awareness = awareness;
  }

  /**
   * Get current local user state
   * @returns {AwarenessUserState|null}
   */
  getLocalState() {
    return this.awareness.getLocalState()?.user || null;
  }

  /**
   * Set the entire local user state
   * @param {AwarenessUserState} state
   */
  setLocalState(state) {
    this.awareness.setLocalStateField('user', state);
  }

  /**
   * Update local state with a partial update
   * @param {Partial<AwarenessUserState>} update
   */
  updateLocalState(update) {
    const current = this.getLocalState() || {};
    this.setLocalState({ ...current, ...update, lastActivity: Date.now() });
  }

  /**
   * Set hover state
   * @param {HoverState|null} hover
   */
  setHover(hover) {
    const current = this.getLocalState();
    if (current) {
      this.setLocalState(withHover(current, hover));
    }
  }

  /**
   * Set autocomplete state
   * @param {AutocompleteState|null} autocomplete
   */
  setAutocomplete(autocomplete) {
    const current = this.getLocalState();
    if (current) {
      this.setLocalState(withAutocomplete(current, autocomplete));
    }
  }

  /**
   * Set execution state
   * @param {ExecutionState|null} execution
   */
  setExecution(execution) {
    const current = this.getLocalState();
    if (current) {
      this.setLocalState(withExecution(current, execution));
    }
  }

  /**
   * Set generation state
   * @param {GenerationState|null} generation
   */
  setGeneration(generation) {
    const current = this.getLocalState();
    if (current) {
      this.setLocalState(withGeneration(current, generation));
    }
  }

  /**
   * Set status
   * @param {CollaboratorStatus} status
   */
  setStatus(status) {
    const current = this.getLocalState();
    if (current) {
      this.setLocalState(withStatus(current, status));
    }
  }

  /**
   * Set active cell index
   * @param {number|null} cellIndex
   */
  setActiveCell(cellIndex) {
    const current = this.getLocalState();
    if (current) {
      this.setLocalState(withActiveCell(current, cellIndex));
    }
  }

  /**
   * Clear transient state
   */
  clearTransient() {
    const current = this.getLocalState();
    if (current) {
      this.setLocalState(clearTransientState(current));
    }
  }

  /**
   * Get all collaborators (excluding self optionally)
   * @param {Object} [options]
   * @param {boolean} [options.includeSelf=true]
   * @param {CollaboratorType[]} [options.types] - Filter by types
   * @returns {Array<{clientId: number, user: AwarenessUserState}>}
   */
  getCollaborators({ includeSelf = true, types } = {}) {
    const localClientId = this.awareness.clientID;
    const states = [];

    this.awareness.getStates().forEach((state, clientId) => {
      if (!includeSelf && clientId === localClientId) return;
      if (!state.user) return;
      if (types && !types.includes(state.user.type)) return;

      states.push({ clientId, user: state.user });
    });

    return states;
  }

  /**
   * Get collaborators by type
   * @param {CollaboratorType} type
   * @returns {Array<{clientId: number, user: AwarenessUserState}>}
   */
  getByType(type) {
    return this.getCollaborators({ types: [type] });
  }

  /**
   * Get humans only
   */
  getHumans() {
    return this.getByType('human');
  }

  /**
   * Get runtimes only
   */
  getRuntimes() {
    return this.getByType('runtime');
  }

  /**
   * Get AIs only
   */
  getAIs() {
    return this.getByType('ai');
  }

  /**
   * Check if any runtime is executing
   * @returns {{clientId: number, user: AwarenessUserState, execution: ExecutionState}|null}
   */
  getActiveExecution() {
    for (const { clientId, user } of this.getCollaborators()) {
      if (user.execution && user.status === 'executing') {
        return { clientId, user, execution: user.execution };
      }
    }
    return null;
  }

  /**
   * Check if any AI is generating
   * @returns {{clientId: number, user: AwarenessUserState, generation: GenerationState}|null}
   */
  getActiveGeneration() {
    for (const { clientId, user } of this.getCollaborators()) {
      if (user.generation && (user.status === 'streaming' || user.status === 'thinking')) {
        return { clientId, user, generation: user.generation };
      }
    }
    return null;
  }

  /**
   * Subscribe to awareness changes
   * @param {function} callback
   * @returns {function} Unsubscribe function
   */
  onChange(callback) {
    const handler = () => callback(this.getCollaborators());
    this.awareness.on('change', handler);
    return () => this.awareness.off('change', handler);
  }
}

// #endregion AWARENESS_HELPERS

// #region EXPORTS

export {
  AwarenessStateManager as default,
};

// #endregion EXPORTS
