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

## First slice here

Phase 1 editor work should only prove:
- linked-table block detection
- small embedded widget rendering
- linked badge/chrome row
- header-sort action
- `Open grid` shell
- no reveal-on-click for linked tables

## Non-goals for the first slice

- full grid editing richness
- source editor tabs
- join/bind UI end to end
- raw-source editing UI
