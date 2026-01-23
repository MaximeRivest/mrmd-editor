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

import { hoverTooltip } from '@codemirror/view';
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
        return result;
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
  return hoverTooltip(
    async (view, pos, side) => {
      const content = getContent();
      const codeInfo = getCodeAtPosition(content, pos);

      if (!codeInfo) return null;

      // Find provider for this language
      const provider = findProviderForLanguage(providers, codeInfo.language);
      if (!provider) return null;

      // Get hover info from runtime
      const hoverResult = await provider.hover(codeInfo.code, codeInfo.offset, codeInfo.language);
      if (!hoverResult || !hoverResult.found) return null;

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
      return {
        pos,
        end: pos + (hoverResult.name?.length || 0),
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'mrmd-runtime-hover';
          dom.innerHTML = formatHoverContent(hoverResult);
          return { dom };
        },
      };
    },
    {
      hoverTime: 300,
      hideOnChange: true,
    }
  );
}

/**
 * Format hover content as HTML.
 *
 * @param {HoverResult} result
 * @returns {string}
 */
function formatHoverContent(result) {
  let html = '<div class="mrmd-hover-content">';

  // Name and type header
  if (result.name) {
    html += `<div class="mrmd-hover-name"><code>${escapeHtml(result.name)}</code>`;
    if (result.type) {
      html += ` <span class="mrmd-hover-type">${escapeHtml(result.type)}</span>`;
    }
    html += '</div>';
  }

  // Signature (for functions)
  if (result.signature) {
    html += `<div class="mrmd-hover-signature"><code>${escapeHtml(result.signature)}</code></div>`;
  }

  // Value preview
  if (result.value) {
    html += `<div class="mrmd-hover-value">${escapeHtml(result.value)}</div>`;
  }

  // Documentation
  if (result.documentation) {
    html += `<div class="mrmd-hover-docs">${escapeHtml(result.documentation)}</div>`;
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
  background: var(--mrmd-bg, #1e1e1e);
  border: 1px solid var(--mrmd-border, #333);
  border-radius: 6px;
  padding: 8px 12px;
  max-width: 400px;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.mrmd-hover-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mrmd-hover-name {
  font-weight: 600;
}

.mrmd-hover-name code {
  color: var(--mrmd-text, #e1e1e1);
  background: none;
  padding: 0;
}

.mrmd-hover-type {
  color: var(--mrmd-type-color, #4ec9b0);
  font-size: 12px;
  font-weight: normal;
  margin-left: 8px;
}

.mrmd-hover-signature {
  color: var(--mrmd-signature-color, #dcdcaa);
  font-family: monospace;
  font-size: 12px;
}

.mrmd-hover-signature code {
  background: none;
  padding: 0;
}

.mrmd-hover-value {
  color: var(--mrmd-value-color, #ce9178);
  font-family: monospace;
  font-size: 12px;
  max-height: 100px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.mrmd-hover-docs {
  color: var(--mrmd-docs-color, #9cdcfe);
  font-size: 12px;
  border-top: 1px solid var(--mrmd-border, #333);
  padding-top: 6px;
  margin-top: 2px;
}

/* Light theme adjustments */
.cm-theme-light .mrmd-runtime-hover,
:root:not(.dark) .mrmd-runtime-hover {
  background: #ffffff;
  border-color: #e0e0e0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.cm-theme-light .mrmd-hover-name code,
:root:not(.dark) .mrmd-hover-name code {
  color: #1e1e1e;
}

.cm-theme-light .mrmd-hover-type,
:root:not(.dark) .mrmd-hover-type {
  color: #267f99;
}

.cm-theme-light .mrmd-hover-value,
:root:not(.dark) .mrmd-hover-value {
  color: #a31515;
}

.cm-theme-light .mrmd-hover-docs,
:root:not(.dark) .mrmd-hover-docs {
  color: #0070c1;
  border-top-color: #e0e0e0;
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
