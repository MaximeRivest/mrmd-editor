# mrmd API

## Quick Start

```javascript
import mrmd from 'mrmd';

// Simple local editor
const editor = mrmd.create('#editor', { doc: '# Hello' });

// Connected to sync/storage
const docs = mrmd.drive('wss://mrmd.io', { auth: token });
const editor = docs.open('notes/todo.md', '#editor');
```

---

## `mrmd.create(target, options)`

Create a standalone editor (no sync).

```javascript
const editor = mrmd.create('#editor', {
  doc: '# Hello',           // initial content
  dark: null,               // true | false | null (system)
  placeholder: 'Start...',  // empty state text
  readonly: false,          // view-only mode
});
```

**Returns:** `Editor`

---

## `mrmd.drive(url, options)`

Connect to a sync server / storage backend.

```javascript
const docs = mrmd.drive('wss://mrmd.io', {
  auth: token,              // auth token
});

// Or local (Electron)
const docs = mrmd.drive({ local: '~/Documents/MyApp' });
```

**Returns:** `Drive`

---

## `Drive`

### `drive.open(path, target, options)`

Open a file in an editor, synced.

```javascript
const editor = docs.open('projects/readme.md', '#editor', {
  dark: null,
  placeholder: 'Start...',
  readonly: false,
});
```

**Returns:** `Editor`

### `drive.read(path)`

Read file content without mounting.

```javascript
const content = await docs.read('notes/todo.md');
```

### `drive.write(path, content)`

Write file content directly.

```javascript
await docs.write('notes/todo.md', '# Updated');
```

### `drive.list(path)`

List files in a directory.

```javascript
const files = await docs.list('projects/');
// ['readme.md', 'notes.md', 'src/']
```

### `drive.onStatus(callback)`

Connection status changes.

```javascript
docs.onStatus(status => {
  // 'connecting' | 'connected' | 'disconnected'
});
```

---

## `Editor`

### Content

```javascript
editor.getContent()                    // → string
editor.setContent(text)                // replace all
editor.insert(pos, text)               // insert at position
editor.replace(from, to, text)         // replace range
```

### Streaming Writer

For AI/code output that streams in like a collaborator typing.

```javascript
const writer = editor.writer(position);
writer.write('Hello');     // insert at position
writer.write(' world');    // continues from last position
writer.end();              // cleanup

// Or append at end
const writer = editor.writer();  // defaults to end
```

### Code Cells

```javascript
editor.runCell(index)                  // run specific cell
editor.runCurrentCell()                // run cell at cursor
editor.runAll()                        // run all cells
editor.clearOutput(index)              // clear specific output
editor.clearOutputs()                  // clear all outputs
editor.bindRuntime(runtimeId)          // set runtime for this doc
```

### State

```javascript
editor.setReadonly(bool)               // toggle readonly
editor.setDark(bool)                   // toggle theme
editor.focus()                         // focus editor
editor.blur()                          // blur editor
editor.stats()                         // → { lines, chars, words }
```

### Events

```javascript
editor.onChange(callback)              // content changed
editor.onSave(callback)                // user triggered save (Cmd+S)
editor.onCellRun(callback)             // cell execution started
editor.onCellOutput(callback)          // cell output received
editor.onCollaborator(callback)        // user joined/left
```

### Destroy

```javascript
editor.destroy()                       // cleanup
```

### Internals (power users)

```javascript
editor.view      // CodeMirror EditorView
editor.ydoc      // Yjs Y.Doc
editor.ytext     // Yjs Y.Text
```

---

## Runtimes

Register code execution backends.

```javascript
import { python } from 'mrmd-python';
import { node } from 'mrmd-node';

// On drive (applies to all editors from this drive)
const docs = mrmd.drive('wss://...', {
  runtimes: {
    python: python({ mode: 'pyodide' }),  // browser
    javascript: node(),                    // server
  }
});

// Or on single editor
const editor = mrmd.create('#editor', {
  runtimes: { python: python() }
});
```

---

## Theming

All styling via CSS. Key classes:

```css
/* Editor container */
.mrmd { }
.mrmd-dark { }

/* Code cells */
.mrmd-cell { }
.mrmd-cell-python { }
.mrmd-cell-javascript { }
.mrmd-cell-running { }
.mrmd-cell-error { }

/* Cell buttons */
.mrmd-cell-buttons { }
.mrmd-run-btn { }
.mrmd-clear-btn { }
.mrmd-runtime-picker { }

/* Output */
.mrmd-output { }
.mrmd-output-stream { }
.mrmd-output-error { }

/* Collaboration */
.mrmd-collaborator-cursor { }
.mrmd-collaborator-selection { }

/* Hide elements */
.mrmd-run-btn { display: none; }
```

---

## Full Example

```javascript
import mrmd from 'mrmd';
import { python } from 'mrmd-python';

// Connect to platform
const docs = mrmd.drive('wss://mrmd.io', {
  auth: userToken,
  runtimes: {
    python: python({ server: 'wss://mrmd.io/compute' })
  }
});

// Open notebook
const editor = docs.open('projects/analysis.md', '#editor');

// Listen for events
editor.onChange(content => {
  console.log('Content changed:', content.length, 'chars');
});

editor.onCollaborator(({ user, action }) => {
  console.log(user.name, action); // "Sarah joined"
});

// Keyboard shortcuts (editor has defaults, override if needed)
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    editor.runCurrentCell();
  }
});
```

```css
/* Custom theme */
.mrmd {
  font-family: 'iA Writer Duo', serif;
  --mrmd-bg: #fffcf7;
  --mrmd-text: #1a1a1a;
}

.mrmd-run-btn {
  background: #10b981;
  border-radius: 4px;
}

.mrmd-cell-running .mrmd-run-btn {
  background: #f59e0b;
}
```

---

## What's Built-in

| Feature | Included |
|---------|----------|
| Markdown editing | yes |
| Syntax highlighting (17 langs) | yes |
| Code cell detection | yes |
| Run/Clear buttons (as widgets) | yes |
| Dark/light theme | yes |
| Placeholder | yes |
| Yjs sync | yes |
| Collaborator cursors | yes |
| Streaming writer | yes |
| Keyboard shortcuts | yes (defaults) |

## What's Separate Packages

| Package | Provides |
|---------|----------|
| `mrmd-sync` | Sync server, file persistence |
| `mrmd-python` | Python runtime (Pyodide/kernel) |
| `mrmd-node` | Node.js runtime |
| `mrmd-julia` | Julia runtime |
| `mrmd-r` | R runtime |
| `mrmd-bash` | Shell runtime |
| `mrmd-llm` | AI streaming (OpenAI, Anthropic, etc) |
