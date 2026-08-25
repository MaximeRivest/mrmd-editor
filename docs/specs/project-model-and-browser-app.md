# Project Model & Browser-First App

> Status: Draft for review
> Owner: mrmd-editor
> Companion epics: EPICS.md Epics 11–13
> Supersedes/relocates: the service layer of `mrmd-electron/docs/specs/services.md`
> Reuses: `mrmd-project` (pure logic: FSML, Links, Assets, Project, Search) and
> `mrmd-electron/docs/specs/fsml-filesystem-markup-language.md` (the conventions)

---

## 1. The two ideas this spec merges

**Idea A — the Project model belongs in the editor layer.**
mrmd-editor already holds the *document* in memory (the Yjs text) and syncs it
outward. This spec extends that to the *bundle*: an in-memory JavaScript
model of the project folder — nav tree, sibling pages, assets, links graph,
references — kept in sync with storage the same way the text is. The model is
a **view/cache, never a second source of truth**: truth is plain files
following FSML conventions, readable by vim, GitHub, and strangers' tooling.

This is what gives every wrapper (Electron, mrmd-server, vscode-rat, the
browser app below) one consistent answer to the classic unsolved markdown-app
problems:

1. Where do pasted images / dropped CSVs go? → `_assets/`, deduplicated,
   correct relative path computed for you.
2. Multi-file documents (page-before/page-after)? → `01-` ordering,
   `[[next]]`/`[[prev]]`.
3. Hierarchy, nav, TOC? → derived from the filesystem, zero config.
4. References? → `_bibliography/*.bib`, `[[links]]` that survive renames
   (auto-refactor).
5. Kernel-generated plots? → saved into `_assets/generated/`, inserted as
   valid relative-path markdown (renders on GitHub as-is).

**Idea B — the first mrmd *product* is a browser-only PWA.**
No install, no login, no server account. You visit a URL; the app remembers
you by origin storage; your projects are plain files; code runs in WASM; and
the experience *progressively escalates* to the user's real machine when they
choose to — first by picking a real directory (File System Access API), then
by installing **rat** (one binary) for native kernels.

The Project model is what makes Idea B buildable: the browser app is "just"
the editor + the Project model + two storage adapters + WASM runtimes.

---

## 2. Architecture overview

```
┌────────────────────────────────────────────────────────────────────┐
│  Host app (PWA / Electron / mrmd-server UI / vscode-rat / yours)   │
│  chrome: nav panel, breadcrumbs, Ctrl+P, gallery, settings        │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ consumes
┌──────────────────────────────┴─────────────────────────────────────┐
│  mrmd-editor                                                       │
│  ┌──────────────────────┐   ┌────────────────────────────────────┐ │
│  │ Document (exists)    │   │ Project (NEW)                      │ │
│  │  ydoc / yText        │   │  in-memory model of the bundle     │ │
│  │  CM6 view            │   │  navTree, links, assets, config    │ │
│  │  cells/outputs       │   │  events, refactoring ops           │ │
│  └──────────┬───────────┘   └──────────────────┬─────────────────┘ │
│             │ syncs via                        │ reads/writes via  │
│  ┌──────────┴───────────┐   ┌──────────────────┴─────────────────┐ │
│  │ Sync transport       │   │ ProjectStore (adapter interface)   │ │
│  │ (Yjs provider, opt.) │   │ read/write/move/list/watch         │ │
│  └──────────────────────┘   └──────────────────┬─────────────────┘ │
└────────────────────────────────────────────────┼───────────────────┘
                          implementations:       │
       ┌───────────────┬─────────────────┬───────┴────────┬──────────────┐
       │ MemoryStore   │ OpfsStore       │ FsaStore       │ RemoteStore  │
       │ (tests,       │ (browser,       │ (user-picked   │ (mrmd-server │
       │  ephemeral)   │  zero-perm)     │  real folder,  │  HTTP, or    │
       │               │                 │  Chromium)     │  Electron    │
       │               │                 │                │  IPC bridge) │
       └───────────────┴─────────────────┴────────────────┴──────────────┘
```

Pure logic (path math, link parsing, nav-tree building, fuzzy search) lives
in **`mrmd-project`** — it already exists as a browser-safe, zero-I/O
package. mrmd-editor depends on it; the Project model orchestrates it.

The corresponding correction to `mrmd-electron/docs/specs/services.md`:
ProjectService/FileService/AssetService logic moves *up* into the shared
Project model; Electron keeps only a thin `ProjectStore` implementation over
IPC (`read/write/move/list/watch` against the real FS). SessionService stays
host-side — process management is genuinely not an editor concern.

---

## 3. The `Project` model

### 3.1 Creation

```js
import { openProject } from 'mrmd-editor/project';

const project = await openProject(store, {
  root: '/',                  // path within the store
  watch: true,                // react to external changes (git pull, other tabs)
});
```

`openProject` scans the store, parses `mrmd.md` config blocks (via
`Project.parseConfig`), builds the nav tree (via `FSML.buildNavTree`), and
indexes links and assets. Scanning is incremental and lazy below the first
two levels; a 50k-file folder must open interactively (<100ms to first nav
paint, background completion).

### 3.2 Shape (read side)

```ts
interface ProjectModel {
  root: string;
  config: ProjectConfig;             // merged ```yaml config``` blocks
  navTree: NavNode[];                // FSML-derived, reader labels
  files: FileEntry[];                // FSML-sorted, technical files flagged

  // Document-bundle navigation
  resolveLink(link: string, fromPath: string): Resolution;   // [[link]] → path
  neighbors(path: string): { prev?: string; next?: string; up?: string };

  // Assets
  assets: {
    list(): AssetInfo[];                       // path, hash, size, usedIn[]
    relativePath(assetPath, docPath): string;  // for insertion into markdown
    orphans(): Promise<string[]>;
  };

  // References
  bibliography(): Promise<BibEntry[]>;         // parsed from _bibliography/*.bib

  // Search
  search(query: string): SearchResult[];       // fuzzy, full-path tokens

  // Events
  on(event: 'change'|'nav'|'assets'|'config', cb): Unsubscribe;
}
```

### 3.3 Mutations (write side — every op is a *refactoring* op)

All writes go through the model so link/asset refactoring is automatic and
atomic from the caller's perspective:

```ts
interface ProjectModel {
  createFile(path, content?): Promise<string>;     // FSML auto-prefix in ordered dirs
  createFolder(path): Promise<string>;
  move(from, to): Promise<RefactorResult>;         // updates [[links]] in other
                                                   // files + relative asset paths
                                                   // in the moved file
  rename(path, newName): Promise<RefactorResult>;
  reorder(path, direction|index): Promise<RefactorResult>;  // NN- prefix renumbering
  remove(path): Promise<void>;                     // undoable (in-memory trash)
  duplicate(path): Promise<string>;

  saveAsset(bytes: Uint8Array, suggestedName: string, opts?: {
    generated?: boolean;          // → _assets/generated/
    forDocument?: string;         // returns the relative markdown path too
  }): Promise<{ path: string; markdownPath?: string; deduplicated: boolean }>;

  undo(): Promise<void>;          // structure undo stack, separate from text undo
  redo(): Promise<void>;
}
```

`RefactorResult = { moved: string; updatedFiles: string[] }` — hosts surface
this as the "Updated 5 references" toast.

### 3.4 Editor integration points (what the editor consumes itself)

When an editor instance is attached to a project
(`mrmd.create(el, { project, path })`):

- **Paste/drop image** (Epic 7.5) → `project.saveAsset()` →
  `![](relative/path.png)` inserted. No host code required.
- **Cell output figures** → execution layer routes image/binary outputs
  through `saveAsset({ generated: true })` and writes the markdown reference
  into the output block. The bundle is GitHub-renderable after a run.
- **`[[` autocomplete** → `project.files` + `resolveLink`; rename refactoring
  keeps documents valid.
- **`[[next]]`/`[[prev]]`/`[[up]]`** render as navigation affordances using
  `neighbors()`; clicking emits a `mrmd-navigate` event the host handles
  (or, in single-editor hosts, the editor swaps documents itself).
- **Citations** `[@key]` → autocomplete from `bibliography()`.
- The document's Yjs binding and the ProjectStore must not double-write: the
  store is the persistence layer for the *current* file too. The Document↔
  Store sync rule: Yjs is authoritative while a doc is open; the model
  flushes (debounced + on blur/close) through the store; external watch
  events for the open file merge through Yjs, not by buffer replacement.

### 3.5 Non-goals

- No git operations (host concern; the watcher makes external git work).
- No process/session management (host or rat concern).
- No hidden metadata that the bundle can't live without — `.manifest.json`
  in `_assets/` is a rebuildable cache, never required for correctness.

---

## 4. The `ProjectStore` adapter interface

Deliberately tiny — five methods plus watch. If you can implement these, your
platform gets the entire project experience.

```ts
interface ProjectStore {
  list(path: string): Promise<DirEntry[]>;          // name, kind, size?, mtime?
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;  // creates parents
  move(from: string, to: string): Promise<void>;
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;

  watch?(path: string, cb: (events: WatchEvent[]) => void): Unsubscribe;
  // Optional capabilities the model adapts to:
  readonly capabilities: {
    watch: boolean;          // else model polls on focus/visibility
    persistent: boolean;     // survives browser data clearing
    realPaths: boolean;      // user-visible on-disk files
  };
}
```

Implementations and where they live:

| Store | Package | Notes |
|---|---|---|
| `MemoryStore` | mrmd-editor | tests, demos, "scratch project" |
| `OpfsStore` | mrmd-editor | Origin Private File System; zero-permission default tier; sync-access-handle fast path in a worker |
| `FsaStore` | mrmd-editor | File System Access directory handle; handle persisted in IndexedDB; permission re-grant flow built in |
| `RemoteStore` | mrmd-editor | thin HTTP client; **this finally implements the documented-but-throwing `drive.read/write/list`** against mrmd-server |
| Electron IPC store | mrmd-electron | replaces FileService/AssetService IPC surface |

The existing `drive()` API is re-founded on this: `mrmd.drive(...)` returns
`{ store, openProject }`. One concept, not two.

---

## 5. The browser-first app (the first mrmd product)

### 5.1 Product definition

A PWA at a stable origin. The promise to the user, in order of trust:

1. **Visit → write.** A scratch project opens instantly in OPFS. Nothing
   asked, nothing installed. JS cells run immediately (mrmd-js).
2. **"Keep this on my computer."** One picker dialog
   (`showDirectoryPicker`) → the project becomes plain `.md` files in a
   folder they chose. Survives cache clearing, browser uninstall, everything.
   Openable in vim, committable to git, viewable on GitHub. The app re-opens
   it next visit with at most one permission click (zero if installed as PWA
   with persistent permission).
3. **"Run Python/R."** Pyodide / webR load on demand (cached by the service
   worker; offline thereafter). Honest about limits: in-browser packages,
   memory ceiling, no native extensions beyond the wheel set.
4. **"Use my real machine."** The app probes `http://127.0.0.1:8717`
   (localhost fetch from a secure origin is permitted). If **rat** is
   serving, runtimes silently upgrade to native kernels — full venvs, GPUs,
   the user's actual files via rat. The only install in the whole story is
   one `curl | sh`, and it's optional and last.

No accounts. Identity = browser origin storage. (Collaboration/sync remains
available by connecting a Yjs provider URL, but is out of scope for v1 of
this product.)

### 5.2 Storage tiers & durability honesty

| Tier | Mechanism | Survives cache clear? | Survives uninstall? |
|---|---|---|---|
| 0 Scratch | OPFS + `navigator.storage.persist()` | No (user-initiated clears wipe it) | No |
| 1 Folder | FSA directory handle | **Yes** (files are real) | **Yes** |
| 2 rat/native | local daemon FS (future) | Yes | Yes |

UI consequences:
- Tier 0 shows a calm, persistent "stored in this browser — move to a
  folder to make it permanent" affordance. Never naggy, never hidden.
- One-click migration Tier 0 → Tier 1 = `copy(opfsStore, fsaStore)`; the
  Project model makes this a generic store-to-store copy.
- Firefox/Safari (no directory picker writes): Tier 1 degrades to
  export/import of a folder zip + OPFS as working copy, clearly labeled.
  Chromium-first is acceptable for v1; the adapter seam keeps us honest.

### 5.3 Runtime tiers

| Tier | Runtime | Languages | Detection |
|---|---|---|---|
| 0 | mrmd-js (exists) | JS, HTML, CSS, Mermaid | always |
| 1 | WASM kernels | Python (Pyodide), R (webR), SQL (DuckDB-wasm) | lazy-load on first cell |
| 2 | rat localhost | everything rat serves | probe 127.0.0.1:8717 |
| 3 | remote MRP | anything | user-entered URL (today's `connectRuntime`) |

All four present the same MRP-ish provider surface to the editor
(execute/stream/complete/hover/inspect), so the editor never knows which tier
it's on. Requirements this creates:

- **WASM kernel adapters**: wrap Pyodide and webR in the MRP provider
  interface (mrmd-js is the template — it already does exactly this for JS).
  Run in workers; stream stdout; implement stdin via the existing stdin-block
  flow; route matplotlib/ggplot image output through
  `project.saveAsset({ generated: true })`.
- **rat needs two small additions** (changes in the rat repo, not here):
  CORS headers + Private-Network-Access preflight handling on the MCP/HTTP
  endpoint, and either a native MRP endpoint or a thin MCP→MRP translation
  in the browser app. rat's four-tool surface (run/look/tail/ctl) maps onto
  MRP cleanly.
- **COOP/COEP** headers on the app origin for threaded WASM; service worker
  for asset caching → full offline operation at Tiers 0–1.

### 5.4 What the app itself contains (deliberately thin)

The app is a showcase that proves the library boundary is right:

- mrmd-editor (document + project model)
- Nav panel / breadcrumbs / Ctrl+P — per the existing
  `navigation-system.md` and `fsml-*.md` specs (passive↔active nav,
  keyboard language). These become **mrmd-editor components** (the
  `ui-components.md` plan), not app-private code.
- Asset gallery (per FSML spec §5.9).
- Storage tier UI + migration flow.
- Runtime tier UI (subtle indicator + "connect rat" / "connect server").
- Theme picker, mode toggle (Epic 7.1 in-editor controls).

If the app needs private glue beyond ~1–2k lines, the library boundary is
wrong — that's the acceptance heuristic.

---

## 6. Open questions (decide before build)

1. **Package home for the Project model**: inside mrmd-editor
   (`mrmd-editor/project` subpath export) vs. growing `mrmd-project` to
   include the stateful model. Leaning: model in mrmd-editor (it needs editor
   integration), pure functions stay in mrmd-project.
2. **Multi-tab coexistence on OPFS/FSA**: BroadcastChannel + Web Locks for
   single-writer-per-file, or full Yjs-across-tabs. v1: Web Locks + watch.
3. **`.manifest.json` write policy**: always, or only when dedup/usage
   tracking is active. Leaning: lazily, marked clearly as a cache.
4. **rat transport**: MCP-over-HTTP translated client-side vs. MRP endpoint
   added to rat. Decide with the rat roadmap.
5. **App origin & deployment**: where the PWA lives, COOP/COEP hosting.
