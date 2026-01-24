/**
 * Terminal Block Model
 *
 * Represents an embedded terminal emulator (```term ... ```) in a document.
 * Uses xterm.js for full terminal emulation with PTY backend.
 *
 * Modes:
 * - 'view': Frozen snapshot of terminal as plain text (default)
 * - 'terminal': Live xterm.js terminal connected to PTY
 * - 'edit': Edit the frozen text directly as markdown
 *
 * Lifecycle:
 * 1. Block starts in 'view' mode showing any saved content
 * 2. Click activates 'terminal' mode, connecting to PTY
 * 3. Click outside or blur snapshots buffer back to document
 * 4. Double-click in 'view' mode enters 'edit' mode for manual editing
 *
 * @module term-block
 */

/**
 * Terminal block modes
 * @typedef {'view' | 'terminal' | 'edit'} TermBlockMode
 */

/**
 * Terminal block state
 * @typedef {Object} TermBlockState
 * @property {TermBlockMode} mode - Current mode
 * @property {string} sessionId - PTY session identifier
 * @property {any} xtermInstance - xterm.js Terminal instance
 * @property {WebSocket|null} wsConnection - WebSocket to PTY backend
 * @property {any} fitAddon - xterm-addon-fit instance
 * @property {ResizeObserver|null} resizeObserver - For auto-fitting terminal
 * @property {Function|null} clickOutsideHandler - Handler for click-outside detection
 */

/**
 * TermBlock class - represents a terminal portal in the document
 */
export class TermBlock {
  /**
   * Create a new TermBlock
   *
   * @param {Object} blockInfo - Block info from findCodeBlocks()
   * @param {number} blockInfo.start - Start position of opening fence
   * @param {number} blockInfo.end - End position of closing fence
   * @param {number} blockInfo.codeStart - Start of content
   * @param {number} blockInfo.codeEnd - End of content
   * @param {string} blockInfo.code - Content (frozen terminal state)
   * @param {number} blockInfo.line - Line number
   * @param {string} [filePath] - File path for session ID generation
   * @param {number} [blockIndex] - Index of this block in document
   */
  constructor(blockInfo, filePath = 'untitled', blockIndex = 0) {
    // Position info
    this.start = blockInfo.start;
    this.end = blockInfo.end;
    this.codeStart = blockInfo.codeStart;
    this.codeEnd = blockInfo.codeEnd;
    this.line = blockInfo.line;

    // Content (frozen state when not in terminal mode)
    this.content = blockInfo.code;

    // Session identification
    this.filePath = filePath;
    this.blockIndex = blockIndex;
    this.sessionId = `term:${filePath}:${blockIndex}`;

    // Runtime state (not persisted)
    /** @type {TermBlockMode} */
    this.mode = 'view';

    /** @type {any} xterm.js Terminal instance */
    this.xtermInstance = null;

    /** @type {WebSocket|null} */
    this.wsConnection = null;

    /** @type {any} xterm-addon-fit */
    this.fitAddon = null;

    /** @type {ResizeObserver|null} */
    this.resizeObserver = null;

    /** @type {Function|null} */
    this.clickOutsideHandler = null;

    /** @type {boolean} Whether PTY session exists on server */
    this.hasServerSession = false;
  }

  /**
   * Get the full markdown for this block
   * @returns {string}
   */
  toMarkdown() {
    return '```term\n' + this.content + '\n```';
  }

  /**
   * Get the current terminal buffer as text (for snapshots)
   * @returns {string}
   */
  getBufferText() {
    if (!this.xtermInstance) {
      return this.content;
    }

    const buffer = this.xtermInstance.buffer.active;
    const lines = [];

    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        lines.push(line.translateToString(true)); // true = trim trailing whitespace
      }
    }

    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    return lines.join('\n');
  }

  /**
   * Snapshot the terminal buffer to content
   * Call this when exiting terminal mode
   * @returns {string} The snapshotted content
   */
  snapshot() {
    if (this.xtermInstance) {
      this.content = this.getBufferText();
    }
    return this.content;
  }

  /**
   * Update content (for edit mode sync)
   * @param {string} newContent
   */
  setContent(newContent) {
    this.content = newContent;
  }

  /**
   * Check if terminal is currently connected
   * @returns {boolean}
   */
  isConnected() {
    return this.wsConnection !== null && this.wsConnection.readyState === WebSocket.OPEN;
  }

  /**
   * Dispose of runtime resources
   * Call this when block is removed or mode changes away from terminal
   */
  dispose() {
    // Remove click-outside handler
    if (this.clickOutsideHandler) {
      document.removeEventListener('mousedown', this.clickOutsideHandler, true);
      this.clickOutsideHandler = null;
    }

    // Disconnect resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Disconnect PtyClient (but PTY stays alive on server for reconnect)
    if (this.wsConnection) {
      this.wsConnection.disconnect();
      this.wsConnection = null;
    }

    // Dispose xterm.js instance
    if (this.xtermInstance) {
      this.xtermInstance.dispose();
      this.xtermInstance = null;
    }

    this.fitAddon = null;
  }
}

/**
 * Registry of active TermBlocks by session ID
 * Allows reconnection to existing PTY sessions
 */
export class TermBlockRegistry {
  constructor() {
    /** @type {Map<string, TermBlock>} */
    this.blocks = new Map();
  }

  /**
   * Register a TermBlock
   * @param {TermBlock} block
   */
  register(block) {
    this.blocks.set(block.sessionId, block);
  }

  /**
   * Unregister a TermBlock
   * @param {string} sessionId
   */
  unregister(sessionId) {
    const block = this.blocks.get(sessionId);
    if (block) {
      block.dispose();
      this.blocks.delete(sessionId);
    }
  }

  /**
   * Get a TermBlock by session ID
   * @param {string} sessionId
   * @returns {TermBlock|undefined}
   */
  get(sessionId) {
    return this.blocks.get(sessionId);
  }

  /**
   * Check if a session exists
   * @param {string} sessionId
   * @returns {boolean}
   */
  has(sessionId) {
    return this.blocks.has(sessionId);
  }

  /**
   * Dispose all blocks
   */
  disposeAll() {
    for (const block of this.blocks.values()) {
      block.dispose();
    }
    this.blocks.clear();
  }

  /**
   * Get all blocks for a file
   * @param {string} filePath
   * @returns {TermBlock[]}
   */
  getBlocksForFile(filePath) {
    const result = [];
    for (const block of this.blocks.values()) {
      if (block.filePath === filePath) {
        result.push(block);
      }
    }
    return result;
  }
}

// Global registry instance
export const termBlockRegistry = new TermBlockRegistry();

export default TermBlock;
