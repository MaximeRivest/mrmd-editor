/**
 * @fileoverview File Picker Dialog
 *
 * A dialog for browsing and selecting files.
 * Supports both project files and system-wide browsing.
 */

import { createDialog } from './base-dialog.js';

// =============================================================================
// FILE PICKER
// =============================================================================

/**
 * @typedef {Object} FilePickerOptions
 * @property {'open'|'save'} mode - Open or save mode
 * @property {string} title - Dialog title
 * @property {import('../orchestrator-client.js').OrchestratorClient} orchestratorClient
 * @property {string} [initialPath] - Initial directory path
 * @property {string} [defaultFilename] - Default filename for save mode
 * @property {boolean} [allowOutsideProject=false] - Allow browsing outside project
 * @property {(path: string) => void} onSelect - Called when file is selected
 * @property {() => void} [onCancel]
 */

/**
 * Show a file picker dialog
 * @param {FilePickerOptions} options
 */
export function showFilePicker(options) {
  const {
    mode,
    title,
    orchestratorClient,
    initialPath = '~',
    defaultFilename = '',
    allowOutsideProject = false,
    onSelect,
    onCancel,
  } = options;

  let currentPath = initialPath;
  let entries = [];
  let selectedEntry = null;
  let isLoading = false;

  // Create content
  const content = document.createElement('div');
  content.className = 'mrmd-filepicker';

  // Path bar
  const pathBar = document.createElement('div');
  pathBar.className = 'mrmd-filepicker__path';
  content.appendChild(pathBar);

  // File list
  const fileList = document.createElement('div');
  fileList.className = 'mrmd-filepicker__list';
  content.appendChild(fileList);

  // New file input (for save mode)
  let filenameInput = null;
  if (mode === 'save') {
    const newFileRow = document.createElement('div');
    newFileRow.className = 'mrmd-filepicker__new';

    const label = document.createElement('label');
    label.className = 'mrmd-label';
    label.textContent = 'Filename:';
    label.style.marginBottom = '0';
    label.style.marginRight = '8px';
    newFileRow.appendChild(label);

    filenameInput = document.createElement('input');
    filenameInput.className = 'mrmd-input mrmd-filepicker__new-input';
    filenameInput.type = 'text';
    filenameInput.value = defaultFilename;
    filenameInput.placeholder = 'filename.md';
    newFileRow.appendChild(filenameInput);

    content.appendChild(newFileRow);
  }

  // Render path bar
  function renderPathBar() {
    pathBar.innerHTML = '';

    const parts = currentPath.split('/').filter(Boolean);
    let accumulated = '';

    // Home button
    const homeBtn = document.createElement('span');
    homeBtn.className = 'mrmd-filepicker__path-segment';
    homeBtn.textContent = '~';
    homeBtn.addEventListener('click', () => navigateTo('~'));
    pathBar.appendChild(homeBtn);

    // Root if absolute path
    if (currentPath.startsWith('/')) {
      const sep = document.createElement('span');
      sep.className = 'mrmd-filepicker__path-separator';
      sep.textContent = '/';
      pathBar.appendChild(sep);
    }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulated += '/' + part;

      const sep = document.createElement('span');
      sep.className = 'mrmd-filepicker__path-separator';
      sep.textContent = '/';
      pathBar.appendChild(sep);

      const segment = document.createElement('span');
      segment.className = 'mrmd-filepicker__path-segment';
      segment.textContent = part;

      if (i < parts.length - 1) {
        const pathToNavigate = accumulated;
        segment.addEventListener('click', () => navigateTo(pathToNavigate));
      }

      pathBar.appendChild(segment);
    }
  }

  // Render file list
  function renderFileList() {
    fileList.innerHTML = '';

    if (isLoading) {
      fileList.innerHTML = '<div class="mrmd-filepicker__empty">Loading...</div>';
      return;
    }

    if (entries.length === 0) {
      fileList.innerHTML = '<div class="mrmd-filepicker__empty">Empty directory</div>';
      return;
    }

    // Sort: directories first, then files
    const sorted = [...entries].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      const item = document.createElement('div');
      item.className = 'mrmd-filepicker__item';

      if (selectedEntry?.path === entry.path) {
        item.classList.add('mrmd-filepicker__item--selected');
      }

      const icon = document.createElement('span');
      icon.className = 'mrmd-filepicker__item-icon';
      icon.textContent = entry.type === 'directory' ? '📁' : '📄';
      item.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'mrmd-filepicker__item-name';
      name.textContent = entry.name;
      item.appendChild(name);

      if (entry.type === 'file' && entry.size !== undefined) {
        const info = document.createElement('span');
        info.className = 'mrmd-filepicker__item-info';
        info.textContent = formatSize(entry.size);
        item.appendChild(info);
      }

      // Click handler
      item.addEventListener('click', () => {
        if (entry.type === 'directory') {
          navigateTo(entry.path);
        } else {
          selectedEntry = entry;
          renderFileList();

          if (mode === 'save' && filenameInput) {
            filenameInput.value = entry.name;
          }
        }
      });

      // Double-click to select
      item.addEventListener('dblclick', () => {
        if (entry.type === 'file') {
          selectFile(entry.path);
        }
      });

      fileList.appendChild(item);
    }
  }

  // Navigate to a directory
  async function navigateTo(path) {
    isLoading = true;
    selectedEntry = null;
    renderFileList();

    try {
      const result = await orchestratorClient.browse({ path, type: 'all' });
      currentPath = result.path;
      entries = result.entries;
    } catch (error) {
      console.error('Failed to browse:', error);
      entries = [];
    }

    isLoading = false;
    renderPathBar();
    renderFileList();
  }

  // Select a file
  function selectFile(path) {
    dialog.close();
    onSelect(path);
  }

  // Create dialog
  const dialog = createDialog({
    title,
    content,
    buttons: [
      {
        label: 'Cancel',
        onClick: () => {
          dialog.close();
          onCancel?.();
        },
      },
      {
        label: mode === 'open' ? 'Open' : 'Save',
        primary: true,
        onClick: () => {
          if (mode === 'save' && filenameInput) {
            let filename = filenameInput.value.trim();
            if (!filename) {
              filenameInput.focus();
              return;
            }
            if (!filename.endsWith('.md')) {
              filename += '.md';
            }
            // Construct full path
            const fullPath = currentPath.endsWith('/')
              ? currentPath + filename
              : currentPath + '/' + filename;
            selectFile(fullPath);
          } else if (selectedEntry) {
            selectFile(selectedEntry.path);
          }
        },
      },
    ],
    onClose: () => onCancel?.(),
  });

  // Initial load
  navigateTo(initialPath);
}

/**
 * Show a folder picker dialog
 * @param {Object} options
 * @param {string} options.title
 * @param {import('../orchestrator-client.js').OrchestratorClient} options.orchestratorClient
 * @param {string} [options.initialPath='~']
 * @param {(path: string) => void} options.onSelect
 * @param {() => void} [options.onCancel]
 */
export function showFolderPicker(options) {
  const {
    title,
    orchestratorClient,
    initialPath = '~',
    onSelect,
    onCancel,
  } = options;

  let currentPath = initialPath;
  let entries = [];
  let isLoading = false;

  // Create content
  const content = document.createElement('div');
  content.className = 'mrmd-filepicker';

  // Path bar
  const pathBar = document.createElement('div');
  pathBar.className = 'mrmd-filepicker__path';
  content.appendChild(pathBar);

  // Current path display
  const currentPathDisplay = document.createElement('div');
  currentPathDisplay.style.padding = '8px';
  currentPathDisplay.style.marginBottom = '8px';
  currentPathDisplay.style.background = 'var(--mrmd-input-bg, #1e1e1e)';
  currentPathDisplay.style.borderRadius = '4px';
  currentPathDisplay.style.fontFamily = 'monospace';
  currentPathDisplay.style.fontSize = '12px';
  content.appendChild(currentPathDisplay);

  // Folder list
  const folderList = document.createElement('div');
  folderList.className = 'mrmd-filepicker__list';
  content.appendChild(folderList);

  // Render path bar
  function renderPathBar() {
    currentPathDisplay.textContent = currentPath;

    pathBar.innerHTML = '';

    const parts = currentPath.split('/').filter(Boolean);
    let accumulated = '';

    // Home button
    const homeBtn = document.createElement('span');
    homeBtn.className = 'mrmd-filepicker__path-segment';
    homeBtn.textContent = '~';
    homeBtn.addEventListener('click', () => navigateTo('~'));
    pathBar.appendChild(homeBtn);

    if (currentPath.startsWith('/')) {
      const sep = document.createElement('span');
      sep.className = 'mrmd-filepicker__path-separator';
      sep.textContent = '/';
      pathBar.appendChild(sep);
    }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulated += '/' + part;

      const sep = document.createElement('span');
      sep.className = 'mrmd-filepicker__path-separator';
      sep.textContent = '/';
      pathBar.appendChild(sep);

      const segment = document.createElement('span');
      segment.className = 'mrmd-filepicker__path-segment';
      segment.textContent = part;

      const pathToNavigate = accumulated;
      segment.addEventListener('click', () => navigateTo(pathToNavigate));

      pathBar.appendChild(segment);
    }
  }

  // Render folder list
  function renderFolderList() {
    folderList.innerHTML = '';

    if (isLoading) {
      folderList.innerHTML = '<div class="mrmd-filepicker__empty">Loading...</div>';
      return;
    }

    // Filter to directories only
    const dirs = entries.filter(e => e.type === 'directory').sort((a, b) => a.name.localeCompare(b.name));

    if (dirs.length === 0) {
      folderList.innerHTML = '<div class="mrmd-filepicker__empty">No subdirectories</div>';
      return;
    }

    for (const entry of dirs) {
      const item = document.createElement('div');
      item.className = 'mrmd-filepicker__item';

      const icon = document.createElement('span');
      icon.className = 'mrmd-filepicker__item-icon';
      icon.textContent = '📁';
      item.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'mrmd-filepicker__item-name';
      name.textContent = entry.name;
      item.appendChild(name);

      item.addEventListener('click', () => navigateTo(entry.path));

      folderList.appendChild(item);
    }
  }

  // Navigate to a directory
  async function navigateTo(path) {
    isLoading = true;
    renderFolderList();

    try {
      const result = await orchestratorClient.browse({ path, type: 'dir' });
      currentPath = result.path;
      entries = result.entries;
    } catch (error) {
      console.error('Failed to browse:', error);
      entries = [];
    }

    isLoading = false;
    renderPathBar();
    renderFolderList();
  }

  // Create dialog
  const dialog = createDialog({
    title,
    content,
    buttons: [
      {
        label: 'Cancel',
        onClick: () => {
          dialog.close();
          onCancel?.();
        },
      },
      {
        label: 'Select',
        primary: true,
        onClick: () => {
          dialog.close();
          onSelect(currentPath);
        },
      },
    ],
    onClose: () => onCancel?.(),
  });

  // Initial load
  navigateTo(initialPath);
}

// =============================================================================
// HELPERS
// =============================================================================

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
