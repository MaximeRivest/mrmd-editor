/**
 * Inline HTML Rendering
 *
 * Renders inline HTML elements in markdown content.
 * Supports all HTML tags with full power - no sanitization.
 *
 * @module markdown/html-inline
 */

import { documentText, memoizeDocumentScan } from './document-cache.js';
import { WidgetType } from '@codemirror/view';

// =============================================================================
// HTML Detection
// =============================================================================

/**
 * Regex to match HTML tags (opening, closing, self-closing, and comments)
 * Matches: <tag>, </tag>, <tag />, <tag attr="value">, <!-- comment -->
 *
 * MRMD special comments use <!--! ... !--> and are intentionally excluded
 * here so they can be handled by the comment-syntax extension instead of
 * being rendered away as invisible HTML comments.
 */
const HTML_TAG_REGEX = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^>]*)?\/?>|<!--(?!\!)[\s\S]*?-->/g;

/**
 * Regex to match complete HTML elements (opening + content + closing)
 * or self-closing tags. Handles nested tags of the same type.
 */
const HTML_ELEMENT_PATTERNS = [
  // Self-closing tags
  /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(?:\s+[^>]*)?\/?\s*>/gi,
  // HTML comments (excluding MRMD special comments: <!--! ... !-->)
  /<!--(?!\!)[\s\S]*?-->/g,
  // Inline elements with content (non-greedy, handles simple nesting)
  /<(span|strong|em|b|i|u|s|mark|small|sub|sup|kbd|code|abbr|cite|dfn|q|time|var|samp|data|ruby|rt|rp|bdi|bdo|ins|del)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi,
];

/**
 * Check if text contains HTML elements
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsHtml(text) {
  return HTML_TAG_REGEX.test(text);
}

/**
 * Extract HTML elements and entities from text with their positions
 *
 * @param {string} text - Text to scan
 * @returns {Array<{start: number, end: number, html: string, tag: string}>}
 */
export function extractHtmlElements(text) {
  const results = [];
  const seen = new Set(); // Avoid duplicates from overlapping patterns
  let match;

  // Match HTML entities: &name; or &#123; or &#x1F600;
  // Named entities: &copy; &mdash; &hearts; &nbsp; etc.
  // Numeric entities: &#123; &#8212;
  // Hex entities: &#x1F600; &#xA9;
  const entityPattern = /&(?:#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;
  while ((match = entityPattern.exec(text)) !== null) {
    const key = `${match.index}-${match.index + match[0].length}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        start: match.index,
        end: match.index + match[0].length,
        html: match[0],
        tag: 'entity',
      });
    }
  }

  // Match self-closing and void elements
  const voidTags = /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(?:\s+[^>]*)?\/?\s*>/gi;

  while ((match = voidTags.exec(text)) !== null) {
    const key = `${match.index}-${match.index + match[0].length}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        start: match.index,
        end: match.index + match[0].length,
        html: match[0],
        tag: match[1].toLowerCase(),
      });
    }
  }

  // Match HTML comments, but leave MRMD special comments to comment-syntax
  const comments = /<!--(?!\!)[\s\S]*?-->/g;
  while ((match = comments.exec(text)) !== null) {
    const key = `${match.index}-${match.index + match[0].length}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        start: match.index,
        end: match.index + match[0].length,
        html: match[0],
        tag: 'comment',
      });
    }
  }

  // Match paired tags - use a more robust approach
  const pairedTagPattern = /<([a-zA-Z][a-zA-Z0-9]*)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/g;
  while ((match = pairedTagPattern.exec(text)) !== null) {
    const key = `${match.index}-${match.index + match[0].length}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        start: match.index,
        end: match.index + match[0].length,
        html: match[0],
        tag: match[1].toLowerCase(),
      });
    }
  }

  // Sort by position
  results.sort((a, b) => a.start - b.start);

  return results;
}

// =============================================================================
// Widget for Inline HTML
// =============================================================================

/**
 * Widget that renders inline HTML content
 */
export class DetailsBlockWidget extends WidgetType {
  constructor(summary, content, open = false) {
    super();
    this.summary = summary;
    this.content = content;
    this.open = open;
  }

  eq(other) {
    return this.summary === other.summary && this.content === other.content && this.open === other.open;
  }

  toDOM() {
    const details = document.createElement('details');
    details.className = 'cm-details-widget';
    details.open = this.open;

    const summary = document.createElement('summary');
    summary.className = 'cm-details-summary';
    summary.textContent = this.summary || 'Details';
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'cm-details-content';
    renderDetailsMarkdown(body, this.content);
    details.appendChild(body);

    return details;
  }

  ignoreEvent() {
    return false;
  }
}

// Text identity is shared by cursor/scroll transactions and changes on edits.
export const detailsBlocksInDocument = memoizeDocumentScan(doc => extractDetailsBlocks(documentText(doc)));

const DETAILS_BLOCK_RE = /<details\b([^>]*)>([\s\S]*?)<\/details>/gi;
const SUMMARY_RE = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i;

export function extractDetailsBlocks(text) {
  const results = [];
  DETAILS_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = DETAILS_BLOCK_RE.exec(text)) !== null) {
    const attrs = match[1] || '';
    const inner = match[2] || '';
    const summaryMatch = inner.match(SUMMARY_RE);
    const summary = stripHtml(summaryMatch?.[1] || 'Details').trim() || 'Details';
    const content = summaryMatch ? inner.replace(SUMMARY_RE, '').trim() : inner.trim();
    results.push({
      start: match.index,
      end: match.index + match[0].length,
      summary,
      content,
      open: /(?:^|\s)open(?:\s|=|$)/i.test(attrs),
    });
  }
  return results;
}

function renderDetailsMarkdown(container, markdown) {
  const text = String(markdown || '').trim();
  if (!text) return;

  const fenceRe = /```([\w-]*)\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let match;
  while ((match = fenceRe.exec(text)) !== null) {
    appendDetailsParagraphs(container, text.slice(lastIndex, match.index));

    const pre = document.createElement('pre');
    pre.className = 'cm-details-codeblock';
    if (match[1]) pre.dataset.language = match[1];
    const code = document.createElement('code');
    code.textContent = match[2];
    pre.appendChild(code);
    container.appendChild(pre);

    lastIndex = match.index + match[0].length;
  }
  appendDetailsParagraphs(container, text.slice(lastIndex));
}

function appendDetailsParagraphs(container, text) {
  for (const part of String(text || '').split(/\n{2,}/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const p = document.createElement('p');
    p.innerHTML = renderInlineMarkdownWithHtml(trimmed).replace(/\n/g, '<br>');
    container.appendChild(p);
  }
}

function stripHtml(text) {
  const div = document.createElement('div');
  div.innerHTML = String(text || '');
  return div.textContent || div.innerText || '';
}

export class InlineHtmlWidget extends WidgetType {
  /**
   * @param {string} html - Raw HTML string to render
   */
  constructor(html) {
    super();
    this.html = html;
  }

  eq(other) {
    return this.html === other.html;
  }

  toDOM() {
    const container = document.createElement('span');
    container.className = 'cm-inline-html';
    container.innerHTML = this.html;
    return container;
  }

  ignoreEvent() {
    return true;
  }
}

// =============================================================================
// HTML Rendering Utility
// =============================================================================

/**
 * Render text content that may contain HTML.
 * Returns an HTML string with HTML elements preserved and text escaped.
 *
 * @param {string} text - Text that may contain HTML
 * @returns {string} - HTML string safe for innerHTML
 */
export function renderTextWithHtml(text) {
  if (!text) return '';

  const elements = extractHtmlElements(text);

  if (elements.length === 0) {
    // No HTML found, just escape the text
    return escapeHtmlText(text);
  }

  // Build output by interleaving escaped text and raw HTML
  let result = '';
  let lastEnd = 0;

  for (const el of elements) {
    // Escape text before this element
    if (el.start > lastEnd) {
      result += escapeHtmlText(text.slice(lastEnd, el.start));
    }
    // Add raw HTML (not escaped)
    result += el.html;
    lastEnd = el.end;
  }

  // Escape any remaining text
  if (lastEnd < text.length) {
    result += escapeHtmlText(text.slice(lastEnd));
  }

  return result;
}

/**
 * Escape text for safe HTML insertion (but not HTML tags themselves)
 * Only escapes &, <, >, " when they're not part of HTML tags
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtmlText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Create a DOM element with HTML content rendered
 *
 * @param {string} text - Text that may contain HTML
 * @param {string} [tagName='span'] - Container element tag
 * @param {string} [className=''] - CSS class for container
 * @returns {HTMLElement}
 */
export function createHtmlElement(text, tagName = 'span', className = '') {
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  el.innerHTML = renderTextWithHtml(text);
  return el;
}

/**
 * Render inline markdown AND HTML together.
 * Processes markdown formatting (bold, italic, code, strikethrough)
 * while preserving HTML elements.
 *
 * @param {string} content - Text with potential markdown and HTML
 * @returns {string} - HTML string
 */
export function renderInlineMarkdownWithHtml(content) {
  if (!content) return '';

  // First, extract and protect HTML elements
  const elements = extractHtmlElements(content);
  const placeholders = new Map();
  let protected_content = content;

  // Replace HTML with placeholders
  // Process in reverse order to maintain positions
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    const placeholder = `__HTML_${i}__`;
    placeholders.set(placeholder, el.html);
    protected_content =
      protected_content.slice(0, el.start) +
      placeholder +
      protected_content.slice(el.end);
  }

  // Process images BEFORE escaping HTML (they contain special chars)
  // Match: ![alt](url) or ![alt](url "title")
  let html = protected_content.replace(
    /!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)/g,
    (match, alt, url, title) => {
      const escapedAlt = escapeHtmlText(alt);
      const escapedUrl = escapeHtmlText(url);
      const titleAttr = title ? ` title="${escapeHtmlText(title)}"` : '';
      return `<img src="${escapedUrl}" alt="${escapedAlt}"${titleAttr} class="cm-inline-img">`;
    }
  );

  // Extract and protect our generated img tags
  const imgTags = [];
  html = html.replace(/<img [^>]+>/g, (match) => {
    imgTags.push(match);
    return `__IMG_${imgTags.length - 1}__`;
  });

  // Now escape remaining text (but not placeholders)
  html = escapeHtmlText(html);

  // Restore img tags
  html = html.replace(/__IMG_(\d+)__/g, (_, index) => imgTags[parseInt(index)]);

  // Process markdown formatting
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Restore HTML elements from placeholders
  for (const [placeholder, originalHtml] of placeholders) {
    html = html.replace(placeholder, originalHtml);
  }

  return html;
}

export default {
  containsHtml,
  extractHtmlElements,
  renderTextWithHtml,
  renderInlineMarkdownWithHtml,
  createHtmlElement,
  InlineHtmlWidget,
  DetailsBlockWidget,
  extractDetailsBlocks,
};
