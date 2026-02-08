/**
 * Frontmatter Widget
 *
 * Renders YAML frontmatter as a styled document header.
 * Shows title, subtitle, author, date, and abstract.
 * Session/runtime config keys are skipped (handled by runtime-codelens).
 *
 * @module markdown/widgets/frontmatter
 */

import { WidgetType } from '@codemirror/view';
import yaml from 'yaml';

// Keys that are handled by runtime-codelens (not rendered here)
const RUNTIME_KEYS = new Set([
  'session', 'python', 'bash', 'node', 'julia', 'r', 'shell', 'term',
]);

const TITLE_COMMIT_EVENT = 'mrmd:frontmatter-title-commit';

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const css = `
    .cm-frontmatter-widget {
      padding: 20px 0 16px;
      margin-bottom: 4px;
      border-bottom: 1px solid var(--frontmatter-border, rgba(128, 128, 128, 0.15));
      line-height: 1.4;
    }

    .cm-frontmatter-title-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin: 0 0 4px;
    }

    .cm-frontmatter-title-input {
      flex: 1;
      font-size: 2em;
      font-weight: 700;
      color: var(--text-primary, var(--text, #e0e0e0));
      margin: 0;
      padding: 0;
      width: 100%;
      border: none;
      outline: none;
      background: transparent;
      line-height: 1.15;
      letter-spacing: -0.02em;
      font-family: inherit;
    }

    .cm-frontmatter-title-input::placeholder {
      color: var(--text-dim, #808080);
      opacity: 0.7;
    }

    .cm-frontmatter-title-input:focus {
      text-decoration: underline;
      text-underline-offset: 5px;
      text-decoration-color: var(--accent, #4a9eff);
    }

    .cm-frontmatter-title-hint {
      font-size: 0.7em;
      color: var(--text-dim, #808080);
      white-space: nowrap;
      opacity: 0;
      transition: opacity 120ms ease;
    }

    .cm-frontmatter-title-row:focus-within .cm-frontmatter-title-hint {
      opacity: 0.8;
    }

    .cm-frontmatter-subtitle {
      font-size: 1.25em;
      font-weight: 400;
      color: var(--text-secondary, var(--text-muted, #a0a0a0));
      margin: 0 0 12px;
      line-height: 1.3;
    }

    .cm-frontmatter-authors {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      margin-bottom: 6px;
    }

    .cm-frontmatter-author {
      font-size: 0.9em;
      color: var(--text, #e0e0e0);
    }

    .cm-frontmatter-author-affiliation {
      font-size: 0.8em;
      color: var(--text-dim, #808080);
      margin-left: 2px;
    }

    .cm-frontmatter-date {
      font-size: 0.85em;
      color: var(--text-dim, #808080);
      margin-bottom: 4px;
    }

    .cm-frontmatter-abstract {
      margin-top: 12px;
      padding: 10px 14px;
      border-left: 3px solid var(--accent, #4a9eff);
      font-size: 0.9em;
      color: var(--text-secondary, var(--text-muted, #a0a0a0));
      line-height: 1.6;
      background: var(--frontmatter-abstract-bg, rgba(128, 128, 128, 0.04));
      border-radius: 0 4px 4px 0;
    }

    .cm-frontmatter-keywords {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .cm-frontmatter-keyword {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.78em;
      background: var(--frontmatter-keyword-bg, rgba(128, 128, 128, 0.12));
      color: var(--text-dim, #808080);
    }

    .cm-frontmatter-empty {
      padding: 4px 0;
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Extract author name(s) from Quarto's various author formats.
 * Supports: string, array of strings, array of objects with name/given/family.
 */
function extractAuthors(authorVal) {
  if (!authorVal) return [];
  if (typeof authorVal === 'string') return [{ name: authorVal }];
  if (Array.isArray(authorVal)) {
    return authorVal.map(a => {
      if (typeof a === 'string') return { name: a };
      if (a && typeof a === 'object') {
        const name = a.name || [a.given, a.family].filter(Boolean).join(' ') || 'Unknown';
        const affiliation = extractAffiliation(a.affiliation);
        return { name, affiliation };
      }
      return { name: String(a) };
    });
  }
  if (typeof authorVal === 'object') {
    const name = authorVal.name || [authorVal.given, authorVal.family].filter(Boolean).join(' ');
    const affiliation = extractAffiliation(authorVal.affiliation);
    return [{ name, affiliation }];
  }
  return [];
}

function extractAffiliation(aff) {
  if (!aff) return '';
  if (typeof aff === 'string') return aff;
  if (Array.isArray(aff)) {
    return aff.map(a => typeof a === 'string' ? a : a?.name || '').filter(Boolean).join(', ');
  }
  if (typeof aff === 'object') return aff.name || '';
  return '';
}

/**
 * Format a date string for display.
 */
function formatDate(dateVal) {
  if (!dateVal) return '';
  const str = String(dateVal);
  if (str.toLowerCase() === 'today') {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }
  return str;
}

/**
 * Extract keywords from various formats.
 */
function extractKeywords(kw) {
  if (!kw) return [];
  if (Array.isArray(kw)) return kw.map(String);
  if (typeof kw === 'string') return kw.split(/[,;]\s*/).filter(Boolean);
  return [];
}

function escapeYamlDoubleQuoted(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function replaceFrontmatterTitleInBlock(frontmatterBlock, title) {
  if (!frontmatterBlock || typeof frontmatterBlock !== 'string') return frontmatterBlock;
  const eol = frontmatterBlock.includes('\r\n') ? '\r\n' : '\n';
  if (!frontmatterBlock.startsWith(`---${eol}`) || !frontmatterBlock.endsWith(`${eol}---`)) {
    return frontmatterBlock;
  }

  const openingLen = `---${eol}`.length;
  const closingLen = `${eol}---`.length;
  const body = frontmatterBlock.slice(openingLen, frontmatterBlock.length - closingLen);
  const escapedTitle = escapeYamlDoubleQuoted(title.trim());

  let nextBody;
  if (/^\s*title\s*:/mi.test(body)) {
    nextBody = body.replace(/^\s*title\s*:\s*.*$/mi, `title: "${escapedTitle}"`);
  } else if (!body.trim()) {
    nextBody = `title: "${escapedTitle}"`;
  } else {
    nextBody = `title: "${escapedTitle}"${eol}${body}`;
  }

  return `---${eol}${nextBody}${eol}---`;
}

/**
 * Frontmatter WidgetType for CodeMirror 6.
 * Renders document metadata as a styled header block.
 */
export class FrontmatterWidget extends WidgetType {
  constructor(yamlContent, contentHash, sourceFrom = null, sourceTo = null) {
    super();
    this.yamlContent = yamlContent;
    this.contentHash = contentHash;
    this.sourceFrom = sourceFrom;
    this.sourceTo = sourceTo;
    this.parsed = null;

    try {
      this.parsed = yaml.parse(yamlContent);
    } catch (e) {
      // Invalid YAML — will render empty
    }
  }

  eq(other) {
    return other.contentHash === this.contentHash;
  }

  commitTitle(view, nextTitle) {
    if (
      !view ||
      typeof this.sourceFrom !== 'number' ||
      typeof this.sourceTo !== 'number'
    ) {
      return false;
    }

    const trimmed = String(nextTitle || '').trim();
    if (!trimmed) return false;

    const currentBlock = view.state.doc.sliceString(this.sourceFrom, this.sourceTo);
    const nextBlock = replaceFrontmatterTitleInBlock(currentBlock, trimmed);
    if (!nextBlock || nextBlock === currentBlock) return false;

    view.dispatch({
      changes: {
        from: this.sourceFrom,
        to: this.sourceTo,
        insert: nextBlock,
      },
    });

    view.dom.dispatchEvent(new CustomEvent(TITLE_COMMIT_EVENT, {
      bubbles: true,
      detail: { title: trimmed },
    }));

    return true;
  }

  toDOM(view) {
    injectStyles();

    const container = document.createElement('div');
    container.className = 'cm-frontmatter-widget';

    const p = this.parsed;
    if (!p || typeof p !== 'object') {
      container.classList.add('cm-frontmatter-empty');
      return container;
    }

    // Check if there's any renderable metadata (skip runtime-only frontmatter)
    const hasMetadata = p.title || p.subtitle || p.author || p.date || p.abstract || p.keywords;
    if (!hasMetadata) {
      container.classList.add('cm-frontmatter-empty');
      return container;
    }

    const titleRow = document.createElement('div');
    titleRow.className = 'cm-frontmatter-title-row';

    const titleInput = document.createElement('input');
    titleInput.className = 'cm-frontmatter-title-input';
    titleInput.type = 'text';
    titleInput.placeholder = 'Untitled';
    titleInput.value = p.title ? String(p.title) : '';
    titleInput.setAttribute('aria-label', 'Frontmatter title');

    const commitTitle = () => {
      const nextTitle = titleInput.value.trim();
      if (!nextTitle) {
        titleInput.value = p.title ? String(p.title) : '';
        return;
      }
      if (nextTitle === (p.title ? String(p.title).trim() : '')) return;
      const committed = this.commitTitle(view, nextTitle);
      if (!committed) {
        titleInput.value = p.title ? String(p.title) : '';
      }
    };

    titleInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        commitTitle();
        view.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        titleInput.value = p.title ? String(p.title) : '';
        titleInput.blur();
        view.focus();
      }
    });

    titleInput.addEventListener('blur', commitTitle);
    titleInput.addEventListener('mousedown', (event) => event.stopPropagation());
    titleInput.addEventListener('click', (event) => event.stopPropagation());
    titleInput.addEventListener('focus', () => titleInput.select());

    const hint = document.createElement('span');
    hint.className = 'cm-frontmatter-title-hint';
    hint.textContent = 'Enter to commit';

    titleRow.appendChild(titleInput);
    titleRow.appendChild(hint);
    container.appendChild(titleRow);

    // Subtitle
    if (p.subtitle) {
      const el = document.createElement('div');
      el.className = 'cm-frontmatter-subtitle';
      el.textContent = String(p.subtitle);
      container.appendChild(el);
    }

    // Authors
    const authors = extractAuthors(p.author);
    if (authors.length > 0) {
      const authorsDiv = document.createElement('div');
      authorsDiv.className = 'cm-frontmatter-authors';

      for (const author of authors) {
        const span = document.createElement('span');
        span.className = 'cm-frontmatter-author';
        span.textContent = author.name;

        if (author.affiliation) {
          const aff = document.createElement('span');
          aff.className = 'cm-frontmatter-author-affiliation';
          aff.textContent = `(${author.affiliation})`;
          span.appendChild(aff);
        }

        authorsDiv.appendChild(span);
      }
      container.appendChild(authorsDiv);
    }

    // Date
    if (p.date) {
      const el = document.createElement('div');
      el.className = 'cm-frontmatter-date';
      el.textContent = formatDate(p.date);
      container.appendChild(el);
    }

    // Abstract
    if (p.abstract) {
      const el = document.createElement('div');
      el.className = 'cm-frontmatter-abstract';
      el.textContent = String(p.abstract);
      container.appendChild(el);
    }

    // Keywords
    const keywords = extractKeywords(p.keywords);
    if (keywords.length > 0) {
      const kwContainer = document.createElement('div');
      kwContainer.className = 'cm-frontmatter-keywords';
      for (const kw of keywords) {
        const badge = document.createElement('span');
        badge.className = 'cm-frontmatter-keyword';
        badge.textContent = kw.trim();
        kwContainer.appendChild(badge);
      }
      container.appendChild(kwContainer);
    }

    return container;
  }

  ignoreEvent() {
    return false;
  }
}
