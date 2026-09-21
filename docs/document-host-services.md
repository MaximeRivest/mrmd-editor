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
