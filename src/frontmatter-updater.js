/**
 * Frontmatter Session Updater
 *
 * Programmatically updates session/runtime configuration in a document's
 * YAML frontmatter. Used by the runtimes panel UI to persist configuration
 * changes back to the document.
 *
 * @module frontmatter-updater
 */

import yaml from 'yaml';

/**
 * @typedef {Object} SessionConfig
 * @property {string} [name] - Session name
 * @property {string} [venv] - Virtual environment path (Python)
 * @property {string} [cwd] - Working directory
 * @property {boolean} [auto_start] - Auto-start on project open
 */

/**
 * Parse existing frontmatter from document content.
 *
 * @param {string} content - Full document content
 * @returns {{ exists: boolean, yaml: object|null, range: {start: number, end: number}|null, raw: string|null }}
 */
export function parseFrontmatter(content) {
  if (!content.startsWith('---')) {
    return { exists: false, yaml: null, range: null, raw: null };
  }

  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { exists: false, yaml: null, range: null, raw: null };
  }

  const rawYaml = content.slice(4, endIdx); // Skip opening ---\n
  const endOfClosing = endIdx + 4; // Include \n---

  try {
    const parsed = yaml.parse(rawYaml) || {};
    return {
      exists: true,
      yaml: parsed,
      range: { start: 0, end: endOfClosing },
      raw: rawYaml,
    };
  } catch (e) {
    console.warn('[frontmatter-updater] Failed to parse YAML:', e.message);
    return { exists: true, yaml: null, range: { start: 0, end: endOfClosing }, raw: rawYaml };
  }
}

/**
 * Build frontmatter YAML string from an object.
 *
 * @param {object} data - Frontmatter data
 * @returns {string} Complete frontmatter block including --- delimiters
 */
function buildFrontmatter(data) {
  // Remove empty/null values
  const cleaned = cleanObject(data);

  if (!cleaned || Object.keys(cleaned).length === 0) {
    return '';
  }

  const yamlStr = yaml.stringify(cleaned, {
    indent: 2,
    lineWidth: 0, // Don't wrap lines
  }).trimEnd();

  return `---\n${yamlStr}\n---`;
}

/**
 * Recursively remove null, undefined, and empty object values.
 * @param {any} obj
 * @returns {any}
 */
function cleanObject(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object' || Array.isArray(obj)) return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleaned = cleanObject(value);
      if (cleaned && Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
/**
 * Read current session configuration from document frontmatter.
 *
 * @param {string} content - Document content
 * @param {string} language - Runtime language
 * @returns {SessionConfig} Current session config (may be empty object if using defaults)
 */
export function readFrontmatterSession(content, language) {
  const fm = parseFrontmatter(content);
  if (!fm.yaml) return {};

  // Check verbose syntax: session.python.venv
  if (fm.yaml.session && fm.yaml.session[language]) {
    return { ...fm.yaml.session[language] };
  }

  // Check minimal syntax: python: ".venv"
  if (fm.yaml[language]) {
    const value = fm.yaml[language];
    if (typeof value === 'string') {
      if (language === 'python') return { venv: value };
      return { cwd: value };
    }
    if (typeof value === 'object') return { ...value };
  }

  return {};
}

/**
 * Get the effective session configuration for a document,
 * merging project defaults with document-level overrides.
 *
 * @param {string} content - Document content
 * @param {string} language - Runtime language
 * @param {SessionConfig} projectDefaults - Defaults from mrmd.md
 * @returns {SessionConfig} Effective configuration
 */
export function getEffectiveSessionConfig(content, language, projectDefaults = {}) {
  const docConfig = readFrontmatterSession(content, language);
  return {
    name: docConfig.name || projectDefaults.name || 'default',
    venv: docConfig.venv || projectDefaults.venv || '.venv',
    cwd: docConfig.cwd || projectDefaults.cwd || '.',
    auto_start: docConfig.auto_start ?? projectDefaults.auto_start ?? true,
  };
}
