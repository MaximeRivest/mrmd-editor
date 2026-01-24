/**
 * Terminal Widget for CodeMirror
 *
 * Provides an inline terminal overlay that can be activated for ```term blocks.
 * The blocks remain editable by default - the terminal is shown as an
 * inline overlay (same position as the code block) when launched.
 *
 * @module term-widget
 */

import { StateEffect } from '@codemirror/state';
import { TermBlock, termBlockRegistry } from './term-block.js';
import { PtyClient } from './term-pty-client.js';
import { findTerminalBlocks } from './cells.js';

// #region STATE

/**
 * Effect to show/hide terminal overlay for a block
 */
export const showTerminalOverlay = StateEffect.define();
export const hideTerminalOverlay = StateEffect.define();

// #endregion STATE

// #region OVERLAY

/**
 * Terminal overlay manager
 * Creates an inline terminal that overlays the code block in the editor
 */
class TerminalOverlayManager {
  constructor() {
    this.overlay = null;
    this.currentBlock = null;
    this.blockInfo = null;
    this.xtermInstance = null;
    this.fitAddon = null;
    this.wsConnection = null;
    this.resizeObserver = null;
    this.scrollHandler = null;
    this.config = null;
    this.view = null;
  }

  /**
   * Show terminal overlay for a block (inline, not modal)
   */
  show(blockInfo, config, view) {
    // Close any existing overlay
    this.hide(false); // Don't snapshot when switching blocks

    this.config = config;
    this.view = view;
    this.blockInfo = blockInfo;

    // Create or get TermBlock
    const sessionId = `term:${config.filePath || 'untitled'}:${blockInfo.line}`;
    let block = termBlockRegistry.get(sessionId);

    if (!block) {
      block = new TermBlock(blockInfo, config.filePath, blockInfo.line);
      termBlockRegistry.register(block);
    } else {
      // Update positions
      block.start = blockInfo.start;
      block.end = blockInfo.end;
      block.codeStart = blockInfo.codeStart;
      block.codeEnd = blockInfo.codeEnd;
      block.content = blockInfo.code;
    }

    this.currentBlock = block;
    block.mode = 'terminal';

    // Create overlay element (will be positioned inline)
    this.overlay = document.createElement('div');
    this.overlay.className = 'term-inline-overlay';
    this.overlay.innerHTML = `
      <div class="term-inline-header">
        <span class="term-inline-title">terminal</span>
        <span class="term-inline-status">connecting...</span>
        <button class="term-inline-close" title="Close (Esc)">×</button>
      </div>
      <div class="term-inline-content"></div>
    `;

    // Find the editor's scroll container and content area
    const editorDom = view.dom;
    const scrollDom = view.scrollDOM;

    // Get the position of the code block in the editor
    const blockRect = this._getBlockRect(view, blockInfo);
    if (!blockRect) {
      console.error('[TermOverlay] Could not get block position');
      return;
    }

    // Position overlay relative to editor
    const editorRect = editorDom.getBoundingClientRect();
    const scrollRect = scrollDom.getBoundingClientRect();

    // Insert overlay into the editor DOM (so it scrolls with content)
    this.overlay.style.position = 'absolute';
    this.overlay.style.left = '0';
    this.overlay.style.right = '0';
    this.overlay.style.top = `${blockRect.top}px`;
    this.overlay.style.height = `${Math.max(blockRect.height, 200)}px`;
    this.overlay.style.zIndex = '100';

    // Add to scroller so it moves with content
    scrollDom.style.position = 'relative';
    scrollDom.appendChild(this.overlay);

    // Setup close handlers
    const closeBtn = this.overlay.querySelector('.term-inline-close');
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide(true);
    };

    // Click outside handler
    this._clickOutsideHandler = (e) => {
      if (this.overlay && !this.overlay.contains(e.target)) {
        this.hide(true);
      }
    };
    // Delay adding click handler to avoid immediate trigger
    setTimeout(() => {
      document.addEventListener('mousedown', this._clickOutsideHandler, true);
    }, 100);

    // Escape key handler
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide(true);
      }
    };
    document.addEventListener('keydown', this._escHandler);

    // Initialize xterm.js
    const termContainer = this.overlay.querySelector('.term-inline-content');
    this._initXterm(termContainer);
  }

  /**
   * Get the bounding rect of a code block in editor coordinates
   */
  _getBlockRect(view, blockInfo) {
    try {
      // Get the line positions
      const startLine = view.state.doc.lineAt(blockInfo.start);
      const endLine = view.state.doc.lineAt(blockInfo.end);

      // Get the visual positions using coordsAtPos
      const startCoords = view.coordsAtPos(startLine.from);
      const endCoords = view.coordsAtPos(endLine.to);

      if (!startCoords || !endCoords) return null;

      // Convert to scroll-relative coordinates
      const scrollTop = view.scrollDOM.scrollTop;
      const scrollRect = view.scrollDOM.getBoundingClientRect();

      return {
        top: startCoords.top - scrollRect.top + scrollTop,
        height: endCoords.bottom - startCoords.top,
      };
    } catch (e) {
      console.error('[TermOverlay] Error getting block rect:', e);
      return null;
    }
  }

  /**
   * Initialize xterm.js in the overlay
   */
  _initXterm(container) {
    if (typeof Terminal === 'undefined') {
      container.innerHTML = '<div class="term-error">xterm.js not loaded</div>';
      return;
    }

    const theme = this._getTheme();

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"SF Mono", "Fira Code", "Monaco", "Inconsolata", monospace',
      scrollback: 10000,
      convertEol: true,
      theme: theme,
    });

    this.xtermInstance = term;
    this.currentBlock.xtermInstance = term;

    // Add fit addon
    if (typeof FitAddon !== 'undefined') {
      this.fitAddon = new FitAddon.FitAddon();
      term.loadAddon(this.fitAddon);
      this.currentBlock.fitAddon = this.fitAddon;
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
          console.warn('[TermOverlay] Initial fit failed:', e);
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
    this._connectToPty(term);

    // Focus terminal
    term.focus();
  }

  /**
   * Connect to PTY backend
   */
  _connectToPty(term) {
    if (!this.config.baseUrl) {
      term.write('\x1b[33m[PTY server not running]\x1b[0m\r\n');
      this._updateStatus('offline');
      return;
    }

    const client = new PtyClient({
      baseUrl: this.config.baseUrl,
      sessionId: this.currentBlock.sessionId,
      cwd: this.config.cwd,
      venv: this.config.venv,
      filePath: this.currentBlock.filePath,
      onData: (data) => {
        term.write(data);
      },
      onConnect: () => {
        console.log('[TermOverlay] PTY connected');
        this._updateStatus('connected');
      },
      onDisconnect: (code, reason) => {
        console.log('[TermOverlay] PTY disconnected:', code, reason);
        this._updateStatus('disconnected');
      },
      onError: (err) => {
        console.error('[TermOverlay] PTY error:', err);
        term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
        this._updateStatus('error');
      },
    });

    this.wsConnection = client;
    this.currentBlock.wsConnection = client;

    client.connect().then(() => {
      if (this.fitAddon) {
        client.resize(term.cols, term.rows);
      }
    }).catch((err) => {
      console.error('[TermOverlay] Failed to connect:', err);
      term.write('\x1b[31m[Failed to connect to PTY server]\x1b[0m\r\n');
      this._updateStatus('error');
    });

    // Forward input to PTY
    term.onData((data) => {
      client.write(data);
    });
  }

  /**
   * Update status indicator
   */
  _updateStatus(status) {
    const statusEl = this.overlay?.querySelector('.term-inline-status');
    if (statusEl) {
      const statusMap = {
        'connecting': '○ connecting...',
        'connected': '● connected',
        'disconnected': '○ disconnected',
        'offline': '○ offline',
        'error': '✕ error',
      };
      statusEl.textContent = statusMap[status] || status;
      statusEl.className = `term-inline-status term-inline-status-${status}`;
    }
  }

  /**
   * Get terminal theme
   */
  _getTheme() {
    const isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;

    if (isDark) {
      return {
        background: '#1a1a1a',
        foreground: '#d4d4d4',
        cursor: '#aeafad',
        cursorAccent: '#000000',
        selectionBackground: '#264f78',
      };
    } else {
      return {
        background: '#fafafa',
        foreground: '#2c2c2c',
        cursor: '#333333',
        cursorAccent: '#ffffff',
        selectionBackground: '#b5d5ff',
      };
    }
  }

  /**
   * Hide overlay and optionally snapshot content
   * @param {boolean} shouldSnapshot - Whether to snapshot and update document
   */
  hide(shouldSnapshot = true) {
    if (!this.overlay) return;

    // Snapshot terminal buffer and update document
    if (shouldSnapshot && this.currentBlock && this.xtermInstance && this.view) {
      const content = this.currentBlock.snapshot();
      console.log('[TermOverlay] Snapshotted content length:', content.length);

      // Re-find the block to get current positions (document may have changed)
      const doc = this.view.state.doc.toString();
      const blocks = findTerminalBlocks(doc);
      const currentBlockLine = this.blockInfo?.line;

      // Find the block by line number
      const updatedBlock = blocks.find(b => b.line === currentBlockLine);

      if (updatedBlock) {
        // Replace only the CODE content (between fences), not the whole block
        const from = updatedBlock.codeStart;
        const to = updatedBlock.codeEnd;

        try {
          this.view.dispatch({
            changes: { from, to, insert: content },
          });
          console.log('[TermOverlay] Document updated (code content replaced)');
        } catch (e) {
          console.error('[TermOverlay] Failed to update document:', e);
        }
      } else {
        console.warn('[TermOverlay] Could not find block to update');
      }
    }

    // Cleanup event handlers
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    if (this._clickOutsideHandler) {
      document.removeEventListener('mousedown', this._clickOutsideHandler, true);
      this._clickOutsideHandler = null;
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

    if (this.currentBlock) {
      this.currentBlock.mode = 'view';
      this.currentBlock.xtermInstance = null;
      this.currentBlock.wsConnection = null;
      this.currentBlock.fitAddon = null;
      this.currentBlock = null;
    }

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    this.fitAddon = null;
    this.blockInfo = null;
    this.config = null;
    this.view = null;
  }

  /**
   * Check if overlay is visible
   */
  isVisible() {
    return this.overlay !== null;
  }
}

// Singleton overlay manager
export const terminalOverlay = new TerminalOverlayManager();

// #endregion OVERLAY

// #region STYLES

/**
 * CSS styles for inline terminal overlay
 */
export const termOverlayStyles = `
/* Inline Terminal Overlay - positioned over the code block */
.term-inline-overlay {
  background: var(--term-bg, #1a1a1a);
  border: 1px solid var(--term-border, #3c3c3c);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.term-inline-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--term-header-bg, #252526);
  border-bottom: 1px solid var(--term-border, #3c3c3c);
  font-size: 12px;
}

.term-inline-title {
  font-weight: 500;
  color: var(--term-header-fg, #888);
  flex: 1;
}

.term-inline-status {
  font-size: 11px;
  color: var(--term-status-fg, #888);
  margin-right: 8px;
}

.term-inline-status-connected {
  color: #4ade80;
}

.term-inline-status-error {
  color: #f87171;
}

.term-inline-close {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--term-header-fg, #888);
  font-size: 16px;
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.term-inline-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.term-inline-content {
  flex: 1;
  padding: 4px;
  overflow: hidden;
  min-height: 150px;
}

.term-inline-content .xterm {
  height: 100%;
}

.term-inline-content .xterm-viewport {
  overflow-y: auto !important;
}

.term-error {
  padding: 20px;
  color: #f87171;
  font-family: monospace;
}

/* Light mode */
@media (prefers-color-scheme: light) {
  .term-inline-overlay {
    --term-bg: #fafafa;
    --term-header-bg: #f0f0f0;
    --term-border: #e0e0e0;
    --term-header-fg: #333;
  }
}
`;

/**
 * Inject terminal overlay styles
 */
export function injectTermWidgetStyles() {
  if (document.getElementById('term-overlay-styles')) return;

  const style = document.createElement('style');
  style.id = 'term-overlay-styles';
  style.textContent = termOverlayStyles;
  document.head.appendChild(style);
}

// #endregion STYLES

// #region PUBLIC API

/**
 * Launch terminal for a code block
 *
 * @param {Object} blockInfo - Block info from findTerminalBlocks()
 * @param {Object} config - Terminal config { baseUrl, cwd, venv, filePath }
 * @param {EditorView} view - CodeMirror EditorView
 */
export function launchTerminal(blockInfo, config, view) {
  terminalOverlay.show(blockInfo, config, view);
}

/**
 * Close the terminal overlay
 */
export function closeTerminal() {
  terminalOverlay.hide(true);
}

/**
 * Check if terminal overlay is visible
 */
export function isTerminalVisible() {
  return terminalOverlay.isVisible();
}

/**
 * Create terminal widget extension (now just provides styles and callbacks)
 *
 * @param {Object} config
 * @param {string} [config.filePath] - Current file path
 * @param {string} [config.cwd] - Working directory for PTY
 * @param {string} [config.venv] - Virtual environment path
 * @param {string} [config.baseUrl] - PTY server base URL
 * @returns {Object} Config object (no extensions needed - blocks are editable by default)
 */
export function terminalWidget(config = {}) {
  // Inject styles
  injectTermWidgetStyles();

  // Return config for use by cell controls callback
  return {
    ...config,
    launchTerminal: (blockInfo, view) => launchTerminal(blockInfo, config, view),
  };
}

// Re-export for backwards compatibility
export { findTerminalBlocks } from './cells.js';
export { TermBlock, termBlockRegistry } from './term-block.js';

export default terminalWidget;

// #endregion PUBLIC API
