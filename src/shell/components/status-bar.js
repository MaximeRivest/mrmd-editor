/**
 * @fileoverview Status Bar Component
 *
 * The main status bar that displays file info, sync status, and runtime info.
 * Each segment is clickable and opens a context menu.
 */

import { createMenu } from './menu.js';
import { showFolderPicker } from '../dialogs/file-picker.js';

// =============================================================================
// STATUS BAR
// =============================================================================

/**
 * @typedef {Object} StatusBarOptions
 * @property {HTMLElement} container - Container element
 * @property {Object} editor - mrmd editor instance
 * @property {import('../state.js').ShellStateManager} shellState - Shell state manager
 * @property {import('../orchestrator-client.js').OrchestratorClient} orchestratorClient
 * @property {string[]} [segments=['files', 'sync', 'runtime']] - Segment types to display
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
    segments = ['files', 'sync', 'runtime'],
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
    case 'simple':
      return createSimpleSegment(context);
    case 'files':
      return createFilesSegment(context);
    // Legacy segments (kept for backward compat, prefer 'files')
    case 'file':
      return createFileSegment(context);
    case 'location':
      return createLocationSegment(context);
    case 'sync':
      return createSyncSegment(context);
    case 'runtime':
      return createRuntimeSegment(context);
    case 'runtimes':
      return createRuntimesSegment(context);
    case 'ai':
      return createAiSegment(context);
    case 'theme':
      return createThemeSegment(context);
    default:
      console.warn(`Unknown segment type: ${type}`);
      return null;
  }
}

// =============================================================================
// UNIFIED FILES SEGMENT
// =============================================================================

/**
 * Unified file segment - combines file listing with file operations.
 * This is the recommended segment for file management.
 */
function createFilesSegment({ shellState, orchestratorClient, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment mrmd-statusbar__segment--files';
  segment.setAttribute('data-segment', 'files');

  let currentMenu = null;
  let cachedFiles = [];
  let lastFetchTime = 0;
  const CACHE_TTL = 5000; // 5 seconds

  function render() {
    const file = shellState.get('file');
    const projectRoot = shellState.get('projectRoot');

    // Build display
    let fileName = 'No file';
    let pathDisplay = '';
    let dirtyIndicator = '';
    let isExternalFile = false;

    if (file) {
      fileName = file.name || 'untitled';
      dirtyIndicator = file.dirty ? ' •' : '';

      // Check if this is an external file (absolute path)
      if (file.path && file.path.startsWith('/')) {
        isExternalFile = true;
        // Show shortened directory path for external files
        const dir = file.path.split('/').slice(0, -1).join('/');
        pathDisplay = shortenPath(dir, 20) + '/';
      } else if (file.path && file.path.includes('/')) {
        // Show relative path if in a subdirectory
        const dir = file.path.split('/').slice(0, -1).join('/');
        pathDisplay = dir + '/';
      }
    }

    // Shorten project root for display (only show for project files)
    let projectDisplay = '';
    if (projectRoot && !isExternalFile) {
      projectDisplay = projectRoot;
      if (projectDisplay.length > 25) {
        projectDisplay = '...' + projectDisplay.slice(-22);
      }
    } else if (isExternalFile) {
      projectDisplay = '(external)';
    }

    segment.innerHTML = `
      <span class="mrmd-statusbar__icon">📄</span>
      <span class="mrmd-statusbar__label">${pathDisplay}${fileName}${dirtyIndicator}</span>
      <span class="mrmd-statusbar__secondary">${projectDisplay}</span>
      <span class="mrmd-statusbar__chevron">▾</span>
    `;

    if (!file) {
      segment.classList.add('mrmd-statusbar__segment--disabled');
    } else {
      segment.classList.remove('mrmd-statusbar__segment--disabled');
    }
  }

  async function fetchFiles() {
    const now = Date.now();
    if (now - lastFetchTime < CACHE_TTL && cachedFiles.length > 0) {
      return cachedFiles;
    }

    try {
      const result = await orchestratorClient.listFiles();
      cachedFiles = result.files || [];
      lastFetchTime = now;
      return cachedFiles;
    } catch (error) {
      console.error('Failed to list files:', error);
      return cachedFiles; // Return cached on error
    }
  }

  async function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const file = shellState.get('file');
    const projectRoot = shellState.get('projectRoot');
    const files = await fetchFiles();
    const currentPath = file?.path;

    const items = [];

    // Project files section
    if (files.length > 0) {
      items.push({
        type: 'header',
        label: 'Project Files',
      });

      // Filter to markdown files and sort
      const mdFiles = files
        .filter(f => f.type === 'file' && (f.name.endsWith('.md') || !f.name.includes('.')))
        .slice(0, 10); // Limit to 10 files

      for (const f of mdFiles) {
        const displayName = f.name.replace(/\.md$/, '');
        const isCurrent = f.path === currentPath;

        items.push({
          icon: isCurrent ? '●' : '○',
          label: displayName,
          active: isCurrent,
          onClick: () => handlers.onOpenFile?.(f.path),
        });
      }

      if (files.length > 10) {
        items.push({
          type: 'info',
          label: '',
          value: `+${files.length - 10} more files`,
        });
      }
    } else {
      items.push({
        type: 'info',
        label: 'No files',
        value: 'Create one below',
      });
    }

    // File actions section
    items.push({ type: 'divider' });

    items.push({
      icon: '📂',
      label: 'Browse...',
      onClick: () => handlers.onOpenFilePicker?.(),
    });

    items.push({
      icon: '➕',
      label: 'New File...',
      onClick: () => handlers.onNewFile?.(),
    });

    // Current file operations (only if file is open)
    if (file) {
      items.push({ type: 'divider' });

      items.push({
        icon: '✏️',
        label: 'Rename...',
        onClick: () => handlers.onRename?.(),
      });

      items.push({
        icon: '💾',
        label: 'Save As...',
        onClick: () => handlers.onSaveAs?.(),
      });
    }

    // Info section
    items.push({ type: 'divider' });

    if (file?.path) {
      items.push({
        type: 'info',
        label: 'File',
        value: file.path,
      });
    }

    if (projectRoot) {
      items.push({
        type: 'info',
        label: 'Project',
        value: shortenPath(projectRoot, 30),
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

  // Subscribe to state changes
  const unsubscribe1 = shellState.onPath('file', render);
  const unsubscribe2 = shellState.onPath('projectRoot', render);
  onCleanup(unsubscribe1);
  onCleanup(unsubscribe2);
  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// FILE SEGMENT (Legacy)
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

    const items = [];

    // File operations (always available)
    items.push(
      {
        icon: '📂',
        label: 'Open...',
        onClick: () => handlers.onOpenFilePicker?.(),
      },
      {
        icon: '➕',
        label: 'New File...',
        onClick: () => handlers.onNewFile?.(),
      },
    );

    // Current file operations (only if file is open)
    if (file) {
      items.push(
        { type: 'divider' },
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
      );
    }

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

function createRuntimeSegment({ shellState, orchestratorClient, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'runtime');

  let currentMenu = null;
  let cachedRuntimes = null;
  let cachedVenvs = null;

  function getCurrentDocName() {
    const file = shellState.get('file');
    return file?.name || 'untitled';
  }

  function getAttachedRuntime() {
    const docName = getCurrentDocName();
    // Get the runtime URL this doc is attached to
    const attachments = shellState.get('runtimes.attachments') || {};
    const runtimeId = attachments[docName] || 'shared';

    // Find the runtime info
    if (cachedRuntimes) {
      const allRuntimes = [
        cachedRuntimes.shared,
        ...(cachedRuntimes.dedicated || []),
      ].filter(Boolean);

      return allRuntimes.find(r => r.id === runtimeId) || cachedRuntimes.shared;
    }
    return null;
  }

  async function fetchRuntimes() {
    try {
      cachedRuntimes = await orchestratorClient.listRuntimes();
      return cachedRuntimes;
    } catch (error) {
      console.error('Failed to fetch runtimes:', error);
      return cachedRuntimes || { shared: null, dedicated: [] };
    }
  }

  async function fetchVenvs() {
    try {
      const result = await orchestratorClient.listVenvs();
      cachedVenvs = result.venvs || [];
      return cachedVenvs;
    } catch (error) {
      console.error('Failed to fetch venvs:', error);
      return cachedVenvs || [];
    }
  }

  function render() {
    const attached = getAttachedRuntime();
    const python = shellState.get('runtimes.python');

    if (!attached && !python) {
      segment.innerHTML = `
        <span class="mrmd-statusbar__icon">🐍</span>
        <span class="mrmd-statusbar__secondary">No Runtime</span>
        <span class="mrmd-statusbar__chevron">▾</span>
      `;
      segment.classList.add('mrmd-statusbar__segment--disabled');
      return;
    }

    segment.classList.remove('mrmd-statusbar__segment--disabled');

    const runtime = attached || {};
    const isAlive = runtime.alive !== false;
    const venvName = runtime.venv ? runtime.venv.split('/').pop() : 'System';
    const runtimeId = runtime.id || 'shared';
    const isShared = runtimeId === 'shared';

    const dotClass = isAlive ? 'connected' : 'disconnected';
    const badge = isShared ? '' : `<span class="mrmd-statusbar__badge">${runtimeId}</span>`;

    segment.innerHTML = `
      <span class="mrmd-statusbar__dot mrmd-statusbar__dot--${dotClass}"></span>
      <span class="mrmd-statusbar__icon">🐍</span>
      <span class="mrmd-statusbar__label">${venvName}</span>
      ${badge}
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  async function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    // Fetch fresh data
    const [runtimes, venvs] = await Promise.all([fetchRuntimes(), fetchVenvs()]);
    const docName = getCurrentDocName();
    const attachments = shellState.get('runtimes.attachments') || {};
    const currentRuntimeId = attachments[docName] || 'shared';

    const items = [];

    // Header
    items.push({
      type: 'header',
      label: `Runtime for "${docName}"`,
    });

    // Available runtimes section
    const allRuntimes = [
      runtimes.shared ? { ...runtimes.shared, id: 'shared' } : null,
      ...(runtimes.dedicated || []),
    ].filter(Boolean);

    if (allRuntimes.length > 0) {
      items.push({
        type: 'header',
        label: 'Available Runtimes',
      });

      for (const rt of allRuntimes) {
        const isCurrent = rt.id === currentRuntimeId;
        const venvName = rt.venv ? rt.venv.split('/').pop() : 'System';
        const statusIcon = rt.alive ? '●' : '○';
        const label = rt.id === 'shared'
          ? `Shared (${venvName})`
          : `${rt.id} (${venvName})`;

        items.push({
          icon: isCurrent ? '✓' : statusIcon,
          label,
          active: isCurrent,
          onClick: () => {
            // Attach this document to the selected runtime
            shellState.attachDocument(docName, rt.id);
            // Store the runtime URL for execution
            shellState._set(`runtimes.sessions.${rt.id}`, {
              id: rt.id,
              url: rt.url,
              venv: rt.venv,
              alive: rt.alive,
            });
            handlers.onRuntimeAttached?.(docName, rt.id, rt.url);
            render();
          },
        });
      }
    } else {
      items.push({
        type: 'info',
        label: 'No runtimes',
        value: 'Start one below',
      });
    }

    // Start new runtime section
    items.push({ type: 'divider' });
    items.push({
      type: 'header',
      label: 'Start New Runtime',
    });

    // Show available venvs to start
    for (const venv of venvs) {
      // Skip if already running
      const isRunning = allRuntimes.some(r => r.venv === venv.path);
      if (isRunning) continue;

      items.push({
        icon: '▶',
        label: `${venv.name} (${venv.version})`,
        onClick: async () => {
          try {
            const result = await orchestratorClient.startRuntime({
              venv: venv.path,
            });
            if (result.success) {
              // Attach this doc to the new runtime
              const newRuntime = result.runtime;
              shellState.attachDocument(docName, newRuntime.id);
              shellState._set(`runtimes.sessions.${newRuntime.id}`, {
                id: newRuntime.id,
                url: newRuntime.url,
                venv: newRuntime.venv,
                alive: true,
              });
              handlers.onRuntimeAttached?.(docName, newRuntime.id, newRuntime.url);
            }
            // Refresh display
            cachedRuntimes = null;
            render();
          } catch (err) {
            console.error('Failed to start runtime:', err);
          }
        },
      });
    }

    // Current runtime info and actions
    const currentRuntime = allRuntimes.find(r => r.id === currentRuntimeId);
    if (currentRuntime) {
      items.push({ type: 'divider' });
      items.push({
        type: 'header',
        label: 'Current Runtime',
      });

      items.push({
        type: 'info',
        label: 'ID',
        value: currentRuntime.id,
      });
      items.push({
        type: 'info',
        label: 'Port',
        value: String(currentRuntime.port || 'N/A'),
      });
      if (currentRuntime.pid) {
        items.push({
          type: 'info',
          label: 'PID',
          value: String(currentRuntime.pid),
        });
      }
      items.push({
        type: 'info',
        label: 'Venv',
        value: currentRuntime.venv || 'System Python',
      });

      items.push({ type: 'divider' });
      items.push({
        icon: '💀',
        label: 'Kill runtime',
        onClick: async () => {
          await handlers.onKillRuntime?.(currentRuntime.id);
          cachedRuntimes = null;
          render();
        },
      });
    }

    // Refresh action
    items.push({ type: 'divider' });
    items.push({
      icon: '🔄',
      label: 'Refresh',
      onClick: async () => {
        cachedRuntimes = null;
        cachedVenvs = null;
        await fetchRuntimes();
        render();
      },
    });

    currentMenu = createMenu({
      items,
      anchor: segment,
      position: 'bottom-right',
      onClose: () => { currentMenu = null; },
    });
  }

  segment.addEventListener('click', openMenu);

  // Initial fetch
  fetchRuntimes().then(render);

  // Subscribe to state changes
  const unsubscribe1 = shellState.onPath('runtimes', render);
  const unsubscribe2 = shellState.onPath('file', render);
  onCleanup(unsubscribe1);
  onCleanup(unsubscribe2);
  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// AI SEGMENT
// =============================================================================

const JUICE_NAMES = ['Quick', 'Balanced', 'Deep', 'Maximum', 'Ultimate'];

function createAiSegment({ shellState, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'ai');

  let currentMenu = null;

  function render() {
    const ai = shellState.get('ai');

    if (!ai || !ai.running) {
      segment.innerHTML = `
        <span class="mrmd-statusbar__icon">✦</span>
        <span class="mrmd-statusbar__secondary">AI Offline</span>
      `;
      segment.classList.add('mrmd-statusbar__segment--disabled');
      return;
    }

    segment.classList.remove('mrmd-statusbar__segment--disabled');

    const juiceName = JUICE_NAMES[ai.juiceLevel || 0] || 'Quick';
    const activeClass = ai.active ? 'mrmd-statusbar__segment--active' : '';

    segment.className = `mrmd-statusbar__segment ${activeClass}`;
    segment.innerHTML = `
      <span class="mrmd-statusbar__dot mrmd-statusbar__dot--connected"></span>
      <span class="mrmd-statusbar__icon">✦</span>
      <span class="mrmd-statusbar__label">AI</span>
      <span class="mrmd-statusbar__badge">${juiceName}</span>
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const ai = shellState.get('ai') || {};

    const items = [
      {
        type: 'header',
        label: 'AI Assistant',
      },
      {
        type: 'info',
        label: 'Status',
        value: ai.running ? 'Running' : 'Offline',
      },
      { type: 'divider' },
      {
        icon: '⚡',
        label: 'Quick (Fastest)',
        selected: ai.juiceLevel === 0,
        onClick: () => handlers.onSetJuiceLevel?.(0),
      },
      {
        icon: '⚖️',
        label: 'Balanced',
        selected: ai.juiceLevel === 1,
        onClick: () => handlers.onSetJuiceLevel?.(1),
      },
      {
        icon: '🔍',
        label: 'Deep',
        selected: ai.juiceLevel === 2,
        onClick: () => handlers.onSetJuiceLevel?.(2),
      },
      {
        icon: '💪',
        label: 'Maximum',
        selected: ai.juiceLevel === 3,
        onClick: () => handlers.onSetJuiceLevel?.(3),
      },
      {
        icon: '🚀',
        label: 'Ultimate (Multi-Model)',
        selected: ai.juiceLevel === 4,
        onClick: () => handlers.onSetJuiceLevel?.(4),
      },
      { type: 'divider' },
      {
        icon: '📝',
        label: 'Continue Document',
        onClick: () => handlers.onContinueDocument?.(),
        description: 'AI writes at the end of document',
      },
      {
        icon: '📋',
        label: 'Summarize Document',
        onClick: () => handlers.onSummarizeDocument?.(),
      },
      {
        icon: '📛',
        label: 'Suggest Filename',
        onClick: () => handlers.onSuggestFilename?.(),
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
  const unsubscribe = shellState.onPath('ai', render);
  onCleanup(unsubscribe);
  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// THEME SEGMENT
// =============================================================================

// Known dark themes for proper icon display
const DARK_THEMES = new Set([
  'midnight', 'moonlight', 'github', 'nord', 'nord-outputs',
  'grayscale-dark',
]);

// Custom themes storage key
const CUSTOM_THEMES_KEY = 'mrmd-custom-themes';

/**
 * Load custom themes from localStorage
 * @returns {Object[]} Array of custom theme objects
 */
function loadCustomThemes() {
  try {
    const stored = localStorage.getItem(CUSTOM_THEMES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('Failed to load custom themes:', e);
    return [];
  }
}

/**
 * Save custom themes to localStorage
 * @param {Object[]} themes
 */
function saveCustomThemes(themes) {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  } catch (e) {
    console.warn('Failed to save custom themes:', e);
  }
}

/**
 * Register custom themes with the theme system
 * @param {Object} editorRef - Reference to the editor
 */
function registerCustomThemesFromStorage(editorRef) {
  const customThemes = loadCustomThemes();
  const editor = editorRef?.current;

  if (editor?.widgets?.registerTheme) {
    for (const theme of customThemes) {
      try {
        editor.widgets.registerTheme(theme);
      } catch (e) {
        console.warn(`Failed to register custom theme "${theme.name}":`, e);
      }
    }
  }
}

/**
 * Validate a theme object has required properties
 * @param {Object} theme
 * @returns {{valid: boolean, error?: string}}
 */
function validateTheme(theme) {
  if (!theme || typeof theme !== 'object') {
    return { valid: false, error: 'Theme must be an object' };
  }
  if (!theme.name || typeof theme.name !== 'string') {
    return { valid: false, error: 'Theme must have a "name" property (string)' };
  }
  if (theme.name.length > 50) {
    return { valid: false, error: 'Theme name must be 50 characters or less' };
  }
  // Check for at least some CSS variables
  const cssVars = Object.keys(theme).filter(k => k.startsWith('--'));
  if (cssVars.length === 0) {
    return { valid: false, error: 'Theme must have at least one CSS variable (--property)' };
  }
  return { valid: true };
}

function createThemeSegment({ editorRef, shellState, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'theme');

  let currentMenu = null;
  let currentTheme = null;

  // Register any stored custom themes on init
  registerCustomThemesFromStorage(editorRef);

  function getThemeName() {
    const editor = editorRef.current;
    // Try to get theme from editor config
    if (editor?.config?.appearance?.theme) {
      return editor.config.appearance.theme;
    }
    // Fall back to shell state
    return shellState.get('theme') || 'auto';
  }

  function getAvailableThemes() {
    const editor = editorRef.current;
    if (editor?.getThemeNames) {
      return editor.getThemeNames();
    }
    // Fallback to known themes
    return ['midnight', 'daylight', 'moonlight', 'github', 'nord', 'nord-outputs'];
  }

  function getCustomThemeNames() {
    return loadCustomThemes().map(t => t.name);
  }

  function isDarkTheme(themeName) {
    // Check known dark themes
    if (DARK_THEMES.has(themeName)) return true;
    // Check custom themes
    const customThemes = loadCustomThemes();
    const custom = customThemes.find(t => t.name === themeName);
    if (custom) return custom.isDark === true;
    // Check theme name patterns
    return themeName.includes('dark') || themeName.includes('night');
  }

  function render() {
    currentTheme = getThemeName();
    const displayName = currentTheme === 'auto' ? 'Auto' : currentTheme;

    segment.innerHTML = `
      <span class="mrmd-statusbar__icon">🎨</span>
      <span class="mrmd-statusbar__label">${displayName}</span>
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  function handleImportTheme() {
    // Create a hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const theme = JSON.parse(text);

        // Validate the theme
        const validation = validateTheme(theme);
        if (!validation.valid) {
          alert(`Invalid theme: ${validation.error}`);
          return;
        }

        // Check for name conflicts with built-in themes
        const builtInThemes = ['midnight', 'daylight', 'moonlight', 'github', 'nord', 'nord-outputs', 'grayscale-dark', 'grayscale-light', 'openresponses'];
        if (builtInThemes.includes(theme.name)) {
          alert(`Cannot use reserved theme name "${theme.name}". Please rename your theme.`);
          return;
        }

        // Register with the editor
        const editor = editorRef.current;
        if (editor?.widgets?.registerTheme) {
          editor.widgets.registerTheme(theme);
        }

        // Save to localStorage (replace if exists)
        const customThemes = loadCustomThemes();
        const existingIndex = customThemes.findIndex(t => t.name === theme.name);
        if (existingIndex >= 0) {
          customThemes[existingIndex] = theme;
        } else {
          customThemes.push(theme);
        }
        saveCustomThemes(customThemes);

        // Apply the new theme
        handlers.onSetTheme?.(theme.name);
        render();

        alert(`Theme "${theme.name}" imported successfully!`);
      } catch (err) {
        console.error('Failed to import theme:', err);
        alert(`Failed to import theme: ${err.message}\n\nMake sure the file is valid JSON.`);
      }

      input.remove();
    };

    document.body.appendChild(input);
    input.click();
  }

  function handleDeleteCustomTheme(themeName) {
    if (!confirm(`Delete custom theme "${themeName}"?`)) {
      return;
    }

    // Remove from localStorage
    const customThemes = loadCustomThemes();
    const filtered = customThemes.filter(t => t.name !== themeName);
    saveCustomThemes(filtered);

    // If current theme was deleted, switch to auto
    if (getThemeName() === themeName) {
      handlers.onSetTheme?.(null);
    }

    render();
    currentMenu?.close();
    currentMenu = null;
  }

  function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const themes = getAvailableThemes();
    const customThemeNames = getCustomThemeNames();
    currentTheme = getThemeName();

    const items = [
      {
        type: 'header',
        label: 'Theme',
      },
      {
        icon: '🌗',
        label: 'Auto (System)',
        selected: currentTheme === 'auto' || currentTheme === null,
        onClick: () => {
          handlers.onSetTheme?.(null);
          render();
        },
      },
      { type: 'divider' },
    ];

    // Group themes: Light, Dark, Custom
    const lightThemes = themes.filter(t => !isDarkTheme(t) && !customThemeNames.includes(t));
    const darkThemes = themes.filter(t => isDarkTheme(t) && !customThemeNames.includes(t));
    const customThemes = themes.filter(t => customThemeNames.includes(t));

    // Light themes
    if (lightThemes.length > 0) {
      items.push({ type: 'header', label: 'Light' });
      for (const theme of lightThemes) {
        items.push({
          icon: '☀️',
          label: theme.charAt(0).toUpperCase() + theme.slice(1).replace(/-/g, ' '),
          selected: currentTheme === theme,
          onClick: () => {
            handlers.onSetTheme?.(theme);
            render();
          },
        });
      }
    }

    // Dark themes
    if (darkThemes.length > 0) {
      items.push({ type: 'header', label: 'Dark' });
      for (const theme of darkThemes) {
        items.push({
          icon: '🌙',
          label: theme.charAt(0).toUpperCase() + theme.slice(1).replace(/-/g, ' '),
          selected: currentTheme === theme,
          onClick: () => {
            handlers.onSetTheme?.(theme);
            render();
          },
        });
      }
    }

    // Custom themes
    if (customThemes.length > 0) {
      items.push({ type: 'divider' });
      items.push({ type: 'header', label: 'Custom Themes' });
      for (const theme of customThemes) {
        const icon = isDarkTheme(theme) ? '🌙' : '☀️';
        items.push({
          icon,
          label: theme.charAt(0).toUpperCase() + theme.slice(1).replace(/-/g, ' '),
          selected: currentTheme === theme,
          onClick: () => {
            handlers.onSetTheme?.(theme);
            render();
          },
        });
        // Add delete option for custom themes
        items.push({
          icon: '🗑️',
          label: `Delete "${theme}"`,
          onClick: () => handleDeleteCustomTheme(theme),
        });
      }
    }

    // Import theme option
    items.push({ type: 'divider' });
    items.push({
      icon: '📥',
      label: 'Import Theme...',
      description: 'Load a JSON theme file',
      onClick: () => {
        currentMenu?.close();
        currentMenu = null;
        handleImportTheme();
      },
    });

    currentMenu = createMenu({
      items,
      anchor: segment,
      position: 'bottom-right',
      onClose: () => { currentMenu = null; },
    });
  }

  segment.addEventListener('click', openMenu);

  // Subscribe to theme changes in shell state
  const unsubscribe = shellState.onPath('theme', render);
  onCleanup(unsubscribe);
  onCleanup(() => currentMenu?.close());

  render();
  return segment;
}

// =============================================================================
// RUNTIMES SEGMENT (Project-wide runtime management)
// =============================================================================

function createRuntimesSegment({ shellState, orchestratorClient, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment mrmd-statusbar__segment--runtimes';
  segment.setAttribute('data-segment', 'runtimes');

  let currentMenu = null;
  let cachedRuntimes = null;
  let lastFetchTime = 0;
  const CACHE_TTL = 3000; // 3 seconds

  async function fetchRuntimes() {
    const now = Date.now();
    if (now - lastFetchTime < CACHE_TTL && cachedRuntimes) {
      return cachedRuntimes;
    }

    try {
      cachedRuntimes = await orchestratorClient.listRuntimes();
      lastFetchTime = now;
      return cachedRuntimes;
    } catch (error) {
      console.error('Failed to list runtimes:', error);
      return cachedRuntimes || { shared: null, dedicated: [], sessions: [], project: {} };
    }
  }

  function render() {
    const python = shellState.get('runtimes.python');
    const project = shellState.get('project') || {};

    // Count active runtimes
    let runtimeCount = 0;
    if (python?.running || python?.status === 'ready') runtimeCount++;

    const sessions = shellState.getRuntimes();
    const dedicatedCount = sessions.filter(s => s.info?.dedicated).length;
    runtimeCount += dedicatedCount;

    // Project name
    const projectName = project.name || 'mrmd';

    // Status dot
    const hasActiveRuntime = runtimeCount > 0;
    const dotClass = hasActiveRuntime ? 'connected' : 'disconnected';

    segment.innerHTML = `
      <span class="mrmd-statusbar__dot mrmd-statusbar__dot--${dotClass}"></span>
      <span class="mrmd-statusbar__icon">⚡</span>
      <span class="mrmd-statusbar__label">${projectName}</span>
      ${runtimeCount > 0 ? `<span class="mrmd-statusbar__badge">${runtimeCount} runtime${runtimeCount > 1 ? 's' : ''}</span>` : ''}
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  async function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const runtimes = await fetchRuntimes();
    const items = [];

    // Project section
    const project = runtimes.project || {};
    items.push({
      type: 'header',
      label: 'Project',
    });
    items.push({
      type: 'info',
      label: 'Name',
      value: project.name || 'unknown',
    });
    items.push({
      type: 'info',
      label: 'Root',
      value: shortenPath(project.root, 35),
    });
    if (project.venv) {
      items.push({
        type: 'info',
        label: 'Venv',
        value: shortenPath(project.venv, 35),
      });
    }

    // Get current doc attachment info
    const currentDocName = shellState.get('file')?.name || 'untitled';
    const attachments = shellState.get('runtimes.attachments') || {};
    const currentAttachedId = attachments[currentDocName] || 'shared';
    const isAttachedToShared = currentAttachedId === 'shared';

    // Shared Runtime section
    items.push({ type: 'divider' });
    items.push({
      type: 'header',
      label: 'Shared Runtime',
    });

    if (runtimes.shared && runtimes.shared.alive) {
      const venvPath = runtimes.shared.venv || 'System Python';
      items.push({
        icon: isAttachedToShared ? '✓' : '●',
        label: shortenPath(venvPath, 40),
        description: `port ${runtimes.shared.port || '?'}`,
        active: isAttachedToShared,
        onClick: () => {
          // Attach current document to shared runtime
          shellState.attachDocument(currentDocName, 'shared');
          shellState._set('runtimes.sessions.shared', {
            id: 'shared',
            url: runtimes.shared.url,
            venv: runtimes.shared.venv,
            alive: runtimes.shared.alive,
          });
          handlers.onRuntimeAttached?.(currentDocName, 'shared', runtimes.shared.url);
          render();
        },
      });
      items.push({
        icon: '💀',
        label: 'Kill shared runtime',
        description: 'Release memory, restarts on next exec',
        onClick: async () => {
          await handlers.onKillRuntime?.('shared');
          // Refresh after a moment
          setTimeout(render, 500);
        },
      });
    } else {
      items.push({
        type: 'info',
        label: 'Status',
        value: '○ Not running',
      });
      items.push({
        type: 'info',
        label: '',
        value: 'Starts on first code execution',
      });
    }

    // Dedicated Runtimes section
    if (runtimes.dedicated && runtimes.dedicated.length > 0) {
      items.push({ type: 'divider' });
      items.push({
        type: 'header',
        label: `Dedicated Runtimes (${runtimes.dedicated.length})`,
      });

      for (const rt of runtimes.dedicated) {
        const statusIcon = rt.alive ? '●' : '○';
        const isAttached = rt.id === currentAttachedId;
        // Show full venv path for clarity
        const venvPath = rt.venv || 'unknown';
        items.push({
          icon: isAttached ? '✓' : statusIcon,
          label: shortenPath(venvPath, 40),
          description: `port ${rt.port || '?'}`,
          active: isAttached,
          onClick: rt.alive ? () => {
            // Attach current document to this runtime
            shellState.attachDocument(currentDocName, rt.id);
            shellState._set(`runtimes.sessions.${rt.id}`, {
              id: rt.id,
              url: rt.url,
              venv: rt.venv,
              alive: rt.alive,
            });
            handlers.onRuntimeAttached?.(currentDocName, rt.id, rt.url);
            render();
          } : undefined,
        });
        // Individual kill button for this runtime
        if (rt.alive) {
          items.push({
            icon: '💀',
            label: `Kill this runtime`,
            description: `PID ${rt.pid || '?'}`,
            onClick: async () => {
              await handlers.onKillRuntime?.(rt.id);
              setTimeout(render, 500);
            },
          });
        }
      }
    }

    // Start New Runtime section
    items.push({ type: 'divider' });
    items.push({
      type: 'header',
      label: 'Start New Runtime',
    });

    // Fetch available venvs
    let venvs = [];
    try {
      const result = await orchestratorClient.listVenvs();
      venvs = result.venvs || [];
    } catch (e) {
      console.warn('Failed to fetch venvs:', e);
    }

    // Get all running runtimes to check which venvs are already running
    const allRuntimes = [
      runtimes.shared,
      ...(runtimes.dedicated || []),
    ].filter(Boolean);

    // Show available venvs that aren't already running
    let hasAvailableVenvs = false;
    for (const venv of venvs) {
      const isRunning = allRuntimes.some(r => r.venv === venv.path);
      if (isRunning) continue;

      hasAvailableVenvs = true;
      items.push({
        icon: '▶',
        label: `${venv.name} (${venv.version})`,
        onClick: async () => {
          try {
            await orchestratorClient.startRuntime({ venv: venv.path });
            // Refresh
            cachedRuntimes = null;
            lastFetchTime = 0;
            render();
          } catch (err) {
            console.error('Failed to start runtime:', err);
          }
        },
      });
    }

    if (!hasAvailableVenvs) {
      items.push({
        type: 'info',
        label: 'All detected venvs',
        value: 'already running',
      });
    }

    // Browse for custom venv
    items.push({
      icon: '📂',
      label: 'Browse for venv...',
      onClick: () => {
        // Close the menu first
        currentMenu?.close();
        currentMenu = null;

        showFolderPicker({
          title: 'Select Virtual Environment',
          orchestratorClient,
          initialPath: runtimes.project?.root || '~',
          showHidden: true, // Show .venv folders
          onSelect: async (venvPath) => {
            try {
              // Start a new runtime with this venv
              const result = await orchestratorClient.startRuntime({ venv: venvPath });
              if (result.success) {
                console.log('Started new runtime:', result.runtime);
                // Refresh the display
                cachedRuntimes = null;
                lastFetchTime = 0;
                render();
              }
            } catch (err) {
              console.error('Failed to start runtime:', err);
              alert(`Failed to start runtime: ${err.message}`);
            }
          },
        });
      },
    });

    // Sessions section
    if (runtimes.sessions && runtimes.sessions.length > 0) {
      items.push({ type: 'divider' });
      items.push({
        type: 'header',
        label: `Active Runtime Attachments (${runtimes.sessions.length})`,
      });

      for (const session of runtimes.sessions) {
        if (!session) continue;
        // Get attached runtime for this session's doc
        const docAttachment = attachments[session.doc] || 'shared';
        const attachedRuntime = docAttachment === 'shared'
          ? runtimes.shared
          : runtimes.dedicated?.find(r => r.id === docAttachment);
        const runtimeLabel = attachedRuntime?.venv
          ? attachedRuntime.venv.split('/').slice(-2).join('/')
          : docAttachment;

        items.push({
          icon: '📄',
          label: session.doc,
          description: runtimeLabel,
        });
        items.push({
          icon: '✖',
          label: `Detach runtime from "${session.doc}"`,
          description: 'Stops monitor',
          onClick: async () => {
            try {
              await orchestratorClient.destroyRuntimeAttachment(session.doc);
              cachedRuntimes = null;
              lastFetchTime = 0;
              render();
            } catch (err) {
              console.error('Failed to detach runtime attachment:', err);
            }
          },
        });
      }
    }

    // Actions section
    items.push({ type: 'divider' });
    items.push({
      icon: '🔄',
      label: 'Refresh',
      onClick: async () => {
        cachedRuntimes = null;
        lastFetchTime = 0;
        await shellState.refresh();
        render();
      },
    });

    currentMenu = createMenu({
      items,
      anchor: segment,
      position: 'bottom-right',
      onClose: () => { currentMenu = null; },
    });
  }

  segment.addEventListener('click', openMenu);

  // Subscribe to state changes
  const unsubscribe1 = shellState.onPath('runtimes', render);
  const unsubscribe2 = shellState.onPath('project', render);
  const unsubscribe3 = shellState.onPath('orchestrator.services', render);
  onCleanup(unsubscribe1);
  onCleanup(unsubscribe2);
  onCleanup(unsubscribe3);
  onCleanup(() => currentMenu?.close());

  // Initial fetch of project info
  orchestratorClient.getProject().then(project => {
    shellState._set('project', project);
  }).catch(() => {});

  render();
  return segment;
}

// =============================================================================
// SIMPLE SEGMENT - Filename + Runtime Dot
// =============================================================================

/**
 * Simplified status bar: just filename on left, runtime dot on right.
 * Clicking the dot opens a two-section menu:
 * 1. Running runtimes (attach or kill)
 * 2. Available venvs (start new runtime)
 */
function createSimpleSegment({ shellState, orchestratorClient, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment mrmd-statusbar__segment--simple';
  segment.setAttribute('data-segment', 'simple');
  segment.style.cssText = 'display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 12px;';

  let currentMenu = null;
  let runtimeState = 'disconnected'; // 'connected', 'disconnected', 'error'

  function render() {
    const file = shellState.get('file');
    const filename = file?.name || 'untitled';
    const attachments = shellState.get('runtimes.attachments') || {};
    const attachedRuntimeId = attachments[filename] || 'shared';

    // Determine dot state
    const sessions = shellState.get('runtimes.sessions') || {};
    const attachedRuntime = sessions[attachedRuntimeId];

    if (attachedRuntime?.alive) {
      runtimeState = 'connected';
    } else if (runtimeState === 'error') {
      // Keep error state until user interacts
    } else {
      runtimeState = 'disconnected';
    }

    const dotColors = {
      connected: '#4ade80',     // Green
      disconnected: '#6b7280', // Gray
      error: '#ef4444',        // Red
    };
    const dotColor = dotColors[runtimeState];
    const dotTitle = {
      connected: 'Runtime connected - click to manage',
      disconnected: 'No runtime - click to select venv',
      error: 'No venv selected - click to pick one',
    }[runtimeState];

    segment.innerHTML = `
      <span class="mrmd-statusbar__filename" style="font-weight: 500;">${filename}</span>
      <span class="mrmd-statusbar__runtime-dot"
            style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; cursor: pointer; ${runtimeState === 'error' ? 'animation: blink 1s infinite;' : ''}"
            title="${dotTitle}"></span>
    `;

    // Add blink animation if needed
    if (runtimeState === 'error' && !document.getElementById('mrmd-blink-style')) {
      const style = document.createElement('style');
      style.id = 'mrmd-blink-style';
      style.textContent = '@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.3; } }';
      document.head.appendChild(style);
    }
  }

  async function openMenu(e) {
    // Only open menu when clicking the dot
    if (!e.target.classList.contains('mrmd-statusbar__runtime-dot')) {
      return;
    }

    if (currentMenu) {
      currentMenu.close();
      currentMenu = null;
      return;
    }

    const items = [];
    const file = shellState.get('file');
    const filename = file?.name || 'untitled';
    const attachments = shellState.get('runtimes.attachments') || {};
    const currentAttachedId = attachments[filename] || 'shared';

    // Fetch runtimes and venvs
    let runtimes = [];
    let venvs = [];
    try {
      const [runtimesResult, venvResult] = await Promise.all([
        orchestratorClient.listRuntimes(),
        orchestratorClient.listVenvs(),
      ]);

      // Combine shared and dedicated runtimes
      if (runtimesResult.shared) {
        runtimes.push({ ...runtimesResult.shared, id: 'shared' });
      }
      if (runtimesResult.dedicated) {
        runtimes.push(...runtimesResult.dedicated);
      }
      venvs = venvResult.venvs || [];
    } catch (err) {
      console.error('Failed to fetch runtimes/venvs:', err);
    }

    // Section 1: Running Runtimes
    items.push({
      type: 'header',
      label: 'Running Runtimes',
    });

    const aliveRuntimes = runtimes.filter(r => r.alive);
    if (aliveRuntimes.length === 0) {
      items.push({
        type: 'info',
        label: 'No runtimes running',
        value: 'Start one below',
      });
    } else {
      for (const rt of aliveRuntimes) {
        const isAttached = rt.id === currentAttachedId;
        const venvPath = rt.venv || 'System Python';
        const shortPath = venvPath.split('/').slice(-2).join('/');

        items.push({
          icon: isAttached ? '✓' : '●',
          label: shortPath,
          description: `port ${rt.port}`,
          active: isAttached,
          onClick: () => {
            // Attach to this runtime
            shellState.attachDocument(filename, rt.id);
            shellState._set(`runtimes.sessions.${rt.id}`, {
              id: rt.id,
              url: rt.url,
              venv: rt.venv,
              alive: rt.alive,
            });
            runtimeState = 'connected';
            handlers.onRuntimeAttached?.(filename, rt.id, rt.url);
            render();
          },
        });

        // Kill button for this runtime
        items.push({
          icon: '×',
          label: `Stop ${rt.id === 'shared' ? 'shared' : 'this'} runtime`,
          onClick: async () => {
            try {
              await orchestratorClient.killRuntime(rt.id);
              currentMenu?.close();
              currentMenu = null;
              render();
            } catch (err) {
              console.error('Failed to kill runtime:', err);
            }
          },
        });
      }
    }

    // Section 2: Available Venvs
    items.push({ type: 'divider' });
    items.push({
      type: 'header',
      label: 'Start New Runtime',
    });

    // Filter out venvs that already have running runtimes
    const runningVenvPaths = new Set(aliveRuntimes.map(r => r.venv).filter(Boolean));
    const availableVenvs = venvs.filter(v => !runningVenvPaths.has(v.path));

    if (availableVenvs.length === 0 && venvs.length > 0) {
      items.push({
        type: 'info',
        label: 'All venvs already running',
      });
    } else if (venvs.length === 0) {
      items.push({
        type: 'info',
        label: 'No venvs found',
        value: 'Browse to add one',
      });
    } else {
      for (const venv of availableVenvs.slice(0, 5)) { // Show max 5
        const shortPath = venv.path ? venv.path.split('/').slice(-2).join('/') : venv.name;
        items.push({
          icon: '▶',
          label: shortPath,
          description: `Python ${venv.version}`,
          onClick: async () => {
            try {
              const result = await orchestratorClient.startRuntime({ venv: venv.path });
              if (result.success) {
                // Auto-attach to new runtime
                const newRuntime = result.runtime;
                shellState.attachDocument(filename, newRuntime.id);
                shellState._set(`runtimes.sessions.${newRuntime.id}`, {
                  id: newRuntime.id,
                  url: newRuntime.url,
                  venv: newRuntime.venv,
                  alive: true,
                });
                runtimeState = 'connected';
                handlers.onRuntimeAttached?.(filename, newRuntime.id, newRuntime.url);
              }
              currentMenu?.close();
              currentMenu = null;
              render();
            } catch (err) {
              console.error('Failed to start runtime:', err);
            }
          },
        });
      }
    }

    // Search for more venvs
    items.push({
      icon: '🔍',
      label: 'Search for more venvs...',
      onClick: async () => {
        currentMenu?.close();
        currentMenu = null;

        // Show loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--mrmd-bg-secondary, #1e1e1e); padding: 20px; border-radius: 8px; z-index: 10000;';
        loadingDiv.textContent = 'Searching for venvs...';
        document.body.appendChild(loadingDiv);

        try {
          const result = await orchestratorClient.searchVenvs();
          loadingDiv.remove();

          if (result.count > 0) {
            alert(`Found ${result.count} venvs. Click the dot again to see them.`);
          } else {
            alert('No additional venvs found.');
          }
        } catch (err) {
          loadingDiv.remove();
          console.error('Search failed:', err);
          alert(`Search failed: ${err.message}`);
        }
      },
    });

    // Browse option
    items.push({
      icon: '📂',
      label: 'Browse for venv...',
      onClick: () => {
        currentMenu?.close();
        currentMenu = null;

        showFolderPicker({
          title: 'Select Virtual Environment',
          orchestratorClient,
          initialPath: file?.root || '~',
          showHidden: true,
          onSelect: async (venvPath) => {
            try {
              const result = await orchestratorClient.startRuntime({ venv: venvPath });
              if (result.success) {
                const newRuntime = result.runtime;
                shellState.attachDocument(filename, newRuntime.id);
                shellState._set(`runtimes.sessions.${newRuntime.id}`, {
                  id: newRuntime.id,
                  url: newRuntime.url,
                  venv: newRuntime.venv,
                  alive: true,
                });
                runtimeState = 'connected';
                handlers.onRuntimeAttached?.(filename, newRuntime.id, newRuntime.url);
                render();
              }
            } catch (err) {
              console.error('Failed to start runtime:', err);
              alert(`Failed to start runtime: ${err.message}`);
            }
          },
        });
      },
    });

    currentMenu = createMenu({
      items,
      anchor: segment.querySelector('.mrmd-statusbar__runtime-dot'),
      position: 'top-right',
      onClose: () => { currentMenu = null; },
    });
  }

  // Set error state when Python execution fails without venv
  function setErrorState() {
    runtimeState = 'error';
    render();
  }

  segment.addEventListener('click', openMenu);

  // Subscribe to state changes
  const unsubscribe1 = shellState.onPath('file', render);
  const unsubscribe2 = shellState.onPath('runtimes', render);
  onCleanup(unsubscribe1);
  onCleanup(unsubscribe2);
  onCleanup(() => currentMenu?.close());

  // Expose setErrorState for external use
  segment.setErrorState = setErrorState;

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
