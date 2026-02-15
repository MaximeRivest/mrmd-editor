/**
 * Ctrl-K Modal
 *
 * A modal that appears at the cursor position allowing users to enter
 * free-form AI instructions. The AI returns structured edits that are
 * applied to the document.
 */

import { keymap } from '@codemirror/view';
import { Facet } from '@codemirror/state';
import {
  getAiContext,
  generateOperationId,
  startAiOperation,
  completeAiOperation,
  cancelAiOperation,
} from './ai-integration.js';

// ===========================================================================
// Configuration Facet
// ===========================================================================

/**
 * Facet for configuring the Ctrl-K modal.
 * Provides the AI client and callbacks.
 *
 * @type {Facet<{aiClient: Object, onError?: function, juiceLevel?: number}, Object|null>}
 */
export const ctrlKConfigFacet = Facet.define({
  combine: (values) => values[values.length - 1] || null,
});

// ===========================================================================
// Modal State
// ===========================================================================

let activeModal = null;

/**
 * Close the active modal if any
 */
function closeActiveModal() {
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}

// ===========================================================================
// Modal Component
// ===========================================================================

/**
 * Show the Ctrl-K modal at the cursor position
 *
 * @param {import('@codemirror/view').EditorView} view
 */
function showCtrlKModal(view) {
  // Close any existing modal
  closeActiveModal();

  const config = view.state.facet(ctrlKConfigFacet);
  if (!config || !config.aiClient) {
    console.warn('[Ctrl-K] No AI client configured');
    return;
  }

  const { aiClient, onError } = config;
  const context = getAiContext(view);

  // Get cursor screen coordinates
  const cursorPos = view.state.selection.main.head;
  const coords = view.coordsAtPos(cursorPos);

  if (!coords) {
    console.warn('[Ctrl-K] Could not get cursor coordinates');
    return;
  }

  // Inject styles if not already present
  injectCtrlKStyles();

  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'cm-ctrl-k-modal';
  // On mobile, CSS positions it as a bottom sheet — don't set inline styles
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    modal.style.left = `${coords.left}px`;
    modal.style.top = `${coords.bottom + 8}px`;
  }

  // Track expanded/collapsed state
  let isExpanded = false;

  // Create header (draggable)
  const header = document.createElement('div');
  header.className = 'cm-ctrl-k-header';

  // Toggle button for settings
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'cm-ctrl-k-toggle';
  toggleBtn.textContent = '▾';
  toggleBtn.title = 'Toggle settings';
  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isExpanded = !isExpanded;
    modal.classList.toggle('expanded', isExpanded);
    toggleBtn.textContent = isExpanded ? '▴' : '▾';
    input.focus();
  });
  header.appendChild(toggleBtn);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cm-ctrl-k-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close (Esc)';
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    close();
  });
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // Create input wrapper
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'cm-ctrl-k-input-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cm-ctrl-k-input';
  input.placeholder = context.selectedText ? 'Edit selection...' : 'Ask AI...';
  input.autocomplete = 'off';
  input.spellcheck = false;
  inputWrapper.appendChild(input);

  // Loading indicator
  const loader = document.createElement('span');
  loader.className = 'cm-ctrl-k-loader';
  inputWrapper.appendChild(loader);

  modal.appendChild(inputWrapper);

  // Create collapsible controls section
  const controls = document.createElement('div');
  controls.className = 'cm-ctrl-k-controls';

  // Quality row
  const qualityRow = document.createElement('div');
  qualityRow.className = 'cm-ctrl-k-row';

  const qualityLabel = document.createElement('span');
  qualityLabel.className = 'cm-ctrl-k-label';
  qualityLabel.textContent = 'Quality';
  qualityRow.appendChild(qualityLabel);

  const qualityBtns = document.createElement('div');
  qualityBtns.className = 'cm-ctrl-k-btns';
  const qualityNames = ['Quick', 'Balanced', 'Deep', 'Maximum', 'Ultimate'];
  for (let i = 0; i < 5; i++) {
    const btn = document.createElement('button');
    btn.className = 'cm-ctrl-k-btn' + (i === (aiClient.juiceLevel ?? 1) ? ' active' : '');
    btn.dataset.level = i;
    btn.textContent = i + 1;
    btn.title = qualityNames[i];
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      aiClient.juiceLevel = i;
      qualityBtns.querySelectorAll('.cm-ctrl-k-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      input.focus();
    });
    qualityBtns.appendChild(btn);
  }
  qualityRow.appendChild(qualityBtns);
  controls.appendChild(qualityRow);

  // Thinking row
  const thinkingRow = document.createElement('div');
  thinkingRow.className = 'cm-ctrl-k-row';

  const thinkingLabel = document.createElement('span');
  thinkingLabel.className = 'cm-ctrl-k-label';
  thinkingLabel.textContent = 'Thinking';
  thinkingRow.appendChild(thinkingLabel);

  const thinkingBtns = document.createElement('div');
  thinkingBtns.className = 'cm-ctrl-k-btns';
  const thinkingNames = ['Off', 'Minimal', 'Low', 'Medium', 'High', 'Maximum'];
  for (let i = 0; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.className = 'cm-ctrl-k-btn' + (i === (aiClient.reasoningLevel ?? 1) ? ' active' : '');
    btn.dataset.level = i;
    btn.textContent = i;
    btn.title = thinkingNames[i];
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      aiClient.reasoningLevel = i;
      thinkingBtns.querySelectorAll('.cm-ctrl-k-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      input.focus();
    });
    thinkingBtns.appendChild(btn);
  }
  thinkingRow.appendChild(thinkingBtns);
  controls.appendChild(thinkingRow);

  modal.appendChild(controls);

  document.body.appendChild(modal);
  activeModal = modal;

  // Make draggable
  let isDragging = false;
  let dragStartX, dragStartY, modalStartX, modalStartY;

  header.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn || e.target === toggleBtn) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = modal.getBoundingClientRect();
    modalStartX = rect.left;
    modalStartY = rect.top;
    modal.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    modal.style.left = `${modalStartX + dx}px`;
    modal.style.top = `${modalStartY + dy}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      modal.classList.remove('dragging');
    }
  });

  // Adjust position if off-screen
  requestAnimationFrame(() => {
    const rect = modal.getBoundingClientRect();
    if (rect.right > window.innerWidth - 10) {
      modal.style.left = `${Math.max(10, window.innerWidth - rect.width - 10)}px`;
    }
    if (rect.bottom > window.innerHeight - 10) {
      modal.style.top = `${Math.max(10, coords.top - rect.height - 4)}px`;
    }
  });

  // Focus input
  input.focus();

  // Close function
  const close = () => {
    closeActiveModal();
    view.focus();
  };

  // Handle input
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      const instruction = input.value.trim();

      // Show loading state
      input.disabled = true;
      modal.classList.add('loading');

      try {
        await executeCtrlKCommand(view, context, instruction, {
          aiClient,
          onError,
        });
        close();
      } catch (err) {
        // Show error
        modal.classList.remove('loading');
        modal.classList.add('error');
        input.disabled = false;
        input.value = '';
        input.placeholder = err.message.slice(0, 40);
        onError?.(err);
      }
    }
  });

  // Close on click outside
  const handleOutside = (e) => {
    if (activeModal && !activeModal.contains(e.target)) {
      close();
      document.removeEventListener('mousedown', handleOutside);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', handleOutside), 0);
}

// ===========================================================================
// Inject Styles (into document head for proper CSS)
// ===========================================================================

let stylesInjected = false;

function injectCtrlKStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const css = `
.cm-ctrl-k-modal {
  position: fixed;
  z-index: 10001;
  min-width: 280px;
  max-width: 400px;
  background: var(--bg-secondary, #1c1c1c);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  color: var(--text, #e0e0e0);
  overflow: hidden;
}

.cm-ctrl-k-modal.dragging {
  opacity: 0.9;
  cursor: grabbing;
}

/* Header */
.cm-ctrl-k-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 6px;
  background: var(--bg-tertiary, #252525);
  border-bottom: 1px solid var(--border, #333);
  cursor: grab;
}

.cm-ctrl-k-toggle,
.cm-ctrl-k-close {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, color 0.1s;
}

.cm-ctrl-k-toggle:hover,
.cm-ctrl-k-close:hover {
  background: var(--hover-bg, rgba(255,255,255,0.1));
  color: var(--text, #e0e0e0);
}

.cm-ctrl-k-close:hover {
  background: rgba(255, 80, 80, 0.2);
  color: #ff6b6b;
}

/* Input */
.cm-ctrl-k-input-wrap {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
}

.cm-ctrl-k-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text, #e0e0e0);
  font-size: 14px;
  font-family: inherit;
}

.cm-ctrl-k-input::placeholder {
  color: var(--text-dim, #666);
}

.cm-ctrl-k-loader {
  display: none;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border, #333);
  border-top-color: var(--accent, #58a6ff);
  border-radius: 50%;
  animation: cm-ctrl-k-spin 0.6s linear infinite;
}

.cm-ctrl-k-modal.loading .cm-ctrl-k-loader {
  display: block;
}

@keyframes cm-ctrl-k-spin {
  to { transform: rotate(360deg); }
}

/* Controls - collapsed by default */
.cm-ctrl-k-controls {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.15s ease, padding 0.15s ease;
  padding: 0 12px;
  border-top: 1px solid transparent;
}

.cm-ctrl-k-modal.expanded .cm-ctrl-k-controls {
  max-height: 100px;
  padding: 8px 12px;
  border-top-color: var(--border, #333);
}

.cm-ctrl-k-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.cm-ctrl-k-row:last-child {
  margin-bottom: 0;
}

.cm-ctrl-k-label {
  width: 54px;
  font-size: 11px;
  color: var(--text-muted, #888);
  flex-shrink: 0;
}

.cm-ctrl-k-btns {
  display: flex;
  gap: 3px;
}

.cm-ctrl-k-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  background: var(--bg, #1a1a1a);
  color: var(--text-muted, #888);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s;
}

.cm-ctrl-k-btn:hover {
  border-color: var(--text-muted, #888);
  color: var(--text, #e0e0e0);
}

.cm-ctrl-k-btn.active {
  background: var(--accent, #58a6ff);
  border-color: var(--accent, #58a6ff);
  color: white;
}

/* Error state */
.cm-ctrl-k-modal.error .cm-ctrl-k-input::placeholder {
  color: var(--error, #ff6b6b);
}

.cm-ctrl-k-modal.error .cm-ctrl-k-header {
  border-bottom-color: var(--error, #ff6b6b);
}

/* Loading state - hide controls */
.cm-ctrl-k-modal.loading .cm-ctrl-k-controls {
  display: none;
}

.cm-ctrl-k-modal.loading .cm-ctrl-k-toggle {
  display: none;
}

/* Mobile: Ctrl-K becomes a bottom sheet instead of cursor-anchored popup */
@media (max-width: 768px) {
  .cm-ctrl-k-modal {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    top: auto !important;
    min-width: 100%;
    max-width: 100%;
    border-radius: 16px 16px 0 0;
    border: none;
    border-top: 1px solid var(--border, #333);
    box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.4);
    animation: cm-ctrl-k-slide-up 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes cm-ctrl-k-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .cm-ctrl-k-header {
    cursor: default;
    justify-content: space-between;
    padding: 8px 16px;
    position: relative;
  }

  /* Drag handle */
  .cm-ctrl-k-header::before {
    content: '';
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 36px;
    height: 4px;
    background: var(--text-dim, #666);
    border-radius: 2px;
    opacity: 0.4;
  }

  .cm-ctrl-k-toggle,
  .cm-ctrl-k-close {
    width: 44px;
    height: 44px;
    font-size: 18px;
  }

  .cm-ctrl-k-input-wrap {
    padding: 12px 16px;
  }

  .cm-ctrl-k-input {
    font-size: 16px; /* Prevents iOS zoom */
    padding: 8px 0;
  }

  .cm-ctrl-k-controls {
    padding: 0 16px;
  }

  .cm-ctrl-k-modal.expanded .cm-ctrl-k-controls {
    padding: 12px 16px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }

  .cm-ctrl-k-btn {
    width: 36px;
    height: 36px;
    font-size: 14px;
    border-radius: 8px;
  }

  .cm-ctrl-k-label {
    font-size: 13px;
  }
}
`;

  const style = document.createElement('style');
  style.id = 'cm-ctrl-k-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

// ===========================================================================
// Execute Command
// ===========================================================================

/**
 * Execute the Ctrl-K command via AI
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Object} context - Context from getAiContext
 * @param {string} instruction - User's instruction
 * @param {Object} options
 */
async function executeCtrlKCommand(view, context, instruction, options) {
  const { aiClient, onError } = options;

  const opId = generateOperationId();
  const from = context.selectionFrom;
  const to = context.selectionTo;
  const hasSelection = from !== to;

  // Start loading state
  view.dispatch({
    effects: startAiOperation.of({
      id: opId,
      type: hasSelection ? 'replace' : 'insert',
      from,
      to,
      originalText: hasSelection ? context.selectedText : '',
    }),
  });

  try {
    // Don't pass juiceLevel - let aiClient use its current setting
    const result = await aiClient.execute('EditAtCursorPredict', {
      text_before: context.textBeforeCursor,
      text_after: context.textAfterCursor,
      selection: context.selectedText || '',
      full_document: context.documentContext,
      instruction,
    });

    // Cancel the loading state
    view.dispatch({
      effects: cancelAiOperation.of({ id: opId }),
    });

    // Apply edits
    if (result.edits && result.edits.length > 0) {
      applyEdits(view, result.edits, context);
    }
  } catch (err) {
    // Cancel on error
    view.dispatch({
      effects: cancelAiOperation.of({ id: opId }),
    });
    throw err;
  }
}

/**
 * Apply a list of find/replace edits to the document
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Array<{find: string, replace: string}>} edits
 * @param {Object} context
 */
function applyEdits(view, edits, context) {
  const changes = [];
  const doc = view.state.doc.toString();

  for (const edit of edits) {
    if (edit.find === '' || edit.find === null) {
      // Insert at cursor position
      changes.push({
        from: context.cursorPos,
        insert: edit.replace,
      });
    } else {
      // Find and replace
      // Start search from cursor position area for better locality
      const searchStart = Math.max(0, context.cursorPos - 2000);
      const searchEnd = Math.min(doc.length, context.cursorPos + 2000);
      const searchArea = doc.slice(searchStart, searchEnd);

      let idx = searchArea.indexOf(edit.find);
      if (idx >= 0) {
        // Found in nearby area
        idx += searchStart;
      } else {
        // Search entire document
        idx = doc.indexOf(edit.find);
      }

      if (idx >= 0) {
        changes.push({
          from: idx,
          to: idx + edit.find.length,
          insert: edit.replace,
        });
      } else {
        console.warn(`[Ctrl-K] Could not find text to replace: "${edit.find.slice(0, 50)}..."`);
      }
    }
  }

  if (changes.length > 0) {
    view.dispatch({ changes });
  }
}

// ===========================================================================
// Extension
// ===========================================================================

/**
 * Create the Ctrl-K extension
 *
 * @param {Object} options
 * @param {Object} options.aiClient - AI client instance
 * @param {function} [options.onError] - Error callback
 * @param {number} [options.juiceLevel] - Default juice level (0-4)
 * @returns {import('@codemirror/state').Extension}
 */
export function createCtrlKExtension(options = {}) {
  return [
    ctrlKConfigFacet.of(options),
    keymap.of([
      {
        key: 'Mod-k',
        run(view) {
          showCtrlKModal(view);
          return true;
        },
      },
    ]),
    ctrlKStyles,
  ];
}

// ===========================================================================
// Styles
// ===========================================================================

import { EditorView } from '@codemirror/view';

// Styles are injected via injectCtrlKStyles() for proper CSS support
const ctrlKStyles = EditorView.baseTheme({});

// ===========================================================================
// Exports
// ===========================================================================

export {
  showCtrlKModal,
  closeActiveModal,
  applyEdits,
};
