/**
 * @fileoverview Context side panel for markdown-managed AI context.
 */

const CONTEXT_PANEL_STYLES = `
.mrmd-context-panel {
  width: 320px;
  min-width: 240px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--mrmd-border, #333);
  background: var(--mrmd-panel-bg, #161b22);
  color: var(--mrmd-fg, #c9d1d9);
  font-family: var(--mrmd-ui-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 12px;
  overflow: hidden;
}

.mrmd-context-panel--collapsed {
  width: 38px;
  min-width: 38px;
}

.mrmd-context-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--mrmd-border, #333);
  background: var(--mrmd-panel-header-bg, rgba(255,255,255,0.02));
}

.mrmd-context-panel__title {
  flex: 1;
  font-weight: 600;
  color: var(--mrmd-fg, #c9d1d9);
}

.mrmd-context-panel__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mrmd-context-panel__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--mrmd-border, #333);
  border-radius: 6px;
  background: var(--mrmd-bg, #0d1117);
  color: var(--mrmd-fg, #c9d1d9);
  cursor: pointer;
  font-size: 12px;
}

.mrmd-context-panel__btn:hover {
  border-color: var(--mrmd-accent, #58a6ff);
  color: var(--mrmd-accent, #58a6ff);
}

.mrmd-context-panel__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.mrmd-context-panel__body {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.mrmd-context-panel--collapsed .mrmd-context-panel__body,
.mrmd-context-panel--collapsed .mrmd-context-panel__title,
.mrmd-context-panel--collapsed .mrmd-context-panel__actions > :not(.mrmd-context-panel__toggle) {
  display: none;
}

.mrmd-context-panel--collapsed .mrmd-context-panel__header {
  justify-content: center;
  padding: 10px 6px;
}

.mrmd-context-panel__section {
  margin-bottom: 14px;
}

.mrmd-context-panel__section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--mrmd-fg-muted, #8b949e);
  margin-bottom: 6px;
}

.mrmd-context-panel__meta,
.mrmd-context-panel__message {
  line-height: 1.45;
  color: var(--mrmd-fg-muted, #8b949e);
}

.mrmd-context-panel__message {
  padding: 12px;
  border: 1px dashed var(--mrmd-border, #333);
  border-radius: 8px;
}

.mrmd-context-panel__path {
  font-family: var(--mrmd-code-font, 'SF Mono', Consolas, monospace);
  font-size: 11px;
  color: var(--mrmd-accent, #58a6ff);
  word-break: break-all;
}

.mrmd-context-panel__source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mrmd-context-panel__source {
  border: 1px solid var(--mrmd-border, #333);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--mrmd-bg-secondary, rgba(255,255,255,0.02));
}

.mrmd-context-panel__source-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mrmd-context-panel__source-name {
  font-weight: 500;
  color: var(--mrmd-fg, #c9d1d9);
}

.mrmd-context-panel__source-sub {
  margin-top: 4px;
  color: var(--mrmd-fg-muted, #8b949e);
  font-size: 11px;
  line-height: 1.4;
}

.mrmd-context-panel__badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--mrmd-border, #333);
  color: var(--mrmd-fg-muted, #8b949e);
  font-size: 10px;
}

.mrmd-context-panel__footer {
  padding-top: 6px;
  border-top: 1px solid var(--mrmd-border, #333);
}

.mrmd-context-panel__tokenbar {
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--mrmd-hover-bg, rgba(255,255,255,0.06));
  margin: 8px 0 6px;
}

.mrmd-context-panel__tokenfill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: linear-gradient(90deg, var(--mrmd-accent, #58a6ff), var(--mrmd-success, #2ea043));
}

.mrmd-context-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mrmd-context-panel__small {
  font-size: 11px;
  color: var(--mrmd-fg-muted, #8b949e);
}

@media (max-width: 960px) {
  .mrmd-context-panel {
    display: none;
  }
}
`;

let stylesInjected = false;

function injectContextPanelStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.id = 'mrmd-context-panel-styles';
  style.textContent = CONTEXT_PANEL_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

function formatTokens(count) {
  const value = Number(count || 0);
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleForSource(source) {
  const type = source?.type || 'source';
  switch (type) {
    case 'document': return `📄 Document`;
    case 'linked-page': return `🔗 ${source.name || 'Linked Page'}`;
    case 'images': return `🖼️ Images`;
    case 'runtime': return `🐍 Runtime`;
    case 'runtime-variables': return `🐍 Variables`;
    case 'runtime-docstrings': return `📚 Docstrings`;
    case 'runtime-paths': return `📍 Source Paths`;
    case 'runtime-source': return `💾 Source Code`;
    case 'file': return `📎 ${source.path || 'File'}`;
    case 'url': return `🌐 ${source.url || 'URL'}`;
    case 'notes': return `📝 Notes`;
    default: return type;
  }
}

function describeSource(source) {
  if (!source) return '';
  if (source.type === 'document') {
    return `mode=${source.mode || 'full'}`;
  }
  if (source.type === 'linked-page') {
    return [source.path, source.depth != null ? `depth ${source.depth}` : null].filter(Boolean).join(' · ');
  }
  if (source.type === 'runtime') {
    return source.available ? [source.runtimeUrl, source.runtimePort ? `port ${source.runtimePort}` : null].filter(Boolean).join(' · ') : 'No runtime attached';
  }
  if (source.type === 'images') {
    return source.count != null ? `${source.count} image${source.count === 1 ? '' : 's'}` : '';
  }
  if (source.type === 'file') {
    return source.path || '';
  }
  if (source.type === 'url') {
    return source.url || '';
  }
  if (source.count != null) {
    return `${source.count} item${source.count === 1 ? '' : 's'}`;
  }
  return '';
}

export function createContextPanel(options) {
  const {
    container,
    orchestratorClient,
    shellState,
    getCurrentDocument,
    getEditor,
    getAiContext,
    onOpenRaw,
  } = options;

  injectContextPanelStyles();

  const state = {
    collapsed: false,
    loading: false,
    doc: null,
    data: null,
  };

  const panel = document.createElement('aside');
  panel.className = 'mrmd-context-panel';

  const header = document.createElement('div');
  header.className = 'mrmd-context-panel__header';

  const title = document.createElement('div');
  title.className = 'mrmd-context-panel__title';
  title.textContent = 'Context';

  const actions = document.createElement('div');
  actions.className = 'mrmd-context-panel__actions';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'mrmd-context-panel__btn';
  refreshBtn.title = 'Refresh resolved context';
  refreshBtn.textContent = '⟳';

  const rawBtn = document.createElement('button');
  rawBtn.className = 'mrmd-context-panel__btn';
  rawBtn.title = 'Open raw context markdown';
  rawBtn.textContent = '✏';

  const materializeBtn = document.createElement('button');
  materializeBtn.className = 'mrmd-context-panel__btn';
  materializeBtn.title = 'Create a document-specific context from the current effective context';
  materializeBtn.textContent = '⎘';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'mrmd-context-panel__btn mrmd-context-panel__toggle';
  toggleBtn.title = 'Collapse context panel';
  toggleBtn.textContent = '›';

  actions.append(refreshBtn, rawBtn, materializeBtn, toggleBtn);
  header.append(title, actions);

  const body = document.createElement('div');
  body.className = 'mrmd-context-panel__body';

  panel.append(header, body);
  container.appendChild(panel);

  function setCollapsed(collapsed) {
    state.collapsed = collapsed;
    panel.classList.toggle('mrmd-context-panel--collapsed', collapsed);
    toggleBtn.textContent = collapsed ? '‹' : '›';
    toggleBtn.title = collapsed ? 'Expand context panel' : 'Collapse context panel';
  }

  function currentContextRequest() {
    const doc = getCurrentDocument?.();
    const editor = getEditor?.();
    let content = null;
    let cursorPos = null;
    let selection = null;

    try {
      if (editor?.view) {
        const view = editor.view;
        content = view.state.doc.toString();
        if (getAiContext) {
          const aiContext = getAiContext(view);
          cursorPos = aiContext.cursorPos;
          selection = { from: aiContext.selectionFrom, to: aiContext.selectionTo };
        }
      }
    } catch {
      // Ignore and fall back to document-only resolve.
    }

    return { doc, content, cursorPos, selection, ensureExists: true };
  }

  function render() {
    const doc = state.doc;
    const data = state.data;
    const hiddenDoc = !doc || doc.startsWith('_');
    body.innerHTML = '';

    refreshBtn.disabled = !doc || state.loading || hiddenDoc;
    rawBtn.disabled = !doc;
    materializeBtn.disabled = !doc || state.loading || hiddenDoc;

    if (!doc) {
      const message = document.createElement('div');
      message.className = 'mrmd-context-panel__message';
      message.textContent = 'No document open.';
      body.appendChild(message);
      return;
    }

    if (hiddenDoc) {
      const message = document.createElement('div');
      message.className = 'mrmd-context-panel__message';
      message.innerHTML = 'Context panel is disabled for infrastructure documents like <code>_assets/context/*.md</code>. Use the raw editor to edit this file directly.';
      body.appendChild(message);
      return;
    }

    if (state.loading && !data) {
      const message = document.createElement('div');
      message.className = 'mrmd-context-panel__message';
      message.textContent = 'Resolving context…';
      body.appendChild(message);
      return;
    }

    if (!data) {
      const message = document.createElement('div');
      message.className = 'mrmd-context-panel__message';
      message.textContent = 'No resolved context yet.';
      body.appendChild(message);
      return;
    }

    const overview = document.createElement('section');
    overview.className = 'mrmd-context-panel__section';
    overview.innerHTML = `
      <div class="mrmd-context-panel__section-title">
        <span>Active Context</span>
        <span class="mrmd-context-panel__badge">${data.contextFileSource || 'document'}</span>
      </div>
      <div class="mrmd-context-panel__meta">
        <div class="mrmd-context-panel__path">${escapeHtml(data.contextFilePath || '')}</div>
        <div class="mrmd-context-panel__small">${data.usingDefault ? 'Using project default context' : 'Using document-specific context'}</div>
      </div>
    `;
    body.appendChild(overview);

    const sourcesSection = document.createElement('section');
    sourcesSection.className = 'mrmd-context-panel__section';

    const titleRow = document.createElement('div');
    titleRow.className = 'mrmd-context-panel__section-title';
    titleRow.innerHTML = `<span>Resolved Sources</span><span>${(data.sources || []).length}</span>`;
    sourcesSection.appendChild(titleRow);

    const list = document.createElement('div');
    list.className = 'mrmd-context-panel__source-list';

    for (const source of data.sources || []) {
      const item = document.createElement('div');
      item.className = 'mrmd-context-panel__source';
      const sub = describeSource(source);
      item.innerHTML = `
        <div class="mrmd-context-panel__source-main">
          <div class="mrmd-context-panel__source-name">${escapeHtml(titleForSource(source))}</div>
          <div class="mrmd-context-panel__badge">${formatTokens(source.tokens || 0)} tok</div>
        </div>
        ${sub ? `<div class="mrmd-context-panel__source-sub">${escapeHtml(sub)}</div>` : ''}
      `;
      list.appendChild(item);
    }

    if (!list.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'mrmd-context-panel__message';
      empty.textContent = 'No context sources resolved. Edit the context markdown to add sources.';
      sourcesSection.appendChild(empty);
    } else {
      sourcesSection.appendChild(list);
    }

    body.appendChild(sourcesSection);

    const footer = document.createElement('section');
    footer.className = 'mrmd-context-panel__section mrmd-context-panel__footer';
    const percent = Math.max(0, Math.min(100, ((data.tokenEstimate || 0) / 8000) * 100));
    footer.innerHTML = `
      <div class="mrmd-context-panel__row">
        <span>Total</span>
        <strong>${formatTokens(data.tokenEstimate || 0)} tokens</strong>
      </div>
      <div class="mrmd-context-panel__tokenbar">
        <div class="mrmd-context-panel__tokenfill" style="width: ${percent}%;"></div>
      </div>
      <div class="mrmd-context-panel__row mrmd-context-panel__small">
        <span>Budget reference</span>
        <span>8k tokens</span>
      </div>
      ${(data.images || []).length ? `<div class="mrmd-context-panel__small" style="margin-top:8px;">${data.images.length} image reference${data.images.length === 1 ? '' : 's'} resolved</div>` : ''}
    `;
    body.appendChild(footer);
  }

  async function refresh() {
    const request = currentContextRequest();
    state.doc = request.doc;
    render();
    if (!request.doc || request.doc.startsWith('_')) return;

    state.loading = true;
    render();
    try {
      state.data = await orchestratorClient.resolveContext(request);
    } catch (error) {
      state.data = {
        contextFileSource: 'error',
        contextFilePath: '_assets/context',
        usingDefault: false,
        tokenEstimate: 0,
        sources: [],
        images: [],
      };
      const message = document.createElement('div');
      message.className = 'mrmd-context-panel__message';
      message.textContent = `Failed to resolve context: ${error.message}`;
      body.innerHTML = '';
      body.appendChild(message);
      state.loading = false;
      return;
    }
    state.loading = false;
    render();
  }

  async function openRaw() {
    const doc = getCurrentDocument?.();
    if (!doc) return;
    if (doc.startsWith('_')) return;

    try {
      const current = await orchestratorClient.getContext(doc);
      if (current.source === 'default' || current.source === 'builtin') {
        await orchestratorClient.saveContext(doc, current.content);
      } else if (!current.exists) {
        await orchestratorClient.initContext(doc);
      }
      const rawPath = `_assets/context/${doc.endsWith('.md') ? doc : `${doc}.md`}`;
      await onOpenRaw?.(rawPath);
    } catch (error) {
      console.error('[ContextPanel] Failed to open raw context:', error);
    }
  }

  async function materialize() {
    const doc = getCurrentDocument?.();
    if (!doc) return;
    try {
      const current = await orchestratorClient.getContext(doc);
      await orchestratorClient.saveContext(doc, current.content);
      await refresh();
    } catch (error) {
      console.error('[ContextPanel] Failed to materialize context:', error);
    }
  }

  refreshBtn.addEventListener('click', () => refresh());
  rawBtn.addEventListener('click', () => openRaw());
  materializeBtn.addEventListener('click', () => materialize());
  toggleBtn.addEventListener('click', () => setCollapsed(!state.collapsed));

  const unsubFile = shellState.onPath('file.path', () => {
    state.doc = getCurrentDocument?.();
    refresh();
  });

  render();

  return {
    element: panel,
    async refresh() {
      await refresh();
    },
    setDocument(doc) {
      state.doc = doc;
      render();
    },
    setEditor() {
      render();
    },
    destroy() {
      unsubFile?.();
      panel.remove();
    },
  };
}
