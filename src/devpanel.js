/**
 * @fileoverview Dev Panel - Shows editor config and state
 *
 * A collapsible panel that displays:
 * - Current configuration (reactive, editable)
 * - Current state (observable, read-only)
 *
 * Usage:
 *   import { createDevPanel, devPanelExtension } from './devpanel.js';
 *
 *   // As extension
 *   const extensions = [devPanelExtension({ config, stateManager })];
 *
 *   // Or standalone
 *   const panel = createDevPanel(container, { config, stateManager });
 */

import { showPanel, EditorView } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

// =============================================================================
// State Effects
// =============================================================================

export const toggleDevPanelEffect = StateEffect.define();

// =============================================================================
// Styles
// =============================================================================

const STYLES = `
.mrmd-devpanel {
  font-family: ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  background: var(--mrmd-devpanel-bg, #1e1e1e);
  color: var(--mrmd-devpanel-fg, #d4d4d4);
  border-top: 1px solid var(--mrmd-devpanel-border, #333);
  max-height: 300px;
  overflow: auto;
}

.mrmd-devpanel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--mrmd-devpanel-header-bg, #252526);
  border-bottom: 1px solid var(--mrmd-devpanel-border, #333);
  cursor: pointer;
  user-select: none;
}

.mrmd-devpanel-header:hover {
  background: var(--mrmd-devpanel-header-hover, #2d2d2d);
}

.mrmd-devpanel-title {
  font-weight: 600;
  color: var(--mrmd-devpanel-title, #e0e0e0);
}

.mrmd-devpanel-toggle {
  font-size: 10px;
  color: var(--mrmd-devpanel-toggle, #888);
}

.mrmd-devpanel-content {
  padding: 8px 12px;
}

.mrmd-devpanel-section {
  margin-bottom: 12px;
}

.mrmd-devpanel-section:last-child {
  margin-bottom: 0;
}

.mrmd-devpanel-section-title {
  font-weight: 600;
  color: var(--mrmd-devpanel-section-title, #4fc1ff);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mrmd-devpanel-section-title .icon {
  opacity: 0.7;
}

.mrmd-devpanel-tree {
  margin-left: 12px;
}

.mrmd-devpanel-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  line-height: 1.4;
}

.mrmd-devpanel-key {
  color: var(--mrmd-devpanel-key, #9cdcfe);
}

.mrmd-devpanel-value {
  color: var(--mrmd-devpanel-value, #ce9178);
}

.mrmd-devpanel-value.string {
  color: var(--mrmd-devpanel-string, #ce9178);
}

.mrmd-devpanel-value.number {
  color: var(--mrmd-devpanel-number, #b5cea8);
}

.mrmd-devpanel-value.boolean {
  color: var(--mrmd-devpanel-boolean, #569cd6);
}

.mrmd-devpanel-value.null {
  color: var(--mrmd-devpanel-null, #808080);
}

.mrmd-devpanel-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
}

.mrmd-devpanel-badge.connected {
  background: #1e3a29;
  color: #4ade80;
}

.mrmd-devpanel-badge.disconnected {
  background: #3a1e1e;
  color: #f87171;
}

.mrmd-devpanel-badge.ready {
  background: #1e2a3a;
  color: #60a5fa;
}

.mrmd-devpanel-collapsed .mrmd-devpanel-content {
  display: none;
}

/* Light theme - comprehensive overrides */
/* Use explicit class set by the panel based on config */
.mrmd-devpanel-light {
  --mrmd-devpanel-bg: #f8f8f8;
  --mrmd-devpanel-fg: #1e1e1e;
  --mrmd-devpanel-border: #d0d0d0;
  --mrmd-devpanel-header-bg: #ebebeb;
  --mrmd-devpanel-header-hover: #e0e0e0;
  --mrmd-devpanel-title: #333;
  --mrmd-devpanel-toggle: #666;
  --mrmd-devpanel-section-title: #0066cc;
  --mrmd-devpanel-key: #0451a5;
  --mrmd-devpanel-value: #a31515;
  --mrmd-devpanel-string: #a31515;
  --mrmd-devpanel-number: #098658;
  --mrmd-devpanel-boolean: #0000ff;
  --mrmd-devpanel-null: #808080;

  background: var(--mrmd-devpanel-bg);
  color: var(--mrmd-devpanel-fg);
  border-color: var(--mrmd-devpanel-border);
}

.mrmd-devpanel-light .mrmd-devpanel-header {
  background: var(--mrmd-devpanel-header-bg);
  border-color: var(--mrmd-devpanel-border);
}

.mrmd-devpanel-light .mrmd-devpanel-header:hover {
  background: var(--mrmd-devpanel-header-hover);
}

.mrmd-devpanel-light .mrmd-devpanel-title {
  color: var(--mrmd-devpanel-title);
}

.mrmd-devpanel-light .mrmd-devpanel-section-title {
  color: var(--mrmd-devpanel-section-title);
}

.mrmd-devpanel-light .mrmd-devpanel-key {
  color: var(--mrmd-devpanel-key);
}

.mrmd-devpanel-light .mrmd-devpanel-value {
  color: var(--mrmd-devpanel-value);
}

.mrmd-devpanel-light .mrmd-devpanel-value.string {
  color: var(--mrmd-devpanel-string);
}

.mrmd-devpanel-light .mrmd-devpanel-value.number {
  color: var(--mrmd-devpanel-number);
}

.mrmd-devpanel-light .mrmd-devpanel-value.boolean {
  color: var(--mrmd-devpanel-boolean);
}

.mrmd-devpanel-light .mrmd-devpanel-value.null {
  color: var(--mrmd-devpanel-null);
}

.mrmd-devpanel-light .mrmd-devpanel-badge.connected {
  background: #dcfce7;
  color: #166534;
}

.mrmd-devpanel-light .mrmd-devpanel-badge.disconnected {
  background: #fee2e2;
  color: #991b1b;
}

.mrmd-devpanel-light .mrmd-devpanel-badge.ready {
  background: #dbeafe;
  color: #1e40af;
}
`;

let stylesInjected = false;

export function injectDevPanelStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

// =============================================================================
// Panel Rendering
// =============================================================================

/**
 * Render a value with syntax highlighting
 * @param {any} value
 * @returns {string}
 */
function renderValue(value) {
  if (value === null || value === undefined) {
    return `<span class="mrmd-devpanel-value null">${value}</span>`;
  }
  if (typeof value === 'boolean') {
    return `<span class="mrmd-devpanel-value boolean">${value}</span>`;
  }
  if (typeof value === 'number') {
    return `<span class="mrmd-devpanel-value number">${value}</span>`;
  }
  if (typeof value === 'string') {
    const escaped = value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="mrmd-devpanel-value string">"${escaped}"</span>`;
  }
  if (Array.isArray(value)) {
    return `<span class="mrmd-devpanel-value">[${value.length} items]</span>`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `<span class="mrmd-devpanel-value">{${keys.length} props}</span>`;
  }
  return `<span class="mrmd-devpanel-value">${String(value)}</span>`;
}

/**
 * Render an object as a tree
 * @param {object} obj
 * @param {number} maxDepth
 * @param {number} currentDepth
 * @returns {string}
 */
function renderTree(obj, maxDepth = 2, currentDepth = 0) {
  if (obj === null || obj === undefined) {
    return renderValue(obj);
  }

  if (typeof obj !== 'object' || currentDepth >= maxDepth) {
    return renderValue(obj);
  }

  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return Array.isArray(obj) ? '[]' : '{}';
  }

  let html = '<div class="mrmd-devpanel-tree">';
  for (const [key, value] of entries) {
    html += `<div class="mrmd-devpanel-row">`;
    html += `<span class="mrmd-devpanel-key">${key}:</span>`;

    if (value !== null && typeof value === 'object' && currentDepth < maxDepth - 1) {
      html += renderTree(value, maxDepth, currentDepth + 1);
    } else {
      html += renderValue(value);
    }

    html += '</div>';
  }
  html += '</div>';

  return html;
}

/**
 * Create the dev panel DOM
 * @param {object} options
 * @param {object} options.config - Reactive config
 * @param {object} options.stateManager - State manager
 * @returns {HTMLElement}
 */
export function createDevPanelDOM({ config, stateManager }) {
  const dom = document.createElement('div');
  const configRaw = config._raw || config;
  const isDark = configRaw.appearance?.dark !== false; // default to dark
  dom.className = `mrmd-devpanel ${isDark ? 'mrmd-devpanel-dark' : 'mrmd-devpanel-light'}`;

  // Header
  const header = document.createElement('div');
  header.className = 'mrmd-devpanel-header';
  header.innerHTML = `
    <span class="mrmd-devpanel-title">📊 Editor Debug</span>
    <span class="mrmd-devpanel-toggle">▼</span>
  `;

  header.addEventListener('click', () => {
    dom.classList.toggle('mrmd-devpanel-collapsed');
    header.querySelector('.mrmd-devpanel-toggle').textContent =
      dom.classList.contains('mrmd-devpanel-collapsed') ? '▶' : '▼';
  });

  dom.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.className = 'mrmd-devpanel-content';
  dom.appendChild(content);

  // Update function
  const update = () => {
    const state = stateManager.getRawState();
    const configRaw = config._raw || config;

    // Update theme class based on current config
    const isDark = configRaw.appearance?.dark !== false;
    dom.classList.remove('mrmd-devpanel-dark', 'mrmd-devpanel-light');
    dom.classList.add(isDark ? 'mrmd-devpanel-dark' : 'mrmd-devpanel-light');

    let html = '';

    // State section
    html += `<div class="mrmd-devpanel-section">`;
    html += `<div class="mrmd-devpanel-section-title"><span class="icon">📡</span> State</div>`;

    // Connection status badge
    const connStatus = state.connection?.status || 'disconnected';
    html += `<div class="mrmd-devpanel-row">`;
    html += `<span class="mrmd-devpanel-key">connection:</span>`;
    html += `<span class="mrmd-devpanel-badge ${connStatus}">${connStatus}</span>`;
    html += `</div>`;

    // Document stats
    html += `<div class="mrmd-devpanel-row">`;
    html += `<span class="mrmd-devpanel-key">document:</span>`;
    html += `<span class="mrmd-devpanel-value">`;
    html += `${state.document?.lines || 0} lines, `;
    html += `${state.document?.cells || 0} cells`;
    if (state.document?.dirty) html += ` (dirty)`;
    if (state.document?.canUndo) html += ` [undo: ${state.document.undoDepth}]`;
    html += `</span>`;
    html += `</div>`;

    // Execution
    if (state.execution) {
      html += `<div class="mrmd-devpanel-row">`;
      html += `<span class="mrmd-devpanel-key">execution:</span>`;
      html += `<span class="mrmd-devpanel-value">`;
      html += `cell ${state.execution.cellIndex} (${state.execution.language})`;
      if (state.execution.progress) {
        html += ` ${Math.round(state.execution.progress * 100)}%`;
      }
      html += `</span>`;
      html += `</div>`;
    }

    // Runtimes
    const runtimeEntries = Object.entries(state.runtimes || {});
    if (runtimeEntries.length > 0) {
      html += `<div class="mrmd-devpanel-row">`;
      html += `<span class="mrmd-devpanel-key">runtimes:</span>`;
      html += `<span class="mrmd-devpanel-value">`;
      html += runtimeEntries.map(([name, rt]) =>
        `${name} <span class="mrmd-devpanel-badge ${rt.status}">${rt.status}</span>`
      ).join(', ');
      html += `</span>`;
      html += `</div>`;
    }

    // Collaborators
    if (state.collaborators?.length > 0) {
      html += `<div class="mrmd-devpanel-row">`;
      html += `<span class="mrmd-devpanel-key">collaborators:</span>`;
      html += `<span class="mrmd-devpanel-value">${state.collaborators.length} online</span>`;
      html += `</div>`;
    }

    // History
    if (state.history?.length > 0) {
      const success = state.history.filter(h => h.success).length;
      html += `<div class="mrmd-devpanel-row">`;
      html += `<span class="mrmd-devpanel-key">history:</span>`;
      html += `<span class="mrmd-devpanel-value">${state.history.length} executions (${success} success)</span>`;
      html += `</div>`;
    }

    // Variables
    const varSessions = Object.keys(state.variables || {});
    if (varSessions.length > 0) {
      const totalVars = varSessions.reduce((sum, s) =>
        sum + Object.keys(state.variables[s] || {}).length, 0);
      html += `<div class="mrmd-devpanel-row">`;
      html += `<span class="mrmd-devpanel-key">variables:</span>`;
      html += `<span class="mrmd-devpanel-value">${totalVars} across ${varSessions.length} sessions</span>`;
      html += `</div>`;
    }

    html += `</div>`;

    // Config section
    html += `<div class="mrmd-devpanel-section">`;
    html += `<div class="mrmd-devpanel-section-title"><span class="icon">⚙️</span> Config</div>`;
    html += renderTree({
      appearance: configRaw.appearance,
      user: configRaw.user,
      runtimes: Object.keys(configRaw.runtimes || {}).length + ' registered',
      execution: configRaw.execution,
    }, 2);
    html += `</div>`;

    content.innerHTML = html;
  };

  // Initial render
  update();

  // Subscribe to state changes
  stateManager.subscribe(update);

  // Subscribe to config changes (if reactive)
  if (config._subscribe) {
    config._subscribe(update);
  }

  return dom;
}

// =============================================================================
// CodeMirror Extension
// =============================================================================

/**
 * State field for panel visibility
 */
const devPanelStateField = StateField.define({
  create() {
    return { isOpen: true };
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(toggleDevPanelEffect)) {
        return { isOpen: !value.isOpen };
      }
    }
    return value;
  },
  provide: field => showPanel.from(field, val => val.isOpen ? createPanel : null)
});

let panelConfig = null;

function createPanel(view) {
  if (!panelConfig) return null;

  injectDevPanelStyles();
  const dom = createDevPanelDOM(panelConfig);

  return {
    dom,
    top: false,
  };
}

/**
 * Create dev panel extension
 * @param {object} options
 * @param {object} options.config - Reactive config
 * @param {object} options.stateManager - State manager
 * @param {boolean} [options.startOpen=true] - Start with panel open
 * @returns {import('@codemirror/state').Extension}
 */
export function devPanelExtension({ config, stateManager, startOpen = true }) {
  panelConfig = { config, stateManager };
  return devPanelStateField;
}

/**
 * Toggle the dev panel
 * @param {EditorView} view
 */
export function toggleDevPanel(view) {
  view.dispatch({
    effects: toggleDevPanelEffect.of(null)
  });
}
