/**
 * Output Widget
 *
 * CodeMirror widget that renders output blocks with ANSI color support.
 * Uses line decorations to hide raw text + positioned widget for colored display.
 *
 * Approach (from prototype):
 * 1. Add line decorations to hide the raw output text via CSS
 * 2. Add widget positioned after opening fence that shows colored HTML
 * 3. Don't use Decoration.replace (causes parser issues)
 *
 * ## IMPORTANT: CSS Specificity Gotcha
 *
 * When hiding lines with `color: transparent`, you MUST exclude the widget:
 *
 *   WRONG: `.cm-output-line-hidden * { color: transparent !important; }`
 *   RIGHT: `.cm-output-line-hidden > *:not(.cm-output-widget) { color: transparent !important; }`
 *
 * The widget is positioned INSIDE a hidden line (after the opening fence).
 * If you use `*` selector, it makes all widget content transparent too!
 * This is a common mistake - the widget appears as an empty dark box.
 *
 * Always add explicit color restoration for widget content:
 *   `.cm-output-widget pre { color: var(--output-text, #e0e0e0); }`
 *
 * @module output-widget
 */

import { WidgetType, Decoration, ViewPlugin, EditorView } from '@codemirror/view';
import { Facet, Annotation } from '@codemirror/state';
import { terminalToHtml, hasAnsi, stripAnsi, ansiStyles, parseAnsiDecorations } from './terminal.js';

// Regex to match ANSI escape sequences (same as in terminal.js)
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Zero-width widget used to completely hide ANSI escape sequences.
 * Using Decoration.replace with this widget removes the escape codes
 * from rendering, including CodeMirror's control character display.
 */
class HiddenWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-ansi-hidden';
    span.style.display = 'none';
    return span;
  }

  eq() {
    return true; // All hidden widgets are equal
  }

  ignoreEvent() {
    return true;
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function tryParseJsonOutput(content) {
  if (!content || hasAnsi(content)) return null;
  if (content.length > 250_000) return null; // Guard large payloads

  const trimmed = content.trim();
  if (!trimmed) return null;
  const looksLikeObjectOrArray =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (!looksLikeObjectOrArray) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function formatJsonPrimitive(value) {
  const type = jsonType(value);
  if (type === 'string') return `"${value}"`;
  if (type === 'number' || type === 'boolean' || type === 'null') return String(value);
  if (type === 'undefined') return 'undefined';
  return String(value);
}

function summarizeJson(value) {
  const type = jsonType(value);
  if (type === 'array') return `Array(${value.length})`;
  if (type === 'object') return `Object(${Object.keys(value).length})`;
  return type;
}

function previewJsonValue(value) {
  const type = jsonType(value);
  if (type === 'array') {
    const sample = value.slice(0, 3).map(v => formatJsonPrimitive(v)).join(', ');
    return `[${sample}${value.length > 3 ? ', …' : ''}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value);
    return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
  }
  return formatJsonPrimitive(value);
}

function buildJsonTreeNode(key, value, depth = 0) {
  const type = jsonType(value);
  const isExpandable = type === 'array' || type === 'object';

  if (!isExpandable) {
    const row = document.createElement('div');
    row.className = 'cm-json-node cm-json-node-leaf';

    if (key !== null) {
      const keyEl = document.createElement('span');
      keyEl.className = 'cm-json-key';
      keyEl.textContent = String(key);
      row.appendChild(keyEl);
    }

    const valueEl = document.createElement('span');
    valueEl.className = `cm-json-value cm-json-type-${type}`;
    valueEl.textContent = formatJsonPrimitive(value);
    row.appendChild(valueEl);
    return row;
  }

  const details = document.createElement('details');
  details.className = 'cm-json-node cm-json-node-expandable';
  details.open = depth < 1;

  const summary = document.createElement('summary');
  summary.className = 'cm-json-node-summary';

  if (key !== null) {
    const keyEl = document.createElement('span');
    keyEl.className = 'cm-json-key';
    keyEl.textContent = String(key);
    summary.appendChild(keyEl);
  }

  const meta = document.createElement('span');
  meta.className = 'cm-json-meta';
  meta.textContent = summarizeJson(value);
  summary.appendChild(meta);

  const preview = document.createElement('span');
  preview.className = 'cm-json-preview';
  preview.textContent = previewJsonValue(value);
  summary.appendChild(preview);

  details.appendChild(summary);

  const children = document.createElement('div');
  children.className = 'cm-json-children';

  const entries = Array.isArray(value)
    ? value.map((v, i) => [`[${i}]`, v])
    : Object.entries(value);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cm-json-empty';
    empty.textContent = Array.isArray(value) ? '[]' : '{}';
    children.appendChild(empty);
  } else {
    for (const [childKey, childValue] of entries) {
      children.appendChild(buildJsonTreeNode(childKey, childValue, depth + 1));
    }
  }

  details.appendChild(children);
  return details;
}

function stripCssComments(css) {
  return String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseCssSelectors(css) {
  const cleaned = stripCssComments(css);
  const selectors = [];
  let ruleCount = 0;
  const ruleRegex = /([^{}]+)\{/g;
  let match;

  while ((match = ruleRegex.exec(cleaned)) !== null) {
    const selectorGroup = match[1].trim();
    if (!selectorGroup || selectorGroup.startsWith('@')) continue;

    let addedInRule = 0;
    for (const selector of selectorGroup.split(',')) {
      const trimmed = selector.trim();
      if (!trimmed) continue;
      if (trimmed === 'from' || trimmed === 'to' || /^\d+%$/.test(trimmed)) continue;
      selectors.push(trimmed);
      addedInRule++;
    }
    if (addedInRule > 0) ruleCount++;
  }

  return { selectors, ruleCount };
}

function analyzeCssAgainstDocument(css, scope = 'all') {
  return analyzeCssAgainstRoots(css, getCssQueryRoots(scope), scope);
}

function getCssQueryRoots(scope = 'all') {
  const roots = [];
  if (scope === 'all' || scope === 'main') {
    roots.push(document);
  }
  try {
    const artifactIframe = document.getElementById('artifact-iframe');
    const artifactDoc = artifactIframe?.contentDocument || artifactIframe?.contentWindow?.document;
    if (artifactDoc && (scope === 'all' || scope === 'artifact')) {
      roots.push(artifactDoc);
    }
  } catch {
    // Cross-origin or unavailable iframe; ignore.
  }
  return roots;
}

function analyzeCssAgainstRoots(css, queryRoots, scope = 'all') {
  const { selectors, ruleCount } = parseCssSelectors(css);
  const uniqueSelectors = Array.from(new Set(selectors));
  const maxSelectors = 24;
  const visibleSelectors = uniqueSelectors.slice(0, maxSelectors);

  const selectorMatches = visibleSelectors.map((selector) => {
    let count = 0;
    try {
      for (const root of queryRoots) {
        count += root.querySelectorAll(selector).length;
      }
      return { selector, count, valid: true };
    } catch {
      return { selector, count: 0, valid: false };
    }
  });

  const matchedSelectors = selectorMatches.filter((s) => s.valid && s.count > 0).length;
  const totalMatches = selectorMatches
    .filter((s) => s.valid)
    .reduce((acc, s) => acc + s.count, 0);

  return {
    ruleCount,
    totalSelectors: uniqueSelectors.length,
    selectorMatches,
    matchedSelectors,
    totalMatches,
    scope,
    rootsReady: queryRoots.length > 0,
    truncated: uniqueSelectors.length > maxSelectors,
  };
}

// =============================================================================
// Height Cache for Stable Layout (prevents jitter when editing output blocks)
// =============================================================================

/**
 * Cache of output widget heights, keyed by block start position.
 * Used to pad raw markdown to prevent layout shift.
 */
const outputHeightCache = new Map();

/**
 * Cache the height of an output widget
 */
function cacheOutputHeight(blockStart, height) {
  if (height > 0) {
    outputHeightCache.set(blockStart, height);
  }
}

/**
 * Get cached height for an output block
 */
function getCachedOutputHeight(blockStart) {
  return outputHeightCache.get(blockStart);
}

// Facet to provide awareness system to the output widget
export const outputWidgetAwarenessFacet = Facet.define({
  combine: values => values[values.length - 1] || null
});

// Annotation to mark awareness-triggered updates (following y-codemirror.next pattern)
const outputWidgetAwarenessAnnotation = Annotation.define();

// Store pending stdin requests keyed by execId
// Key: execId, Value: { prompt, password, execId, cellIndex, resolve, reject, _currentValue }
export const pendingStdinRequests = new Map();

// #region WIDGET

/**
 * Widget for rendering output with ANSI colors
 */
class OutputWidget extends WidgetType {
  /**
   * @param {string} content - Output content with ANSI codes
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   * @param {number} blockStart - Document position where this output block starts
   * @param {string|null} execId - Execution ID for this output block
   */
  constructor(content, hidden = false, blockStart = 0, execId = null) {
    super();
    this.content = content;
    this.hidden = hidden;
    this.blockStart = blockStart;
    this.execId = execId;
  }

  eq(other) {
    return other.content === this.content && other.hidden === this.hidden && other.blockStart === this.blockStart && other.execId === this.execId;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    // Store block position for backwards compat
    container.dataset.outputBlockStart = String(this.blockStart);
    // Store execId for stdin input injection - this is the key identifier
    if (this.execId) {
      container.dataset.execId = this.execId;
    }

    // Render with ANSI colors
    const html = terminalToHtml(this.content);
    container.innerHTML = `<pre class="cm-output-content">${html}</pre>`;

    // Cache height for stable layout (prevents jitter when editing)
    // Only cache when not hidden (widget is visible and has real height)
    if (!this.hidden) {
      const blockStart = this.blockStart;
      requestAnimationFrame(() => {
        // Cache the widget's container height
        if (container.offsetHeight > 0) {
          cacheOutputHeight(blockStart, container.offsetHeight);
        }
      });
    }

    // Copy on click
    container.title = 'Click to copy output';
    const handleCopy = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Copy plain text (without ANSI codes)
      const plainText = stripAnsi(this.content);
      navigator.clipboard.writeText(plainText).then(() => {
        const feedback = document.createElement('div');
        feedback.className = 'cm-output-copy-feedback';
        feedback.textContent = 'Copied!';
        container.appendChild(feedback);
        setTimeout(() => feedback.remove(), 1500);
      });
    };
    container.onclick = handleCopy;

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Widget for empty output blocks - shows subtle "No output" indicator
 */
class EmptyOutputWidget extends WidgetType {
  /**
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   * @param {number} blockStart - Document position where this output block starts
   * @param {string|null} execId - Execution ID for this output block
   */
  constructor(hidden = false, blockStart = 0, execId = null) {
    super();
    this.hidden = hidden;
    this.blockStart = blockStart;
    this.execId = execId;
  }

  eq(other) {
    return other.hidden === this.hidden && other.blockStart === this.blockStart && other.execId === this.execId;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-empty-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    container.dataset.outputBlockStart = String(this.blockStart);
    if (this.execId) {
      container.dataset.execId = this.execId;
    }
    container.textContent = 'No output';
    return container;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Widget for rendering HTML output in a sandboxed iframe.
 * Used for ```html code blocks to show rendered HTML.
 */
class HtmlOutputWidget extends WidgetType {
  /**
   * @param {string} content - HTML content to render
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   * @param {number} blockStart - Document position where this output block starts
   * @param {string|null} execId - Execution ID for this output block
   */
  constructor(content, hidden = false, blockStart = 0, execId = null) {
    super();
    this.content = content;
    this.hidden = hidden;
    this.blockStart = blockStart;
    this.execId = execId;
  }

  eq(other) {
    return other.content === this.content && other.hidden === this.hidden && other.blockStart === this.blockStart && other.execId === this.execId;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-html-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    container.dataset.outputBlockStart = String(this.blockStart);
    if (this.execId) {
      container.dataset.execId = this.execId;
    }

    // Create iframe for HTML rendering
    // Note: Removed sandbox attribute as allow-scripts+allow-same-origin together
    // triggers security warnings. This is acceptable for a local dev tool where
    // users run their own code anyway.
    const iframe = document.createElement('iframe');
    iframe.className = 'cm-html-output-iframe';
    iframe.style.cssText = 'width: 100%; border: none; background: white; border-radius: 4px; min-height: 60px;';

    container.appendChild(iframe);

    // Write content to iframe after it's attached to DOM
    requestAnimationFrame(() => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          // Wrap content in a basic HTML structure with some default styles
          const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; }
    th { background: #f5f5f5; }
    pre { background: #f5f5f5; padding: 8px; border-radius: 4px; overflow-x: auto; }
    code { background: #f0f0f0; padding: 2px 4px; border-radius: 2px; font-size: 0.9em; }
  </style>
</head>
<body>${this.content}</body>
</html>`;
          doc.open();
          doc.write(htmlContent);
          doc.close();

          // Auto-resize iframe to content height
          const resizeIframe = () => {
            const body = doc.body;
            const html = doc.documentElement;
            if (body && html) {
              const height = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                html.clientHeight,
                html.scrollHeight,
                html.offsetHeight
              );
              iframe.style.height = Math.max(60, Math.min(height + 16, 500)) + 'px';
            }
          };

          // Resize after images load
          const images = doc.querySelectorAll('img');
          if (images.length > 0) {
            let loaded = 0;
            images.forEach(img => {
              if (img.complete) {
                loaded++;
              } else {
                img.onload = img.onerror = () => {
                  loaded++;
                  if (loaded === images.length) resizeIframe();
                };
              }
            });
            if (loaded === images.length) resizeIframe();
          } else {
            resizeIframe();
          }
        }
      } catch (e) {
        console.warn('Failed to render HTML in iframe:', e);
        container.innerHTML = `<pre class="cm-output-content">${this.content.replace(/</g, '&lt;')}</pre>`;
      }
    });

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Widget for rendering CSS output as compact impact summary.
 */
class CssOutputWidget extends WidgetType {
  /**
   * @param {string} content - CSS content
   * @param {boolean} hidden - Whether widget should be hidden (cursor in block)
   * @param {number} blockStart - Document position where this output block starts
   * @param {string|null} execId - Execution ID for this output block
   */
  constructor(content, hidden = false, blockStart = 0, execId = null, targetScope = 'all') {
    super();
    this.content = content;
    this.hidden = hidden;
    this.blockStart = blockStart;
    this.execId = execId;
    this.targetScope = targetScope;
  }

  eq(other) {
    return other.content === this.content &&
      other.hidden === this.hidden &&
      other.blockStart === this.blockStart &&
      other.execId === this.execId &&
      other.targetScope === this.targetScope;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-css-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    container.dataset.outputBlockStart = String(this.blockStart);
    if (this.execId) {
      container.dataset.execId = this.execId;
    }

    const header = document.createElement('div');
    header.className = 'cm-css-header';
    const badge = document.createElement('span');
    badge.className = 'cm-css-badge';
    badge.textContent = 'CSS';
    const statsEl = document.createElement('span');
    statsEl.className = 'cm-css-stats';
    const totalTargetsEl = document.createElement('span');
    totalTargetsEl.className = 'cm-css-total-targets';
    header.appendChild(badge);
    header.appendChild(statsEl);
    header.appendChild(totalTargetsEl);
    container.appendChild(header);

    const selectorList = document.createElement('div');
    selectorList.className = 'cm-css-chip-list';
    container.appendChild(selectorList);

    const note = document.createElement('div');
    note.className = 'cm-css-note';
    container.appendChild(note);

    const sourceDetails = document.createElement('details');
    sourceDetails.className = 'cm-css-source';
    sourceDetails.innerHTML = `
      <summary>Show CSS</summary>
      <pre class="cm-css-source-code">${escapeHtml(this.content)}</pre>
    `;
    container.appendChild(sourceDetails);

    const renderAnalysis = (analysis) => {
      const statsText = analysis.ruleCount > 0
        ? `${analysis.ruleCount} rule${analysis.ruleCount === 1 ? '' : 's'} · ${analysis.matchedSelectors}/${analysis.totalSelectors} selectors match`
        : 'No parseable CSS rules detected';
      statsEl.textContent = statsText;
      totalTargetsEl.textContent = `${analysis.totalMatches} target${analysis.totalMatches === 1 ? '' : 's'}`;

      selectorList.innerHTML = '';
      if (analysis.selectorMatches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cm-css-note';
        empty.textContent = 'Run a CSS cell to see selector impact.';
        selectorList.appendChild(empty);
      } else {
        for (const item of analysis.selectorMatches) {
          const chip = document.createElement('div');
          const stateClass = item.valid ? (item.count > 0 ? 'cm-css-chip-match' : 'cm-css-chip-nomatch') : 'cm-css-chip-invalid';
          chip.className = `cm-css-chip ${stateClass}`;
          chip.title = item.valid
            ? `${item.count} match${item.count === 1 ? '' : 'es'} in document/artifact`
            : 'Invalid selector';
          chip.innerHTML = `
            <code class="cm-css-chip-selector">${escapeHtml(item.selector)}</code>
            <span class="cm-css-chip-count">${item.valid ? item.count : '!'}</span>
          `;
          selectorList.appendChild(chip);
        }
      }

      if (analysis.truncated) {
        note.textContent = `Showing first ${analysis.selectorMatches.length} selectors.`;
        note.style.display = '';
      } else if (analysis.scope === 'artifact' && !analysis.rootsReady) {
        note.textContent = 'Artifact preview is not ready yet.';
        note.style.display = '';
      } else {
        note.textContent = '';
        note.style.display = 'none';
      }
    };

    let refreshPending = false;
    const queueRefresh = () => {
      if (refreshPending) return;
      refreshPending = true;
      requestAnimationFrame(() => {
        refreshPending = false;
        if (!container.isConnected) return;
        renderAnalysis(analyzeCssAgainstDocument(this.content, this.targetScope));
      });
    };

    // Keep counts live as HTML/artifact DOM updates.
    const rootObserver = new MutationObserver((mutations) => {
      let relevant = false;
      for (const m of mutations) {
        const target = /** @type {Node|null} */ (m.target);
        if (!target) {
          relevant = true;
          break;
        }
        if (target === container || container.contains(target)) {
          continue;
        }
        if (!container.contains(target)) {
          relevant = true;
          break;
        }
      }
      if (relevant) queueRefresh();
    });
    if (document.documentElement && (this.targetScope === 'all' || this.targetScope === 'main')) {
      rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    let artifactObserver = null;
    let artifactIframe = null;
    let artifactLoadHandler = null;
    try {
      artifactIframe = document.getElementById('artifact-iframe');
      const bindArtifactObserver = () => {
        artifactObserver?.disconnect();
        const artifactDoc = artifactIframe?.contentDocument || artifactIframe?.contentWindow?.document;
        const artifactRoot = artifactDoc?.documentElement || artifactDoc?.body;
        if (!artifactRoot) return;
        artifactObserver = new MutationObserver(() => queueRefresh());
        artifactObserver.observe(artifactRoot, { childList: true, subtree: true, characterData: true });
      };
      if (artifactIframe) {
        artifactLoadHandler = () => {
          bindArtifactObserver();
          queueRefresh();
        };
        artifactIframe.addEventListener('load', artifactLoadHandler);
      }
      if (this.targetScope === 'all' || this.targetScope === 'artifact') {
        bindArtifactObserver();
      }
    } catch {
      // Ignore inaccessible artifact iframe.
    }

    const removalObserver = new MutationObserver(() => {
      if (container.isConnected) return;
      rootObserver.disconnect();
      artifactObserver?.disconnect();
      if (artifactIframe && artifactLoadHandler) {
        artifactIframe.removeEventListener('load', artifactLoadHandler);
      }
      removalObserver.disconnect();
    });
    if (document.body) {
      removalObserver.observe(document.body, { childList: true, subtree: true });
    }

    renderAnalysis(analyzeCssAgainstDocument(this.content, this.targetScope));
    // Artifact updates can race cell rendering; refresh shortly after mount.
    setTimeout(queueRefresh, 120);
    setTimeout(queueRefresh, 500);

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Widget for rendering JSON output with an expandable tree.
 */
class JsonOutputWidget extends WidgetType {
  /**
   * @param {string} content - JSON content
   * @param {boolean} hidden - Whether widget should be hidden
   * @param {number} blockStart - Document position where this output block starts
   * @param {string|null} execId - Execution ID for this output block
   */
  constructor(content, hidden = false, blockStart = 0, execId = null) {
    super();
    this.content = content;
    this.hidden = hidden;
    this.blockStart = blockStart;
    this.execId = execId;
  }

  eq(other) {
    return other.content === this.content &&
      other.hidden === this.hidden &&
      other.blockStart === this.blockStart &&
      other.execId === this.execId;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-json-output-widget' + (this.hidden ? ' cm-output-widget-hidden' : '');
    container.dataset.outputBlockStart = String(this.blockStart);
    if (this.execId) {
      container.dataset.execId = this.execId;
    }

    const parsed = tryParseJsonOutput(this.content);
    if (parsed === null) {
      container.innerHTML = `<pre class="cm-json-fallback">${escapeHtml(this.content)}</pre>`;
      return container;
    }

    const header = document.createElement('div');
    header.className = 'cm-json-header';
    header.innerHTML = `
      <span class="cm-json-badge">JSON</span>
      <span class="cm-json-summary">${escapeHtml(summarizeJson(parsed))}</span>
      <div class="cm-json-actions">
        <button type="button" class="cm-json-action" data-action="expand">Expand</button>
        <button type="button" class="cm-json-action" data-action="collapse">Collapse</button>
        <button type="button" class="cm-json-action" data-action="copy">Copy</button>
      </div>
    `;
    container.appendChild(header);

    const tree = document.createElement('div');
    tree.className = 'cm-json-tree';
    tree.appendChild(buildJsonTreeNode(null, parsed));
    container.appendChild(tree);

    const actionButtons = header.querySelectorAll('.cm-json-action');
    actionButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        if (action === 'expand') {
          tree.querySelectorAll('details').forEach((d) => { d.open = true; });
        } else if (action === 'collapse') {
          let first = true;
          tree.querySelectorAll('details').forEach((d) => {
            if (first) {
              d.open = true;
              first = false;
            } else {
              d.open = false;
            }
          });
        } else if (action === 'copy') {
          navigator.clipboard.writeText(JSON.stringify(parsed, null, 2)).then(() => {
            const previous = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(() => {
              btn.textContent = previous;
            }, 1200);
          });
        }
      });
    });

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

/**
 * Widget for stdin input blocks.
 * Renders a styled input area that's part of the document (Yjs collaborative).
 * The actual input is stored in the stdin block content, not in this widget.
 *
 * Uses the same overlay pattern as OutputWidget:
 * - Widget is position:absolute, overlays on transparent text lines
 * - When editing, widget hides and lines become visible
 */
class StdinWidget extends WidgetType {
  /**
   * @param {string} content - Current stdin content (what user has typed)
   * @param {boolean} isEditing - Whether any collaborator is focused here
   * @param {number} blockStart - Start position of the stdin block
   * @param {string} execId - Execution ID this stdin belongs to
   * @param {boolean} isPassword - Whether to mask the input
   */
  constructor(content, isEditing, blockStart, execId, isPassword = false) {
    super();
    this.content = content;
    this.isEditing = isEditing;
    this.blockStart = blockStart;
    this.execId = execId;
    this.isPassword = isPassword;
  }

  eq(other) {
    return (
      other.content === this.content &&
      other.isEditing === this.isEditing &&
      other.blockStart === this.blockStart &&
      other.execId === this.execId &&
      other.isPassword === this.isPassword
    );
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-stdin-widget' + (this.isEditing ? ' cm-stdin-widget-hidden' : '');
    container.dataset.execId = this.execId;
    container.dataset.stdinBlockStart = String(this.blockStart);
    if (this.isPassword) {
      container.dataset.password = 'true';
    }

    // Input display area with prompt
    const inputArea = document.createElement('pre');
    inputArea.className = 'cm-stdin-content';

    if (this.content.trim()) {
      // Show the input (masked if password)
      const displayText = this.isPassword ? '•'.repeat(this.content.trim().length) : this.content.trim();
      inputArea.textContent = displayText;
    } else {
      // Show blinking cursor placeholder
      inputArea.innerHTML = '<span class="cm-stdin-cursor">▌</span>';
    }

    container.appendChild(inputArea);

    // Hint below
    const hint = document.createElement('div');
    hint.className = 'cm-stdin-hint';
    hint.textContent = 'Click to type · Enter to submit';
    container.appendChild(hint);

    return container;
  }

  ignoreEvent() {
    return false; // Allow click events
  }
}

/**
 * Empty stdin widget - shown when stdin block has no content yet
 * Uses same overlay pattern as OutputWidget
 */
class EmptyStdinWidget extends WidgetType {
  constructor(isEditing, blockStart, execId, isPassword = false) {
    super();
    this.isEditing = isEditing;
    this.blockStart = blockStart;
    this.execId = execId;
    this.isPassword = isPassword;
  }

  eq(other) {
    return (
      other.isEditing === this.isEditing &&
      other.blockStart === this.blockStart &&
      other.execId === this.execId
    );
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-stdin-widget' + (this.isEditing ? ' cm-stdin-widget-hidden' : '');
    container.dataset.execId = this.execId;
    container.dataset.stdinBlockStart = String(this.blockStart);
    if (this.isPassword) {
      container.dataset.password = 'true';
    }

    // Input display area with blinking cursor
    const inputArea = document.createElement('pre');
    inputArea.className = 'cm-stdin-content';
    inputArea.innerHTML = '<span class="cm-stdin-cursor">▌</span>';
    container.appendChild(inputArea);

    // Hint below
    const hint = document.createElement('div');
    hint.className = 'cm-stdin-hint';
    hint.textContent = 'Click to type · Enter to submit';
    container.appendChild(hint);

    return container;
  }

  ignoreEvent() {
    return false;
  }
}

// #endregion WIDGET

// #region DECORATION_PLUGIN

/**
 * Find output blocks and create decorations.
 * Uses y-codemirror.next cursor positions (via awareness) to determine if any
 * collaborator is focused on an output block - no separate focusedBlock state needed.
 *
 * Supports both ```output and ```output:execId formats.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Object|null} awarenessSystem - Optional awareness system for collaborative focus
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildDecorations(view, awarenessSystem) {
  const decorations = [];
  const doc = view.state.doc;
  const cursorPos = view.state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  const text = doc.toString();

  // Find ```output or ```output:execId blocks (supports 3+ backticks for nesting)
  // Group 1: backticks, Group 2: optional execId, Group 3: content
  // Uses backreference \1 to match same number of closing backticks
  const outputBlockRegex = /(`{3,})output(?::([^\n]*))?\n([\s\S]*?)\1/g;
  let match;

  // Track which execIds have output blocks (for stdin positioning)
  const outputBlocksByExecId = new Map();

  while ((match = outputBlockRegex.exec(text)) !== null) {
    const rawExecId = match[2] || null;  // May be undefined for legacy ```output blocks
    const content = match[3];
    const blockStart = match.index;
    const blockEnd = blockStart + match[0].length;

    // Parse execId + output metadata from fence line.
    // Supported formats:
    // - output:execId
    // - output:execId:css
    // - output:execId:css:artifact
    // - output:execId:css:main
    let execId = rawExecId;
    let outputType = null;  // 'html', 'css', 'json', or null for regular output
    let cssTargetScope = 'all';  // 'all' | 'main' | 'artifact'
    if (rawExecId) {
      const parts = rawExecId.split(':');
      execId = parts[0] || rawExecId;
      const tags = parts.slice(1).map(p => p.toLowerCase());
      if (tags.includes('html') || tags.includes('htm')) outputType = 'html';
      else if (tags.includes('json')) outputType = 'json';
      else if (tags.includes('css') || tags.includes('style') || tags.includes('stylesheet')) outputType = 'css';

      if (outputType === 'css') {
        if (tags.includes('artifact')) cssTargetScope = 'artifact';
        else if (tags.includes('main')) cssTargetScope = 'main';
      }
    }

    // Store for stdin positioning
    if (execId) {
      outputBlocksByExecId.set(execId, { blockStart, blockEnd });
    }

    // Get line range
    const startLine = doc.lineAt(blockStart);
    const endLine = doc.lineAt(blockEnd);

    // Check if LOCAL cursor is inside this block
    const localCursorInBlock = cursorLine >= startLine.number && cursorLine <= endLine.number;

    // Check if ANY collaborator (local or remote) is focused on this block
    // Uses y-codemirror.next's cursor positions which survive document edits
    let anyCollaboratorFocused = localCursorInBlock;
    if (awarenessSystem && !localCursorInBlock) {
      try {
        // Check remote cursors (uses RelativePositions, survives edits)
        anyCollaboratorFocused = awarenessSystem.isBlockFocused(blockStart, blockEnd);
      } catch (e) {
        // If awareness fails, fall back to local-only behavior
        console.warn('Output widget: awareness check failed', e);
        anyCollaboratorFocused = false;
      }
    }

    // Check if output is empty (just whitespace)
    const trimmedContent = content.trim();
    const isEmpty = trimmedContent.length === 0;
    const parsedJson = !isEmpty && (outputType === null || outputType === 'json')
      ? tryParseJsonOutput(trimmedContent)
      : null;
    const shouldRenderJson = parsedJson !== null;

    if (anyCollaboratorFocused) {
      // EDITING MODE: Keep ANSI colors rendered, but make escape sequences
      // subtle (visible but small) so they can be selected/deleted.
      // Colors update live as you edit - deleting an escape sequence removes its styling.

      // Fence lines - subtle styling, clearly editable
      decorations.push(
        Decoration.line({
          class: 'cm-output-fence-editing cm-output-fence-start-editing',
        }).range(startLine.from)
      );
      decorations.push(
        Decoration.line({
          class: 'cm-output-fence-editing cm-output-fence-end-editing',
        }).range(endLine.from)
      );

      // Content lines - same styling as rendered mode (consistent appearance)
      for (let i = startLine.number + 1; i < endLine.number; i++) {
        const line = doc.line(i);
        decorations.push(
          Decoration.line({
            class: 'cm-output-content-line cm-output-content-editing',
          }).range(line.from)
        );
      }

      // Parse ANSI and apply color styling even in editing mode
      const contentStartLine = doc.line(startLine.number + 1);
      const contentEndLine = doc.line(endLine.number - 1);

      if (contentStartLine.number <= contentEndLine.number && !isEmpty) {
        const contentStart = contentStartLine.from;
        const { escapes, styles } = parseAnsiDecorations(content, contentStart);

        // Make escape sequences subtle but still selectable/deletable
        // Using Decoration.mark instead of replace so they remain in the document
        for (const esc of escapes) {
          if (esc.from < esc.to && esc.from >= contentStart) {
            decorations.push(
              Decoration.mark({
                class: 'cm-ansi-escape-editing',
              }).range(esc.from, esc.to)
            );
          }
        }

        // Apply ANSI color styling (same as viewing mode)
        for (const style of styles) {
          if (style.from < style.to && style.classes && style.from >= contentStart) {
            decorations.push(
              Decoration.mark({
                class: style.classes,
              }).range(style.from, style.to)
            );
          }
        }
      }
    } else {
      // VIEWING MODE: Render output visually
      // For HTML/CSS, use rich widgets; for regular output, use ANSI styling

      // Style the fence lines (opening and closing fences).
      // Rich output widgets (HTML/CSS, including Mermaid rendered as HTML) are
      // attached to the opening fence line, so that line must remain unclipped.
      const richOutput = outputType === 'html' || outputType === 'css' || shouldRenderJson;
      const startFenceClass = richOutput
        ? 'cm-output-fence-line cm-output-fence-start cm-output-fence-rich-start'
        : 'cm-output-fence-line cm-output-fence-start';
      const endFenceClass = richOutput
        ? 'cm-output-fence-line cm-output-fence-end cm-output-fence-rich-end'
        : 'cm-output-fence-line cm-output-fence-end';

      decorations.push(
        Decoration.line({
          class: startFenceClass,
        }).range(startLine.from)
      );
      decorations.push(
        Decoration.line({
          class: endFenceClass,
        }).range(endLine.from)
      );

      // Check if this is a rich output type (HTML or CSS)
      if (outputType === 'html' && !isEmpty) {
        // HTML OUTPUT: Hide content lines and add HTML widget
        for (let i = startLine.number + 1; i < endLine.number; i++) {
          const line = doc.line(i);
          decorations.push(
            Decoration.line({
              class: 'cm-output-content-line cm-rich-output-hidden',
            }).range(line.from)
          );
        }

        // Add HTML rendering widget
        decorations.push(
          Decoration.widget({
            widget: new HtmlOutputWidget(trimmedContent, false, blockStart, execId),
            side: 1,
          }).range(startLine.to)
        );
      } else if (shouldRenderJson) {
        // JSON OUTPUT: Hide content lines and add expandable JSON tree widget
        for (let i = startLine.number + 1; i < endLine.number; i++) {
          const line = doc.line(i);
          decorations.push(
            Decoration.line({
              class: 'cm-output-content-line cm-rich-output-hidden',
            }).range(line.from)
          );
        }

        decorations.push(
          Decoration.widget({
            widget: new JsonOutputWidget(trimmedContent, false, blockStart, execId),
            side: 1,
          }).range(startLine.to)
        );
      } else if (outputType === 'css' && !isEmpty) {
        // CSS OUTPUT: Hide content lines and add CSS widget
        for (let i = startLine.number + 1; i < endLine.number; i++) {
          const line = doc.line(i);
          decorations.push(
            Decoration.line({
              class: 'cm-output-content-line cm-rich-output-hidden',
            }).range(line.from)
          );
        }

        // Add CSS preview widget
        decorations.push(
          Decoration.widget({
            widget: new CssOutputWidget(trimmedContent, false, blockStart, execId, cssTargetScope),
            side: 1,
          }).range(startLine.to)
        );
      } else {
        // REGULAR OUTPUT: Show with ANSI styling
        // Style content lines with output block background
        for (let i = startLine.number + 1; i < endLine.number; i++) {
          const line = doc.line(i);
          decorations.push(
            Decoration.line({
              class: 'cm-output-content-line',
            }).range(line.from)
          );
        }

        // Parse ANSI content and create decorations for escape sequences and styled text
        // Content starts after the opening fence line
        const contentStartLine = doc.line(startLine.number + 1);
        const contentEndLine = doc.line(endLine.number - 1);

        if (contentStartLine.number <= contentEndLine.number && !isEmpty) {
          const contentStart = contentStartLine.from;
          const { escapes, styles } = parseAnsiDecorations(content, contentStart);

          // Replace escape sequences with zero-width element (Decoration.replace)
          // This fully hides them, including CodeMirror's control character rendering
          for (const esc of escapes) {
            if (esc.from < esc.to && esc.from >= contentStart) {
              decorations.push(
                Decoration.replace({
                  widget: new HiddenWidget(),
                }).range(esc.from, esc.to)
              );
            }
          }

          // Add decorations to style text with ANSI colors
          for (const style of styles) {
            if (style.from < style.to && style.classes && style.from >= contentStart) {
              decorations.push(
                Decoration.mark({
                  class: style.classes,
                }).range(style.from, style.to)
              );
            }
          }
        }

        // Add empty output indicator if needed
        if (isEmpty) {
          decorations.push(
            Decoration.widget({
              widget: new EmptyOutputWidget(false, blockStart, execId),
              side: 1,
            }).range(startLine.to)
          );
        }
      }
    }

  }

  // Find ```stdin:execId blocks (supports 3+ backticks for nesting)
  // These are collaborative input blocks that appear when stdin is requested
  // Group 1: backticks, Group 2: execId, Group 3: content
  const stdinBlockRegex = /(`{3,})stdin:([^\n]*)\n([\s\S]*?)\1/g;
  let stdinMatch;

  while ((stdinMatch = stdinBlockRegex.exec(text)) !== null) {
    const execId = stdinMatch[2];
    const content = stdinMatch[3];
    const blockStart = stdinMatch.index;
    const blockEnd = blockStart + stdinMatch[0].length;

    // Check if execId contains password flag (e.g., "exec-123:password")
    const isPassword = execId.includes(':password');
    const cleanExecId = execId.replace(':password', '');

    // Get line range
    const startLine = doc.lineAt(blockStart);
    const endLine = doc.lineAt(blockEnd);

    // Check if LOCAL cursor is inside this block
    const localCursorInBlock = cursorLine >= startLine.number && cursorLine <= endLine.number;

    // Check if ANY collaborator is focused on this block
    let anyCollaboratorFocused = localCursorInBlock;
    if (awarenessSystem && !localCursorInBlock) {
      try {
        anyCollaboratorFocused = awarenessSystem.isBlockFocused(blockStart, blockEnd);
      } catch (e) {
        anyCollaboratorFocused = false;
      }
    }

    // Add line decorations (same pattern as output blocks)
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = doc.line(i);
      decorations.push(
        Decoration.line({
          class: anyCollaboratorFocused ? 'cm-stdin-line-visible' : 'cm-stdin-line-hidden',
        }).range(line.from)
      );
    }

    // When hidden, collapse ANSI escape sequences (same as output blocks)
    if (!anyCollaboratorFocused) {
      for (let i = startLine.number + 1; i < endLine.number; i++) {
        const line = doc.line(i);
        const lineText = line.text;
        let match;
        ANSI_ESCAPE_REGEX.lastIndex = 0;
        while ((match = ANSI_ESCAPE_REGEX.exec(lineText)) !== null) {
          const escapeStart = line.from + match.index;
          const escapeEnd = escapeStart + match[0].length;
          decorations.push(
            Decoration.mark({
              class: 'cm-ansi-escape-hidden',
            }).range(escapeStart, escapeEnd)
          );
        }
      }
    }

    // Check if stdin has content
    const trimmedContent = content.trim();
    const isEmpty = trimmedContent.length === 0;

    // Add appropriate widget
    if (isEmpty) {
      decorations.push(
        Decoration.widget({
          widget: new EmptyStdinWidget(anyCollaboratorFocused, blockStart, cleanExecId, isPassword),
          side: 1,
        }).range(startLine.to)
      );
    } else {
      decorations.push(
        Decoration.widget({
          widget: new StdinWidget(trimmedContent, anyCollaboratorFocused, blockStart, cleanExecId, isPassword),
          side: 1,
        }).range(startLine.to)
      );
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * ViewPlugin that manages output block decorations with awareness support.
 * When any collaborator focuses on an output block, all clients see raw text.
 *
 * Follows y-codemirror.next pattern:
 * - Awareness changes dispatch a transaction with annotation
 * - update() always rebuilds decorations (no conditional)
 * - This ensures decorations are rebuilt during the normal CodeMirror cycle
 */
export const outputWidgetPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      // Get awareness from facet (may be null initially)
      this.awarenessSystem = view.state.facet(outputWidgetAwarenessFacet);
      this.unsubscribe = null;

      // Build initial decorations
      this.decorations = buildDecorations(view, this.awarenessSystem);

      // Setup awareness listener (following y-codemirror.next pattern)
      // The listener dispatches a transaction which triggers update()
      this._setupAwarenessListener(view);
    }

    /**
     * Setup awareness listener following y-codemirror.next pattern:
     * When awareness changes, dispatch a transaction with annotation.
     * This triggers the update() method during normal CodeMirror cycle.
     *
     * IMPORTANT: Only dispatch for REMOTE client changes to avoid
     * recursive update errors. Local changes are already handled
     * by the current update cycle.
     */
    _setupAwarenessListener(view) {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }

      if (this.awarenessSystem) {
        // Following y-codemirror.next pattern exactly:
        // Only dispatch when REMOTE clients change (not local)
        this.unsubscribe = this.awarenessSystem.onCollaboratorsChange((collaborators, changeInfo) => {
          // Only dispatch for remote changes to avoid recursive updates
          // Local changes are already being processed in the current update cycle
          if (changeInfo?.isRemote) {
            view.dispatch({
              annotations: [outputWidgetAwarenessAnnotation.of([])]
            });
          }
        });
      }
    }

    /**
     * Called on every CodeMirror transaction.
     * Following y-codemirror.next pattern: ALWAYS rebuild decorations.
     */
    update(update) {
      // Check if awareness facet changed (e.g., awareness was added after view creation)
      const newAwareness = update.state.facet(outputWidgetAwarenessFacet);
      if (newAwareness !== this.awarenessSystem) {
        this.awarenessSystem = newAwareness;
        this._setupAwarenessListener(update.view);
      }

      // ALWAYS rebuild decorations (following y-codemirror.next pattern)
      // Uses y-codemirror.next cursor positions to check remote focus
      // (no separate focusedBlock state needed - cursor positions survive edits)
      this.decorations = buildDecorations(update.view, this.awarenessSystem);
    }

    destroy() {
      if (this.unsubscribe) {
        this.unsubscribe();
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// #endregion DECORATION_PLUGIN

// #region STYLES

/**
 * CSS styles for output widget
 *
 * Uses CSS custom properties from the widget theme system.
 * See widgets/theme.js for available tokens.
 */
export const outputWidgetStyles = `
/* Output widget container - attenuated, secondary to code */
/* Widget is absolutely positioned - overlays on transparent text lines, doesn't add to flow */
.cm-output-widget {
  position: absolute;
  left: var(--widget-inset-left, 24px);
  right: 0;
  top: var(--widget-offset-top, 0);  /* Can be negative to pull widget up closer to code block */
  z-index: 1;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--output-font-size, 0.7em);
  line-height: var(--output-line-height, 1.4);
  padding: var(--widget-padding-y, 8px) var(--widget-padding-x, 12px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  overflow-x: auto;
  cursor: pointer;
  opacity: var(--output-opacity, 0.8);
}

.cm-output-widget pre {
  margin: 0;
  padding: 0;
  white-space: var(--widget-white-space, pre-wrap);
  word-break: var(--widget-word-break, break-word);
}

.cm-output-widget:hover {
  background: var(--widget-surface-hover, rgba(0, 0, 0, 0.45));
}

/* ==========================================================================
   LINE-BASED OUTPUT RENDERING

   Output blocks are rendered line-by-line with decorations:
   - Fence lines (opening/closing) are hidden
   - Content lines have background styling
   - ANSI escape sequences are hidden (zero-width)
   - Text is styled with ANSI color classes

   This approach works with CM6 viewport virtualization.
   ========================================================================== */

/* Fence lines (opening and closing) - hidden in viewing mode */
.cm-output-fence-line {
  font-size: 0 !important;
  line-height: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  padding: 0 !important;
  margin: 0 !important;
}

/* Rich output widgets (HTML/CSS/Mermaid->HTML) are mounted on the opening
 * fence line. Keep that line unclipped so the inline widget can paint. */
.cm-output-fence-rich-start {
  height: auto !important;
  overflow: visible !important;
  line-height: 1 !important;
}

/* Hide CodeMirror's special character rendering (escape symbols) in output blocks */
/* CM renders control chars like ESC as visible ␛ symbols - we hide these since ANSI is rendered via colors */
.cm-output-content-line .cm-specialChar {
  display: none !important;
}
.cm-output-content-line .cm-widgetBuffer {
  display: none !important;
}

/* ANSI colors must override CodeMirror's syntax highlighting in output blocks */
/* CM adds nested spans with color styles that would otherwise override our ANSI classes */
.cm-output-content-line [class*="ansi-fg-"],
.cm-output-content-line [class*="ansi-fg-"] * {
  color: inherit !important;
}
.cm-output-content-line [class*="ansi-bg-"],
.cm-output-content-line [class*="ansi-bg-"] * {
  background-color: inherit !important;
}

/* Specific ANSI foreground colors with !important to override CM syntax */
.cm-output-content-line .ansi-fg-black, .cm-output-content-line .ansi-fg-black * { color: var(--ansi-black, #1e1e1e) !important; }
.cm-output-content-line .ansi-fg-red, .cm-output-content-line .ansi-fg-red * { color: var(--ansi-red, #dc2626) !important; }
.cm-output-content-line .ansi-fg-green, .cm-output-content-line .ansi-fg-green * { color: var(--ansi-green, #16a34a) !important; }
.cm-output-content-line .ansi-fg-yellow, .cm-output-content-line .ansi-fg-yellow * { color: var(--ansi-yellow, #ca8a04) !important; }
.cm-output-content-line .ansi-fg-blue, .cm-output-content-line .ansi-fg-blue * { color: var(--ansi-blue, #2563eb) !important; }
.cm-output-content-line .ansi-fg-magenta, .cm-output-content-line .ansi-fg-magenta * { color: var(--ansi-magenta, #c026d3) !important; }
.cm-output-content-line .ansi-fg-cyan, .cm-output-content-line .ansi-fg-cyan * { color: var(--ansi-cyan, #0891b2) !important; }
.cm-output-content-line .ansi-fg-white, .cm-output-content-line .ansi-fg-white * { color: var(--ansi-white, #e0e0e0) !important; }
.cm-output-content-line .ansi-fg-bright-black, .cm-output-content-line .ansi-fg-bright-black * { color: var(--ansi-bright-black, #6b7280) !important; }
.cm-output-content-line .ansi-fg-bright-red, .cm-output-content-line .ansi-fg-bright-red * { color: var(--ansi-bright-red, #ef4444) !important; }
.cm-output-content-line .ansi-fg-bright-green, .cm-output-content-line .ansi-fg-bright-green * { color: var(--ansi-bright-green, #22c55e) !important; }
.cm-output-content-line .ansi-fg-bright-yellow, .cm-output-content-line .ansi-fg-bright-yellow * { color: var(--ansi-bright-yellow, #eab308) !important; }
.cm-output-content-line .ansi-fg-bright-blue, .cm-output-content-line .ansi-fg-bright-blue * { color: var(--ansi-bright-blue, #3b82f6) !important; }
.cm-output-content-line .ansi-fg-bright-magenta, .cm-output-content-line .ansi-fg-bright-magenta * { color: var(--ansi-bright-magenta, #d946ef) !important; }
.cm-output-content-line .ansi-fg-bright-cyan, .cm-output-content-line .ansi-fg-bright-cyan * { color: var(--ansi-bright-cyan, #06b6d4) !important; }
.cm-output-content-line .ansi-fg-bright-white, .cm-output-content-line .ansi-fg-bright-white * { color: var(--ansi-bright-white, #ffffff) !important; }

/* Start fence - add top border/padding for the output block */
.cm-output-fence-start {
  /* Visual marker for block start - could add border-top */
}

/* End fence - add bottom spacing */
.cm-output-fence-end {
  /* Visual marker for block end */
}

/* Content lines - attenuated console style for output block
 *
 * Design: Outputs are secondary to code - smaller, muted, visually recessed.
 * Selection visibility: Using color-mix for semi-transparent background.
 */
.cm-output-content-line {
  background: color-mix(in srgb, var(--widget-surface, rgba(0, 0, 0, 0.35)) 85%, transparent);
  margin-left: var(--widget-inset-left, 24px);
  padding-left: var(--widget-padding-x, 16px);
  padding-right: var(--widget-padding-x, 16px);
  font-family: var(--widget-font-mono, 'Roboto Mono', 'SF Mono', Monaco, Consolas, monospace);
  font-size: var(--output-font-size, 0.7em);
  line-height: var(--output-line-height, 1.4);
  color: var(--output-text, var(--widget-text-muted, #6b7280));
  opacity: var(--output-opacity, 0.8);
}

/* Selection styling for output content - ensure visibility */
.cm-output-content-line::selection,
.cm-output-content-line *::selection {
  background: var(--editor-selection, #264f78) !important;
}

/* First content line - add top padding and rounded corners */
.cm-output-content-line:first-of-type,
.cm-output-fence-start + .cm-line {
  padding-top: var(--widget-padding-y, 8px);
  border-top-left-radius: var(--widget-border-radius, 6px);
  border-top-right-radius: var(--widget-border-radius, 6px);
}

/* Last content line - add bottom padding and rounded corners */
.cm-output-content-line:last-of-type {
  padding-bottom: var(--widget-padding-y, 8px);
  border-bottom-left-radius: var(--widget-border-radius, 6px);
  border-bottom-right-radius: var(--widget-border-radius, 6px);
}

/* Preserve whitespace but allow wrapping */
.cm-output-content-line {
  white-space: pre-wrap;
  word-break: break-word;
  tab-size: 4;
}

/* ==========================================================================
   EDITING MODE STYLES

   When cursor is in an output block, we show raw text but maintain visual
   consistency with the rendered appearance. Key differences:
   - Fence lines are visible (subtle styling)
   - ANSI escape codes are visible (necessary for editing)
   - Content lines keep the same styling as rendered mode
   ========================================================================== */

/* Fence lines in editing mode - visible but subtle */
.cm-output-fence-editing {
  background: color-mix(in srgb, var(--widget-surface, rgba(0, 0, 0, 0.35)) 60%, transparent);
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, monospace);
  font-size: 0.65em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.3));
  padding-left: var(--widget-padding-x, 16px);
  margin-left: var(--widget-inset-left, 24px);
  opacity: 0.7;
}

/* Opening fence - rounded top corners */
.cm-output-fence-start-editing {
  border-top-left-radius: var(--widget-border-radius, 6px);
  border-top-right-radius: var(--widget-border-radius, 6px);
  padding-top: 4px;
}

/* Closing fence - rounded bottom corners */
.cm-output-fence-end-editing {
  border-bottom-left-radius: var(--widget-border-radius, 6px);
  border-bottom-right-radius: var(--widget-border-radius, 6px);
  padding-bottom: 4px;
}

/* Content lines in editing mode - no extra styling needed, inherits from .cm-output-content-line */
.cm-output-content-editing {
  /* Editing mode uses same attenuated style as viewing mode */
}

/* Selection styling for editing mode */
.cm-output-fence-editing::selection,
.cm-output-fence-editing *::selection,
.cm-output-content-editing::selection,
.cm-output-content-editing *::selection {
  background: var(--editor-selection, #264f78) !important;
}

/* Legacy class - keep for backwards compatibility */
.cm-output-line-editing {
  background: color-mix(in srgb, var(--widget-surface-elevated, #1e1e1e) 90%, transparent);
}

/* ANSI escape sequences - hidden (zero-width) in viewing mode */
.cm-ansi-escape-hidden {
  display: inline !important;
  font-size: 0 !important;
  line-height: 0 !important;
  letter-spacing: 0 !important;
  color: transparent !important;
  width: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  vertical-align: baseline !important;
}

/* Ensure the span itself doesn't take space */
.cm-ansi-escape-hidden * {
  display: none !important;
}

/* ANSI escape sequences in EDITING mode - subtle but selectable/deletable
 * Shows as a small colored pill that can be selected and deleted.
 * Deleting this removes the associated color styling.
 */
.cm-ansi-escape-editing {
  font-size: 0.6em;
  padding: 0 2px;
  margin: 0 1px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.08));
  border-radius: 3px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  vertical-align: middle;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.cm-ansi-escape-editing:hover {
  opacity: 1;
  background: var(--widget-surface-hover, rgba(255, 255, 255, 0.12));
}

/* When selected, make it clearly visible */
.cm-ansi-escape-editing::selection {
  background: var(--editor-selection, #264f78) !important;
  opacity: 1;
}

/* Legacy widget support (for transition period) */
.cm-output-widget-hidden {
  display: none !important;
}

/* Widget text color - muted for attenuated appearance */
.cm-output-widget pre {
  color: var(--output-text, var(--widget-text-muted, #9ca3af));
}

/* Selection styling for rendered output widget */
.cm-output-widget::selection,
.cm-output-widget *::selection,
.cm-output-content::selection,
.cm-output-content *::selection {
  background: var(--editor-selection, #264f78) !important;
}

/* Output content container */
.cm-output-content {
  white-space: var(--widget-white-space, pre-wrap);
  word-break: var(--widget-word-break, break-word);
}

/* Empty output widget - subtle indicator */
.cm-empty-output-widget {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--output-font-size, 0.75em);
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.25));
  padding: 4px var(--widget-padding-x, 12px);
  margin: 2px 0;
  font-style: italic;
  opacity: 0.6;
}

/* Stdin input widget - positioned via CodeMirror decoration system */
.cm-stdin-widget {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--widget-padding-y, 8px) var(--widget-padding-x, 12px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-stdin-accent, #f59e0b);
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  margin: 4px 0;
}

.cm-stdin-widget .cm-stdin-prompt {
  color: var(--widget-stdin-accent, #f59e0b);
  font-weight: 500;
  white-space: nowrap;
}

.cm-stdin-widget .cm-stdin-field {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.15));
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  outline: none;
}

.cm-stdin-widget .cm-stdin-field:focus {
  border-color: var(--widget-stdin-accent, #f59e0b);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.cm-stdin-widget .cm-stdin-field::placeholder {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
}

.cm-stdin-widget .cm-stdin-hint {
  font-size: 0.8em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  white-space: nowrap;
}

.cm-stdin-widget.cm-stdin-submitted {
  opacity: 0.6;
  border-left-color: var(--widget-success, #22c55e);
}

.cm-stdin-widget.cm-stdin-cancelled {
  opacity: 0.6;
  border-left-color: var(--widget-error, #ef4444);
}

/* Copy feedback */
.cm-output-copy-feedback {
  position: absolute;
  top: var(--widget-padding-y, 8px);
  right: var(--widget-padding-x, 12px);
  padding: 4px 8px;
  background: var(--widget-success, #22c55e);
  color: white;
  border-radius: 4px;
  font-size: var(--widget-font-size-small, 0.8em);
  animation: fadeOut 1.5s ease-out forwards;
}

@keyframes fadeOut {
  0%, 70% { opacity: 1; }
  100% { opacity: 0; }
}

/* ==========================================================================
   RICH OUTPUT WIDGETS (HTML/CSS)

   These widgets render HTML in iframes or inject CSS with preview.
   Content lines are hidden when these widgets are shown.
   ========================================================================== */

/* Hide content lines for rich output (HTML/CSS) */
.cm-rich-output-hidden {
  font-size: 0 !important;
  line-height: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  padding: 0 !important;
  margin: 0 !important;
  color: transparent !important;
}

/* HTML Output Widget - renders HTML in sandboxed iframe */
.cm-html-output-widget {
  position: relative;
  z-index: 5;
  margin: 8px 0;
  padding: 0;
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  overflow: hidden;
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.1));
}

.cm-html-output-widget::before {
  content: 'HTML';
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 10px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  background: var(--widget-surface-inset, rgba(0, 0, 0, 0.3));
  padding: 2px 6px;
  border-radius: 3px;
  z-index: 10;
  font-family: var(--widget-font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cm-html-output-iframe {
  display: block;
  width: 100%;
  min-height: 60px;
  max-height: 500px;
  border: none;
  background: white;
  border-radius: 4px;
}

/* CSS Output Widget - compact selector impact summary */
.cm-css-output-widget {
  position: relative;
  margin: 8px 0;
  padding: 0;
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.08));
  border-left: 2px solid var(--widget-accent-css, #64b5f6);
}

.cm-css-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--widget-border, rgba(255, 255, 255, 0.08));
  background: var(--widget-surface-elevated, rgba(255, 255, 255, 0.02));
}

.cm-css-badge {
  font-size: 10px;
  color: var(--widget-accent-css, #64b5f6);
  background: color-mix(in srgb, var(--widget-accent-css, #64b5f6) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--widget-accent-css, #64b5f6) 35%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--widget-font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.cm-css-stats {
  font-size: 11px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.72));
}

.cm-css-total-targets {
  margin-left: auto;
  font-size: 11px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.55));
  font-family: var(--widget-font-mono, monospace);
}

.cm-css-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px 4px 10px;
}

.cm-css-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.14));
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.03));
}

.cm-css-chip-selector {
  color: var(--widget-text, #e0e0e0);
  font-family: var(--widget-font-mono, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
}

.cm-css-chip-count {
  font-family: var(--widget-font-mono, monospace);
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.7));
}

.cm-css-chip-match {
  border-color: color-mix(in srgb, #22c55e 45%, transparent);
  background: color-mix(in srgb, #22c55e 12%, transparent);
}

.cm-css-chip-nomatch {
  border-color: color-mix(in srgb, #94a3b8 35%, transparent);
}

.cm-css-chip-invalid {
  border-color: color-mix(in srgb, #ef4444 45%, transparent);
  background: color-mix(in srgb, #ef4444 12%, transparent);
}

.cm-css-note {
  padding: 2px 10px 8px 10px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.55));
  font-size: 11px;
}

.cm-css-source {
  margin: 0;
  border-top: 1px solid var(--widget-border, rgba(255, 255, 255, 0.08));
}

.cm-css-source > summary {
  cursor: pointer;
  padding: 7px 10px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.75));
  font-size: 11px;
  font-family: var(--widget-font-mono, monospace);
  user-select: none;
}

.cm-css-source > summary:hover {
  color: var(--widget-text, #e0e0e0);
}

.cm-css-source-code {
  margin: 0;
  padding: 0 10px 10px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--widget-text, #e0e0e0);
  font-size: 12px;
  font-family: var(--widget-font-mono, monospace);
}

/* JSON Output Widget - expandable tree view */
.cm-json-output-widget {
  position: relative;
  margin: 8px 0;
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.1));
  border-left: 3px solid var(--widget-accent-json, #8cc0ff);
  border-radius: var(--widget-border-radius, 6px);
  overflow: hidden;
}

.cm-json-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--widget-border, rgba(255, 255, 255, 0.08));
  background: var(--widget-surface-elevated, rgba(255, 255, 255, 0.02));
}

.cm-json-badge {
  font-size: 10px;
  color: var(--widget-accent-json, #8cc0ff);
  background: color-mix(in srgb, var(--widget-accent-json, #8cc0ff) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--widget-accent-json, #8cc0ff) 35%, transparent);
  border-radius: 3px;
  padding: 2px 6px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  font-family: var(--widget-font-mono, monospace);
}

.cm-json-summary {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.65));
  font-size: 11px;
}

.cm-json-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.cm-json-action {
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.14));
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.75));
  border-radius: 4px;
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
  font-family: var(--widget-font-mono, monospace);
}

.cm-json-action:hover {
  background: var(--widget-surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--widget-text, #e0e0e0);
}

.cm-json-tree {
  padding: 8px 10px 10px 10px;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, monospace);
  font-size: 12px;
  color: var(--widget-text, #e0e0e0);
  max-height: 420px;
  overflow: auto;
}

.cm-json-node {
  margin-left: 0;
}

.cm-json-node summary {
  list-style: none;
}

.cm-json-node summary::-webkit-details-marker {
  display: none;
}

.cm-json-node-summary {
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
}

.cm-json-node-summary::before {
  content: '▶';
  font-size: 9px;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.5));
  margin-right: 2px;
  transform: translateY(-1px);
}

.cm-json-node[open] > .cm-json-node-summary::before {
  content: '▼';
}

.cm-json-node-leaf {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
}

.cm-json-key {
  color: var(--widget-text-accent, #8cc0ff);
  min-width: 0;
}

.cm-json-meta {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.5));
  font-size: 11px;
}

.cm-json-preview {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.7));
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cm-json-children {
  margin-left: 18px;
  border-left: 1px dotted color-mix(in srgb, var(--widget-border, rgba(255, 255, 255, 0.2)) 75%, transparent);
  padding-left: 10px;
}

.cm-json-empty {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.45));
  font-style: italic;
  padding: 2px 0;
}

.cm-json-value {
  white-space: pre-wrap;
  word-break: break-word;
}

.cm-json-type-string { color: #ce9178; }
.cm-json-type-number { color: #b5cea8; }
.cm-json-type-boolean { color: #569cd6; }
.cm-json-type-null { color: #808080; }

.cm-json-fallback {
  margin: 0;
  padding: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.72));
}

/* ANSI text styles */
${ansiStyles}

/* Stdin input styles - inline with output */
.mrmd-stdin-container {
  display: inline-flex;
  align-items: baseline;
  margin: 0;
  padding: 0;
  min-width: 150px;
}

.mrmd-stdin-prompt {
  color: var(--widget-text-accent, #6495ed);
  white-space: pre;
}

.mrmd-stdin-field {
  flex: 1;
  min-width: 100px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--widget-border-focus, #6495ed);
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  padding: 0 2px;
  margin: 0;
  outline: none;
  caret-color: var(--widget-text-accent, #6495ed);
}

.mrmd-stdin-field:focus {
  border-bottom-color: var(--widget-text-accent, #6495ed);
  animation: stdin-cursor-blink 1s step-end infinite;
}

.mrmd-stdin-field::placeholder {
  color: transparent;
}

/* Blinking cursor animation for the input field */
@keyframes stdin-cursor-blink {
  50% {
    border-bottom-color: transparent;
  }
}

/* Visual indicator that input is active */
.mrmd-stdin-container::after {
  content: '\\2588'; /* Block cursor character */
  color: var(--widget-text-accent, #6495ed);
  animation: stdin-block-blink 1s step-end infinite;
  margin-left: 1px;
  font-size: 0.9em;
}

@keyframes stdin-block-blink {
  50% {
    opacity: 0;
  }
}

/* When input is submitted */
.mrmd-stdin-submitted .mrmd-stdin-field {
  border-bottom-color: var(--widget-success, #22c55e);
}

.mrmd-stdin-submitted::after {
  display: none;
}

/* Inline stdin input - injected directly into output widget content */
.mrmd-stdin-inline {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.05));
  padding: 2px 6px;
  border-radius: 3px;
  margin-left: 2px;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  border-bottom: 2px solid var(--widget-stdin-accent, #f59e0b);
}

.mrmd-stdin-inline .mrmd-stdin-prompt {
  color: var(--widget-stdin-accent, #f59e0b);
  white-space: pre;
}

.mrmd-stdin-inline .mrmd-stdin-field {
  min-width: 120px;
  max-width: 300px;
  background: transparent;
  border: none;
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  padding: 0 2px;
  outline: none;
  caret-color: var(--widget-stdin-accent, #f59e0b);
}

.mrmd-stdin-inline .mrmd-stdin-field:focus {
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.08));
}

.mrmd-stdin-inline .mrmd-stdin-hint {
  font-size: 0.8em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  white-space: nowrap;
}

/* Submitted state */
.mrmd-stdin-inline.mrmd-stdin-submitted {
  border-bottom-color: var(--widget-success, #22c55e);
  opacity: 0.8;
}

.mrmd-stdin-inline.mrmd-stdin-submitted .mrmd-stdin-field {
  color: var(--widget-success, #22c55e);
}

/* Cancelled state */
.mrmd-stdin-inline.mrmd-stdin-cancelled {
  border-bottom-color: var(--widget-error, #ef4444);
  opacity: 0.6;
}

.mrmd-stdin-inline.mrmd-stdin-cancelled .mrmd-stdin-field {
  text-decoration: line-through;
  color: var(--widget-error, #ef4444);
}

/* Stdin input positioned near code cell - main style for input requests */
.mrmd-stdin-cell-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-input-accent, #f59e0b);
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.mrmd-stdin-cell-input .mrmd-stdin-prompt {
  color: var(--widget-input-accent, #f59e0b);
  font-weight: 500;
  white-space: nowrap;
}

.mrmd-stdin-cell-input .mrmd-stdin-field {
  flex: 1;
  min-width: 200px;
  background: var(--widget-surface-inset, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--widget-border, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--widget-text, #e0e0e0);
  font-family: inherit;
  font-size: inherit;
  outline: none;
}

.mrmd-stdin-cell-input .mrmd-stdin-field:focus {
  border-color: var(--widget-input-accent, #f59e0b);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.mrmd-stdin-cell-input .mrmd-stdin-field::placeholder {
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
}

/* Hide blinking cursor for cell input - use regular cursor instead */
.mrmd-stdin-cell-input.mrmd-stdin-container::after {
  display: none;
}

/* Add hint text */
.mrmd-stdin-cell-input::after {
  content: 'Enter to submit, Esc to cancel';
  font-size: 0.75em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  white-space: nowrap;
}

/* Legacy styles for fallback absolute positioning */
.mrmd-stdin-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--widget-padding-y, 8px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: 4px;
  border: var(--widget-border-width, 1px) solid var(--widget-border-focus, #6495ed);
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-border-accent, rgba(100, 149, 237, 0.6));
}

/* ========================================================================== */
/* STDIN BLOCK WIDGET STYLES                                                  */
/* Uses same overlay pattern as output widget:                                */
/* - Widget is position:absolute, overlays on transparent text lines          */
/* - When editing (focused), widget hides and raw lines become visible        */
/* ========================================================================== */

/* Both states: lines always take same space (like output) */
.cm-stdin-line-hidden,
.cm-stdin-line-visible {
  position: relative;
}

/* Hidden: text invisible but same space (matches output pattern) */
.cm-stdin-line-hidden {
  color: transparent !important;
  user-select: none;
}
.cm-stdin-line-hidden > span {
  visibility: hidden !important;
}

/* Visible: text shown for editing - must cover the widget underneath */
.cm-stdin-line-visible {
  color: var(--widget-text, #e0e0e0);
  position: relative;
  z-index: 2;
  background: var(--widget-surface-elevated, #1e1e1e);
}

/* Main stdin widget container - position:absolute like output widget */
.cm-stdin-widget {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  font-family: var(--widget-font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace);
  font-size: var(--widget-font-size, 0.9em);
  line-height: var(--widget-line-height, inherit);
  padding: var(--widget-padding-y, 8px) var(--widget-padding-x, 12px);
  background: var(--widget-surface, rgba(0, 0, 0, 0.35));
  border-radius: var(--widget-border-radius, 6px);
  overflow-x: auto;
  border-left: var(--widget-border-accent-width, 3px) solid var(--widget-stdin-accent, #f59e0b);
  cursor: text;
}

.cm-stdin-widget:hover {
  background: var(--widget-surface-hover, rgba(0, 0, 0, 0.45));
}

/* Hidden when cursor is in block (editing mode) - matches output */
.cm-stdin-widget-hidden {
  display: none !important;
}

/* Stdin content area (displays what user has typed) */
.cm-stdin-widget pre.cm-stdin-content {
  margin: 0;
  padding: 0;
  white-space: var(--widget-white-space, pre-wrap);
  word-break: var(--widget-word-break, break-word);
  color: var(--widget-text, #e0e0e0);
  min-height: 1.2em;
}

/* Blinking cursor when empty */
.cm-stdin-cursor {
  color: var(--widget-stdin-accent, #f59e0b);
  animation: stdin-cursor-blink 1s step-end infinite;
}

@keyframes stdin-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Hint text below input */
.cm-stdin-widget .cm-stdin-hint {
  font-size: 0.75em;
  color: var(--widget-text-muted, rgba(255, 255, 255, 0.4));
  margin-top: 4px;
}

/* Password masking - show dots instead of actual characters */
.cm-stdin-widget[data-password="true"] .cm-stdin-content {
  letter-spacing: 0.2em;
}

/* ==========================================================================
   MOBILE RESPONSIVE

   Output blocks need to be readable on narrow screens.
   Horizontal scroll for wide output, larger text for readability.
   ========================================================================== */

@media (max-width: 768px) {
  .cm-output-widget {
    font-size: max(var(--output-font-size, 0.7em), 12px);
    left: 0;  /* No inset on mobile — use full width */
    right: 0;
    padding: 8px 12px;
  }

  /* Output content lines: ensure they don't overflow */
  .cm-output-content-line {
    font-size: max(var(--output-font-size, 0.8em), 12px);
  }

  /* Rich output (HTML renders, plots): full width */
  .cm-output-rich-widget {
    max-width: 100%;
  }

  .cm-output-rich-widget iframe {
    max-width: 100%;
  }

  /* Stdin widget: bigger input on mobile */
  .cm-stdin-widget .cm-stdin-input {
    font-size: 16px; /* Prevents iOS zoom */
    padding: 10px;
  }

  .cm-stdin-widget .cm-stdin-prompt {
    font-size: 14px;
  }
}

@media (pointer: coarse) {
  /* Output container: larger tap target for focus/interaction */
  .cm-output-widget {
    padding: 10px 14px;
  }

  /* Collapsed output: easy to tap to expand */
  .cm-output-collapsed {
    min-height: 44px;
    display: flex;
    align-items: center;
  }
}
`;

// #endregion STYLES

// #region STDIN_INJECTION

// Terminal-like stdin is handled via _setupStdinKeyHandler() in execution.js
// Old widget-injection code has been removed in favor of the simpler approach:
// 1. When stdin_request arrives, cursor is moved into output block (raw mode)
// 2. User types directly in the raw markdown
// 3. Enter is captured and sent as input

// #region EXPORTS

/**
 * Create the output widget extension for CodeMirror
 * @returns {import('@codemirror/state').Extension}
 */
export function outputWidget() {
  return outputWidgetPlugin;
}

/**
 * Inject output widget CSS styles into the document
 */
export function injectOutputWidgetStyles() {
  if (document.getElementById('mrmd-output-widget-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mrmd-output-widget-styles';
  style.textContent = outputWidgetStyles;
  document.head.appendChild(style);
}

// #endregion EXPORTS
