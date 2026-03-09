# mrmd-editor/src/tables

Internal linked-table UI/editor adapter subsystem.

This folder is where MRMD-specific editor integration lives.
It should depend on pure table packages, but the pure packages must not depend back on this folder.

## Ownership

- linked-table block detection inside editor documents
- small/document view widget
- active-inline interactions
- full grid workspace shell
- editor commands for linked tables
- browser-side table job client

## Planned tree

```text
mrmd-editor/src/tables/
  index.js
  facets.js
  commands/
    insert-linked-table.js
    open-table-workspace.js
    open-table-source.js
    refresh-linked-table.js
  parsing/
    linked-table-blocks.js
    anchors.js
  state/
    linked-table-state.js
    table-workspace-state.js
  decorations/
    linked-table-decorations.js
  widgets/
    linked-table-widget.js
    linked-table-chrome.js
    linked-table-status.js
  workspace/
    controller.js
    layout.js
    result-grid.js
    source-grid.js
    panels/
      join-panel.js
      bind-rows-panel.js
      bind-cols-panel.js
      formula-panel.js
      document-view-panel.js
      source-info-panel.js
  jobs/
    client.js
    status.js
  styles.js
```

## Current phase

The first editor-side shell is now wired through the first real sort/import/source/workspace paths for:
- linked-table block detection from markdown/spec headers
- small embedded linked-table widget rendering
- linked badge/chrome row
- header-sort event dispatch
- explicit `Open grid` / `Open source` / `Reveal source` / `Open markdown` / `Refresh` action dispatch
- browser-side `tableJobs` client + wait/status helpers
- Yjs block-anchor creation for linked-table jobs
- controller wiring from header-sort widget actions to real `tableJobs` requests
- host-backed linked-table import insertion helpers in the editor layer
- first studio/status-bar UI command path for linked-table import
- block-local markdown-source reveal with a visible `Return to linked view` path
- first widget job-status badge updates for linked tables
- basic source-mtime stale detection for visible linked tables
- first real `Open grid` workspace panel hook (implemented in the Electron app for now)
- no reveal-on-click for linked tables in the markdown block-decoration path

## First slice here

Phase 1 editor work should only prove:
- linked-table block detection
- small embedded widget rendering
- linked badge/chrome row
- header-sort action
- `Open grid` shell
- no reveal-on-click for linked tables

Known gaps after the first manual app test:
- latency is visible because the first materialization path is still simple and mostly unoptimized
- widget chrome status is still only a first-pass badge layer, not the full stale/progress/error design yet
- the new workspace is still an MVP inspection shell, not yet the full editing/data-workbench experience

## Non-goals for the first slice

- full grid editing richness
- source editor tabs
- join/bind UI end to end
- raw-source editing UI
