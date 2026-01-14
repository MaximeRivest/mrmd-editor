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
import { AiClient } from '../ai-client.js';
import { showAiMenu, AI_COMMANDS, injectAiMenuStyles } from '../ai-menu.js';

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

  // Clear any existing content (like "Loading..." placeholders)
  container.innerHTML = '';
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
  let aiUrl = null;
  let aiClient = null;
  try {
    const urls = await orchestratorClient.getUrls();
    syncUrl = urls.sync;
    runtimeUrls = urls.runtimes || {};
    aiUrl = urls.ai || null;
    if (!syncUrl) {
      throw new Error('No sync URL returned from orchestrator');
    }

    // Register the shared session in shell state
    if (runtimeUrls.python) {
      shellState.registerSession('shared', {
        id: 'shared',
        url: runtimeUrls.python,
        status: 'ready',
        dedicated: false,
        language: 'python',
      });
    }

    // Initialize AI client if AI server is available
    if (aiUrl) {
      aiClient = new AiClient(orchestratorUrl); // Use orchestrator proxy
      injectAiMenuStyles();

      // Set AI state for status bar
      shellState._set('ai', {
        running: true,
        url: aiUrl,
        juiceLevel: 0,
        active: false,
      });
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
   * @param {string} docName - Document name (for runtime attachment lookup)
   * @returns {Object} Editor instance
   */
  function createEditorForDocument(handle, docName) {
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

    // Get the runtime URL for this document (uses attachment or defaults to shared)
    const attachedRuntimeUrl = shellState.getRuntimeUrl(docName);

    // Connect to the attached runtime first (if different from default)
    if (attachedRuntimeUrl && newEditor.connectRuntime) {
      try {
        newEditor.connectRuntime('python', attachedRuntimeUrl);
      } catch (e) {
        console.warn(`[Studio] Failed to connect attached runtime:`, e.message);
      }
    }

    // Connect any other available runtimes that aren't already connected
    for (const [language, url] of Object.entries(runtimeUrls)) {
      // Skip if already connected (Python may already be connected via attachment)
      if (language === 'python' && attachedRuntimeUrl) continue;

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
      // Use attached runtime URL or fall back to default Python runtime
      const monitorRuntimeUrl = attachedRuntimeUrl || runtimeUrls.python;
      newEditor.execution.enableMonitorMode({
        ydoc: handle.ydoc,
        awareness: handle.awareness,
        runtimeUrl: monitorRuntimeUrl,
        session: docName,
      });
    }

    // Add AI integration if available
    if (aiClient && mrmd.default.ai?.aiIntegration) {
      const aiExtensions = mrmd.default.ai.aiIntegration({
        onSparkClick: (e, view) => {
          const context = mrmd.default.ai.getAiContext(view);
          showAiMenu({
            x: e.clientX,
            y: e.clientY,
            context: {
              hasSelection: context.selectedText.length > 0,
              inCodeCell: false, // TODO: detect code cell
            },
            onCommand: (cmd) => executeAiCommand(cmd, newEditor),
            juiceLevel: shellState.get('ai')?.juiceLevel || 0,
            onJuiceLevelChange: (level) => {
              shellState._set('ai.juiceLevel', level);
              aiClient.setJuiceLevel(level);
            },
          });
        },
      });

      // Add AI extensions to editor
      newEditor.view.dispatch({
        effects: mrmd.codemirror.StateEffect.appendConfig.of(aiExtensions),
      });
    }

    return newEditor;
  }

  /**
   * Execute an AI command on the editor
   */
  async function executeAiCommand(cmd, targetEditor) {
    if (!aiClient || !mrmd.default.ai) return;

    const view = targetEditor.view;
    const context = mrmd.default.ai.getAiContext(view);
    const juiceLevel = shellState.get('ai')?.juiceLevel || 0;

    // Mark AI as active
    shellState._set('ai.active', true);

    try {
      // Build params based on command type
      let params = {};
      let resultField = cmd.resultField;

      if (cmd.program.includes('Finish')) {
        params = {
          text_before_cursor: context.textBeforeCursor,
          local_context: context.localContext,
          document_context: context.documentContext,
        };
      } else if (cmd.program.includes('Fix') || cmd.program.includes('Correct')) {
        params = {
          text_to_fix: context.selectedText,
          local_context: context.localContext,
          document_context: context.documentContext,
        };
      } else if (cmd.program.includes('Code')) {
        params = {
          code: context.selectedText,
          language: 'python', // TODO: detect
          local_context: context.localContext,
          document_context: context.documentContext,
        };
      } else if (cmd.program.includes('Synonym')) {
        params = {
          text: context.selectedText,
          local_context: context.localContext,
        };
      } else if (cmd.program.includes('Document')) {
        params = { document: context.documentContext };
      }

      await mrmd.default.ai.executeAiOperation(view, aiClient, {
        program: cmd.program,
        params,
        type: cmd.type === 'insert' ? 'insert' : 'replace',
        from: cmd.type === 'insert' ? context.cursorPos : context.selectionFrom,
        to: cmd.type === 'insert' ? context.cursorPos : context.selectionTo,
        resultField,
        juiceLevel,
      });

      emit('aiCommandExecuted', { command: cmd.id, program: cmd.program });
    } catch (error) {
      console.error('[Studio] AI command failed:', error);
      emit('aiCommandError', { command: cmd.id, error: error.message });
    } finally {
      shellState._set('ai.active', false);
    }
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

      // Create new editor with the new Yjs state (pass docName for runtime attachment lookup)
      editor = createEditorForDocument(handle, normalizedName);
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
    editor = createEditorForDocument(handle, docToOpen);
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
        allowOutsideProject: true, // Allow browsing whole filesystem
        onSelect: async (path) => {
          // Get the actual docs directory from the API
          const filesResult = await orchestratorClient.listFiles();
          const docsRoot = filesResult.root?.replace(/\/$/, '') || '';

          // Check if path is within the docs directory (not just project root)
          const isInDocsDir = docsRoot && (
            path.startsWith(docsRoot + '/') || path === docsRoot
          );

          let docName;
          if (isInDocsDir) {
            // Extract relative path for docs files
            docName = path.slice(docsRoot.length).replace(/^\//, '');
            // Remove .md extension for document name
            docName = docName.replace(/\.md$/, '');
          } else {
            // File is outside docs directory - use absolute path
            // The sync server supports absolute paths for external files
            docName = path.replace(/\.md$/, '');
          }

          await switchDocument(docName);
        },
      });
    },

    async onChangeVenv() {
      const python = shellState.get('runtimes.python');
      const docName = currentDocName;

      showFolderPicker({
        title: 'Select Virtual Environment',
        orchestratorClient,
        initialPath: python?.venv || '~',
        showHidden: true, // Show hidden folders like .venv
        onSelect: async (path) => {
          console.log('[ChangeVenv] onSelect called with path:', path, 'for doc:', docName);
          try {
            // Create a dedicated runtime for this document with the selected venv
            console.log('[ChangeVenv] Calling createSession...');
            const sessionInfo = await shellState.createSession(docName, 'dedicated', path);
            console.log('[ChangeVenv] createSession returned:', sessionInfo);

            // Reconnect the editor to the new runtime
            if (editor?.connectRuntime && sessionInfo.url) {
              editor.connectRuntime('python', sessionInfo.url);
            }

            // IMPORTANT: Update ExecutionManager's runtime URL for monitor mode
            if (editor?.execution?.setRuntimeUrl && sessionInfo.url) {
              editor.execution.setRuntimeUrl(sessionInfo.url);
            }

            // Update the legacy python state for status bar display
            shellState._set('runtimes.python.venv', path);
            shellState._set('runtimes.python.venvName', path.split('/').pop());
            shellState._set('runtimes.python.status', 'ready');

            emit('runtimeChanged', { language: 'python', venv: path, dedicated: true });
          } catch (error) {
            await confirm({
              title: 'Error',
              message: `Failed to create dedicated runtime: ${error.message}`,
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

    async onNewFile() {
      const newName = await prompt({
        title: 'New File',
        message: 'Enter a name for the new file:',
        defaultValue: '',
        placeholder: 'my-notebook',
        validate: (value) => {
          if (!value) return 'Name is required';
          if (value.includes('/') || value.includes('\\')) return 'Name cannot contain path separators';
          return null;
        },
      });

      if (newName) {
        try {
          // Create the file via orchestrator
          await orchestratorClient.createFile(newName);
          // Open the new file
          await switchDocument(newName);
          emit('fileCreated', { doc: newName });
        } catch (error) {
          await confirm({
            title: 'Error',
            message: `Failed to create file: ${error.message}`,
            confirmLabel: 'OK',
            cancelLabel: '',
          });
        }
      }
    },

    onSetTheme(theme) {
      // Update editor theme
      if (editor?.setTheme) {
        editor.setTheme(theme);
      }
      // Store in shell state for persistence
      shellState._set('theme', theme);
      emit('themeChanged', { theme });
    },

    async onCreateDedicatedRuntime(docName) {
      try {
        // Create a dedicated session via orchestrator
        const sessionInfo = await shellState.createSession(docName, 'dedicated');

        // Reconnect the editor to the new runtime
        if (editor?.connectRuntime && sessionInfo.url) {
          editor.connectRuntime('python', sessionInfo.url);
        }

        emit('runtimeCreated', { docName, session: sessionInfo });
      } catch (error) {
        await confirm({
          title: 'Error',
          message: `Failed to create dedicated runtime: ${error.message}`,
          confirmLabel: 'OK',
          cancelLabel: '',
        });
      }
    },

    onRuntimeAttached(docName, sessionId) {
      // When user attaches a document to a different runtime,
      // we need to reconnect the editor if this is the current document
      if (docName === currentDocName) {
        const session = shellState.getSession(sessionId);
        if (session?.url && editor?.connectRuntime) {
          editor.connectRuntime('python', session.url);
        }
      }
      emit('runtimeAttached', { docName, sessionId });
    },

    // AI Handlers
    onSetJuiceLevel(level) {
      if (aiClient) {
        aiClient.setJuiceLevel(level);
        shellState._set('ai.juiceLevel', level);
        emit('aiJuiceLevelChanged', { level });
      }
    },

    async onContinueDocument() {
      if (!aiClient || !editor || !mrmd.default.ai) return;

      const view = editor.view;
      const docEnd = view.state.doc.length;
      const content = view.state.doc.toString();
      const juiceLevel = shellState.get('ai')?.juiceLevel || 0;

      shellState._set('ai.active', true);
      try {
        await mrmd.default.ai.executeAiOperation(view, aiClient, {
          program: 'DocumentResponsePredict',
          params: { document: content },
          type: 'insert',
          from: docEnd,
          to: docEnd,
          resultField: 'response',
          juiceLevel,
        });
        emit('aiContinueDocument', { success: true });
      } catch (error) {
        console.error('[Studio] Continue document failed:', error);
        emit('aiContinueDocument', { success: false, error: error.message });
      } finally {
        shellState._set('ai.active', false);
      }
    },

    async onSummarizeDocument() {
      if (!aiClient || !editor) return;

      const content = editor.view.state.doc.toString();
      const juiceLevel = shellState.get('ai')?.juiceLevel || 0;

      shellState._set('ai.active', true);
      try {
        const result = await aiClient.summarizeDocument(content, { juiceLevel });
        const summary = result.summary || result.response || 'No summary generated';
        await confirm({
          title: 'Document Summary',
          message: summary,
          confirmLabel: 'OK',
          cancelLabel: '',
        });
        emit('aiSummarizeDocument', { success: true });
      } catch (error) {
        console.error('[Studio] Summarize failed:', error);
        await confirm({
          title: 'Error',
          message: `Failed to summarize: ${error.message}`,
          confirmLabel: 'OK',
          cancelLabel: '',
        });
      } finally {
        shellState._set('ai.active', false);
      }
    },

    async onSuggestFilename() {
      if (!aiClient || !editor) return;

      const content = editor.view.state.doc.toString();
      const currentName = currentDocName;
      const juiceLevel = shellState.get('ai')?.juiceLevel || 0;

      shellState._set('ai.active', true);
      try {
        const result = await aiClient.suggestNotebookName(content, currentName, { juiceLevel });
        const suggestedName = result.name;

        if (suggestedName && suggestedName !== currentName) {
          const confirmed = await confirm({
            title: 'Rename File?',
            message: `AI suggests: "${suggestedName}"\n\nRename "${currentName}" to "${suggestedName}"?`,
            confirmLabel: 'Rename',
            cancelLabel: 'Cancel',
          });

          if (confirmed) {
            await studio.rename(suggestedName);
          }
        } else {
          await confirm({
            title: 'Filename Suggestion',
            message: 'The current filename seems appropriate.',
            confirmLabel: 'OK',
            cancelLabel: '',
          });
        }
      } catch (error) {
        console.error('[Studio] Suggest filename failed:', error);
      } finally {
        shellState._set('ai.active', false);
      }
    },
  };

  // Create status bar
  let statusBarComponent = null;
  if (statusBarConfig.enabled !== false) {
    // Default segments - include 'ai' if AI is available
    const defaultSegments = aiClient
      ? ['files', 'sync', 'runtime', 'ai']
      : ['files', 'sync', 'runtime'];

    statusBarComponent = createStatusBar({
      container: statusBarContainer,
      editor,
      shellState,
      orchestratorClient,
      segments: statusBarConfig.segments || defaultSegments,
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

    /** AI client (null if AI not available) */
    aiClient,

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
