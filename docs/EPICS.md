# mrmd-editor — Epics & Stories to "Done"

## Read this first — minimum context for working wisely here

If you touch this repository, read these **fully**, in this order. Everything
else can be read on demand per epic (each epic below lists its own files).

1. **`VISION.md`** — the contract everything serves: the plain `.md` file is
   truth; humans, code cells, and AI are all just collaborators writing text.
   Any change that breaks "open the file in vim and it still makes sense" is
   wrong, no matter how nice it looks.
2. **This file (`docs/EPICS.md`)** — the diagnosed architecture problems and
   the agreed direction. Especially the epic intros: they encode hard-won
   corrections (three parsers, overlay reveal over height prediction, mode
   consolidation, the output overlay pattern) that are easy to re-litigate by
   accident.
3. **`src/markdown/index.js`** (111 lines) — the rendering pipeline assembly
   and the ViewPlugin/StateField split, with comments explaining *why* the
   split exists (multi-line `Decoration.replace` requires StateField). Caveat:
   `mrmd.create()` in `src/index.js` assembles its own copy of this pipeline
   — there are two assembly points (story 1.6); registering an extension in
   only one of them is a known footgun.
4. **The three-parser reality** (Epic 1 intro + skim the header comments of
   `src/markdown/renderer.js`, `src/markdown/block-decorations.js`,
   `src/markdown/inline-model.js`) — Lezer renders, regex extractors are
   being retired, and the tolerant inline parser is *deliberately* lenient for
   mid-typing stability. Knowing which layer owns what prevents the most
   common class of wrong fix.
5. **`src/cells.js`** (411 lines) — the cell/output/stdin block model
   (` ```lang ` → ` ```output:execId ` pairing, execIds, artifact/terminal
   languages). Cells are the product's core concept; most features hang off
   this file's definitions.
6. **`test/render-smoke.test.js`** — how correctness is actually verified
   here: headless browser, regression scenarios named after real bugs (drift
   ≤ a few px, click-to-edit, reading mode). Every fix you make should add a
   scenario; every scenario tells you a way this editor has broken before.

Minimum *facts* to hold in your head even without the files:

- **Heights and layout are the historical bug factory.** Never measure DOM
  synchronously inside an update cycle (`coordsAtPos` in a plugin update
  crashed comments for months). Prefer structural fixes (keep widgets
  mounted) over predicted heights.
- **Reveal logic follows the selection *anchor*, not the head** — this is
  what stops drag-selection from oscillating layout. Don't "simplify" it back.
- **Everything writes to the document as plain text** — outputs, comments
  (`<!--! … !-->`), stdin blocks, linked tables. New features must serialize
  into markdown a stranger's tooling can read.
- **Yjs may be live**: positions must survive concurrent edits — use
  RelativePositions or re-find by execId/content, never cache absolute
  offsets across awaits.
- **Two style consumers exist**: standalone (theme presets) and hosted
  (`themingMode: 'hosted'`, e.g. vscode-rat). Hardcoded colors or
  `!important` in widget CSS break one or the other.
- Run `npm test` (node suites) and `npm run test:render` (requires
  `npm run build` first) before claiming anything works.

---

"Done" means: an editor you'd put in front of a stranger next to Notion, Typora,
and Jupyter without apologizing. Plain markdown stays the truth; the rendered
experience is web-grade by default; cells feel notebook-grade; themes can't make
it ugly; and none of it regresses silently.

Ordered roughly by dependency and leverage. Sizes: S (≤1 day), M (2–4 days),
L (~1 week), XL (multi-week).

---

Honest review. Short version: **the bones are good, the 80% entry path is genuinely nice, but the package is currently three products in a trench coat, and the API surface has grown by accretion rather than design.**

## What's genuinely well-done

- **The core thesis is right and consistently executed.** "The .md file is truth, everyone writes text" is a real architectural principle, not marketing — outputs, comments, stdin blocks, linked tables all serialize to plain markdown. This is the package's moat. Keep protecting it.
- **The 80% is already beautiful:**
  ```js
  const editor = mrmd.create('#editor', { doc: '# Hello' });
  editor.connectRuntime('python', 'http://localhost:8000/mrp/v1');
  ```
  Two lines to a collaborative, executable notebook. That's the right shape.
- **MRP is a good protocol.** Capability-based, HTTP+SSE, runtime-first LSP. The `connectRuntime()` one-liner that wires execution *and* LSP is exactly the "make integration disappear" move.
- **Config/state split** (declare vs. observe, reactive proxy, read-only state) is conceptually clean and ahead of most editor packages.
- **The docs are honest.** EPICS.md actually documents the bug factories (height caches, three parsers, the two-assembly-point footgun). Rare and valuable.

## Where it's not well-architected

1. **`src/index.js` is a ~3,000-line god file.** `create()` does runtime wiring, theme resolution, scroll modes, presentation modes, document templates, awareness, LSP, keymaps... The API object has **150+ methods** assembled inline. This is the single biggest drag on both maintainability and API legibility.

2. **Three parsers, two decoration pipelines, two height caches.** EPICS.md already diagnoses this correctly. The renderer's "ranges already covered" deconfliction and `output-widget.js`'s 3,079-line overlay hack (1px fonts, transparent text, `posBefore` landmines) are the structural debt. The fix is known (Epic 1.4 + 5.0); it just hasn't happened.

3. **The package boundary is wrong.** mrmd-editor currently contains: an editor, a shell/studio framework (`shell/`), an AI client + palette + ctrl-K UI, a table workbench, a terminal emulator host, and a theme system with 15 built-in themes (`theme.js` is 4,091 lines of inline color values). A user who wants "a markdown editor" pays for all of it. `shell/`, `ai-*`, and probably `tables/` want to be `mrmd-shell`, `mrmd-ai-ui`, `mrmd-tables`.

4. **Docs disagree with code.** API.md says `theme: null → midnight/daylight`; code says `plain-dark/plain-light`. VISION.md shows `runtimes: [python(...)]` (array); the real API is an object of configs. `drive.read/write/list` are documented but throw "not yet implemented". For a package whose pitch is DX, doc drift is a UX bug.

## Is the API delightful? Mostly — with three blemishes

- **Three ways to do everything.** Theme: `setTheme()` / `config.appearance.theme` / `widgets.applyTheme()`. Runtimes: `runtimes:{}` option / `registerRuntime()` / `connectRuntime()` / config handlers. The reactive config is elegant in theory, but in practice half the handlers just `console.warn('requires editor recreation')` — a reactive config that mostly can't react is worse than explicit setters.
- **Boolean mode soup**: `setSourceMode` / `setWysiwygMode` / `setReadonly` / `setDocumentStylePreview` / `setPageView` / `setScrollMode` with manual mutual exclusion. EPIC 3.3's `setMode('read'|'notebook'|'full'|'raw')` is the right answer — ship it, it's cheap and it's pure API delight.
- **Export bloat**: `index.js` re-exports ~150 named symbols flat. Power users should reach through namespaces (`mrmd.tables.*`, `mrmd.awareness.*`), not have everything at top level.

## "80% easy, 20% possible" scorecard

| Tier | Verdict |
|---|---|
| `create()` + `doc` + theme name | ✅ excellent |
| `connectRuntime()` | ✅ excellent |
| `drive().open()` for collab | ✅ good (modulo unimplemented read/write/list) |
| Custom theme | ✅ good (`createTheme({base, overrides})` is the right pattern) |
| Custom output renderer | ❌ **not possible without forking** — this is the biggest 20% gap. Epic 5.1's registry is the fix |
| Hosted embedding (own chrome) | ⚠️ possible but vscode-rat needed ~700 lines of `!important` — Epic 8.5 |
| Custom keymap | ✅ good (`setKeymap`, named commands) |

## What I'd actually do, in order

1. **Ship the mode enum (3.3) and kill the boolean soup** — one day, pure API win.
2. **Fix doc drift** — API.md/VISION.md vs reality. Cheap, high trust payoff.
3. **Decompose `index.js`**: `create()` becomes assembly of `setupTheming()`, `setupRuntimes()`, `setupLsp()`, etc., and the API object gets built from feature modules. This unblocks everything else.
4. **Epic 5.0/5.1 (output block widgets + renderer registry)** — fixes the worst internal fragility *and* opens the biggest 20% door simultaneously. Best leverage per effort in the whole backlog.
5. **Split `shell/` and `ai-*` into sibling packages** when you next touch them — don't do it as a big-bang.
6. Make reactive config honest: either implement the warned-about handlers or remove reactivity for those paths and document setters as the API.

So: well-architected *in vision and in the new layers* (config/state, MRP, awareness), under-architected *in the rendering core and package boundaries* — and the project already knows this (EPICS.md is the best self-review I've seen in a while). The gap is execution priority, not diagnosis.

---

## Epic 1 — One parser, one decoration pipeline (correctness foundation)

**Required reading:**
- `src/markdown/renderer.js` — the ViewPlugin decoration build; regex callers (`extractInlineMath`, `extractDetailsBlocks`, link/HTML extraction); the "ranges already covered" deconfliction
- `src/markdown/block-decorations.js` — the StateField side: `findTableRanges`, `findDisplayMathRanges`, `findFrontmatterRange`, `buildBlockDecorations`
- `src/markdown/widgets/math.js` — current inline/display math extraction (the Pandoc-rule patch lives here)
- `src/markdown/html-inline.js` — `extractHtmlElements`, `extractDetailsBlocks` (doc.toString() in render path)
- `src/markdown/index.js` + `src/index.js` (search `createMarkdownExtensions` and the extension assembly in `create()`) — the two assembly points (story 1.6)
- `src/markdown/facets.js`, `src/markdown/wysiwyg.js` — reveal logic the unified pipeline must preserve
- `src/markdown/inline-model.js` — the *third* parser (deliberate, edit-semantics; see epic intro)
- `@lezer/markdown` docs: `MarkdownConfig` inline/block parser extension API
- `test/math-extraction.test.js`, `test/render-smoke.test.js` — existing coverage to keep green

The root cause of most reported glitches is the split-brain parser — but
there are actually **three** parsers, and one is deliberate:

1. Lezer (core markdown) — correct, keep.
2. Regex extractors over raw text (math, wiki-links, details, admonitions) —
   the bug factory; retire into Lezer.
3. The tolerant inline parser in `inline-model.js` (`parseInlineNodes`) —
   **intentionally** more forgiving than CommonMark so editing stays stable
   mid-typing (`**hello **` must not flicker bold off while the user types).
   This is the *edit-semantics* layer, not a rendering parser. Do NOT collapse
   it into Lezer; scope it explicitly and document the boundary.

So the goal is precisely: **one parser for rendering** (Lezer), the tolerant
model scoped to edit commands/pending-format, and one decoration build — not
two competing decoration sources (ViewPlugin + StateField) with manual
deconfliction (and duplicated logic like the two `findFrontmatterRange`
implementations in renderer.js and block-decorations.js).

- **1.1** Move inline math into the Lezer grammar as a `MarkdownConfig` inline
  parser implementing the Pandoc `$` rule (open `$` followed by non-space; close
  `$` preceded by non-space, not followed by digit; `\$` escape; code-span
  exclusion comes free from the tree). Config flag to disable single-`$` math
  for R-heavy docs. (L)
- **1.2** Move display math (`$$`) to a Lezer block parser — kills the
  whole-document regex, the odd-count flip, and `$$`-in-code pairing
  structurally (current fixes are tested patches, not structural). (M)
- **1.3** Move wiki-links, admonitions/alerts, and `<details>` detection into
  the grammar; delete `extractDetailsBlocks(doc.toString())` from the render
  path. (L)
- **1.4** Collapse to a single decoration build: one tree walk → one decoration
  set; remove the "ranges already covered by other decorations" deconfliction
  layer and the ViewPlugin/StateField split for widgets. (L)
- **1.5** Audit and eliminate remaining `doc.toString()` calls in hot paths
  (42 call sites at last count). The single hottest: `outputWidgetPlugin`
  rebuilds with `doc.toString()` + full-document regex on **every
  transaction** (its update() unconditionally rebuilds, "following the
  y-codemirror pattern"). Link-definition cache becomes incremental or
  debounced. (M)
- **1.7** Document the rendering-parser / edit-parser boundary: which layer
  owns what, with tests pinning the mid-typing tolerance behaviors
  (pending-format, auto-clean of empty marker pairs). (S)
- **1.6** `mrmd.create()` and `createMarkdownExtensions()` assemble the same
  pipeline from one source of truth (the dead-code footgun found during the
  font-remeasure fix). (S)

## Epic 2 — Deterministic layout (no jumps, no jitter, ever)

**Required reading:**
- `src/markdown/block-decorations.js` — the whole height machinery: `widgetHeightCache`, `cacheWidgetHeight`/`getCachedHeight`, `cachedLineHeight`/`cacheLineHeight` typo, `editingSpacerPadding`/edit reservations, `fontRemeasurePlugin`, `lineHeightTracker`
- `src/output-widget.js` — `cacheOutputHeight`/`getCachedOutputHeight` (the second, parallel height cache)
- `src/markdown/widgets/table.js`, `frontmatter.js`, `math.js`, `image.js` — every `estimatedHeight`/`eq()` implementation
- `src/markdown/wysiwyg.js` — anchor-based reveal (the jitter mitigation to be superseded by overlay reveal)
- `test/render-smoke.test.js` — stability scenarios (drift assertions) to extend into the torture suite
- pretext README/API (`prepare`, `layout`, `prepareWithSegments`, fonts caveats): https://github.com/chenglou/pretext
- CM6 docs: `WidgetType.estimatedHeight`, `coordsAtPos` timing rules

Stable height is currently achieved by caches + rAF measurement + reservations
— a glitch factory that keeps producing new oscillators (selection-drag jitter
reported as "almost worse" after the anchor fix).

**Priority correction after reading the code:** the heights that actually jump
come from things pretext *cannot* measure — KaTeX render output, images
(`BlockImageWidgetWithHeightCache` waits on `img.onload` via
MutationObserver), auto-resizing iframes (HtmlOutputWidget), `<details>` open
state. Overlay reveal (2.1 below) eliminates the height-parity problem
entirely: if the widget never unmounts, there is no raw-source height to
predict. Pretext drops to an optional optimization for off-screen text-output
estimates — possibly cuttable.

- **2.1** **(keystone)** Reveal without reflow: keep the widget mounted and
  toggle an editing overlay instead of swapping widget ↔ raw source at
  different heights. This is the structural end of the jitter family
  (anchor-following was a mitigation; height reservations become dead code).
  (L)
- **2.2** Delete the legacy machinery 2.1 obsoletes: module-level height
  caches, content-hash keys, rAF measurement, edit reservations,
  `cachedLineHeight`/`cacheLineHeight` (including the dead-variable typo),
  22px fallbacks. (M)
- **2.3** *(optional, after 2.1)* Evaluate `@chenglou/pretext` for the
  remaining need — `estimatedHeight` of off-screen text-bearing widgets —
  only if rough content-aware estimates (row count × line height) still
  produce visible scroll corrections. Gate on `document.fonts.ready`; font
  strings must mirror CSS exactly. (M, gated)
- **2.4** Jitter torture test: headless drag-sweeps, scroll-during-selection,
  Ctrl+A, fast typing across every widget type, asserting ≤2px drift; runs in
  CI, prints scenario names on failure (fix the unattributable flake). (M)

## Epic 3 — Editing modes: read / notebook / full (the lock spectrum)

**Required reading:**
- `src/index.js` — `setReadonly`/`isReadonly`, the `mrmd-readonly` class, how `readonly` threads into extensions
- `src/markdown/wysiwyg.js` + `src/markdown/renderer.js` — every `isLocked` reveal site (the seam where per-region policy plugs in)
- `src/cells.js` — `findCells` (cell boundary model the atomic-fence guard builds on)
- `src/keymap.js`, `src/commands.js` — input paths that must respect mode
- `src/markdown/inline-model.js`, `inline-state.js` — inline reveal state
- CM6 docs: `EditorState.changeFilter`/`transactionFilter` (boundary atomicity), `EditorView.editable` vs `EditorState.readOnly`
- git: `fa14689` (reading mode), `5f646c1` (anchor reveal) — last session's lock work

**Correction after reading the code:** three mode axes already exist as
separate booleans — `sourceModeFacet` (≈ raw mode), `wysiwygModeFacet`
(a proto-notebook mode: fence protection, atomic ranges, a `transactionFilter`
blocking edits to protected regions in `wysiwyg.js`), and `readonly` — with
manual mutual exclusion in `setSourceMode`/`setWysiwygMode`. This epic must
**consolidate, not add a fourth system**.

- **3.1** Read mode polish: no caret ever, no reveal affordances, no comment
  edit-in/out on click — "like reading a website"; cells still runnable;
  select/copy intact. (S)
- **3.2** **Notebook mode = finish wysiwyg mode**: it already protects fence
  lines and syntax ranges via `wysiwygTransactionFilter` and
  `collectProtectedRanges`. Extend it with: outputs not editable (only
  collapsible/clearable/deletable as a unit), cell insert via explicit
  affordance (between-cell "+" hover line), and the read-mode widget
  presentation for non-active regions. Per-region policy plugs into the
  existing `isLocked` seam. (L — down from XL, the skeleton exists)
- **3.3** One mode enum replaces the three booleans:
  `setMode('read'|'notebook'|'full'|'raw')`, where raw = today's source mode
  and notebook = finished wysiwyg mode. Old setters become deprecated aliases.
  Persisted per document (frontmatter key), switchable from in-editor UI. (M)
- **3.4** Headless tests per mode: what is editable, what is atomic, what
  reveals — as a contract matrix. (M)

## Epic 4 — Cell ergonomics (notebook-grade feel)

**Required reading:**
- `src/cell-controls/` (all four files) — header chrome, run buttons, queue, status widgets
- `src/cells.js` — cell detection/model; `src/execution.js` — run lifecycle, output insertion points
- `src/commands.js`, `src/keymap.js` — where navigation/run-advance commands belong
- `src/markdown/styles.js` — fence chrome CSS (`cm-codeblock-fence-open/close`, the hidden-backtick landmine)
- `src/section-controls/` — existing between-block affordance pattern to mirror for insert-cell
- CM6 docs: fold/`StateField` pattern for collapse

- **4.1** Collapse/expand for code cells and outputs (chevron in header;
  collapsed shows the header line only); state survives edits; fold field, not
  decorations hacks. (M)
- **4.2** Cell navigation: next/previous cell keys, run-and-advance
  (Shift+Enter semantics), focus management that scrolls sensibly. (M)
- **4.3** Insert-cell affordances: between-block hover "+" (code cell, math,
  table, details), language picker honoring document languages. (M)
- **4.4** Output ↔ cell pairing as a first-class concept: shared rounding,
  indentation (`--widget-inset-left`), collapse-together option; no trailing
  fence ghosts (structural, not span-transparency patches). (M)

## Epic 5 — Outputs: registry + decomposition

**Required reading:**
- `src/output-widget.js` (all 3,079 lines, it's the epic) — widget classes (`OutputWidget`, `JsonOutputWidget`, `HtmlOutputWidget`, `CssOutputWidget`, `ScrollableOutputWidget`, `StdinWidget`), JSON-repair heuristics (`normalizeJsonLikeOutput` and friends), `buildDecorations`, `outputWidgetStyles`, settings reads
- `src/execution.js` — how outputs are written/streamed into the doc
- `src/term-widget.js`, `src/term-block.js`, `src/terminal.js` — ANSI/PTY output path (story 5.5)
- `~/Projects/rat/vscode-rat/media/mrmdEditor.js` + its CSS — the `!important` war the registry must end (consumer contract)
- Jupyter mime-bundle/renderer model (reference design)
- `PROTOCOL.md` — MRP output/stdin message shapes

`output-widget.js` is 3,079 lines, 7 widget classes, JSON-repair heuristics,
its own height cache, untested — and consumers (vscode-rat) fight its styling
with `!important` CSS.

**Structural precondition the registry alone won't fix:** outputs use an
overlay pattern — absolute-positioned widgets painted over transparent
1px-font text lines. The file's own comments document the consequences
(`posBefore` crashes, the CSS-specificity gotcha, fence-line clipping hacks).
A registry that keeps this positioning model keeps the fragility.

- **5.0** Migrate outputs from the overlay pattern to block
  `Decoration.replace` widgets (the model tables/math already use, via the
  unified pipeline from Epic 1.4). Deletes the 1px-fence hacks, the hidden-line
  CSS war, and the second height cache. (L, precondition for 5.1–5.2)
- **5.1** Output renderer registry: mime-type/shape → renderer (Jupyter model);
  text, JSON tree, HTML, CSS-artifact, image, scrollable as registered
  renderers; hosts can register their own. (L)
- **5.2** Split the file along the registry; widget chrome (insets, headers,
  actions) becomes options/theme variables, ending the external CSS war. (M)
- **5.3** JSON tree everywhere it's expected: static ` ```json ` cells get the
  collapsible tree when blurred; lazy-render large payloads; copy-path action.
  (M)
- **5.4** Unit tests for the JSON-repair/normalization heuristics (currently
  the riskiest untested parsing in the package) + golden fixtures per renderer.
  (M)
- **5.5** Vision-promised output behaviors verified end-to-end: ANSI/progress
  update-in-place, stdin capture flow, streamed output stability while
  scrolled. (L)

## Epic 6 — Comments that beat Google Docs (within markdown)

**Required reading:**
- `src/comment-syntax.js` (whole file) — marker parsing, `showBubble` (and its deferred-microtask fix), `mrmd-comment-thread-open` event, the untested `cm-comment-anchor` widget mode
- `src/ai-integration.js` — AI/comment interplay (comments are an AI channel too)
- `src/keymap.js` — Ctrl+Shift+/ binding
- git: `8aa6a3f` (bubble never opened) — context on the fragility class
- Epic 3 mode rules — comments must respect read/notebook modes

Storage (`<!--! … !-->`) and the bubble exist; the experience doesn't.

- **6.1** Thread model: replies and resolution serialized in the marker
  syntax (readable/writable by any tool); bubble expands in place over the
  anchor, supports reply, edit, resolve, delete. (L)
- **6.2** In-editor margin/thread view for comment-heavy docs (the
  `mrmd-comment-thread-open` hook exists; build the default consumer inside
  the editor area, not the host). (L)
- **6.3** Anchor-widget mode audit: `cm-comment-anchor` path exists untested —
  make syntax invisible in flow with threads beside text, or delete the path.
  (M)
- **6.4** Comments respect modes: in read mode, reading + replying allowed
  (suggestion-mode territory), no document mutation. (M)

## Epic 7 — In-editor surface & chrome ("fully control the experience")

**Required reading:**
- `tests/v090.html` — current out-of-editor controls (theme bar, lock) to be moved in-editor
- `src/shell/` (`index.js`, `components/`, `styles.js`) — existing in-app chrome patterns; decide what migrates into the editor proper
- `src/tables/README.md` + `src/tables/widgets/linked-table-widget.js`, `workspace/controller.js` — the model rich pipe-table editing (7.4) grows toward; `src/markdown/widgets/table.js` — what it grows from
- `src/markdown/widgets/image.js` — placeholder/click-edit (7.5)
- `src/markdown/styles.js` + theme selection styling — the lavender Ctrl+A band (7.3)
- `src/ctrl-k-modal.js` — existing in-editor floating UI to reuse as pattern

Theme picker and lock currently sit outside the editor "like an afterthought".

- **7.1** Floating in-editor controls: mode toggle, theme, outline/navigation —
  inside the editor element so the experience is host-independent and works
  with N editors per page. Subtle, auto-hiding. (M)
- **7.2** Per-paragraph "edit this block" affordance in read/notebook modes
  (the escape hatch to full raw editing, scoped). (M)
- **7.3** Selection styling across widgets: continuous, native-feeling
  selection band over rendered tables/math/outputs (the "lavender Ctrl+A" is
  functional but inelegant). (M)
- **7.4** Rich table editing for plain pipe tables: click → editable cells in
  the widget, Tab between cells, writes back to pipe syntax — grow toward the
  linked-tables subsystem's model rather than raw-source editing. (XL)
- **7.5** Image polish: click-to-edit, paste/drop insertion, loading
  placeholder that doesn't read as a broken white box. (M)

## Epic 8 — Theme contract (powerfully themeable, never ugly)

Customization has **two layers**, and both must be first-class:

1. **Embedding developers** put mrmd in their site/app: their buttons, their
   menus, their CSS reaching through — the editor must feel native to *their*
   product, never like an iframe with someone else's taste.
2. **Document authors** writing inside mrmd: they style their *document* to
   their own voice and brand — long-term, mrmd should be sufficient to write a
   blog or a whole website in place, so the theming surface exposed to authors
   must be genuinely rich.

Across both layers, the constant: **help them make it beautiful — make it
hard to make it ugly.** The theme proposes, the editor enforces minimums.

**Required reading:**
- `src/widgets/codemirror-theme.js` — `createCodemirrorTheme`, `ensureVisibleSelection` (the pattern to generalize)
- `src/widgets/theme.js` (4,091 lines — skim by section) — preset definitions, `registerTheme`, variable vocabulary
- `src/widgets/theme-utils.js` — color math helpers (luminance/blend) the validator builds on
- `THEMING.md` — the public theming contract to extend, not break
- `src/markdown/styles.js`, `src/output-widget.js` `outputWidgetStyles` — where shared knobs (`--widget-inset-left`, `--widget-border-radius`) are consumed

`ensureVisibleSelection` proved the pattern: the theme proposes, the editor
enforces minimums.

- **8.1** Theme contract validator at `registerTheme`: minimum contrast pairs
  (selection/bg, output-text/surface, json-tokens/surface, active-line),
  warn-or-correct; would have caught the newsprint JSON-number bug
  automatically. (L)
- **8.2** Derived surfaces: themes pick a small palette; surfaces, borders,
  insets, radii derive from shared knobs (`--widget-border-radius`,
  `--widget-inset-left` are the start). (M)
- **8.3** Screenshot matrix in CI: every preset × showcase sections, perceptual
  diff; preset gallery page for human review. (M)
- **8.4** Decompose `theme.js` (4,091 lines) along the contract. (M)
- **8.5** **Finish hosted mode** (it exists: `themingMode: 'hosted'`, and
  vscode-rat uses it — yet still needed ~700 lines of `!important` CSS, which
  is the measure of the gap). Deliverable: documented, stable class names and
  CSS custom properties as the embedding API; a host can fully restyle without
  a single `!important`; vscode-rat's override sheet shrinks to near-zero as
  the acceptance test. (L)
- **8.6** **Expose document templates as the author theming surface** (the
  system largely exists: `document-template.js` already has presets,
  per-token syntax colors, frontmatter binding via `bindDocumentTemplate`, and
  Pandoc/LaTeX/HTML/Word export serializers). Deliverable: an in-editor
  template panel, template editing UX, and validation through the 8.1
  contract so author freedom can't produce illegible results. (L — down from
  XL, this is exposure + polish, not construction)

## Epic 9 — Test harness & scope spec (the finish line)

**Required reading:**
- `test/render-smoke.test.js` — the Puppeteer harness to grow into the golden-corpus runner
- `test/tables-*.test.js` — the in-house testing standard to replicate
- `tests/v090.html` — the manual showcase whose sections become fixtures
- `package.json` scripts — how suites run today
- CommonMark spec test suite + GFM extensions (external)
- For 9.4: `src/markdown/block-decorations.js`, `src/output-widget.js`, `src/markdown/renderer.js` — first `@ts-check` targets

- **9.1** Golden-corpus harness: directory of `.md` fixtures (R `$` docs,
  currency, nested fences, math-in-lists, frontmatter edges — every bug ever
  reported becomes a fixture) → headless render → snapshot decoration sets +
  DOM. (L)
- **9.2** CommonMark + GFM spec suites run against rendered output for claimed
  constructs. (M)
- **9.3** Scope spec (one page): CommonMark + GFM tables/strikethrough/tasks +
  math (Pandoc rules) + wiki-links + admonitions + frontmatter + details.
  Everything else explicitly out. (S)
- **9.4** `@ts-check` + JSDoc across `markdown/` and `block-decorations.js`
  (the typo-class bug is the proof case); incremental, not a rewrite.
  **Exclude `output-widget.js`** — type it during/after the Epic 5
  decomposition rather than annotating 3,079 lines that are about to be
  split. (L)
- **9.5** Subagent-friendly task packets: each story above written so it can be
  contracted out (context files, acceptance test, verification command) — the
  parallelization the project owner asked for. (S, meta)

## Epic 10 — Paper/read surface (post-"done" candidate, decide explicitly)

**Required reading:**
- `src/page-view-pagination.js` — current pagination ambitions to absorb
- `src/document-template.js` — existing Pandoc/LaTeX/HTML export serializers (the md→Typst projection sits beside these)
- `VISION.md` — the plain-text-truth constraint the paper surface must not break
- `typst.ts` / Typst-in-WASM docs (external); pretext README (gated story 10.2)
- The pretext discussion in the 2026-06-10 session (rewrite verdict + two surgical wins)

The "scientific paper" ambition. Explicitly **not** a rewrite (pretext is a
line-breaking kernel, not an editor substrate).

- **10.1** Prototype Typst-in-WASM preview: md → Typst projection for
  preview/export only (no round-trip), code outputs injected as figures. (~1
  week prototype; decide after.) (L)
- **10.2** Only if 10.1 loses: evaluate a pretext-based paginated renderer for
  the read surface. (XL, gated)
- **10.3** Fold the existing page-view-pagination ambitions into whichever
  wins; stop straining the decoration model with them. (M)

## Epic 11 — Project model & ProjectStore (the bundle becomes first-class)

**Required reading:**
- `docs/specs/project-model-and-browser-app.md` — the contract this epic implements
- `../mrmd-project/spec.md` + `src/` — the pure-logic package (FSML, Links, Assets, Project, Search) this builds on; do NOT duplicate its logic
- `../mrmd-electron/docs/specs/fsml-filesystem-markup-language.md` — the on-disk conventions (relative asset paths, `_assets/`, `NN-` ordering, `[[links]]`); note the owner's `!!` corrections (valid markdown, GitHub-renders-as-is, no `asset:` URLs)
- `../mrmd-electron/docs/specs/services.md` — the service layer this epic *relocates*: ProjectService/FileService/AssetService logic moves into the shared model; Electron keeps a thin ProjectStore over IPC; SessionService stays host-side
- `src/index.js` (the `drive()` stub, `drive.read/write/list` throw sites) — the documented-but-unimplemented API this epic finally founds
- `src/markdown/widgets/image.js`, `src/execution.js` — the two editor seams that route through `saveAsset()`

The editor holds the *document* in memory (Yjs) and syncs it; this epic
extends the same pattern to the *bundle*: an in-memory `Project` model
(nav tree, link graph, asset manifest, config) kept in sync through a tiny
pluggable `ProjectStore` (list/read/write/move/remove + optional watch).
Truth stays plain files; the model is a rebuildable cache. This is the layer
that answers, for every wrapper at once: where pasted images go, how
multi-file documents link (`[[next]]`/`[[prev]]`), where nav/TOC come from,
how renames refactor links, and where kernel-generated figures land.

- **11.1** `ProjectStore` interface + `MemoryStore` + conformance test suite
  (the suite is the contract; every store implementation must pass it). (M)
- **11.2** `Project` model read side: scan via store, `mrmd.md` config
  parsing, FSML nav tree, link index, asset manifest, fuzzy search; lazy
  incremental scan (50k files opens interactively); change events. (L)
- **11.3** Mutation/refactoring ops: create/move/rename/reorder/remove with
  automatic `[[link]]` refactoring and relative-asset-path rewriting
  (`Links.refactor`, `Assets.refactorPaths`); structure undo stack. (L)
- **11.4** `saveAsset()`: hash dedup, `_assets/` + `_assets/generated/`
  placement, relative markdown path computation; wire the two editor seams —
  paste/drop images (pairs with 7.5) and execution image outputs. (M)
- **11.5** `OpfsStore` + `FsaStore` (directory picker, handle persistence in
  IndexedDB, permission re-grant flow) + store-to-store `copy()` for tier
  migration. (L)
- **11.6** Re-found `drive()` on the model: `RemoteStore` over mrmd-server
  HTTP implements the documented `drive.read/write/list`; `drive()` returns
  `{ store, openProject }`. Kill the "not yet implemented" throws. (M)
- **11.7** Document↔Store coherence rule: Yjs authoritative while open,
  debounced flush through store, external watch events merge via Yjs (never
  buffer replacement); Web Locks for multi-tab single-writer. (M)
- **11.8** Editor consumption: `[[` autocomplete from the model, neighbors
  (`[[next]]`/`[[prev]]`/`[[up]]`) as navigation affordances emitting
  `mrmd-navigate`, citation autocomplete from `_bibliography/*.bib`. (M)

## Epic 12 — Browser-first app (the first mrmd product: PWA, no install, no login)

**Required reading:**
- `docs/specs/project-model-and-browser-app.md` §5 — product definition, storage/runtime tiers, durability honesty table
- `../mrmd-electron/docs/specs/navigation-system.md`, `left-nav-panel.md`, `file-navigation-and-creation.md` — the nav panel / breadcrumbs / Ctrl+P UX this app ships (as mrmd-editor components, not app-private code)
- mrmd-js source (the in-editor JS runtime) — the template for WASM kernel adapters
- Pyodide + webR docs; File System Access API; `navigator.storage.persist()`; COOP/COEP requirements for threaded WASM
- `~/Projects/rat/KERNEL-PROTOCOL.md` + `rat serve` — the localhost escalation target (Tier 2)

A PWA at a stable origin. Visit → write instantly (OPFS scratch, JS cells
live). "Keep on my computer" → one directory picker, plain `.md` files that
survive everything (Chromium; export fallback elsewhere). Python/R via
WASM kernels, cached for offline. Probe `127.0.0.1:8717`: if rat is serving,
runtimes silently upgrade to native kernels — the only install in the story
is one optional binary, and it comes last. No accounts; identity is the
browser. Acceptance heuristic: if the app needs >~2k lines of private glue,
the library boundary (Epics 11 + 7) is wrong.

- **12.1** App shell: PWA manifest, service worker (offline app + WASM asset
  cache), COOP/COEP hosting, scratch project on first visit (OPFS),
  `storage.persist()` request at the right moment (first real content). (M)
- **12.2** Storage tier UX: calm "stored in this browser" indicator, one-click
  migrate-to-folder (11.5 copy), permission re-grant flow, honest durability
  copy; Firefox/Safari export/import fallback. (M)
- **12.3** Pyodide MRP adapter: worker-hosted, streaming stdout, stdin-block
  flow, matplotlib → `saveAsset({generated:true})`, package install UX
  (micropip), honest limits surfaced. (L)
- **12.4** webR MRP adapter (same shape; ggplot via canvas/png capture). (L)
- **12.5** rat escalation: localhost probe, MCP→MRP translation (or native
  MRP endpoint if added rat-side — coordinate with rat roadmap), CORS +
  Private-Network-Access handling, runtime tier indicator, graceful
  fallback when rat stops. (L)
- **12.6** App chrome from library components: nav panel (passive/active),
  breadcrumbs, Ctrl+P, asset gallery — built as mrmd-editor components per
  the navigation specs, consumed (not forked) by the app. (XL, parallelizable
  per component)
- **12.7** Multi-document flow: `mrmd-navigate` handling, open-file state,
  next/prev page affordances at document ends. (M)

## Epic 13 — Spec & plan reconciliation (one set of truths across repos)

The mrmd-electron specs predate the Project model and assign its logic to
Electron services. Reconcile so future work lands in the right layer:

- **13.1** Update `mrmd-electron/docs/specs/services.md`: ProjectService/
  FileService/AssetService become "thin ProjectStore over IPC + host
  concerns"; point at Epic 11 for the model. SessionService unchanged. (S)
- **13.2** Update `IMPLEMENTATION-GUIDE.md` package table: navigation-panel,
  file-picker, link-autocomplete, asset gallery are mrmd-editor components
  (Epic 12.6), not electron-private. (S)
- **13.3** API.md/VISION.md: document `Project`/`ProjectStore`/re-founded
  `drive()`; remove the "not yet implemented" drift (pairs with the existing
  doc-drift item). (S)

---

## Suggested sequencing

1. **Epic 9.1–9.4 + 1.6** first — makes everything else safe and attributable.
2. **Epic 1** (parser unification) — the correctness keystone; many open bugs
   stop being expressible.
3. **Epic 2** (overlay reveal) — the "feels flawless" keystone; depends
   lightly on 1.4. Pretext (2.3) only if rough estimates still visibly jump.
4. **Epics 3 + 4 together** (modes + cell ergonomics) — same code seams;
   notebook mode builds on the existing wysiwyg machinery, and 5.0 (output
   block-widget migration) pairs naturally with 1.4.
5. **Epics 5, 6, 7** in parallel via contracted subagent tasks (9.5).
6. **Epic 11** (Project model) can start anytime — it touches almost none of
   the rendering core, so it parallelizes with Epics 1–5. Sequence within it:
   11.1 → 11.2/11.3 → the rest. 11.4 pairs with 7.5; 11.6 closes a doc-drift
   item.
7. **Epic 12** (browser app) gates on 11.1–11.5 + mode enum (3.3); the WASM
   adapters (12.3/12.4) and rat escalation (12.5) are independent of the
   editor core and can be contracted out early.
8. **Epic 8** continuously, validator early.
9. **Epic 10** decision prototype whenever a week frees up; it's additive.
10. **Epic 13** immediately after 11.1 stabilizes the interfaces (cheap,
    prevents cross-repo drift).

Definition of done, restated as checks: golden corpus green; jitter torture
suite green across themes; the three modes pass their contract matrix; a
stranger can read, comment, run cells, and edit a table without ever seeing
raw markdown unless they ask for it — and `git diff` after a save session
shows only what they meant to change.
