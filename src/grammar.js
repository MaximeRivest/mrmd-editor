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

import { Annotation } from '@codemirror/state';
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

function matchToDiagnostic(fragment, match) {
  const offset = Number(match?.offset || 0);
  const length = Number(match?.length || 0);
  const from = fragment.from + offset;
  const to = from + Math.max(length, 1);
  const replacements = Array.isArray(match?.replacements) ? match.replacements : [];
  const actions = replacements.slice(0, 3).map((replacement) => ({
    name: replacement.value,
    apply(view, actionFrom, actionTo) {
      view.dispatch({
        changes: { from: actionFrom, to: actionTo, insert: replacement.value },
      });
    },
  }));

  const ruleId = match?.rule?.id ? ` [${match.rule.id}]` : '';
  const message = `${match.message || 'Grammar suggestion'}${ruleId}`;

  return {
    from,
    to,
    severity: 'warning',
    source: 'languagetool',
    message,
    actions,
  };
}

/**
 * Create a reusable LanguageTool-backed CM6 diagnostics extension.
 *
 * @param {Object} options
 * @param {(payload: Object) => Promise<Object>} options.check - async LT check function
 * @param {() => Object | Promise<Object>} [options.getPreferences] - returns effective prefs
 * @param {() => string[] | Promise<string[]>} [options.getDictionary] - custom dictionary words
 * @param {number} [options.debounceMs=700] - lint debounce
 * @param {number} [options.maxDiagnostics=50] - cap rendered diagnostics
 * @param {number} [options.maxFragments=12] - cap visible prose fragments checked
 * @param {number} [options.maxFragmentLength=4000] - skip giant fragments
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
  } = options;

  if (typeof check !== 'function') {
    throw new Error('createLanguageToolDiagnosticsExtension requires a check(payload) function');
  }

  return linter(async (view) => {
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
    needsRefresh(update) {
      return update.docChanged
        || update.viewportChanged
        || update.transactions.some((tr) => tr.annotation(forceLanguageToolRefresh));
    },
  });
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
 * Apply the first available LanguageTool quick-fix under the cursor.
 *
 * Selection strategy:
 * 1. diagnostics intersecting the current selection/cursor
 * 2. diagnostics on the current line
 * 3. first visible LanguageTool diagnostic with an action
 *
 * @param {import('@codemirror/view').EditorView} view
 * @returns {boolean} true if a suggestion was applied
 */
export function applyFirstLanguageToolSuggestion(view) {
  if (!view?.state) return false;

  const selection = view.state.selection.main;
  const cursorFrom = Math.min(selection.from, selection.to);
  const cursorTo = Math.max(selection.from, selection.to);
  const cursorLine = view.state.doc.lineAt(selection.head);
  const candidates = [];

  forEachDiagnostic(view.state, (diagnostic, from, to) => {
    if (diagnostic?.source !== 'languagetool') return;
    if (!Array.isArray(diagnostic.actions) || diagnostic.actions.length === 0) return;

    const intersectsSelection = from <= cursorTo && to >= cursorFrom;
    const onCurrentLine = from < cursorLine.to && to > cursorLine.from;
    const inVisibleRange = view.visibleRanges?.some?.((range) => from < range.to && to > range.from) ?? true;

    candidates.push({
      diagnostic,
      from,
      to,
      intersectsSelection,
      onCurrentLine,
      inVisibleRange,
    });
  });

  if (candidates.length === 0) return false;

  candidates.sort((a, b) => {
    if (a.intersectsSelection !== b.intersectsSelection) return a.intersectsSelection ? -1 : 1;
    if (a.onCurrentLine !== b.onCurrentLine) return a.onCurrentLine ? -1 : 1;
    if (a.inVisibleRange !== b.inVisibleRange) return a.inVisibleRange ? -1 : 1;
    return a.from - b.from;
  });

  const best = candidates[0];
  const action = best.diagnostic.actions[0];
  if (!action?.apply) return false;
  action.apply(view, best.from, best.to);
  return true;
}
