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
// Comment Extraction / Thread Grouping
// ===========================================================================

/**
 * Parse a comment body into a simple multi-turn thread.
 *
 * Thread format:
 *
 * @comment
 * First message
 *
 * @reply
 * Follow-up message
 *
 * If no @role headers are present, the whole body is treated as a single
 * `comment` message for backward compatibility.
 *
 * @param {string} content
 * @returns {Array<{role: string, text: string}>}
 */
export function parseCommentThread(content) {
  const text = String(content || '').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const messages = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (!body) return;
    messages.push({
      role: sanitizeCommentRole(current.role),
      text: body,
    });
  };

  for (const line of lines) {
    const header = line.trim().match(/^@([a-zA-Z][\w-]*)\s*$/);
    if (header) {
      pushCurrent();
      current = { role: header[1].toLowerCase(), lines: [] };
      continue;
    }

    if (!current) {
      current = { role: 'comment', lines: [] };
    }
    current.lines.push(line);
  }

  pushCurrent();

  if (messages.length === 0 && text) {
    return [{ role: 'comment', text }];
  }

  return messages;
}

function sanitizeCommentRole(role) {
  const normalized = String(role || 'comment').toLowerCase().trim();
  return normalized.match(/^[a-z][\w-]*$/) ? normalized : 'comment';
}

function normalizeCommentContent(content) {
  return String(content || '').replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Serialize a comment thread back to comment body text.
 *
 * Keeps legacy single-message comments as plain text. Multi-turn threads use
 * the @role stanza format described above.
 *
 * @param {Array<{role: string, text: string}>} messages
 * @returns {string}
 */
export function serializeCommentThread(messages) {
  const cleaned = (messages || [])
    .map((message) => ({
      role: sanitizeCommentRole(message?.role),
      text: String(message?.text || '').trim(),
    }))
    .filter((message) => message.text.length > 0);

  if (cleaned.length === 0) return '';
  if (cleaned.length === 1 && cleaned[0].role === 'comment') {
    return cleaned[0].text;
  }

  return cleaned
    .map((message) => `@${message.role}\n${message.text}`)
    .join('\n\n');
}

/**
 * Build raw <!--! !--> syntax for a comment body.
 *
 * @param {string} content
 * @returns {string}
 */
export function buildCommentRaw(content) {
  const text = normalizeCommentContent(content);
  return `<!--! ${text} !-->`;
}

/**
 * Append a reply to an existing comment body.
 *
 * @param {string} content
 * @param {string} replyText
 * @param {string} [role='reply']
 * @returns {string}
 */
export function appendCommentReply(content, replyText, role = 'reply') {
  const reply = String(replyText || '').trim();
  if (!reply) return String(content || '').trim();

  const thread = parseCommentThread(content);
  thread.push({ role: sanitizeCommentRole(role), text: reply });
  return serializeCommentThread(thread);
}

/**
 * Get a human-friendly one-line preview for a comment/thread.
 *
 * @param {string} content
 * @returns {string}
 */
export function getCommentPreview(content) {
  const messages = parseCommentThread(content);
  const text = messages[0]?.text || String(content || '').trim();
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Group adjacent one-line comment markers into visual threads.
 *
 * A thread is a run of comment markers separated only by spaces/tabs on the
 * same physical line. This keeps the document representation single-line and
 * lets the UI treat immediately-adjacent markers as replies.
 *
 * @param {string} text
 * @param {Array<{start:number,end:number,content:string,raw:string,thread?:Array<{role:string,text:string}>}>} [comments]
 * @returns {Array<{start:number,end:number,raw:string,preview:string,count:number,comments:Array, messages:Array<{role:string,text:string}>}>}
 */
export function groupAdjacentComments(text, comments = null) {
  const sourceText = String(text || '');
  const items = Array.isArray(comments) ? comments : extractComments(sourceText);
  if (items.length === 0) return [];

  const threads = [];
  let current = null;

  const startThread = (comment) => {
    current = {
      start: comment.start,
      end: comment.end,
      raw: '',
      preview: '',
      count: 0,
      comments: [comment],
      messages: [],
    };
    appendCommentMessages(comment);
  };

  const appendCommentMessages = (comment) => {
    const parsed = Array.isArray(comment.thread) && comment.thread.length > 0
      ? comment.thread
      : [{ role: 'comment', text: comment.content }];
    const preserveRoles = parsed.length > 1;

    for (const message of parsed) {
      const text = normalizeCommentContent(message?.text || '');
      if (!text) continue;
      current.messages.push({
        role: preserveRoles
          ? sanitizeCommentRole(message?.role)
          : (current.messages.length === 0 ? 'comment' : 'reply'),
        text,
      });
    }
  };

  const finishThread = () => {
    if (!current) return;
    current.raw = sourceText.slice(current.start, current.end);
    current.count = current.messages.length;
    current.preview = current.messages[0]?.text || current.comments[0]?.preview || '';
    threads.push(current);
    current = null;
  };

  for (const comment of items) {
    if (!current) {
      startThread(comment);
      continue;
    }

    const separator = sourceText.slice(current.end, comment.start);
    const isAdjacent = /^[ \t]*$/.test(separator);

    if (isAdjacent) {
      current.end = comment.end;
      current.comments.push(comment);
      appendCommentMessages(comment);
    } else {
      finishThread();
      startThread(comment);
    }
  }

  finishThread();
  return threads;
}

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
    const content = match[1].trim();
    comments.push({
      start: match.index,
      end: match.index + match[0].length,
      content,
      raw: match[0],
      preview: getCommentPreview(content),
      thread: parseCommentThread(content),
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
   * @param {{count?: number, preview?: string, threadStart?: number, threadEnd?: number, threadRaw?: string}} [options]
   */
  constructor(content, from, to, raw, options = {}) {
    super();
    this.content = content;
    this.from = from;
    this.to = to;
    this.raw = raw;
    this.count = Math.max(1, options.count || 1);
    this.preview = options.preview || getCommentPreview(content);
    this.threadStart = Number.isFinite(options.threadStart) ? options.threadStart : from;
    this.threadEnd = Number.isFinite(options.threadEnd) ? options.threadEnd : to;
    this.threadRaw = options.threadRaw || raw;
  }

  eq(other) {
    return (
      other instanceof CommentMarkerWidget &&
      other.content === this.content &&
      other.from === this.from &&
      other.to === this.to &&
      other.count === this.count &&
      other.preview === this.preview &&
      other.threadStart === this.threadStart &&
      other.threadEnd === this.threadEnd
    );
  }

  toDOM(view) {
    const marker = document.createElement('span');
    const previewText = this.preview;
    const label = this.count > 1
      ? `Comment thread with ${this.count} messages: ${previewText.slice(0, 50)}`
      : `Comment: ${previewText.slice(0, 50)}`;

    marker.className = 'cm-comment-marker';
    marker.setAttribute('aria-label', label);
    marker.setAttribute('title', label);
    marker.setAttribute('role', 'button');
    marker.setAttribute('tabindex', '0');

    const icon = document.createElement('span');
    icon.className = 'cm-comment-marker-icon';
    icon.textContent = '💬';
    marker.appendChild(icon);

    if (this.count > 1) {
      const count = document.createElement('span');
      count.className = 'cm-comment-marker-count';
      count.textContent = String(this.count);
      marker.appendChild(count);
    }

    marker.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      let handledBySidebar = false;
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('mrmd-comment-thread-open', {
          cancelable: true,
          detail: {
            from: this.threadStart,
            to: this.threadEnd,
            raw: this.threadRaw,
            preview: this.preview,
            count: this.count,
          },
        });
        handledBySidebar = window.dispatchEvent(event) === false || event.defaultPrevented;
      }

      if (handledBySidebar) return;

      view.dispatch({
        effects: showCommentBubble.of({
          from: this.from,
          to: this.to,
          content: this.content,
          raw: this.raw,
        }),
      });
    });

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

/**
 * Zero-width anchor used in sidebar mode so comment syntax disappears from the
 * document flow while the discussion lives in the side panel.
 */
class CommentAnchorWidget extends WidgetType {
  constructor(from) {
    super();
    this.from = from;
  }

  eq(other) {
    return other instanceof CommentAnchorWidget && other.from === this.from;
  }

  toDOM() {
    const anchor = document.createElement('span');
    anchor.className = 'cm-comment-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    return anchor;
  }

  ignoreEvent() {
    return true;
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

  // Extract and group comments into same-line threads
  const comments = extractComments(text);
  const threads = groupAdjacentComments(text, comments);

  for (const thread of threads) {
    const startLine = doc.lineAt(thread.start);
    const endLine = doc.lineAt(Math.max(thread.start, thread.end - 1));
    const isMultiline = thread.raw.includes('\n');

    // Show raw syntax whenever the cursor is on a line touched by the thread.
    const isActiveLine = cursorLine.number >= startLine.number && cursorLine.number <= endLine.number;
    const primaryComment = thread.comments[0];

    if (isActiveLine) {
      decorations.push(
        Decoration.mark({
          class: 'cm-comment-syntax-active',
        }).range(thread.start, thread.end)
      );
    } else if (isMultiline) {
      decorations.push(
        Decoration.mark({
          class: 'cm-comment-syntax-thread',
        }).range(thread.start, thread.end)
      );
    } else {
      decorations.push(
        Decoration.replace({
          widget: new CommentMarkerWidget(
            primaryComment.content,
            primaryComment.start,
            primaryComment.end,
            primaryComment.raw,
            {
              count: thread.count,
              preview: thread.preview,
              threadStart: thread.start,
              threadEnd: thread.end,
              threadRaw: thread.raw,
            }
          ),
        }).range(thread.start, thread.end)
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
      const newRaw = buildCommentRaw(newContent);
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
        const newRaw = buildCommentRaw(newContent);
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
    background: 'var(--bg-comment, rgba(255, 203, 107, 0.12))',
    border: '1px solid var(--border-comment, rgba(255, 203, 107, 0.24))',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '11px',
    lineHeight: '1.2',
    verticalAlign: 'baseline',
    transition: 'background 0.15s, border-color 0.15s',
    '&:hover': {
      background: 'var(--bg-comment-hover, rgba(255, 203, 107, 0.2))',
      borderColor: 'var(--border-comment-hover, rgba(255, 203, 107, 0.4))',
    },
  },

  '.cm-comment-marker-icon': {
    fontSize: '11px',
  },

  '.cm-comment-marker-count': {
    minWidth: '14px',
    height: '14px',
    padding: '0 4px',
    borderRadius: '999px',
    background: 'color-mix(in srgb, var(--accent, #58a6ff) 14%, transparent)',
    color: 'var(--text, inherit)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '600',
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

  '.cm-comment-syntax-thread': {
    background: 'var(--bg-comment-thread, rgba(255, 203, 107, 0.08))',
    borderRadius: '4px',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  },

  '.cm-comment-anchor': {
    display: 'inline-block',
    width: '0',
    height: '0',
    overflow: 'hidden',
    verticalAlign: 'baseline',
  },

  '.cm-comment-sidebar-hidden': {
    display: 'none',
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
    // Wrap selection in a single-line comment token
    const selectedText = state.sliceDoc(from, to);
    insert = buildCommentRaw(selectedText);
    cursorPos = from + 6; // After "<!--! "
  } else {
    // Insert empty comment and place cursor inside
    insert = buildCommentRaw('');
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
