/**
 * @fileoverview Studio Layout
 *
 * A complete layout with editor and status bar, wired together.
 * This is the "full experience" entry point for developers who
 * want everything working out of the box.
 *
 * File switching uses the destroy+recreate pattern for safety:
 * - y-codemirror.next bindings cannot be rebound to a different Y.Text
 * - Destroying the editor ensures all Yjs observers are cleaned up
 * - No risk of stale references or cross-document contamination
 */

import { OrchestratorClient } from '../orchestrator-client.js';
import { ShellStateManager } from '../state.js';
import { createStatusBar } from '../components/status-bar.js';
import { injectShellStyles } from '../styles.js';
import { showFilePicker, showFolderPicker } from '../dialogs/file-picker.js';
import { prompt, confirm } from '../dialogs/base-dialog.js';
import { Drive } from '../drive.js';

// =============================================================================
// STUDIO
// =============================================================================

/**
 * @typedef {Object} StudioOptions
 * @property {string} orchestratorUrl - URL to mrmd-orchestrator
 * @property {string} [document] - Initial document to open (without .md extension)
 * @property {Object} [editorOptions] - Options to pass to mrmd.create()
 * @property {Object} [statusBar] - Status bar configuration
 * @property {string[]} [statusBar.segments] - Which segments to show
 * @property {'top'|'bottom'} [statusBar.position='bottom']
 * @property {boolean} [statusBar.enabled=true]
 * @property {Object} [drive] - Drive configuration
 * @property {number} [drive.maxCachedDocs=5] - Max cached documents
 * @property {number} [drive.syncTimeout=10000] - Sync timeout in ms
 */

/**
 * @typedef {Object} Studio
 * @property {Object} editor - The mrmd editor instance
 * @property {Drive} drive - Yjs document manager
 * @property {ShellStateManager} shellState - Shell state manager
 * @property {OrchestratorClient} orchestratorClient - Orchestrator API client
 * @property {HTMLElement} element - The studio container element
 * @property {string|null} currentDocument - Currently open document name
 * @property {(event: string, handler: Function) => () => void} on - Event subscription
 * @property {(docName: string) => Promise<void>} openFile - Open a file (destroy+recreate)
 * @property {(path: string) => Promise<void>} saveAs - Save file to new location
 * @property {(newName: string) => Promise<void>} rename - Rename current file
 * @property {(language: string, config: Object) => Promise<void>} setRuntime - Change runtime config
 * @property {() => void} destroy - Clean up
 */

/**
 * Create a studio with editor and shell
 * @param {string|HTMLElement} target - Target element or selector
 * @param {StudioOptions} options
 * @returns {Promise<Studio>}
 */
export async function createStudio(target, options = {}) {
  const {
    orchestratorUrl = 'http://localhost:8080',
    document: initialDocument,
    editorOptions = {},
    statusBar: statusBarConfig = {},
    drive: driveConfig = {},
  } = options;

  // Inject styles
  injectShellStyles();

  // Resolve target
  const container = typeof target === 'string'
    ? document.querySelector(target)
    : target;

  if (!container) {
    throw new Error(`Target element not found: ${target}`);
  }

  // Create studio layout
  const studioEl = document.createElement('div');
  studioEl.className = 'mrmd-studio';
  studioEl.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  `;

  // Create editor container
  const editorContainer = document.createElement('div');
  editorContainer.className = 'mrmd-studio__editor';
  editorContainer.style.cssText = `
    flex: 1;
    overflow: hidden;
    position: relative;
  `;

  // Create status bar container
  const statusBarContainer = document.createElement('div');
  statusBarContainer.className = 'mrmd-studio__statusbar';

  // Assemble layout
  if (statusBarConfig.position === 'top') {
    studioEl.appendChild(statusBarContainer);
    studioEl.appendChild(editorContainer);
  } else {
    studioEl.appendChild(editorContainer);
    studioEl.appendChild(statusBarContainer);
  }

  container.appendChild(studioEl);

  // Create orchestrator client
  const orchestratorClient = new OrchestratorClient(orchestratorUrl);

  // Create shell state
  const shellState = new ShellStateManager(orchestratorClient);

  // Event emitter
  const eventHandlers = new Map();

  function emit(event, data) {
    const handlers = eventHandlers.get(event) || [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  function on(event, handler) {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set());
    }
    eventHandlers.get(event).add(handler);
    return () => eventHandlers.get(event).delete(handler);
  }

  // Get service URLs from orchestrator
  let syncUrl;
  let runtimeUrls = {};
  try {
    const urls = await orchestratorClient.getUrls();
    syncUrl = urls.sync;
    runtimeUrls = urls.runtimes || {};
    if (!syncUrl) {
      throw new Error('No sync URL returned from orchestrator');
    }
  } catch (e) {
    console.error('Failed to get service URLs:', e);
    throw new Error(`Could not connect to orchestrator at ${orchestratorUrl}: ${e.message}`);
  }

  // Create Drive for Yjs document management
  const drive = new Drive(syncUrl, {
    maxCachedDocs: driveConfig.maxCachedDocs ?? 5,
    syncTimeout: driveConfig.syncTimeout ?? 10000,
    log: (entry) => {
      if (entry.level === 'error') {
        console.error('[Drive]', entry.message, entry);
      } else if (entry.level === 'warn') {
        console.warn('[Drive]', entry.message, entry);
      }
    },
  });

  // Import mrmd dynamically to avoid circular dependency
  let mrmd;
  try {
    mrmd = await import('../../index.js');
  } catch (e) {
    console.error('Failed to import mrmd:', e);
    throw new Error('Could not import mrmd-editor. Make sure mrmd-editor is properly set up.');
  }

  // Track current editor instance and preserved state
  let editor = null;
  let currentDocName = null;
  let preservedEditorState = {
    theme: editorOptions.theme || null,
    dark: editorOptions.dark ?? null,
  };

  /**
   * Create editor for a document handle and connect runtimes
   * @param {import('../drive.js').DocumentHandle} handle
   * @returns {Object} Editor instance
   */
  function createEditorForDocument(handle) {
    const mergedOptions = {
      ...editorOptions,
      // Yjs state from Drive
      ydoc: handle.ydoc,
      // ytext name defaults to 'content' which matches Drive.open()
      // Don't pass handle.ytext (Y.Text instance) - editor expects string name
      awareness: handle.awareness,
      // Preserve theme across switches
      theme: preservedEditorState.theme,
      dark: preservedEditorState.dark,
    };

    // Remove any sync options since we're providing ydoc directly
    delete mergedOptions.sync;

    const newEditor = mrmd.default.create(editorContainer, mergedOptions);

    // Connect available runtimes (Python, etc.)
    for (const [language, url] of Object.entries(runtimeUrls)) {
      if (url && newEditor.connectRuntime) {
        try {
          newEditor.connectRuntime(language, url);
        } catch (e) {
          console.warn(`[Studio] Failed to connect ${language} runtime:`, e.message);
        }
      }
    }

    // Enable monitor mode for execution if available
    if (newEditor.execution?.enableMonitorMode) {
      newEditor.execution.enableMonitorMode({
        ydoc: handle.ydoc,
        awareness: handle.awareness,
      });
    }

    return newEditor;
  }

  /**
   * Switch to a different document (destroy+recreate pattern)
   * @param {string} docName
   */
  async function switchDocument(docName) {
    const normalizedName = docName.replace(/\.md$/, '');

    // Don't switch if already on this document
    if (normalizedName === currentDocName) {
      return;
    }

    emit('beforeFileSwitch', { from: currentDocName, to: normalizedName });

    // Preserve editor state before destroying
    if (editor) {
      preservedEditorState.theme = editor.getThemeName?.() || preservedEditorState.theme;
      // Note: scroll position is document-specific, so we don't preserve it
    }

    // Show loading state
    editorContainer.classList.add('mrmd-studio__editor--loading');

    try {
      // Destroy existing editor (this cleans up y-codemirror.next bindings)
      if (editor) {
        editor.destroy();
        editor = null;
      }

      // Open new document via Drive
      const handle = await drive.open(normalizedName);

      // Create new editor with the new Yjs state
      editor = createEditorForDocument(handle);
      currentDocName = normalizedName;

      // Update shell state
      const filesResult = await orchestratorClient.listFiles();
      shellState.setFile({
        name: normalizedName.split('/').pop(),
        path: normalizedName.endsWith('.md') ? normalizedName : `${normalizedName}.md`,
        root: filesResult.root,
      });

      // Update status bar with new editor
      if (statusBarComponent) {
        statusBarComponent.setEditor(editor);
      }

      emit('fileOpened', { doc: normalizedName });

    } catch (e) {
      console.error('Failed to switch document:', e);
      emit('fileOpenError', { doc: normalizedName, error: e.message });
      throw e;

    } finally {
      editorContainer.classList.remove('mrmd-studio__editor--loading');
    }
  }

  // Open initial document
  const docToOpen = initialDocument || 'untitled';
  try {
    const handle = await drive.open(docToOpen);
    editor = createEditorForDocument(handle);
    currentDocName = docToOpen;
  } catch (e) {
    console.error('Failed to open initial document:', e);
    throw new Error(`Could not open document "${docToOpen}": ${e.message}`);
  }

  // Shell action handlers
  const handlers = {
    async onRename() {
      const file = shellState.get('file');
      if (!file) return;

      const newName = await prompt({
        title: 'Rename File',
        message: `Rename "${file.name}.md" to:`,
        defaultValue: file.name,
        placeholder: 'new-name',
        validate: (value) => {
          if (!value) return 'Name is required';
          if (value.includes('/') || value.includes('\\')) return 'Name cannot contain path separators';
          return null;
        },
      });

      if (newName && newName !== file.name) {
        await studio.rename(newName);
      }
    },

    async onSaveAs() {
      const file = shellState.get('file');
      const projectRoot = shellState.get('projectRoot');

      showFilePicker({
        mode: 'save',
        title: 'Save As',
        orchestratorClient,
        initialPath: projectRoot || '~',
        defaultFilename: file?.name ? `${file.name}-copy.md` : 'untitled.md',
        onSelect: async (path) => {
          await studio.saveAs(path);
        },
      });
    },

    async onOpenFile(docName) {
      await switchDocument(docName);
    },

    async onOpenFilePicker() {
      const projectRoot = shellState.get('projectRoot');

      showFilePicker({
        mode: 'open',
        title: 'Open File',
        orchestratorClient,
        initialPath: projectRoot || '~',
        allowOutsideProject: false, // Only allow project files for now (synced via mrmd-sync)
        onSelect: async (path) => {
          // Extract document name from path
          // Path format from file picker: "subdir/filename.md" or just "filename.md"
          const docName = path.replace(/\.md$/, '');
          await switchDocument(docName);
        },
      });
    },

    async onChangeVenv() {
      const python = shellState.get('runtimes.python');

      showFolderPicker({
        title: 'Select Virtual Environment',
        orchestratorClient,
        initialPath: python?.venv || '~',
        onSelect: async (path) => {
          try {
            await shellState.setVenv(path);
            emit('runtimeChanged', { language: 'python', venv: path });
          } catch (error) {
            await confirm({
              title: 'Error',
              message: `Failed to change venv: ${error.message}`,
              confirmLabel: 'OK',
              cancelLabel: '',
            });
          }
        },
      });
    },

    async onChangeCwd() {
      const python = shellState.get('runtimes.python');

      showFolderPicker({
        title: 'Select Working Directory',
        orchestratorClient,
        initialPath: python?.cwd || '~',
        onSelect: async (path) => {
          try {
            await shellState.setCwd(path);
            emit('runtimeChanged', { language: 'python', cwd: path });
          } catch (error) {
            await confirm({
              title: 'Error',
              message: `Failed to change working directory: ${error.message}`,
              confirmLabel: 'OK',
              cancelLabel: '',
            });
          }
        },
      });
    },

    async onRestartRuntime(language) {
      // TODO: Implement runtime restart via orchestrator
      console.log('Restart runtime:', language);
    },
  };

  // Create status bar
  let statusBarComponent = null;
  if (statusBarConfig.enabled !== false) {
    statusBarComponent = createStatusBar({
      container: statusBarContainer,
      editor,
      shellState,
      orchestratorClient,
      segments: statusBarConfig.segments || ['file', 'location', 'sync', 'runtime'],
      position: statusBarConfig.position || 'bottom',
      handlers,
    });
  }

  // Start shell state sync
  await shellState.startSync();

  // Set initial file context
  try {
    const result = await orchestratorClient.listFiles();
    shellState.setFile({
      name: currentDocName.split('/').pop(),
      path: currentDocName.endsWith('.md') ? currentDocName : `${currentDocName}.md`,
      root: result.root,
    });
  } catch (e) {
    console.warn('Could not set initial file context:', e);
  }

  // Create studio object
  const studio = {
    /** Current editor instance (may change on file switch) */
    get editor() {
      return editor;
    },

    /** Drive instance for Yjs document management */
    drive,

    /** Shell state manager */
    shellState,

    /** Orchestrator API client */
    orchestratorClient,

    /** Studio container element */
    element: studioEl,

    /** Currently open document name */
    get currentDocument() {
      return currentDocName;
    },

    /** Event subscription */
    on,

    /**
     * Open a file (uses destroy+recreate pattern for safety)
     * @param {string} docName - Document name (with or without .md)
     */
    async openFile(docName) {
      await switchDocument(docName);
    },

    /**
     * Save current file to a new location
     * @param {string} targetPath - Target path
     */
    async saveAs(targetPath) {
      const file = shellState.get('file');
      if (!file) return;

      try {
        const result = await orchestratorClient.copyFile(file.path, targetPath);
        emit('savedAs', { from: file.path, to: targetPath, synced: result.synced });

        // If saved within project, optionally open the new file
        if (result.in_project) {
          const newDocName = targetPath.replace(/\.md$/, '');
          await switchDocument(newDocName);
        }
      } catch (error) {
        console.error('Save As failed:', error);
        throw error;
      }
    },

    /**
     * Rename current file
     * @param {string} newName - New name (without path or extension)
     */
    async rename(newName) {
      const file = shellState.get('file');
      if (!file) return;

      const oldPath = file.path;
      const newPath = oldPath.replace(/[^/]+\.md$/, `${newName}.md`);
      const newDocName = newPath.replace(/\.md$/, '');

      try {
        await orchestratorClient.renameFile(oldPath, newPath);

        // Close the old document connection in Drive
        drive.close(currentDocName);

        // Open the renamed document
        await switchDocument(newDocName);

        emit('renamed', { from: oldPath, to: newPath });
      } catch (error) {
        console.error('Rename failed:', error);
        throw error;
      }
    },

    /**
     * Update runtime configuration
     * @param {string} language
     * @param {Object} config
     */
    async setRuntime(language, config) {
      if (language === 'python') {
        if (config.venv !== undefined) {
          await shellState.setVenv(config.venv);
        }
        if (config.cwd !== undefined) {
          await shellState.setCwd(config.cwd);
        }
      }
    },

    /**
     * Clean up all resources
     */
    destroy() {
      // Stop state sync
      shellState.stopSync();
      shellState.destroy();

      // Destroy orchestrator client
      orchestratorClient.destroy();

      // Destroy status bar
      statusBarComponent?.destroy();

      // Destroy current editor
      if (editor) {
        editor.destroy();
        editor = null;
      }

      // Destroy drive (closes all Yjs connections)
      drive.destroy();

      // Remove DOM elements
      studioEl.remove();
    },
  };

  return studio;
}
