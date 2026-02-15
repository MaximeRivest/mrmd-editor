/**
 * AI Commands Menu
 *
 * A popup menu showing available AI commands based on context (selection, code cell, etc.)
 */

import { JUICE_LEVELS, JUICE_NAMES } from './ai-client.js';

/**
 * AI command definitions
 */
export const AI_COMMANDS = {
  // Text completion
  FINISH_SENTENCE: {
    id: 'finish-sentence',
    label: 'Complete Sentence',
    icon: '→',
    program: 'FinishSentencePredict',
    type: 'insert',
    resultField: 'completion',
    requiresSelection: false,
    description: 'Continue writing from cursor',
  },
  FINISH_PARAGRAPH: {
    id: 'finish-paragraph',
    label: 'Complete Paragraph',
    icon: '¶',
    program: 'FinishParagraphPredict',
    type: 'insert',
    resultField: 'completion',
    requiresSelection: false,
    description: 'Complete the current paragraph',
  },

  // Text fixes
  FIX_GRAMMAR: {
    id: 'fix-grammar',
    label: 'Fix Grammar',
    icon: '✓',
    program: 'FixGrammarPredict',
    type: 'replace',
    resultField: 'fixed_text',
    requiresSelection: true,
    description: 'Fix grammar, spelling, and punctuation',
  },
  FIX_TRANSCRIPTION: {
    id: 'fix-transcription',
    label: 'Fix Transcription',
    icon: '🎤',
    program: 'FixTranscriptionPredict',
    type: 'replace',
    resultField: 'fixed_text',
    requiresSelection: true,
    description: 'Fix speech-to-text errors',
  },

  // Code operations
  DOCUMENT_CODE: {
    id: 'document-code',
    label: 'Add Documentation',
    icon: '📝',
    program: 'DocumentCodePredict',
    type: 'replace',
    resultField: 'documented_code',
    requiresSelection: true,
    codeOnly: true,
    description: 'Add docstrings and comments',
  },
  ADD_TYPES: {
    id: 'add-types',
    label: 'Add Type Hints',
    icon: 'T',
    program: 'AddTypeHintsPredict',
    type: 'replace',
    resultField: 'typed_code',
    requiresSelection: true,
    codeOnly: true,
    description: 'Add type annotations',
  },
  IMPROVE_NAMES: {
    id: 'improve-names',
    label: 'Improve Names',
    icon: 'N',
    program: 'ImproveNamesPredict',
    type: 'replace',
    resultField: 'improved_code',
    requiresSelection: true,
    codeOnly: true,
    description: 'Improve variable and function names',
  },
  REFACTOR: {
    id: 'refactor',
    label: 'Refactor',
    icon: '♻',
    program: 'RefactorCodePredict',
    type: 'replace',
    resultField: 'refactored_code',
    requiresSelection: true,
    codeOnly: true,
    description: 'Clean up and refactor code',
  },
  EXPLAIN_CODE: {
    id: 'explain-code',
    label: 'Explain Code',
    icon: '💡',
    program: 'ExplainCodePredict',
    type: 'replace',
    resultField: 'explained_code',
    requiresSelection: true,
    codeOnly: true,
    description: 'Add inline comments explaining code',
  },

  // Text transforms
  GET_SYNONYMS: {
    id: 'get-synonyms',
    label: 'Find Synonyms',
    icon: '≈',
    program: 'GetSynonymsPredict',
    type: 'menu', // Special: shows submenu of synonyms
    resultField: 'synonyms',
    requiresSelection: true,
    description: 'Find alternative words',
  },
  REFORMAT_MARKDOWN: {
    id: 'reformat-markdown',
    label: 'Reformat Markdown',
    icon: 'M↓',
    program: 'ReformatMarkdownPredict',
    type: 'replace',
    resultField: 'reformatted_text',
    requiresSelection: true,
    description: 'Clean up markdown formatting',
  },
};

/**
 * Get commands applicable to current context
 *
 * @param {Object} context
 * @param {boolean} context.hasSelection - Whether there's a selection
 * @param {boolean} context.inCodeCell - Whether cursor is in a code cell
 * @param {string} [context.language] - Code language if in code cell
 * @returns {Object[]} Applicable commands
 */
export function getApplicableCommands(context) {
  const commands = [];

  for (const cmd of Object.values(AI_COMMANDS)) {
    // Check if selection is required
    if (cmd.requiresSelection && !context.hasSelection) {
      continue;
    }

    // Check if code-only
    if (cmd.codeOnly && !context.inCodeCell) {
      continue;
    }

    commands.push(cmd);
  }

  return commands;
}

/**
 * Create AI menu element
 *
 * @param {Object} options
 * @param {Object} options.context - Editor context
 * @param {function} options.onCommand - Called when command is selected
 * @param {function} options.onClose - Called when menu should close
 * @param {number} options.juiceLevel - Current juice level
 * @param {function} options.onJuiceLevelChange - Called when juice level changes
 * @returns {HTMLElement}
 */
export function createAiMenu(options) {
  const { context, onCommand, onClose, juiceLevel, onJuiceLevelChange } = options;

  const menu = document.createElement('div');
  menu.className = 'ai-menu';

  // Header with juice level selector
  const header = document.createElement('div');
  header.className = 'ai-menu-header';

  const title = document.createElement('span');
  title.className = 'ai-menu-title';
  title.textContent = 'AI';

  const juiceSelector = document.createElement('select');
  juiceSelector.className = 'ai-menu-juice';
  juiceSelector.title = 'Quality/Speed tradeoff';
  for (let i = 0; i <= 4; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = JUICE_NAMES[i];
    if (i === juiceLevel) opt.selected = true;
    juiceSelector.appendChild(opt);
  }
  juiceSelector.onchange = () => {
    onJuiceLevelChange?.(parseInt(juiceSelector.value, 10));
  };

  header.appendChild(title);
  header.appendChild(juiceSelector);
  menu.appendChild(header);

  // Divider
  const divider = document.createElement('div');
  divider.className = 'ai-menu-divider';
  menu.appendChild(divider);

  // Commands
  const commands = getApplicableCommands(context);

  if (commands.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ai-menu-empty';
    empty.textContent = 'No commands available';
    menu.appendChild(empty);
  } else {
    const commandsContainer = document.createElement('div');
    commandsContainer.className = 'ai-menu-commands';

    for (const cmd of commands) {
      const item = document.createElement('div');
      item.className = 'ai-menu-item';
      item.setAttribute('data-command', cmd.id);

      const icon = document.createElement('span');
      icon.className = 'ai-menu-item-icon';
      icon.textContent = cmd.icon;

      const label = document.createElement('span');
      label.className = 'ai-menu-item-label';
      label.textContent = cmd.label;

      item.appendChild(icon);
      item.appendChild(label);

      item.onclick = () => {
        onCommand?.(cmd);
        onClose?.();
      };

      item.title = cmd.description;
      commandsContainer.appendChild(item);
    }

    menu.appendChild(commandsContainer);
  }

  // Close when clicking outside
  const handleOutsideClick = (e) => {
    if (!menu.contains(e.target)) {
      onClose?.();
      document.removeEventListener('click', handleOutsideClick, true);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick, true);
  }, 0);

  // Close on escape
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      onClose?.();
      document.removeEventListener('keydown', handleKeydown, true);
    }
  };
  document.addEventListener('keydown', handleKeydown, true);

  return menu;
}

/**
 * Show AI menu at position
 *
 * @param {Object} options
 * @param {number} options.x - X position
 * @param {number} options.y - Y position
 * @param {Object} options.context - Editor context
 * @param {function} options.onCommand - Called when command is selected
 * @param {number} options.juiceLevel - Current juice level
 * @param {function} options.onJuiceLevelChange - Called when juice level changes
 * @returns {function} Close function
 */
export function showAiMenu(options) {
  const { x, y, context, onCommand, juiceLevel, onJuiceLevelChange } = options;

  // Remove any existing menu
  const existing = document.querySelector('.ai-menu');
  if (existing) existing.remove();

  let isOpen = true;
  const close = () => {
    if (isOpen) {
      isOpen = false;
      menu.remove();
    }
  };

  const menu = createAiMenu({
    context,
    onCommand,
    onClose: close,
    juiceLevel,
    onJuiceLevelChange,
  });

  // Position the menu
  menu.style.position = 'fixed';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.zIndex = '10000';

  document.body.appendChild(menu);

  // Adjust if off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }

  return close;
}

/**
 * CSS styles for AI menu
 */
export const AI_MENU_STYLES = `
.ai-menu {
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  min-width: 200px;
  max-width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  color: #cccccc;
  overflow: hidden;
}

.ai-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #252526;
}

.ai-menu-title {
  font-weight: 600;
  color: #6495ed;
}

.ai-menu-juice {
  background: #3c3c3c;
  border: 1px solid #4c4c4c;
  border-radius: 4px;
  color: #cccccc;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
}

.ai-menu-juice:focus {
  outline: none;
  border-color: #6495ed;
}

.ai-menu-divider {
  height: 1px;
  background: #3c3c3c;
}

.ai-menu-commands {
  padding: 4px 0;
  max-height: 300px;
  overflow-y: auto;
}

.ai-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.ai-menu-item:hover {
  background: #2a2d2e;
}

.ai-menu-item-icon {
  width: 24px;
  text-align: center;
  margin-right: 8px;
  color: #6495ed;
}

.ai-menu-item-label {
  flex: 1;
}

.ai-menu-empty {
  padding: 16px;
  text-align: center;
  color: #808080;
  font-style: italic;
}

/* Mobile: AI menu becomes a bottom sheet */
@media (max-width: 768px) {
  .ai-menu {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    top: auto !important;
    min-width: 100%;
    max-width: 100%;
    border-radius: 16px 16px 0 0;
    border: none;
    border-top: 1px solid #3c3c3c;
    box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.4);
    animation: ai-menu-slide-up 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes ai-menu-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .ai-menu-header {
    padding: 16px 20px;
    position: relative;
  }

  .ai-menu-header::before {
    content: '';
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 36px;
    height: 4px;
    background: #666;
    border-radius: 2px;
    opacity: 0.4;
  }

  .ai-menu-title {
    font-size: 16px;
    padding-top: 4px;
  }

  .ai-menu-juice {
    font-size: 14px;
    padding: 6px 12px;
    border-radius: 8px;
  }

  .ai-menu-commands {
    max-height: 50vh;
    padding: 8px 0;
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  }

  .ai-menu-item {
    padding: 14px 20px;
    min-height: 48px;
    font-size: 16px;
  }

  .ai-menu-item-icon {
    width: 28px;
    font-size: 18px;
    margin-right: 12px;
  }
}
`;

/**
 * Inject AI menu styles into document
 */
export function injectAiMenuStyles() {
  if (document.querySelector('#ai-menu-styles')) return;

  const style = document.createElement('style');
  style.id = 'ai-menu-styles';
  style.textContent = AI_MENU_STYLES;
  document.head.appendChild(style);
}
