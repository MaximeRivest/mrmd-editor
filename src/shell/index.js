/**
 * @fileoverview Shell Module
 *
 * Provides status bar, file management, and environment configuration
 * for the mrmd editor. This is the "chrome" around the editor.
 *
 * ## Quick Start
 *
 * ```javascript
 * // Full studio (recommended) - batteries-included
 * import { createStudio } from 'mrmd-editor/shell';
 *
 * const studio = await createStudio('#app', {
 *   orchestratorUrl: 'http://localhost:8080',
 *   document: 'my-notebook',  // Initial document to open
 *   editorOptions: { theme: 'nord' },
 * });
 *
 * // Switch documents (uses safe destroy+recreate pattern)
 * await studio.openFile('other-notebook');
 * ```
 *
 * ## Using Drive Directly
 *
 * ```javascript
 * // For custom UIs - manage Yjs connections yourself
 * import mrmd from 'mrmd-editor';
 * import { Drive } from 'mrmd-editor/shell';
 *
 * const drive = new Drive('ws://localhost:4444');
 * const handle = await drive.open('my-notebook');
 *
 * const editor = mrmd.create('#editor', {
 *   ydoc: handle.ydoc,
 *   ytext: handle.ytext,
 *   awareness: handle.awareness,
 * });
 *
 * // To switch: destroy editor, open new doc, recreate editor
 * editor.destroy();
 * const newHandle = await drive.open('other-notebook');
 * const newEditor = mrmd.create('#editor', {
 *   ydoc: newHandle.ydoc,
 *   ytext: newHandle.ytext,
 *   awareness: newHandle.awareness,
 * });
 * ```
 */

// =============================================================================
// LAYOUTS
// =============================================================================

export { createStudio } from './layouts/studio.js';

// =============================================================================
// COMPONENTS
// =============================================================================

export { createStatusBar } from './components/status-bar.js';
export { createMenu, createFileMenu } from './components/menu.js';

// =============================================================================
// DIALOGS
// =============================================================================

export { createDialog, confirm, prompt } from './dialogs/base-dialog.js';
export { showFilePicker, showFolderPicker } from './dialogs/file-picker.js';

// =============================================================================
// STATE & CLIENT
// =============================================================================

export { OrchestratorClient, createOrchestratorClient } from './orchestrator-client.js';
export { ShellStateManager, createShellState } from './state.js';

// =============================================================================
// DRIVE (Yjs Document Management)
// =============================================================================

export { Drive, createDrive } from './drive.js';

// =============================================================================
// STYLES
// =============================================================================

export {
  shellStyles,
  statusBarStyles,
  menuStyles,
  dialogStyles,
  filePickerStyles,
  studioStyles,
  injectShellStyles,
} from './styles.js';
