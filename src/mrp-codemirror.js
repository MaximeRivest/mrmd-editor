/**
 * MRP CodeMirror Integration
 *
 * Helpers to connect MRP runtime features to CodeMirror 6.
 *
 * @module mrp-codemirror
 */

import { autocompletion } from '@codemirror/autocomplete';
import { hoverTooltip } from '@codemirror/view';
import { getCellAtCursor } from './cells.js';

/** @typedef {import('./mrp-client.js').MRPClient} MRPClient */
/** @typedef {import('./mrp-types.js').Completion} Completion */
/** @typedef {import('@codemirror/autocomplete').CompletionContext} CompletionContext */
/** @typedef {import('@codemirror/autocomplete').CompletionResult} CompletionResult */
/** @typedef {import('@codemirror/view').Tooltip} Tooltip */

// #region COMPLETION

/**
 * Map MRP completion kind to CodeMirror type
 *
 * @param {string} kind
 * @returns {string}
 */
function mapCompletionKind(kind) {
  const mapping = {
    variable: 'variable',
    function: 'function',
    method: 'method',
    property: 'property',
    class: 'class',
    module: 'namespace',
    keyword: 'keyword',
    constant: 'constant',
    field: 'property',
    value: 'text',
  };
  return mapping[kind] || 'text';
}

/**
 * Create a CodeMirror completion source from MRP client
 *
 * @param {Object} options
 * @param {function(): MRPClient|null} options.getClient - Get MRP client
 * @param {function(): string} options.getContent - Get document content
 * @returns {import('@codemirror/autocomplete').CompletionSource}
 */
export function createMRPCompletionSource({ getClient, getContent }) {
  return async (context) => {
    const client = getClient();
    if (!client) return null;

    // Check if completion is supported
    if (!client.hasFeature('complete')) return null;

    const content = getContent();
    const cell = getCellAtCursor(content, context.pos);
    if (!cell) return null;

    // Position relative to cell
    const cellOffset = context.pos - cell.codeStart;

    try {
      const result = await client.complete({
        code: cell.code,
        cursor: cellOffset,
      });

      if (!result.matches || result.matches.length === 0) {
        return null;
      }

      return {
        from: cell.codeStart + result.cursorStart,
        to: cell.codeStart + result.cursorEnd,
        options: result.matches.map((m) => ({
          label: m.label,
          type: mapCompletionKind(m.kind),
          detail: m.detail,
          info: m.documentation,
          apply: m.insertText || m.label,
          // Boost variables (live values) over static completions
          boost: m.valuePreview ? 2 : m.kind === 'variable' ? 1 : 0,
        })),
      };
    } catch (err) {
      console.warn('MRP completion error:', err);
      return null;
    }
  };
}

/**
 * Create autocompletion extension with MRP support
 *
 * @param {Object} options
 * @param {function(): MRPClient|null} options.getClient - Get MRP client
 * @param {function(): string} options.getContent - Get document content
 * @returns {import('@codemirror/state').Extension}
 */
export function mrpAutocompletion({ getClient, getContent }) {
  return autocompletion({
    override: [createMRPCompletionSource({ getClient, getContent })],
    activateOnTyping: true,
  });
}

// #endregion COMPLETION

// #region HOVER

/**
 * Create hover tooltip extension with MRP support
 *
 * @param {Object} options
 * @param {function(): MRPClient|null} options.getClient - Get MRP client
 * @param {function(): string} options.getContent - Get document content
 * @returns {import('@codemirror/state').Extension}
 */
export function mrpHoverTooltip({ getClient, getContent }) {
  return hoverTooltip(async (view, pos) => {
    const client = getClient();
    if (!client) return null;

    if (!client.hasFeature('hover')) return null;

    const content = getContent();
    const cell = getCellAtCursor(content, pos);
    if (!cell) return null;

    // Position relative to cell
    const cellOffset = pos - cell.codeStart;

    try {
      const result = await client.hover({
        code: cell.code,
        cursor: cellOffset,
      });

      if (!result.found) return null;

      // Find word boundaries for tooltip positioning
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      const lineOffset = pos - line.from;

      // Simple word boundary detection
      let start = lineOffset;
      let end = lineOffset;
      while (start > 0 && /\w/.test(lineText[start - 1])) start--;
      while (end < lineText.length && /\w/.test(lineText[end])) end++;

      return {
        pos: line.from + start,
        end: line.from + end,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'mrp-hover-tooltip';

          // Name and type
          const header = document.createElement('div');
          header.className = 'mrp-hover-header';
          header.innerHTML = `<strong>${result.name}</strong>`;
          if (result.type) {
            header.innerHTML += `: <code>${result.type}</code>`;
          }
          dom.appendChild(header);

          // Signature
          if (result.signature) {
            const sig = document.createElement('div');
            sig.className = 'mrp-hover-signature';
            sig.innerHTML = `<code>${result.signature}</code>`;
            dom.appendChild(sig);
          }

          // Value preview
          if (result.value) {
            const val = document.createElement('div');
            val.className = 'mrp-hover-value';
            val.textContent = result.value;
            dom.appendChild(val);
          }

          return { dom };
        },
      };
    } catch (err) {
      console.warn('MRP hover error:', err);
      return null;
    }
  });
}

// #endregion HOVER

// #region INSPECT

/**
 * Get detailed inspection for symbol at position
 *
 * For use with custom UI (panels, modals, etc.)
 *
 * @param {MRPClient} client
 * @param {string} content - Document content
 * @param {number} pos - Cursor position
 * @param {number} [detail=1] - Detail level (0=signature, 1=+docs, 2=+source)
 * @returns {Promise<import('./mrp-types.js').InspectResult|null>}
 */
export async function inspectAtPosition(client, content, pos, detail = 1) {
  if (!client.hasFeature('inspect')) return null;

  const cell = getCellAtCursor(content, pos);
  if (!cell) return null;

  const cellOffset = pos - cell.codeStart;

  try {
    const result = await client.inspect({
      code: cell.code,
      cursor: cellOffset,
      detail,
    });

    return result.found ? result : null;
  } catch (err) {
    console.warn('MRP inspect error:', err);
    return null;
  }
}

// #endregion INSPECT

// #region STYLES

/**
 * CSS styles for MRP hover tooltips
 *
 * Add to your stylesheet or inject via JS
 */
export const mrpStyles = `
.mrp-hover-tooltip {
  padding: 8px 12px;
  font-family: var(--mrmd-font-mono, monospace);
  font-size: 13px;
  max-width: 500px;
}

.mrp-hover-header {
  margin-bottom: 4px;
}

.mrp-hover-header code {
  color: var(--mrmd-type-color, #6b7280);
}

.mrp-hover-signature {
  color: var(--mrmd-signature-color, #9ca3af);
  margin-bottom: 4px;
}

.mrp-hover-value {
  background: var(--mrmd-value-bg, #f3f4f6);
  padding: 4px 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
}

/* Dark mode */
.cm-editor.cm-theme-dark .mrp-hover-value {
  background: var(--mrmd-value-bg-dark, #374151);
}
`;

// #endregion STYLES
