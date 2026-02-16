# MRMD Runtime Protocol (MRP)

A simple, capability-based protocol for connecting code editors to language runtimes.

**Version:** 0.2.0

> **Breaking change:** MRP no longer exposes multi-session endpoints. Runtime requests execute against the runtime's single namespace (one runtime process = one REPL).

---

## Overview

MRP enables rich development experiences in notebook-style editors by connecting to live runtimes rather than just static language servers.

```
┌─────────────────────────────────────────────────────────────────┐
│  The Runtime Knows More Than The Language Server                │
│                                                                 │
│  Static LSP:   def foo(x: int) -> str    ← from type hints     │
│  Runtime:      foo(42) returned "hello", x is currently 42     │
│                                                                 │
│  MRP = runtime-first, LSP-fallback                             │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Capability-based** — Runtimes declare what they support; clients adapt
2. **JSON over HTTP** — Simple, works everywhere, SSE for streaming
3. **Runtime-namespace aware** — State persists in the runtime process between executions
4. **Language-agnostic** — Same protocol for Python, JavaScript, Bash, etc.
5. **LSP-fallback** — Graceful degradation when runtime can't answer

---

## Endpoints

All endpoints are prefixed with `/mrp/v1/`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/capabilities` | GET | What can this runtime do? |
| `/reset` | POST | Clear runtime namespace |
| `/execute` | POST | Run code, return result |
| `/execute/stream` | POST | Run code, SSE stream output |
| `/input` | POST | Send user input to waiting execution |
| `/input/cancel` | POST | Cancel pending input request |
| `/interrupt` | POST | Cancel running execution |
| `/complete` | POST | Completions at cursor position |
| `/inspect` | POST | Detailed info about symbol |
| `/hover` | POST | Quick tooltip for symbol |
| `/variables` | POST | List runtime variables |
| `/variables/{name}` | POST | Drill into variable |
| `/is_complete` | POST | Is code a complete statement? |
| `/format` | POST | Format code (optional) |
| `/assets/{path}` | GET | Serve saved assets |

---

## Capability Discovery

### `GET /capabilities`

Returns what this runtime supports. Clients should call this once on connection and cache the result.

**Response:**

```json
{
  "runtime": "ipython",
  "version": "3.11.4",
  "languages": ["python", "py", "python3"],

  "features": {
    "execute": true,
    "executeStream": true,
    "interrupt": true,
    "complete": true,
    "inspect": true,
    "hover": true,
    "variables": true,
    "variableExpand": true,
    "reset": true,
    "isComplete": true,
    "format": false,
    "assets": true
  },

  "lspFallback": "ws://localhost:5007",

  "defaultSession": "default",
  "maxSessions": 10,

  "environment": {
    "cwd": "/home/user/project",
    "executable": "/usr/bin/python3",
    "virtualenv": "/home/user/project/.venv"
  }
}
```

**Note:** The `environment` field is **read-only information** about which Python interpreter this runtime is using. It cannot be changed after the runtime starts. To use a different Python/venv, start a different runtime server.

**Feature Descriptions:**

| Feature | Description |
|---------|-------------|
| `execute` | Run code and return result (always true) |
| `executeStream` | Stream output via SSE |
| `interrupt` | Cancel running execution |
| `complete` | Tab completion from live session |
| `inspect` | Get symbol info (signature, docs, source) |
| `hover` | Quick value/type preview |
| `variables` | List variables in namespace |
| `variableExpand` | Drill into objects (children, attributes) |
| `reset` | Clear namespace without destroying session |
| `isComplete` | Check if code is a complete statement |
| `format` | Format/prettify code |
| `assets` | Saves files (figures, HTML) to disk |

---

## Runtime Model

**One runtime server = one Python interpreter.**

A runtime server executes code using whatever Python interpreter started it. The runtime does NOT:
- Switch between virtual environments
- Spawn subprocesses for different interpreters
- Manage multiple Python installations

If you need code to run in a different venv, **start a different runtime server** using that venv's Python:

```bash
# Runtime A - uses project's venv
/path/to/project/.venv/bin/python -m mrmd_python --port 8001

# Runtime B - uses another venv
/path/to/other/.venv/bin/python -m mrmd_python --port 8002
```

The **orchestrator** (not the runtime) is responsible for:
- Deciding which venv to use for a project
- Starting runtime servers with the correct Python
- Routing requests to the appropriate runtime

This separation keeps the runtime simple and predictable. The `environment` field in `/capabilities` tells you which Python this runtime is using—it's informational, not configurable.

---

## Runtime Namespace

MRP now uses a **single runtime namespace** per runtime process.

- One runtime process = one REPL namespace
- No `/sessions` endpoints
- Use `POST /reset` to clear namespace state

---

## Execution

### `POST /execute`

Execute code and return result when complete.

**Request:**

```json
{
  "code": "import pandas as pd\ndf = pd.read_csv('data.csv')\ndf.head()",
  "storeHistory": true,
  "silent": false,
  "assetDir": "/tmp/assets",
  "execId": "cell-123-exec-1",
  "cellId": "cell-123",
  "cellMeta": {
    "global": false,
    "async": true
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | required | Code to execute |
| `storeHistory` | boolean | `true` | Add to execution history |
| `silent` | boolean | `false` | Suppress output |
| `assetDir` | string | | Where to save figures/assets |
| `execId` | string | | Links assets to this execution |
| `cellId` | string | | Links to document cell |
| `cellMeta` | object | | Metadata from code fence |

**Response:**

```json
{
  "success": true,

  "stdout": "Loading data...\n",
  "stderr": "",
  "result": "   col1  col2\n0     1     2\n1     3     4",

  "error": null,

  "displayData": [
    {
      "data": {
        "text/plain": "   col1  col2\n0     1     2",
        "text/html": "<table>...</table>"
      },
      "metadata": {}
    }
  ],

  "assets": [
    {
      "path": "/tmp/assets/figure-1.png",
      "url": "/mrp/v1/assets/figure-1.png",
      "mimeType": "image/png",
      "assetType": "image",
      "size": 45678
    }
  ],

  "executionCount": 43,
  "duration": 234,

  "imports": ["pandas"]
}
```

**Error Response:**

```json
{
  "success": false,
  "stdout": "",
  "stderr": "",
  "result": null,

  "error": {
    "type": "NameError",
    "message": "name 'foo' is not defined",
    "traceback": [
      "Traceback (most recent call last):",
      "  File \"<stdin>\", line 1, in <module>",
      "NameError: name 'foo' is not defined"
    ],
    "line": 1,
    "column": 0
  },

  "executionCount": 43,
  "duration": 12
}
```

### `POST /execute/stream`

Execute code with SSE streaming output.

**Request:** Same as `/execute`

**Response:** `Content-Type: text/event-stream`

```
event: start
data: {"execId":"cell-123-exec-1","timestamp":"2024-01-15T12:00:00Z"}

event: stdout
data: {"content":"Loading","accumulated":"Loading"}

event: stdout
data: {"content":" data...\n","accumulated":"Loading data...\n"}

event: stderr
data: {"content":"Warning: deprecated\n","accumulated":"Warning: deprecated\n"}

event: display
data: {"data":{"text/html":"<table>...</table>"},"metadata":{}}

event: asset
data: {"path":"/tmp/figure.png","url":"/mrp/v1/assets/figure.png","mimeType":"image/png","assetType":"image"}

event: result
data: {"success":true,"stdout":"Loading data...\n","result":"...","executionCount":43,"duration":234}

event: done
data: {}
```

**Event Types:**

| Event | Description |
|-------|-------------|
| `start` | Execution started |
| `stdout` | Standard output chunk |
| `stderr` | Standard error chunk |
| `stdin_request` | Runtime needs user input |
| `display` | Rich display output (HTML, images, etc.) |
| `asset` | File saved to disk |
| `result` | Final execution result |
| `error` | Execution error |
| `done` | Stream complete |

### Interactive Input

When code calls `input()` (Python), `readline` (Node), or similar, the runtime sends a `stdin_request` event and waits for input.

**`stdin_request` event:**

```
event: stdin_request
data: {"prompt":"Enter your name: ","password":false,"exec_id":"exec-123"}
```

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | Text to display before input cursor |
| `password` | boolean | If true, hide typed characters |
| `exec_id` | string | Links to current execution |

The client must send input back via `POST /input`:

### `POST /input`

Send user input to a waiting execution.

**Request:**

```json
{
  "session": "default",
  "exec_id": "exec-123",
  "text": "Alice\n"
}
```

Note: Include the newline (`\n`) if the input should be submitted. For character-by-character input (rare), omit the newline.

**Response:**

```json
{
  "accepted": true
}
```

If no execution is waiting for input:

```json
{
  "accepted": false,
  "error": "No pending input request"
}
```

### `POST /input/cancel`

Cancel a pending input request. Called when the user dismisses the input field without providing input (e.g., cancels the execution, presses Escape, navigates away).

**Request:**

```json
{
  "session": "default",
  "exec_id": "exec-123"
}
```

**Response:**

```json
{
  "cancelled": true
}
```

If no execution is waiting for input:

```json
{
  "cancelled": false,
  "error": "No pending input request"
}
```

**When to call:**

- User presses Escape in the input field
- User cancels/interrupts the cell execution
- User navigates away from the cell
- Input field is dismissed for any reason without submitting

This unblocks the runtime's waiting thread and allows it to return an error result indicating the input was cancelled.

**Typical flow (input submitted):**

```
1. Client: POST /execute/stream { code: "name = input('Name: ')" }
2. Server: event: stdout, data: {"content": "Name: ", ...}
3. Server: event: stdin_request, data: {"prompt": "", "password": false, ...}
4. Client: [Shows input cursor in output area]
5. User types: "Alice" + Enter
6. Client: POST /input { text: "Alice\n", exec_id: "..." }
7. Server: event: stdout, data: {"content": "Alice\n", ...}  (echo)
8. Server: Execution continues...
9. Server: event: result, data: {...}
10. Server: event: done
```

**Typical flow (input cancelled):**

```
1. Client: POST /execute/stream { code: "name = input('Name: ')" }
2. Server: event: stdout, data: {"content": "Name: ", ...}
3. Server: event: stdin_request, data: {"prompt": "", "password": false, "exec_id": "exec-123"}
4. Client: [Shows input cursor in output area]
5. User presses Escape (or cancels execution)
6. Client: POST /input/cancel { exec_id: "exec-123" }
7. Server: Execution unblocks with InputCancelledError
8. Server: event: error, data: {"type": "InputCancelled", "message": "Input cancelled by user"}
9. Server: event: done
```

### `POST /interrupt`

Cancel running execution.

**Request:**

```json
{
  "session": "default"
}
```

**Response:**

```json
{
  "interrupted": true
}
```

---

## Completion

### `POST /complete`

Get completions at cursor position. Uses live session state, so completions know actual variable values.

**Request:**

```json
{
  "code": "df.hea",
  "cursor": 6,
  "session": "default",
  "triggerKind": "invoked",
  "triggerCharacter": null
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | required | Code in cell |
| `cursor` | number | required | Cursor position (character offset) |
| `session` | string | `"default"` | Session ID |
| `triggerKind` | string | `"invoked"` | `"invoked"`, `"character"`, `"incomplete"` |
| `triggerCharacter` | string | | Character that triggered (`.`, `[`, etc.) |

**Response:**

```json
{
  "matches": [
    {
      "label": "head",
      "insertText": "head()",
      "kind": "method",
      "detail": "(n=5) -> DataFrame",
      "documentation": "Return the first n rows.",
      "valuePreview": null,
      "type": "method"
    },
    {
      "label": "headers",
      "kind": "property",
      "detail": "list[str]",
      "valuePreview": "['col1', 'col2', 'col3']",
      "type": "list"
    }
  ],
  "cursorStart": 3,
  "cursorEnd": 6,
  "source": "runtime"
}
```

**Completion Kinds:**

`variable`, `function`, `method`, `property`, `class`, `module`, `keyword`, `constant`, `field`, `value`

**Source Values:**

| Source | Description |
|--------|-------------|
| `runtime` | From live session (knows actual values) |
| `lsp` | From fallback language server |
| `static` | From static analysis |

---

## Introspection

### `POST /inspect`

Get detailed information about a symbol.

**Request:**

```json
{
  "code": "df.head",
  "cursor": 7,
  "session": "default",
  "detail": 1
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | required | Code in cell |
| `cursor` | number | required | Cursor position |
| `session` | string | `"default"` | Session ID |
| `detail` | number | `0` | Detail level: 0=signature, 1=+docs, 2=+source |

**Response:**

```json
{
  "found": true,
  "source": "runtime",

  "name": "head",
  "kind": "method",
  "type": "method",

  "signature": "(n: int = 5) -> DataFrame",
  "docstring": "Return the first `n` rows.\n\nThis function returns the first `n` rows for the object based\non position...",

  "sourceCode": "def head(self, n: int = 5) -> DataFrame:\n    ...",
  "file": "/usr/lib/python3.11/site-packages/pandas/core/frame.py",
  "line": 1234,

  "value": "<bound method DataFrame.head>",
  "children": null
}
```

### `POST /hover`

Quick tooltip info (lightweight inspect).

**Request:**

```json
{
  "code": "df",
  "cursor": 2,
  "session": "default"
}
```

**Response:**

```json
{
  "found": true,
  "name": "df",
  "type": "DataFrame",
  "value": "<1000 rows × 5 cols>",
  "signature": null
}
```

---

## Variables

### `POST /variables`

List all variables in session namespace.

**Request:**

```json
{
  "session": "default",
  "filter": {
    "types": ["DataFrame", "ndarray"],
    "namePattern": "^[^_]",
    "excludePrivate": true
  }
}
```

All filter fields are optional.

**Response:**

```json
{
  "variables": [
    {
      "name": "df",
      "type": "DataFrame",
      "value": "<1000 rows × 5 cols>",
      "size": "45.2 KB",
      "expandable": true,
      "shape": [1000, 5],
      "dtype": null,
      "length": null,
      "keys": null
    },
    {
      "name": "x",
      "type": "int",
      "value": "42",
      "size": null,
      "expandable": false
    },
    {
      "name": "results",
      "type": "dict",
      "value": "{...}",
      "size": "3 items",
      "expandable": true,
      "length": 3,
      "keys": ["accuracy", "precision", "recall"]
    }
  ],
  "count": 3,
  "truncated": false
}
```

### `POST /variables/{name}`

Get detailed info about a variable, including children for expandable objects.

**Request:**

```json
{
  "session": "default",
  "path": ["columns"],
  "maxChildren": 100,
  "maxValueLength": 1000
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `session` | string | `"default"` | Session ID |
| `path` | string[] | `[]` | Drill-down path: `["key", "0", "attr"]` |
| `maxChildren` | number | `100` | Max children to return |
| `maxValueLength` | number | `1000` | Max chars for value repr |

**Response:**

```json
{
  "name": "columns",
  "type": "Index",
  "value": "Index(['col1', 'col2', 'col3', 'col4', 'col5'], dtype='object')",
  "size": null,
  "expandable": true,
  "length": 5,

  "fullValue": "Index(['col1', 'col2', 'col3', 'col4', 'col5'], dtype='object')",
  "children": [
    { "name": "0", "type": "str", "value": "'col1'", "expandable": false },
    { "name": "1", "type": "str", "value": "'col2'", "expandable": false },
    { "name": "2", "type": "str", "value": "'col3'", "expandable": false },
    { "name": "3", "type": "str", "value": "'col4'", "expandable": false },
    { "name": "4", "type": "str", "value": "'col5'", "expandable": false }
  ],
  "methods": ["tolist", "to_numpy", "unique", "..."],
  "attributes": ["name", "dtype", "shape"],
  "truncated": false
}
```

---

## Code Analysis

### `POST /is_complete`

Check if code is a complete statement (for multiline input).

**Request:**

```json
{
  "code": "def foo():\n    pass",
  "session": "default"
}
```

**Response:**

```json
{
  "status": "complete",
  "indent": ""
}
```

**Status Values:**

| Status | Description |
|--------|-------------|
| `complete` | Code can be executed |
| `incomplete` | Needs more input (open bracket, block, etc.) |
| `invalid` | Syntax error |
| `unknown` | Can't determine |

### `POST /format`

Format code (if supported).

**Request:**

```json
{
  "code": "x=1+2",
  "session": "default"
}
```

**Response:**

```json
{
  "formatted": "x = 1 + 2",
  "changed": true
}
```

---

## Assets

### `GET /assets/{path}`

Serve saved assets (figures, HTML files, etc.).

Returns the file with appropriate `Content-Type` header.

---

## Terminal Output and ANSI Handling

### Raw Output Preservation

**Critical:** Servers MUST preserve raw escape sequences in output. The protocol transmits output as-is, including:

- ANSI color codes (`\x1b[31m` for red, etc.)
- Cursor movement (`\x1b[A` up, `\x1b[B` down, `\x1b[C` right, `\x1b[D` left)
- Line clearing (`\x1b[K` clear to end, `\x1b[2K` clear line)
- Carriage returns (`\r`) for progress bar updates
- SGR styling (bold, italic, underline)

```
# What tqdm sends:
"Downloading: 50%|█████     | 50/100\r"
"Downloading: 75%|███████   | 75/100\r"
"Downloading: 100%|██████████| 100/100\n"

# Server sends exactly this (raw) in stdout events
# Client processes \r to overwrite previous content
```

### Client-Side Processing

Clients SHOULD implement a terminal buffer that:

1. **Tracks cursor position** - Row and column
2. **Handles carriage return** - `\r` moves cursor to column 0 (same line)
3. **Handles newline** - `\n` moves to next line
4. **Handles cursor movement** - `\x1b[nA/B/C/D` moves cursor
5. **Preserves styles** - SGR codes (`\x1b[1m` bold, `\x1b[31m` red, etc.)

This allows progress bars (tqdm, rich, etc.) to display correctly during streaming.

### Output Modes

The `stdout` and `stderr` events include both incremental and accumulated output:

```json
{
  "stream": "stdout",
  "content": "new chunk",
  "accumulated": "all output so far"
}
```

- **`content`** - Just the new bytes since last event
- **`accumulated`** - Complete output with escape sequences applied

For simple clients, use `accumulated` directly. For full terminal emulation, process `content` incrementally through a terminal buffer.

### Final vs Live Output

During execution, output may contain intermediate states (progress bars updating). The `result` event contains the final output state:

```json
{
  "success": true,
  "stdout": "Final output with progress bars resolved",
  "stderr": "",
  ...
}
```

Clients MAY choose to:
1. Show raw streaming output during execution (live progress bars)
2. Replace with final output from `result` event when done
3. Or keep the terminal buffer state (both work)

### ANSI to HTML

For rendering in HTML, clients convert ANSI codes to styled spans:

```
Input:  "\x1b[1;31mError:\x1b[0m File not found"
Output: <span class="bold red">Error:</span> File not found
```

Standard color codes:

| Code | Foreground | Code | Background |
|------|------------|------|------------|
| 30-37 | Standard colors | 40-47 | Standard colors |
| 90-97 | Bright colors | 100-107 | Bright colors |
| 38;5;n | 256-color | 48;5;n | 256-color |
| 38;2;r;g;b | 24-bit RGB | 48;2;r;g;b | 24-bit RGB |

Style codes: 1 (bold), 2 (dim), 3 (italic), 4 (underline), 7 (inverse), 9 (strikethrough), 0 (reset)

---

## Runtime Implementations

### Expected Capabilities by Language

| Feature | Python | Node.js | Browser JS | Bash |
|---------|--------|---------|------------|------|
| execute | ✅ | ✅ | ✅ | ✅ |
| executeStream | ✅ | ✅ | ✅ | ✅ |
| interrupt | ✅ | ✅ | ✅ | ✅ |
| complete | ✅ | ✅ | ✅ | ⚠️ compgen |
| inspect | ✅ | ✅ | ✅ | ❌ |
| hover | ✅ | ✅ | ✅ | ⚠️ |
| variables | ✅ | ✅ | ✅ | ⚠️ env only |
| variableExpand | ✅ | ✅ | ✅ | ❌ |
| reset | ✅ | ✅ | ✅ | ⚠️ |
| isComplete | ✅ | ✅ | ✅ | ⚠️ |
| format | ✅ black | ✅ prettier | ✅ prettier | ❌ |
| assets | ✅ | ✅ | ⚠️ blob URLs | ❌ |

### Python Implementation Notes

- Use `IPython` or raw `exec()` with captured globals
- Completions: `jedi` or `IPython.core.completer`
- Inspect: `inspect` module
- Format: `black` or `autopep8`
- Figures: hook `matplotlib.pyplot.show()` to save to `assetDir`

### JavaScript Implementation Notes

- **Node.js**: Use `vm.createContext()` for isolation
- **Browser**: Use `Worker` or `iframe` sandbox
- Completions: enumerate object properties with `Object.keys()`, `Object.getOwnPropertyNames()`
- Inspect: `typeof`, `toString()`, function `.toString()` for source
- Make top-level await work (wrap in async IIFE or use vm with `--experimental-vm-modules`)

### Bash Implementation Notes

- Limited introspection (it's a shell)
- Completions: `compgen -A function -abck`
- Variables: parse `set` and `env` output
- No real "session" state beyond environment variables

---

## Client Integration

### Connecting to a Runtime

```javascript
// 1. Discover capabilities
const caps = await fetch('/mrp/v1/capabilities').then(r => r.json());

// 2. Adapt UI to capabilities
if (caps.features.complete) {
  enableAutocompletion();
}
if (caps.features.variables) {
  showVariableExplorer();
}

// 3. Execute code
const result = await fetch('/mrp/v1/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: 'print("hello")' }),
}).then(r => r.json());
```

### Streaming Execution

```javascript
const response = await fetch('/mrp/v1/execute/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7);
    } else if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      handleEvent(currentEvent, data);
    }
  }
}
```

### Fallback Strategy

```javascript
async function complete(code, cursor) {
  const caps = await getCapabilities();

  if (caps.features.complete) {
    // Try runtime first (knows live values)
    return fetch('/mrp/v1/complete', { ... });
  } else if (caps.lspFallback) {
    // Fall back to LSP
    return lspClient.complete(code, cursor);
  } else {
    // No completions available
    return { matches: [], source: 'none' };
  }
}
```

---

## Document Integration

### YAML Frontmatter

Notebooks can declare runtime configuration in frontmatter:

```yaml
---
title: Sales Analysis
mrmd:
  runtime: python
  python: ">=3.11"
  dependencies:
    - pandas>=2.0
    - matplotlib
    - numpy
  environment:
    PYTHONPATH: ./lib
---
```

### UV Script Export

A notebook with Python cells can be exported to a UV script:

```python
#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pandas>=2.0",
#   "matplotlib",
#   "numpy",
# ]
# ///

# Cell 1
import pandas as pd
df = pd.read_csv('sales.csv')

# Cell 2
df.head()
```

The `imports` field in execution results helps track dependencies automatically.

---

## Integration Models

MRP defines the protocol between client and runtime. How output is consumed depends on the integration architecture:

### Direct Rendering (test/simple apps)

```
┌─────────┐      HTTP/SSE      ┌─────────┐
│ Browser │ ←──────────────→  │ Runtime │
│  (UI)   │                    │  (MRP)  │
└─────────┘                    └─────────┘
     ↓
  Renders output directly
```

Client makes HTTP calls to runtime, receives responses, and renders output directly in the UI. Simple and suitable for testing or single-user apps.

### Yjs Document Integration (mrmd - recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Yjs Document                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ # Analysis                                                 │  │
│  │ ```python                                                  │  │
│  │ df.head()                                                  │  │
│  │ ```                                                        │  │
│  │ ```output                                                  │  │
│  │    col1  col2  ← written here via Yjs                     │  │
│  │ 0  ...   ...                                               │  │
│  │ ```                                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Awareness (ephemeral state):                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ User A: { cursor: 45, hover: {df, DataFrame...} }         │  │
│  │ User B: { cursor: 120, autocomplete: {df.he, [head...]} } │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │Browser A│    │Browser B│    │ Runtime │
    │(human)  │    │(human)  │    │  (MRP)  │
    └─────────┘    └─────────┘    └─────────┘
```

In collaborative mode:

1. **Execution output → Yjs document**
   - `stdout`/`stderr` events are written to `output` code blocks in the document
   - All connected clients see output via Yjs sync
   - Runtime doesn't need to know about multiple users

2. **Hover/autocomplete → Awareness broadcast**
   - Results from `/hover` and `/complete` are shown locally
   - Optionally broadcast via Yjs Awareness for collaborative features
   - Example: "User A is inspecting: df (DataFrame)"

3. **stdin_request → Document cursor**
   - When runtime needs input, cursor appears in document
   - User types in document, input sent back to runtime
   - Others see the input cursor via Awareness

**Key insight:** The runtime is stateless about users. It just:
1. Receives execute/complete/hover requests
2. Returns results
3. Doesn't care who triggered the request or how output is consumed

The sharing and collaboration is handled entirely by Yjs in the clients.

### Implementation Pattern

```javascript
// Low-level: just HTTP calls
const client = new MRPClient(endpoint);

// High-level: writes to Yjs, broadcasts Awareness
const adapter = new MRPYjsAdapter(client, ydoc, awareness);
adapter.execute(code, cellId); // output goes to doc automatically
adapter.hover(pos);            // result broadcast via awareness
```

---

## Versioning

The protocol version is in the URL path: `/mrp/v1/`.

Breaking changes require a version bump. Additive changes (new optional fields, new endpoints) are backwards compatible.
