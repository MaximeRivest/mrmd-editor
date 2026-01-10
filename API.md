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

  // Collaboration
  ydoc: new Y.Doc(),        // Yjs document (shared for collab)
  ytext: 'content',         // Yjs Text key name
  awareness: null,          // Awareness instance (auto-created if null)
  userName: 'Anonymous',    // collaborator display name
  userColor: '#3b82f6',     // collaborator cursor color

  // Code execution
  runtimes: {},             // { javascript: executor, python: executor }
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

### Awareness / Collaboration

All collaborators (humans, AI, code executors) are tracked via Yjs Awareness.

```javascript
// Identify as a collaborator (useful for AI/runtimes)
editor.announceCollaborator('ai', 'Claude', '#8b5cf6');
// types: 'human' | 'ai' | 'runtime' | 'sync'

// Update your status
editor.setCollaboratorStatus('streaming');
// statuses: 'idle' | 'typing' | 'streaming' | 'executing'

// Get all connected collaborators
editor.getCollaborators();
// → [{ clientId: 123, user: { type: 'human', name: 'Alice', color: '#3b82f6' } }, ...]

// Listen for changes
editor.onCollaboratorsChange(collaborators => {
  console.log('Collaborators:', collaborators);
});
```

### Runtime LSP (Hover, Completions, Variables)

Runtime-powered IntelliSense. Unlike traditional LSP (static analysis), this uses actual runtime values.

```javascript
// Automatic: hover tooltips and completions work in code cells
// Shows actual values: "sum = 42" not just "sum: number"

// Manual queries
await editor.getHoverInfo()            // Get hover info at cursor
await editor.getHoverInfo(pos)         // Get hover info at position
await editor.getCompletions()          // Get completions at cursor

// Variable explorer
await editor.listVariables()           // List all JS variables
await editor.listVariables('python')   // List Python variables
await editor.getVariableDetail('df')   // Get details: type, value, children

// Code formatting
await editor.formatCode(code)          // Format JS code
await editor.formatCode(code, 'python') // Format Python code

// Register additional LSP providers
editor.registerLSPProvider('python', provider);
```

**Built-in JavaScript runtime LSP:**

When `javascript: true` (default), you get:
- Hover tooltips showing actual values (not just types)
- Completions based on runtime objects (actual properties, not guesses)
- Variable inspection in the session namespace
- Awareness integration (collaborators see "Alice is inspecting `sum`")

**MRP Server LSP (Python, etc):**

```javascript
const editor = mrmd.create('#editor', {
  runtimes: {
    python: {
      type: 'mrp',
      url: 'http://localhost:8000/mrp/v1',
      languages: ['python']
    }
  }
});

// Now Python cells get the same features:
// - Runtime hover (actual DataFrame shape, not just "pd.DataFrame")
// - Runtime completions (actual object attributes)
// - Variable explorer
```

**Properties:**

```javascript
editor.runtimeLspProviders  // Map<string, RuntimeLSPProvider>
editor.variableExplorer     // { list(), get(name), setLanguage(lang) }
```

### Events

```javascript
editor.onChange(callback)              // content changed
editor.onSave(callback)                // user triggered save (Cmd+S)
editor.onCellRun(callback)             // cell execution started
editor.onCellOutput(callback)          // cell output chunk received
editor.onCellComplete(callback)        // cell execution finished
editor.onCellError(callback)           // cell execution error
editor.onCollaboratorsChange(callback) // collaborators changed
```

### Destroy

```javascript
editor.destroy()                       // cleanup
```

### Internals (power users)

```javascript
editor.view                  // CodeMirror EditorView
editor.ydoc                  // Yjs Y.Doc
editor.yText                 // Yjs Y.Text
editor.awareness             // Yjs Awareness
editor.registry              // Runtime registry
editor.execution             // Execution manager
editor.runtimeLspProviders   // Runtime LSP providers map
editor.variableExplorer      // Variable explorer API
editor.jsRuntime             // Built-in JS runtime (if enabled)
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
const editor = docs.open('projects/analysis.md', '#editor', {
  userName: 'Alice',
  userColor: '#3b82f6'
});

// Listen for content changes
editor.onChange(content => {
  console.log('Content changed:', content.length, 'chars');
});

// Listen for collaborators
editor.onCollaboratorsChange(collaborators => {
  console.log('Collaborators:', collaborators.map(c => c.user.name).join(', '));
});

// Listen for cell execution
editor.onCellComplete((index, result) => {
  console.log(`Cell ${index}:`, result.success ? 'success' : 'error');
});

// Keyboard shortcuts (editor has defaults, override if needed)
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    editor.runCurrentCell();
  }
});
```

### AI/LLM Integration Example

```javascript
// Create shared document
const ydoc = new mrmd.yjs.Doc();
const awareness = new mrmd.yjs.Awareness(ydoc);

// Human editor
const humanEditor = mrmd.create('#human-editor', {
  ydoc,
  awareness,
  userName: 'Alice',
  userColor: '#3b82f6'
});

// AI assistant (same document, different identity)
const aiEditor = mrmd.create('#ai-preview', {
  ydoc,
  awareness,
  readonly: true  // AI writes via streaming, humans see live
});

// AI announces itself
aiEditor.announceCollaborator('ai', 'Claude', '#8b5cf6');

// AI streams a response
async function aiRespond(prompt) {
  aiEditor.setCollaboratorStatus('streaming');

  const writer = humanEditor.writer();  // Write to shared doc
  writer.write('\n\n**Claude:** ');

  for await (const chunk of streamFromLLM(prompt)) {
    writer.write(chunk);
  }

  writer.end();
  aiEditor.setCollaboratorStatus('idle');
}
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

## Terminal Output

Cell execution automatically processes terminal output through `TerminalBuffer`:
- Progress bars (tqdm, rich) update correctly during streaming
- ANSI colors are stripped for document storage (plain text)
- Cursor movement (`\r`, `\x1b[A`) is processed correctly

### Automatic Handling

When you run a cell, output is automatically processed:

```javascript
editor.runCell(0);  // Output is processed through TerminalBuffer
                    // Document gets clean plain text
```

### Rich Display (Optional)

For colored output during streaming, access the buffer:

```javascript
// Listen for output and render with colors
editor.onCellOutput((index, chunk, processed) => {
  const buffer = editor.execution.getBuffer(index);
  if (buffer) {
    outputElement.innerHTML = buffer.toHtml();  // Colored HTML
  }
});
```

### Manual Processing

For custom use cases:

```javascript
import { TerminalBuffer, processTerminalOutput, terminalToHtml } from 'mrmd-editor';

// One-shot processing
const plainText = processTerminalOutput(rawOutput);

// Manual streaming
const buffer = new TerminalBuffer();
buffer.write(chunk1);
buffer.write(chunk2);

buffer.toString();  // Plain text (for storage)
buffer.toHtml();    // HTML with colors (for display)
buffer.toAnsi();    // With ANSI codes (for terminal passthrough)
```

**Why plain text for storage?**
Per VISION.md: "The .md file is truth. Regular markdown. Version controlled. Grep-able. Opens in any editor."

Progress bars work correctly because cursor movement is processed - you get the final state, not intermediate junk.

---

## What's Built-in

| Feature | Included |
|---------|----------|
| Markdown editing | yes |
| Syntax highlighting (17 langs) | yes |
| Code cell detection | yes |
| Cell execution API | yes |
| Dark/light theme | yes |
| Placeholder | yes |
| Yjs sync | yes |
| Yjs Awareness (presence) | yes |
| Collaborator tracking | yes |
| Streaming writer | yes |
| Terminal output processing | yes |
| ANSI color support | yes |
| Progress bar handling | yes |
| Keyboard shortcuts | yes (defaults) |
| **Runtime LSP (JS)** | yes |
| Runtime hover tooltips | yes |
| Runtime completions | yes |
| Variable explorer | yes |
| MRP client (Python, etc) | yes |

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
