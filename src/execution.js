/**
 * Execution Manager
 *
 * Handles running code cells and streaming output into the document.
 * Output appears as if typed by a collaborator (via Yjs).
 *
 * Key insight from the vision:
 * "The document is just text. Everything writes to it like a human would."
 *
 * Terminal output (progress bars, colors, cursor movement) is processed
 * through TerminalBuffer to produce clean, readable text for storage.
 */

import { findCells, getCellAtIndex, getCellAtCursor, findOutputBlock } from './cells.js';
import { TerminalBuffer } from './terminal.js';
import * as Y from 'yjs';

/**
 * Execution Manager
 *
 * Coordinates cell execution between the editor and runtimes.
 */
export class ExecutionManager {
  /**
   * @param {Object} editor - Editor instance with view, dispatch, writer methods
   * @param {import('./runtime.js').RuntimeRegistry} registry - Runtime registry
   */
  constructor(editor, registry) {
    this.editor = editor;
    this.registry = registry;

    /** @type {Map<number, AbortController>} Running executions by cell index */
    this.running = new Map();

    /** @type {Map<number, TerminalBuffer>} Terminal buffers for processing output */
    this.buffers = new Map();

    /** @type {Map<number, HTMLElement>} Active stdin input containers by cell index */
    this.stdinContainers = new Map();

    /** @type {Object<string, function[]>} Event handlers */
    this.handlers = {
      cellRun: [],
      cellOutput: [],
      cellComplete: [],
      cellError: [],
      stdinRequest: [], // Called when input() is invoked
    };
  }

  /**
   * Run a cell by index
   *
   * @param {number} index - Cell index (0-based)
   * @returns {Promise<void>}
   */
  async runCell(index) {
    const content = this.editor.getContent();
    const cell = getCellAtIndex(content, index);

    if (!cell) {
      console.warn(`No cell at index ${index}`);
      return;
    }

    await this._executeCell(cell, index);
  }

  /**
   * Run the cell at cursor position
   *
   * @returns {Promise<void>}
   */
  async runCurrentCell() {
    const content = this.editor.getContent();
    const pos = this.editor.view.state.selection.main.head;
    const cell = getCellAtCursor(content, pos);

    if (!cell) {
      console.warn('No executable cell at cursor');
      return;
    }

    // Find cell index
    const cells = findCells(content);
    const index = cells.findIndex(c => c.start === cell.start);

    await this._executeCell(cell, index);
  }

  /**
   * Run all cells in order
   *
   * @returns {Promise<void>}
   */
  async runAll() {
    const content = this.editor.getContent();
    const cells = findCells(content);

    for (let i = 0; i < cells.length; i++) {
      await this._executeCell(cells[i], i);
    }
  }

  /**
   * Run all cells above (and including) the current one
   *
   * @returns {Promise<void>}
   */
  async runAllAbove() {
    const content = this.editor.getContent();
    const pos = this.editor.view.state.selection.main.head;
    const cells = findCells(content);

    // Find current cell index
    let currentIndex = cells.findIndex(c => pos >= c.start && pos <= c.end);
    if (currentIndex === -1) {
      // Cursor not in a cell, find the nearest cell above
      currentIndex = cells.findIndex(c => c.end > pos) - 1;
      if (currentIndex < 0) currentIndex = cells.length - 1;
    }

    for (let i = 0; i <= currentIndex; i++) {
      await this._executeCell(cells[i], i);
    }
  }

  /**
   * Clear output for a cell
   *
   * @param {number} index - Cell index
   */
  clearOutput(index) {
    const content = this.editor.getContent();
    const cell = getCellAtIndex(content, index);

    if (!cell) return;

    const output = findOutputBlock(content, cell.end);
    if (output) {
      // Remove the entire output block (including preceding newline)
      const deleteStart = cell.end;
      const deleteEnd = output.end;

      this.editor.view.dispatch({
        changes: { from: deleteStart, to: deleteEnd, insert: '' },
      });
    }
  }

  /**
   * Clear all output blocks
   */
  clearOutputs() {
    const content = this.editor.getContent();
    const cells = findCells(content);

    // Clear from last to first to preserve positions
    for (let i = cells.length - 1; i >= 0; i--) {
      this.clearOutput(i);
    }
  }

  /**
   * Cancel a running execution
   *
   * @param {number} index - Cell index
   */
  cancel(index) {
    const controller = this.running.get(index);
    if (controller) {
      controller.abort();
      this.running.delete(index);
    }

    // Clean up stdin container if present
    const stdinContainer = this.stdinContainers.get(index);
    if (stdinContainer) {
      stdinContainer.remove();
      this.stdinContainers.delete(index);
    }
  }

  /**
   * Cancel all running executions
   */
  cancelAll() {
    for (const controller of this.running.values()) {
      controller.abort();
    }
    this.running.clear();

    // Clean up all stdin containers
    for (const container of this.stdinContainers.values()) {
      container.remove();
    }
    this.stdinContainers.clear();
  }

  /**
   * Check if a cell is running
   *
   * @param {number} index - Cell index
   * @returns {boolean}
   */
  isRunning(index) {
    return this.running.has(index);
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  on(event, handler) {
    if (this.handlers[event]) {
      this.handlers[event].push(handler);
    }
    return () => {
      const idx = this.handlers[event]?.indexOf(handler);
      if (idx >= 0) this.handlers[event].splice(idx, 1);
    };
  }

  _emit(event, ...args) {
    this.handlers[event]?.forEach(h => h(...args));
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  /**
   * Execute a cell and stream output
   *
   * Uses TerminalBuffer to process ANSI codes and cursor movement,
   * producing clean readable output for the document.
   *
   * @param {Object} cell - Cell info
   * @param {number} index - Cell index
   */
  async _executeCell(cell, index) {
    const { language, code } = cell;

    // Check runtime support
    if (!this.registry.supports(language)) {
      console.warn(`No runtime for language: ${language}`);
      this._emit('cellError', index, `No runtime registered for ${language}`);
      return;
    }

    // Cancel any existing execution for this cell
    this.cancel(index);

    // Create abort controller and terminal buffer
    const controller = new AbortController();
    this.running.set(index, controller);

    const buffer = new TerminalBuffer();
    this.buffers.set(index, buffer);

    // Emit start event
    this._emit('cellRun', index, cell);

    try {
      // Prepare output position
      // Re-read content as it may have changed
      let content = this.editor.getContent();
      let currentCell = getCellAtIndex(content, index);

      if (!currentCell) {
        throw new Error('Cell no longer exists');
      }

      // Clear existing output and create new output block
      const existingOutput = findOutputBlock(content, currentCell.end);

      let outputContentStart;
      let outputContentEnd;

      if (existingOutput) {
        // Use existing output block
        outputContentStart = existingOutput.contentStart;
        outputContentEnd = existingOutput.contentEnd;

        // Clear existing content
        if (outputContentEnd > outputContentStart) {
          this.editor.view.dispatch({
            changes: { from: outputContentStart, to: outputContentEnd, insert: '' },
          });
          outputContentEnd = outputContentStart;
        }
      } else {
        // Create new output block after the code block
        const insertPos = currentCell.end;
        this.editor.view.dispatch({
          changes: { from: insertPos, insert: '\n\n```output\n```' },
        });

        // Re-read to get updated positions
        content = this.editor.getContent();
        const newOutput = findOutputBlock(content, currentCell.end);
        if (newOutput) {
          outputContentStart = newOutput.contentStart;
          outputContentEnd = newOutput.contentStart;
        } else {
          // Fallback: calculate position
          outputContentStart = currentCell.end + '\n\n```output\n'.length;
          outputContentEnd = outputContentStart;
        }
      }

      // Create RelativePosition for output start - survives concurrent edits from other users
      // This is critical for collaborative editing: if another user edits before our output
      // block while we're streaming, the absolute position would become stale.
      //
      // IMPORTANT: Use assoc=-1 (left association) so the position stays PUT when we insert
      // content at this position. Default assoc=0 would cause the position to move forward
      // with each insert, breaking the replacement logic.
      const yText = this.editor.getYText?.();
      const outputStartRelPos = yText
        ? Y.createRelativePositionFromTypeIndex(yText, outputContentStart, -1)
        : null;

      // Track current output length in document for replacement
      let currentDocOutputLen = 0;

      const onChunk = (chunk, accumulatedRaw, done) => {
        if (controller.signal.aborted) return;

        // Process through terminal buffer (handles \r, cursor movement, ANSI)
        buffer.write(chunk);

        // Get processed output with ANSI codes preserved
        let processedOutput = buffer.toAnsi();

        // Ensure output ends with newline so closing ``` stays on its own line
        // This is critical for maintaining valid markdown structure
        if (processedOutput && !processedOutput.endsWith('\n')) {
          processedOutput += '\n';
        }

        // Get current absolute position from RelativePosition (survives concurrent edits)
        // Falls back to original position if yText not available
        let currentOutputStart = outputContentStart;
        if (outputStartRelPos && yText?.doc) {
          try {
            const absPos = Y.createAbsolutePositionFromRelativePosition(outputStartRelPos, yText.doc);
            // Only use converted position if valid (absPos.index is a number)
            if (absPos && typeof absPos.index === 'number') {
              currentOutputStart = absPos.index;
            }
          } catch (e) {
            // Conversion failed, use original position
            console.warn('RelativePosition conversion failed:', e);
          }
        }

        // Replace current output with processed output
        // This handles carriage returns and cursor movement correctly
        const from = currentOutputStart;
        const to = currentOutputStart + currentDocOutputLen;

        this.editor.view.dispatch({
          changes: { from, to, insert: processedOutput },
        });

        currentDocOutputLen = processedOutput.length;

        this._emit('cellOutput', index, chunk, processedOutput);
      };

      /**
       * Handle stdin_request from runtime (when input() is called)
       * Creates an inline input field and waits for user input.
       *
       * @param {Object} request - {prompt, password, execId}
       * @returns {Promise<string>} - User input
       */
      const onStdinRequest = (request) => {
        return new Promise((resolve, reject) => {
          if (controller.signal.aborted) {
            reject(new Error('Execution aborted'));
            return;
          }

          // Remove any existing stdin container for this cell
          const existingContainer = this.stdinContainers.get(index);
          if (existingContainer) {
            existingContainer.remove();
          }

          // Create input element
          const inputContainer = document.createElement('div');
          inputContainer.className = 'mrmd-stdin-input';
          inputContainer.dataset.cellIndex = String(index);
          inputContainer.innerHTML = `
            <span class="mrmd-stdin-prompt">${request.prompt || ''}</span>
            <input type="${request.password ? 'password' : 'text'}"
                   class="mrmd-stdin-field"
                   placeholder="Enter input and press Enter..."
                   autofocus />
          `;

          // Store reference for cleanup
          this.stdinContainers.set(index, inputContainer);

          const inputField = inputContainer.querySelector('input');

          // Handle submit
          const submit = () => {
            const value = inputField.value + '\n';
            inputContainer.remove();
            this.stdinContainers.delete(index);
            resolve(value);
          };

          inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          });

          // Handle abort
          controller.signal.addEventListener('abort', () => {
            inputContainer.remove();
            this.stdinContainers.delete(index);
            reject(new Error('Execution aborted'));
          });

          // Position stdin input at the output location
          // We use absolute positioning because CodeMirror widgets get recreated
          // when the document changes, which would disconnect our appended elements
          const view = this.editor.view;
          const coords = view.coordsAtPos(outputContentStart + currentDocOutputLen);

          if (coords) {
            const editorRect = view.dom.getBoundingClientRect();

            inputContainer.style.position = 'absolute';
            inputContainer.style.left = `${coords.left - editorRect.left}px`;
            inputContainer.style.top = `${coords.top - editorRect.top + 5}px`;
            inputContainer.style.width = `${Math.min(400, editorRect.width - 40)}px`;
            inputContainer.style.zIndex = '1000';

            // Append to editor DOM (which has position: relative)
            view.dom.style.position = 'relative';
            view.dom.appendChild(inputContainer);
          } else {
            // Fallback: append at the end of editor
            view.dom.style.position = 'relative';
            view.dom.appendChild(inputContainer);
          }

          // Focus the input
          setTimeout(() => inputField.focus(), 0);

          // Emit event for external handling if needed
          this._emit('stdinRequest', index, request, resolve, reject);
        });
      };

      // Execute with streaming (pass onStdinRequest for input() support)
      const result = await this.registry.executeStreaming(code, language, onChunk, onStdinRequest);

      // Final update with ANSI codes preserved
      const finalOutput = buffer.toAnsi();
      const from = outputContentStart;
      const to = outputContentStart + currentDocOutputLen;

      // Handle errors
      let outputWithError = finalOutput;
      if (result.error) {
        const errorText = `\n[Error: ${result.error.message || result.stderr}]`;
        outputWithError = finalOutput + errorText;
        this._emit('cellError', index, result.error);
      }

      // Ensure output ends with newline so closing ``` is on its own line
      if (outputWithError && !outputWithError.endsWith('\n')) {
        outputWithError += '\n';
      }

      // Final replace to ensure clean output
      this.editor.view.dispatch({
        changes: { from, to, insert: outputWithError },
      });

      this._emit('cellComplete', index, result);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Cell execution error:', err);
        this._emit('cellError', index, err);
      }
    } finally {
      this.running.delete(index);
      this.buffers.delete(index);

      // Clean up any lingering stdin container for this cell
      const stdinContainer = this.stdinContainers.get(index);
      if (stdinContainer) {
        stdinContainer.remove();
        this.stdinContainers.delete(index);
      }
    }
  }

  /**
   * Get the terminal buffer for a running cell (for rich display)
   *
   * @param {number} index - Cell index
   * @returns {TerminalBuffer|null}
   */
  getBuffer(index) {
    return this.buffers.get(index) || null;
  }
}

/**
 * Create an execution manager
 *
 * @param {Object} editor - Editor instance
 * @param {import('./runtime.js').RuntimeRegistry} registry - Runtime registry
 * @returns {ExecutionManager}
 */
export function createExecutionManager(editor, registry) {
  return new ExecutionManager(editor, registry);
}
