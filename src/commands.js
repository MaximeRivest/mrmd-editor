/**
 * Editor Commands
 *
 * Standalone command functions that can be bound to keyboard shortcuts.
 * Each command is a factory that takes the editor API and returns a
 * CodeMirror command function: (view: EditorView) => boolean
 *
 * Commands return true if handled, false to let other handlers try.
 */

import { findCells, findCodeBlocks, getCellAtCursor, findCodeBlockAtPosition, findOutputBlock } from './cells.js';
import { indentRange } from '@codemirror/language';
import { applyFrontmatterTemplate } from './frontmatter-updater.js';
import { prettierFormat, prettierSupports } from './prettier.js';
import { applyFirstLanguageToolSuggestion } from './grammar.js';

/**
 * Run the current cell and stay in place.
 * Bound to Mod-Enter by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function runCell(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cell = getCellAtCursor(content, pos);

    // Only handle if cursor is in a cell
    if (!cell) return false;

    // Use queue if available for proper status indicators, otherwise fall back to direct execution
    if (editor.cellControls?.queue) {
      const cells = findCells(content);
      const cellIndex = cells.findIndex(c => c.start === cell.start);
      if (cellIndex >= 0) {
        editor.cellControls.queue.enqueue(cellIndex);
      }
    } else {
      editor.runCurrentCell();
    }
    return true;
  };
}

/**
 * Run the current cell and advance to the next cell.
 * If no next cell exists, create a new one with the same language.
 * Bound to Shift-Enter by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function runCellAndAdvance(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const currentCell = getCellAtCursor(content, pos);

    // Only handle if cursor is in a cell
    if (!currentCell) return false;

    // Store the current cell's position info - this helps us find it again after content changes
    const currentCellStart = currentCell.start;
    const lang = currentCell.language;

    // Find current cell index for queue
    const cells = findCells(content);
    const currentIndex = cells.findIndex(c => c.start === currentCellStart);

    // Check if there's a next cell BEFORE execution
    const hasNextCell = currentIndex >= 0 && currentIndex < cells.length - 1;

    // Run the cell using queue for proper status indicators
    if (editor.cellControls?.queue) {
      if (currentIndex >= 0) {
        editor.cellControls.queue.enqueue(currentIndex);
      }
    } else {
      editor.runCurrentCell();
    }

    // Re-fetch content AFTER execution was triggered (output block may have been created/modified)
    const updatedContent = view.state.doc.toString();
    const updatedCells = findCells(updatedContent);

    // Find our current cell again - it should still be at the same start position
    // (output blocks are inserted AFTER the cell, so cell start doesn't shift)
    let updatedCurrentIndex = updatedCells.findIndex(c => c.start === currentCellStart);

    // Fallback: if exact match fails, find by proximity (handles edge cases)
    if (updatedCurrentIndex === -1) {
      updatedCurrentIndex = updatedCells.findIndex(c =>
        Math.abs(c.start - currentCellStart) < 10 && c.language === lang
      );
    }

    // Last resort: use original index if within bounds
    if (updatedCurrentIndex === -1 && currentIndex >= 0 && currentIndex < updatedCells.length) {
      updatedCurrentIndex = currentIndex;
    }

    const updatedCurrentCell = updatedCells[updatedCurrentIndex];

    if (hasNextCell && updatedCurrentIndex >= 0 && updatedCurrentIndex < updatedCells.length - 1) {
      // Move to next cell - use the cell AFTER our current cell in the updated list
      const nextCell = updatedCells[updatedCurrentIndex + 1];
      view.dispatch({
        selection: { anchor: nextCell.codeStart },
        scrollIntoView: true
      });
    } else if (updatedCurrentCell) {
      // Create new cell with same language after output block (if any)
      const outputBlock = findOutputBlock(updatedContent, updatedCurrentCell.end);
      const insertPos = outputBlock ? outputBlock.end : updatedCurrentCell.end;

      // Template: newlines + fence + language + newline + empty line + closing fence
      const newCell = `\n\n\`\`\`${lang}\n\n\`\`\``;

      // Calculate cursor position: after opening fence + language + newline
      const cursorOffset = 4 + lang.length; // \n\n``` + lang + \n

      view.dispatch({
        changes: { from: insertPos, insert: newCell },
        selection: { anchor: insertPos + cursorOffset }
      });
    }

    return true;
  };
}

/**
 * Run all cells in the document.
 * Bound to Mod-Shift-Enter by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function runAllCells(editor) {
  return (view) => {
    // Use cellControls.runAll if available for proper queue handling
    if (editor.cellControls?.runAll) {
      editor.cellControls.runAll();
    } else {
      editor.runAll();
    }
    return true;
  };
}

/**
 * Run all cells above and including the current cell.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function runAllAbove(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cell = getCellAtCursor(content, pos);

    if (!cell) return false;

    // Use cellControls.runAllAbove if available for proper queue handling
    if (editor.cellControls?.runAllAbove) {
      editor.cellControls.runAllAbove();
    } else {
      editor.runAllAbove();
    }
    return true;
  };
}

/**
 * Navigate to the next cell.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function goToNextCell(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cells = findCells(content);

    // Find current cell or first cell after cursor
    const currentIndex = cells.findIndex(c => pos >= c.start && pos <= c.end);

    if (currentIndex >= 0 && currentIndex < cells.length - 1) {
      // In a cell, go to next
      const nextCell = cells[currentIndex + 1];
      view.dispatch({
        selection: { anchor: nextCell.codeStart },
        scrollIntoView: true
      });
      return true;
    } else if (currentIndex === -1) {
      // Not in a cell, find first cell after cursor
      const nextCell = cells.find(c => c.start > pos);
      if (nextCell) {
        view.dispatch({
          selection: { anchor: nextCell.codeStart },
          scrollIntoView: true
        });
        return true;
      }
    }

    return false;
  };
}

/**
 * Navigate to the previous cell.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function goToPrevCell(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cells = findCells(content);

    // Find current cell
    const currentIndex = cells.findIndex(c => pos >= c.start && pos <= c.end);

    if (currentIndex > 0) {
      // In a cell, go to previous
      const prevCell = cells[currentIndex - 1];
      view.dispatch({
        selection: { anchor: prevCell.codeStart },
        scrollIntoView: true
      });
      return true;
    } else if (currentIndex === -1) {
      // Not in a cell, find last cell before cursor
      const prevCells = cells.filter(c => c.end < pos);
      if (prevCells.length > 0) {
        const prevCell = prevCells[prevCells.length - 1];
        view.dispatch({
          selection: { anchor: prevCell.codeStart },
          scrollIntoView: true
        });
        return true;
      }
    }

    return false;
  };
}

/**
 * Clear the output of the current cell.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function clearCellOutput(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cells = findCells(content);
    const currentIndex = cells.findIndex(c => pos >= c.start && pos <= c.end);

    if (currentIndex >= 0) {
      editor.clearOutput(currentIndex);
      return true;
    }

    return false;
  };
}

/**
 * Insert a new cell below the current cell.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function insertCellBelow(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const currentCell = getCellAtCursor(content, pos);

    // Determine language and insert position
    const lang = currentCell?.language || editor?.defaultCellLanguage || 'python';
    const outputBlock = currentCell ? findOutputBlock(content, currentCell.end) : null;
    const insertPos = outputBlock ? outputBlock.end : (currentCell ? currentCell.end : content.length);

    const newCell = `\n\n\`\`\`${lang}\n\n\`\`\``;
    const cursorOffset = 4 + lang.length;

    view.dispatch({
      changes: { from: insertPos, insert: newCell },
      selection: { anchor: insertPos + cursorOffset }
    });

    return true;
  };
}

/**
 * Insert a new cell above the current cell.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function insertCellAbove(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const currentCell = getCellAtCursor(content, pos);

    const lang = currentCell?.language || editor?.defaultCellLanguage || 'python';
    const insertPos = currentCell ? currentCell.start : 0;

    const newCell = `\`\`\`${lang}\n\n\`\`\`\n\n`;
    const cursorOffset = 3 + lang.length + 1; // ``` + lang + \n

    view.dispatch({
      changes: { from: insertPos, insert: newCell },
      selection: { anchor: insertPos + cursorOffset }
    });

    return true;
  };
}

/**
 * Get the most common executable language in the document.
 * Excludes 'output' blocks.
 *
 * @param {string} content - Document content
 * @returns {string} Most common language, defaults to 'javascript'
 */
function getMostCommonLanguage(content) {
  const blocks = findCodeBlocks(content);
  const langCounts = {};

  for (const block of blocks) {
    // Skip output blocks and non-executable
    if (block.language === 'output' || !block.executable) continue;
    langCounts[block.language] = (langCounts[block.language] || 0) + 1;
  }

  // Find most common
  let maxCount = 0;
  let mostCommon = 'python'; // default (primary notebook runtime)

  for (const [lang, count] of Object.entries(langCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = lang;
    }
  }

  return mostCommon;
}

/**
 * Insert a new cell with the most common language in the document.
 * Bound to Mod-Shift-i by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function insertCellSmart(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;

    // Use most common language in document
    const lang = getMostCommonLanguage(content);

    // Insert at cursor position
    const newCell = `\n\`\`\`${lang}\n\n\`\`\`\n`;
    const cursorOffset = 2 + lang.length + 2; // \n``` + lang + \n\n (cursor on empty line)

    view.dispatch({
      changes: { from: pos, insert: newCell },
      selection: { anchor: pos + cursorOffset },
      scrollIntoView: true
    });

    return true;
  };
}

/**
 * Find the markdown section at cursor position (between code blocks).
 * Returns { start, end, content } or null if cursor is in a code block.
 *
 * @param {string} content - Document content
 * @param {number} pos - Cursor position
 * @returns {{start: number, end: number, content: string}|null}
 */
function findMarkdownSectionAtPosition(content, pos) {
  const blocks = findCodeBlocks(content);

  // Check if cursor is inside a code block
  for (const block of blocks) {
    if (pos >= block.start && pos <= block.end) {
      return null; // Inside a code block
    }
  }

  // Find the section boundaries
  let sectionStart = 0;
  let sectionEnd = content.length;

  for (const block of blocks) {
    if (block.end < pos) {
      // This block is before cursor
      sectionStart = block.end;
    }
    if (block.start > pos && block.start < sectionEnd) {
      // This block is after cursor
      sectionEnd = block.start;
    }
  }

  const sectionContent = content.slice(sectionStart, sectionEnd);

  // Skip if section is only whitespace
  if (!sectionContent.trim()) {
    return null;
  }

  return {
    start: sectionStart,
    end: sectionEnd,
    content: sectionContent
  };
}

/**
 * Format a code block using the best available formatter.
 * @private
 */
function formatCodeBlock(view, editor, currentCell) {
  const lang = currentCell.language.toLowerCase();

  // Helper to apply formatted code
  const applyFormat = (result) => {
    if (result.changed && result.formatted !== currentCell.code) {
      view.dispatch({
        changes: {
          from: currentCell.codeStart,
          to: currentCell.codeEnd,
          insert: result.formatted
        }
      });
      return true;
    }
    return false;
  };

  // Helper for indentRange fallback
  const fallbackIndent = () => {
    const changes = indentRange(view.state, currentCell.codeStart, currentCell.codeEnd);
    if (changes) {
      view.dispatch({ changes });
    }
  };

  // 1. Try Prettier for supported languages (JS, HTML, CSS, JSON, YAML, etc.)
  if (prettierSupports(lang)) {
    prettierFormat(currentCell.code, lang).then(result => {
      if (!applyFormat(result)) {
        fallbackIndent();
      }
    }).catch(err => {
      console.warn('[formatCell] Prettier failed:', err.message);
      fallbackIndent();
    });
    return true;
  }

  // 2. Try MRP formatter (Python via Black, etc.)
  editor.formatCode(currentCell.code, lang).then(result => {
    if (!applyFormat(result)) {
      fallbackIndent();
    }
  }).catch(err => {
    console.warn('[formatCell] MRP format failed:', err.message);
    fallbackIndent();
  });

  return true;
}

/**
 * Format the current section (code cell or markdown between cells).
 * - If cursor is in a code block: formats that code block
 * - If cursor is in markdown: formats the markdown section between code blocks
 * Bound to Mod-Shift-f by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function formatCell(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;

    // Check if we're in a code block
    const currentCell = findCodeBlockAtPosition(content, pos);

    if (currentCell) {
      // Format code block
      return formatCodeBlock(view, editor, currentCell);
    }

    // Check if we're in a markdown section
    const markdownSection = findMarkdownSectionAtPosition(content, pos);

    if (markdownSection) {
      // Format markdown section
      prettierFormat(markdownSection.content, 'markdown').then(result => {
        if (result.changed && result.formatted !== markdownSection.content) {
          view.dispatch({
            changes: {
              from: markdownSection.start,
              to: markdownSection.end,
              insert: result.formatted
            }
          });
        }
      }).catch(err => {
        console.warn('[formatCell] Markdown format failed:', err.message);
      });
      return true;
    }

    return false;
  };
}

/**
 * Format the entire document (all code blocks and markdown sections).
 * Bound to Mod-Alt-Shift-f by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function formatDocument(editor) {
  return async (view) => {
    const content = view.state.doc.toString();
    const blocks = findCodeBlocks(content);

    // Build list of all sections (code blocks + markdown between them)
    const sections = [];
    let lastEnd = 0;

    for (const block of blocks) {
      // Add markdown section before this block (if any)
      if (block.start > lastEnd) {
        const mdContent = content.slice(lastEnd, block.start);
        if (mdContent.trim()) {
          sections.push({
            type: 'markdown',
            start: lastEnd,
            end: block.start,
            content: mdContent
          });
        }
      }

      // Add the code block
      sections.push({
        type: 'code',
        language: block.language.toLowerCase(),
        start: block.codeStart,
        end: block.codeEnd,
        content: block.code,
        block
      });

      lastEnd = block.end;
    }

    // Add trailing markdown (if any)
    if (lastEnd < content.length) {
      const mdContent = content.slice(lastEnd);
      if (mdContent.trim()) {
        sections.push({
          type: 'markdown',
          start: lastEnd,
          end: content.length,
          content: mdContent
        });
      }
    }

    // Format all sections and collect changes
    // Process in reverse order so positions don't shift
    const changes = [];

    for (const section of sections.reverse()) {
      try {
        let result;

        if (section.type === 'markdown') {
          result = await prettierFormat(section.content, 'markdown');
        } else if (prettierSupports(section.language)) {
          result = await prettierFormat(section.content, section.language);
        } else {
          result = await editor.formatCode(section.content, section.language);
        }

        if (result.changed && result.formatted !== section.content) {
          changes.push({
            from: section.start,
            to: section.end,
            insert: result.formatted
          });
        }
      } catch (err) {
        console.warn('[formatDocument] Failed to format section:', err.message);
      }
    }

    // Apply all changes at once
    if (changes.length > 0) {
      view.dispatch({ changes });
    }

    return true;
  };
}

/**
 * Detect the indentation style used in a code block.
 * Returns { useTabs: boolean, size: number }
 *
 * @param {string} code - Code content
 * @returns {{ useTabs: boolean, size: number }}
 */
function detectIndentStyle(code) {
  const lines = code.split('\n');
  let tabCount = 0;
  let spaceIndents = [];

  for (const line of lines) {
    if (line.length === 0) continue;

    // Check what the line starts with
    const match = line.match(/^(\s+)/);
    if (!match) continue;

    const indent = match[1];
    if (indent.includes('\t')) {
      tabCount++;
    } else if (indent.length > 0) {
      spaceIndents.push(indent.length);
    }
  }

  // If tabs are predominant, use tabs
  if (tabCount > spaceIndents.length) {
    return { useTabs: true, size: 1 };
  }

  // Detect space indent size by finding GCD of indent lengths
  if (spaceIndents.length > 0) {
    // Find the smallest non-zero indent
    const minIndent = Math.min(...spaceIndents.filter(n => n > 0));
    // Common indent sizes are 2 or 4
    if (minIndent <= 4) {
      return { useTabs: false, size: minIndent };
    }
  }

  // Default: 2 spaces
  return { useTabs: false, size: 2 };
}

/**
 * Indent the current line or selection.
 * Matches the existing indentation style in the code cell.
 * Bound to Tab by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function indent(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cell = getCellAtCursor(content, pos);

    // Detect indentation style from current cell
    const style = cell ? detectIndentStyle(cell.code) : { useTabs: false, size: 2 };
    const indentStr = style.useTabs ? '\t' : ' '.repeat(style.size);

    const selection = view.state.selection.main;
    const doc = view.state.doc;

    // Get the range of lines to indent
    const fromLine = doc.lineAt(selection.from);
    const toLine = doc.lineAt(selection.to);

    // Build changes to indent each line
    const changes = [];
    for (let lineNum = fromLine.number; lineNum <= toLine.number; lineNum++) {
      const line = doc.line(lineNum);
      changes.push({ from: line.from, insert: indentStr });
    }

    view.dispatch({ changes, userEvent: 'input.indent' });
    return true;
  };
}

/**
 * Dedent the current line or selection.
 * Matches the existing indentation style in the code cell.
 * Bound to Shift-Tab by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function dedent(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cell = getCellAtCursor(content, pos);

    // Detect indentation style from current cell
    const style = cell ? detectIndentStyle(cell.code) : { useTabs: false, size: 2 };

    const selection = view.state.selection.main;
    const doc = view.state.doc;

    // Get the range of lines to dedent
    const fromLine = doc.lineAt(selection.from);
    const toLine = doc.lineAt(selection.to);

    // Build changes to dedent each line
    const changes = [];
    for (let lineNum = fromLine.number; lineNum <= toLine.number; lineNum++) {
      const line = doc.line(lineNum);
      const lineText = line.text;

      if (style.useTabs && lineText.startsWith('\t')) {
        // Remove one tab
        changes.push({ from: line.from, to: line.from + 1 });
      } else if (!style.useTabs) {
        // Remove up to `size` spaces
        const match = lineText.match(/^( +)/);
        if (match) {
          const spaces = Math.min(match[1].length, style.size);
          changes.push({ from: line.from, to: line.from + spaces });
        }
      }
    }

    if (changes.length > 0) {
      view.dispatch({ changes, userEvent: 'input.dedent' });
    }
    return true;
  };
}

/**
 * View source code for symbol under cursor.
 * Opens source panel with full source code and enables drill-down navigation.
 * Bound to F12 by default.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function viewSource(editor) {
  return (view) => {
    const content = view.state.doc.toString();
    const pos = view.state.selection.main.head;
    const cell = getCellAtCursor(content, pos);

    // Only handle if cursor is in a cell
    if (!cell) return false;

    // Call viewSource asynchronously (command returns immediately)
    editor.viewSource(pos).catch(e => {
      console.error('[viewSource] Error:', e);
    });

    return true;
  };
}

/**
 * Insert or augment scholarly frontmatter at the top of the document.
 * Preserves existing frontmatter values and adds missing template fields.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function insertFrontmatterTemplate(editor) {
  return (view) => {
    const result = applyFrontmatterTemplate(view.state.doc.toString());

    if (!result) {
      console.warn('[frontmatter] Cannot apply template to invalid frontmatter. Fix YAML first.');
      return false;
    }

    const spec = {
      changes: result.changes,
      scrollIntoView: true,
    };

    if (result.selection) {
      spec.selection = {
        anchor: result.selection.from,
        head: result.selection.to,
      };
    }

    view.dispatch(spec);
    return true;
  };
}

/**
 * Apply the first available grammar suggestion near the cursor.
 *
 * @param {Object} editor - Editor API instance
 * @returns {(view: EditorView) => boolean}
 */
export function applyFirstGrammarSuggestion(editor) {
  return (view) => applyFirstLanguageToolSuggestion(view);
}

/**
 * All available commands.
 * Maps command names to factory functions.
 */
export const commandRegistry = {
  runCell,
  runCellAndAdvance,
  runAllCells,
  runAllAbove,
  goToNextCell,
  goToPrevCell,
  clearCellOutput,
  insertCellBelow,
  insertCellAbove,
  insertCellSmart,
  formatCell,
  formatDocument,
  indent,
  dedent,
  viewSource,
  insertFrontmatterTemplate,
  applyFirstGrammarSuggestion,
};
