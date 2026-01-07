# mrmd Vision

A markdown editor where humans, code, and AI all collaborate through the same interface.

## Core Principle

The document is just text. Everything writes to it like a human would:
- **Human** → keyboard → insert/replace text
- **Code cells** → runtime → stream output as text
- **AI/LLM** → API → stream response as text
- **Other browsers** → network → Yjs sync

They're all collaborators. The only difference is the transport.

---

## The Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Developer's App                                                            │
│  (Obsidian-like, Jupyter-like, Notion-like, whatever they imagine)         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  mrmd (editor)                                                              │
│  - Markdown editing with blur→render / focus→source                         │
│  - Code blocks with syntax highlighting                                     │
│  - Streaming writes (AI, code output)                                       │
│  - Theming API                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│  mrmd-sync        │ │  mrmd-python      │ │  mrmd-llm         │
│                   │ │                   │ │                   │
│  - File sync      │ │  - Pyodide/IPython│ │  - OpenAI         │
│  - Collab         │ │  - Language server│ │  - Anthropic      │
│  - Storage        │ │  - Hover info     │ │  - Ollama         │
└───────────────────┘ │  - Autocomplete   │ │  - Streaming      │
                      │  - Run cells      │ └───────────────────┘
┌───────────────────┐ │  - Stream output  │ ┌───────────────────┐
│  mrmd-julia       │ └───────────────────┘ │  mrmd-bash        │
│                   │ ┌───────────────────┐ │                   │
│  - Julia runtime  │ │  mrmd-r           │ │  - Shell exec     │
│  - Language server│ │                   │ │  - PTY support    │
│  - Pluto-like     │ │  - R runtime      │ │  - Stream output  │
└───────────────────┘ │  - Language server│ └───────────────────┘
                      └───────────────────┘
```

---

## User Experience: A Document

````markdown
# Analysis of Sales Data

Some introductory text that renders beautifully on blur.

```python
import pandas as pd
df = pd.read_csv('sales.csv')
df.head()
```

```output
   date        product   revenue
0  2024-01-01  Widget A  1250.00
1  2024-01-01  Widget B  890.00
...
```

The data shows interesting trends. Let me visualize:

```python
import matplotlib.pyplot as plt
df.plot(x='date', y='revenue')
plt.show()
```

```output
[rendered chart inline]
```

```julia
# Julia is faster for this simulation
using DifferentialEquations
solve(prob, Tsit5())
```

```output
[julia output streams here]
```

Now let me ask AI to interpret:

```ai
Analyze the trends in the data above and suggest next steps.
```

```output
Based on the sales data, I notice three key patterns:
1. Seasonal variation with Q4 peaks...
2. Widget A consistently outperforms...
3. [AI streams response as if typing]
```
````

---

## Under the Hood

```
User focuses on code cell
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  mrmd detects ```python block                                   │
│  → activates mrmd-python                                        │
│  → language server provides:                                    │
│     • autocomplete (df.  → shows columns)                       │
│     • hover (pandas.DataFrame docstring)                        │
│     • errors (red squiggle on typo)                            │
└─────────────────────────────────────────────────────────────────┘
        │
User hits Cmd+Enter (run cell)
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  mrmd-python                                                    │
│  → executes in Pyodide (browser) or IPython kernel (server)    │
│  → creates writer at end of code block                          │
│  → streams output via Yjs (like a collaborator typing)         │
│                                                                 │
│     writer.write('```output\n')                                │
│     for chunk in execution:                                     │
│         writer.write(chunk)  // appears live in doc            │
│     writer.write('\n```')                                      │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  mrmd-sync                                                      │
│  → Yjs update propagates to:                                    │
│     • Other browser tabs (collab)                               │
│     • The .md file on disk                                      │
│     • Other users watching                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Interactive Features

**Variables persist across cells:**
```python
# Cell 1
x = 42
```
```python
# Cell 2 - x is available
print(x * 2)  # → 84
```

**Hover shows live values:**
```
User hovers over `df` in cell 3
        │
        ▼
┌─────────────────────────────────┐
│ DataFrame: 1,234 rows × 5 cols  │
│ ┌─────┬─────────┬─────────┐    │
│ │ date│ product │ revenue │    │
│ ├─────┼─────────┼─────────┤    │
│ │ ... │   ...   │   ...   │    │
│ └─────┴─────────┴─────────┘    │
│ Memory: 45.2 KB                 │
└─────────────────────────────────┘
```

**Input capture:**
```python
name = input("What's your name? ")
print(f"Hello, {name}!")
```
```output
What's your name? █  ← cursor blinks, user types in output block
```

**ANSI/Progress:**
```python
from tqdm import tqdm
for i in tqdm(range(100)):
    process(i)
```
```output
Processing: 47%|████████████░░░░░░░░| 47/100 [00:23<00:26]
↑ updates in place, animations work
```

---

## Developer Experience

```javascript
import { create } from 'mrmd';
import { python } from 'mrmd-python';
import { julia } from 'mrmd-julia';
import { llm } from 'mrmd-llm';

const editor = create('#app', {
  sync: 'wss://myapp.com/docs/analysis.md',

  runtimes: [
    python({ mode: 'pyodide' }),  // or 'kernel' for server-side
    julia({ server: 'wss://myapp.com/julia' }),
    llm({ provider: 'anthropic', key: process.env.KEY })
  ],

  theme: myCustomTheme,

  shortcuts: {
    'Cmd+Enter': 'runCell',
    'Cmd+Shift+Enter': 'runAllAbove',
  }
});

// That's it. They now have:
// - Collaborative markdown
// - Runnable Python/Julia cells
// - AI that can edit the doc
// - Language servers for each language
// - All synced to a .md file
```

---

## Deployment Modes

### Electron / Local Desktop
```
┌──────────────────────────┐
│  Electron App            │
│  ┌────────────────────┐  │
│  │ mrmd               │  │
│  └─────────┬──────────┘  │
│            ▼             │
│  ┌────────────────────┐  │
│  │ mrmd-sync (embed)  │  │  ← runs in-process
│  └─────────┬──────────┘  │
│            ▼             │
│       ~/Documents/       │  ← just .md files
└──────────────────────────┘
```

### GDocs-like SaaS
```
┌─────────────┐      ┌─────────────────────────────┐
│  Browser    │      │  Your Backend               │
│  ┌───────┐  │      │                             │
│  │ mrmd  │◄─┼─ws──►│  mrmd-sync                  │
│  └───────┘  │      │      │                      │
└─────────────┘      │      ▼                      │
                     │  Storage (S3/Postgres)      │
┌─────────────┐      │      ▲                      │
│  Browser 2  │◄─ws──┤      │                      │
└─────────────┘      │  Auth middleware            │
                     └─────────────────────────────┘
```

### Self-hosted / VPS
```bash
# One command
npx mrmd-sync ./docs/

# Or Docker
docker run -v ./docs:/data -p 4444:4444 mrmd/sync

# Or systemd
npx mrmd-sync --install-systemd
```

---

## The .md File is Truth

```markdown
# My Notebook

Regular markdown. Version controlled. Grep-able.
Opens in any editor. No .ipynb JSON nonsense.

```python
x = 1 + 1
```

```output
2
```

This is the future of notebooks.
```

---

## API Surface

```javascript
// Creation
const editor = mrmd.create(target, {
  doc: string,           // initial content
  sync: string | null,   // websocket URL (optional)
  dark: boolean | null,  // theme
  placeholder: string,   // empty state text
  runtimes: [],          // language runtimes
  theme: {},             // custom theming
  shortcuts: {},         // keybindings
});

// Reading
editor.getContent(): string
editor.stats(): { lines, chars, words }

// Writing (human-like operations)
editor.setContent(text)           // replace all
editor.insert(pos, text)          // insert at position
editor.replace(from, to, text)    // replace range
editor.writer(pos): Writer        // for streaming

// Streaming writer
const w = editor.writer(pos);
w.write('text');   // append at current position
w.end();           // cleanup

// Events
editor.onChange(callback)         // content changed
editor.onSync(callback)           // sync status changed

// Internals (power users)
editor.view      // CodeMirror EditorView
editor.ydoc      // Yjs Y.Doc
editor.ytext     // Yjs Y.Text
```

---

## What Developers Don't Have To Do

| Before mrmd | After mrmd |
|-------------|------------|
| Set up Yjs | `sync: 'wss://...'` |
| Configure y-websocket | handled |
| Handle persistence | mrmd-sync |
| Build file sync logic | automatic |
| Deal with conflicts | Yjs CRDT |
| Manage WebSocket reconnection | handled |
| Build code execution | mrmd-python/julia/r |
| Implement language servers | included |
| Stream AI responses | mrmd-llm |
| Handle ANSI codes | handled |
| Build progress bars | handled |

Developer focuses on: **themes, menus, shortcuts, their app's unique value.**
