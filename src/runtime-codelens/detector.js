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
 * @param {string} yamlContent - Raw YAML string
 * @param {number} [contentStartOffset=0] - Character offset where YAML content starts in document
 * @returns {RuntimeConfig[]}
 */
export function extractRuntimes(yamlContent, contentStartOffset = 0) {
  const runtimes = [];

  try {
    const parsed = yaml.parse(yamlContent);
    if (!parsed?.session) {
      return runtimes;
    }

    // Check for each supported runtime language
    for (const language of RUNTIME_LANGUAGES) {
      const config = parsed.session[language];
      if (config) {
        // Find the line where this runtime is declared (e.g., "  python:")
        // Search for the pattern with proper indentation under session:
        const pattern = new RegExp(`^(  ${language}:)`, 'm');
        const match = yamlContent.match(pattern);
        let lineOffset = null;

        if (match) {
          // Find the end of the line where this runtime key appears
          const keyStart = match.index;
          const lineEnd = yamlContent.indexOf('\n', keyStart);
          lineOffset = contentStartOffset + (lineEnd !== -1 ? lineEnd : keyStart + match[1].length);
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
