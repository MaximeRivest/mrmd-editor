/**
 * Comment Syntax Extension
 *
 * Detects <!--! comment text !--> markers in the document and displays them
 * as collapsed indicators. When clicked, opens a bubble for editing.
 *
 * Also provides AI programs to address comments.
 */

import { ViewPlugin, Decoration, WidgetType, EditorView, keymap } from '@codemirror/view';
import { Facet, StateField, StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { getAiContext, generateOperationId } from './ai-integration.js';

// ===========================================================================
// Constants
// ===========================================================================

/**
 * Regex to match comment markers: <!--! content !-->
 * Captures the content inside the markers
 */
const COMMENT_REGEX = /<!--!\s*([\s\S]*?)\s*!-->/g;

/**
 * Regex for single match (without global flag for exec)
 */
const COMMENT_REGEX_SINGLE = /<!--!\s*([\s\S]*?)\s*!-->/;

// ===========================================================================
// Configuration
// ===========================================================================

/**
 * Facet for configuring comment syntax behavior
 */
export const commentConfigFacet = Facet.define({
  combine: (values) => values[values.length - 1] || null,
});

// ===========================================================================
// Bubble State
// ===========================================================================

/**
 * Effect to show a comment bubble
 */
export const showCommentBubble = StateEffect.define();

/**
 * Effect to hide the comment bubble
 */
export const hideCommentBubble = StateEffect.define();

/**
 * State field tracking the active comment bubble
 */
export const commentBubbleState = StateField.define({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showCommentBubble)) {
        return effect.value;
      }
      if (effect.is(hideCommentBubble)) {
        return null;
      }
    }
    // Invalidate if document changed and positions are affected
    if (tr.docChanged && value) {
      // Check if the comment still exists
      const doc = tr.state.doc.toString();
      const commentRaw = value.raw;
      if (!doc.includes(commentRaw)) {
        return null;
      }
    }
    return value;
  },
});

// ===========================================================================
// Comment Extraction
// ===========================================================================

/**
 * Extract all comments from a document
 *
 * @param {string} text - Document text
 * @returns {Array<{start: number, end: number, content: string, raw: string}>}
 */
export function extractComments(text) {
  const comments = [];
  let match;
  const regex = new RegExp(COMMENT_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    comments.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1].trim(),
      raw: match[0],
    });
  }

  return comments;
}

/**
 * Find the comment nearest to a position
 *
 * @param {string} text - Document text
 * @param {number} pos - Cursor position
 * @returns {{start: number, end: number, content: string, raw: string}|null}
 */
export function findNearestComment(text, pos) {
  const comments = extractComments(text);
  if (comments.length === 0) return null;

  let nearest = comments[0];
  let nearestDist = Math.min(Math.abs(pos - nearest.start), Math.abs(pos - nearest.end));

  for (const comment of comments.slice(1)) {
    const dist = Math.min(Math.abs(pos - comment.start), Math.abs(pos - comment.end));
    if (dist < nearestDist) {
      nearest = comment;
      nearestDist = dist;
    }
  }

  return nearest;
}

// ===========================================================================
// Comment Marker Widget
// ===========================================================================

/**
 * Widget that displays a collapsed comment marker
 */
class CommentMarkerWidget extends WidgetType {
  /**
   * @param {string} content - Comment content
   * @param {number} from - Start position
   * @param {number} to - End position
   * @param {string} raw - Raw comment text
   */
  constructor(content, from, to, raw) {
    super();
    this.content = content;
    this.from = from;
    this.to = to;
    this.raw = raw;
  }

  eq(other) {
    return (
      other instanceof CommentMarkerWidget &&
      other.content === this.content &&
      other.from === this.from
    );
  }

  toDOM(view) {
    const marker = document.createElement('span');
    marker.className = 'cm-comment-marker';
    marker.setAttribute('aria-label', `Comment: ${this.content.slice(0, 50)}`);
    marker.setAttribute('role', 'button');
    marker.setAttribute('tabindex', '0');

    // Icon
    const icon = document.createElement('span');
    icon.className = 'cm-comment-marker-icon';
    icon.textContent = '💭';
    marker.appendChild(icon);

    // Preview (truncated)
    if (this.content.length > 0) {
      const preview = document.createElement('span');
      preview.className = 'cm-comment-marker-preview';
      preview.textContent = this.content.slice(0, 20) + (this.content.length > 20 ? '…' : '');
      marker.appendChild(preview);
    }

    // Click handler
    marker.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        effects: showCommentBubble.of({
          from: this.from,
          to: this.to,
          content: this.content,
          raw: this.raw,
        }),
      });
    });

    // Keyboard handler
    marker.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        marker.click();
      }
    });

    return marker;
  }

  ignoreEvent() {
    return false;
  }
}

// ===========================================================================
// Decoration Builder
// ===========================================================================

/**
 * Build decorations for comment markers
 *
 * @param {import('@codemirror/view').EditorView} view
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildDecorations(view) {
  const decorations = [];
  const doc = view.state.doc;
  const text = doc.toString();
  const selection = view.state.selection.main;
  const cursorPos = selection.head;

  // Get the line the cursor is on
  const cursorLine = doc.lineAt(cursorPos);

  // Extract all comments
  const comments = extractComments(text);

  for (const comment of comments) {
    const commentLine = doc.lineAt(comment.start);

    // Check if cursor is on the same line as the comment
    const isActiveLine = cursorLine.number === commentLine.number;

    if (isActiveLine) {
      // Show raw syntax with styling
      decorations.push(
        Decoration.mark({
          class: 'cm-comment-syntax-active',
        }).range(comment.start, comment.end)
      );
    } else {
      // Replace with marker widget
      decorations.push(
        Decoration.replace({
          widget: new CommentMarkerWidget(
            comment.content,
            comment.start,
            comment.end,
            comment.raw
          ),
        }).range(comment.start, comment.end)
      );
    }
  }

  return Decoration.set(decorations, true);
}

// ===========================================================================
// View Plugin
// ===========================================================================

/**
 * ViewPlugin that manages comment decorations
 */
const commentDecorationsPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// ===========================================================================
// Comment Bubble Component
// ===========================================================================

let activeBubble = null;

/**
 * Close the active bubble if any
 */
function closeActiveBubble() {
  if (activeBubble) {
    activeBubble.remove();
    activeBubble = null;
  }
}

/**
 * Create and show a comment bubble
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {{from: number, to: number, content: string, raw: string}} comment
 */
function showBubble(view, comment) {
  closeActiveBubble();

  const config = view.state.facet(commentConfigFacet);
  const aiClient = config?.aiClient;

  // Get position for the bubble
  const coords = view.coordsAtPos(comment.from);
  if (!coords) return;

  // Create bubble container
  const bubble = document.createElement('div');
  bubble.className = 'cm-comment-bubble';
  bubble.style.position = 'fixed';
  bubble.style.left = `${coords.left}px`;
  bubble.style.top = `${coords.bottom + 4}px`;
  bubble.style.zIndex = '10002';

  // Header
  const header = document.createElement('div');
  header.className = 'cm-comment-bubble-header';

  const title = document.createElement('span');
  title.className = 'cm-comment-bubble-title';
  title.textContent = '💭 Comment';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'cm-comment-bubble-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close';
  closeBtn.onclick = () => closeBubble(view);
  header.appendChild(closeBtn);

  bubble.appendChild(header);

  // Textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'cm-comment-bubble-textarea';
  textarea.value = comment.content;
  textarea.placeholder = 'Enter comment or instruction...';
  textarea.rows = 3;
  bubble.appendChild(textarea);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'cm-comment-bubble-actions';

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'cm-comment-bubble-btn cm-comment-bubble-btn-secondary';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = () => {
    // Remove the comment from the document
    view.dispatch({
      changes: { from: comment.from, to: comment.to, insert: '' },
      effects: hideCommentBubble.of(null),
    });
    closeBubble(view);
  };
  actions.appendChild(deleteBtn);

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  actions.appendChild(spacer);

  // Address button (AI)
  if (aiClient) {
    const addressBtn = document.createElement('button');
    addressBtn.className = 'cm-comment-bubble-btn cm-comment-bubble-btn-primary';
    addressBtn.textContent = 'Address with AI';
    addressBtn.onclick = async () => {
      addressBtn.disabled = true;
      addressBtn.textContent = 'Thinking...';

      try {
        await addressComment(view, comment, aiClient);
        closeBubble(view);
      } catch (err) {
        addressBtn.disabled = false;
        addressBtn.textContent = 'Address with AI';
        console.error('[Comment] AI error:', err);
      }
    };
    actions.appendChild(addressBtn);
  }

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'cm-comment-bubble-btn cm-comment-bubble-btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = () => {
    const newContent = textarea.value.trim();
    if (newContent !== comment.content) {
      // Update the comment in the document
      const newRaw = `<!--! ${newContent} !-->`;
      view.dispatch({
        changes: { from: comment.from, to: comment.to, insert: newRaw },
        effects: hideCommentBubble.of(null),
      });
    }
    closeBubble(view);
  };
  actions.appendChild(saveBtn);

  bubble.appendChild(actions);

  document.body.appendChild(bubble);
  activeBubble = bubble;

  // Adjust position if off-screen
  requestAnimationFrame(() => {
    const rect = bubble.getBoundingClientRect();
    if (rect.right > window.innerWidth - 10) {
      bubble.style.left = `${Math.max(10, window.innerWidth - rect.width - 10)}px`;
    }
    if (rect.bottom > window.innerHeight - 10) {
      bubble.style.top = `${Math.max(10, coords.top - rect.height - 4)}px`;
    }
  });

  // Focus textarea
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  // Handle escape
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBubble(view);
    }
  });

  // Close on click outside
  const handleOutside = (e) => {
    if (activeBubble && !activeBubble.contains(e.target)) {
      // Save changes before closing
      const newContent = textarea.value.trim();
      if (newContent !== comment.content) {
        const newRaw = `<!--! ${newContent} !-->`;
        view.dispatch({
          changes: { from: comment.from, to: comment.to, insert: newRaw },
          effects: hideCommentBubble.of(null),
        });
      }
      closeBubble(view);
      document.removeEventListener('mousedown', handleOutside);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', handleOutside), 0);
}

/**
 * Close the bubble
 */
function closeBubble(view) {
  closeActiveBubble();
  view.dispatch({
    effects: hideCommentBubble.of(null),
  });
  view.focus();
}

// ===========================================================================
// AI Integration
// ===========================================================================

/**
 * Address a comment using AI
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {{from: number, to: number, content: string, raw: string}} comment
 * @param {Object} aiClient
 */
async function addressComment(view, comment, aiClient) {
  const doc = view.state.doc.toString();
  const contextSize = 500;

  // Get context around the comment
  const contextBefore = doc.slice(
    Math.max(0, comment.from - contextSize),
    comment.from
  );
  const contextAfter = doc.slice(
    comment.to,
    Math.min(doc.length, comment.to + contextSize)
  );

  const result = await aiClient.execute('AddressCommentPredict', {
    full_document: doc,
    comment_text: comment.content,
    comment_context_before: contextBefore,
    comment_context_after: contextAfter,
    comment_raw: comment.raw,
  });

  // Apply edits
  if (result.edits && result.edits.length > 0) {
    const changes = [];

    for (const edit of result.edits) {
      if (edit.find === '' || edit.find === null) {
        // Insert at comment position
        changes.push({
          from: comment.from,
          insert: edit.replace,
        });
      } else {
        // Find and replace
        const idx = doc.indexOf(edit.find);
        if (idx >= 0) {
          changes.push({
            from: idx,
            to: idx + edit.find.length,
            insert: edit.replace,
          });
        }
      }
    }

    if (changes.length > 0) {
      view.dispatch({ changes });
    }
  }
}

/**
 * Address all comments in the document
 *
 * @param {import('@codemirror/view').EditorView} view
 */
export async function addressAllComments(view) {
  const config = view.state.facet(commentConfigFacet);
  if (!config?.aiClient) {
    console.warn('[Comment] No AI client configured');
    return;
  }

  const doc = view.state.doc.toString();
  const comments = extractComments(doc);

  if (comments.length === 0) {
    console.log('[Comment] No comments found');
    return;
  }

  // Build comment info for the AI
  const commentInfos = comments.map((c) => ({
    text: c.content,
    context_before: doc.slice(Math.max(0, c.start - 200), c.start),
    context_after: doc.slice(c.end, Math.min(doc.length, c.end + 200)),
  }));

  const result = await config.aiClient.execute('AddressAllCommentsPredict', {
    full_document: doc,
    comments: commentInfos,
  });

  // Apply edits
  if (result.edits && result.edits.length > 0) {
    const changes = [];

    for (const edit of result.edits) {
      if (edit.find === '' || edit.find === null) {
        continue; // Skip pure insertions for bulk operations
      }

      const idx = doc.indexOf(edit.find);
      if (idx >= 0) {
        changes.push({
          from: idx,
          to: idx + edit.find.length,
          insert: edit.replace,
        });
      }
    }

    if (changes.length > 0) {
      view.dispatch({ changes });
    }
  }
}

/**
 * Address the comment nearest to the cursor
 *
 * @param {import('@codemirror/view').EditorView} view
 */
export async function addressNearbyComment(view) {
  const config = view.state.facet(commentConfigFacet);
  if (!config?.aiClient) {
    console.warn('[Comment] No AI client configured');
    return;
  }

  const doc = view.state.doc.toString();
  const cursorPos = view.state.selection.main.head;
  const comment = findNearestComment(doc, cursorPos);

  if (!comment) {
    console.log('[Comment] No nearby comment found');
    return;
  }

  await addressComment(view, comment, config.aiClient);
}

// ===========================================================================
// Bubble Manager Plugin
// ===========================================================================

/**
 * ViewPlugin that manages the comment bubble DOM
 */
const bubbleManagerPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.checkBubble(view.state);
    }

    update(update) {
      if (update.state.field(commentBubbleState) !== update.startState.field(commentBubbleState)) {
        this.checkBubble(update.state);
      }
    }

    checkBubble(state) {
      const bubbleData = state.field(commentBubbleState);
      if (bubbleData) {
        showBubble(this.view, bubbleData);
      } else {
        closeActiveBubble();
      }
    }

    destroy() {
      closeActiveBubble();
    }
  }
);

// ===========================================================================
// Styles
// ===========================================================================

const commentStyles = EditorView.baseTheme({
  '.cm-comment-marker': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '1px 6px',
    background: 'var(--bg-comment, rgba(255, 203, 107, 0.15))',
    border: '1px solid var(--border-comment, rgba(255, 203, 107, 0.3))',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    verticalAlign: 'baseline',
    transition: 'background 0.15s, border-color 0.15s',
    '&:hover': {
      background: 'var(--bg-comment-hover, rgba(255, 203, 107, 0.25))',
      borderColor: 'var(--border-comment-hover, rgba(255, 203, 107, 0.5))',
    },
  },

  '.cm-comment-marker-icon': {
    fontSize: '11px',
  },

  '.cm-comment-marker-preview': {
    color: 'var(--text-comment, #ffcb6b)',
    maxWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  '.cm-comment-syntax-active': {
    background: 'var(--bg-comment-active, rgba(255, 203, 107, 0.1))',
    borderRadius: '2px',
  },

  '.cm-comment-bubble': {
    background: 'var(--bg-secondary, #1e1e1e)',
    border: '1px solid var(--border, #3c3c3c)',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    minWidth: '300px',
    maxWidth: '450px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    overflow: 'hidden',
  },

  '.cm-comment-bubble-header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'var(--bg-tertiary, #252526)',
    borderBottom: '1px solid var(--border, #3c3c3c)',
  },

  '.cm-comment-bubble-title': {
    fontWeight: '600',
    color: 'var(--text-comment, #ffcb6b)',
  },

  '.cm-comment-bubble-close': {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted, #6e7681)',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    '&:hover': {
      color: 'var(--text, #c9d1d9)',
    },
  },

  '.cm-comment-bubble-textarea': {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px',
    border: 'none',
    background: 'var(--bg, #0d1117)',
    color: 'var(--text, #c9d1d9)',
    fontSize: '13px',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '80px',
    '&:focus': {
      outline: 'none',
    },
    '&::placeholder': {
      color: 'var(--text-muted, #6e7681)',
    },
  },

  '.cm-comment-bubble-actions': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary, #252526)',
    borderTop: '1px solid var(--border, #3c3c3c)',
  },

  '.cm-comment-bubble-btn': {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },

  '.cm-comment-bubble-btn-primary': {
    background: 'var(--accent, #58a6ff)',
    color: 'white',
    '&:hover': {
      background: 'var(--accent-hover, #79b8ff)',
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },

  '.cm-comment-bubble-btn-secondary': {
    background: 'var(--bg-secondary, #21262d)',
    color: 'var(--text, #c9d1d9)',
    border: '1px solid var(--border, #30363d)',
    '&:hover': {
      background: 'var(--bg-hover, #30363d)',
    },
  },
});

// ===========================================================================
// Insert Comment Command
// ===========================================================================

/**
 * Insert a comment at the cursor position
 *
 * @param {import('@codemirror/view').EditorView} view
 * @returns {boolean}
 */
function insertComment(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const hasSelection = from !== to;

  let insert;
  let cursorPos;

  if (hasSelection) {
    // Wrap selection in comment
    const selectedText = state.sliceDoc(from, to);
    insert = `<!--! ${selectedText} !-->`;
    cursorPos = from + 6; // After "<!--! "
  } else {
    // Insert empty comment and place cursor inside
    insert = `<!--!  !-->`;
    cursorPos = from + 6; // After "<!--! "
  }

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: cursorPos },
  });

  return true;
}

/**
 * Keymap for comment syntax shortcuts
 */
const commentKeymap = keymap.of([
  {
    key: 'Mod-Shift-m',
    run: insertComment,
  },
  {
    // Alternative: Ctrl-Shift-/ (common comment shortcut pattern)
    key: 'Mod-Shift-/',
    run: insertComment,
  },
]);

// ===========================================================================
// Extension Factory
// ===========================================================================

/**
 * Create the comment syntax extension
 *
 * @param {Object} [options]
 * @param {Object} [options.aiClient] - AI client for addressing comments
 * @param {number} [options.juiceLevel] - Default juice level for AI
 * @returns {import('@codemirror/state').Extension}
 */
export function createCommentSyntaxExtension(options = {}) {
  return [
    commentConfigFacet.of(options),
    commentBubbleState,
    commentDecorationsPlugin,
    bubbleManagerPlugin,
    commentKeymap,
    commentStyles,
  ];
}

// ===========================================================================
// Exports
// ===========================================================================

export {
  CommentMarkerWidget,
  closeActiveBubble,
  insertComment,
  COMMENT_REGEX,
};
