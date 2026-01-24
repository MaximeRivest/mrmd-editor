/**
 * Runtime CodeLens Block Detection
 *
 * Detects blocks that should have runtime CodeLens:
 * 1. `yaml config` blocks in mrmd.md containing session config
 * 2. Frontmatter in documents containing session overrides
 */

import yaml from 'yaml';

/** Supported runtime languages */
const RUNTIME_LANGUAGES = ['python', 'bash', 'node', 'julia', 'r', 'shell'];

/**
 * @typedef {Object} RuntimeConfig
 * @property {string} language - Runtime language (python, node, etc.)
 * @property {string} [name] - Session name
 * @property {string} [venv] - Virtual environment path (Python)
 * @property {string} [cwd] - Working directory
 * @property {boolean} [autoStart] - Auto-start on project open
 */

/**
 * @typedef {Object} DetectedBlock
 * @property {'config' | 'frontmatter'} type - Block type
 * @property {number} start - Start character offset
 * @property {number} end - End character offset
 * @property {number} fenceLineEnd - End of opening fence/delimiter line (where to place widget)
 * @property {string} content - Raw YAML content
 * @property {RuntimeConfig[]} runtimes - Parsed runtime configurations
 */

/**
 * Find all yaml config blocks containing session configuration
 * @param {string} content - Document content
 * @returns {DetectedBlock[]}
 */
export function findYamlConfigBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');

  let inBlock = false;
  let blockStart = 0;
  let fenceLineEnd = 0;
  let blockContent = [];
  let fenceChar = '';
  let fenceLength = 0;
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = charOffset;
    const lineEnd = charOffset + line.length;

    if (!inBlock) {
      // Look for opening fence: ```yaml config or ~~~yaml config
      const match = line.match(/^(`{3,}|~{3,})yaml\s+config\s*$/);
      if (match) {
        inBlock = true;
        blockStart = lineStart;
        fenceLineEnd = lineEnd;
        fenceChar = match[1][0];
        fenceLength = match[1].length;
        blockContent = [];
      }
    } else {
      // Look for closing fence (same char, at least same length)
      const closingPattern = new RegExp(`^${fenceChar}{${fenceLength},}\\s*$`);
      if (closingPattern.test(line)) {
        // Parse the YAML content
        const yamlContent = blockContent.join('\n');
        // Content starts after the opening fence line + newline
        const contentStartOffset = fenceLineEnd + 1;
        const runtimes = extractRuntimes(yamlContent, contentStartOffset);

        // Only include if it has runtime config
        if (runtimes.length > 0) {
          blocks.push({
            type: 'config',
            start: blockStart,
            end: lineEnd,
            fenceLineEnd,
            content: yamlContent,
            runtimes,
          });
        }

        inBlock = false;
        blockContent = [];
      } else {
        blockContent.push(line);
      }
    }

    charOffset += line.length + 1; // +1 for newline
  }

  return blocks;
}

/**
 * Find frontmatter block if it contains session configuration
 * @param {string} content - Document content
 * @returns {DetectedBlock | null}
 */
export function findSessionFrontmatter(content) {
  // Frontmatter must start at the beginning with ---
  if (!content.startsWith('---')) {
    return null;
  }

  // Find the closing ---
  const endMatch = content.indexOf('\n---', 3);
  if (endMatch === -1) {
    return null;
  }

  const yamlContent = content.slice(4, endMatch); // Skip opening ---\n
  const runtimes = extractRuntimes(yamlContent);

  // Only return if it has runtime config
  if (runtimes.length === 0) {
    return null;
  }

  return {
    type: 'frontmatter',
    start: 0,
    end: endMatch + 4, // Include closing ---
    fenceLineEnd: 3, // End of opening ---
    content: yamlContent,
    runtimes,
  };
}

/**
 * Extract runtime configurations from YAML content
 *
 * Supports both verbose and minimal syntax:
 * - Verbose: session: { python: { venv: .venv } }
 * - Minimal: python: .venv
 * - Minimal object: python: { venv: .venv }
 *
 * @param {string} yamlContent - Raw YAML string
 * @param {number} [contentStartOffset=0] - Character offset where YAML content starts in document
 * @returns {RuntimeConfig[]}
 */
export function extractRuntimes(yamlContent, contentStartOffset = 0) {
  const runtimes = [];

  try {
    const parsed = yaml.parse(yamlContent);
    if (!parsed) return runtimes;

    // Normalize: check for minimal syntax first, then verbose
    // This matches the normalization in mrmd-project
    const sessionConfig = normalizeToSessionConfig(parsed);

    if (!sessionConfig) {
      return runtimes;
    }

    // Check for each supported runtime language
    for (const language of RUNTIME_LANGUAGES) {
      const config = sessionConfig[language];
      if (config) {
        // Find the line where this runtime is declared
        // Try both minimal (python:) and verbose (  python: under session:)
        let lineOffset = null;

        // Try minimal syntax first (top-level python:)
        const minimalPattern = new RegExp(`^(${language}:)`, 'm');
        const minimalMatch = yamlContent.match(minimalPattern);

        if (minimalMatch) {
          const keyStart = minimalMatch.index;
          const lineEnd = yamlContent.indexOf('\n', keyStart);
          lineOffset = contentStartOffset + (lineEnd !== -1 ? lineEnd : keyStart + minimalMatch[1].length);
        } else {
          // Try verbose syntax (indented under session:)
          const verbosePattern = new RegExp(`^(  ${language}:)`, 'm');
          const verboseMatch = yamlContent.match(verbosePattern);

          if (verboseMatch) {
            const keyStart = verboseMatch.index;
            const lineEnd = yamlContent.indexOf('\n', keyStart);
            lineOffset = contentStartOffset + (lineEnd !== -1 ? lineEnd : keyStart + verboseMatch[1].length);
          }
        }

        runtimes.push({
          language,
          name: config.name || 'default',
          venv: config.venv,
          cwd: config.cwd,
          autoStart: config.auto_start ?? config.autoStart ?? true,
          lineOffset, // Position to place widget for this runtime
        });
      }
    }
  } catch (e) {
    // Invalid YAML - return empty
    console.warn('[RuntimeCodeLens] Failed to parse YAML:', e.message);
  }

  return runtimes;
}

/**
 * Normalize parsed YAML to session config format.
 * Handles both minimal syntax (python: .venv) and verbose (session: { python: { venv: .venv } })
 *
 * @param {object} parsed - Parsed YAML object
 * @returns {object | null} Session config object or null if no runtime config found
 */
function normalizeToSessionConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  // If already has session key, use it directly
  if (parsed.session && typeof parsed.session === 'object') {
    return parsed.session;
  }

  // Check for minimal syntax (python:, bash:, etc. at top level)
  const sessionConfig = {};
  let hasRuntime = false;

  for (const language of RUNTIME_LANGUAGES) {
    if (language in parsed) {
      const value = parsed[language];
      hasRuntime = true;

      if (typeof value === 'string') {
        // Minimal string form: python: .venv -> { venv: '.venv' }
        if (language === 'python') {
          sessionConfig[language] = { venv: value };
        } else {
          sessionConfig[language] = { cwd: value };
        }
      } else if (typeof value === 'object' && value !== null) {
        // Minimal object form: python: { venv: .venv }
        sessionConfig[language] = value;
      }
    }
  }

  return hasRuntime ? sessionConfig : null;
}

/**
 * Find all blocks (config blocks + frontmatter) that need CodeLens
 * @param {string} content - Document content
 * @param {Object} options
 * @param {boolean} [options.includeConfigBlocks=true] - Include yaml config blocks
 * @param {boolean} [options.includeFrontmatter=true] - Include frontmatter
 * @returns {DetectedBlock[]}
 */
export function findRuntimeBlocks(content, options = {}) {
  const { includeConfigBlocks = true, includeFrontmatter = true } = options;
  const blocks = [];

  if (includeConfigBlocks) {
    blocks.push(...findYamlConfigBlocks(content));
  }

  if (includeFrontmatter) {
    const frontmatter = findSessionFrontmatter(content);
    if (frontmatter) {
      blocks.push(frontmatter);
    }
  }

  // Sort by position (frontmatter first if present)
  blocks.sort((a, b) => a.start - b.start);

  return blocks;
}
