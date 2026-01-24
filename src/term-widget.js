/**
 * Terminal Widget for CodeMirror
 *
 * Provides an inline terminal widget for ```term blocks.
 * When activated, the terminal replaces the code block content inline
 * (part of document flow, not an overlay).
 *
 * @module term-widget
 */

import { StateEffect, StateField, Prec } from '@codemirror/state';
import { WidgetType, Decoration, EditorView, keymap } from '@codemirror/view';
import { TermBlock, termBlockRegistry } from './term-block.js';
import { PtyClient } from './term-pty-client.js';
import { findTerminalBlocks, findCodeBlockAtPosition } from './cells.js';

// #region STATE

/**
 * Effect to activate/deactivate terminal for a block
 */
export const setTerminalActive = StateEffect.define({
  map: (value, change) => ({
    ...value,
    pos: change.mapPos(value.pos, 1),
  }),
});

/**
 * State field tracking active terminal block position
 * Only one terminal can be active at a time
 */
export const activeTerminalState = StateField.define({
  create() {
    return null; // { pos, blockInfo, config } or null
  },
  update(state, tr) {
    // Map position through changes
    if (state && tr.docChanged) {
      state = {
        ...state,
        pos: tr.changes.mapPos(state.pos, 1),
      };
    }

    // Apply effects
    for (const effect of tr.effects) {
      if (effect.is(setTerminalActive)) {
        if (effect.value.active) {
          return {
            pos: effect.value.pos,
            blockInfo: effect.value.blockInfo,
            config: effect.value.config,
          };
        } else {
          return null;
        }
      }
    }

    return state;
  },
});

// #endregion STATE

// #region WIDGET

/**
 * Terminal widget that replaces the code block when active
 */
class TerminalWidget extends WidgetType {
  constructor(blockInfo, config) {
    super();
    this.blockInfo = blockInfo;
    this.config = config;
    this.block = null;
    this.xtermInstance = null;
    this.fitAddon = null;
    this.wsConnection = null;
    this.resizeObserver = null;
  }

  eq(other) {
    return (
      other instanceof TerminalWidget &&
      this.blockInfo.start === other.blockInfo.start
    );
  }

  toDOM(view) {
    const container = document.createElement('div');
    container.className = 'term-widget-inline';

    // Fixed height at 60% of viewport
    const height = Math.floor(window.innerHeight * 0.6);
    container.style.height = `${height}px`;

    // Header
    const header = document.createElement('div');
    header.className = 'term-widget-header';
    header.innerHTML = `
      <span class="term-widget-title">terminal</span>
      <span class="term-widget-status">connecting...</span>
      <button class="term-widget-close" title="Close (Esc/Ctrl+Enter)">×</button>
    `;
    container.appendChild(header);

    // Terminal content area
    const content = document.createElement('div');
    content.className = 'term-widget-content';
    container.appendChild(content);

    // Close button handler
    const closeBtn = header.querySelector('.term-widget-close');
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      deactivateTerminal(view);
    };

    // Initialize terminal after DOM is ready
    requestAnimationFrame(() => {
      this._initTerminal(content, view);
    });

    return container;
  }

  _initTerminal(container, view) {
    if (typeof Terminal === 'undefined') {
      container.innerHTML = '<div class="term-error">xterm.js not loaded</div>';
      return;
    }

    // Create or get TermBlock
    const sessionName = this.blockInfo.terminalSession || `line${this.blockInfo.line}`;
    const sessionId = `term:${this.config.filePath || 'untitled'}:${sessionName}`;
    let block = termBlockRegistry.get(sessionId);

    if (!block) {
      block = new TermBlock(this.blockInfo, this.config.filePath, this.blockInfo.line);
      termBlockRegistry.register(block);
    }
    this.block = block;

    // Get theme from CSS variables
    const theme = this._getThemeFromCSS();

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"SF Mono", "Fira Code", "Monaco", "Inconsolata", monospace',
      scrollback: 10000,
      convertEol: true,
      theme: theme,
    });

    this.xtermInstance = term;
    block.xtermInstance = term;

    // Add fit addon
    if (typeof FitAddon !== 'undefined') {
      this.fitAddon = new FitAddon.FitAddon();
      term.loadAddon(this.fitAddon);
      block.fitAddon = this.fitAddon;
    }

    // Add web links addon
    if (typeof WebLinksAddon !== 'undefined') {
      const webLinksAddon = new WebLinksAddon.WebLinksAddon();
      term.loadAddon(webLinksAddon);
    }

    // Open terminal
    term.open(container);

    // Fit to container
    if (this.fitAddon) {
      setTimeout(() => {
        try {
          this.fitAddon.fit();
        } catch (e) {
          console.warn('[TermWidget] Initial fit failed:', e);
        }
      }, 50);
    }

    // Setup resize observer
    this.resizeObserver = new ResizeObserver(() => {
      if (this.fitAddon && term.element) {
        try {
          this.fitAddon.fit();
          if (this.wsConnection?.isConnected()) {
            this.wsConnection.resize(term.cols, term.rows);
          }
        } catch (e) {
          // Ignore resize errors
        }
      }
    });
    this.resizeObserver.observe(container);

    // Connect to PTY
    this._connectToPty(term, view);

    // Focus terminal
    term.focus();

    // Listen for theme changes to update terminal colors dynamically
    this._setupThemeListener(term);
  }

  /**
   * Setup listener for theme changes
   */
  _setupThemeListener(term) {
    // Watch for class changes on document element (theme switching)
    this._themeObserver = new MutationObserver(() => {
      this._updateTerminalTheme(term);
    });

    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    // Also watch the body
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    // Listen for custom theme change events
    this._themeChangeHandler = () => {
      this._updateTerminalTheme(term);
    };
    document.addEventListener('mrmd-theme-change', this._themeChangeHandler);
    window.addEventListener('mrmd-theme-change', this._themeChangeHandler);
  }

  /**
   * Update terminal theme from current CSS variables
   */
  _updateTerminalTheme(term) {
    if (!term) return;

    // Small delay to let CSS variables update
    requestAnimationFrame(() => {
      const newTheme = this._getThemeFromCSS();
      term.options.theme = newTheme;
    });
  }

  _connectToPty(term, view) {
    if (!this.config.baseUrl) {
      term.write('\x1b[33m[PTY server not running]\x1b[0m\r\n');
      this._updateStatus(view, 'offline');
      return;
    }

    const client = new PtyClient({
      baseUrl: this.config.baseUrl,
      sessionId: this.block.sessionId,
      cwd: this.config.cwd,
      venv: this.config.venv,
      filePath: this.block.filePath,
      onData: (data) => {
        term.write(data);
      },
      onConnect: () => {
        console.log('[TermWidget] PTY connected');
        this._updateStatus(view, 'connected');
      },
      onDisconnect: (code, reason) => {
        console.log('[TermWidget] PTY disconnected:', code, reason);
        this._updateStatus(view, 'disconnected');
      },
      onError: (err) => {
        console.error('[TermWidget] PTY error:', err);
        term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
        this._updateStatus(view, 'error');
      },
    });

    this.wsConnection = client;
    this.block.wsConnection = client;

    client.connect().then(() => {
      if (this.fitAddon) {
        client.resize(term.cols, term.rows);
      }
    }).catch((err) => {
      console.error('[TermWidget] Failed to connect:', err);
      term.write('\x1b[31m[Failed to connect to PTY server]\x1b[0m\r\n');
      this._updateStatus(view, 'error');
    });

    // Forward input to PTY
    term.onData((data) => {
      client.write(data);
    });
  }

  _updateStatus(view, status) {
    const widget = view.dom.querySelector('.term-widget-inline');
    const statusEl = widget?.querySelector('.term-widget-status');
    if (statusEl) {
      const statusMap = {
        'connecting': '○ connecting...',
        'connected': '● connected',
        'disconnected': '○ disconnected',
        'offline': '○ offline',
        'error': '✕ error',
      };
      statusEl.textContent = statusMap[status] || status;
      statusEl.className = `term-widget-status term-widget-status-${status}`;
    }
  }

  /**
   * Get xterm.js theme from CSS variables
   */
  _getThemeFromCSS() {
    const style = getComputedStyle(document.documentElement);
    const get = (name, fallback) => {
      const value = style.getPropertyValue(name).trim();
      return value || fallback;
    };

    return {
      background: get('--term-background', get('--editor-background', '#1e1e1e')),
      foreground: get('--term-foreground', get('--editor-foreground', '#d4d4d4')),
      cursor: get('--term-cursor', get('--editor-cursor', '#aeafad')),
      cursorAccent: get('--term-cursor-accent', get('--editor-background', '#1e1e1e')),
      selectionBackground: get('--term-selection', get('--editor-selection', '#264f78')),

      // ANSI colors
      black: get('--ansi-black', '#1e1e1e'),
      red: get('--ansi-red', '#f87171'),
      green: get('--ansi-green', '#4ade80'),
      yellow: get('--ansi-yellow', '#facc15'),
      blue: get('--ansi-blue', '#60a5fa'),
      magenta: get('--ansi-magenta', '#c084fc'),
      cyan: get('--ansi-cyan', '#22d3ee'),
      white: get('--ansi-white', '#e0e0e0'),

      // Bright ANSI colors
      brightBlack: get('--ansi-bright-black', '#6b7280'),
      brightRed: get('--ansi-bright-red', '#fca5a5'),
      brightGreen: get('--ansi-bright-green', '#86efac'),
      brightYellow: get('--ansi-bright-yellow', '#fde047'),
      brightBlue: get('--ansi-bright-blue', '#93c5fd'),
      brightMagenta: get('--ansi-bright-magenta', '#d8b4fe'),
      brightCyan: get('--ansi-bright-cyan', '#67e8f9'),
      brightWhite: get('--ansi-bright-white', '#ffffff'),
    };
  }

  /**
   * Get snapshotted content from terminal
   */
  getSnapshot() {
    if (!this.xtermInstance) return '';

    const buffer = this.xtermInstance.buffer.active;
    const lines = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }

    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    return lines.join('\n');
  }

  destroy(dom) {
    // Clean up theme listener
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }

    if (this._themeChangeHandler) {
      document.removeEventListener('mrmd-theme-change', this._themeChangeHandler);
      window.removeEventListener('mrmd-theme-change', this._themeChangeHandler);
      this._themeChangeHandler = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.wsConnection) {
      this.wsConnection.disconnect();
      this.wsConnection = null;
    }

    if (this.xtermInstance) {
      this.xtermInstance.dispose();
      this.xtermInstance = null;
    }

    if (this.block) {
      this.block.xtermInstance = null;
      this.block.wsConnection = null;
      this.block.fitAddon = null;
    }
  }

  ignoreEvent(event) {
    // Let the terminal handle all events
    return true;
  }
}

// Store reference to active widget for snapshotting
let activeWidget = null;

// #endregion WIDGET

// #region DECORATIONS

/**
 * Create decorations for active terminal
 */
function createTerminalDecorations(state) {
  const active = state.field(activeTerminalState);
  if (!active) {
    return Decoration.none;
  }

  // Find the current block position (may have shifted)
  const doc = state.doc.toString();
  const blocks = findTerminalBlocks(doc);

  // Find block closest to the stored position
  let targetBlock = null;
  let minDist = Infinity;
  for (const block of blocks) {
    const dist = Math.abs(block.start - active.pos);
    if (dist < minDist) {
      minDist = dist;
      targetBlock = block;
    }
  }

  if (!targetBlock || minDist > 100) {
    // Block not found or moved too far
    return Decoration.none;
  }

  // Create widget decoration that replaces the code block
  const widget = new TerminalWidget(targetBlock, active.config);
  activeWidget = widget;

  const deco = Decoration.replace({
    widget,
    block: true,
  });

  return Decoration.set([deco.range(targetBlock.start, targetBlock.end)]);
}

/**
 * StateField for terminal decorations
 */
const terminalDecorations = StateField.define({
  create(state) {
    return createTerminalDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.effects.some(e => e.is(setTerminalActive))) {
      return createTerminalDecorations(tr.state);
    }
    return value.map(tr.changes);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

// #endregion DECORATIONS

// #region API

/**
 * Activate terminal for a block
 */
export function activateTerminal(view, blockInfo, config) {
  // Clear the code block content first
  if (blockInfo.codeStart < blockInfo.codeEnd) {
    view.dispatch({
      changes: { from: blockInfo.codeStart, to: blockInfo.codeEnd, insert: '' },
    });
  }

  // Re-find block after content change
  const doc = view.state.doc.toString();
  const blocks = findTerminalBlocks(doc);
  const updatedBlock = blocks.find(b => b.line === blockInfo.line) || blockInfo;

  // Activate terminal mode
  view.dispatch({
    effects: setTerminalActive.of({
      active: true,
      pos: updatedBlock.start,
      blockInfo: updatedBlock,
      config,
    }),
  });
}

/**
 * Deactivate terminal and snapshot content
 */
export function deactivateTerminal(view) {
  const active = view.state.field(activeTerminalState);
  if (!active) return;

  // Get snapshot from widget
  let content = '';
  if (activeWidget) {
    content = activeWidget.getSnapshot();
    // Ensure trailing newline
    if (content && !content.endsWith('\n')) {
      content += '\n';
    }
  }

  // Find the current block position
  const doc = view.state.doc.toString();
  const blocks = findTerminalBlocks(doc);
  let targetBlock = null;
  let minDist = Infinity;
  for (const block of blocks) {
    const dist = Math.abs(block.start - active.pos);
    if (dist < minDist) {
      minDist = dist;
      targetBlock = block;
    }
  }

  // Deactivate first (removes widget)
  view.dispatch({
    effects: setTerminalActive.of({ active: false }),
  });

  activeWidget = null;

  // Then insert the snapshotted content
  if (targetBlock && content) {
    view.dispatch({
      changes: { from: targetBlock.codeStart, to: targetBlock.codeEnd, insert: content },
    });
  }
}

/**
 * Check if terminal is currently active
 */
export function isTerminalActive(view) {
  return view.state.field(activeTerminalState) !== null;
}

/**
 * Launch terminal for a code block (called from cell controls button)
 */
export function launchTerminal(blockInfo, config, view) {
  activateTerminal(view, blockInfo, config);
}

/**
 * Close the active terminal
 */
export function closeTerminal(view) {
  deactivateTerminal(view);
}

// #endregion API

// #region KEYMAP

/**
 * Handle Ctrl+Enter/Shift+Enter toggle
 */
function handleTerminalToggle(view, config) {
  // If terminal is active, close it
  if (isTerminalActive(view)) {
    deactivateTerminal(view);
    return true;
  }

  // Check if cursor is in a terminal block
  const pos = view.state.selection.main.head;
  const doc = view.state.doc.toString();
  const block = findCodeBlockAtPosition(doc, pos);

  if (block && block.terminal) {
    activateTerminal(view, block, config);
    return true;
  }

  return false;
}

/**
 * Create keymap for terminal shortcuts
 */
export function terminalKeymap(config = {}) {
  return Prec.highest(keymap.of([
    {
      key: 'Ctrl-Enter',
      run: (view) => handleTerminalToggle(view, config),
    },
    {
      key: 'Shift-Enter',
      run: (view) => handleTerminalToggle(view, config),
    },
  ]));
}

// #endregion KEYMAP

// #region STYLES

export const termWidgetStyles = `
/* Inline Terminal Widget - uses theme tokens */
.term-widget-inline {
  margin: 4px 0;
  border: 1px solid var(--term-border, var(--widget-border, #3c3c3c));
  border-radius: var(--widget-border-radius, 6px);
  background: var(--term-background, var(--editor-background, #1e1e1e));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.term-widget-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--term-header-bg, var(--mrmd-popup-bg, #252526));
  border-bottom: 1px solid var(--term-border, var(--widget-border, #3c3c3c));
  font-size: 12px;
  flex-shrink: 0;
}

.term-widget-title {
  font-weight: 500;
  color: var(--term-header-fg, var(--widget-text-muted, #888));
  flex: 1;
}

.term-widget-status {
  font-size: 11px;
  color: var(--term-header-fg, var(--widget-text-muted, #888));
  margin-right: 8px;
}

.term-widget-status-connected {
  color: var(--ansi-green, #4ade80);
}

.term-widget-status-error {
  color: var(--ansi-red, #f87171);
}

.term-widget-close {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--term-header-fg, var(--widget-text-muted, #888));
  font-size: 16px;
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.term-widget-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--term-foreground, var(--editor-foreground, #fff));
}

.term-widget-content {
  flex: 1;
  padding: 4px;
  overflow: hidden;
}

.term-widget-content .xterm {
  height: 100%;
}

.term-widget-content .xterm-viewport {
  overflow-y: auto !important;
}

.term-error {
  padding: 20px;
  color: var(--ansi-red, #f87171);
  font-family: monospace;
}
`;

export function injectTermWidgetStyles() {
  if (document.getElementById('term-widget-styles')) return;

  const style = document.createElement('style');
  style.id = 'term-widget-styles';
  style.textContent = termWidgetStyles;
  document.head.appendChild(style);
}

// #endregion STYLES

// #region EXTENSION

/**
 * Create terminal widget extension
 *
 * @param {Object} config
 * @returns {Extension[]}
 */
export function terminalWidget(config = {}) {
  injectTermWidgetStyles();

  return [
    activeTerminalState,
    terminalDecorations,
  ];
}

// Backwards compatibility
export const termOverlayStyles = termWidgetStyles;
export const terminalOverlay = {
  isVisible: () => activeWidget !== null,
  hide: () => {}, // No-op, use deactivateTerminal instead
};
export function isTerminalVisible() {
  return activeWidget !== null;
}

// Re-exports
export { findTerminalBlocks } from './cells.js';
export { TermBlock, termBlockRegistry } from './term-block.js';

export default terminalWidget;

// #endregion EXTENSION
