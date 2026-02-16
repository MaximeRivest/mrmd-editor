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
 * Update session configuration in document frontmatter.
 *
 * If frontmatter doesn't exist, creates it.
 * If values match project defaults, omits them (keeps frontmatter clean).
 *
 * @param {import('@codemirror/view').EditorView} view - CodeMirror editor view
 * @param {string} language - Runtime language (e.g. 'python', 'bash', 'r', 'julia')
 * @param {SessionConfig} config - Session configuration to set
 * @param {SessionConfig} [projectDefaults] - Defaults from mrmd.md to diff against
 */
export function updateFrontmatterSession(view, language, config, projectDefaults = {}) {
  const doc = view.state.doc;
  const content = doc.toString();
  const fm = parseFrontmatter(content);

  // Start with existing frontmatter data or empty object
  const data = fm.yaml ? { ...fm.yaml } : {};

  // Build session config, omitting values that match project defaults
  const sessionConfig = {};

  if (config.name !== undefined && config.name !== (projectDefaults.name || 'default')) {
    sessionConfig.name = config.name;
  }
  if (config.venv !== undefined && config.venv !== (projectDefaults.venv || '.venv')) {
    sessionConfig.venv = config.venv;
  }
  if (config.cwd !== undefined && config.cwd !== (projectDefaults.cwd || '.')) {
    sessionConfig.cwd = config.cwd;
  }
  if (config.auto_start !== undefined && config.auto_start !== true) {
    sessionConfig.auto_start = config.auto_start;
  }

  // Update the session section
  if (Object.keys(sessionConfig).length > 0) {
    if (!data.session) data.session = {};
    data.session[language] = {
      ...(data.session[language] || {}),
      ...sessionConfig,
    };
  } else {
    // All values match defaults — remove the language key if it exists
    if (data.session && data.session[language]) {
      delete data.session[language];
      if (Object.keys(data.session).length === 0) {
        delete data.session;
      }
    }
  }

  // Build new frontmatter string
  const newFrontmatter = buildFrontmatter(data);

  // Apply the change to the editor
  if (fm.exists && fm.range) {
    // Replace existing frontmatter
    if (newFrontmatter) {
      view.dispatch({
        changes: { from: fm.range.start, to: fm.range.end, insert: newFrontmatter },
      });
    } else {
      // Remove frontmatter entirely (and trailing newline if present)
      let removeEnd = fm.range.end;
      if (content[removeEnd] === '\n') removeEnd++;
      view.dispatch({
        changes: { from: fm.range.start, to: removeEnd, insert: '' },
      });
    }
  } else if (newFrontmatter) {
    // Insert new frontmatter at the top
    view.dispatch({
      changes: { from: 0, to: 0, insert: newFrontmatter + '\n\n' },
    });
  }
}

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
