/**
 * @fileoverview LanguageTool-style prose diagnostics for CodeMirror 6
 *
 * This module provides a reusable CM6 linter extension that:
 * - extracts visible prose fragments from markdown
 * - suppresses code/URLs/path-like content inside those fragments
 * - calls a host-provided async grammar checker
 * - maps results back to document positions as diagnostics
 *
 * The editor package stays host-agnostic: Electron/server/browser shells provide
 * the actual `check()` implementation.
 */

import { Annotation, StateEffect, StateField } from '@codemirror/state';
import { EditorView, hoverTooltip, showTooltip, ViewPlugin, closeHoverTooltips } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { linter, forEachDiagnostic } from '@codemirror/lint';

/**
 * Annotation used to force a fresh grammar pass even when the document didn't
 * change (for example after changing document grammar settings).
 */
export const forceLanguageToolRefresh = Annotation.define();

const PROSE_BLOCK_NAMES = new Set([
  'Paragraph',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
]);

const SUPPRESSED_INLINE_NAMES = new Set([
  'InlineCode',
  'URL',
]);

const NON_PROSE_PATTERNS = [
  /'[^'\n]+'/g,
  /"[^"\n]+"/g,
  /(?:\.{1,2}\/|~\/|\/)[^\s'"`<>]+/g,
  /(?:[A-Za-z0-9._-]+\/){1,}[A-Za-z0-9._-]+\/?/g,
];

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const normalized = String(item || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function addRegexSuppressions(text, baseFrom, ranges) {
  for (const pattern of NON_PROSE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const from = baseFrom + match.index;
      const to = from + match[0].length;
      if (to > from) ranges.push({ from, to });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
}

function mergeRanges(ranges) {
  if (!ranges || ranges.length <= 1) return ranges || [];

  const sorted = ranges
    .filter((r) => r && r.to > r.from)
    .sort((a, b) => (a.from - b.from) || (a.to - b.to));

  if (sorted.length === 0) return [];

  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.from <= last.to) {
      last.to = Math.max(last.to, current.to);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function replaceRangesWithSpaces(text, baseFrom, ranges) {
  if (!ranges || ranges.length === 0) return text;
  const chars = text.split('');
  for (const range of ranges) {
    const start = Math.max(0, range.from - baseFrom);
    const end = Math.min(chars.length, range.to - baseFrom);
    for (let i = start; i < end; i += 1) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}

function hasNaturalLanguage(text) {
  return /\p{L}{2,}/u.test(String(text || ''));
}

function intersectsVisibleRange(from, to, visibleRanges) {
  return visibleRanges.some((r) => from < r.to && to > r.from);
}

/**
 * Collect visible prose fragments from the markdown syntax tree.
 *
 * Each returned fragment preserves original offsets by replacing suppressed
 * inline/code/path spans with spaces rather than removing them.
 */
export function collectVisibleProseFragments(view, options = {}) {
  const {
    maxFragments = 12,
    maxFragmentLength = 4000,
  } = options;

  const tree = syntaxTree(view.state);
  const visibleRanges = view.visibleRanges || [{ from: 0, to: view.state.doc.length }];
  const fragments = [];
  const seen = new Set();

  tree.iterate({
    enter(node) {
      if (!PROSE_BLOCK_NAMES.has(node.name)) return;
      if (!intersectsVisibleRange(node.from, node.to, visibleRanges)) return;

      const key = `${node.from}:${node.to}`;
      if (seen.has(key)) return;
      seen.add(key);

      const rawText = view.state.doc.sliceString(node.from, node.to);
      if (!rawText || rawText.length > maxFragmentLength) return;

      const suppressions = [];
      tree.iterate({
        from: node.from,
        to: node.to,
        enter(inner) {
          if (SUPPRESSED_INLINE_NAMES.has(inner.name) && inner.from < inner.to) {
            suppressions.push({ from: inner.from, to: inner.to });
          }
        },
      });
      addRegexSuppressions(rawText, node.from, suppressions);
      const mergedSuppressions = mergeRanges(suppressions);
      const text = replaceRangesWithSpaces(rawText, node.from, mergedSuppressions);

      if (!hasNaturalLanguage(text)) return;

      fragments.push({
        from: node.from,
        to: node.to,
        text,
      });
    },
  });

  fragments.sort((a, b) => a.from - b.from);
  return fragments.slice(0, maxFragments);
}

function buildPayload(fragment, prefs = {}) {
  const preferredVariants = normalizeStringList(prefs.preferredVariants || []);
  const enabledRules = normalizeStringList(prefs.enabledRules || []);
  const disabledRules = normalizeStringList(prefs.disabledRules || []);
  const enabledCategories = normalizeStringList(prefs.enabledCategories || []);
  const disabledCategories = normalizeStringList(prefs.disabledCategories || []);
  const mode = String(prefs.mode || 'default').toLowerCase();

  return {
    text: fragment.text,
    language: prefs.language || undefined,
    motherTongue: prefs.motherTongue || undefined,
    preferredVariants: preferredVariants.length > 0 ? preferredVariants.join(',') : undefined,
    enabledRules,
    disabledRules,
    enabledCategories,
    disabledCategories,
    level: mode === 'picky' ? 'picky' : undefined,
  };
}

function shouldIgnoreMatch(fragment, match, dictionaryWordsLower) {
  const offset = Number(match?.offset || 0);
  const length = Number(match?.length || 0);
  if (length <= 0) return true;

  const text = fragment.text.slice(offset, offset + length).trim().toLowerCase();
  if (!text) return true;
  if (dictionaryWordsLower.has(text)) return true;

  const ruleId = String(match?.rule?.id || '').toUpperCase();
  if (ruleId === 'WHITESPACE_RULE') return true;

  return false;
}

const languageToolTheme = EditorView.baseTheme({
  // Underline styles for grammar ranges
  '.cm-lintRange-warning': {
    backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--widget-warning, #f59e0b) 88%, transparent) 45%, transparent 0%)',
    backgroundPosition: 'left bottom',
    backgroundSize: '6px 2px',
    backgroundRepeat: 'repeat-x',
  },
  '.cm-lintRange-error': {
    backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--widget-danger, #ef4444) 88%, transparent) 45%, transparent 0%)',
    backgroundPosition: 'left bottom',
    backgroundSize: '6px 2px',
    backgroundRepeat: 'repeat-x',
  },
  // Custom grammar hover tooltip (matches runtime hover popover style)
  '.mrmd-grammar-hover': {
    background: 'var(--widget-surface-elevated, var(--editor-background, #1e1e1e))',
    border: '1px solid var(--widget-border, rgba(255, 255, 255, 0.12))',
    borderRadius: 'var(--widget-border-radius, 6px)',
    padding: '8px 12px',
    maxWidth: '460px',
    maxHeight: 'min(52vh, 440px)',
    overflow: 'auto',
    fontSize: '13px',
    lineHeight: '1.45',
    color: 'var(--widget-text, var(--editor-foreground, #e1e1e1))',
    boxShadow: 'var(--mrmd-shadow-md, 0 6px 18px rgba(0, 0, 0, 0.3))',
    userSelect: 'text',
    pointerEvents: 'auto',
  },
  '.mrmd-grammar-hover-sticky': {
    borderColor: 'var(--widget-border-focus, var(--mrmd-accent, #58a6ff))',
  },
  '.mrmd-grammar-hover-content': {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  '.mrmd-grammar-hover-header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  '.mrmd-grammar-hover-source': {
    fontWeight: '600',
    fontSize: '11px',
    color: 'var(--widget-text-muted, #9ca3af)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  '.mrmd-grammar-hover-rule': {
    fontSize: '10px',
    color: 'var(--widget-text-muted, #64748b)',
    fontFamily: 'var(--widget-font-mono, monospace)',
  },
  '.mrmd-grammar-hover-message': {
    color: 'var(--widget-text, var(--editor-foreground, #e1e1e1))',
    whiteSpace: 'pre-wrap',
  },
  '.mrmd-grammar-hover-matched': {
    display: 'inline-block',
    background: 'rgba(245, 158, 11, 0.15)',
    color: 'var(--widget-warning, #f59e0b)',
    borderRadius: '3px',
    padding: '1px 5px',
    fontFamily: 'var(--widget-font-mono, monospace)',
    fontSize: '12px',
  },
  '.mrmd-grammar-hover-suggestions': {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
    paddingTop: '4px',
  },
  '.mrmd-grammar-hover-suggestion-btn': {
    appearance: 'none',
    border: '1px solid var(--widget-border, rgba(255,255,255,0.12))',
    background: 'var(--widget-surface, rgba(255,255,255,0.04))',
    color: 'var(--widget-text, var(--editor-foreground, #e5e7eb))',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: '1.2',
    fontFamily: 'inherit',
    transition: 'background 0.1s, border-color 0.1s',
  },
  '.mrmd-grammar-hover-suggestion-btn:hover': {
    background: 'var(--widget-surface-hover, rgba(255,255,255,0.08))',
    borderColor: 'var(--widget-border-focus, var(--mrmd-accent, #58a6ff))',
  },
  '.mrmd-grammar-hover-suggestion-btn:active': {
    transform: 'translateY(1px)',
  },
  '.mrmd-grammar-hover-actions': {
    display: 'flex',
    gap: '8px',
    borderTop: '1px solid var(--widget-border, rgba(255,255,255,0.08))',
    paddingTop: '6px',
    marginTop: '2px',
  },
  '.mrmd-grammar-hover-action-btn': {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'var(--widget-text-muted, #9ca3af)',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '2px 0',
    fontFamily: 'inherit',
    transition: 'color 0.1s',
  },
  '.mrmd-grammar-hover-action-btn:hover': {
    color: 'var(--widget-text, #e5e7eb)',
  },
});

function matchToDiagnostic(fragment, match) {
  const offset = Number(match?.offset || 0);
  const length = Number(match?.length || 0);
  const from = fragment.from + offset;
  const to = from + Math.max(length, 1);
  const replacements = Array.isArray(match?.replacements) ? match.replacements : [];
  const actions = replacements.slice(0, 5).map((replacement) => ({
    name: replacement.value,
    apply(view, actionFrom, actionTo) {
      view.dispatch({
        changes: { from: actionFrom, to: actionTo, insert: replacement.value },
      });
    },
  }));

  const ruleId = String(match?.rule?.id || '');
  const ruleIdLabel = ruleId ? ` [${ruleId}]` : '';
  const message = `${match.message || 'Grammar suggestion'}${ruleIdLabel}`;
  const matchedText = fragment.text.slice(offset, offset + length);

  return {
    from,
    to,
    severity: 'warning',
    source: 'languagetool',
    message,
    actions,
    // Custom fields for the grammar hover / context menu
    ruleId,
    matchedText,
  };
}

/**
 * Collect LanguageTool diagnostics near a document position, sorted by
 * proximity (intersects position > same line > visible range > document order).
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos - document offset
 * @returns {Array<{diagnostic: Object, from: number, to: number, intersectsSelection: boolean, onCurrentLine: boolean, inVisibleRange: boolean}>}
 */
function collectLanguageToolCandidates(view, pos) {
  if (!view?.state || pos == null) return [];

  const cursorLine = view.state.doc.lineAt(pos);
  const candidates = [];
  forEachDiagnostic(view.state, (diagnostic, from, to) => {
    if (diagnostic?.source !== 'languagetool') return;
    if (!Array.isArray(diagnostic.actions) || diagnostic.actions.length === 0) return;
    const intersectsSelection = from <= pos && to >= pos;
    const onCurrentLine = from < cursorLine.to && to > cursorLine.from;
    const inVisibleRange = view.visibleRanges?.some?.((range) => from < range.to && to > range.from) ?? true;
    candidates.push({ diagnostic, from, to, intersectsSelection, onCurrentLine, inVisibleRange });
  });

  candidates.sort((a, b) => {
    if (a.intersectsSelection !== b.intersectsSelection) return a.intersectsSelection ? -1 : 1;
    if (a.onCurrentLine !== b.onCurrentLine) return a.onCurrentLine ? -1 : 1;
    if (a.inVisibleRange !== b.inVisibleRange) return a.inVisibleRange ? -1 : 1;
    return a.from - b.from;
  });

  return candidates;
}

/**
 * Find all LanguageTool diagnostics that overlap a document position.
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @returns {Array<{diagnostic: Object, from: number, to: number}>}
 */
function findLanguageToolDiagnosticsAt(view, pos) {
  const results = [];
  forEachDiagnostic(view.state, (diagnostic, from, to) => {
    if (diagnostic?.source !== 'languagetool') return;
    if (pos >= from && pos <= to) {
      results.push({ diagnostic, from, to });
    }
  });
  return results;
}

/**
 * Build the branded grammar hover tooltip DOM.
 * Matches the runtime hover popover style with grammar-specific content.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {Array<{diagnostic: Object, from: number, to: number}>} hits
 * @param {Object} callbacks - { onIgnoreRule, onAddToDictionary }
 * @param {Object} [opts] - { sticky }
 * @returns {HTMLElement}
 */
function buildGrammarHoverDOM(view, hits, callbacks, opts = {}) {
  const { sticky = false } = opts;

  const dom = document.createElement('div');
  dom.className = `mrmd-grammar-hover${sticky ? ' mrmd-grammar-hover-sticky' : ''}`;

  for (const hit of hits) {
    const d = hit.diagnostic;
    const section = document.createElement('div');
    section.className = 'mrmd-grammar-hover-content';

    // Header: source + rule ID
    const header = document.createElement('div');
    header.className = 'mrmd-grammar-hover-header';
    const sourceEl = document.createElement('span');
    sourceEl.className = 'mrmd-grammar-hover-source';
    sourceEl.textContent = 'Grammar';
    header.appendChild(sourceEl);
    if (d.ruleId) {
      const ruleEl = document.createElement('span');
      ruleEl.className = 'mrmd-grammar-hover-rule';
      ruleEl.textContent = d.ruleId;
      header.appendChild(ruleEl);
    }
    section.appendChild(header);

    // Message
    const msgEl = document.createElement('div');
    msgEl.className = 'mrmd-grammar-hover-message';
    // Strip the [RULE_ID] suffix from the displayed message (it's in the header)
    const cleanMsg = d.ruleId
      ? d.message.replace(` [${d.ruleId}]`, '')
      : d.message;
    msgEl.textContent = cleanMsg;
    section.appendChild(msgEl);

    // Matched text
    if (d.matchedText) {
      const matchEl = document.createElement('span');
      matchEl.className = 'mrmd-grammar-hover-matched';
      matchEl.textContent = d.matchedText;
      section.appendChild(matchEl);
    }

    // Suggestion buttons
    if (Array.isArray(d.actions) && d.actions.length > 0) {
      const suggestionsEl = document.createElement('div');
      suggestionsEl.className = 'mrmd-grammar-hover-suggestions';
      for (const action of d.actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mrmd-grammar-hover-suggestion-btn';
        btn.textContent = action.name;
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          action.apply(view, hit.from, hit.to);
        });
        suggestionsEl.appendChild(btn);
      }
      section.appendChild(suggestionsEl);
    }

    // Action row: Ignore rule | Add to dictionary
    const hasIgnore = d.ruleId && typeof callbacks.onIgnoreRule === 'function';
    const hasDict = d.matchedText && typeof callbacks.onAddToDictionary === 'function';
    if (hasIgnore || hasDict) {
      const actionsEl = document.createElement('div');
      actionsEl.className = 'mrmd-grammar-hover-actions';

      if (hasIgnore) {
        const ignoreBtn = document.createElement('button');
        ignoreBtn.type = 'button';
        ignoreBtn.className = 'mrmd-grammar-hover-action-btn';
        ignoreBtn.textContent = 'Ignore rule';
        ignoreBtn.title = `Disable rule ${d.ruleId}`;
        ignoreBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        ignoreBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          callbacks.onIgnoreRule(d.ruleId, view);
        });
        actionsEl.appendChild(ignoreBtn);
      }

      if (hasDict) {
        const dictBtn = document.createElement('button');
        dictBtn.type = 'button';
        dictBtn.className = 'mrmd-grammar-hover-action-btn';
        dictBtn.textContent = `Add "${d.matchedText}" to dictionary`;
        dictBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        dictBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          callbacks.onAddToDictionary(d.matchedText, view);
        });
        actionsEl.appendChild(dictBtn);
      }

      section.appendChild(actionsEl);
    }

    dom.appendChild(section);
  }

  return dom;
}

/**
 * Create a reusable LanguageTool-backed CM6 diagnostics extension.
 *
 * Returns an array of extensions: themed underlines, a custom branded hover
 * tooltip (with click-to-pin, suggestions, ignore-rule, add-to-dictionary),
 * and the CM6 linter that produces diagnostics.
 *
 * @param {Object} options
 * @param {(payload: Object) => Promise<Object>} options.check - async LT check function
 * @param {() => Object | Promise<Object>} [options.getPreferences] - returns effective prefs
 * @param {() => string[] | Promise<string[]>} [options.getDictionary] - custom dictionary words
 * @param {number} [options.debounceMs=700] - lint debounce
 * @param {number} [options.maxDiagnostics=50] - cap rendered diagnostics
 * @param {number} [options.maxFragments=12] - cap visible prose fragments checked
 * @param {number} [options.maxFragmentLength=4000] - skip giant fragments
 * @param {(ruleId: string, view: EditorView) => void} [options.onIgnoreRule] - callback when user ignores a rule
 * @param {(word: string, view: EditorView) => void} [options.onAddToDictionary] - callback when user adds a word
 * @returns {import('@codemirror/state').Extension}
 */
export function createLanguageToolDiagnosticsExtension(options = {}) {
  const {
    check,
    getPreferences = () => ({}),
    getDictionary = () => [],
    debounceMs = 700,
    maxDiagnostics = 50,
    maxFragments = 12,
    maxFragmentLength = 4000,
    onIgnoreRule,
    onAddToDictionary,
  } = options;

  if (typeof check !== 'function') {
    throw new Error('createLanguageToolDiagnosticsExtension requires a check(payload) function');
  }

  const callbacks = { onIgnoreRule, onAddToDictionary };

  // -- Pinned (sticky) grammar tooltip state --
  const setPinnedTooltip = StateEffect.define();
  const clearPinnedTooltip = StateEffect.define();

  const pinnedTooltipField = StateField.define({
    create() { return null; },
    update(value, tr) {
      if (tr.docChanged) return null;
      for (const effect of tr.effects) {
        if (effect.is(setPinnedTooltip)) return effect.value;
        if (effect.is(clearPinnedTooltip)) return null;
      }
      return value;
    },
    provide: (f) => showTooltip.from(f),
  });

  // Close pinned tooltip on click outside
  const pinnedClosePlugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.onMouseDownCapture = (event) => {
          const pinned = view.state.field(pinnedTooltipField, false);
          if (!pinned) return;
          if (event.target instanceof Element && event.target.closest('.mrmd-grammar-hover')) return;
          view.dispatch({ effects: clearPinnedTooltip.of(null) });
        };
        view.dom.ownerDocument.addEventListener('mousedown', this.onMouseDownCapture, true);
      }
      destroy() {
        this.view.dom.ownerDocument.removeEventListener('mousedown', this.onMouseDownCapture, true);
      }
    },
  );

  // -- Custom grammar hover tooltip --
  function createTooltipDescriptor(view, hits, pos, end, sticky = false) {
    return {
      pos,
      end,
      above: false,
      arrow: true,
      create() {
        const dom = buildGrammarHoverDOM(view, hits, callbacks, { sticky });

        if (!sticky) {
          // Click to pin
          dom.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (event.target instanceof Element &&
              (event.target.closest('.mrmd-grammar-hover-suggestion-btn') ||
               event.target.closest('.mrmd-grammar-hover-action-btn'))) return;

            const stickyTooltip = createTooltipDescriptor(view, hits, pos, end, true);
            view.dispatch({
              effects: [
                setPinnedTooltip.of(stickyTooltip),
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

  const grammarHover = hoverTooltip((view, pos, side) => {
    const hits = findLanguageToolDiagnosticsAt(view, pos);
    if (hits.length === 0) return null;

    const minFrom = Math.min(...hits.map(h => h.from));
    const maxTo = Math.max(...hits.map(h => h.to));
    return createTooltipDescriptor(view, hits, minFrom, maxTo, false);
  }, {
    hoverTime: 350,
  });

  // -- Linter (produces diagnostics / underlines) --
  const grammarLinter = linter(async (view) => {
    const prefs = await Promise.resolve(getPreferences(view));
    if (prefs?.enabled === false) return [];

    const fragments = collectVisibleProseFragments(view, {
      maxFragments,
      maxFragmentLength,
    });
    if (fragments.length === 0) return [];

    const dictionary = normalizeStringList(await Promise.resolve(getDictionary(view)));
    const dictionaryWordsLower = new Set(dictionary.map((word) => word.toLowerCase()));

    try {
      const results = await Promise.all(
        fragments.map(async (fragment) => {
          const payload = buildPayload(fragment, prefs || {});
          const response = await check(payload);
          const matches = Array.isArray(response?.matches) ? response.matches : [];
          return matches
            .filter((match) => !shouldIgnoreMatch(fragment, match, dictionaryWordsLower))
            .map((match) => matchToDiagnostic(fragment, match));
        })
      );

      return results.flat().slice(0, maxDiagnostics);
    } catch (error) {
      console.warn('[grammar] LanguageTool check failed:', error?.message || error);
      return [];
    }
  }, {
    delay: debounceMs,
    // Suppress built-in lint tooltip for LanguageTool diagnostics (we use our own)
    tooltipFilter: (diagnostics) => diagnostics.filter((d) => d.source !== 'languagetool'),
    needsRefresh(update) {
      return update.docChanged
        || update.viewportChanged
        || update.transactions.some((tr) => tr.annotation(forceLanguageToolRefresh));
    },
  });

  return [
    languageToolTheme,
    pinnedTooltipField,
    pinnedClosePlugin,
    grammarHover,
    grammarLinter,
  ];
}

/**
 * Force a grammar re-check for extensions created by this module.
 * Useful after changing document grammar settings from host UI.
 */
export function refreshLanguageToolDiagnostics(view) {
  if (!view) return;
  view.dispatch({
    annotations: forceLanguageToolRefresh.of(true),
  });
}

/**
 * Get the best LanguageTool diagnostic near the given position and return
 * a serialisable menu descriptor with the diagnostic message and suggested
 * replacements.  Used by the Electron context-menu handler.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos - document offset (e.g. from posAtCoords)
 * @returns {{ from: number, to: number, message: string, source: string, suggestions: Array<{index: number, label: string}> } | null}
 */
export function getLanguageToolSuggestionMenu(view, pos) {
  const candidates = collectLanguageToolCandidates(view, pos);
  if (candidates.length === 0) return null;

  const best = candidates[0];
  return {
    from: best.from,
    to: best.to,
    message: best.diagnostic.message,
    source: best.diagnostic.source || 'languagetool',
    ruleId: best.diagnostic.ruleId || '',
    matchedText: best.diagnostic.matchedText || '',
    suggestions: best.diagnostic.actions.map((action, index) => ({
      index,
      label: action.name,
    })),
  };
}

export function applyLanguageToolSuggestionAt(view, pos, actionIndex = 0) {
  const candidates = collectLanguageToolCandidates(view, pos);
  if (candidates.length === 0) return false;
  const best = candidates[0];
  const action = best.diagnostic.actions[actionIndex] || best.diagnostic.actions[0];
  if (!action?.apply) return false;
  action.apply(view, best.from, best.to);
  return true;
}

export function applyFirstLanguageToolSuggestion(view) {
  if (!view?.state) return false;
  return applyLanguageToolSuggestionAt(view, view.state.selection.main.head, 0);
}
