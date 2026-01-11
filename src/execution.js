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

import { findCells, getCellAtIndex, getCellAtCursor, findOutputBlock, findOutputBlockByExecId, findStdinBlockByExecId, generateExecId } from './cells.js';
import { TerminalBuffer } from './terminal.js';
import { pendingStdinRequests } from './output-widget.js';
import { MonitorCoordination, EXECUTION_STATUS } from './monitor-coordination.js';
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

    /** @type {Map<string, AbortController>} Running executions by execId */
    this.running = new Map();

    /** @type {Map<string, TerminalBuffer>} Terminal buffers by execId */
    this.buffers = new Map();

    /** @type {Map<string, {cellIndex: number, reject: function}>} Active stdin requests by execId */
    this.stdinRequests = new Map();

    /** @type {Map<number, string>} Maps cell index to current execId (for cancellation by index) */
    this.cellExecIds = new Map();

    /** @type {Object<string, function[]>} Event handlers */
    this.handlers = {
      cellRun: [],
      cellOutput: [],
      cellComplete: [],
      cellError: [],
      stdinRequest: [], // Called when input() is invoked
    };

    // Monitor mode state
    /** @type {MonitorCoordination|null} */
    this.coordination = null;

    /** @type {boolean} */
    this._monitorMode = false;

    /** @type {string|null} Default runtime URL for monitor mode */
    this._defaultRuntimeUrl = null;

    /** @type {string} Session name for execution isolation */
    this._monitorSession = 'default';

    /** @type {Map<string, Function>} Unsubscribe functions for monitor status watchers */
    this._monitorUnsubscribes = new Map();

    // Setup terminal-like stdin handler
    this._setupStdinKeyHandler();
  }

  // ===========================================================================
  // Monitor Mode
  // ===========================================================================

  /**
   * Enable monitor mode for execution
   *
   * In monitor mode, executions are routed through mrmd-monitor instead of
   * being handled directly by the browser. This allows long-running executions
   * to survive browser disconnects.
   *
   * @param {Object} options
   * @param {Y.Doc} options.ydoc - Yjs document
   * @param {string} options.runtimeUrl - Default runtime URL for MRP
   * @param {import('y-protocols/awareness').Awareness} [options.awareness] - For monitor detection
   * @param {string} [options.session] - Session name for execution isolation (defaults to 'default')
   */
  enableMonitorMode({ ydoc, runtimeUrl, awareness, session }) {
    if (this.coordination) {
      this.coordination.destroy();
    }

    this.coordination = new MonitorCoordination(ydoc, ydoc.clientID);
    this._defaultRuntimeUrl = runtimeUrl;
    this._monitorMode = true;
    this._awareness = awareness;
    this._monitorSession = session || 'default';

    console.log('[ExecutionManager] Monitor mode enabled, runtimeUrl:', runtimeUrl, 'session:', this._monitorSession);
  }

  /**
   * Disable monitor mode (use direct execution)
   */
  disableMonitorMode() {
    if (this.coordination) {
      this.coordination.destroy();
      this.coordination = null;
    }

    // Clean up status watchers
    for (const unsub of this._monitorUnsubscribes.values()) {
      unsub();
    }
    this._monitorUnsubscribes.clear();

    this._monitorMode = false;
    this._defaultRuntimeUrl = null;
    this._awareness = null;

    console.log('[ExecutionManager] Monitor mode disabled');
  }

  /**
   * Check if monitor mode is enabled and a monitor is available
   *
   * @returns {boolean}
   */
  isMonitorAvailable() {
    if (!this._monitorMode || !this.coordination) {
      return false;
    }

    return this.coordination.isMonitorAvailable(this._awareness);
  }

  /**
   * Get runtime URL for a language
   *
   * @param {string} language
   * @returns {string|null}
   */
  _getRuntimeUrl(language, includeFallback = true) {
    // First check if the registry has a runtime with a URL
    const runtime = this.registry.getRuntime(language);
    if (runtime?.runtimeUrl) {
      return runtime.runtimeUrl;
    }

    // Fall back to default only if requested
    // Monitor mode should NOT use fallback - only explicit runtime URLs
    return includeFallback ? this._defaultRuntimeUrl : null;
  }

  /**
   * Check if a language has an explicit remote runtime configured.
   * Used to determine if monitor mode should be used for this language.
   */
  _hasExplicitRuntimeUrl(language) {
    const runtime = this.registry.getRuntime(language);
    return !!runtime?.runtimeUrl;
  }

  /**
   * Setup keydown handler for stdin block input and Ctrl+C cancellation.
   * - Enter in stdin block: extract content, send to server, delete block
   * - Escape in stdin block: cancel input, delete block
   * - Ctrl+C in output/stdin block with running execution: cancels it
   */
  _setupStdinKeyHandler() {
    // Use capture phase to run before CodeMirror's handlers
    this.editor.view.dom.addEventListener('keydown', (e) => {
      const view = this.editor.view;
      const cursorPos = view.state.selection.main.head;
      const content = view.state.doc.toString();

      // Handle Ctrl+C - cancel execution
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        // Check if cursor is in an output block with running execution
        for (const [execId] of this.running) {
          const outputBlock = findOutputBlockByExecId(content, execId);
          if (outputBlock && cursorPos >= outputBlock.start && cursorPos <= outputBlock.end) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[stdin] Ctrl+C - cancelling execution:', execId);

            // Add visual feedback
            const interruptText = '^C\n[Interrupted]\n';
            view.dispatch({
              changes: { from: outputBlock.contentEnd, to: outputBlock.contentEnd, insert: interruptText },
            });

            this.cancel(execId);
            return;
          }

          // Also check stdin block
          const stdinBlock = findStdinBlockByExecId(content, execId);
          if (stdinBlock && cursorPos >= stdinBlock.start && cursorPos <= stdinBlock.end) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[stdin] Ctrl+C in stdin block - cancelling:', execId);
            this.cancel(execId);
            return;
          }
        }
      }

      // Handle Escape - cancel stdin input
      if (e.key === 'Escape') {
        for (const [execId, request] of pendingStdinRequests) {
          const stdinBlock = findStdinBlockByExecId(content, execId);
          if (!stdinBlock) continue;

          if (cursorPos >= stdinBlock.start && cursorPos <= stdinBlock.end) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[stdin] Escape - cancelling input for:', execId);

            // Delete the stdin block
            view.dispatch({
              changes: { from: stdinBlock.start, to: stdinBlock.end },
            });

            // Clean up and reject
            pendingStdinRequests.delete(execId);
            this.stdinRequests.delete(execId);

            if (request.reject) {
              request.reject(new Error('Input cancelled by user'));
            }
            return;
          }
        }
      }

      // Handle Enter - submit stdin input
      if (e.key === 'Enter') {
        // Find any stdin block the cursor is in (even if we're not the owner)
        const stdinBlockRegex = /```stdin:([^\n:]+)(?::password)?\n([\s\S]*?)```/g;
        let stdinMatch;

        while ((stdinMatch = stdinBlockRegex.exec(content)) !== null) {
          const execId = stdinMatch[1];
          const stdinContent = stdinMatch[2];
          const blockStart = stdinMatch.index;
          const blockEnd = blockStart + stdinMatch[0].length;

          // Is cursor inside this stdin block?
          if (cursorPos >= blockStart && cursorPos <= blockEnd) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const userInput = stdinContent.trim();
            console.log('[stdin] Enter pressed in stdin block:', execId, 'input:', JSON.stringify(userInput));

            // Check if WE own this stdin request (we started the execution)
            const request = pendingStdinRequests.get(execId);

            if (request && request.resolve) {
              // We own it - submit directly
              console.log('[stdin] We own this request - submitting directly');

              // Delete the stdin block
              view.dispatch({
                changes: { from: blockStart, to: blockEnd },
              });

              // Clean up and resolve
              pendingStdinRequests.delete(execId);
              this.stdinRequests.delete(execId);
              request.resolve(userInput + '\n');
            } else {
              // We DON'T own it - signal via awareness that we want to submit
              console.log('[stdin] We do not own this request - signaling via awareness');

              // Mark the block as submitted by changing content to include a marker
              // The owner will see this and submit
              const submittedMarker = `\n__STDIN_SUBMIT__`;
              if (!stdinContent.includes('__STDIN_SUBMIT__')) {
                // Add submit marker to the content
                const markerPos = blockEnd - 3; // Before closing ```
                view.dispatch({
                  changes: { from: markerPos, to: markerPos, insert: submittedMarker },
                });
              }
            }

            return;
          }
        }
      }
    }, { capture: true });

    // Watch for stdin submission markers from collaborators
    this._watchForStdinSubmissions();
  }

  /**
   * Watch for stdin blocks that have been marked for submission by collaborators.
   * When we see __STDIN_SUBMIT__ in a block we own, we submit it.
   */
  _watchForStdinSubmissions() {
    // Poll periodically for submission markers
    setInterval(() => {
      if (pendingStdinRequests.size === 0) return;

      const content = this.editor.getContent();

      for (const [execId, request] of pendingStdinRequests) {
        const stdinBlock = findStdinBlockByExecId(content, execId);
        if (!stdinBlock) continue;

        // Check if there's a submission marker
        if (stdinBlock.content.includes('__STDIN_SUBMIT__')) {
          console.log('[stdin] Detected submission marker from collaborator for:', execId);

          // Extract the actual input (remove the marker)
          const userInput = stdinBlock.content.replace('__STDIN_SUBMIT__', '').trim();

          // Delete the stdin block
          this.editor.view.dispatch({
            changes: { from: stdinBlock.start, to: stdinBlock.end },
          });

          // Clean up and resolve
          pendingStdinRequests.delete(execId);
          this.stdinRequests.delete(execId);

          if (request.resolve) {
            request.resolve(userInput + '\n');
          }
        }
      }
    }, 100); // Check every 100ms
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
   * @param {Object} [mrpClient] - MRP client for cancelling stdin requests
   */
  cancel(index, mrpClient) {
    // Get execId for this cell
    const execId = this.cellExecIds.get(index);
    if (!execId) return;

    // Abort the execution
    const controller = this.running.get(execId);
    if (controller) {
      controller.abort();
      this.running.delete(execId);
    }

    // Cancel stdin request if pending (notify backend)
    const stdinRequest = this.stdinRequests.get(execId);
    if (stdinRequest) {
      // Notify backend to cancel the pending input
      if (mrpClient) {
        mrpClient.cancelInput(execId).catch(() => {
          // Ignore errors - best effort cancellation
        });
      }
      // Clean up from pending map (decoration will disappear on next rebuild)
      pendingStdinRequests.delete(execId);
      // Reject the promise
      stdinRequest.reject(new Error('Execution cancelled'));
      this.stdinRequests.delete(execId);
    }

    // Clean up buffers
    this.buffers.delete(execId);
    this.cellExecIds.delete(index);

    // Trigger view update
    if (this.editor?.view) {
      this.editor.view.dispatch({ effects: [] });
    }
  }

  /**
   * Cancel all running executions
   *
   * @param {Object} [mrpClient] - MRP client for cancelling stdin requests
   */
  cancelAll(mrpClient) {
    // Abort all running executions
    for (const controller of this.running.values()) {
      controller.abort();
    }
    this.running.clear();

    // Cancel all stdin requests (notify backend)
    for (const [execId, stdinRequest] of this.stdinRequests.entries()) {
      if (mrpClient) {
        mrpClient.cancelInput(execId).catch(() => {
          // Ignore errors - best effort cancellation
        });
      }
      // Clean up from pending map (decoration will disappear on next rebuild)
      pendingStdinRequests.delete(execId);
      // Reject the promise
      stdinRequest.reject(new Error('Execution cancelled'));
    }
    this.stdinRequests.clear();

    // Clear all buffers and cell mappings
    this.buffers.clear();
    this.cellExecIds.clear();

    // Trigger view update
    if (this.editor?.view) {
      this.editor.view.dispatch({ effects: [] });
    }
  }

  /**
   * Check if a cell is running
   *
   * @param {number} index - Cell index
   * @returns {boolean}
   */
  isRunning(index) {
    const execId = this.cellExecIds.get(index);
    return execId ? this.running.has(execId) : false;
  }

  /**
   * Check if an execution is running by execId
   *
   * @param {string} execId - Execution ID
   * @returns {boolean}
   */
  isExecRunning(execId) {
    return this.running.has(execId);
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
   * Key design: Output blocks are tagged with execId (```output:exec-xxx)
   * which allows robust tracking regardless of document edits.
   *
   * @param {Object} cell - Cell info
   * @param {number} index - Cell index
   * @returns {Promise<string>} The execution ID
   */
  async _executeCell(cell, index) {
    const { language, code } = cell;

    // Check if we should use monitor mode
    // Monitor mode routes execution through mrmd-monitor for persistence
    // Only use monitor mode for languages with EXPLICIT runtime URLs (not default fallback)
    // This ensures local runtimes (like mrmd-js for JavaScript) still run locally
    if (this._monitorMode && this.coordination) {
      const runtimeUrl = this._getRuntimeUrl(language, false); // false = no fallback
      if (runtimeUrl) {
        return this._executeCellViaMonitor(cell, index, runtimeUrl);
      }
      // Fall through to direct execution for languages without explicit runtime URL
      console.log(`[ExecutionManager] No explicit runtime URL for ${language}, using local execution`);
    }

    // Check runtime support (for direct execution)
    if (!this.registry.supports(language)) {
      console.warn(`No runtime for language: ${language}`);
      this._emit('cellError', index, `No runtime registered for ${language}`);
      return null;
    }

    // Cancel any existing execution for this cell
    this.cancel(index);

    // Generate unique execution ID - this is the stable identifier for this execution
    const execId = generateExecId();

    // Create abort controller and terminal buffer
    const controller = new AbortController();
    this.running.set(execId, controller);
    this.cellExecIds.set(index, execId);

    const buffer = new TerminalBuffer();
    this.buffers.set(execId, buffer);

    // Emit start event
    this._emit('cellRun', index, cell, execId);

    try {
      // Prepare output position
      // Re-read content as it may have changed
      let content = this.editor.getContent();
      let currentCell = getCellAtIndex(content, index);

      if (!currentCell) {
        throw new Error('Cell no longer exists');
      }

      // Check for existing output block and create/update with new execId
      const existingOutput = findOutputBlock(content, currentCell.end);

      if (existingOutput) {
        // Replace existing output block with new one that has our execId
        // This ensures clean slate and proper execId tagging
        this.editor.view.dispatch({
          changes: {
            from: existingOutput.start,
            to: existingOutput.end,
            insert: `\`\`\`output:${execId}\n\`\`\``
          },
        });
      } else {
        // Create new output block with execId
        const insertPos = currentCell.end;
        this.editor.view.dispatch({
          changes: { from: insertPos, insert: `\n\n\`\`\`output:${execId}\n\`\`\`` },
        });
      }

      // Now find the output block by execId - this is the robust way
      content = this.editor.getContent();
      const outputBlock = findOutputBlockByExecId(content, execId);

      if (!outputBlock) {
        throw new Error('Failed to create output block');
      }

      let outputContentStart = outputBlock.contentStart;

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

        // Get current position - prefer finding by execId for robustness
        let currentOutputStart = outputContentStart;

        // First try RelativePosition (for Yjs collaborative)
        if (outputStartRelPos && yText?.doc) {
          try {
            const absPos = Y.createAbsolutePositionFromRelativePosition(outputStartRelPos, yText.doc);
            if (absPos && typeof absPos.index === 'number') {
              currentOutputStart = absPos.index;
            }
          } catch (e) {
            // Conversion failed, fall back to execId lookup
          }
        }

        // Fallback: find by execId if position seems stale
        if (!outputStartRelPos) {
          const currentContent = this.editor.getContent();
          const currentOutput = findOutputBlockByExecId(currentContent, execId);
          if (currentOutput) {
            currentOutputStart = currentOutput.contentStart;
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

        this._emit('cellOutput', index, chunk, processedOutput, execId);
      };

      /**
       * Handle stdin_request from runtime (when input() is called)
       * Terminal-like approach: move cursor into output block and capture Enter.
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

          const stdinExecId = execId;

          // Wait for any pending output to be written to the document
          requestAnimationFrame(() => {
            const currentContent = this.editor.getContent();
            const outputBlock = findOutputBlockByExecId(currentContent, stdinExecId);

            if (!outputBlock) {
              reject(new Error('Output block not found for stdin'));
              return;
            }

            console.log('[stdin] Request received, prompt:', JSON.stringify(request.prompt));
            console.log('[stdin] Creating stdin block after output block');

            // Create the stdin block marker
            // For password inputs, add :password flag to execId
            const stdinMarker = request.password
              ? `\n\n\`\`\`stdin:${stdinExecId}:password\n\n\`\`\``
              : `\n\n\`\`\`stdin:${stdinExecId}\n\n\`\`\``;

            // Insert stdin block after the output block
            const insertPos = outputBlock.end;

            this.editor.view.dispatch({
              changes: { from: insertPos, to: insertPos, insert: stdinMarker },
            });

            // Store the request for later resolution
            pendingStdinRequests.set(stdinExecId, {
              prompt: request.prompt,
              password: request.password,
              execId: stdinExecId,
              cellIndex: index,
              resolve,
              reject,
            });

            // Track for cancellation
            this.stdinRequests.set(stdinExecId, {
              cellIndex: index,
              reject,
            });

            // Handle abort signal - clean up stdin block
            controller.signal.addEventListener('abort', () => {
              const content = this.editor.getContent();
              const stdinBlock = findStdinBlockByExecId(content, stdinExecId);
              if (stdinBlock) {
                this.editor.view.dispatch({
                  changes: { from: stdinBlock.start, to: stdinBlock.end },
                });
              }
              pendingStdinRequests.delete(stdinExecId);
              this.stdinRequests.delete(stdinExecId);
              reject(new Error('Execution aborted'));
            }, { once: true });

            // Position cursor inside the stdin block (after the opening fence)
            // The stdin block is: ```stdin:execId\n\n```
            // We want cursor on the empty line between fences
            requestAnimationFrame(() => {
              const updatedContent = this.editor.getContent();
              const stdinBlock = findStdinBlockByExecId(updatedContent, stdinExecId);
              if (stdinBlock) {
                // Position cursor at contentStart (inside the block)
                this.editor.view.dispatch({
                  selection: { anchor: stdinBlock.contentStart },
                  scrollIntoView: true,
                });
                this.editor.view.focus();
              }
            });

            // Emit event for external handling
            this._emit('stdinRequest', index, request, resolve, reject, execId);
          });
        });
      };

      // Execute with streaming (pass onStdinRequest for input() support)
      // Pass execId so hub runtimes can find the output block
      const result = await this.registry.executeStreaming(code, language, onChunk, onStdinRequest, {
        execId,
        cellId: cell.id || `cell-${index}`,
      });

      // Final update - find output block by execId for robustness
      content = this.editor.getContent();
      const finalOutputBlock = findOutputBlockByExecId(content, execId);

      if (finalOutputBlock) {
        const finalOutput = buffer.toAnsi();

        // Handle errors
        let outputWithError = finalOutput;
        if (result.error) {
          const errorText = `\n[Error: ${result.error.message || result.stderr}]`;
          outputWithError = finalOutput + errorText;
          this._emit('cellError', index, result.error, execId);
        }

        // Ensure output ends with newline so closing ``` is on its own line
        if (outputWithError && !outputWithError.endsWith('\n')) {
          outputWithError += '\n';
        }

        // Final replace to ensure clean output
        this.editor.view.dispatch({
          changes: {
            from: finalOutputBlock.contentStart,
            to: finalOutputBlock.contentEnd,
            insert: outputWithError
          },
        });
      }

      this._emit('cellComplete', index, result, execId);
      return execId;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Cell execution error:', err);
        this._emit('cellError', index, err, execId);
      }
      return execId;
    } finally {
      this.running.delete(execId);
      this.buffers.delete(execId);

      // Clean up any lingering stdin request (decoration will disappear on next rebuild)
      pendingStdinRequests.delete(execId);
      this.stdinRequests.delete(execId);

      // Note: Don't delete cellExecIds here - keep it for reference
      // It will be overwritten on next execution

      // Trigger view update
      if (this.editor?.view) {
        this.editor.view.dispatch({ effects: [] });
      }
    }
  }

  /**
   * Execute a cell via monitor (Y.Map coordination protocol)
   *
   * Instead of executing directly, we:
   * 1. Request execution via Y.Map('executions')
   * 2. Wait for monitor to claim it
   * 3. Create output block and mark ready
   * 4. Watch for status changes (output comes via Y.Text sync)
   *
   * @param {Object} cell - Cell info
   * @param {number} index - Cell index
   * @param {string} runtimeUrl - MRP runtime URL
   * @returns {Promise<string>} The execution ID
   */
  async _executeCellViaMonitor(cell, index, runtimeUrl) {
    const { language, code } = cell;

    // Cancel any existing execution for this cell
    this.cancel(index);

    console.log(`[ExecutionManager] Executing via monitor: ${language}`);

    // Request execution via coordination protocol
    const execId = this.coordination.requestExecution({
      code,
      language,
      runtimeUrl,
      session: this._monitorSession,
      cellId: cell.id || `cell-${index}`,
    });

    // Track this execution
    this.cellExecIds.set(index, execId);

    // Create a "virtual" abort controller for cancellation
    const controller = new AbortController();
    this.running.set(execId, controller);

    // Emit start event
    this._emit('cellRun', index, cell, execId);

    try {
      // Prepare output block
      let content = this.editor.getContent();
      let currentCell = getCellAtIndex(content, index);

      if (!currentCell) {
        throw new Error('Cell no longer exists');
      }

      // Wait for monitor to claim the execution (with timeout)
      console.log(`[ExecutionManager] Waiting for monitor to claim ${execId}...`);

      const claimTimeout = 10000; // 10 seconds
      try {
        await this.coordination.waitForStatus(execId, EXECUTION_STATUS.CLAIMED, claimTimeout);
      } catch (err) {
        throw new Error('No monitor available to handle execution. Is mrmd-monitor running?');
      }

      console.log(`[ExecutionManager] Monitor claimed ${execId}, creating output block`);

      // Monitor claimed it - now create output block
      const existingOutput = findOutputBlock(content, currentCell.end);

      if (existingOutput) {
        this.editor.view.dispatch({
          changes: {
            from: existingOutput.start,
            to: existingOutput.end,
            insert: `\`\`\`output:${execId}\n\`\`\``
          },
        });
      } else {
        const insertPos = currentCell.end;
        this.editor.view.dispatch({
          changes: { from: insertPos, insert: `\n\n\`\`\`output:${execId}\n\`\`\`` },
        });
      }

      // Find the output block and create relative position
      content = this.editor.getContent();
      const outputBlock = findOutputBlockByExecId(content, execId);

      if (!outputBlock) {
        throw new Error('Failed to create output block');
      }

      // Create relative position for monitor to use
      const yText = this.editor.getYText?.();
      let outputPosition = null;
      if (yText) {
        const relPos = Y.createRelativePositionFromTypeIndex(yText, outputBlock.contentStart, -1);
        outputPosition = Y.relativePositionToJSON(relPos);
      }

      // Mark output block as ready
      this.coordination.setOutputBlockReady(execId, outputPosition);
      console.log(`[ExecutionManager] Output block ready for ${execId}`);

      // Set up status watcher for completion
      const statusPromise = new Promise((resolve, reject) => {
        const unsub = this.coordination.onStatusChange(execId, (status, exec) => {
          console.log(`[ExecutionManager] Status change for ${execId}: ${status}`);

          if (status === EXECUTION_STATUS.COMPLETED) {
            unsub();
            this._monitorUnsubscribes.delete(execId);
            resolve({ success: true, result: exec.result });
          } else if (status === EXECUTION_STATUS.ERROR) {
            unsub();
            this._monitorUnsubscribes.delete(execId);
            resolve({ success: false, error: exec.error });
          } else if (status === EXECUTION_STATUS.CANCELLED) {
            unsub();
            this._monitorUnsubscribes.delete(execId);
            reject(new Error('Execution cancelled'));
          }

          // Handle stdin requests
          if (exec.stdinRequest && !exec.stdinResponse) {
            this._handleMonitorStdinRequest(execId, exec.stdinRequest, index);
          }
        });

        this._monitorUnsubscribes.set(execId, unsub);

        // Handle abort
        controller.signal.addEventListener('abort', () => {
          unsub();
          this._monitorUnsubscribes.delete(execId);
          this.coordination.cancelExecution(execId);
          reject(new Error('Execution aborted'));
        }, { once: true });
      });

      // Wait for completion
      const result = await statusPromise;

      if (result.error) {
        this._emit('cellError', index, result.error, execId);
      }

      this._emit('cellComplete', index, result, execId);
      return execId;

    } catch (err) {
      if (err.name !== 'AbortError' && err.message !== 'Execution aborted') {
        console.error('[ExecutionManager] Monitor execution error:', err);
        this._emit('cellError', index, err, execId);
      }
      return execId;

    } finally {
      this.running.delete(execId);
      this._monitorUnsubscribes.delete(execId);

      // Trigger view update
      if (this.editor?.view) {
        this.editor.view.dispatch({ effects: [] });
      }
    }
  }

  /**
   * Handle stdin request from monitor (via Y.Map)
   *
   * @param {string} execId
   * @param {Object} stdinRequest
   * @param {number} cellIndex
   */
  _handleMonitorStdinRequest(execId, stdinRequest, cellIndex) {
    console.log(`[ExecutionManager] Stdin request from monitor: ${execId}`, stdinRequest);

    // Find output block to insert stdin block after
    const content = this.editor.getContent();
    const outputBlock = findOutputBlockByExecId(content, execId);

    if (!outputBlock) {
      console.warn('[ExecutionManager] Output block not found for stdin request');
      return;
    }

    // Create stdin block
    const stdinMarker = stdinRequest.password
      ? `\n\n\`\`\`stdin:${execId}:password\n\n\`\`\``
      : `\n\n\`\`\`stdin:${execId}\n\n\`\`\``;

    this.editor.view.dispatch({
      changes: { from: outputBlock.end, to: outputBlock.end, insert: stdinMarker },
    });

    // Store request for Enter key handling
    // When user presses Enter, we'll send response via coordination
    pendingStdinRequests.set(execId, {
      prompt: stdinRequest.prompt,
      password: stdinRequest.password,
      execId,
      cellIndex,
      // For monitor mode, resolve sends to Y.Map instead of local promise
      resolve: (text) => {
        this.coordination.respondStdin(execId, text);
        // Clean up stdin block
        const updatedContent = this.editor.getContent();
        const stdinBlock = findStdinBlockByExecId(updatedContent, execId);
        if (stdinBlock) {
          this.editor.view.dispatch({
            changes: { from: stdinBlock.start, to: stdinBlock.end },
          });
        }
      },
      reject: () => {
        // Cleanup on cancel
        const updatedContent = this.editor.getContent();
        const stdinBlock = findStdinBlockByExecId(updatedContent, execId);
        if (stdinBlock) {
          this.editor.view.dispatch({
            changes: { from: stdinBlock.start, to: stdinBlock.end },
          });
        }
      },
    });

    // Position cursor in stdin block
    requestAnimationFrame(() => {
      const updatedContent = this.editor.getContent();
      const stdinBlock = findStdinBlockByExecId(updatedContent, execId);
      if (stdinBlock) {
        this.editor.view.dispatch({
          selection: { anchor: stdinBlock.contentStart },
          scrollIntoView: true,
        });
        this.editor.view.focus();
      }
    });

    this._emit('stdinRequest', cellIndex, stdinRequest, null, null, execId);
  }

  /**
   * Get the terminal buffer for a running cell (for rich display)
   *
   * @param {number} index - Cell index
   * @returns {TerminalBuffer|null}
   */
  getBuffer(index) {
    const execId = this.cellExecIds.get(index);
    return execId ? this.buffers.get(execId) || null : null;
  }

  /**
   * Get the terminal buffer by execId
   *
   * @param {string} execId - Execution ID
   * @returns {TerminalBuffer|null}
   */
  getBufferByExecId(execId) {
    return this.buffers.get(execId) || null;
  }

  /**
   * Get the current execId for a cell
   *
   * @param {number} index - Cell index
   * @returns {string|null}
   */
  getExecId(index) {
    return this.cellExecIds.get(index) || null;
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
