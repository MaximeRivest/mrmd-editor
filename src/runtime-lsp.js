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
import { autocompletion, CompletionContext, startCompletion } from '@codemirror/autocomplete';
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

    // Get completions from runtime
    const result = await provider.complete(codeInfo.code, codeInfo.offset, codeInfo.language);
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

        return {
          label: match.label,
          type: mapCompletionKind(match.kind),
          detail: match.valuePreview || match.detail,
          info: match.documentation,
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
          boost: match.kind === 'property' || match.kind === 'method' ? 1 : 0,
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
