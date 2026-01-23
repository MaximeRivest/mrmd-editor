/**
 * Keyboard Shortcuts
 *
 * Default keybindings and keymap creation utilities.
 * Uses CodeMirror's keymap system for proper integration.
 */

import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { acceptCompletion } from '@codemirror/autocomplete';
import { commandRegistry } from './commands.js';

/**
 * Default keyboard shortcuts.
 * Uses 'Mod' for platform-appropriate modifier (Cmd on Mac, Ctrl elsewhere).
 *
 * Users can override these via config.keymap or editor.setKeymap()
 */
export const defaultKeybindings = {
  // Execution
  'Mod-Enter': 'runCell',
  'Shift-Enter': 'runCellAndAdvance',
  'Mod-Shift-Enter': 'runAllCells',

  // Navigation
  'Alt-ArrowDown': 'goToNextCell',
  'Alt-ArrowUp': 'goToPrevCell',

  // Cell management
  'Mod-Shift-i': 'insertCellSmart',
  'Mod-Shift-o': 'clearCellOutput',

  // Formatting
  'Mod-Shift-f': 'formatCell',
  'Mod-Alt-Shift-f': 'formatDocument',

  // Indentation (handled specially - see createKeymap)
  // Tab first tries to accept completion, then indents
  'Tab': 'indentOrAcceptCompletion',
  'Shift-Tab': 'dedent',

  // Code intelligence
  'F12': 'viewSource',

  // Enter accepts completion if active, otherwise inserts newline
  'Enter': 'acceptCompletionOrNewline',
};

/**
 * Special command: Accept completion if active, otherwise indent
 */
function indentOrAcceptCompletion(editor) {
  const indentCmd = commandRegistry.indent(editor);
  return (view) => {
    // Try to accept completion first
    if (acceptCompletion(view)) return true;
    // Fall back to indent
    return indentCmd(view);
  };
}

/**
 * Special command: Accept completion if active, otherwise insert newline
 */
function acceptCompletionOrNewline(editor) {
  return (view) => {
    // Try to accept completion first
    if (acceptCompletion(view)) return true;
    // Fall back to default behavior (let CodeMirror handle newline)
    return false;
  };
}

/**
 * Create a CodeMirror keymap extension from keybinding config.
 *
 * @param {Object} editor - Editor API instance
 * @param {Object} [bindings] - Key bindings (defaults to defaultKeybindings)
 * @returns {import('@codemirror/state').Extension}
 *
 * @example
 * // Use defaults
 * createKeymap(editor)
 *
 * // Custom bindings
 * createKeymap(editor, {
 *   'Mod-Enter': 'runCell',
 *   'Shift-Enter': 'runCellAndAdvance',
 *   'F5': 'runAllCells',
 * })
 */
export function createKeymap(editor, bindings = defaultKeybindings) {
  const keymapEntries = [];

  // Special commands that aren't in the registry
  const specialCommands = {
    'indentOrAcceptCompletion': indentOrAcceptCompletion,
    'acceptCompletionOrNewline': acceptCompletionOrNewline,
  };

  for (const [key, commandName] of Object.entries(bindings)) {
    // Skip disabled bindings
    if (commandName === false || commandName === null) continue;

    // Handle custom function
    if (typeof commandName === 'function') {
      keymapEntries.push({
        key,
        run: (view) => commandName(editor, view),
      });
      continue;
    }

    // Check special commands first
    if (specialCommands[commandName]) {
      keymapEntries.push({
        key,
        run: specialCommands[commandName](editor),
      });
      continue;
    }

    // Look up command in registry
    const commandFactory = commandRegistry[commandName];
    if (!commandFactory) {
      console.warn(`[keymap] Unknown command: ${commandName}`);
      continue;
    }

    keymapEntries.push({
      key,
      run: commandFactory(editor),
    });
  }

  // Use Prec.high to ensure our keymap takes precedence over other keymaps
  return Prec.high(keymap.of(keymapEntries));
}

/**
 * Merge user keybindings with defaults.
 *
 * @param {Object} userBindings - User-provided keybindings
 * @param {Object} [defaults] - Base bindings (defaults to defaultKeybindings)
 * @returns {Object} Merged bindings
 *
 * @example
 * mergeKeybindings({
 *   'Shift-Enter': 'runCell',  // Override
 *   'F5': 'runAllCells',       // Add new
 *   'Alt-ArrowDown': false,    // Disable
 * })
 */
export function mergeKeybindings(userBindings, defaults = defaultKeybindings) {
  return { ...defaults, ...userBindings };
}

/**
 * Get list of all available commands with descriptions.
 *
 * @returns {Array<{name: string, description: string}>}
 */
export function listCommands() {
  return [
    { name: 'runCell', description: 'Run current cell and stay in place' },
    { name: 'runCellAndAdvance', description: 'Run current cell and move to next (create if needed)' },
    { name: 'runAllCells', description: 'Run all cells in document' },
    { name: 'runAllAbove', description: 'Run all cells above and including current' },
    { name: 'goToNextCell', description: 'Navigate to next cell' },
    { name: 'goToPrevCell', description: 'Navigate to previous cell' },
    { name: 'clearCellOutput', description: 'Clear output of current cell' },
    { name: 'insertCellBelow', description: 'Insert new cell below current' },
    { name: 'insertCellAbove', description: 'Insert new cell above current' },
    { name: 'insertCellSmart', description: 'Insert new cell with most common language' },
    { name: 'formatCell', description: 'Format current section (code block or markdown)' },
    { name: 'formatDocument', description: 'Format entire document (all sections)' },
    { name: 'indent', description: 'Indent current line or selection' },
    { name: 'dedent', description: 'Dedent current line or selection' },
    { name: 'viewSource', description: 'View source code for symbol under cursor' },
  ];
}
