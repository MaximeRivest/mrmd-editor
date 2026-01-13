/**
 * @fileoverview Status Bar Component
 *
 * The main status bar that displays file info, sync status, and runtime info.
 * Each segment is clickable and opens a context menu.
 */

import { createMenu, createFileMenu } from './menu.js';

// =============================================================================
// STATUS BAR
// =============================================================================

/**
 * @typedef {Object} StatusBarOptions
 * @property {HTMLElement} container - Container element
 * @property {Object} editor - mrmd editor instance
 * @property {import('../state.js').ShellStateManager} shellState - Shell state manager
 * @property {import('../orchestrator-client.js').OrchestratorClient} orchestratorClient
 * @property {string[]} [segments=['file', 'location', 'sync', 'runtime']]
 * @property {'top'|'bottom'} [position='bottom']
 * @property {Object} [handlers] - Event handlers
 */

/**
 * Create a status bar
 * @param {StatusBarOptions} options
 * @returns {{element: HTMLElement, setEditor: (editor: Object) => void, destroy: () => void}}
 */
export function createStatusBar(options) {
  const {
    container,
    editor: initialEditor,
    shellState,
    orchestratorClient,
    segments = ['file', 'location', 'sync', 'runtime'],
    position = 'bottom',
    handlers = {},
  } = options;

  // Create status bar element
  const statusBar = document.createElement('div');
  statusBar.className = `mrmd-statusbar mrmd-statusbar--${position}`;

  // Track segment elements and their cleanup functions
  const segmentElements = new Map();
  const cleanupFunctions = [];

  // Shared editor reference that can be updated
  const editorRef = { current: initialEditor };

  // Create segments
  for (const segmentType of segments) {
    const segmentEl = createSegment(segmentType, {
      editorRef,
      shellState,
      orchestratorClient,
      handlers,
      onCleanup: (fn) => cleanupFunctions.push(fn),
    });

    if (segmentEl) {
      segmentElements.set(segmentType, segmentEl);
      statusBar.appendChild(segmentEl);
    }
  }

  // Add to container
  container.appendChild(statusBar);

  return {
    element: statusBar,

    /**
     * Update the editor reference (called when editor is recreated)
     * @param {Object} newEditor
     */
    setEditor(newEditor) {
      editorRef.current = newEditor;
      // Trigger re-render of sync segment which depends on editor
      // This is handled automatically by shell state changes
    },

    destroy() {
      cleanupFunctions.forEach(fn => fn());
      statusBar.remove();
    },
  };
}

// =============================================================================
// SEGMENT FACTORY
// =============================================================================

/**
 * Create a segment element
 * @private
 */
function createSegment(type, context) {
  switch (type) {
    case 'file':
      return createFileSegment(context);
    case 'location':
      return createLocationSegment(context);
    case 'sync':
      return createSyncSegment(context);
    case 'runtime':
      return createRuntimeSegment(context);
    default:
      console.warn(`Unknown segment type: ${type}`);
      return null;
  }
}

// =============================================================================
// FILE SEGMENT
// =============================================================================

function createFileSegment({ shellState, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'file');

  let currentMenu = null;

  function render() {
    const file = shellState.get('file');

    if (!file) {
      segment.innerHTML = `
        <span class="mrmd-statusbar__icon">📄</span>
        <span class="mrmd-statusbar__label">No file</span>
      `;
      segment.classList.add('mrmd-statusbar__segment--disabled');
      return;
    }

    segment.classList.remove('mrmd-statusbar__segment--disabled');

    let warningBadge = '';
    if (file.isOutsideProject) {
      warningBadge = '<span class="mrmd-statusbar__warning" title="File is outside project">!</span>';
    }

    let dirtyIndicator = file.dirty ? ' •' : '';

    segment.innerHTML = `
      <span class="mrmd-statusbar__icon">📄</span>
      <span class="mrmd-statusbar__label">${file.name}${dirtyIndicator}</span>
      ${warningBadge}
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const file = shellState.get('file');
    if (!file) return;

    const items = [
      {
        type: 'header',
        label: file.name + '.md',
      },
      {
        icon: '✏️',
        label: 'Rename...',
        onClick: () => handlers.onRename?.(),
      },
      {
        icon: '💾',
        label: 'Save As...',
        onClick: () => handlers.onSaveAs?.(),
      },
      { type: 'divider' },
      {
        type: 'info',
        label: 'Path',
        value: file.path,
      },
    ];

    currentMenu = createMenu({
      items,
      anchor: segment,
      position: 'bottom-left',
      onClose: () => { currentMenu = null; },
    });
  }

  segment.addEventListener('click', openMenu);

  // Subscribe to state changes
  const unsubscribe = shellState.onPath('file', render);
  onCleanup(unsubscribe);
  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// LOCATION SEGMENT
// =============================================================================

function createLocationSegment({ shellState, orchestratorClient, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'location');

  let currentMenu = null;

  function render() {
    const file = shellState.get('file');
    const projectRoot = shellState.get('projectRoot');

    // Show shortened path
    let displayPath = projectRoot || '~';
    if (displayPath.length > 30) {
      displayPath = '...' + displayPath.slice(-27);
    }

    segment.innerHTML = `
      <span class="mrmd-statusbar__icon">📁</span>
      <span class="mrmd-statusbar__secondary">${displayPath}</span>
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  async function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    // Fetch files
    let files = [];
    try {
      const result = await orchestratorClient.listFiles();
      files = result.files || [];
    } catch (error) {
      console.error('Failed to list files:', error);
    }

    const currentPath = shellState.get('file.path');

    currentMenu = createFileMenu({
      files,
      currentPath,
      onSelect: (path) => handlers.onOpenFile?.(path),
      onOpenFile: () => handlers.onOpenFilePicker?.(),
      anchor: segment,
      onClose: () => { currentMenu = null; },
    });
  }

  segment.addEventListener('click', openMenu);

  // Subscribe to state changes
  const unsubscribe = shellState.onChange(render);
  onCleanup(unsubscribe);
  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// SYNC SEGMENT
// =============================================================================

function createSyncSegment({ editorRef, shellState, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'sync');

  let currentMenu = null;

  function render() {
    const editor = editorRef.current;

    // Get sync status from editor state if available
    let syncStatus = 'disconnected';
    let latency = null;

    if (editor?.state) {
      const connectionState = editor.state.get?.('connection') || {};
      syncStatus = connectionState.status || 'disconnected';
      latency = connectionState.latency;
    }

    // Fall back to orchestrator status
    const orchServices = shellState.get('orchestrator.services') || {};
    const syncService = orchServices['mrmd-sync'];

    if (syncService?.running && syncStatus === 'disconnected') {
      syncStatus = 'connected';
    }

    const dotClass = syncStatus === 'connected' ? 'connected' : 'disconnected';
    const label = syncStatus === 'connected' ? 'Synced' : 'Offline';
    const latencyText = latency ? ` (${latency}ms)` : '';

    segment.innerHTML = `
      <span class="mrmd-statusbar__dot mrmd-statusbar__dot--${dotClass}"></span>
      <span class="mrmd-statusbar__label">${label}${latencyText}</span>
    `;
  }

  function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const editor = editorRef.current;
    const orchServices = shellState.get('orchestrator.services') || {};
    const syncService = orchServices['mrmd-sync'];

    let connectionState = {};
    if (editor?.state?.get) {
      connectionState = editor.state.get('connection') || {};
    }

    const items = [
      {
        type: 'header',
        label: 'Sync Status',
      },
      {
        type: 'info',
        label: 'Status',
        value: connectionState.status || (syncService?.running ? 'connected' : 'disconnected'),
      },
      {
        type: 'info',
        label: 'URL',
        value: syncService?.url || 'N/A',
      },
    ];

    if (connectionState.latency) {
      items.push({
        type: 'info',
        label: 'Latency',
        value: `${connectionState.latency}ms`,
      });
    }

    currentMenu = createMenu({
      items,
      anchor: segment,
      position: 'bottom-left',
      onClose: () => { currentMenu = null; },
    });
  }

  segment.addEventListener('click', openMenu);

  // Subscribe to shell state for orchestrator service status
  const unsubscribe1 = shellState.onPath('orchestrator.services', render);
  onCleanup(unsubscribe1);

  // Note: We can't subscribe to editor.state.onPath because editor changes
  // The render() function reads from editorRef.current which is always current

  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// RUNTIME SEGMENT
// =============================================================================

function createRuntimeSegment({ shellState, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'runtime');

  let currentMenu = null;

  function render() {
    const python = shellState.get('runtimes.python');

    if (!python) {
      segment.innerHTML = `
        <span class="mrmd-statusbar__icon">🐍</span>
        <span class="mrmd-statusbar__secondary">No Python</span>
      `;
      segment.classList.add('mrmd-statusbar__segment--disabled');
      return;
    }

    segment.classList.remove('mrmd-statusbar__segment--disabled');

    const dotClass = python.status || 'stopped';
    const venvDisplay = python.venvName ? ` (${python.venvName})` : '';

    segment.innerHTML = `
      <span class="mrmd-statusbar__dot mrmd-statusbar__dot--${dotClass}"></span>
      <span class="mrmd-statusbar__icon">🐍</span>
      <span class="mrmd-statusbar__label">Python ${python.version || '?'}${venvDisplay}</span>
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const python = shellState.get('runtimes.python');
    if (!python) return;

    const items = [
      {
        type: 'header',
        label: `Python ${python.version || ''}`,
      },
      {
        type: 'info',
        label: 'Virtual Env',
        value: python.venvName || 'System',
      },
      {
        type: 'info',
        label: 'Working Dir',
        value: shortenPath(python.cwd),
      },
      { type: 'divider' },
      {
        icon: '📦',
        label: 'Change venv...',
        onClick: () => handlers.onChangeVenv?.(),
      },
      {
        icon: '📂',
        label: 'Set working dir...',
        onClick: () => handlers.onChangeCwd?.(),
      },
      { type: 'divider' },
      {
        icon: '🔄',
        label: 'Restart runtime',
        onClick: () => handlers.onRestartRuntime?.('python'),
      },
    ];

    currentMenu = createMenu({
      items,
      anchor: segment,
      position: 'bottom-right',
      onClose: () => { currentMenu = null; },
    });
  }

  segment.addEventListener('click', openMenu);

  // Subscribe to state changes
  const unsubscribe = shellState.onPath('runtimes.python', render);
  onCleanup(unsubscribe);
  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// HELPERS
// =============================================================================

function shortenPath(path, maxLength = 25) {
  if (!path) return '';
  if (path.length <= maxLength) return path;
  return '...' + path.slice(-(maxLength - 3));
}
