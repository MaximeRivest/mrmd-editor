/**
 * Runtime LSP Provider
 *
 * Unified interface for LSP-like features (hover, completions, variables)
 * from any runtime - whether mrmd-js (browser) or MRP servers (mrmd-python).
 *
 * This module provides:
 * - CodeMirror hover extension with runtime-powered tooltips
 * - CodeMirror completion source with runtime-aware completions
 * - Variable explorer API for UI components
 * - Integration with the awareness system
 *
 * The key insight: runtimes know actual values, not just types.
 * "df" in Python isn't just "DataFrame" - it's "DataFrame with 1000 rows × 5 cols"
 *
 * @module runtime-lsp
 */

import { hoverTooltip, closeHoverTooltips, showTooltip, ViewPlugin } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { autocompletion, startCompletion } from '@codemirror/autocomplete';
import { getCellAtCursor, findCells } from './cells.js';

// #region INTERFACES

/**
 * @typedef {Object} RuntimeLSPProvider
 * @property {function(string, number, string?): Promise<HoverResult|null>} hover
 * @property {function(string, number, string?): Promise<CompletionResult>} complete
 * @property {function(string, number, string?, Object?): Promise<InspectResult|null>} inspect
 * @property {function(): Promise<VariableInfo[]>} listVariables
 * @property {function(string, Object?): Promise<VariableDetail>} getVariable
 * @property {function(string): Promise<IsCompleteResult>} isComplete
 * @property {function(string): Promise<FormatResult>} format
 * @property {string[]} languages - Languages this provider supports
 */

/**
 * @typedef {Object} HoverResult
 * @property {boolean} found
 * @property {string} [name]
 * @property {string} [type]
 * @property {string} [value]
 * @property {string} [signature]
 * @property {string} [documentation]
 * @property {string} [docstring]
 */

/**
 * @typedef {Object} CompletionResult
 * @property {CompletionItem[]} matches
 * @property {number} cursorStart
 * @property {number} cursorEnd
 * @property {'runtime'|'static'} source
 */

/**
 * @typedef {Object} CompletionItem
 * @property {string} label
 * @property {string} [kind]
 * @property {string} [type]
 * @property {string} [detail]
 * @property {string} [valuePreview]
 * @property {string} [documentation]
 * @property {string} [insertText]
 * @property {number} [boost]
 * @property {string} [sortText]
 * @property {string|{name: string, rank?: number|'dynamic'}} [section]
 */

/**
 * @typedef {Object} InspectResult
 * @property {boolean} found
 * @property {string} [name]
 * @property {string} [type]
 * @property {string} [kind]
 * @property {string} [value]
 * @property {string} [signature]
 * @property {string} [documentation]
 * @property {string} [sourceCode]
 * @property {Object[]} [children]
 */

/**
 * @typedef {Object} VariableInfo
 * @property {string} name
 * @property {string} type
 * @property {string} value
 * @property {string} [size]
 * @property {boolean} [expandable]
 */

/**
 * @typedef {Object} VariableDetail
 * @property {string} name
 * @property {string} type
 * @property {string} value
 * @property {string} [fullValue]
 * @property {VariableInfo[]} [children]
 * @property {string[]} [methods]
 * @property {string[]} [attributes]
 */

/**
 * @typedef {Object} IsCompleteResult
 * @property {'complete'|'incomplete'|'invalid'|'unknown'} status
 * @property {string} [indent]
 */

/**
 * @typedef {Object} FormatResult
 * @property {string} formatted
 * @property {boolean} changed
 */

// #endregion INTERFACES

// #region ADAPTERS

/**
 * Adapt an mrmd-js session to the RuntimeLSPProvider interface.
 *
 * @param {Object} session - mrmd-js Session instance
 * @returns {RuntimeLSPProvider}
 */
export function adaptMrmdJsSession(session) {
  return {
    languages: ['javascript', 'js', 'html', 'css'],

    async hover(code, cursor, language) {
      try {
        const result = session.hover(code, cursor);
        if (!result || !result.found) return null;
        return {
          found: true,
          name: result.name,
          type: result.type,
          value: result.value,
          signature: result.signature,
          documentation: result.documentation || result.docstring,
          docstring: result.docstring,
        };
      } catch (e) {
        console.warn('mrmd-js hover error:', e);
        return null;
      }
    },

    async complete(code, cursor, language) {
      try {
        const result = session.complete(code, cursor);
        return {
          matches: result.matches || [],
          cursorStart: result.cursorStart ?? cursor,
          cursorEnd: result.cursorEnd ?? cursor,
          source: 'runtime',
        };
      } catch (e) {
        console.warn('mrmd-js complete error:', e);
        return { matches: [], cursorStart: cursor, cursorEnd: cursor, source: 'runtime' };
      }
    },

    async inspect(code, cursor, language, options = {}) {
      try {
        const result = session.inspect(code, cursor, options);
        if (!result || !result.found) return null;
        return result;
      } catch (e) {
        console.warn('mrmd-js inspect error:', e);
        return null;
      }
    },

    async listVariables() {
      try {
        return session.listVariables() || [];
      } catch (e) {
        console.warn('mrmd-js listVariables error:', e);
        return [];
      }
    },

    async getVariable(name, options = {}) {
      try {
        return session.getVariable(name, options);
      } catch (e) {
        console.warn('mrmd-js getVariable error:', e);
        return { name, type: 'unknown', value: '?', expandable: false };
      }
    },

    async isComplete(code) {
      try {
        return session.isComplete(code);
      } catch (e) {
        return { status: 'unknown' };
      }
    },

    async format(code) {
      try {
        return await session.format(code);
      } catch (e) {
        return { formatted: code, changed: false };
      }
    },
  };
}

/**
 * Adapt an MRPClient to the RuntimeLSPProvider interface.
 *
 * @param {import('./mrp-client.js').MRPClient} client - MRP client instance
 * @param {string[]} [languages] - Override languages (defaults to client's capabilities)
 * @returns {RuntimeLSPProvider}
 */
export function adaptMRPClient(client, languages) {
  // Get languages from capabilities or use provided
  const supportedLanguages = languages || [];

  // Try to get capabilities async (for supported languages)
  client.ready().then(caps => {
    if (caps?.languages) {
      supportedLanguages.length = 0;
      supportedLanguages.push(...caps.languages);
    }
  });

  return {
    get languages() {
      return supportedLanguages;
    },

    async hover(code, cursor, language) {
      try {
        const result = await client.hover({ code, cursor });
        if (!result || !result.found) return null;
        return {
          ...result,
          documentation: result.documentation || result.docstring,
        };
      } catch (e) {
        console.warn('MRP hover error:', e);
        return null;
      }
    },

    async complete(code, cursor, language) {
      try {
        const result = await client.complete({ code, cursor });
        return {
          matches: result.matches || [],
          cursorStart: result.cursorStart ?? cursor,
          cursorEnd: result.cursorEnd ?? cursor,
          source: result.source || 'runtime',
        };
      } catch (e) {
        console.warn('MRP complete error:', e);
        return { matches: [], cursorStart: cursor, cursorEnd: cursor, source: 'runtime' };
      }
    },

    async inspect(code, cursor, language, options = {}) {
      try {
        const result = await client.inspect({ code, cursor, detail: options.detail ?? 1 });
        if (!result || !result.found) return null;
        return result;
      } catch (e) {
        console.warn('MRP inspect error:', e);
        return null;
      }
    },

    async listVariables() {
      try {
        const result = await client.getVariables();
        return result.variables || [];
      } catch (e) {
        console.warn('MRP listVariables error:', e);
        return [];
      }
    },

    async getVariable(name, options = {}) {
      try {
        return await client.getVariableDetail(name, options);
      } catch (e) {
        console.warn('MRP getVariable error:', e);
        return { name, type: 'unknown', value: '?', expandable: false };
      }
    },

    async isComplete(code) {
      try {
        return await client.isComplete(code);
      } catch (e) {
        return { status: 'unknown' };
      }
    },

    async format(code) {
      try {
        return await client.format(code);
      } catch (e) {
        return { formatted: code, changed: false };
      }
    },
  };
}

// #endregion ADAPTERS

// #region LANGUAGE_DETECTION

/**
 * Get the language for a position in the document (inside a code block).
 *
 * @param {string} content - Document content
 * @param {number} pos - Cursor position
 * @returns {string|null} - Language tag or null if not in a code block
 */
function getLanguageAtPosition(content, pos) {
  const cell = getCellAtCursor(content, pos);
  return cell?.language || null;
}

/**
 * Get code within a cell for a given position.
 * Returns the code and the offset of the cursor within that code.
 *
 * @param {string} content - Document content
 * @param {number} pos - Document position
 * @returns {{code: string, offset: number, language: string, cell: Object}|null}
 */
function getCodeAtPosition(content, pos) {
  const cell = getCellAtCursor(content, pos);
  if (!cell) return null;

  // Calculate offset within the cell's code
  const offset = pos - cell.codeStart;
  if (offset < 0 || offset > cell.code.length) return null;

  return {
    code: cell.code,
    offset,
    language: cell.language,
    cell,
  };
}

// #endregion LANGUAGE_DETECTION

// #region HOVER_EXTENSION

const setPinnedHoverTooltip = StateEffect.define();
const clearPinnedHoverTooltip = StateEffect.define();

const pinnedHoverTooltipField = StateField.define({
  create() {
    return null;
  },
  update(value, tr) {
    if (tr.docChanged) return null;

    for (const effect of tr.effects) {
      if (effect.is(setPinnedHoverTooltip)) return effect.value;
      if (effect.is(clearPinnedHoverTooltip)) return null;
    }

    return value;
  },
  provide: (f) => showTooltip.from(f),
});

function looksLikeFunctionRepr(value) {
  return typeof value === 'string' && /^<function\s+[^>]+\s+at\s+0x[0-9a-f]+>$/i.test(value.trim());
}

function cleanDocsText(text) {
  if (!text) return '';
  return String(text)
    .replace(/(?:<function\s+[^>]+\s+at\s+0x[0-9a-f]+>)+\s*$/ig, '')
    .trim();
}

function formatHoverText(result) {
  if (!result) return '';
  const parts = [];

  const nameType = [result.name, result.type].filter(Boolean).join(' : ');
  if (nameType) parts.push(nameType);
  if (result.signature) parts.push(result.signature);

  const suppressValue = !!result.signature && looksLikeFunctionRepr(result.value);
  if (result.value && !suppressValue) parts.push(result.value);

  const docsText = cleanDocsText(result.documentation || result.docstring);
  if (docsText) parts.push(docsText);

  if (result.file) {
    parts.push(`Source: ${result.file}${result.line ? `:${result.line}` : ''}`);
  }

  return parts.join('\n\n');
}

function createHoverTooltipDescriptor(view, hoverResult, pos, end, { sticky = false } = {}) {
  return {
    pos,
    end,
    above: false,
    arrow: true,
    create() {
      const dom = document.createElement('div');
      dom.className = `mrmd-runtime-hover${sticky ? ' mrmd-runtime-hover-sticky' : ''}`;
      dom.innerHTML = formatHoverContent(hoverResult);

      const copyBtn = dom.querySelector('.mrmd-hover-copy');
      if (copyBtn) {
        copyBtn.addEventListener('mousedown', (event) => {
          event.stopPropagation();
        });

        copyBtn.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const text = formatHoverText(hoverResult);
          if (!text) return;

          try {
            await navigator.clipboard?.writeText(text);
            const original = copyBtn.textContent;
            copyBtn.textContent = 'Copied';
            setTimeout(() => {
              copyBtn.textContent = original || 'Copy';
            }, 900);
          } catch {
            // ignore
          }
        });
      }

      const sourceLink = dom.querySelector('.mrmd-hover-source-link');
      if (sourceLink) {
        sourceLink.addEventListener('mousedown', (event) => {
          event.stopPropagation();
        });
      }

      if (!sticky) {
        dom.addEventListener('mousedown', (event) => {
          if (event.button !== 0) return;
          if (event.target instanceof Element && event.target.closest('.mrmd-hover-copy')) return;

          const stickyTooltip = createHoverTooltipDescriptor(view, hoverResult, pos, end, { sticky: true });
          view.dispatch({
            effects: [
              setPinnedHoverTooltip.of(stickyTooltip),
              closeHoverTooltips,
            ],
          });
        });
      }

      return {
        dom,
        offset: { x: 0, y: -8 },
        overlap: true,
      };
    },
  };
}

const pinnedHoverClosePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.onMouseDownCapture = (event) => {
        const pinned = view.state.field(pinnedHoverTooltipField, false);
        if (!pinned) return;

        const target = event.target;
        if (target instanceof Element && target.closest('.mrmd-runtime-hover')) return;

        view.dispatch({ effects: clearPinnedHoverTooltip.of(null) });
      };

      view.dom.ownerDocument.addEventListener('mousedown', this.onMouseDownCapture, true);
    }

    destroy() {
      this.view.dom.ownerDocument.removeEventListener('mousedown', this.onMouseDownCapture, true);
    }
  }
);

/**
 * Create a CodeMirror hover tooltip extension powered by runtime LSP.
 *
 * Shows actual runtime values when hovering over variables/symbols.
 *
 * @param {Object} options
 * @param {Map<string, RuntimeLSPProvider>} options.providers - Language → provider map
 * @param {function(): string} options.getContent - Get document content
 * @param {import('./awareness/state.js').AwarenessStateManager} [options.stateManager] - For awareness broadcast
 * @param {import('yjs').Text} [options.yText] - For RelativePosition tracking
 * @returns {import('@codemirror/state').Extension}
 */
export function createRuntimeHoverExtension({ providers, getContent, stateManager, yText }) {
  const hoverExtension = hoverTooltip(
    async (view, pos, side) => {
      const content = getContent();
      const codeInfo = getCodeAtPosition(content, pos);

      if (!codeInfo) return null;

      // Find provider for this language
      const provider = findProviderForLanguage(providers, codeInfo.language);
      if (!provider) return null;

      // Get hover info from runtime
      let hoverResult = await provider.hover(codeInfo.code, codeInfo.offset, codeInfo.language);
      if (!hoverResult || !hoverResult.found) return null;

      // If hover payload is minimal, enrich with inspect docstring/signature/source metadata.
      // This keeps hover snappy for runtimes that already return rich hover data,
      // while still showing docs/location for runtimes that only return basic hover fields.
      const needsInspectEnrichment =
        (!hoverResult.documentation && !hoverResult.docstring) ||
        (!hoverResult.file && !hoverResult.line);

      if (needsInspectEnrichment && provider.inspect) {
        try {
          const inspectResult = await provider.inspect(
            codeInfo.code,
            codeInfo.offset,
            codeInfo.language,
            { detail: 1 }
          );
          if (inspectResult?.found) {
            hoverResult = {
              ...inspectResult,
              ...hoverResult,
              // Prefer explicit hover value/name if present, but fill missing docs/signature/location.
              documentation:
                hoverResult.documentation ||
                hoverResult.docstring ||
                inspectResult.documentation ||
                inspectResult.docstring,
              docstring: hoverResult.docstring || inspectResult.docstring,
              signature: hoverResult.signature || inspectResult.signature,
              file: hoverResult.file || inspectResult.file,
              line: hoverResult.line || inspectResult.line,
            };
          }
        } catch {
          // Ignore enrichment errors; base hover still works.
        }
      }

      // Broadcast to awareness if available
      if (stateManager) {
        const position = yText
          ? await import('yjs').then(Y => Y.createRelativePositionFromTypeIndex(yText, pos))
          : { line: view.state.doc.lineAt(pos).number, ch: pos - view.state.doc.lineAt(pos).from };

        stateManager.setHover({
          symbol: hoverResult.name,
          type: hoverResult.type,
          info: hoverResult.value || hoverResult.signature,
          position,
          cellIndex: getCellIndex(content, codeInfo.cell),
        });
      }

      // Create tooltip DOM
      return createHoverTooltipDescriptor(
        view,
        hoverResult,
        pos,
        pos + Math.max(1, hoverResult.name?.length || 0),
        { sticky: false }
      );
    },
    {
      hoverTime: 300,
      hideOnChange: false,
    }
  );

  return [
    hoverExtension,
    pinnedHoverTooltipField,
    pinnedHoverClosePlugin,
  ];
}

/**
 * Format hover content as HTML.
 *
 * @param {HoverResult} result
 * @returns {string}
 */
function formatHoverContent(result) {
  let html = '<div class="mrmd-hover-content">';

  // Header row
  html += '<div class="mrmd-hover-header">';
  html += '<div class="mrmd-hover-name">';

  if (result.name) {
    html += `<code>${escapeHtml(result.name)}</code>`;
  }
  if (result.type) {
    html += ` <span class="mrmd-hover-type">${escapeHtml(result.type)}</span>`;
  }

  html += '</div>';
  html += '<button class="mrmd-hover-copy" type="button" title="Copy hover details">Copy</button>';
  html += '</div>';

  // Signature (for functions)
  if (result.signature) {
    html += `<div class="mrmd-hover-signature"><code>${escapeHtml(result.signature)}</code></div>`;
  }

  // Value preview (skip noisy function repr when we already have signature)
  const suppressValue = !!result.signature && looksLikeFunctionRepr(result.value);
  if (result.value && !suppressValue) {
    html += `<div class="mrmd-hover-value">${escapeHtml(result.value)}</div>`;
  }

  // Documentation / docstring
  const docsText = cleanDocsText(result.documentation || result.docstring);
  if (docsText) {
    html += `<div class="mrmd-hover-docs">${escapeHtml(docsText)}</div>`;
  }

  // Source location (when provided by runtime inspect)
  if (result.file) {
    const locationText = `${result.file}${result.line ? `:${result.line}` : ''}`;
    if (result.file.startsWith('/')) {
      const fileHref = `file://${encodeURI(result.file)}`;
      html += `<div class="mrmd-hover-source">Source: <a class="mrmd-hover-source-link" href="${escapeAttr(fileHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(locationText)}</a></div>`;
    } else {
      html += `<div class="mrmd-hover-source">Source: ${escapeHtml(locationText)}</div>`;
    }
  }

  html += '</div>';
  return html;
}

/**
 * Escape HTML special characters.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// #endregion HOVER_EXTENSION

// #region COMPLETION_EXTENSION

/**
 * Check whether the character at a given index is escaped.
 *
 * @param {string} text
 * @param {number} index
 * @returns {boolean}
 */
function isEscapedAt(text, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/**
 * Split a source range on a delimiter, ignoring nested (), [], {}, strings, and comments.
 *
 * @param {string} code
 * @param {number} start
 * @param {number} end
 * @param {string} [delimiter=',']
 * @returns {Array<{start: number, end: number, text: string}>}
 */
function splitTopLevelRange(code, start, end, delimiter = ',') {
  /** @type {Array<{start: number, end: number, text: string}>} */
  const segments = [];

  let segmentStart = start;
  const stack = [];
  let stringQuote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = start; i < end; i++) {
    const ch = code[i];
    const next = i + 1 < end ? code[i + 1] : '';

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (stringQuote) {
      if (ch === stringQuote && !isEscapedAt(code, i)) {
        stringQuote = null;
      }
      continue;
    }

    if (ch === '#' || (ch === '/' && next === '/')) {
      lineComment = true;
      if (ch === '/') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      stringQuote = ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      const expected = ch === ')' ? '(' : ch === ']' ? '[' : '{';
      if (stack[stack.length - 1] === expected) {
        stack.pop();
      }
      continue;
    }

    if (ch === delimiter && stack.length === 0) {
      segments.push({
        start: segmentStart,
        end: i,
        text: code.slice(segmentStart, i),
      });
      segmentStart = i + 1;
    }
  }

  segments.push({
    start: segmentStart,
    end,
    text: code.slice(segmentStart, end),
  });

  return segments;
}

/**
 * Find the innermost unmatched `(` before the cursor.
 * Only returns it when the cursor is at top level inside that call.
 *
 * @param {string} code
 * @param {number} cursor
 * @returns {number|null}
 */
function findActiveCallOpenParen(code, cursor) {
  const stack = [];
  let stringQuote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < cursor; i++) {
    const ch = code[i];
    const next = i + 1 < cursor ? code[i + 1] : '';

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (stringQuote) {
      if (ch === stringQuote && !isEscapedAt(code, i)) {
        stringQuote = null;
      }
      continue;
    }

    if (ch === '#' || (ch === '/' && next === '/')) {
      lineComment = true;
      if (ch === '/') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      stringQuote = ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push({ ch, index: i });
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      const expected = ch === ')' ? '(' : ch === ']' ? '[' : '{';
      if (stack[stack.length - 1]?.ch === expected) {
        stack.pop();
      }
    }
  }

  const top = stack[stack.length - 1];
  return top?.ch === '(' ? top.index : null;
}

/**
 * Extract a simple callable expression before an opening parenthesis.
 * Supports names like `foo` and dotted paths like `obj.method`.
 *
 * @param {string} code
 * @param {number} openParen
 * @returns {string|null}
 */
function extractCallableNameBeforeParen(code, openParen) {
  const prefix = code.slice(0, openParen);
  const match = prefix.match(/([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*$/);
  return match?.[1] || null;
}

/**
 * Extract a leading keyword argument name from an argument segment.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractAssignedKeywordName(text) {
  const match = text.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1] || null;
}

/**
 * Determine whether the current argument segment is empty or a simple identifier prefix.
 *
 * @param {{start: number, end: number, text: string}} segment
 * @returns {{prefix: string, start: number, end: number}|null}
 */
function getArgumentPrefixInfo(segment) {
  const text = segment.text;

  if (!text.trim()) {
    return {
      prefix: '',
      start: segment.end,
      end: segment.end,
    };
  }

  const match = text.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  if (!match) return null;

  const before = text.slice(0, match.index);
  if (before.trim()) return null;

  return {
    prefix: match[1],
    start: segment.start + match.index,
    end: segment.end,
  };
}

/**
 * Analyze the active call context at the cursor position.
 *
 * @param {string} code
 * @param {number} cursor
 * @returns {{callee: string, openParen: number, segments: Array<{start: number, end: number, text: string}>, currentSegment: {start: number, end: number, text: string}, usedKeywords: Set<string>, activeKeyword: string|null, positionalIndex: number}|null}
 */
function getActiveCallContext(code, cursor) {
  const openParen = findActiveCallOpenParen(code, cursor);
  if (openParen == null) return null;

  const callee = extractCallableNameBeforeParen(code, openParen);
  if (!callee) return null;

  const segments = splitTopLevelRange(code, openParen + 1, cursor);
  const currentSegment = segments[segments.length - 1] || {
    start: cursor,
    end: cursor,
    text: '',
  };

  const usedKeywords = new Set();
  let positionalIndex = 0;

  for (const segment of segments.slice(0, -1)) {
    const text = segment.text.trim();
    if (!text) continue;

    const keywordName = extractAssignedKeywordName(segment.text);
    if (keywordName) {
      usedKeywords.add(keywordName);
      continue;
    }

    if (/^\*{1,2}/.test(text)) continue;
    positionalIndex++;
  }

  return {
    callee,
    openParen,
    segments,
    currentSegment,
    usedKeywords,
    activeKeyword: extractAssignedKeywordName(currentSegment.text),
    positionalIndex,
  };
}

/**
 * Find call-argument completion context for the current cursor position.
 *
 * @param {string} code
 * @param {number} cursor
 * @returns {{callee: string, openParen: number, prefix: string, replaceStart: number, replaceEnd: number, usedKeywords: Set<string>}|null}
 */
function getCallArgumentContext(code, cursor) {
  const activeCall = getActiveCallContext(code, cursor);
  if (!activeCall) return null;

  if (/^\s*\*{1,2}/.test(activeCall.currentSegment.text)) return null;
  if (activeCall.activeKeyword) return null;

  const prefixInfo = getArgumentPrefixInfo(activeCall.currentSegment);
  if (!prefixInfo) return null;

  return {
    callee: activeCall.callee,
    openParen: activeCall.openParen,
    prefix: prefixInfo.prefix,
    replaceStart: prefixInfo.start,
    replaceEnd: prefixInfo.end,
    usedKeywords: activeCall.usedKeywords,
  };
}

/**
 * Parse a signature string into keyword-capable parameters.
 *
 * @param {string} signature
 * @returns {Array<{name: string, declaration: string, required: boolean}>}
 */
function parseSignatureParameters(signature) {
  if (!signature) return [];

  const openParen = signature.indexOf('(');
  const closeParen = signature.lastIndexOf(')');
  if (openParen < 0 || closeParen <= openParen) return [];

  const inner = signature.slice(openParen + 1, closeParen);
  const parts = splitTopLevelRange(inner, 0, inner.length).map(part => part.text.trim());
  if (parts.length === 0) return [];

  const positionalOnlyEnd = parts.indexOf('/');

  /** @type {Array<{name: string, declaration: string, required: boolean}>} */
  const parameters = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part || part === '/' || part === '*') continue;
    if (positionalOnlyEnd !== -1 && index < positionalOnlyEnd) continue;
    if (part.startsWith('**')) continue;
    if (part.startsWith('*')) continue;

    const nameMatch = part.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    const name = nameMatch?.[1];
    if (!name || name === 'self' || name === 'cls') continue;

    parameters.push({
      name,
      declaration: part,
      required: !part.includes('='),
    });
  }

  return parameters;
}

/**
 * Extract parameter docs from common docstring formats.
 *
 * @param {string} docs
 * @param {string} parameterName
 * @returns {string}
 */
function extractParameterDocumentation(docs, parameterName) {
  const text = cleanDocsText(docs);
  if (!text) return '';

  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  // NumPy-style docstrings
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*Parameters\s*$/i.test(lines[i]) || !/^\s*-{3,}\s*$/.test(lines[i + 1])) continue;

    let currentNames = [];
    /** @type {string[]} */
    let currentLines = [];

    const flush = () => {
      if (currentNames.includes(parameterName)) {
        return currentLines.join('\n').trim();
      }
      return '';
    };

    for (let j = i + 2; j < lines.length; j++) {
      const line = lines[j];

      if (/^\S/.test(line) && j + 1 < lines.length && /^\s*-{3,}\s*$/.test(lines[j + 1])) {
        return flush();
      }

      const headerMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)(\s*:.*)?\s*$/);
      if (headerMatch && !/^\s/.test(line)) {
        const existing = flush();
        if (existing) return existing;

        currentNames = headerMatch[1].split(/\s*,\s*/);
        currentLines = [];
        const typeInfo = headerMatch[2]?.replace(/^\s*:\s*/, '').trim();
        if (typeInfo) currentLines.push(typeInfo);
        continue;
      }

      if (currentNames.length > 0) {
        currentLines.push(line.trimEnd());
      }
    }

    return flush();
  }

  // Google-style docstrings
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(Args|Arguments|Parameters)\s*:\s*$/i.test(lines[i])) continue;

    let currentName = '';
    /** @type {string[]} */
    let currentLines = [];

    const flush = () => {
      if (currentName === parameterName) {
        return currentLines.join('\n').trim();
      }
      return '';
    };

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) {
        if (currentName) currentLines.push('');
        continue;
      }

      if (/^\S/.test(line) && !/^\s{2,}/.test(line)) {
        return flush();
      }

      const headerMatch = line.match(/^\s{2,}([A-Za-z_][A-Za-z0-9_]*)(?:\s*\([^)]*\))?\s*:\s*(.*)$/);
      if (headerMatch) {
        const existing = flush();
        if (existing) return existing;

        currentName = headerMatch[1];
        currentLines = headerMatch[2] ? [headerMatch[2].trim()] : [];
        continue;
      }

      if (currentName) {
        currentLines.push(line.trim());
      }
    }

    return flush();
  }

  return '';
}

/**
 * Create a short fallback summary from a docstring.
 *
 * @param {string} docs
 * @returns {string}
 */
function summarizeDocs(docs) {
  const text = cleanDocsText(docs);
  if (!text) return '';

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const summary = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (summary.length > 0) break;
      continue;
    }
    summary.push(line.trim());
    if (summary.length >= 5) break;
  }

  return summary.join('\n').trim();
}

/**
 * Get the first non-empty line from a doc snippet.
 *
 * @param {string} docs
 * @param {number} [maxLength=88]
 * @returns {string}
 */
function firstDocLine(docs, maxLength = 88) {
  const text = cleanDocsText(docs);
  if (!text) return '';

  const line = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(part => part.trim())
    .find(Boolean) || '';

  if (!line) return '';
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}

/**
 * Compact a parameter declaration for use in the completion row.
 *
 * @param {string} declaration
 * @param {string} name
 * @param {number} [maxLength=48]
 * @returns {string}
 */
function compactParameterDeclaration(declaration, name, maxLength = 48) {
  if (!declaration) return '';

  let text = declaration
    .replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:=]?\\s*`), '')
    .replace(/(['"])[^'"]{16,}\1/g, '$1…$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) text = declaration.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Shorten doc text for completion info / compact signature help.
 *
 * @param {string} docs
 * @param {number} [maxLines=4]
 * @returns {string}
 */
function compactDocs(docs, maxLines = 4) {
  const text = cleanDocsText(docs);
  if (!text) return '';

  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter((line, index, arr) => line || (index > 0 && arr[index - 1]));

  const clipped = lines.slice(0, maxLines).join('\n').trim();
  return clipped;
}

/**
 * Parse a signature for display and active-parameter highlighting.
 *
 * @param {string} signature
 * @returns {{head: string, tail: string, parts: Array<{text: string, name: string|null, kind: 'parameter'|'marker'|'varargs'|'kwargs', positionalCapable: boolean, keywordCapable: boolean}>}|null}
 */
function parseSignatureDisplay(signature) {
  if (!signature) return null;

  const openParen = signature.indexOf('(');
  const closeParen = signature.lastIndexOf(')');
  if (openParen < 0 || closeParen <= openParen) return null;

  const head = signature.slice(0, openParen + 1);
  const inner = signature.slice(openParen + 1, closeParen);
  const tail = signature.slice(closeParen);
  const rawParts = splitTopLevelRange(inner, 0, inner.length).map(part => part.text.trim());
  const positionalOnlyEnd = rawParts.indexOf('/');

  /** @type {Array<{text: string, name: string|null, kind: 'parameter'|'marker'|'varargs'|'kwargs', positionalCapable: boolean, keywordCapable: boolean}>} */
  const parts = [];
  let keywordOnlyMode = false;

  for (let index = 0; index < rawParts.length; index++) {
    const part = rawParts[index];
    if (!part) continue;

    if (part === '/') {
      parts.push({
        text: part,
        name: null,
        kind: 'marker',
        positionalCapable: false,
        keywordCapable: false,
      });
      continue;
    }

    if (part === '*') {
      keywordOnlyMode = true;
      parts.push({
        text: part,
        name: null,
        kind: 'marker',
        positionalCapable: false,
        keywordCapable: false,
      });
      continue;
    }

    const positionalOnly = positionalOnlyEnd !== -1 && index < positionalOnlyEnd;
    const isVarKeyword = part.startsWith('**');
    const isVarArgs = !isVarKeyword && part.startsWith('*');
    const nameMatch = part.match(/^\*{0,2}([A-Za-z_][A-Za-z0-9_]*)/);
    const name = nameMatch?.[1] || null;

    parts.push({
      text: part,
      name,
      kind: isVarKeyword ? 'kwargs' : isVarArgs ? 'varargs' : 'parameter',
      positionalCapable: isVarArgs || (!keywordOnlyMode && !isVarKeyword),
      keywordCapable: !positionalOnly && !isVarArgs && !isVarKeyword,
    });

    if (isVarArgs) {
      keywordOnlyMode = true;
    }
  }

  return { head, tail, parts };
}

/**
 * Resolve the active signature part for the current call context.
 *
 * @param {{parts: Array<{text: string, name: string|null, kind: 'parameter'|'marker'|'varargs'|'kwargs', positionalCapable: boolean, keywordCapable: boolean}>}} parsedSignature
 * @param {{currentSegment: {text: string}, usedKeywords: Set<string>, activeKeyword: string|null, positionalIndex: number}} callContext
 * @returns {{text: string, name: string|null, kind: 'parameter'|'marker'|'varargs'|'kwargs', positionalCapable: boolean, keywordCapable: boolean}|null}
 */
function resolveActiveSignaturePart(parsedSignature, callContext) {
  const trimmedCurrent = callContext.currentSegment.text.trimStart();

  if (trimmedCurrent.startsWith('**')) {
    return parsedSignature.parts.find(part => part.kind === 'kwargs') || null;
  }

  if (trimmedCurrent.startsWith('*')) {
    return parsedSignature.parts.find(part => part.kind === 'varargs') || null;
  }

  if (callContext.activeKeyword) {
    return parsedSignature.parts.find(part => part.name === callContext.activeKeyword) || null;
  }

  const positionalParts = parsedSignature.parts.filter(part => part.positionalCapable);
  if (callContext.positionalIndex < positionalParts.length) {
    return positionalParts[callContext.positionalIndex] || null;
  }

  const remainingKeywordPart = parsedSignature.parts.find(part =>
    part.keywordCapable && part.name && !callContext.usedKeywords.has(part.name)
  );
  if (remainingKeywordPart) return remainingKeywordPart;

  return positionalParts[positionalParts.length - 1] || null;
}

/**
 * Format a parsed signature to HTML with the active parameter highlighted.
 *
 * @param {{head: string, tail: string, parts: Array<{text: string, name: string|null, kind: 'parameter'|'marker'|'varargs'|'kwargs', positionalCapable: boolean, keywordCapable: boolean}>}} parsedSignature
 * @param {{text: string, name: string|null, kind: 'parameter'|'marker'|'varargs'|'kwargs', positionalCapable: boolean, keywordCapable: boolean}|null} activePart
 * @returns {string}
 */
function formatSignatureMarkup(parsedSignature, activePart) {
  const pieces = [`<span class="mrmd-signature-help__head">${escapeHtml(parsedSignature.head)}</span>`];

  parsedSignature.parts.forEach((part, index) => {
    if (index > 0) {
      pieces.push('<span class="mrmd-signature-help__comma">, </span>');
    }

    const classes = ['mrmd-signature-help__part'];
    if (part.kind === 'marker') classes.push('mrmd-signature-help__part--marker');
    if (activePart === part) classes.push('mrmd-signature-help__part--active');

    pieces.push(`<span class="${classes.join(' ')}">${escapeHtml(part.text)}</span>`);
  });

  pieces.push(`<span class="mrmd-signature-help__tail">${escapeHtml(parsedSignature.tail)}</span>`);
  return pieces.join('');
}

/**
 * Format signature help content as HTML.
 *
 * @param {InspectResult} inspectResult
 * @param {{currentSegment: {text: string}, usedKeywords: Set<string>, activeKeyword: string|null, positionalIndex: number}} callContext
 * @param {{compact?: boolean}} [options]
 * @returns {string}
 */
function formatSignatureHelpContent(inspectResult, callContext, { compact = false } = {}) {
  const parsedSignature = parseSignatureDisplay(inspectResult.signature || '');
  if (!parsedSignature) return '';

  const activePart = resolveActiveSignaturePart(parsedSignature, callContext);
  const docs = inspectResult.documentation || inspectResult.docstring || '';
  const parameterDocs = activePart?.name ? extractParameterDocumentation(docs, activePart.name) : '';
  const fallbackDocs = compactDocs(summarizeDocs(docs), compact ? 2 : 4);

  let html = `<div class="mrmd-signature-help${compact ? ' mrmd-signature-help--compact' : ''}">`;
  html += `<div class="mrmd-signature-help__signature"><code>${formatSignatureMarkup(parsedSignature, activePart)}</code></div>`;

  if (activePart && activePart.kind !== 'marker') {
    html += `<div class="mrmd-signature-help__active">${escapeHtml(activePart.text)}</div>`;
  }

  if (!compact && inspectResult.name) {
    html += `<div class="mrmd-signature-help__name">${escapeHtml(inspectResult.name)}</div>`;
  }

  const docsText = compact ? firstDocLine(parameterDocs || fallbackDocs, 72) : (parameterDocs || fallbackDocs);
  if (docsText) {
    html += `<div class="mrmd-signature-help__docs">${escapeHtml(docsText)}</div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Retrieve signature-bearing inspection data, falling back to hover when inspect is unavailable
 * or returns too little information.
 *
 * @param {Object} options
 * @param {RuntimeLSPProvider} options.provider
 * @param {string} options.code
 * @param {number} options.cursor
 * @param {string} options.language
 * @returns {Promise<InspectResult|null>}
 */
async function getSignatureInspectData({ provider, code, cursor, language }) {
  let inspectResult = null;

  if (provider.inspect) {
    try {
      inspectResult = await provider.inspect(code, cursor, language, { detail: 1 });
    } catch {
      inspectResult = null;
    }
  }

  let hoverResult = null;
  const needsHoverFallback = !inspectResult?.signature || (!inspectResult.documentation && !inspectResult.docstring);
  if (needsHoverFallback && provider.hover) {
    try {
      hoverResult = await provider.hover(code, cursor, language);
    } catch {
      hoverResult = null;
    }
  }

  const signature = inspectResult?.signature || hoverResult?.signature;
  if (!signature) return null;

  return {
    ...(inspectResult || {}),
    found: true,
    name: inspectResult?.name || hoverResult?.name,
    type: inspectResult?.type || hoverResult?.type,
    signature,
    documentation:
      inspectResult?.documentation ||
      inspectResult?.docstring ||
      hoverResult?.documentation ||
      hoverResult?.docstring,
    docstring: inspectResult?.docstring || hoverResult?.docstring,
  };
}

/**
 * Get an anchor rect derived from the autocomplete popup, for VS Code-like stacked placement.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @returns {import('@codemirror/view').Rect|null}
 */
function getAutocompleteTooltipRect(view) {
  const popup = view.dom.querySelector('.cm-tooltip-autocomplete');
  if (!(popup instanceof HTMLElement)) return null;

  const rect = popup.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.left + 1,
    top: rect.top,
    bottom: rect.top,
  };
}

/**
 * Lazily inspect a completion candidate to provide docs in the side info panel.
 *
 * @param {Object} options
 * @param {RuntimeLSPProvider} options.provider
 * @param {string} options.code
 * @param {number} options.cursorStart
 * @param {number} options.cursorEnd
 * @param {string} options.insertText
 * @param {string} options.language
 * @returns {Promise<Partial<CompletionItem>|null>}
 */
async function loadCompletionItemInfo({ provider, code, cursorStart, cursorEnd, insertText, language }) {
  if (!provider.inspect && !provider.hover) return null;

  const candidateCode = `${code.slice(0, cursorStart)}${insertText}${code.slice(cursorEnd)}`;
  const candidateCursor = cursorStart + insertText.length;

  let inspectResult = null;
  if (provider.inspect) {
    try {
      inspectResult = await provider.inspect(candidateCode, candidateCursor, language, { detail: 1 });
    } catch {
      inspectResult = null;
    }
  }

  let hoverResult = null;
  const needsHover = !inspectResult?.found || (!inspectResult.signature && !inspectResult.documentation && !inspectResult.docstring);
  if (needsHover && provider.hover) {
    try {
      hoverResult = await provider.hover(candidateCode, candidateCursor, language);
    } catch {
      hoverResult = null;
    }
  }

  const signature = inspectResult?.signature || hoverResult?.signature || '';
  const type = inspectResult?.type || hoverResult?.type || '';
  const docs =
    inspectResult?.documentation ||
    inspectResult?.docstring ||
    hoverResult?.documentation ||
    hoverResult?.docstring ||
    hoverResult?.value || '';

  const detail = signature || type || '';
  if (!detail && !docs) return null;

  return {
    label: inspectResult?.name || hoverResult?.name,
    detail,
    documentation: docs,
  };
}

/**
 * Build high-priority keyword argument completions for the active call site.
 *
 * @param {Object} options
 * @param {RuntimeLSPProvider} options.provider
 * @param {string} options.code
 * @param {string} options.language
 * @param {{callee: string, openParen: number, prefix: string, replaceStart: number, replaceEnd: number, usedKeywords: Set<string>}} options.callContext
 * @returns {Promise<{matches: CompletionItem[], cursorStart: number, cursorEnd: number}|null>}
 */
async function getCallKeywordCompletions({ provider, code, language, callContext }) {
  const inspectResult = await getSignatureInspectData({
    provider,
    code,
    cursor: callContext.openParen,
    language,
  });
  if (!inspectResult?.signature) return null;

  const parameters = parseSignatureParameters(inspectResult.signature);
  if (parameters.length === 0) return null;

  const lowerPrefix = callContext.prefix.toLowerCase();
  const docs = inspectResult.documentation || inspectResult.docstring || '';

  const matches = parameters
    .filter(param => !callContext.usedKeywords.has(param.name))
    .filter(param => !lowerPrefix || param.name.toLowerCase().startsWith(lowerPrefix))
    .map((param, index) => {
      const parameterDocs = extractParameterDocumentation(docs, param.name);
      const summary = firstDocLine(parameterDocs || summarizeDocs(docs));
      const info = [
        `Parameter: ${param.declaration}`,
        compactDocs(parameterDocs || summarizeDocs(docs), 6),
      ].filter(Boolean).join('\n\n');

      return {
        label: `${param.name}=`,
        insertText: `${param.name}=`,
        kind: 'field',
        detail: compactParameterDeclaration(param.declaration, param.name),
        documentation: info,
        boost: 10000 - index,
        sortText: String(index).padStart(4, '0'),
        valuePreview: summary || undefined,
      };
    });

  if (matches.length === 0) return null;

  return {
    matches,
    cursorStart: callContext.replaceStart,
    cursorEnd: callContext.replaceEnd,
  };
}

/**
 * Merge synthesized call-argument completions with runtime completions.
 *
 * @param {CompletionResult|null} runtimeResult
 * @param {{matches: CompletionItem[], cursorStart: number, cursorEnd: number}|null} callResult
 * @returns {{matches: CompletionItem[], cursorStart: number, cursorEnd: number}|null}
 */
function mergeCompletionResults(runtimeResult, callResult) {
  const runtimeMatches = runtimeResult?.matches || [];
  const callMatches = callResult?.matches || [];

  if (runtimeMatches.length === 0 && callMatches.length === 0) return null;

  const seen = new Set();
  const matches = [];

  for (const match of callMatches) {
    const key = `${match.label}\u0000${match.insertText || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(match);
  }

  for (const match of runtimeMatches) {
    const key = `${match.label}\u0000${match.insertText || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(match);
  }

  return {
    matches,
    cursorStart: callResult?.cursorStart ?? runtimeResult?.cursorStart ?? 0,
    cursorEnd: callResult?.cursorEnd ?? runtimeResult?.cursorEnd ?? 0,
  };
}

/**
 * Build a compact DOM info panel for a completion item.
 *
 * @param {CompletionItem} match
 * @returns {((completion: any) => import('@codemirror/autocomplete').CompletionInfo)|undefined}
 */
function createCompletionInfoRenderer(match, loadInfo) {
  const render = (infoMatch) => {
    const docs = compactDocs(infoMatch.documentation || '', 6);
    const detail = infoMatch.detail || '';

    if (!docs && !detail) return null;

    const dom = document.createElement('div');
    dom.className = 'mrmd-completion-info';

    const title = document.createElement('div');
    title.className = 'mrmd-completion-info__title';
    title.textContent = infoMatch.label;
    dom.appendChild(title);

    if (detail) {
      const detailEl = document.createElement('div');
      detailEl.className = 'mrmd-completion-info__detail';
      detailEl.textContent = detail;
      dom.appendChild(detailEl);
    }

    if (docs) {
      const docsEl = document.createElement('div');
      docsEl.className = 'mrmd-completion-info__docs';
      docsEl.textContent = docs;
      dom.appendChild(docsEl);
    }

    return dom;
  };

  const immediate = render(match);
  if (immediate && !loadInfo) {
    return () => immediate.cloneNode(true);
  }

  if (!loadInfo) return undefined;

  return async () => {
    const loaded = await loadInfo();
    if (!loaded) return immediate ? immediate.cloneNode(true) : null;
    const dom = render({ ...match, ...loaded });
    return dom || (immediate ? immediate.cloneNode(true) : null);
  };
}

/**
 * Create a CodeMirror completion source powered by runtime LSP.
 *
 * Provides completions based on actual runtime state, not just static analysis.
 *
 * @param {Object} options
 * @param {Map<string, RuntimeLSPProvider>} options.providers - Language → provider map
 * @param {function(): string} options.getContent - Get document content
 * @param {import('./awareness/state.js').AwarenessStateManager} [options.stateManager] - For awareness broadcast
 * @param {import('yjs').Text} [options.yText] - For RelativePosition tracking
 * @returns {import('@codemirror/autocomplete').CompletionSource}
 */
export function createRuntimeCompletionSource({ providers, getContent, stateManager, yText }) {
  return async (context) => {
    const content = getContent();
    const pos = context.pos;
    const codeInfo = getCodeAtPosition(content, pos);

    if (!codeInfo) return null;

    // Find provider for this language
    const provider = findProviderForLanguage(providers, codeInfo.language);
    if (!provider) return null;

    const callContext = getCallArgumentContext(codeInfo.code, codeInfo.offset);

    let result;

    // Inside a callable's argument-name position, only show synthesized keyword arguments.
    // This avoids noisy IPython globals/magics when the user has already opened `(` and is
    // clearly trying to pick a kwarg.
    if (callContext) {
      result = await getCallKeywordCompletions({
        provider,
        code: codeInfo.code,
        language: codeInfo.language,
        callContext,
      });
    } else {
      result = await provider.complete(codeInfo.code, codeInfo.offset, codeInfo.language);
    }
    if (!result || !result.matches || result.matches.length === 0) return null;

    // Broadcast to awareness if available
    if (stateManager) {
      const position = yText
        ? await import('yjs').then(Y => Y.createRelativePositionFromTypeIndex(yText, pos))
        : { line: context.state.doc.lineAt(pos).number, ch: pos - context.state.doc.lineAt(pos).from };

      // Extract query from the completion range
      const queryStart = codeInfo.cell.codeStart + result.cursorStart;
      const queryEnd = codeInfo.cell.codeStart + result.cursorEnd;
      const query = context.state.doc.sliceString(queryStart, queryEnd);

      stateManager.setAutocomplete({
        query,
        items: result.matches.slice(0, 5).map(m => m.label),
        position,
        cellIndex: getCellIndex(content, codeInfo.cell),
      });
    }

    // Convert to CodeMirror completion format
    return {
      from: codeInfo.cell.codeStart + result.cursorStart,
      to: codeInfo.cell.codeStart + result.cursorEnd,
      options: result.matches.map(match => {
        const insertText = match.insertText || match.label;
        const shouldRetrigger = /[\/\.]$/.test(insertText);
        const infoLoader = (!match.documentation && (provider.inspect || provider.hover))
          ? () => loadCompletionItemInfo({
              provider,
              code: codeInfo.code,
              cursorStart: result.cursorStart,
              cursorEnd: result.cursorEnd,
              insertText,
              language: codeInfo.language,
            })
          : null;

        return {
          label: match.label,
          type: mapCompletionKind(match.kind),
          detail: match.detail || match.valuePreview,
          info: createCompletionInfoRenderer(match, infoLoader),
          section: match.section,
          sortText: match.sortText,
          // Use custom apply to retrigger completions for paths and chained access
          apply: shouldRetrigger
            ? (view, completion, from, to) => {
                view.dispatch({
                  changes: { from, to, insert: insertText },
                  selection: { anchor: from + insertText.length },
                });
                // Schedule new completion after the change is applied
                setTimeout(() => startCompletion(view), 0);
              }
            : insertText,
          boost: typeof match.boost === 'number'
            ? match.boost
            : (match.kind === 'property' || match.kind === 'method' ? 1 : 0),
        };
      }),
    };
  };
}

/**
 * Map runtime completion kind to CodeMirror completion type.
 *
 * @param {string} kind
 * @returns {string}
 */
function mapCompletionKind(kind) {
  const map = {
    'function': 'function',
    'method': 'method',
    'property': 'property',
    'variable': 'variable',
    'class': 'class',
    'module': 'namespace',
    'keyword': 'keyword',
    'constant': 'constant',
    'field': 'property',
    'value': 'constant',
  };
  return map[kind] || 'text';
}

/**
 * Create the full autocompletion extension with runtime support.
 *
 * @param {Object} options
 * @param {Map<string, RuntimeLSPProvider>} options.providers
 * @param {function(): string} options.getContent
 * @param {import('./awareness/state.js').AwarenessStateManager} [options.stateManager]
 * @param {import('yjs').Text} [options.yText]
 * @param {Object} [options.config] - Autocompletion config overrides
 * @param {Array<import('@codemirror/autocomplete').CompletionSource>} [options.additionalSources] - Additional completion sources to include
 * @returns {import('@codemirror/state').Extension}
 */
export function createRuntimeCompletionExtension({ providers, getContent, stateManager, yText, config = {}, additionalSources = [] }) {
  const source = createRuntimeCompletionSource({ providers, getContent, stateManager, yText });

  // Combine runtime source with any additional sources (like wiki-link)
  const allSources = [source, ...additionalSources];

  return autocompletion({
    override: allSources,
    activateOnTyping: config.activateOnTyping ?? true,
    maxRenderedOptions: config.maxRenderedOptions ?? 50,
    ...config,
  });
}

// #endregion COMPLETION_EXTENSION

// #region SIGNATURE_HELP

const setSignatureHelpTooltip = StateEffect.define();
const clearSignatureHelpTooltip = StateEffect.define();

const signatureHelpTooltipField = StateField.define({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSignatureHelpTooltip)) return effect.value;
      if (effect.is(clearSignatureHelpTooltip)) return null;
    }
    return value;
  },
  provide: f => showTooltip.from(f),
});

/**
 * Create a tooltip descriptor for signature help.
 *
 * @param {number} pos
 * @param {InspectResult} inspectResult
 * @param {{currentSegment: {text: string}, usedKeywords: Set<string>, activeKeyword: string|null, positionalIndex: number}} callContext
 * @param {{compact?: boolean}} [options]
 * @returns {import('@codemirror/view').Tooltip|null}
 */
function createSignatureHelpTooltipDescriptor(pos, inspectResult, callContext, { compact = false } = {}) {
  const html = formatSignatureHelpContent(inspectResult, callContext, { compact });
  if (!html) return null;

  return {
    pos,
    above: compact,
    strictSide: false,
    arrow: false,
    clip: false,
    create(view) {
      const dom = document.createElement('div');
      dom.className = 'mrmd-runtime-signature-help';
      dom.innerHTML = html;

      return {
        dom,
        offset: { x: 0, y: compact ? 6 : 14 },
        overlap: compact,
        getCoords: compact
          ? () => getAutocompleteTooltipRect(view) || view.coordsAtPos(pos)
          : undefined,
        positioned: () => {
          if (!compact) {
            dom.style.width = '';
            return;
          }

          const popup = view.dom.querySelector('.cm-tooltip-autocomplete');
          if (popup instanceof HTMLElement) {
            const width = Math.min(Math.max(popup.offsetWidth - 12, 220), 420);
            dom.style.width = `${width}px`;
          } else {
            dom.style.width = '';
          }
        },
      };
    },
  };
}

/**
 * Create a CodeMirror signature-help extension powered by runtime LSP inspect.
 *
 * Shows the active callable signature while the cursor is inside its argument list.
 *
 * @param {Object} options
 * @param {Map<string, RuntimeLSPProvider>} options.providers
 * @param {function(): string} options.getContent
 * @param {Object} [options.config]
 * @param {number} [options.config.debounceMs=80]
 * @returns {import('@codemirror/state').Extension}
 */
export function createRuntimeSignatureHelpExtension({ providers, getContent, config = {} }) {
  const debounceMs = config.debounceMs ?? 80;

  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.requestId = 0;
      this.timer = null;
      this.destroyed = false;
      this.cachedInspectKey = null;
      this.cachedInspectResult = null;
      this.autocompleteOpen = false;
      this.schedule();
    }

    update(update) {
      const autocompleteOpen = !!update.view.dom.querySelector('.cm-tooltip-autocomplete');
      if (update.docChanged || update.selectionSet || update.focusChanged || autocompleteOpen !== this.autocompleteOpen) {
        this.autocompleteOpen = autocompleteOpen;
        this.schedule();
      }
    }

    destroy() {
      this.destroyed = true;
      if (this.timer) clearTimeout(this.timer);
    }

    schedule() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.refresh();
      }, debounceMs);
    }

    clear() {
      if (this.destroyed) return;
      if (!this.view.state.field(signatureHelpTooltipField, false)) return;
      this.view.dispatch({ effects: clearSignatureHelpTooltip.of(null) });
    }

    async refresh() {
      if (this.destroyed) return;

      const selection = this.view.state.selection.main;
      if (!selection.empty) {
        this.clear();
        return;
      }

      const content = getContent();
      const pos = selection.head;
      const codeInfo = getCodeAtPosition(content, pos);
      if (!codeInfo) {
        this.clear();
        return;
      }

      const provider = findProviderForLanguage(providers, codeInfo.language);
      if (!provider?.inspect && !provider?.hover) {
        this.clear();
        return;
      }

      const callContext = getActiveCallContext(codeInfo.code, codeInfo.offset);
      if (!callContext) {
        this.clear();
        return;
      }

      const inspectKey = `${codeInfo.language}:${codeInfo.cell.start}:${callContext.openParen}:${callContext.callee}`;
      let inspectResult = this.cachedInspectKey === inspectKey ? this.cachedInspectResult : null;

      const requestId = ++this.requestId;
      if (!inspectResult) {
        inspectResult = await getSignatureInspectData({
          provider,
          code: codeInfo.code,
          cursor: callContext.openParen,
          language: codeInfo.language,
        });

        if (this.destroyed || requestId !== this.requestId) return;

        if (!inspectResult?.found || !inspectResult.signature) {
          this.cachedInspectKey = null;
          this.cachedInspectResult = null;
          this.clear();
          return;
        }

        this.cachedInspectKey = inspectKey;
        this.cachedInspectResult = inspectResult;
      }

      const latestSelection = this.view.state.selection.main;
      if (!latestSelection.empty) {
        this.clear();
        return;
      }

      const latestContent = getContent();
      const latestPos = latestSelection.head;
      const latestCodeInfo = getCodeAtPosition(latestContent, latestPos);
      const latestCallContext = latestCodeInfo
        ? getActiveCallContext(latestCodeInfo.code, latestCodeInfo.offset)
        : null;
      const latestInspectKey = latestCodeInfo && latestCallContext
        ? `${latestCodeInfo.language}:${latestCodeInfo.cell.start}:${latestCallContext.openParen}:${latestCallContext.callee}`
        : null;

      if (!latestCodeInfo || !latestCallContext || latestInspectKey !== inspectKey) {
        this.schedule();
        return;
      }

      const autocompleteOpen = this.autocompleteOpen || !!this.view.dom.querySelector('.cm-tooltip-autocomplete');
      const tooltip = createSignatureHelpTooltipDescriptor(
        latestPos,
        inspectResult,
        latestCallContext,
        { compact: autocompleteOpen }
      );
      if (!tooltip) {
        this.clear();
        return;
      }

      this.view.dispatch({ effects: setSignatureHelpTooltip.of(tooltip) });
    }
  });

  return [signatureHelpTooltipField, plugin];
}

// #endregion SIGNATURE_HELP

// #region VARIABLE_EXPLORER

/**
 * Create a variable explorer API for UI components.
 *
 * @param {Object} options
 * @param {Map<string, RuntimeLSPProvider>} options.providers
 * @param {string} [options.activeLanguage] - Currently active language
 * @returns {VariableExplorer}
 */
export function createVariableExplorer({ providers, activeLanguage }) {
  let currentLanguage = activeLanguage;

  return {
    /**
     * Set the active language for variable queries.
     * @param {string} language
     */
    setLanguage(language) {
      currentLanguage = language;
    },

    /**
     * List all variables in the current session.
     * @returns {Promise<VariableInfo[]>}
     */
    async list() {
      const provider = findProviderForLanguage(providers, currentLanguage);
      if (!provider) return [];
      return provider.listVariables();
    },

    /**
     * Get detailed info about a variable.
     * @param {string} name
     * @param {Object} [options]
     * @returns {Promise<VariableDetail>}
     */
    async get(name, options = {}) {
      const provider = findProviderForLanguage(providers, currentLanguage);
      if (!provider) return { name, type: 'unknown', value: '?', expandable: false };
      return provider.getVariable(name, options);
    },

    /**
     * Get all providers.
     * @returns {Map<string, RuntimeLSPProvider>}
     */
    getProviders() {
      return providers;
    },
  };
}

/**
 * @typedef {Object} VariableExplorer
 * @property {function(string): void} setLanguage
 * @property {function(): Promise<VariableInfo[]>} list
 * @property {function(string, Object?): Promise<VariableDetail>} get
 * @property {function(): Map<string, RuntimeLSPProvider>} getProviders
 */

// #endregion VARIABLE_EXPLORER

// #region UTILITIES

/**
 * Find a provider that supports the given language.
 *
 * @param {Map<string, RuntimeLSPProvider>} providers
 * @param {string} language
 * @returns {RuntimeLSPProvider|null}
 */
function findProviderForLanguage(providers, language) {
  if (!language) return null;
  const lang = language.toLowerCase();

  // Direct match
  if (providers.has(lang)) {
    return providers.get(lang);
  }

  // Check each provider's languages array
  for (const [, provider] of providers) {
    if (provider.languages.includes(lang)) {
      return provider;
    }
  }

  // Common aliases
  const aliases = {
    'js': 'javascript',
    'node': 'javascript',
    'ecmascript': 'javascript',
    'py': 'python',
    'python3': 'python',
    'jl': 'julia',
    'rlang': 'r',
    'sh': 'bash',
    'zsh': 'bash',
  };

  const canonical = aliases[lang];
  if (canonical) {
    return findProviderForLanguage(providers, canonical);
  }

  return null;
}

/**
 * Get cell index for a cell.
 *
 * @param {string} content
 * @param {Object} cell
 * @returns {number}
 */
function getCellIndex(content, cell) {
  const cells = findCells(content);
  return cells.findIndex(c => c.start === cell.start);
}

// #endregion UTILITIES

// #region STYLES

/**
 * CSS styles for runtime LSP UI components.
 */
export const runtimeLspStyles = `
/* Runtime Hover Tooltip */
.mrmd-runtime-hover {
  background: var(--widget-surface-elevated, var(--editor-background, #1e1e1e));
  border: 1px solid var(--widget-border, #333);
  border-radius: var(--widget-border-radius, 6px);
  padding: 8px 12px;
  max-width: 460px;
  max-height: min(52vh, 440px);
  overflow: auto;
  font-size: 13px;
  line-height: 1.45;
  color: var(--widget-text, var(--editor-foreground, #e1e1e1));
  box-shadow: var(--mrmd-shadow-md, 0 6px 18px rgba(0, 0, 0, 0.3));
  user-select: text;
}

.mrmd-runtime-hover-sticky {
  border-color: var(--widget-border-focus, var(--mrmd-accent, #58a6ff));
}

.mrmd-hover-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mrmd-hover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mrmd-hover-name {
  font-weight: 600;
}

.mrmd-hover-copy {
  border: 1px solid var(--widget-border, #333);
  background: var(--widget-surface, rgba(0, 0, 0, 0.2));
  color: var(--widget-text-muted, #9ca3af);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
}

.mrmd-hover-copy:hover {
  color: var(--widget-text, #e5e7eb);
  background: var(--widget-surface-hover, rgba(255, 255, 255, 0.08));
}

.mrmd-hover-copy:active {
  transform: translateY(1px);
}

.mrmd-hover-name code {
  color: var(--syntax-variable, var(--widget-text, #e1e1e1));
  background: none;
  padding: 0;
  font-family: var(--widget-font-mono, monospace);
}

.mrmd-hover-type {
  color: var(--syntax-type, #4ec9b0);
  font-size: 12px;
  font-weight: normal;
  margin-left: 8px;
}

.mrmd-hover-signature {
  color: var(--syntax-function, #dcdcaa);
  font-family: var(--widget-font-mono, monospace);
  font-size: 12px;
}

.mrmd-hover-signature code {
  background: none;
  padding: 0;
}

.mrmd-hover-value {
  color: var(--syntax-string, var(--widget-text, #ce9178));
  font-family: var(--widget-font-mono, monospace);
  font-size: 12px;
  max-height: 120px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.mrmd-hover-docs {
  color: var(--widget-text-muted, #9cdcfe);
  font-size: 12px;
  border-top: 1px solid var(--widget-border, #333);
  padding-top: 6px;
  margin-top: 2px;
  white-space: pre-wrap;
}

.mrmd-hover-source {
  color: var(--widget-text-muted, #9ca3af);
  font-size: 11px;
  border-top: 1px dashed var(--widget-border, #333);
  padding-top: 6px;
  margin-top: 2px;
  word-break: break-all;
}

.mrmd-hover-source-link {
  color: var(--syntax-link, var(--widget-text-accent, #58a6ff));
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}

.mrmd-hover-source-link:hover {
  text-decoration-style: solid;
}

/* Autocomplete / completion info */
.cm-tooltip.cm-tooltip-autocomplete {
  margin-top: 8px;
}

.cm-tooltip.cm-completionInfo {
  margin-left: 8px;
  max-width: 320px;
  max-height: 220px;
  overflow: auto;
}

.mrmd-completion-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 300px;
  font-size: 12px;
  line-height: 1.4;
}

.mrmd-completion-info__title {
  color: var(--syntax-variable, var(--widget-text, #e1e1e1));
  font-family: var(--widget-font-mono, monospace);
  font-weight: 600;
}

.mrmd-completion-info__detail {
  color: var(--syntax-parameter, #9cdcfe);
  font-family: var(--widget-font-mono, monospace);
  font-size: 11px;
}

.mrmd-completion-info__docs {
  color: var(--widget-text-muted, #9ca3af);
  white-space: pre-wrap;
}

/* Runtime Signature Help */
.mrmd-runtime-signature-help {
  background: var(--widget-surface-elevated, var(--editor-background, #1e1e1e));
  border: 1px solid var(--widget-border, #333);
  border-radius: var(--widget-border-radius, 6px);
  padding: 5px 8px;
  max-width: 440px;
  color: var(--widget-text, var(--editor-foreground, #e1e1e1));
  box-shadow: var(--mrmd-shadow-md, 0 6px 18px rgba(0, 0, 0, 0.28));
  font-size: 11px;
  line-height: 1.35;
}

.mrmd-signature-help {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mrmd-signature-help--compact {
  gap: 2px;
}

.mrmd-signature-help__signature {
  font-family: var(--widget-font-mono, monospace);
  color: var(--widget-text, var(--editor-foreground, #e1e1e1));
  white-space: pre-wrap;
  word-break: break-word;
}

.mrmd-signature-help--compact .mrmd-signature-help__signature {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.mrmd-signature-help__signature code {
  background: none;
  padding: 0;
}

.mrmd-signature-help__head,
.mrmd-signature-help__tail {
  color: var(--syntax-function, #dcdcaa);
}

.mrmd-signature-help__part {
  color: var(--widget-text, var(--editor-foreground, #e1e1e1));
}

.mrmd-signature-help__part--marker,
.mrmd-signature-help__comma {
  color: var(--widget-text-muted, #9ca3af);
}

.mrmd-signature-help__part--active {
  color: var(--editor-background, #111827);
  background: var(--mrmd-accent, #58a6ff);
  border-radius: 4px;
  padding: 1px 4px;
}

.mrmd-signature-help__active {
  color: var(--syntax-parameter, #9cdcfe);
  font-family: var(--widget-font-mono, monospace);
  font-size: 11px;
}

.mrmd-signature-help__name {
  color: var(--widget-text-muted, #9ca3af);
  font-size: 11px;
}

.mrmd-signature-help__docs {
  color: var(--widget-text-muted, #9cdcfe);
  border-top: 1px solid var(--widget-border, #333);
  padding-top: 4px;
  white-space: pre-wrap;
}

.mrmd-signature-help--compact .mrmd-signature-help__docs {
  border-top: 0;
  padding-top: 0;
  color: var(--widget-text-muted, #9ca3af);
}
`;


let stylesInjected = false;

/**
 * Inject runtime LSP styles into document.
 */
export function injectRuntimeLspStyles() {
  if (stylesInjected || typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.id = 'mrmd-runtime-lsp-styles';
  style.textContent = runtimeLspStyles;
  document.head.appendChild(style);
  stylesInjected = true;
}

// #endregion STYLES

// #region EXPORTS

export default {
  // Adapters
  adaptMrmdJsSession,
  adaptMRPClient,

  // Extensions
  createRuntimeHoverExtension,
  createRuntimeCompletionSource,
  createRuntimeCompletionExtension,
  createRuntimeSignatureHelpExtension,

  // Variable Explorer
  createVariableExplorer,

  // Utilities
  findProviderForLanguage,
  getLanguageAtPosition,
  getCodeAtPosition,

  // Styles
  runtimeLspStyles,
  injectRuntimeLspStyles,
};

// #endregion EXPORTS
