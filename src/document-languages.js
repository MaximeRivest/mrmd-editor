/**
 * Document Language Detection
 *
 * Scans a document's content for fenced code blocks and extracts
 * the set of executable programming languages used.
 *
 * Used by the notebook-scoped runtimes panel to show only relevant runtimes.
 *
 * @module document-languages
 */

// Languages that have runtimes (executable code blocks)
const RUNTIME_LANGUAGES = new Set([
  'python', 'bash', 'javascript', 'julia', 'r', 'shell', 'node', 'typescript',
]);

// Non-executable languages (display-only, config, or markup)
const NON_EXECUTABLE_LANGUAGES = new Set([
  'yaml', 'json', 'toml', 'xml', 'html', 'css', 'mermaid',
  'output', 'markdown', 'md', 'text', 'txt', 'diff', 'csv',
  'sql', 'graphql', 'latex', 'tex', 'bibtex',
]);

// Language alias normalization map
const LANGUAGE_ALIASES = {
  py: 'python',
  python3: 'python',
  js: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  typescript: 'javascript', // Same runtime as JS
  jl: 'julia',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  rlang: 'r',
};

/**
 * Extract the set of executable programming languages from a document.
 *
 * Scans for fenced code blocks (``` or ~~~) and collects their language tags,
 * filtering out non-executable languages (yaml, json, html, css, mermaid, output, etc.)
 * and normalizing aliases (py → python, js → javascript, etc.)
 *
 * @param {string} content - Document content (full markdown text)
 * @returns {Set<string>} Set of normalized language names (e.g. Set(['python', 'bash']))
 */
export function getDocumentLanguages(content) {
  const languages = new Set();
  // Match opening fences: ```python or ~~~julia
  // Also handle ```python config (skip config blocks)
  const fenceRegex = /^(`{3,}|~{3,})(\w+)(?:\s+(.*))?$/gm;
  let match;

  while ((match = fenceRegex.exec(content))) {
    const rawLang = match[2].toLowerCase();
    const extra = (match[3] || '').trim().toLowerCase();

    // Skip config blocks (```yaml config)
    if (extra === 'config') continue;

    // Skip non-executable languages
    if (NON_EXECUTABLE_LANGUAGES.has(rawLang)) continue;

    // Normalize aliases
    const normalized = LANGUAGE_ALIASES[rawLang] || rawLang;

    // Only include if it's a known runtime language
    // (to avoid random annotation languages like "diagram" etc.)
    if (RUNTIME_LANGUAGES.has(rawLang) || RUNTIME_LANGUAGES.has(normalized)) {
      languages.add(normalized);
    }
  }

  return languages;
}

/**
 * Map a normalized language name to its display label and badge color.
 *
 * @param {string} language - Normalized language name
 * @returns {{ label: string, badgeClass: string }}
 */
export function getLanguageDisplay(language) {
  const displays = {
    python: { label: 'Python', badgeClass: 'python' },
    javascript: { label: 'JavaScript', badgeClass: 'javascript' },
    bash: { label: 'Bash', badgeClass: 'bash' },
    julia: { label: 'Julia', badgeClass: 'julia' },
    r: { label: 'R', badgeClass: 'r' },
  };
  return displays[language] || { label: language, badgeClass: language };
}

/**
 * Check if a language is executable (has a runtime).
 *
 * @param {string} language - Language name (raw or normalized)
 * @returns {boolean}
 */
export function isExecutableLanguage(language) {
  const normalized = LANGUAGE_ALIASES[language.toLowerCase()] || language.toLowerCase();
  return RUNTIME_LANGUAGES.has(normalized);
}
