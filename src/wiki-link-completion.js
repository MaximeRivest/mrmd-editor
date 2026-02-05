/**
 * Wiki-link autocomplete for [[internal-links]]
 *
 * Provides autocomplete suggestions when typing [[filename]] style links
 * in markdown content. Integrates with FSML project structure.
 *
 * Usage:
 *   // In editor setup:
 *   const wikiLinkExt = createWikiLinkCompletionExtension();
 *   view.dispatch({ effects: StateEffect.appendConfig.of(wikiLinkExt) });
 *
 *   // To provide project files:
 *   view.dispatch({ effects: StateEffect.appendConfig.of(
 *     projectFilesFacet.of(files)
 *   )});
 *
 * @module wiki-link-completion
 */

import { Facet } from '@codemirror/state';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';

const DOC_EXTENSIONS = ['.md', '.qmd'];

function isDocFile(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  return DOC_EXTENSIONS.some(ext => lower.endsWith(ext));
}

// #region FACET

/**
 * @typedef {Object} ProjectFile
 * @property {string} path - Relative path from project root (e.g., '02-getting-started/01-setup.md')
 * @property {string} title - Human-readable title (e.g., 'Setup')
 * @property {string} name - Filename without order prefix or extension (e.g., 'setup')
 */

/**
 * Facet to provide project files for wiki-link completion.
 *
 * The value should be an array of ProjectFile objects.
 *
 * @example
 * // Provide project files to editor
 * view.dispatch({
 *   effects: StateEffect.appendConfig.of(
 *     projectFilesFacet.of([
 *       { path: '01-intro.md', title: 'Introduction', name: 'intro' },
 *       { path: '02-setup.md', title: 'Setup', name: 'setup' },
 *     ])
 *   )
 * });
 *
 * @type {Facet<ProjectFile[], ProjectFile[]>}
 */
export const projectFilesFacet = Facet.define({
  combine: (values) => values[values.length - 1] || [],
});

// #endregion FACET

// #region DETECTION

/**
 * Check if cursor position is inside a code block.
 *
 * We only want wiki-link completion in markdown prose, not in code blocks.
 *
 * @param {CompletionContext} context
 * @returns {boolean}
 */
function isInCodeBlock(context) {
  const tree = syntaxTree(context.state);
  let node = tree.resolveInner(context.pos, -1);

  while (node) {
    const name = node.type.name;
    // Check for fenced code blocks and inline code
    if (
      name === 'FencedCode' ||
      name === 'CodeBlock' ||
      name === 'CodeText' ||
      name === 'InlineCode' ||
      name.startsWith('CodeInfo') ||
      name.startsWith('CodeMark')
    ) {
      return true;
    }
    node = node.parent;
  }

  return false;
}

/**
 * Detect [[ trigger and extract the query.
 *
 * @param {CompletionContext} context
 * @returns {{ from: number, query: string } | null}
 */
function detectWikiLinkTrigger(context) {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // Match [[ followed by optional partial text (not containing ] or |)
  // This handles: [[, [[s, [[setup, [[getting-started
  const match = textBefore.match(/\[\[([^\]|#]*)$/);

  if (!match) return null;

  return {
    from: context.pos - match[1].length,
    query: match[1],
  };
}

// #endregion DETECTION

// #region SPECIAL_LINKS

/**
 * Special wiki-links defined in the FSML spec.
 * These navigate relative to the current document.
 */
const SPECIAL_LINKS = [
  { name: 'next', title: 'Next Document', description: 'Navigate to the next document in order' },
  { name: 'prev', title: 'Previous Document', description: 'Navigate to the previous document in order' },
  { name: 'home', title: 'Home', description: 'Navigate to the first document in project' },
  { name: 'up', title: 'Up', description: 'Navigate to parent section' },
  { name: 'toc', title: 'Table of Contents', description: 'Insert table of contents for current section' },
];

// #endregion SPECIAL_LINKS

// #region COMPLETION_SOURCE

/**
 * Create a wiki-link completion source.
 *
 * @returns {import('@codemirror/autocomplete').CompletionSource}
 */
export function createWikiLinkCompletionSource() {
  return (context) => {
    // Don't complete in code blocks
    if (isInCodeBlock(context)) {
      return null;
    }

    // Detect [[ trigger
    const trigger = detectWikiLinkTrigger(context);
    if (!trigger) {
      return null;
    }

    // Get project files from facet
    const files = context.state.facet(projectFilesFacet);

    // Filter and score files
    const query = trigger.query.toLowerCase();
    const scored = [];

    // Add special links
    for (const special of SPECIAL_LINKS) {
      if (!query || special.name.startsWith(query)) {
        scored.push({
          file: { path: special.name, title: special.title, name: special.name },
          score: query && special.name === query ? 2000 : 1500, // Special links have high priority
          isSpecial: true,
          description: special.description,
        });
      }
    }

    // If no project files, return just special links
    if (!files || files.length === 0) {
      if (scored.length === 0) return null;
      return {
        from: trigger.from,
        options: scored.map(({ file, description }) => ({
          label: file.title,
          detail: `[[${file.name}]]`,
          info: description,
          apply: (view, completion, from, to) => {
            view.dispatch({
              changes: { from, to, insert: file.name + ']]' },
              selection: { anchor: from + file.name.length + 2 },
            });
          },
          type: 'keyword',
          boost: 10,
        })),
        validFor: /^[^\]|#]*$/,
      };
    }

    for (const file of files) {
      // Skip non-markdown or special files
      if (!isDocFile(file.path)) continue;
      if (file.path === 'mrmd.md') continue;
      if (file.name === 'index') continue; // Skip index files, use folder name instead

      const pathLower = file.path.toLowerCase();
      const titleLower = file.title.toLowerCase();
      const nameLower = file.name.toLowerCase();

      // Calculate match score
      let score = 0;

      if (!query) {
        // Empty query - show all files, prioritize by depth
        score = 100 - file.path.split('/').length * 10;
      } else if (nameLower === query) {
        // Exact name match
        score = 1000;
      } else if (nameLower.startsWith(query)) {
        // Name starts with query
        score = 500 + (100 - nameLower.length);
      } else if (titleLower.startsWith(query)) {
        // Title starts with query
        score = 400 + (100 - titleLower.length);
      } else if (nameLower.includes(query)) {
        // Name contains query
        score = 200 + (100 - nameLower.indexOf(query));
      } else if (titleLower.includes(query)) {
        // Title contains query
        score = 150 + (100 - titleLower.indexOf(query));
      } else if (pathLower.includes(query)) {
        // Path contains query
        score = 100 + (100 - pathLower.indexOf(query));
      }

      if (score > 0) {
        scored.push({ file, score });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Convert to completion options
    const options = scored.slice(0, 50).map(({ file, isSpecial, description }) => ({
      label: file.title,
      detail: isSpecial ? `[[${file.name}]]` : file.path,
      info: description || undefined,
      // Insert just the filename (FSML-style link)
      apply: (view, completion, from, to) => {
        // Insert the name followed by ]]
        view.dispatch({
          changes: { from, to, insert: file.name + ']]' },
          selection: { anchor: from + file.name.length + 2 },
        });
      },
      type: isSpecial ? 'keyword' : 'file',
      boost: isSpecial ? 10 : 0,
    }));

    if (options.length === 0) {
      return null;
    }

    return {
      from: trigger.from,
      options,
      validFor: /^[^\]|#]*$/,
    };
  };
}

// #endregion COMPLETION_SOURCE

// #region EXTENSION

/**
 * Create the wiki-link completion extension.
 *
 * This creates a standalone autocompletion extension that will work
 * when no other completion sources are active (e.g., before runtime providers
 * are connected).
 *
 * When runtime-lsp completion is added later, it includes wiki-link source
 * via the `additionalSources` parameter, so both work together.
 *
 * @returns {import('@codemirror/state').Extension}
 *
 * @example
 * const editor = mrmd.create('#editor', { doc: '# Test' });
 * editor.view.dispatch({
 *   effects: StateEffect.appendConfig.of([
 *     createWikiLinkCompletionExtension(),
 *     projectFilesFacet.of(projectFiles),
 *   ])
 * });
 */
export function createWikiLinkCompletionExtension() {
  const source = createWikiLinkCompletionSource();

  return autocompletion({
    override: [source],
    activateOnTyping: true,
    defaultKeymap: true,
    closeOnBlur: true,
    interactionDelay: 75,
  });
}

/**
 * Get just the completion source (for combining with other sources).
 *
 * Use this when you need to add wiki-link completion to an existing
 * autocompletion setup with other sources.
 *
 * @returns {import('@codemirror/autocomplete').CompletionSource}
 */
export function getWikiLinkCompletionSource() {
  return createWikiLinkCompletionSource();
}

// #endregion EXTENSION

// #region STYLES

/**
 * CSS styles for wiki-link completion items.
 */
export const wikiLinkCompletionStyles = `
/* Wiki-link completion styling */
.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionLabel {
  /* Selected item label color */
}

.cm-tooltip-autocomplete .cm-completionIcon-file::after {
  content: '📄';
}
`;

let stylesInjected = false;

/**
 * Inject wiki-link completion styles into document.
 */
export function injectWikiLinkCompletionStyles() {
  if (stylesInjected || typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.id = 'mrmd-wiki-link-completion-styles';
  style.textContent = wikiLinkCompletionStyles;
  document.head.appendChild(style);
  stylesInjected = true;
}

// #endregion STYLES

// #region EXPORTS

export default {
  projectFilesFacet,
  createWikiLinkCompletionSource,
  createWikiLinkCompletionExtension,
  wikiLinkCompletionStyles,
  injectWikiLinkCompletionStyles,
};

// #endregion EXPORTS
