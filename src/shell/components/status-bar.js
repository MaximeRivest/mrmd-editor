/**
 * @fileoverview Status Bar Component
 *
 * The main status bar that displays file info, sync status, and runtime info.
 * Each segment is clickable and opens a context menu.
 */

import { createMenu } from './menu.js';

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

function createRuntimeSegment({ shellState, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'runtime');

  let currentMenu = null;

  function getCurrentDocName() {
    const file = shellState.get('file');
    return file?.name || 'untitled';
  }

  function getCurrentSession() {
    const docName = getCurrentDocName();
    const sessionId = shellState.getDocumentSession(docName);
    const session = shellState.getSession(sessionId);
    return { sessionId, session };
  }

  function render() {
    const python = shellState.get('runtimes.python');
    const { sessionId, session } = getCurrentSession();

    if (!python && !session) {
      segment.innerHTML = `
        <span class="mrmd-statusbar__icon">🐍</span>
        <span class="mrmd-statusbar__secondary">No Python</span>
      `;
      segment.classList.add('mrmd-statusbar__segment--disabled');
      return;
    }

    segment.classList.remove('mrmd-statusbar__segment--disabled');

    // Use session info if available, otherwise fall back to legacy python info
    const status = session?.status || python?.status || 'stopped';
    const version = python?.version || '?';
    const venvName = python?.venvName;
    const isDedicated = session?.dedicated;

    const dotClass = status === 'ready' ? 'connected' : status;
    const venvDisplay = venvName ? ` (${venvName})` : '';
    const sessionBadge = isDedicated ? '<span class="mrmd-statusbar__badge">dedicated</span>' : '';

    segment.innerHTML = `
      <span class="mrmd-statusbar__dot mrmd-statusbar__dot--${dotClass}"></span>
      <span class="mrmd-statusbar__icon">🐍</span>
      <span class="mrmd-statusbar__label">Python ${version}${venvDisplay}</span>
      ${sessionBadge}
      <span class="mrmd-statusbar__chevron">▾</span>
    `;
  }

  function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const python = shellState.get('runtimes.python');
    const { sessionId, session } = getCurrentSession();
    const sessions = shellState.getSessions();
    const docName = getCurrentDocName();

    const items = [];

    // Header showing current document's runtime
    items.push({
      type: 'header',
      label: `Runtime for "${docName}"`,
    });

    // Show attached session info
    if (session) {
      items.push({
        type: 'info',
        label: 'Session',
        value: session.dedicated ? `Dedicated (${sessionId})` : 'Shared',
      });
    }

    // Available sessions to attach to
    if (sessions.length > 0) {
      items.push({ type: 'divider' });
      items.push({
        type: 'header',
        label: 'Attach to Runtime',
      });

      for (const { id, info } of sessions) {
        const isCurrent = id === sessionId;
        const label = info.dedicated
          ? `Dedicated: ${id}`
          : 'Shared Runtime';

        items.push({
          icon: isCurrent ? '✓' : ' ',
          label,
          selected: isCurrent,
          onClick: () => {
            shellState.attachDocument(docName, id);
            handlers.onRuntimeAttached?.(docName, id);
            render();
          },
        });
      }
    }

    // Create new dedicated runtime
    items.push({ type: 'divider' });
    items.push({
      icon: '➕',
      label: 'Create dedicated runtime...',
      onClick: () => handlers.onCreateDedicatedRuntime?.(docName),
    });

    // Environment settings (for current session)
    if (python) {
      items.push({ type: 'divider' });
      items.push({
        type: 'header',
        label: 'Environment',
      });
      items.push({
        type: 'info',
        label: 'Virtual Env',
        value: python.venv || 'System Python',
      });
      items.push({
        type: 'info',
        label: 'Working Dir',
        value: python.cwd || 'N/A',
      });
      items.push({ type: 'divider' });
      items.push({
        icon: '📦',
        label: 'Change venv...',
        onClick: () => handlers.onChangeVenv?.(),
      });
      items.push({
        icon: '📂',
        label: 'Set working dir...',
        onClick: () => handlers.onChangeCwd?.(),
      });
      items.push({ type: 'divider' });
      items.push({
        icon: '🔄',
        label: 'Restart runtime',
        onClick: () => handlers.onRestartRuntime?.('python'),
      });
    }

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

function createThemeSegment({ editorRef, shellState, handlers, onCleanup }) {
  const segment = document.createElement('div');
  segment.className = 'mrmd-statusbar__segment';
  segment.setAttribute('data-segment', 'theme');

  let currentMenu = null;
  let currentTheme = null;

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
    return ['midnight', 'daylight', 'github', 'nord', 'nord-outputs'];
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

  function openMenu() {
    if (currentMenu) {
      currentMenu.close();
      return;
    }

    const themes = getAvailableThemes();
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

    // Add available themes
    for (const theme of themes) {
      const icon = theme.includes('dark') || theme === 'midnight' || theme === 'nord' || theme === 'nord-outputs'
        ? '🌙'
        : '☀️';

      items.push({
        icon,
        label: theme.charAt(0).toUpperCase() + theme.slice(1).replace('-', ' '),
        selected: currentTheme === theme,
        onClick: () => {
          handlers.onSetTheme?.(theme);
          render();
        },
      });
    }

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
// HELPERS
// =============================================================================

function shortenPath(path, maxLength = 25) {
  if (!path) return '';
  if (path.length <= maxLength) return path;
  return '...' + path.slice(-(maxLength - 3));
}
