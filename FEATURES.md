# mrmd Features

A markdown editor with realtime collaboration. Code blocks automatically get syntax highlighting.

## Editor Creation

### `mrmd.create(target, options)`

Creates a collaborative markdown editor instance.

**Parameters:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `doc` | string | `''` | Initial document content |
| `dark` | boolean\|null | `null` | Theme mode: `true`=dark, `false`=light, `null`=system preference |
| `placeholder` | string | `'Start typing...'` | Placeholder text when editor is empty. Pass `''` to disable. |
| `readonly` | boolean | `false` | View-only mode |
| `ydoc` | Y.Doc | `new Y.Doc()` | Existing Yjs document for collaboration |
| `ytext` | string | `'content'` | Name of Yjs Text type |
| `awareness` | Awareness | `new Awareness(ydoc)` | Yjs Awareness instance for presence/cursors |
| `userName` | string | `'Anonymous'` | Display name for this collaborator |
| `userColor` | string | random | Color for this collaborator's cursor |
| `runtimes` | object | `{}` | Code execution runtimes (e.g., `{ javascript: executor }`) |

**Example:**
```javascript
const editor = mrmd.create('#editor', {
  doc: '# Hello',
  dark: false,
  placeholder: 'Write something...'
});
```

---

## Editor API

Methods available on the editor instance returned by `create()`:

### Content Methods

| Method | Description |
|--------|-------------|
| `getContent()` | Returns current document as string |
| `setContent(text)` | Replaces entire document content |
| `insert(pos, text)` | Inserts text at position |
| `insertAtCursor(text)` | Inserts text at cursor position |
| `replace(from, to, text)` | Replaces range with text |
| `writer(pos?)` | Returns streaming Writer for AI/LLM output |

### State Methods

| Method | Description |
|--------|-------------|
| `setDark(bool)` | Toggles dark/light theme |
| `setReadonly(bool)` | Toggles readonly mode |
| `focus()` | Focuses the editor |
| `blur()` | Blurs the editor |
| `stats()` | Returns `{ lines, chars, words }` |
| `destroy()` | Destroys the editor instance |

### Awareness / Collaboration

| Method | Description |
|--------|-------------|
| `announceCollaborator(type, name, color?)` | Identify as a collaborator (type: `'human'`, `'ai'`, `'runtime'`, `'sync'`) |
| `setCollaboratorStatus(status)` | Update status: `'idle'`, `'typing'`, `'streaming'`, `'executing'` |
| `getCollaborators()` | Returns array of `{ clientId, user }` for all connected collaborators |
| `onCollaboratorsChange(callback)` | Listen for collaborator join/leave/update events |

### Code Cells

| Method | Description |
|--------|-------------|
| `getCells()` | Returns all executable code cells in the document |
| `getCurrentCell()` | Returns cell at cursor position |
| `cellCount()` | Returns number of cells |
| `runCell(index)` | Run cell by index |
| `runCurrentCell()` | Run cell at cursor |
| `runAll()` | Run all cells in order |
| `runAllAbove()` | Run all cells up to and including current |
| `clearOutput(index)` | Clear output for specific cell |
| `clearOutputs()` | Clear all outputs |
| `cancelExecution(index?)` | Cancel running execution |
| `registerRuntime(name, runtime)` | Register a code execution runtime |
| `supportsLanguage(lang)` | Check if a language has a registered runtime |

### Events

| Method | Description |
|--------|-------------|
| `onChange(callback)` | Content changed |
| `onSave(callback)` | User triggered save (Cmd+S) |
| `onCellRun(callback)` | Cell execution started |
| `onCellOutput(callback)` | Cell output chunk received |
| `onCellComplete(callback)` | Cell execution completed |
| `onCellError(callback)` | Cell execution error |

**Properties:**

| Property | Description |
|----------|-------------|
| `view` | CodeMirror EditorView instance |
| `ydoc` | Yjs document |
| `yText` | Yjs Text instance |
| `awareness` | Yjs Awareness instance |
| `registry` | Runtime registry |
| `execution` | Execution manager |

---

## Code Block Languages

Fenced code blocks automatically get syntax highlighting based on the language tag.

### CM6 Native Languages (Full Parser Support)

These languages have full Lezer parser support with syntax trees, smart features, and autocompletion where available.

| Language | Tags | Package |
|----------|------|---------|
| JavaScript | `javascript`, `js`, `node`, `ecmascript` | `@codemirror/lang-javascript` |
| JSX | `jsx` | `@codemirror/lang-javascript` |
| TypeScript | `typescript`, `ts` | `@codemirror/lang-javascript` |
| TSX | `tsx` | `@codemirror/lang-javascript` |
| Python | `python`, `py`, `python3` | `@codemirror/lang-python` |
| HTML | `html`, `htm` | `@codemirror/lang-html` |
| CSS | `css` | `@codemirror/lang-css` |
| JSON | `json`, `jsonc` | `@codemirror/lang-json` |
| XML | `xml`, `svg` | `@codemirror/lang-xml` |
| SQL | `sql`, `mysql`, `postgresql`, `postgres`, `sqlite` | `@codemirror/lang-sql` |
| Rust | `rust`, `rs` | `@codemirror/lang-rust` |
| C/C++ | `c`, `cpp`, `c++`, `cxx`, `h`, `hpp` | `@codemirror/lang-cpp` |
| Java | `java` | `@codemirror/lang-java` |
| Go | `go`, `golang` | `@codemirror/lang-go` |
| YAML | `yaml`, `yml` | `@codemirror/lang-yaml` |

### Community CM6 Languages

| Language | Tags | Package |
|----------|------|---------|
| R | `r`, `rlang` | `codemirror-lang-r` |
| Julia | `julia`, `jl` | `@plutojl/lang-julia` |

### CM5 Legacy Languages (Syntax Highlighting Only)

These languages use CodeMirror 5 legacy modes. They provide syntax highlighting but no syntax tree or smart features.

| Language | Tags | Mode |
|----------|------|------|
| Shell/Bash | `shell`, `sh`, `bash`, `zsh`, `fish` | `@codemirror/legacy-modes/mode/shell` |
| PowerShell | `powershell`, `ps1`, `pwsh` | `@codemirror/legacy-modes/mode/powershell` |

---

## Exposed Libraries

For console exploration and advanced usage:

### `mrmd.yjs`
- `Y` - Full Yjs namespace
- `Doc`, `Text`, `Array`, `Map` - Yjs types
- `Awareness` - Presence/cursor awareness
- `encodeStateAsUpdate`, `applyUpdate`, `encodeStateVector` - Sync utilities

### `mrmd.codemirror`
- `EditorView`, `EditorState`, `StateEffect`, `Compartment`, `Text`, `Transaction`, `basicSetup`
- `keymap`, `Decoration`, `ViewPlugin`, `WidgetType`, `placeholder`
- `syntaxTree`, `syntaxHighlighting`, `defaultHighlightStyle`
- `oneDark`
- `javascript`, `python`, `markdown`

---

## Features Implemented

### Core Editor
- [x] **Markdown-only editor** - Always markdown mode, no language switching needed
- [x] **Document-like theme** - Clean Word/GDocs style: serif font (Georgia), 1.6 line height, no gutters
- [x] **Initial content** - `doc` option reliably sets initial content (synced with Yjs)
- [x] **Placeholder text** - Shows configurable placeholder when editor is empty
- [x] **Theme toggle** - Dynamic dark/light theme switching, defaults to system preference
- [x] **Readonly mode** - View-only mode toggle
- [x] **Streaming writer** - AI/LLM can stream text like a collaborator typing
- [x] **Basic setup** - Code folding, bracket matching, etc. (gutters hidden by default)
- [x] **Cursor stats** - Line/char/word count via `stats()`

### Code Blocks
- [x] **Code block syntax highlighting** - 17 languages supported
- [x] **CM6 native languages** - JS/TS, Python, HTML, CSS, JSON, SQL, Rust, C++, Java, Go, XML, YAML, R, Julia
- [x] **CM5 legacy languages** - Shell/Bash, PowerShell
- [x] **Code block autocompletion** - For JS/TS, Python, HTML, CSS
- [x] **Code cell detection** - Finds executable code blocks in document
- [x] **Cell execution API** - Run cells, get outputs, clear outputs
- [x] **Runtime registry** - Register custom code execution backends

### Collaboration (Yjs)
- [x] **Yjs integration** - CRDT-based collaborative editing
- [x] **Awareness support** - Built-in presence tracking for all collaborators
- [x] **Multi-editor sync** - Multiple editors can share the same Yjs document
- [x] **Collaborator types** - Support for human, AI, runtime, and sync collaborators
- [x] **Collaborator status** - Track idle/typing/streaming/executing states
- [x] **Yjs-first initialization** - Yjs is source of truth; editors joining get content from Yjs
