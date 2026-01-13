/**
 * Image Widget
 *
 * Renders images in the editor with support for:
 * - Inline images (embedded in text)
 * - Block images (standalone on a line) - uses stable layout pattern
 * - Reference-style images (![alt][ref] with [ref]: url definitions)
 *
 * Widgets:
 * - ImagePlaceholder: Compact placeholder shown when URL is missing/invalid
 * - ImageWidget: Inline image rendering
 * - BlockImageWidget: Block image with stable layout pattern (no jitter)
 *
 * @module markdown/widgets/image
 */

import { WidgetType } from '@codemirror/view';

// =============================================================================
// Link Definition Cache
// =============================================================================

/**
 * Cache for link definitions parsed from document.
 * Key: reference name (lowercase), Value: { url, title }
 * @type {Map<string, { url: string, title?: string }>}
 */
let linkDefinitionCache = new Map();

/**
 * Document content hash for cache invalidation
 * @type {string}
 */
let lastDocumentHash = '';

/**
 * Parse all link definitions from document content.
 * Format: [ref]: url "optional title"
 *
 * @param {string} content - Full document content
 * @returns {Map<string, { url: string, title?: string }>}
 */
export function parseLinkDefinitions(content) {
  const definitions = new Map();

  // Match: [ref]: url or [ref]: url "title" or [ref]: <url> "title"
  // Can span multiple lines if URL is on next line
  const regex = /^\[([^\]]+)\]:\s*<?([^\s>"]+)>?(?:\s+["'(]([^"')]+)["')])?/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const refName = match[1].toLowerCase();
    const url = match[2];
    const title = match[3];

    definitions.set(refName, { url, title });
  }

  return definitions;
}

/**
 * Update link definition cache if document changed.
 *
 * @param {string} content - Full document content
 */
export function updateLinkDefinitionCache(content) {
  // Simple hash based on length and sample characters
  const hash = `${content.length}-${content.charCodeAt(0) || 0}-${content.charCodeAt(Math.floor(content.length / 2)) || 0}`;

  if (hash !== lastDocumentHash) {
    linkDefinitionCache = parseLinkDefinitions(content);
    lastDocumentHash = hash;
  }
}

/**
 * Resolve a reference name to its URL.
 *
 * @param {string} refName - Reference name (case-insensitive)
 * @returns {{ url: string, title?: string } | null}
 */
export function resolveLinkReference(refName) {
  return linkDefinitionCache.get(refName.toLowerCase()) || null;
}

/**
 * Get the current link definition cache.
 * @returns {Map<string, { url: string, title?: string }>}
 */
export function getLinkDefinitionCache() {
  return linkDefinitionCache;
}

// =============================================================================
// Placeholder Widget (for missing URLs or editing state)
// =============================================================================

/**
 * Compact placeholder for image syntax.
 * Shows "🖼 alt-text" when:
 * - Cursor is on the image line (editing mode)
 * - URL is missing or invalid
 */
export class ImagePlaceholder extends WidgetType {
  /**
   * @param {string} alt - Alt text for the image
   * @param {string} url - Image URL (may be empty for reference-style)
   * @param {boolean} isLinked - Whether this is a linked image [![](img)](url)
   */
  constructor(alt, url, isLinked = false) {
    super();
    this.alt = alt;
    this.url = url;
    this.isLinked = isLinked;
  }

  eq(other) {
    return other.alt === this.alt && other.url === this.url && other.isLinked === this.isLinked;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-image-placeholder';

    // Determine icon based on URL type and link status
    let icon = this.isLinked ? '🔗🖼' : '🖼';
    if (this.url && this.url.startsWith('data:image/svg') || this.url?.endsWith('.svg')) {
      icon = this.isLinked ? '🔗◇' : '◇'; // SVG indicator
    } else if (this.url && this.url.startsWith('data:')) {
      icon = this.isLinked ? '🔗📷' : '📷'; // Embedded image
    }

    // Show icon + truncated alt text
    const displayText = this.alt || 'image';
    const truncated = displayText.length > 30
      ? displayText.slice(0, 30) + '…'
      : displayText;

    span.textContent = `${icon} ${truncated}`;
    span.title = this.isLinked
      ? `Linked Image: ${this.alt}\nClick to edit`
      : `Image: ${this.alt}\nClick to edit`;

    return span;
  }

  ignoreEvent() {
    return false;
  }
}

// =============================================================================
// Inline Image Widget
// =============================================================================

/**
 * Widget for rendering images inline (within text).
 * Used for images embedded in paragraphs, lists, etc.
 */
export class ImageWidget extends WidgetType {
  /**
   * @param {string} url - Image URL
   * @param {string} alt - Alt text for the image
   * @param {boolean} isLinked - Whether this is a linked image
   * @param {string} linkUrl - URL to link to (if isLinked)
   */
  constructor(url, alt, isLinked = false, linkUrl = '') {
    super();
    this.url = url;
    this.alt = alt;
    this.isLinked = isLinked;
    this.linkUrl = linkUrl;
  }

  eq(other) {
    return (
      other.url === this.url &&
      other.alt === this.alt &&
      other.isLinked === this.isLinked &&
      other.linkUrl === this.linkUrl
    );
  }

  toDOM() {
    const container = document.createElement('span');
    container.className = 'cm-image-inline cm-image-loading';

    const img = document.createElement('img');
    img.alt = this.alt;
    img.className = 'cm-image-inline-img';

    img.onload = () => {
      container.classList.remove('cm-image-loading');
      container.classList.add('cm-image-loaded');
    };

    img.onerror = () => {
      container.classList.remove('cm-image-loading');
      container.classList.add('cm-image-error');
      container.title = `Failed to load: ${this.url}`;
    };

    img.src = this.url;

    // Wrap in link if this is a linked image
    if (this.isLinked && this.linkUrl) {
      const link = document.createElement('a');
      link.href = this.linkUrl;
      link.className = 'cm-image-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.appendChild(img);
      container.appendChild(link);
    } else {
      container.appendChild(img);
    }

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

// =============================================================================
// Block Image Widget (Stable Layout Pattern)
// =============================================================================

/**
 * Widget for rendering block images (standalone on a line).
 * Uses the stable layout pattern to prevent jitter:
 * - Text line is hidden (transparent) but takes space
 * - Widget overlays with position: absolute
 *
 * Supports position modifiers:
 * - 'block' (default): centered, normal width
 * - 'right': float right, text wraps left
 * - 'left': float left, text wraps right
 * - 'wide': full-bleed, breaks out of content column
 * - 'small': thumbnail size
 *
 * This widget is placed AFTER the line that contains the image syntax.
 */
export class BlockImageWidget extends WidgetType {
  /**
   * @param {string} url - Image URL
   * @param {string} alt - Alt text for the image
   * @param {boolean} isLinked - Whether this is a linked image
   * @param {string} linkUrl - URL to link to (if isLinked)
   * @param {string} imageId - Unique identifier for the image (for eq comparison)
   * @param {string} position - Position modifier: 'block', 'right', 'left', 'wide', 'small'
   * @param {string} caption - Optional caption (from title attribute)
   */
  constructor(url, alt, isLinked = false, linkUrl = '', imageId = '', position = 'block', caption = '') {
    super();
    this.url = url;
    this.alt = alt;
    this.isLinked = isLinked;
    this.linkUrl = linkUrl;
    this.imageId = imageId;
    this.position = position;
    this.caption = caption;
  }

  eq(other) {
    // Compare by content, not by hidden state (following widget equality pattern)
    return (
      other.url === this.url &&
      other.alt === this.alt &&
      other.isLinked === this.isLinked &&
      other.linkUrl === this.linkUrl &&
      other.imageId === this.imageId &&
      other.position === this.position &&
      other.caption === this.caption
    );
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = `cm-image-block cm-image-pos-${this.position}`;
    container.dataset.imageId = this.imageId;
    container.dataset.position = this.position;

    const wrapper = document.createElement('div');
    wrapper.className = 'cm-image-block-wrapper cm-image-loading';

    const img = document.createElement('img');
    img.alt = this.alt;
    img.className = 'cm-image-block-img';

    img.onload = () => {
      wrapper.classList.remove('cm-image-loading');
      wrapper.classList.add('cm-image-loaded');
      wrapper.innerHTML = '';

      // Wrap in link if this is a linked image
      if (this.isLinked && this.linkUrl) {
        const link = document.createElement('a');
        link.href = this.linkUrl;
        link.className = 'cm-image-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.appendChild(img);
        wrapper.appendChild(link);
      } else {
        wrapper.appendChild(img);
      }

      // Add caption if provided (from title) or fall back to alt text
      const captionText = this.caption || this.alt;
      if (captionText) {
        const caption = document.createElement('div');
        caption.className = 'cm-image-caption';
        caption.textContent = captionText;
        container.appendChild(caption);
      }
    };

    img.onerror = () => {
      wrapper.classList.remove('cm-image-loading');
      wrapper.classList.add('cm-image-error');
      wrapper.innerHTML = `<span class="cm-image-error-text">Failed to load image: ${this.alt || this.url}</span>`;
    };

    // Set loading text
    wrapper.textContent = 'Loading...';

    img.src = this.url;
    container.appendChild(wrapper);

    return container;
  }

  ignoreEvent() {
    return true; // Don't capture events - allow clicking through to edit
  }
}

// =============================================================================
// Position Modifiers
// =============================================================================

/**
 * Image position types.
 * @typedef {'block' | 'right' | 'left' | 'wide' | 'small'} ImagePosition
 */

/**
 * Position modifier characters (placed after closing parenthesis).
 * Syntax: ![alt](url)> for float-right, etc.
 *
 * >  → float right (text wraps on left)
 * <  → float left (text wraps on right)
 * ^  → wide/full-bleed (breaks out of content column)
 * _  → small/inline (thumbnail size)
 */
export const POSITION_MODIFIERS = {
  '>': 'right',
  '<': 'left',
  '^': 'wide',
  '_': 'small',
};

/**
 * Parse position modifier from character.
 *
 * @param {string} char - The character after the image syntax
 * @returns {ImagePosition}
 */
export function parsePositionModifier(char) {
  return POSITION_MODIFIERS[char] || 'block';
}

/**
 * Check if a character is a position modifier.
 *
 * @param {string} char - Character to check
 * @returns {boolean}
 */
export function isPositionModifier(char) {
  return char in POSITION_MODIFIERS;
}

// =============================================================================
// Parsing Utilities
// =============================================================================

/**
 * Parse image markdown syntax.
 *
 * @param {string} content - Raw content that might contain image markdown
 * @returns {{ src: string, alt: string, title?: string } | null}
 */
export function parseImageMarkdown(content) {
  // Match ![alt](url) or ![alt](url "title")
  const match = content.match(/!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)/);
  if (match) {
    return {
      alt: match[1],
      src: match[2],
      title: match[3],
    };
  }
  return null;
}

/**
 * Check if a line contains only an image (block image).
 * Allows leading/trailing whitespace, optional link wrapper, and position modifier.
 *
 * @param {string} lineText - The text of the line
 * @returns {boolean}
 */
export function isBlockImage(lineText) {
  const trimmed = lineText.trim();

  // Check for standalone image with optional position modifier: ![alt](url) or ![alt](url)>
  if (/^!\[[^\]]*\]\([^)]+\)[><^_]?$/.test(trimmed)) {
    return true;
  }

  // Check for image with title and optional modifier: ![alt](url "title")>
  if (/^!\[[^\]]*\]\([^)]+\s+"[^"]*"\)[><^_]?$/.test(trimmed)) {
    return true;
  }

  // Check for linked image with optional modifier: [![alt](img)](url)>
  if (/^\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)[><^_]?$/.test(trimmed)) {
    return true;
  }

  // Check for reference-style image with optional modifier: ![alt][ref]>
  if (/^!\[[^\]]*\]\[[^\]]*\][><^_]?$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Extract position modifier from end of line if present.
 *
 * @param {string} lineText - The text of the line
 * @returns {{ position: ImagePosition, hasModifier: boolean }}
 */
export function extractPositionFromLine(lineText) {
  const trimmed = lineText.trim();
  const lastChar = trimmed[trimmed.length - 1];

  if (isPositionModifier(lastChar)) {
    return {
      position: parsePositionModifier(lastChar),
      hasModifier: true,
    };
  }

  return {
    position: 'block',
    hasModifier: false,
  };
}

/**
 * Generate a unique image ID from position.
 *
 * @param {number} from - Start position
 * @returns {string}
 */
export function generateImageId(from) {
  return `img-${from}`;
}
