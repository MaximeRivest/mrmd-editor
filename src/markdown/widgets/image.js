/**
 * Image Widget
 *
 * Renders images inline in the editor.
 *
 * Two widgets:
 * - ImagePlaceholder: Compact placeholder shown on blur (e.g., "🖼 alt-text")
 * - ImageWidget: The actual rendered image
 *
 * @module markdown/widgets/image
 */

import { WidgetType } from '@codemirror/view';

/**
 * Compact placeholder for image syntax.
 * Shows "🖼 alt-text" when cursor is not on the image line.
 */
export class ImagePlaceholder extends WidgetType {
  /**
   * @param {string} alt - Alt text for the image
   * @param {string} url - Image URL
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
    if (this.url.startsWith('data:image/svg') || this.url.endsWith('.svg')) {
      icon = this.isLinked ? '🔗◇' : '◇'; // SVG indicator
    } else if (this.url.startsWith('data:')) {
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

/**
 * Widget for rendering the actual image.
 */
export class ImageWidget extends WidgetType {
  /**
   * @param {string} url - Image URL
   * @param {string} alt - Alt text for the image
   * @param {boolean} isLinked - Whether this is a linked image
   */
  constructor(url, alt, isLinked = false) {
    super();
    this.url = url;
    this.alt = alt;
    this.isLinked = isLinked;
  }

  eq(other) {
    return other.url === this.url && other.alt === this.alt && other.isLinked === this.isLinked;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-image-widget cm-image-loading';
    if (this.isLinked) {
      container.classList.add('cm-image-linked');
    }
    container.textContent = 'Loading image...';

    const img = document.createElement('img');
    img.alt = this.alt;

    img.onload = () => {
      container.className = 'cm-image-widget';
      if (this.isLinked) {
        container.classList.add('cm-image-linked');
      }
      container.textContent = '';
      container.appendChild(img);
    };

    img.onerror = () => {
      container.className = 'cm-image-widget cm-image-error';
      container.textContent = `Failed to load: ${this.alt || 'image'}`;
    };

    img.src = this.url;
    return container;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Parse image markdown syntax.
 *
 * @param {string} content - Raw content that might contain image markdown
 * @returns {{ src: string, alt: string } | null}
 */
export function parseImageMarkdown(content) {
  // Match ![alt](url) or ![alt](url "title")
  const match = content.match(/!\[([^\]]*)\]\(([^)"]+)(?:\s+"[^"]*")?\)/);
  if (match) {
    return {
      alt: match[1],
      src: match[2],
    };
  }
  return null;
}
