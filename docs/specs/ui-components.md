# mrmd-editor UI Components Specification

> UI components for project-aware editing.

**Mission:** Render project structure, provide navigation, and handle user interactions for project/session management.

**Depends on:**
- `mrmd-project` for logic/computation
- `mrmd-electron` services (via IPC) for I/O

---

## Component Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  mrmd-editor                                                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  New UI Components                                                   │   │
│  │                                                                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │ Navigation  │ │ File        │ │ Session     │ │ Standalone  │   │   │
│  │  │ Panel       │ │ Picker      │ │ Controls    │ │ Banner      │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │                                                                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                    │   │
│  │  │ Link        │ │ Asset       │ │ Config      │                    │   │
│  │  │ Autocomplete│ │ Gallery     │ │ CodeLens    │                    │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. NavigationPanel

Renders project file tree with drag-drop reordering.

### 1.1 Interface

```typescript
interface NavigationPanelOptions {
  container: HTMLElement | string;
  project: ProjectInfo;
  currentFile?: string;

  // Callbacks (trigger IPC calls)
  onFileSelect: (path: string) => void;
  onFileCreate: (parentPath: string, name: string) => Promise<string>;
  onFileMove: (fromPath: string, toPath: string) => Promise<void>;
  onFileRename: (path: string, newName: string) => Promise<string>;
  onFileDelete: (path: string) => Promise<void>;
  onFolderCreate: (parentPath: string, name: string) => Promise<string>;
}

interface NavigationPanel {
  // Update the tree
  setProject(project: ProjectInfo): void;
  setCurrentFile(path: string): void;

  // Expand/collapse
  expandAll(): void;
  collapseAll(): void;
  expandTo(path: string): void;

  // Selection
  selectFile(path: string): void;
  getSelectedFile(): string | null;

  // Destroy
  destroy(): void;
}

function createNavigationPanel(options: NavigationPanelOptions): NavigationPanel
```

### 1.2 HTML Structure

```html
<div class="mrmd-nav-panel">
  <div class="mrmd-nav-header">
    <span class="mrmd-nav-title">Project Name</span>
    <button class="mrmd-nav-action" data-action="new-file">+</button>
    <button class="mrmd-nav-action" data-action="collapse-all">−</button>
  </div>

  <div class="mrmd-nav-tree">
    <!-- Rendered tree -->
    <div class="mrmd-nav-item mrmd-nav-folder" data-path="02-getting-started">
      <span class="mrmd-nav-expand">▶</span>
      <span class="mrmd-nav-icon">📁</span>
      <span class="mrmd-nav-label">Getting Started</span>
    </div>
    <div class="mrmd-nav-children" data-parent="02-getting-started">
      <div class="mrmd-nav-item mrmd-nav-file" data-path="02-getting-started/01-installation.md">
        <span class="mrmd-nav-icon">📄</span>
        <span class="mrmd-nav-label">Installation</span>
      </div>
    </div>
  </div>
</div>
```

### 1.3 CSS Classes

```css
.mrmd-nav-panel {
  width: 250px;
  background: var(--mrmd-panel-bg);
  border-right: 1px solid var(--mrmd-border);
  display: flex;
  flex-direction: column;
}

.mrmd-nav-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--mrmd-border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.mrmd-nav-title {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
}

.mrmd-nav-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.mrmd-nav-item {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}

.mrmd-nav-item:hover {
  background: var(--mrmd-hover-bg);
}

.mrmd-nav-item.selected {
  background: var(--mrmd-selected-bg);
}

.mrmd-nav-item.drop-target {
  background: var(--mrmd-accent-bg);
}

.mrmd-nav-item.dragging {
  opacity: 0.5;
}

.mrmd-nav-children {
  margin-left: 16px;
}

.mrmd-nav-children.collapsed {
  display: none;
}

.mrmd-nav-expand {
  width: 16px;
  text-align: center;
  font-size: 10px;
  color: var(--mrmd-fg-muted);
}

.mrmd-nav-expand.expanded {
  transform: rotate(90deg);
}

.mrmd-nav-icon {
  width: 20px;
  text-align: center;
  margin-right: 4px;
}

.mrmd-nav-label {
  flex: 1;
}

/* Inline rename input */
.mrmd-nav-rename {
  flex: 1;
  background: var(--mrmd-bg);
  border: 1px solid var(--mrmd-accent);
  border-radius: 2px;
  padding: 2px 4px;
  font-size: 13px;
  outline: none;
}
```

### 1.4 Implementation

```javascript
import { FSML } from 'mrmd-project';

export function createNavigationPanel(options) {
  const {
    container,
    project,
    currentFile,
    onFileSelect,
    onFileCreate,
    onFileMove,
    onFileRename,
    onFileDelete,
    onFolderCreate,
  } = options;

  const el = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  let state = {
    project,
    currentFile,
    expanded: new Set(),
    dragging: null,
    renaming: null,
  };

  // Render tree from NavNode[]
  function renderTree(nodes, parent = '') {
    return nodes.map(node => {
      const isExpanded = state.expanded.has(node.path);
      const isSelected = node.path === state.currentFile;
      const isRenaming = node.path === state.renaming;

      if (node.isFolder) {
        return `
          <div class="mrmd-nav-item mrmd-nav-folder ${isSelected ? 'selected' : ''}"
               data-path="${node.path}"
               draggable="true">
            <span class="mrmd-nav-expand ${isExpanded ? 'expanded' : ''}">▶</span>
            <span class="mrmd-nav-icon">📁</span>
            ${isRenaming
              ? `<input class="mrmd-nav-rename" value="${node.title}" data-path="${node.path}">`
              : `<span class="mrmd-nav-label">${node.title}</span>`
            }
          </div>
          <div class="mrmd-nav-children ${isExpanded ? '' : 'collapsed'}"
               data-parent="${node.path}">
            ${node.children.length ? renderTree(node.children, node.path) : ''}
          </div>
        `;
      } else {
        return `
          <div class="mrmd-nav-item mrmd-nav-file ${isSelected ? 'selected' : ''}"
               data-path="${node.path}"
               draggable="true">
            <span class="mrmd-nav-icon">📄</span>
            ${isRenaming
              ? `<input class="mrmd-nav-rename" value="${node.title}" data-path="${node.path}">`
              : `<span class="mrmd-nav-label">${node.title}</span>`
            }
          </div>
        `;
      }
    }).join('');
  }

  function render() {
    el.innerHTML = `
      <div class="mrmd-nav-panel">
        <div class="mrmd-nav-header">
          <span class="mrmd-nav-title">${state.project.config.name || 'Project'}</span>
          <button class="mrmd-nav-action" data-action="new-file" title="New file">+</button>
        </div>
        <div class="mrmd-nav-tree">
          ${renderTree(state.project.navTree)}
        </div>
      </div>
    `;

    attachEvents();
  }

  function attachEvents() {
    // Click handlers
    el.addEventListener('click', (e) => {
      const item = e.target.closest('.mrmd-nav-item');
      if (!item) return;

      const path = item.dataset.path;

      // Expand/collapse toggle
      if (e.target.classList.contains('mrmd-nav-expand')) {
        toggleExpand(path);
        return;
      }

      // File/folder select
      if (item.classList.contains('mrmd-nav-folder')) {
        toggleExpand(path);
      } else {
        onFileSelect(path);
      }
    });

    // Double-click to rename
    el.addEventListener('dblclick', (e) => {
      const label = e.target.closest('.mrmd-nav-label');
      if (label) {
        const item = label.closest('.mrmd-nav-item');
        startRename(item.dataset.path);
      }
    });

    // Drag and drop
    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);
    el.addEventListener('dragend', handleDragEnd);

    // Rename input handlers
    el.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('mrmd-nav-rename')) {
        if (e.key === 'Enter') {
          finishRename(e.target.dataset.path, e.target.value);
        } else if (e.key === 'Escape') {
          cancelRename();
        }
      }
    });

    el.addEventListener('blur', (e) => {
      if (e.target.classList.contains('mrmd-nav-rename')) {
        finishRename(e.target.dataset.path, e.target.value);
      }
    }, true);

    // Header actions
    el.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;

      switch (action.dataset.action) {
        case 'new-file':
          promptNewFile();
          break;
      }
    });
  }

  function toggleExpand(path) {
    if (state.expanded.has(path)) {
      state.expanded.delete(path);
    } else {
      state.expanded.add(path);
    }
    render();
  }

  function startRename(path) {
    state.renaming = path;
    render();

    // Focus input
    const input = el.querySelector(`input[data-path="${path}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }

  async function finishRename(path, newName) {
    if (!state.renaming) return;

    state.renaming = null;

    if (newName && newName !== FSML.parsePath(path).title) {
      try {
        const newPath = await onFileRename(path, newName);
        state.currentFile = newPath;
      } catch (e) {
        console.error('Rename failed:', e);
      }
    }

    render();
  }

  function cancelRename() {
    state.renaming = null;
    render();
  }

  // Drag and drop handlers
  function handleDragStart(e) {
    const item = e.target.closest('.mrmd-nav-item');
    if (!item) return;

    state.dragging = item.dataset.path;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    e.preventDefault();

    const item = e.target.closest('.mrmd-nav-item');
    if (!item || item.dataset.path === state.dragging) return;

    // Clear previous drop targets
    el.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

    item.classList.add('drop-target');
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e) {
    e.preventDefault();

    const item = e.target.closest('.mrmd-nav-item');
    if (!item || !state.dragging) return;

    const fromPath = state.dragging;
    const toPath = item.dataset.path;

    if (fromPath === toPath) return;

    try {
      await onFileMove(fromPath, toPath);
    } catch (e) {
      console.error('Move failed:', e);
    }

    state.dragging = null;
    el.querySelectorAll('.drop-target, .dragging').forEach(el => {
      el.classList.remove('drop-target', 'dragging');
    });
  }

  function handleDragEnd() {
    state.dragging = null;
    el.querySelectorAll('.drop-target, .dragging').forEach(el => {
      el.classList.remove('drop-target', 'dragging');
    });
  }

  async function promptNewFile() {
    const name = prompt('New file name:');
    if (!name) return;

    try {
      const path = await onFileCreate('', name.endsWith('.md') ? name : name + '.md');
      onFileSelect(path);
    } catch (e) {
      console.error('Create failed:', e);
    }
  }

  // Public API
  render();

  return {
    setProject(project) {
      state.project = project;
      render();
    },

    setCurrentFile(path) {
      state.currentFile = path;
      render();
    },

    expandAll() {
      function addAll(nodes) {
        for (const node of nodes) {
          if (node.isFolder) {
            state.expanded.add(node.path);
            addAll(node.children);
          }
        }
      }
      addAll(state.project.navTree);
      render();
    },

    collapseAll() {
      state.expanded.clear();
      render();
    },

    expandTo(path) {
      // Expand all ancestors
      const parts = path.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        state.expanded.add(current);
      }
      render();
    },

    selectFile(path) {
      state.currentFile = path;
      this.expandTo(path);
      render();
    },

    getSelectedFile() {
      return state.currentFile;
    },

    destroy() {
      el.innerHTML = '';
    },
  };
}
```

### 1.5 Tests

```javascript
// Test: NavigationPanel renders tree
const container = document.createElement('div');

const panel = createNavigationPanel({
  container,
  project: {
    config: { name: 'Test Project' },
    navTree: [
      { path: '01-intro.md', title: 'Intro', isFolder: false, children: [] },
      {
        path: '02-methods',
        title: 'Methods',
        isFolder: true,
        hasIndex: false,
        children: [
          { path: '02-methods/01-setup.md', title: 'Setup', isFolder: false, children: [] },
        ],
      },
    ],
  },
  onFileSelect: () => {},
  onFileCreate: async () => '',
  onFileMove: async () => {},
  onFileRename: async () => '',
  onFileDelete: async () => {},
  onFolderCreate: async () => '',
});

console.assert(container.querySelector('.mrmd-nav-title').textContent === 'Test Project');
console.assert(container.querySelectorAll('.mrmd-nav-item').length === 3);
console.log('✓ NavigationPanel renders tree');
```

```javascript
// Test: NavigationPanel expand/collapse
panel.expandAll();
console.assert(container.querySelector('.mrmd-nav-children:not(.collapsed)') !== null);

panel.collapseAll();
console.assert(container.querySelector('.mrmd-nav-children.collapsed') !== null);
console.log('✓ NavigationPanel expand/collapse works');
```

---

## 2. FilePicker

Enhanced Ctrl+P with path mode, file creation, and project creation.

### 2.1 Interface

```typescript
interface FilePickerOptions {
  container: HTMLElement | string;

  // Data sources
  getFiles: () => Promise<string[]>;
  getRecentFiles: () => Promise<Array<{ path: string; opened: string }>>;
  getProject: (filePath: string) => Promise<ProjectInfo | null>;

  // Callbacks
  onFileSelect: (path: string) => void;
  onFileCreate: (path: string) => Promise<void>;
  onProjectCreate: (path: string) => Promise<void>;
  onClose: () => void;
}

interface FilePicker {
  show(): void;
  hide(): void;
  isVisible(): boolean;
  destroy(): void;
}

function createFilePicker(options: FilePickerOptions): FilePicker
```

### 2.2 State Machine

```typescript
type PickerMode =
  | 'fuzzy'           // Default: fuzzy search on paths
  | 'path'            // Path navigation (./ ../ ~/)
  | 'folder-context'  // Browsing inside a folder
  | 'create-file'     // Creating a new file
  | 'create-project'; // Creating a new project

interface PickerState {
  mode: PickerMode;
  query: string;
  results: SearchResult[];
  selectedIndex: number;
  folderContext: string | null;  // When in folder-context mode
}
```

### 2.3 Mode Detection

```javascript
import { Search } from 'mrmd-project';

function detectMode(query) {
  // Empty query = fuzzy with recents
  if (!query) return { mode: 'fuzzy' };

  // Path prefixes trigger path mode
  if (query.match(/^[.~\/]/)) {
    const endsWithMd = query.endsWith('.md');
    const endsWithSlash = query.endsWith('/');

    if (endsWithMd) {
      // Check if file exists
      return { mode: 'path', mayCreate: true, isFile: true };
    }

    if (endsWithSlash || !query.includes('.')) {
      return { mode: 'path', mayCreate: true, isFile: false };
    }

    return { mode: 'path' };
  }

  // Otherwise fuzzy search
  return { mode: 'fuzzy' };
}
```

### 2.4 Implementation

```javascript
import { Search, FSML } from 'mrmd-project';

export function createFilePicker(options) {
  const {
    container,
    getFiles,
    getRecentFiles,
    getProject,
    onFileSelect,
    onFileCreate,
    onProjectCreate,
    onClose,
  } = options;

  const el = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  let state = {
    mode: 'fuzzy',
    query: '',
    files: [],
    recentFiles: [],
    results: [],
    selectedIndex: 0,
    folderContext: null,
    visible: false,
  };

  function render() {
    if (!state.visible) {
      el.innerHTML = '';
      return;
    }

    const modeInfo = detectMode(state.query);

    el.innerHTML = `
      <div class="mrmd-picker-overlay">
        <div class="mrmd-picker">
          <div class="mrmd-picker-header">
            <span class="mrmd-picker-icon">🔍</span>
            <input
              type="text"
              class="mrmd-picker-input"
              placeholder="${getPlaceholder(modeInfo)}"
              value="${state.query}"
              autocomplete="off"
              spellcheck="false"
            >
            <span class="mrmd-picker-hint">esc</span>
          </div>

          ${state.folderContext ? `
            <div class="mrmd-picker-context">
              IN: ${state.folderContext}
              <span class="mrmd-picker-context-hint">[Backspace to go up]</span>
            </div>
          ` : ''}

          <div class="mrmd-picker-results">
            ${renderResults(modeInfo)}
          </div>

          <div class="mrmd-picker-footer">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>⏎</kbd> ${modeInfo.mayCreate ? 'open/create' : 'open'}</span>
            <span><kbd>Tab</kbd> ${modeInfo.mode === 'path' ? 'complete' : ''}</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </div>
      </div>
    `;

    attachEvents();

    // Focus input
    const input = el.querySelector('.mrmd-picker-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function getPlaceholder(modeInfo) {
    if (state.folderContext) return 'Type to filter or create...';
    if (modeInfo.mode === 'path') return 'Navigate path...';
    return 'Find file or type path to create...';
  }

  function renderResults(modeInfo) {
    if (state.results.length === 0 && !modeInfo.mayCreate) {
      return '<div class="mrmd-picker-empty">No files found</div>';
    }

    let html = '';

    // Group results
    const grouped = groupResults(state.results);

    for (const [group, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;

      html += `<div class="mrmd-picker-section">`;
      html += `<div class="mrmd-picker-section-title">${group}</div>`;

      for (const item of items) {
        const index = state.results.indexOf(item);
        const selected = index === state.selectedIndex;

        html += `
          <div class="mrmd-picker-item ${selected ? 'selected' : ''} ${item.isFolder ? 'folder' : ''}"
               data-index="${index}"
               data-path="${item.path}">
            <span class="mrmd-picker-item-icon">${item.isFolder ? '📁' : '📄'}</span>
            <span class="mrmd-picker-item-name">${highlightMatches(item.name, item.nameMatches)}</span>
            <span class="mrmd-picker-item-path">${highlightMatches(item.dir, item.dirMatches)}</span>
            ${item.isFolder ? '<span class="mrmd-picker-item-action">[→ browse]</span>' : ''}
            ${item.meta ? `<span class="mrmd-picker-item-meta">${item.meta}</span>` : ''}
          </div>
        `;
      }

      html += `</div>`;
    }

    // Create options
    if (modeInfo.mayCreate) {
      html += `<div class="mrmd-picker-section">`;
      html += `<div class="mrmd-picker-section-divider"></div>`;

      if (modeInfo.isFile) {
        html += `
          <div class="mrmd-picker-item create ${state.selectedIndex === state.results.length ? 'selected' : ''}"
               data-action="create-file">
            <span class="mrmd-picker-item-icon">✨</span>
            <span class="mrmd-picker-item-name">Create: ${state.query}</span>
          </div>
        `;
      } else {
        html += `
          <div class="mrmd-picker-item create ${state.selectedIndex === state.results.length ? 'selected' : ''}"
               data-action="create-project">
            <span class="mrmd-picker-item-icon">✨</span>
            <span class="mrmd-picker-item-name">Create PROJECT: ${state.query}</span>
            <span class="mrmd-picker-item-meta">with scaffolding</span>
          </div>
        `;
      }

      html += `</div>`;
    }

    return html;
  }

  function groupResults(results) {
    const groups = {
      'Current Project': [],
      'Recent': [],
      'Other': [],
    };

    for (const result of results) {
      if (result.isRecent) {
        groups['Recent'].push(result);
      } else if (result.inCurrentProject) {
        groups['Current Project'].push(result);
      } else {
        groups['Other'].push(result);
      }
    }

    return groups;
  }

  function highlightMatches(str, matches) {
    if (!matches || !matches.length) return escapeHtml(str);

    let result = '';
    let lastIndex = 0;

    for (const idx of matches.sort((a, b) => a - b)) {
      if (idx >= str.length) continue;
      result += escapeHtml(str.slice(lastIndex, idx));
      result += `<span class="match">${escapeHtml(str[idx])}</span>`;
      lastIndex = idx + 1;
    }

    result += escapeHtml(str.slice(lastIndex));
    return result;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function updateResults() {
    const modeInfo = detectMode(state.query);

    if (modeInfo.mode === 'fuzzy') {
      // Fuzzy search on all files
      state.results = Search.files(state.query, state.files);

      // Add recent info
      for (const result of state.results) {
        const recent = state.recentFiles.find(r => r.path === result.path);
        if (recent) {
          result.isRecent = true;
          result.meta = formatTimeAgo(new Date(recent.opened));
        }
      }
    } else if (modeInfo.mode === 'path') {
      // Path completion
      const basePath = state.folderContext || '';
      const searchIn = resolvePath(state.query, basePath);

      // Filter files that match the path prefix
      state.results = state.files
        .filter(f => f.startsWith(searchIn) || searchIn.startsWith(f))
        .map(f => ({
          path: f,
          ...FSML.parsePath(f),
          score: 1,
          nameMatches: [],
          dirMatches: [],
        }));
    }

    state.selectedIndex = 0;
    render();
  }

  function attachEvents() {
    // Input handler
    const input = el.querySelector('.mrmd-picker-input');
    if (input) {
      input.addEventListener('input', (e) => {
        state.query = e.target.value;
        updateResults();
      });

      input.addEventListener('keydown', handleKeydown);
    }

    // Click handlers
    el.addEventListener('click', (e) => {
      // Close on overlay click
      if (e.target.classList.contains('mrmd-picker-overlay')) {
        hide();
        return;
      }

      const item = e.target.closest('.mrmd-picker-item');
      if (item) {
        const index = parseInt(item.dataset.index);
        if (!isNaN(index)) {
          state.selectedIndex = index;
          selectCurrent();
        } else if (item.dataset.action === 'create-file') {
          createFile();
        } else if (item.dataset.action === 'create-project') {
          createProject();
        }
      }
    });
  }

  function handleKeydown(e) {
    const totalItems = state.results.length + (detectMode(state.query).mayCreate ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        state.selectedIndex = Math.min(state.selectedIndex + 1, totalItems - 1);
        render();
        break;

      case 'ArrowUp':
        e.preventDefault();
        state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
        render();
        break;

      case 'Enter':
        e.preventDefault();
        selectCurrent();
        break;

      case 'Tab':
        e.preventDefault();
        tabComplete();
        break;

      case 'Escape':
        e.preventDefault();
        hide();
        break;

      case 'Backspace':
        if (state.query === '' && state.folderContext) {
          // Go up one level
          const parent = state.folderContext.split('/').slice(0, -1).join('/');
          state.folderContext = parent || null;
          updateResults();
        }
        break;
    }
  }

  function selectCurrent() {
    const modeInfo = detectMode(state.query);

    if (state.selectedIndex < state.results.length) {
      const result = state.results[state.selectedIndex];

      if (result.isFolder) {
        // Enter folder context
        state.folderContext = result.path;
        state.query = '';
        updateResults();
      } else {
        // Select file
        hide();
        onFileSelect(result.path);
      }
    } else if (modeInfo.mayCreate) {
      if (modeInfo.isFile) {
        createFile();
      } else {
        createProject();
      }
    }
  }

  async function createFile() {
    const path = resolvePath(state.query, state.folderContext || '');
    hide();
    await onFileCreate(path);
  }

  async function createProject() {
    const path = resolvePath(state.query, state.folderContext || '');
    hide();
    await onProjectCreate(path);
  }

  function tabComplete() {
    if (state.results.length > 0) {
      const result = state.results[state.selectedIndex];
      if (result.isFolder) {
        state.query = result.path + '/';
        updateResults();
      } else {
        state.query = result.path;
        render();
      }
    }
  }

  function resolvePath(query, base) {
    if (query.startsWith('/')) return query;
    if (query.startsWith('~/')) return query; // Handle in caller
    if (query.startsWith('./')) return base + query.slice(2);
    if (query.startsWith('../')) {
      const parent = base.split('/').slice(0, -1).join('/');
      return resolvePath(query.slice(3), parent);
    }
    return base ? `${base}/${query}` : query;
  }

  function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  async function show() {
    state.visible = true;
    state.query = '';
    state.selectedIndex = 0;
    state.folderContext = null;

    // Load files
    state.files = await getFiles();
    state.recentFiles = await getRecentFiles();

    updateResults();
  }

  function hide() {
    state.visible = false;
    render();
    onClose();
  }

  // Public API
  return {
    show,
    hide,
    isVisible: () => state.visible,
    destroy: () => { el.innerHTML = ''; },
  };
}
```

### 2.5 Tests

```javascript
// Test: FilePicker mode detection
console.assert(detectMode('').mode === 'fuzzy');
console.assert(detectMode('readme').mode === 'fuzzy');
console.assert(detectMode('./').mode === 'path');
console.assert(detectMode('../').mode === 'path');
console.assert(detectMode('~/').mode === 'path');
console.assert(detectMode('./new.md').mayCreate === true);
console.assert(detectMode('./new.md').isFile === true);
console.assert(detectMode('./new-project').mayCreate === true);
console.assert(detectMode('./new-project').isFile === false);
console.log('✓ FilePicker mode detection works');
```

---

## 3. SessionControls

CodeLens-style controls in yaml config blocks.

### 3.1 Interface

```typescript
interface SessionControlsOptions {
  view: EditorView;
  getSessionStatus: () => Promise<SessionStatus>;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onRestart: () => Promise<void>;
}

interface SessionStatus {
  name: string;
  connected: boolean;
  pid?: number;
  port?: number;
}

function createSessionControls(options: SessionControlsOptions): Extension
```

### 3.2 Implementation

```javascript
import { ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

class SessionControlWidget extends WidgetType {
  constructor(status, callbacks) {
    super();
    this.status = status;
    this.callbacks = callbacks;
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = 'mrmd-session-controls';

    // Status indicator
    const statusEl = document.createElement('span');
    statusEl.className = `mrmd-session-status ${this.status.connected ? 'connected' : 'disconnected'}`;
    statusEl.textContent = this.status.connected
      ? `● Connected (PID ${this.status.pid})`
      : '○ Not started';
    wrapper.appendChild(statusEl);

    // Buttons
    const buttons = document.createElement('span');
    buttons.className = 'mrmd-session-buttons';

    if (!this.status.connected) {
      const startBtn = document.createElement('button');
      startBtn.className = 'mrmd-session-btn';
      startBtn.textContent = '▶ Start';
      startBtn.onclick = this.callbacks.onStart;
      buttons.appendChild(startBtn);
    } else {
      const restartBtn = document.createElement('button');
      restartBtn.className = 'mrmd-session-btn';
      restartBtn.textContent = '↻ Restart';
      restartBtn.onclick = this.callbacks.onRestart;
      buttons.appendChild(restartBtn);

      const stopBtn = document.createElement('button');
      stopBtn.className = 'mrmd-session-btn danger';
      stopBtn.textContent = '■ Stop';
      stopBtn.onclick = this.callbacks.onStop;
      buttons.appendChild(stopBtn);
    }

    wrapper.appendChild(buttons);
    return wrapper;
  }

  eq(other) {
    return this.status.connected === other.status.connected &&
           this.status.pid === other.status.pid;
  }
}

export function createSessionControls(options) {
  const { view, getSessionStatus, onStart, onStop, onRestart } = options;

  return ViewPlugin.define(view => {
    let decorations = Decoration.none;
    let status = { connected: false };

    async function updateDecorations() {
      status = await getSessionStatus();

      const widgets = [];
      const tree = syntaxTree(view.state);

      // Find yaml config blocks with session config
      tree.iterate({
        enter(node) {
          if (node.name === 'FencedCode') {
            const text = view.state.sliceDoc(node.from, node.to);

            // Check if this is a yaml config block with session
            if (text.includes('```yaml config') && text.includes('session:')) {
              // Add widget at the start of the code block
              const line = view.state.doc.lineAt(node.from);

              widgets.push(Decoration.widget({
                widget: new SessionControlWidget(status, {
                  onStart,
                  onStop,
                  onRestart,
                }),
                side: 1,
              }).range(line.from));
            }
          }
        },
      });

      decorations = Decoration.set(widgets, true);
    }

    // Initial update
    updateDecorations();

    // Periodic refresh
    const interval = setInterval(updateDecorations, 5000);

    return {
      get decorations() { return decorations; },
      destroy() { clearInterval(interval); },
    };
  }, {
    decorations: v => v.decorations,
  });
}
```

### 3.3 CSS

```css
.mrmd-session-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  margin-bottom: 4px;
  background: var(--mrmd-panel-bg);
  border-radius: 4px;
  font-size: 12px;
}

.mrmd-session-status {
  color: var(--mrmd-fg-muted);
}

.mrmd-session-status.connected {
  color: var(--mrmd-success);
}

.mrmd-session-buttons {
  display: flex;
  gap: 8px;
}

.mrmd-session-btn {
  background: var(--mrmd-bg);
  border: 1px solid var(--mrmd-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  color: var(--mrmd-fg);
}

.mrmd-session-btn:hover {
  background: var(--mrmd-hover-bg);
}

.mrmd-session-btn.danger {
  color: var(--mrmd-error);
}
```

---

## 4. StandaloneBanner

Warning banner for files not in a project.

### 4.1 Interface

```typescript
interface StandaloneBannerOptions {
  onAddFrontmatter: () => void;
  onCreateProject: () => void;
  onDismiss: () => void;
}

function createStandaloneBanner(
  container: HTMLElement,
  options: StandaloneBannerOptions
): { show(): void; hide(): void; destroy(): void }
```

### 4.2 Implementation

```javascript
export function createStandaloneBanner(container, options) {
  const { onAddFrontmatter, onCreateProject, onDismiss } = options;

  let visible = false;

  function render() {
    if (!visible) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="mrmd-standalone-banner">
        <span class="mrmd-standalone-icon">⚠</span>
        <span class="mrmd-standalone-message">
          This file is not part of an mrmd project.
          To run code, you need runtime configuration.
        </span>
        <div class="mrmd-standalone-actions">
          <button class="mrmd-standalone-btn" data-action="frontmatter">
            Add frontmatter
          </button>
          <button class="mrmd-standalone-btn" data-action="project">
            Create project here
          </button>
          <button class="mrmd-standalone-btn secondary" data-action="dismiss">
            Just view
          </button>
        </div>
      </div>
    `;

    container.querySelector('[data-action="frontmatter"]').onclick = onAddFrontmatter;
    container.querySelector('[data-action="project"]').onclick = onCreateProject;
    container.querySelector('[data-action="dismiss"]').onclick = () => {
      hide();
      onDismiss();
    };
  }

  function show() {
    visible = true;
    render();
  }

  function hide() {
    visible = false;
    render();
  }

  return { show, hide, destroy: () => { container.innerHTML = ''; } };
}
```

### 4.3 CSS

```css
.mrmd-standalone-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--mrmd-warning-bg);
  border-bottom: 1px solid var(--mrmd-warning);
  font-size: 13px;
}

.mrmd-standalone-icon {
  font-size: 16px;
}

.mrmd-standalone-message {
  flex: 1;
  color: var(--mrmd-fg);
}

.mrmd-standalone-actions {
  display: flex;
  gap: 8px;
}

.mrmd-standalone-btn {
  background: var(--mrmd-bg);
  border: 1px solid var(--mrmd-border);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.mrmd-standalone-btn:hover {
  background: var(--mrmd-hover-bg);
}

.mrmd-standalone-btn.secondary {
  opacity: 0.7;
}
```

---

## 5. LinkAutocomplete

CodeMirror extension for `[[link]]` autocomplete.

### 5.1 Interface

```typescript
interface LinkAutocompleteOptions {
  getProjectFiles: () => string[];
  resolveLink: (target: string, fromDoc: string) => string | null;
}

function createLinkAutocomplete(options: LinkAutocompleteOptions): Extension
```

### 5.2 Implementation

```javascript
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { Links, FSML } from 'mrmd-project';

export function createLinkAutocomplete(options) {
  const { getProjectFiles, resolveLink } = options;

  function linkCompletions(context) {
    // Check if we're inside [[ ]]
    const before = context.matchBefore(/\[\[[^\]]*$/);
    if (!before) return null;

    // Extract the partial link text
    const linkText = before.text.slice(2); // Remove [[

    const files = getProjectFiles();
    const completions = [];

    for (const file of files) {
      const parsed = FSML.parsePath(file);

      // Skip hidden files
      if (parsed.isHidden || parsed.isSystem) continue;

      // Check if it matches the partial text
      if (parsed.name.toLowerCase().includes(linkText.toLowerCase()) ||
          file.toLowerCase().includes(linkText.toLowerCase())) {

        completions.push({
          label: parsed.name,
          detail: parsed.parent || '',
          apply: (view, completion, from, to) => {
            // Insert the link target (without [[ ]])
            view.dispatch({
              changes: { from: from + 2, to, insert: parsed.name + ']]' },
            });
          },
        });
      }
    }

    // Add special links
    for (const special of ['next', 'prev', 'home', 'up']) {
      if (special.startsWith(linkText.toLowerCase())) {
        completions.push({
          label: special,
          detail: 'navigation',
          apply: (view, completion, from, to) => {
            view.dispatch({
              changes: { from: from + 2, to, insert: special + ']]' },
            });
          },
        });
      }
    }

    return {
      from: before.from,
      options: completions,
    };
  }

  return autocompletion({
    override: [linkCompletions],
    activateOnTyping: true,
  });
}
```

---

## 6. Integration Example

Putting it all together in mrmd-electron:

```javascript
// In index.html or a separate app.js

import { createNavigationPanel, createFilePicker, createStandaloneBanner } from 'mrmd-editor';

// Initialize components
const navPanel = createNavigationPanel({
  container: '#nav-panel',
  project: null, // Set after loading
  onFileSelect: (path) => openFile(path),
  onFileCreate: (parent, name) => electronAPI.file.createInProject(projectRoot, name),
  onFileMove: (from, to) => electronAPI.file.move(projectRoot, from, to),
  onFileRename: (path, name) => electronAPI.file.rename(projectRoot, path, name),
  onFileDelete: (path) => electronAPI.file.delete(path),
  onFolderCreate: (parent, name) => electronAPI.file.createInProject(projectRoot, parent + '/' + name + '/'),
});

const filePicker = createFilePicker({
  container: '#file-picker',
  getFiles: () => electronAPI.file.scan(os.homedir()),
  getRecentFiles: () => electronAPI.getRecent().then(r => r.files),
  getProject: (path) => electronAPI.project.get(path),
  onFileSelect: (path) => openFile(path),
  onFileCreate: (path) => electronAPI.file.create(path).then(() => openFile(path)),
  onProjectCreate: (path) => electronAPI.project.create(path).then(p => openFile(p.root + '/01-index.md')),
  onClose: () => {},
});

const standaloneBanner = createStandaloneBanner(
  document.getElementById('standalone-banner'),
  {
    onAddFrontmatter: () => addFrontmatterToCurrentDoc(),
    onCreateProject: () => createProjectFromCurrentDoc(),
    onDismiss: () => {},
  }
);

// Open file workflow
async function openFile(filePath) {
  // 1. Get project context
  const project = await electronAPI.project.get(filePath);

  if (project) {
    // 2a. In a project - update nav, get session
    navPanel.setProject(project);
    navPanel.setCurrentFile(filePath.replace(project.root + '/', ''));
    standaloneBanner.hide();

    // Get or start session
    const session = await electronAPI.session.forDocument(filePath);
    // ... setup editor with session
  } else {
    // 2b. Standalone file - show banner
    standaloneBanner.show();
  }

  // 3. Open in editor
  // ... existing editor setup
}

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    filePicker.show();
  }
});
```

---

## 7. CSS Variables

All components use these CSS variables for theming:

```css
:root {
  /* Backgrounds */
  --mrmd-bg: #0d1117;
  --mrmd-panel-bg: #161b22;
  --mrmd-hover-bg: rgba(255, 255, 255, 0.04);
  --mrmd-selected-bg: rgba(255, 255, 255, 0.08);
  --mrmd-accent-bg: rgba(88, 166, 255, 0.1);

  /* Borders */
  --mrmd-border: #30363d;

  /* Text */
  --mrmd-fg: #c9d1d9;
  --mrmd-fg-muted: #8b949e;
  --mrmd-fg-dim: #6e7681;

  /* Accent colors */
  --mrmd-accent: #58a6ff;
  --mrmd-success: #3fb950;
  --mrmd-warning: #d29922;
  --mrmd-warning-bg: rgba(210, 153, 34, 0.1);
  --mrmd-error: #f85149;
}
```
