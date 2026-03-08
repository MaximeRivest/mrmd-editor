/**
 * Section Controls Module
 *
 * Provides AI and formatting controls that appear next to the focused section.
 */

import { sectionControlsFacet, createSectionControlsPlugin } from './plugin.js';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import * as commands from './commands.js';
import { openSectionControlsMenu } from './widgets.js';

/**
 * Create section controls extensions
 *
 * @param {Object} editor - Editor API instance
 * @param {Object} [options] - Configuration
 * @returns {Array} CodeMirror extensions
 */
export function sectionControls(editor, options = {}) {
  const config = {
    enabled: options.enabled !== false,
    showAi: options.showAi !== false,
    showFormatting: options.showFormatting !== false,
    ...options,
  };

  if (!config.enabled) return [];

  const keybindings = [
    { key: 'Mod-b', run: (view) => commands.toggleBold(view) },
    { key: 'Mod-i', run: (view) => commands.toggleItalic(view) },
    { key: 'Mod-u', run: (view) => commands.toggleUnderline(view) },
    { key: 'Mod-`', run: (view) => commands.toggleInlineCode(view) },
    { key: 'Mod-g', run: (view) => commands.fixGrammar(editor)(view) },
    { key: 'Mod-l', run: (view) => commands.finishLine(editor)(view) },
    { key: 'Mod-o', run: (view) => commands.finishSection(editor)(view) },
    { key: "Mod-'", run: (view) => openSectionControlsMenu(view, editor) },
  ];

  const shortcutFallback = EditorView.domEventHandlers({
    keydown(event, view) {
      // Robust fallback for international keyboard layouts:
      // use physical Quote key (preferred) and keep Period as secondary.
      const isPrimary = event.ctrlKey || event.metaKey;
      if (isPrimary && !event.altKey && (event.code === 'Quote' || event.code === 'Period')) {
        event.preventDefault();
        event.stopPropagation();
        return openSectionControlsMenu(view, editor);
      }
      return false;
    },
  });

  return [
    sectionControlsFacet.of(config),
    createSectionControlsPlugin(editor),
    keybindings.length > 0 ? Prec.high(keymap.of(keybindings)) : [],
    Prec.high(shortcutFallback),
  ];
}

export * from './commands.js';
