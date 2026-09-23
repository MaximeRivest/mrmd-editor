# Document bundle host services (0.11.0, diagrams and link modifiers in 0.13.0)

Both `createDocumentEditor` and `createCodeEditor` expose the same host integration
API. It uses the bundle's own CodeMirror instance; hosts do not need to import a
second copy of CM packages.

## Gutter

Document options: `lineGutter: true` enables just the host marker gutter (not line
numbers or folding controls). Code editors always expose a marker gutter.

- `setLineMarks(Map | object, expectedContent?)`: one-based line numbers to
  `{glyph, cls, title}`. Returns false if supplied contents no longer match.
- `onLineHover(line)`: optional string/Promise<string> used as the gutter tooltip.
- `onLineHoverEnd()`: lets the host cancel an obsolete lookup.
- `onMarkClick(line, info)`: optional explicit interaction.

Markers and hover titles clear on document edits. Recalculate them against the
new document; do not reattach stale attribution to moved/edited lines. Marker
classes participate in equality, so changing a class updates the existing gutter.

## Language-service adapter

`setLanguageServices(service | null)` installs optional callbacks:

- `complete({text, pos, explicit, filename, signal})`: a completion result with
  `from`, optional `to`, and `options`. Native language completion sources remain
  active. Invalid ranges are rejected; at most 1000 adapter options are accepted.
- `hover({text, pos, filename, signal})`: plain text, not executable HTML.
- `definition({text, pos, filename, signal})`: a host location, delivered through
  the constructor's `onNavigateLocation(location)` callback when F12 is pressed.

Offsets use JavaScript UTF-16 positions. Requests are cancelled on edits,
filename/service changes and destruction; obsolete results are discarded. The
host owns any LSP transport/process, document synchronization and environment.
No language server starts merely by creating an editor.

`setDiagnostics(items, expectedContent)` requires the contents associated with
those diagnostics and refuses stale publication. Items use CM diagnostic ranges
and severity/message fields. The host owns diagnostic scheduling/refresh.

Code editors also offer explicit Ctrl-Space word completion as a fallback to
language-specific completion. Tab accepts an open completion or indents. This
fallback is not project-wide semantic completion.

`openSearch()` opens the editor-local search panel. Host apps should let editor
keyboard events run without replacing Ctrl-F with an application-wide search.

## Diagrams (document editor, 0.13.0)

The bundle ships no diagram library. A host that already has one (mermaid,
for instance) lends it to the editor:

```js
createDocumentEditor(el, {
  diagrams: {
    languages: ['mermaid'],
    render: (lang, source) => Promise<Node>,
  },
});
```

A closed, non-blank fence in one of the named languages is drawn while the
cursor is outside it and shown as source while the cursor is inside — the
rule display math follows. Reading mode keeps drawings; source mode shows
source. Other fences, open fences and blank fences stay code.

`render` resolves with a DOM Node (the editor inserts a clone, so one result
serves every place the same source appears) or rejects with an Error, shown
above the source. The node is inserted as returned: it comes from the host's
own renderer, so the host owns sanitization. Results are cached per render
function by language and source; failures are not cached, so the next draw
retries. `refreshDiagrams()` forgets the cache and draws everything again —
call it after a theme change. A `diagrams` option without `render` or without
languages throws at creation.

## File links

The document editor turns `[text](relative/path.md)` into a link that
dispatches a bubbling `file-link-navigate` CustomEvent on the editor DOM
instead of navigating; the host decides what a path means. Since 0.13.0 the
detail is `{ path, modifiers: { ctrl, meta, shift, alt } }`, so a host can
offer "open in the system application" on a modified click without listening
to the click itself (the widget stops it from propagating).

Run `npm run build:document` and `npm run test:document`. The latter includes
browser tests for both editors' gutter lifecycle, tooltips, completion,
diagnostics, definitions, search and disposal.

## AI commands (document editor, 0.17.0)

The bundle ships no model. A host lends one, with the commands it offers:

```js
createDocumentEditor(el, {
  ai: {
    commands: [
      { id: 'grammar', label: 'Fix grammar', hint: 'minimal changes', keywords: ['spelling'],
        scope: 'prose', target: 'selection-or-block', kind: 'replace' },
      { id: 'edit', label: 'Change it', scope: 'any', target: 'selection-or-block', kind: 'replace', instruction: true },
    ],
    run: (request, { signal, onText }) => Promise<{ text, model? }>,
    model: () => 'provider/model',          // named in the command box
    available: () => true | 'reason',       // checked when the box opens
    beforeAccept: event => Promise | void,  // e.g. save pending edits first; event.result() is the
                                            // document as accepting will leave it; a rejection abandons the accept
    onAccept: event => void,                // provenance: command, model, range, text
    notify: message => void,                // "the text changed, so the suggestion was dropped"
    escalate: { label: 'Ask an agent', run: text => void },
  },
});
```

- `scope` — `prose`, `code` (inside a code cell) or `any`. The YAML header
  and ```output result blocks are never acted on.
- `target` — `cursor` (insert there), `selection-or-block` (the selection,
  else the paragraph or heading / the cell's code), `selection-or-line`.
- `kind` — `insert` or `replace`.
- `instruction: true` (at most one command) — the command box turns any
  text that names no command into this command's instruction.

`run` receives `{command, instruction, scope, kind, target: {from, to,
text}, before, after, block: {type, language, from, to, text}, document}`
and may call `onText(textSoFar)` while the answer streams; it must stop
when `signal` aborts (the suggestion was discarded or replaced). The
editor shapes the answer deterministically (a wrapping code fence is
removed, a replacement keeps the target's edge whitespace, an insertion
loses a repeat of the text before the cursor).

A suggestion is not document text until accepted: nothing is saved,
shared or undoable before that. Accepting is one transaction
(`userEvent` `input.ai`, `aiEditAnnotation` with `{command, model,
instruction}`, its own undo step), refused if the replaced text changed.
Keys: Mod-j opens the box; Tab accepts with the cursor in the suggested
range; Escape discards; Alt-] / Alt-[ step through answers (past the last,
another is asked for). `openAiMenu()` and `runAiCommand(id, {instruction})`
do the same from host buttons; code cells get a ✦ button when both `ai`
and `onRunCell` are set.

### Finding the commands without knowing a key (0.18.0)

- **The spark.** A ✦ in a narrow gutter of its own, on the cursor's line,
  while the editor has focus and commands can act there (not on the YAML
  header or a result block, not when `available()` gives a reason). A click
  opens the box. It is faint at rest, lit for a selection or an open box,
  pulses while an answer for the text at the cursor is written, and is lit
  again when that answer is ready. It lives in the margin, so it never
  moves or covers text, and the gutter keeps its width when it is hidden.
  With `ai`, the gutters show even without `lineGutter`. Its rest opacity
  is the token `--mrmd-ai-spark-rest` (default .38): a host without
  half-tones (e-ink) sets it to 1. Motion stops under
  prefers-reduced-motion.
- **Keys on the buttons.** Every suggestion button with a key shows it
  ("Accept Tab"), and the box, opened any other way than Mod-j, says
  "Ctrl+J opens this box".
- **`editor.keyHelp()`** returns the editor's keys that act here, now, for
  the host's own keyboard help: `[{label, keys: [[names, what]],
  exclusive?}]`, most local first — the open box (`exclusive`: it owns the
  keyboard), a suggestion, then the cell or document at the cursor (run
  keys, Mod-j). `names` are CodeMirror key names; `mrmdDocument.formatKey(
  name, {mac?})` spells one as it reads (`Ctrl+J`, `⌘J`). Keys the host
  binds itself (save, search, completion) are the host's to list.

## Reviewing changes in the text (both editors, 0.19.0)

`editor.review` shows proposed changes in the text against what it was
before — the old lines struck through above the new ones, which are
ordinary text: rendered, and editable before they are accepted — with
Accept / Reject on each change and a panel under the text (count, next /
previous, Accept all, Reject all). Built on `@codemirror/merge`'s unified
view (document-review.js).

```js
const editor = createDocumentEditor(el, {        // or createCodeEditor
  review: {
    onResolved: outcome => {},  // a proposal was decided (see below)
    onChange: summary => {},    // {changes, proposals, capturing}
  },
});
editor.review.propose({ from, to, insert, meta });   // one change; null over a change still under review
const c = editor.review.capture(meta);                // every change until c.end() is one proposal
editor.updateContent(text);                           // smallest changes to reach text (keeps cursor, marks, review)
c.end();                                              // false when nothing changed
editor.review.summary(); editor.review.first(); editor.review.acceptAll(); editor.review.rejectAll();
```

Only proposals are reviewed: any other edit (typing elsewhere, a
collaborator, a cell result) is copied into the review's original as it
happens, so it never shows as a change. Editing inside a change edits the
proposal. The outcome of a proposal: `{id, meta, startedAt, resolvedAt,
how: 'reviewed' | 'closed', decision, hunks: [{before, proposed, final,
decision}]}` — per changed region (whole lines, line breaks included) the
text before, the text proposed and the text kept; `decision` is
`accepted`, `rejected`, `edited` (changed before accepting, or partly
rejected), `mixed` over several regions, or `left` (the editor closed
first; the text stays).

The merge view shows changes a blank line apart as one change, with one
Accept / Reject pair; deciding it decides every proposal in it. Reject puts
back the differences one by one (not the whole region), so each proposal's
recorded `final` is exactly what its own lines became. A new proposal puts
the cursor on its first changed line (where the keys act).

Keys: Alt-y / Alt-n accept / reject the change at the cursor, Alt-Shift-y /
Alt-Shift-n all of them, Alt-] / Alt-[ next / previous (`keyHelp()` lists
them). Tokens: `--mrmd-review-inserted` and `--mrmd-review-deleted` (a host
without half-tones sets both to `transparent`; bars, strike-through and
underline remain).

AI commands (`ai.mode: {get, set}`): 'suggest' (beside the text, Tab
accepts) or 'review' (the answer goes into the text as a proposal whose
`meta` is `{source: 'ai-command', command, label, instruction, model, op}`);
the command box switches it. In suggest mode "Edit in text" moves one
answer in. `ai.onOutcome(outcome)` reports every command's end: `{op,
command, label, instruction, scope, kind, language, target, before, after,
answers: [{text, model, status, error}], shown, decision, final, mode, ms}`
with `decision` one of accepted, discarded, stopped, stale, replaced,
closed, review.

## AI commands in the whole-file editor (0.20.0)

`createCodeEditor(el, { ai: { …as for the document editor, scope, language } })`
gives source and plain-text files the same AI surface: the command box
(Mod-j), the ✦ beside the cursor's line, suggestions or review (`mode`),
outcomes, `openAiMenu()`, `runAiCommand()`, and `keyHelp()`.

- `scope: 'code'` (default): a source file. Without a selection, a
  `selection-or-block` command acts on the outermost syntax construct at the
  cursor that fits 12 000 characters (a function or class; in a huge one,
  the construct inside it), in whole lines, with the comment lines right
  above it. A one-line construct (or a language whose parser gives only
  tokens) gives way to the lines around it up to blank lines. On a blank
  line between blocks there is no block. The selection may be anywhere.
- `scope: 'prose'`: plain text; the block is the paragraph (blank lines).
- `language`: the name given to the model (`block.language` in requests).

Only the host's commands with that scope (or `any`) are offered. Internally
places are found by a place finder (`documentPlaceAt` for documents,
`filePlaceFinder(scope, language)` here); see document-ai-targets.js.
