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
| `ydoc` | Y.Doc | `new Y.Doc()` | Existing Yjs document for collaboration |
| `ytext` | string | `'content'` | Name of Yjs Text type |

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

| Method | Description |
|--------|-------------|
| `getContent()` | Returns current document as string |
| `setContent(text)` | Replaces entire document content |
| `insert(pos, text)` | Inserts text at position |
| `insertAtCursor(text)` | Inserts text at cursor position |
| `setDark(bool)` | Toggles dark/light theme |
| `focus()` | Focuses the editor |
| `destroy()` | Destroys the editor instance |
| `stats()` | Returns `{ lines, chars, words }` |

**Properties:**

| Property | Description |
|----------|-------------|
| `view` | CodeMirror EditorView instance |
| `ydoc` | Yjs document |
| `yText` | Yjs Text instance |

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
- `encodeStateAsUpdate`, `applyUpdate`, `encodeStateVector` - Sync utilities

### `mrmd.codemirror`
- `EditorView`, `EditorState`, `Compartment`, `Text`, `Transaction`, `basicSetup`
- `keymap`, `Decoration`, `ViewPlugin`, `WidgetType`, `placeholder`
- `syntaxTree`, `syntaxHighlighting`, `defaultHighlightStyle`
- `oneDark`
- `javascript`, `python`, `markdown`

---

## Features Implemented

- [x] **Markdown-only editor** - Always markdown mode, no language switching needed
- [x] **Document-like theme** - Clean Word/GDocs style: serif font (Georgia), 1.6 line height, no gutters
- [x] **Initial content** - `doc` option reliably sets initial content (synced with Yjs)
- [x] **Code block syntax highlighting** - 17 languages supported
- [x] **CM6 native languages** - JS/TS, Python, HTML, CSS, JSON, SQL, Rust, C++, Java, Go, XML, YAML, R, Julia
- [x] **CM5 legacy languages** - Shell/Bash, PowerShell
- [x] **Code block autocompletion** - For JS/TS, Python, HTML, CSS
- [x] **Placeholder text** - Shows configurable placeholder when editor is empty
- [x] **Theme toggle** - Dynamic dark/light theme switching, defaults to system preference
- [x] **Yjs integration** - CRDT-based collaborative editing ready
- [x] **Basic setup** - Code folding, bracket matching, etc. (gutters hidden by default)
- [x] **Cursor stats** - Line/char/word count via `stats()`
