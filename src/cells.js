/**
 * Code Cell Detection and Management
 *
 * Finds code blocks in markdown and manages their output blocks.
 * A code block becomes a "cell" that can be executed.
 */

/**
 * Languages that are executable (have potential runtimes)
 */
const EXECUTABLE_LANGUAGES = new Set([
  // Python
  'python', 'py', 'python3',
  // JavaScript
  'javascript', 'js', 'node',
  // TypeScript (transpiled to JS)
  'typescript', 'ts',
  // Shell
  'bash', 'sh', 'shell', 'zsh',
  // Other common ones
  'julia', 'jl',
  'r', 'rlang',
  // HTML (rendered, not "executed")
  'html',
  // CSS (applied to page)
  'css',
]);

/**
 * Languages that are rendered rather than executed
 */
const RENDERED_LANGUAGES = new Set(['html', 'html-rendered']);

/**
 * Find all code blocks in the document
 *
 * @param {string} content - Document content
 * @returns {Array<{
 *   language: string,
 *   session: string|null, // session name if specified (e.g., ```js mysession)
 *   code: string,
 *   start: number,      // start of opening fence
 *   end: number,        // end of closing fence
 *   codeStart: number,  // start of code content
 *   codeEnd: number,    // end of code content
 *   line: number,       // 0-indexed line number
 *   executable: boolean,
 *   rendered: boolean,
 * }>}
 */
export function findCodeBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');

  let inBlock = false;
  let blockStart = 0;
  let blockLanguage = '';
  let blockSession = null;
  let codeStart = 0;
  let blockLine = 0;
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = charOffset;

    if (!inBlock) {
      // Look for opening fence: ```language [session]
      // Examples: ```js, ```js sandbox, ```python myenv
      const match = line.match(/^(`{3,})(\w*)(?:\s+(\S+))?/);
      if (match) {
        inBlock = true;
        blockStart = lineStart;
        blockLanguage = match[2].toLowerCase();
        blockSession = match[3] || null; // session name after language
        codeStart = lineStart + line.length + 1; // +1 for newline
        blockLine = i;
      }
    } else {
      // Look for closing fence
      if (line.match(/^`{3,}\s*$/)) {
        const codeEnd = lineStart;
        const blockEnd = lineStart + line.length;

        blocks.push({
          language: blockLanguage,
          session: blockSession,
          code: content.slice(codeStart, codeEnd),
          start: blockStart,
          end: blockEnd,
          codeStart,
          codeEnd,
          line: blockLine,
          executable: EXECUTABLE_LANGUAGES.has(blockLanguage),
          rendered: RENDERED_LANGUAGES.has(blockLanguage),
        });

        inBlock = false;
        blockSession = null;
      }
    }

    charOffset += line.length + 1; // +1 for newline
  }

  return blocks;
}

/**
 * Find the code block at a given position
 *
 * @param {string} content - Document content
 * @param {number} pos - Cursor position
 * @returns {object|null} - Code block info or null
 */
export function findCodeBlockAtPosition(content, pos) {
  const blocks = findCodeBlocks(content);
  return blocks.find(b => pos >= b.start && pos <= b.end) || null;
}

/**
 * Find the output block following a code block
 * Supports both ```output and ```output:execId formats (3+ backticks)
 *
 * @param {string} content - Document content
 * @param {number} codeBlockEnd - End position of the code block
 * @returns {{start: number, end: number, contentStart: number, contentEnd: number, content: string, execId: string|null}|null}
 */
export function findOutputBlock(content, codeBlockEnd) {
  // Look for ```output or ```output:execId immediately after the code block
  // Supports variable-length fences (3+ backticks) with backreference for closing
  const after = content.slice(codeBlockEnd);

  // Allow for whitespace/newlines between blocks
  // Group 1: gap, Group 2: backticks, Group 3: rest of fence line, Group 4: execId (optional), Group 5: content
  const match = after.match(/^(\s*\n)(`{3,})(output(?::([^\n]*))?\n)([\s\S]*?)\2/);
  if (!match) return null;

  const gapLength = match[1].length;
  const backticks = match[2];
  const fenceRestLength = match[3].length;
  const fenceLength = backticks.length + fenceRestLength;
  const execId = match[4] || null;
  const outputContent = match[5];
  const closingLength = backticks.length;

  return {
    start: codeBlockEnd + gapLength,
    end: codeBlockEnd + gapLength + fenceLength + outputContent.length + closingLength,
    contentStart: codeBlockEnd + gapLength + fenceLength,
    contentEnd: codeBlockEnd + gapLength + fenceLength + outputContent.length,
    content: outputContent,
    execId,
  };
}

/**
 * Find an output block by its execution ID
 * Searches the entire document for ```output:execId (3+ backticks)
 *
 * @param {string} content - Document content
 * @param {string} execId - Execution ID to find
 * @returns {{start: number, end: number, contentStart: number, contentEnd: number, content: string, execId: string}|null}
 */
export function findOutputBlockByExecId(content, execId) {
  // Use regex to find output block with variable-length fences
  // Escape special regex characters in execId
  const escapedExecId = execId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(`{3,})output:' + escapedExecId + '[^\\n]*\\n([\\s\\S]*?)\\1', 'g');

  const match = regex.exec(content);
  if (!match) return null;

  const pos = match.index;
  const fullMatch = match[0];
  const backticks = match[1];
  const outputContent = match[2];

  // Find where content starts (after the first newline)
  const fenceLineEndIndex = fullMatch.indexOf('\n') + 1;
  const contentStart = pos + fenceLineEndIndex;
  const contentEnd = contentStart + outputContent.length;

  return {
    start: pos,
    end: pos + fullMatch.length,
    contentStart,
    contentEnd,
    content: outputContent,
    execId,
  };
}

/**
 * Find a stdin block by execution ID
 * Searches the entire document for ```stdin:execId (3+ backticks)
 *
 * @param {string} content - Document content
 * @param {string} execId - Execution ID to find
 * @returns {{start: number, end: number, contentStart: number, contentEnd: number, content: string, execId: string}|null}
 */
export function findStdinBlockByExecId(content, execId) {
  // Use regex to find stdin block with variable-length fences
  // Escape special regex characters in execId
  const escapedExecId = execId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(`{3,})stdin:' + escapedExecId + '[^\\n]*\\n([\\s\\S]*?)\\1', 'g');

  const match = regex.exec(content);
  if (!match) return null;

  const pos = match.index;
  const fullMatch = match[0];
  const stdinContent = match[2];

  // Find where content starts (after the first newline)
  const fenceLineEndIndex = fullMatch.indexOf('\n') + 1;
  const contentStart = pos + fenceLineEndIndex;
  const contentEnd = contentStart + stdinContent.length;

  return {
    start: pos,
    end: pos + fullMatch.length,
    contentStart,
    contentEnd,
    content: stdinContent,
    execId,
  };
}

/**
 * Generate a unique execution ID
 * Format: exec-{timestamp}-{random}
 *
 * @returns {string}
 */
export function generateExecId() {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Find executable code blocks (cells)
 *
 * @param {string} content - Document content
 * @returns {Array} - Executable code blocks
 */
export function findCells(content) {
  return findCodeBlocks(content).filter(b => b.executable);
}

/**
 * Get cell at index
 *
 * @param {string} content - Document content
 * @param {number} index - Cell index (0-based)
 * @returns {object|null}
 */
export function getCellAtIndex(content, index) {
  const cells = findCells(content);
  return cells[index] || null;
}

/**
 * Get cell at cursor position
 *
 * @param {string} content - Document content
 * @param {number} pos - Cursor position
 * @returns {object|null}
 */
export function getCellAtCursor(content, pos) {
  const block = findCodeBlockAtPosition(content, pos);
  if (block && block.executable) {
    return block;
  }
  return null;
}

/**
 * Count cells in document
 *
 * @param {string} content - Document content
 * @returns {number}
 */
export function countCells(content) {
  return findCells(content).length;
}
