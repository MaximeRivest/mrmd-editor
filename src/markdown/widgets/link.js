/**
 * Link widgets for rendering clickable links in markdown.
 *
 * Includes:
 * - WikiLinkWidget: [[internal-link]] style links
 * - ExternalLinkWidget: [text](https://...) style links
 * - FileLinkWidget: [text](./relative/path) style links
 *
 * @module markdown/widgets/link
 */

import { WidgetType } from '@codemirror/view';
import { renderTextWithHtml } from '../html-inline.js';

// #region WIKI_LINK_WIDGET

/**
 * Widget for rendering [[wiki-links]].
 *
 * Dispatches a custom 'wiki-link-navigate' event when clicked,
 * allowing the host application to handle navigation.
 */
export class WikiLinkWidget extends WidgetType {
  /**
   * @param {string} target - The link target (e.g., 'installation', 'setup/config')
   * @param {string} displayText - Text to display (from [[target|display]] or derived from target)
   * @param {boolean} [exists=true] - Whether the target exists (for broken link styling)
   */
  constructor(target, displayText, exists = true) {
    super();
    this.target = target;
    this.displayText = displayText;
    this.exists = exists;
  }

  eq(other) {
    return (
      this.target === other.target &&
      this.displayText === other.displayText &&
      this.exists === other.exists
    );
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = this.exists ? 'cm-wiki-link' : 'cm-wiki-link cm-broken-link';
    span.innerHTML = renderTextWithHtml(this.displayText);
    span.setAttribute('data-target', this.target);

    // Click handler - dispatch custom event for host app
    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      view.dom.dispatchEvent(
        new CustomEvent('wiki-link-navigate', {
          detail: { target: this.target },
          bubbles: true,
        })
      );
    });

    // Prevent editor from losing focus
    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    return span;
  }

  ignoreEvent() {
    return false; // Allow click events
  }
}

// #endregion WIKI_LINK_WIDGET

// #region EXTERNAL_LINK_WIDGET

/**
 * Widget for rendering external links [text](https://...).
 *
 * Opens in a new browser tab.
 */
export class ExternalLinkWidget extends WidgetType {
  /**
   * @param {string} url - The URL to open
   * @param {string} text - Display text
   */
  constructor(url, text) {
    super();
    this.url = url;
    this.text = text;
  }

  eq(other) {
    return this.url === other.url && this.text === other.text;
  }

  toDOM() {
    const link = document.createElement('a');
    link.className = 'cm-external-link';
    link.href = this.url;
    link.innerHTML = renderTextWithHtml(this.text);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    // Prevent editor from losing focus on mousedown
    // but allow the click to propagate to the <a> tag
    link.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    return link;
  }

  ignoreEvent() {
    return false; // Allow click events
  }
}

// #endregion EXTERNAL_LINK_WIDGET

// #region FILE_LINK_WIDGET

/**
 * Widget for rendering relative file links [text](./path).
 *
 * Dispatches a custom 'file-link-navigate' event when clicked,
 * allowing the host application to handle navigation.
 */
export class FileLinkWidget extends WidgetType {
  /**
   * @param {string} path - Relative file path
   * @param {string} text - Display text
   */
  constructor(path, text) {
    super();
    this.path = path;
    this.text = text;
  }

  eq(other) {
    return this.path === other.path && this.text === other.text;
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'cm-file-link';
    span.innerHTML = renderTextWithHtml(this.text);
    span.setAttribute('data-path', this.path);

    // Click handler - dispatch custom event for host app
    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      view.dom.dispatchEvent(
        new CustomEvent('file-link-navigate', {
          detail: { path: this.path },
          bubbles: true,
        })
      );
    });

    // Prevent editor from losing focus
    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    return span;
  }

  ignoreEvent() {
    return false; // Allow click events
  }
}

// #endregion FILE_LINK_WIDGET

// #region HELPERS

/**
 * Determine link type from URL.
 *
 * @param {string} url
 * @returns {'external' | 'file' | 'anchor'}
 */
export function getLinkType(url) {
  if (!url) return 'file';

  // External URLs
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:')
  ) {
    return 'external';
  }

  // Anchor links
  if (url.startsWith('#')) {
    return 'anchor';
  }

  // Everything else is a file link
  return 'file';
}

/**
 * Check if a URL is external (http/https/mailto/tel).
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isExternalUrl(url) {
  return getLinkType(url) === 'external';
}

/**
 * Derive display text from a wiki-link target.
 * Converts 'getting-started' to 'Getting Started'.
 *
 * @param {string} target
 * @returns {string}
 */
export function wikiLinkDisplayText(target) {
  if (!target) return '';

  // Remove path prefix (keep last segment)
  const name = target.split('/').pop();

  // Convert kebab-case/snake_case to Title Case
  return name
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// #endregion HELPERS
