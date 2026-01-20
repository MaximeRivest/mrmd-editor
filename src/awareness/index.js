/**
 * Awareness Module
 *
 * Batteries-included awareness system for mrmd-editor.
 * Provides rich collaborator presence, status tracking, and UI components.
 *
 * Usage:
 *
 *   import { createAwareness } from './awareness';
 *
 *   const awareness = createAwareness({
 *     yjsAwareness: editor.awareness,
 *     view: editor.view,
 *     getContent: () => editor.getContent(),
 *     userName: 'Alice',
 *   });
 *
 *   // Everything is now wired up automatically!
 *
 * @module awareness
 */

// Re-export all sub-modules
export * from './state.js';
export * from './human.js';
export * from './runtime.js';
export * from './ui/collaborator-list.js';
export * from './ui/cursors.js';
export * from './ui/indicators.js';
export * from './ui/styles.js';

import * as Y from 'yjs';

// Import for internal use
import {
  AwarenessStateManager,
  createHumanState,
  createRuntimeState,
  createAIState,
  generateColor,
} from './state.js';

import {
  createHumanAwarenessExtensions,
  createHoverTracker,
  createAutocompleteTracker,
} from './human.js';

import {
  createRuntimeAwarenessTracker,
  createSimpleExecutionTracker,
} from './runtime.js';

import {
  createCollaboratorList,
  createFloatingCollaboratorList,
  createAvatarRow,
} from './ui/collaborator-list.js';

import {
  createEnhancedCursors,
  createSelectionHighlights,
  createCursorExtensions,
} from './ui/cursors.js';

import {
  createHoverIndicators,
  createExecutionIndicators,
  createCellPresenceIndicators,
  createStatusBar,
  createIndicatorExtensions,
} from './ui/indicators.js';

import {
  injectAwarenessStyles,
  awarenessStyles,
} from './ui/styles.js';

// #region MAIN_API

/**
 * @typedef {Object} AwarenessConfig
 * @property {boolean} [cursors=true] - Show enhanced cursor labels
 * @property {boolean} [cursorStatus=true] - Show status in cursor labels
 * @property {boolean} [cursorActivity=true] - Show activity in cursor labels
 * @property {boolean} [selectionHighlights=true] - Show remote selections
 * @property {boolean} [hoverIndicators=true] - Show hover position indicators
 * @property {boolean} [executionIndicators=true] - Show execution status on cells
 * @property {boolean} [cellPresence=true] - Show who's in each cell
 * @property {boolean} [trackTyping=true] - Broadcast typing status
 * @property {boolean} [trackHover=true] - Broadcast hover state
 * @property {boolean} [trackAutocomplete=true] - Broadcast autocomplete state
 * @property {number} [idleTimeout=2000] - Ms before status becomes 'idle'
 * @property {number} [selectionOpacity=0.2] - Remote selection opacity
 */

/**
 * @typedef {Object} AwarenessOptions
 * @property {import('y-protocols/awareness').Awareness} yjsAwareness - Yjs awareness instance
 * @property {import('@codemirror/view').EditorView} view - CodeMirror view
 * @property {function(): string} getContent - Get document content
 * @property {import('yjs').Text} [yText] - Yjs Text instance for cursor position conversion
 * @property {string} [userName='Anonymous'] - Local user name
 * @property {string} [userColor] - Local user color (auto-generated if not provided)
 * @property {'human'|'ai'|'runtime'} [userType='human'] - Local user type
 * @property {AwarenessConfig} [config] - Feature configuration
 */

/**
 * Creates a fully configured awareness system.
 *
 * This is the main entry point for awareness functionality.
 * It sets up state management, tracking, and UI components.
 *
 * @param {AwarenessOptions} options
 * @returns {AwarenessSystem}
 */
export function createAwareness(options) {
  return new AwarenessSystem(options);
}

/**
 * Main awareness system class
 */
export class AwarenessSystem {
  /**
   * @param {AwarenessOptions} options
   */
  constructor(options) {
    const {
      yjsAwareness,
      view,
      getContent,
      yText,
      userName = 'Anonymous',
      userColor,
      userType = 'human',
      config = {},
    } = options;

    this.yjsAwareness = yjsAwareness;
    this.view = view;
    this.getContent = getContent;
    this.yText = yText;
    this.config = {
      cursors: true,
      cursorStatus: true,
      cursorActivity: true,
      selectionHighlights: true,
      hoverIndicators: true,
      executionIndicators: true,
      cellPresence: true,
      trackTyping: true,
      trackHover: true,
      trackAutocomplete: true,
      idleTimeout: 2000,
      selectionOpacity: 0.2,
      ...config,
    };

    // Create state manager
    this.stateManager = new AwarenessStateManager(yjsAwareness);

    // Initialize local user state
    const initialState = this._createInitialState(userType, userName, userColor);
    this.stateManager.setLocalState(initialState);

    // Track UI components for cleanup
    this._uiComponents = [];
    this._subscriptions = [];

    // Inject styles
    injectAwarenessStyles();
  }

  /**
   * Create initial state based on user type
   */
  _createInitialState(type, name, color) {
    switch (type) {
      case 'ai':
        return createAIState({ name, color });
      case 'runtime':
        return createRuntimeState({ name, color });
      default:
        return createHumanState({ name, color });
    }
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  /**
   * Get the state manager for direct access
   * @returns {AwarenessStateManager}
   */
  getStateManager() {
    return this.stateManager;
  }

  /**
   * Update local user info
   * @param {Object} info
   * @param {string} [info.name]
   * @param {string} [info.color]
   * @param {string} [info.status]
   */
  updateUser(info) {
    this.stateManager.updateLocalState(info);
  }

  /**
   * Set hover state (for manual control)
   * @param {Object|null} hover
   */
  setHover(hover) {
    this.stateManager.setHover(hover);
  }

  /**
   * Set autocomplete state (for manual control)
   * @param {Object|null} autocomplete
   */
  setAutocomplete(autocomplete) {
    this.stateManager.setAutocomplete(autocomplete);
  }

  /**
   * Set execution state (for runtimes)
   * @param {Object|null} execution
   */
  setExecution(execution) {
    this.stateManager.setExecution(execution);
  }

  /**
   * Set generation state (for AI)
   * @param {Object|null} generation
   */
  setGeneration(generation) {
    this.stateManager.setGeneration(generation);
  }

  /**
   * Set focused block state (syncs output widget visibility across clients)
   * When a user focuses on an output block to edit it, all clients see raw text.
   * @param {{start: number, end: number, blockType: 'output'|'code'}|null} focusedBlock
   */
  setFocusedBlock(focusedBlock) {
    this.stateManager.setFocusedBlock(focusedBlock);
  }

  /**
   * Get all focused blocks from all collaborators
   * @returns {Array<{start: number, end: number, blockType: string, clientId: number}>}
   */
  getFocusedBlocks() {
    const blocks = [];
    this.yjsAwareness.getStates().forEach((state, clientId) => {
      if (state.user?.focusedBlock) {
        blocks.push({
          ...state.user.focusedBlock,
          clientId,
        });
      }
    });
    return blocks;
  }

  /**
   * Check if any REMOTE collaborator's cursor is inside a block.
   * Uses y-codemirror.next's cursor positions (RelativePositions) which survive edits.
   * @param {number} blockStart
   * @param {number} blockEnd
   * @returns {boolean}
   */
  isBlockFocused(blockStart, blockEnd) {
    const localClientId = this.yjsAwareness.clientID;
    const yText = this.yText;
    const ydoc = yText?.doc;

    if (!ydoc) return false;

    let focused = false;
    this.yjsAwareness.getStates().forEach((state, clientId) => {
      // Skip local client - we check local cursor position directly
      if (clientId === localClientId) return;

      // Use y-codemirror.next's cursor (RelativePosition) instead of our focusedBlock
      const cursor = state.cursor;
      if (!cursor?.head) return;

      try {
        // Convert RelativePosition to absolute position
        const absPos = Y.createAbsolutePositionFromRelativePosition(cursor.head, ydoc);
        if (absPos && absPos.type === yText) {
          const pos = absPos.index;
          // Check if cursor is inside the block
          if (pos >= blockStart && pos <= blockEnd) {
            focused = true;
          }
        }
      } catch (e) {
        // Position conversion failed, skip this collaborator
      }
    });
    return focused;
  }

  /**
   * Set status
   * @param {string} status
   */
  setStatus(status) {
    this.stateManager.setStatus(status);
  }

  /**
   * Get all collaborators
   * @param {Object} [options]
   * @returns {Array}
   */
  getCollaborators(options) {
    return this.stateManager.getCollaborators(options);
  }

  /**
   * Subscribe to collaborator changes
   * @param {function} callback
   * @returns {function} Unsubscribe
   */
  onCollaboratorsChange(callback) {
    return this.stateManager.onChange(callback);
  }

  // ===========================================================================
  // CodeMirror Extensions
  // ===========================================================================

  /**
   * Get all CodeMirror extensions for awareness features.
   *
   * Add these to your editor's extensions array.
   *
   * @returns {import('@codemirror/state').Extension[]}
   */
  getExtensions() {
    const extensions = [];

    // Human tracking extensions
    if (this.config.trackTyping) {
      extensions.push(...createHumanAwarenessExtensions({
        stateManager: this.stateManager,
        getContent: this.getContent,
        config: {
          idleTimeout: this.config.idleTimeout,
        },
      }));
    }

    // Cursor extensions - these ARE the cursor rendering (y-codemirror.next disabled)
    // All collaborators (humans, AI, runtimes) render through this unified system
    if (this.config.cursors) {
      extensions.push(...createCursorExtensions({
        stateManager: this.stateManager,
        yText: this.yText,
        config: {
          showLabels: true,
          showStatus: this.config.cursorStatus,
          showActivity: this.config.cursorActivity,
          selectionOpacity: this.config.selectionOpacity,
          replaceCaret: true,   // We handle all cursor rendering
          showAlways: true,     // Always show labels, not just on hover
        },
      }));
    }

    // Indicator extensions
    extensions.push(...createIndicatorExtensions({
      stateManager: this.stateManager,
      getContent: this.getContent,
      yText: this.yText,  // For RelativePosition conversion
      config: {
        hover: this.config.hoverIndicators,
        execution: this.config.executionIndicators,
        cellPresence: this.config.cellPresence,
      },
    }));

    return extensions;
  }

  // ===========================================================================
  // Hover/Autocomplete Wrappers
  // ===========================================================================

  /**
   * Wrap a hover provider to broadcast hover state.
   *
   * Use this to wrap your MRP hover provider or any custom hover.
   *
   * @param {function} hoverProvider - Original hover provider
   * @returns {function} Wrapped provider
   */
  wrapHoverProvider(hoverProvider) {
    if (!this.config.trackHover) return hoverProvider;

    return createHoverTracker({
      stateManager: this.stateManager,
      hoverProvider,
      getContent: this.getContent,
      yText: this.yText,  // For RelativePosition tracking
    });
  }

  /**
   * Wrap a completion source to broadcast autocomplete state.
   *
   * @param {import('@codemirror/autocomplete').CompletionSource} source
   * @returns {import('@codemirror/autocomplete').CompletionSource}
   */
  wrapCompletionSource(source) {
    if (!this.config.trackAutocomplete) return source;

    return createAutocompleteTracker({
      stateManager: this.stateManager,
      completionSource: source,
      getContent: this.getContent,
      yText: this.yText,  // For RelativePosition tracking
    });
  }

  // ===========================================================================
  // Execution Tracking
  // ===========================================================================

  /**
   * Create an execution tracker that automatically updates awareness
   * when cells are run.
   *
   * @param {import('../execution.js').ExecutionManager} executionManager
   * @param {Object} [options]
   * @param {string} [options.language]
   * @param {string} [options.name]
   * @param {string} [options.color]
   * @returns {import('./runtime.js').RuntimeAwarenessTracker}
   */
  trackExecution(executionManager, options = {}) {
    const tracker = createRuntimeAwarenessTracker({
      executionManager,
      awareness: this.yjsAwareness,
      ...options,
    });

    this._subscriptions.push(() => tracker.destroy());
    return tracker;
  }

  /**
   * Create a simple execution tracker for manual control.
   *
   * @returns {{start: function, progress: function, end: function}}
   */
  createExecutionTracker() {
    return createSimpleExecutionTracker({
      stateManager: this.stateManager,
    });
  }

  // ===========================================================================
  // UI Components
  // ===========================================================================

  /**
   * Create a collaborator list component.
   *
   * @param {HTMLElement} container
   * @param {Object} [options]
   * @returns {{update: function, destroy: function, element: HTMLElement}}
   */
  createCollaboratorList(container, options = {}) {
    const list = createCollaboratorList({
      container,
      stateManager: this.stateManager,
      ...options,
    });

    this._uiComponents.push(list);
    return list;
  }

  /**
   * Create a floating collaborator list.
   *
   * @param {Object} [options]
   * @param {Object} [options.position]
   * @returns {{show: function, hide: function, toggle: function, destroy: function}}
   */
  createFloatingList(options = {}) {
    const list = createFloatingCollaboratorList({
      stateManager: this.stateManager,
      ...options,
    });

    this._uiComponents.push(list);
    return list;
  }

  /**
   * Create a compact avatar row.
   *
   * @param {HTMLElement} container
   * @param {Object} [options]
   * @returns {{update: function, destroy: function, element: HTMLElement}}
   */
  createAvatarRow(container, options = {}) {
    const row = createAvatarRow({
      container,
      stateManager: this.stateManager,
      ...options,
    });

    this._uiComponents.push(row);
    return row;
  }

  /**
   * Create a status bar component.
   *
   * @param {HTMLElement} [container]
   * @returns {{element: HTMLElement, update: function, destroy: function}}
   */
  createStatusBar(container) {
    const bar = createStatusBar({
      stateManager: this.stateManager,
      container,
    });

    this._uiComponents.push(bar);
    return bar;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Clean up all resources.
   */
  destroy() {
    // Clear cursor position from awareness so it doesn't appear as a stale/anonymous cursor
    // when the user navigates back to this document. The cursor field is managed by
    // y-codemirror.next and stored directly on awareness (not under 'user').
    this.yjsAwareness.setLocalStateField('cursor', null);

    // Clear transient state
    this.stateManager.clearTransient();

    // Destroy UI components
    this._uiComponents.forEach(c => c.destroy?.());
    this._uiComponents = [];

    // Unsubscribe from all
    this._subscriptions.forEach(unsub => unsub?.());
    this._subscriptions = [];
  }
}

// #endregion MAIN_API

// #region CONVENIENCE

/**
 * Default awareness configuration
 */
export const defaultAwarenessConfig = {
  cursors: true,
  cursorStatus: true,
  cursorActivity: true,
  selectionHighlights: true,
  hoverIndicators: true,
  executionIndicators: true,
  cellPresence: true,
  trackTyping: true,
  trackHover: true,
  trackAutocomplete: true,
  idleTimeout: 2000,
  selectionOpacity: 0.2,
};

/**
 * Minimal awareness configuration (just cursors)
 */
export const minimalAwarenessConfig = {
  cursors: true,
  cursorStatus: false,
  cursorActivity: false,
  selectionHighlights: true,
  hoverIndicators: false,
  executionIndicators: false,
  cellPresence: false,
  trackTyping: false,
  trackHover: false,
  trackAutocomplete: false,
};

// #endregion CONVENIENCE

// #region EXPORTS

export default {
  // Main API
  createAwareness,
  AwarenessSystem,

  // State
  AwarenessStateManager,
  createHumanState,
  createRuntimeState,
  createAIState,
  generateColor,

  // Human tracking
  createHumanAwarenessExtensions,
  createHoverTracker,
  createAutocompleteTracker,

  // Runtime tracking
  createRuntimeAwarenessTracker,
  createSimpleExecutionTracker,

  // UI Components
  createCollaboratorList,
  createFloatingCollaboratorList,
  createAvatarRow,
  createStatusBar,

  // Extensions
  createEnhancedCursors,
  createSelectionHighlights,
  createCursorExtensions,
  createHoverIndicators,
  createExecutionIndicators,
  createCellPresenceIndicators,
  createIndicatorExtensions,

  // Styles
  injectAwarenessStyles,
  awarenessStyles,

  // Config presets
  defaultAwarenessConfig,
  minimalAwarenessConfig,
};

// #endregion EXPORTS
