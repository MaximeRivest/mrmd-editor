# Config Architecture

The editor's state is split into two distinct parts:

- **Config** - What you declare. Serializable. Changing it reconfigures the editor.
- **State** - What you observe. Derived from running instances. Read-only.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CONFIG                                      │
│  You write → Editor reads → Creates instances                           │
│  Serializable. Save it, restore it, get the same editor.                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ creates
┌─────────────────────────────────────────────────────────────────────────┐
│                         INTERNAL INSTANCES                               │
│  WebsocketProvider, MRPClient, Session, EditorView, etc.                │
│  Not exposed. Not serializable. Recreated from config.                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ produces
┌─────────────────────────────────────────────────────────────────────────┐
│                              STATE                                       │
│  Editor writes → You read                                               │
│  Observable. Some serializable (history), some ephemeral (variables).   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Config Schema

Everything you can configure. All fields are optional with sensible defaults.

```typescript
interface EditorConfig {
  // ═══════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════
  drive?: {
    url: string;              // 'ws://localhost:4444'
    auth?: string;            // Auth token
  };

  document?: {
    path?: string;            // 'notes/readme.md' - path on drive
    content?: string;         // Initial content (only if no drive or new file)
  };

  // ═══════════════════════════════════════════════════════════════════════
  // APPEARANCE
  // ═══════════════════════════════════════════════════════════════════════
  appearance?: {
    dark?: boolean | null;    // true/false/null(system). Default: null
    readonly?: boolean;       // Default: false
    placeholder?: string;     // Default: 'Start typing...'
  };

  // ═══════════════════════════════════════════════════════════════════════
  // USER / IDENTITY
  // ═══════════════════════════════════════════════════════════════════════
  user?: {
    name?: string;            // Default: 'Anonymous'
    color?: string;           // Default: random
    type?: 'human' | 'ai' | 'runtime' | 'sync';  // Default: 'human'
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RUNTIMES
  // Each runtime has a type and type-specific config
  // ═══════════════════════════════════════════════════════════════════════
  runtimes?: {
    [name: string]: RuntimeConfig;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // AI ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════
  ai?: {
    endpoints?: AIEndpointConfig[];
    default?: string;         // Default endpoint ID
  };

  // ═══════════════════════════════════════════════════════════════════════
  // AWARENESS / COLLABORATION UI
  // ═══════════════════════════════════════════════════════════════════════
  awareness?: {
    enabled?: boolean;        // Default: true
    showCursors?: boolean;    // Default: true
    showNames?: boolean;      // Default: true
    showActivity?: boolean;   // Default: true (typing indicators, etc.)
  };

  // ═══════════════════════════════════════════════════════════════════════
  // DEV PANEL
  // ═══════════════════════════════════════════════════════════════════════
  devPanel?: boolean | {
    enabled?: boolean;        // Default: false
    startOpen?: boolean;      // Default: false
    position?: 'bottom' | 'right';  // Default: 'bottom'
    maxHeight?: number;       // Default: 300
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME CONFIGS
// ═══════════════════════════════════════════════════════════════════════════

type RuntimeConfig =
  | BuiltinRuntimeConfig
  | MRPRuntimeConfig
  | CustomRuntimeConfig;

interface BuiltinRuntimeConfig {
  type: 'builtin';
  // No additional config needed - uses mrmd-js
}

interface MRPRuntimeConfig {
  type: 'mrp';
  url: string;                // 'http://localhost:8000/mrp/v1'
  // Future: auth, timeout, etc.
}

interface CustomRuntimeConfig {
  type: 'custom';
  instance: RuntimeInstance;  // NOT serializable - for programmatic use
}

// ═══════════════════════════════════════════════════════════════════════════
// AI ENDPOINT CONFIGS
// ═══════════════════════════════════════════════════════════════════════════

interface AIEndpointConfig {
  id: string;
  type: 'chat' | 'completion' | 'transcription' | 'code';
  provider: 'openai' | 'anthropic' | 'local' | 'custom';
  url?: string;               // For custom endpoints
  model?: string;             // 'gpt-4', 'claude-sonnet-4-20250514', etc.
  // Note: API keys should NOT be in config - use environment or secure storage
}
```

---

## State Schema

Everything you can observe. Read-only. Updated automatically by the editor.

```typescript
interface EditorState {
  // ═══════════════════════════════════════════════════════════════════════
  // CONNECTION STATE
  // ═══════════════════════════════════════════════════════════════════════
  connection: {
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    latency?: number;         // ms
    reconnectAttempts?: number;
    lastConnected?: number;   // timestamp
    error?: string;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // DOCUMENT STATE
  // ═══════════════════════════════════════════════════════════════════════
  document: {
    dirty: boolean;           // Has unsaved changes
    path?: string;            // Current path (from config or drive)
    size: number;             // Character count
    lines: number;            // Line count
    words: number;            // Word count
    cells: number;            // Code cell count
    lastModified?: number;    // timestamp

    // Edit history (from Yjs UndoManager)
    canUndo: boolean;         // Is undo available?
    canRedo: boolean;         // Is redo available?
    undoDepth: number;        // Number of undo steps available
    redoDepth: number;        // Number of redo steps available
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RUNTIME STATE
  // Status of each configured runtime
  // ═══════════════════════════════════════════════════════════════════════
  runtimes: {
    [name: string]: {
      status: 'initializing' | 'ready' | 'busy' | 'error' | 'stopped';
      languages: string[];    // Languages this runtime supports
      error?: string;
      // For MRP runtimes with capability reporting:
      version?: string;
      capabilities?: string[];
    };
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SESSION STATE
  // Execution sessions within runtimes
  // ═══════════════════════════════════════════════════════════════════════
  sessions: {
    [id: string]: {
      runtime: string;        // Which runtime this session belongs to
      language: string;
      executionCount: number;
      lastActivity?: number;  // timestamp
    };
  };

  // ═══════════════════════════════════════════════════════════════════════
  // VARIABLES
  // Variables in scope, grouped by session
  // ═══════════════════════════════════════════════════════════════════════
  variables: {
    [sessionId: string]: {
      [name: string]: VariableInfo;
    };
  };

  // ═══════════════════════════════════════════════════════════════════════
  // EXECUTION HISTORY
  // Record of cell executions
  // ═══════════════════════════════════════════════════════════════════════
  history: ExecutionRecord[];

  // ═══════════════════════════════════════════════════════════════════════
  // COLLABORATORS
  // Who's connected (from Yjs Awareness)
  // ═══════════════════════════════════════════════════════════════════════
  collaborators: CollaboratorInfo[];

  // ═══════════════════════════════════════════════════════════════════════
  // CURRENT EXECUTION
  // What's running right now (null if idle)
  // ═══════════════════════════════════════════════════════════════════════
  execution: {
    cellIndex: number;
    language: string;
    startTime: number;
    progress?: number;        // 0-1
    progressText?: string;    // '47/100'
  } | null;

  // ═══════════════════════════════════════════════════════════════════════
  // AI STATE
  // ═══════════════════════════════════════════════════════════════════════
  ai: {
    activeEndpoint?: string;
    endpoints: {
      [id: string]: {
        status: 'unconfigured' | 'available' | 'error';
        error?: string;
      };
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORTING TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface VariableInfo {
  type: string;               // 'number', 'string', 'DataFrame', etc.
  preview: string;            // Short preview: '42', '"hello"', '<1000 rows>'
  size?: number;              // Bytes or element count
  expandable?: boolean;       // Can drill down
}

interface ExecutionRecord {
  id: string;
  cellIndex: number;
  language: string;
  codePreview: string;        // First ~100 chars
  success: boolean;
  error?: string;
  startTime: number;
  duration: number;           // ms
  sessionId?: string;
}

interface CollaboratorInfo {
  clientId: number;
  name: string;
  color: string;
  type: 'human' | 'ai' | 'runtime' | 'sync';
  status: 'idle' | 'typing' | 'executing' | 'streaming';
  cursor?: { line: number; ch: number };
}
```

---

## Data Flow

### Config → Editor (Reactive)

When config changes, the editor reacts:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CONFIG CHANGE                         EDITOR REACTION                  │
├─────────────────────────────────────────────────────────────────────────┤
│  config.appearance.dark = true    →    Apply dark theme                 │
│  config.appearance.readonly = true →   Set EditorState.readOnly         │
│  config.user.name = 'Bob'         →    Update Awareness localState      │
│  config.runtimes.julia = {...}    →    Create & register new runtime    │
│  delete config.runtimes.python    →    Dispose runtime, update state    │
│  config.drive.url = 'ws://...'    →    Disconnect, reconnect to new URL │
│  config.document.path = 'new.md'  →    Load new document from drive     │
└─────────────────────────────────────────────────────────────────────────┘
```

Implementation: Use `Proxy` to intercept sets and trigger handlers.

```javascript
// Simplified example
const config = new Proxy(rawConfig, {
  set(target, prop, value) {
    target[prop] = value;
    configHandlers[prop]?.(value);  // Trigger reconfiguration
    emit('configChange', { prop, value });
    return true;
  }
});
```

### Editor Events → State (Automatic)

Editor events automatically update state:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EDITOR EVENT                          STATE UPDATE                     │
├─────────────────────────────────────────────────────────────────────────┤
│  WebSocket connects               →    state.connection.status='connected'│
│  WebSocket latency measured       →    state.connection.latency = 45     │
│  Document edited                  →    state.document.dirty = true       │
│  Document saved                   →    state.document.dirty = false      │
│  Cell execution starts            →    state.execution = {...}           │
│  Cell execution ends              →    state.execution = null            │
│                                        state.history.push(record)        │
│  Variables fetched                →    state.variables[session] = {...}  │
│  Runtime status changes           →    state.runtimes[name].status=...   │
│  Collaborator joins/leaves        →    state.collaborators = [...]       │
└─────────────────────────────────────────────────────────────────────────┘
```

Implementation: Internal event handlers populate state.

```javascript
// Simplified example
execution.on('cellRun', (index, cell) => {
  state.execution = { cellIndex: index, language: cell.language, startTime: Date.now() };
});

execution.on('cellComplete', (index, result) => {
  state.history.push({ id: genId(), cellIndex: index, success: result.success, ... });
  state.execution = null;
});
```

---

## Serialization

### What's Serializable

| Data | Serializable | Notes |
|------|--------------|-------|
| `config.*` | ✅ Yes | Except `runtimes[x].instance` for custom runtimes |
| `state.document` | ✅ Yes | But content is in Yjs, not state |
| `state.history` | ✅ Yes | Useful to persist |
| `state.connection` | ❌ No | Ephemeral - reconnect from config |
| `state.runtimes` | ❌ No | Ephemeral - recreate from config |
| `state.sessions` | ❌ No | Ephemeral - recreate on execution |
| `state.variables` | 🔶 Maybe | Could persist, but usually stale |
| `state.collaborators` | ❌ No | Live presence data |
| `state.execution` | ❌ No | Current execution is transient |

### Save/Restore Pattern

```javascript
// Save
const savedState = {
  config: editor.config,
  history: editor.state.history,  // Optional: persist history
};
localStorage.setItem('editor', JSON.stringify(savedState));

// Restore
const saved = JSON.parse(localStorage.getItem('editor'));
const editor = mrmd.create('#editor', saved.config);
// History could be re-imported if we add an API for that
```

---

## API Surface

### Creating an Editor

```javascript
// Minimal
const editor = mrmd.create('#editor');

// With config
const editor = mrmd.create('#editor', {
  document: { content: '# Hello' },
  appearance: { dark: true },
});

// With drive
const editor = mrmd.create('#editor', {
  drive: { url: 'ws://localhost:4444' },
  document: { path: 'notes/readme.md' },
  runtimes: {
    python: { type: 'mrp', url: 'http://localhost:8000/mrp/v1' }
  },
  devPanel: true
});

// Or using drive() helper (same result, different syntax)
const docs = mrmd.drive('ws://localhost:4444');
const editor = await docs.open('notes/readme.md', '#editor', {
  runtimes: { python: { type: 'mrp', url: '...' } },
  devPanel: true
});
```

### Accessing Config and State

```javascript
// Read config
console.log(editor.config.appearance.dark);  // true

// Modify config (reactive - changes editor immediately)
editor.config.appearance.dark = false;
editor.config.runtimes.julia = { type: 'mrp', url: '...' };
delete editor.config.runtimes.python;

// Read state (read-only)
console.log(editor.state.connection.status);  // 'connected'
console.log(editor.state.variables);          // { session1: { x: {...} } }
console.log(editor.state.history.length);     // 5

// This should error or no-op:
editor.state.connection.status = 'error';  // ❌ State is read-only
```

### Subscribing to Changes

```javascript
// Subscribe to config changes
editor.onConfigChange((prop, value, oldValue) => {
  console.log(`Config ${prop} changed:`, oldValue, '→', value);
});

// Subscribe to state changes
editor.onStateChange((prop, value) => {
  console.log(`State ${prop} updated:`, value);
});

// Or specific state
editor.onStateChange('connection.status', (status) => {
  showConnectionIndicator(status);
});

editor.onStateChange('history', (history) => {
  console.log('New execution:', history[history.length - 1]);
});
```

---

## Dev Panel Integration

The dev panel shows both config and state:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📊 Editor Context                                          [▼ Collapse] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ⚙️ CONFIG                                                    [Edit]     │
│ ├─ drive: ws://localhost:4444                                           │
│ ├─ document.path: notes/readme.md                                       │
│ ├─ appearance: { dark: true, readonly: false }                          │
│ ├─ user: { name: 'Maxime', color: '#3b82f6' }                          │
│ └─ runtimes: { javascript: builtin, python: mrp }                       │
│                                                                         │
│ 📡 STATE                                                                │
│ ├─ connection: connected (45ms)                              [●]        │
│ ├─ document: { dirty: false, 234 lines, 5 cells }                      │
│ ├─ runtimes:                                                            │
│ │   ├─ javascript: ready                                     [●]        │
│ │   └─ python: ready                                         [●]        │
│ ├─ variables: 3 across 1 session                            [▶]        │
│ ├─ history: 7 executions (100% success)                     [▶]        │
│ └─ collaborators: 2 online                                  [▶]        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The existing `ui/panel.js` and `ui/renderers.js` can be adapted to render this.

---

## Migration from Current API

The current API remains valid - config is just a structured way to pass the same options:

```javascript
// CURRENT (still works)
const editor = mrmd.create('#editor', {
  doc: '# Hello',
  dark: true,
  userName: 'Maxime',
  runtimes: { python: pythonRuntime }
});

// NEW (structured config)
const editor = mrmd.create('#editor', {
  document: { content: '# Hello' },
  appearance: { dark: true },
  user: { name: 'Maxime' },
  runtimes: { python: { type: 'mrp', url: '...' } }
});
```

The `create()` function normalizes flat options into structured config internally.

---

## Implementation Plan

### Phase 1: Config Schema & Reactivity
1. Create `src/config/schema.js` - Type definitions
2. Create `src/config/reactive.js` - Reactive proxy wrapper
3. Create `src/config/handlers.js` - Config change handlers

### Phase 2: State Management
1. Create `src/state/schema.js` - State type definitions
2. Create `src/state/manager.js` - State container with change events
3. Wire state updates to existing editor events

### Phase 3: Integrate into Editor
1. Modify `create()` to accept structured config
2. Expose `editor.config` (reactive) and `editor.state` (read-only)
3. Maintain backward compatibility with flat options

### Phase 4: Dev Panel
1. Adapt existing `ui/panel.js` to render config + state
2. Add edit capability for config fields
3. Add state visualization with expand/collapse

### Phase 5: Documentation
1. Update API.md with new config/state API
2. Add examples for save/restore
3. Add migration guide

---

## Design Decisions

1. **Document content location:** Keep in Yjs (source of truth), not in state.
   Access via `editor.getContent()`. `state.document` has metadata only.

2. **Config reactivity:** Deep reactivity. `config.appearance.dark = true` works.

3. **Execution history persistence:** Ephemeral by default (clears on reload).
   Users can serialize `state.history` themselves if they want persistence.

4. **Runtime config:** Support both declarative (`{ type: 'mrp', url }` - serializable)
   and instance (pass actual runtime object - not serializable).

5. **Edit history (undo/redo):** Managed by Yjs UndoManager (already implemented).
   Exposed in state as `document.canUndo`, `document.canRedo`, `undoDepth`, `redoDepth`.
   Methods `editor.undo()` and `editor.redo()` for programmatic access.
