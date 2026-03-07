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
  try {
    const parsed = yaml.parse(rawYaml) || {};
    return {
      exists: true,
      yaml: parsed,
      range: { start: 0, end: endIdx + 4 },
      raw: rawYaml,
    };
  } catch (e) {
    console.warn('[frontmatter-updater] Failed to parse YAML:', e.message);
    return { exists: true, yaml: null, range: { start: 0, end: endIdx + 4 }, raw: rawYaml };
  }
}

/**
 * Build frontmatter YAML string from an object.
 *
 * @param {object} data - Frontmatter data
 * @returns {string} Complete frontmatter block including --- delimiters
 */
export function buildFrontmatter(data) {
  const cleaned = cleanObject(data);

  if (!cleaned || Object.keys(cleaned).length === 0) {
    return '';
  }

  const yamlStr = yaml.stringify(cleaned, {
    indent: 2,
    lineWidth: 0,
  }).trimEnd();

  return `---\n${yamlStr}\n---`;
}

/**
 * Recursively remove null, undefined, and empty object values.
 *
 * @param {any} obj
 * @returns {any}
 */
function cleanObject(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(cloneValue).filter(v => v !== undefined);
  if (typeof obj !== 'object') return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const cleaned = cleanObject(value);
      if (cleaned && Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else if (Array.isArray(value)) {
      const cleanedArray = value.map(cloneValue).filter(v => v !== undefined);
      if (cleanedArray.length > 0) {
        result[key] = cleanedArray;
      }
    } else {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)]));
  }
  return value;
}

function mergeTemplateWithExisting(templateValue, existingValue) {
  if (existingValue === undefined || existingValue === null) {
    return cloneValue(templateValue);
  }

  if (Array.isArray(existingValue)) {
    return cloneValue(existingValue);
  }

  if (isPlainObject(templateValue) && isPlainObject(existingValue)) {
    const result = {};
    const keys = new Set([...Object.keys(templateValue), ...Object.keys(existingValue)]);
    for (const key of keys) {
      result[key] = mergeTemplateWithExisting(templateValue?.[key], existingValue?.[key]);
    }
    return result;
  }

  return cloneValue(existingValue);
}

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createTitleSelection(frontmatterBlock) {
  const prefix = 'title: ';
  const start = frontmatterBlock.indexOf(prefix);
  if (start === -1) return null;
  const from = start + prefix.length;
  const lineEnd = frontmatterBlock.indexOf('\n', from);
  return {
    from,
    to: lineEnd === -1 ? from : lineEnd,
  };
}

/**
 * Create a scholarly frontmatter template.
 *
 * @param {Date} [now]
 * @returns {object}
 */
export function createArticleFrontmatterTemplate(now = new Date()) {
  return {
    title: 'Untitled',
    date: formatLocalDate(now),
    author: [
      {
        name: 'Your Name',
        id: 'your-id',
        orcid: '0000-0000-0000-0000',
        email: 'you@example.com',
        affiliation: [
          {
            name: 'Your Institution',
            city: 'City',
            state: 'State',
            url: 'https://example.org',
          },
        ],
      },
    ],
    abstract: 'Write your abstract here.\n',
    keywords: ['Keyword 1', 'Keyword 2'],
    license: 'CC BY',
    copyright: {
      holder: 'Your Name',
      year: now.getFullYear(),
    },
    citation: {
      'container-title': 'Journal or Venue',
      volume: 1,
      issue: 1,
      doi: '10.0000/example',
    },
    funding: 'Add funding information here.',
  };
}

/**
 * Build a document edit that inserts or augments frontmatter with a template.
 * Existing values win, while missing keys are added from the template.
 *
 * @param {string} content - Full document content
 * @param {object} [templateData] - Template frontmatter data
 * @returns {{ changes: {from: number, to: number, insert: string}, selection: {from: number, to: number}|null, data: object }|null}
 */
export function applyFrontmatterTemplate(content, templateData = createArticleFrontmatterTemplate()) {
  const fm = parseFrontmatter(content);

  if (fm.exists && !fm.yaml) {
    return null;
  }

  const merged = fm.exists
    ? mergeTemplateWithExisting(templateData, fm.yaml || {})
    : cloneValue(templateData);

  const frontmatterBlock = buildFrontmatter(merged);
  const selection = createTitleSelection(frontmatterBlock);

  if (!fm.exists) {
    return {
      changes: {
        from: 0,
        to: 0,
        insert: `${frontmatterBlock}${content.length > 0 ? '\n\n' : '\n'}`,
      },
      selection,
      data: merged,
    };
  }

  return {
    changes: {
      from: fm.range?.start ?? 0,
      to: fm.range?.end ?? 0,
      insert: frontmatterBlock,
    },
    selection,
    data: merged,
  };
}

/**
 * Read current session configuration from document frontmatter.
 *
 * @param {string} content - Full document content
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
 * @param {string} content - Full document content
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
