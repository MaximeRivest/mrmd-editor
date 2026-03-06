/**
 * Section Controls Commands
 *
 * Formatting commands + AI shortcuts for the focused section.
 */

import { syntaxTree } from '@codemirror/language';
import { findCodeBlockAtPosition } from '../cells.js';
import { executeAiOperation, getAiContext } from '../ai-integration.js';
import { ctrlKConfigFacet } from '../ctrl-k-modal.js';

// ===========================================================================
// Formatting Commands
// ===========================================================================

/**
 * Toggle markdown formatting around selection.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} marker
 * @param {string} [endMarker]
 * @returns {boolean}
 */
export function toggleMarkdownFormat(view, marker, endMarker = marker) {
  const sel = view.state.selection.main;
  const { from, to } = sel;
  const selected = view.state.doc.sliceString(from, to);

  if (sel.empty) {
    view.dispatch({
      changes: { from, insert: marker + endMarker },
      selection: { anchor: from + marker.length },
      userEvent: 'input.format.add',
    });
    return true;
  }

  const hasWrapper = selected.startsWith(marker) && selected.endsWith(endMarker);

  if (hasWrapper) {
    const unwrapped = selected.slice(marker.length, selected.length - endMarker.length);
    view.dispatch({
      changes: { from, to, insert: unwrapped },
      selection: { anchor: from, head: from + unwrapped.length },
      userEvent: 'input.format.remove',
    });
    return true;
  }

  view.dispatch({
    changes: { from, to, insert: marker + selected + endMarker },
    selection: {
      anchor: from + marker.length,
      head: from + marker.length + selected.length,
    },
    userEvent: 'input.format.add',
  });
  return true;
}

export const toggleBold = (view) => toggleMarkdownFormat(view, '**');
export const toggleItalic = (view) => toggleMarkdownFormat(view, '*');
export const toggleUnderline = (view) => toggleMarkdownFormat(view, '<u>', '</u>');

function getLineRangeForSelection(view) {
  const sel = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(sel.from);
  const toLine = view.state.doc.lineAt(sel.to);
  return {
    from: fromLine.from,
    to: toLine.to,
    text: view.state.doc.sliceString(fromLine.from, toLine.to),
    selection: sel,
  };
}

function prefixSelectedLines(view, prefix) {
  const range = getLineRangeForSelection(view);
  const lines = range.text.split('\n');
  const prefixed = lines.map((line) => `${prefix}${line}`).join('\n');

  const { selection } = range;
  const anchor = selection.anchor + prefix.length;
  const head = selection.head + prefix.length;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: prefixed },
    selection: { anchor, head },
    userEvent: 'input.format.add',
  });
  return true;
}

function insertTemplate(view, template) {
  const sel = view.state.selection.main;
  const marker = '{{cursor}}';
  const selectionMarker = '{{selection}}';
  const selectedText = view.state.doc.sliceString(sel.from, sel.to);

  let text = template.includes(selectionMarker)
    ? template.replace(selectionMarker, selectedText)
    : template;

  const markerPos = text.indexOf(marker);
  if (markerPos >= 0) {
    text = text.replace(marker, '');
  }

  const cursorPos = markerPos >= 0 ? sel.from + markerPos : sel.from + text.length;

  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: cursorPos },
    userEvent: 'input.format.add',
  });

  return true;
}

export function insertBlockQuote(view) {
  if (!view.state.selection.main.empty) {
    return prefixSelectedLines(view, '> ');
  }
  return insertTemplate(view, '> {{cursor}}');
}

export function insertTableTemplate(view) {
  return insertTemplate(
    view,
    '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| {{cursor}} |  |  |\n|  |  |  |'
  );
}

export function insertCodeCellTemplate(view, language = 'python') {
  const line = view.state.doc.lineAt(view.state.selection.main.from);
  const prefixNewline = line.text.trim().length > 0 ? '\n' : '';
  return insertTemplate(view, `${prefixNewline}\`\`\`${language}\n{{cursor}}\n\`\`\``);
}

export function insertBulletList(view) {
  if (!view.state.selection.main.empty) {
    return prefixSelectedLines(view, '- ');
  }
  return insertTemplate(view, '- {{cursor}}');
}

export function insertNumberedList(view) {
  if (!view.state.selection.main.empty) {
    return prefixSelectedLines(view, '1. ');
  }
  return insertTemplate(view, '1. {{cursor}}');
}

export function insertTaskList(view) {
  if (!view.state.selection.main.empty) {
    return prefixSelectedLines(view, '- [ ] ');
  }
  return insertTemplate(view, '- [ ] {{cursor}}');
}

export function insertHeading(view, level = 2) {
  const prefix = '#'.repeat(Math.max(1, Math.min(level, 6))) + ' ';
  return insertTemplate(view, `${prefix}{{cursor}}`);
}

export function insertHorizontalRule(view) {
  return insertTemplate(view, '---\n{{cursor}}');
}

export const FORMATTING_COMMAND_DEFINITIONS = [
  { id: 'bold', label: 'Bold', shortcut: 'Mod-B', icon: 'format' },
  { id: 'italic', label: 'Italic', shortcut: 'Mod-I', icon: 'format' },
  { id: 'underline', label: 'Underline', shortcut: 'Mod-U', icon: 'format' },
  { id: 'blockquote', label: 'Block Quote', shortcut: '', icon: 'quote' },
  { id: 'table', label: 'Insert Table Template', shortcut: '', icon: 'table' },
  { id: 'code-cell', label: 'Insert Code Cell', shortcut: '', icon: 'code' },
  { id: 'bullet-list', label: 'Bullet List', shortcut: '', icon: 'list' },
  { id: 'numbered-list', label: 'Numbered List', shortcut: '', icon: 'list-number' },
  { id: 'task-list', label: 'Task List', shortcut: '', icon: 'checklist' },
  { id: 'heading-2', label: 'Heading (H2)', shortcut: '', icon: 'heading' },
  { id: 'horizontal-rule', label: 'Horizontal Rule', shortcut: '', icon: 'minus' },
];

export function executeFormattingDefinition(view, def) {
  switch (def.id) {
    case 'bold':
      return toggleBold(view);
    case 'italic':
      return toggleItalic(view);
    case 'underline':
      return toggleUnderline(view);
    case 'blockquote':
      return insertBlockQuote(view);
    case 'table':
      return insertTableTemplate(view);
    case 'code-cell':
      return insertCodeCellTemplate(view, 'python');
    case 'bullet-list':
      return insertBulletList(view);
    case 'numbered-list':
      return insertNumberedList(view);
    case 'task-list':
      return insertTaskList(view);
    case 'heading-2':
      return insertHeading(view, 2);
    case 'horizontal-rule':
      return insertHorizontalRule(view);
    default:
      return false;
  }
}

// ===========================================================================
// AI Helpers
// ===========================================================================

function getAiClient(view) {
  const cfg = view.state.facet(ctrlKConfigFacet);
  return cfg?.aiClient || null;
}

function getFocusedSectionRange(view) {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    return {
      from: sel.from,
      to: sel.to,
      text: view.state.doc.sliceString(sel.from, sel.to),
    };
  }

  const tree = syntaxTree(view.state);
  let node = tree.resolveInner(sel.head, 1);

  while (node?.parent && node.parent.name !== 'Document') {
    node = node.parent;
  }

  if (!node || node.name === 'Document') {
    const line = view.state.doc.lineAt(sel.head);
    return {
      from: line.from,
      to: line.to,
      text: line.text,
    };
  }

  return {
    from: node.from,
    to: node.to,
    text: view.state.doc.sliceString(node.from, node.to),
  };
}

function getCodeContextAtCursor(view) {
  const cursor = view.state.selection.main.head;
  const sel = view.state.selection.main;
  const content = view.state.doc.toString();
  const block = findCodeBlockAtPosition(content, cursor);
  if (!block) return null;

  const hasCodeSelection = !sel.empty && sel.from >= block.codeStart && sel.to <= block.codeEnd;

  const selectedCode = hasCodeSelection
    ? view.state.doc.sliceString(sel.from, sel.to)
    : block.code;

  return {
    language: block.baseLanguage || block.language || 'text',
    localContext: block.code,
    codeBeforeCursor: view.state.doc.sliceString(block.codeStart, Math.min(cursor, block.codeEnd)),
    replaceFrom: hasCodeSelection ? sel.from : block.codeStart,
    replaceTo: hasCodeSelection ? sel.to : block.codeEnd,
    selectedCode,
  };
}

async function runAi(view, program, params, operation) {
  const aiClient = getAiClient(view);
  if (!aiClient) {
    console.warn('[SectionControls] AI client not available. Ensure Ctrl-K AI extension is configured.');
    return;
  }

  await executeAiOperation(view, aiClient, {
    program,
    params,
    type: operation.type,
    from: operation.from,
    to: operation.to,
    resultField: operation.resultField,
    juiceLevel: aiClient.juiceLevel,
  });
}

// ===========================================================================
// AI Command Definitions (for expanded menu)
// ===========================================================================

export const AI_COMMAND_DEFINITIONS = [
  { id: 'finish-sentence', label: 'Complete Sentence', shortcut: 'Mod-L', icon: 'line', program: 'FinishSentencePredict', type: 'insert', resultField: 'completion' },
  { id: 'finish-paragraph', label: 'Complete Paragraph', shortcut: 'Mod-O', icon: 'section', program: 'FinishParagraphPredict', type: 'insert', resultField: 'completion' },
  { id: 'fix-grammar', label: 'Fix Grammar', shortcut: 'Mod-G', icon: 'grammar', program: 'FixGrammarPredict', type: 'replace', resultField: 'fixed_text' },
  { id: 'fix-transcription', label: 'Fix Transcription', shortcut: '', icon: 'wand', program: 'FixTranscriptionPredict', type: 'replace', resultField: 'fixed_text' },
  { id: 'correct-finish-line', label: 'Correct + Finish Line', shortcut: '', icon: 'line', program: 'CorrectAndFinishLinePredict', type: 'replace', resultField: 'corrected_completion' },
  { id: 'correct-finish-section', label: 'Correct + Finish Section', shortcut: '', icon: 'section', program: 'CorrectAndFinishSectionPredict', type: 'replace', resultField: 'corrected_completion' },
  { id: 'reformat-markdown', label: 'Reformat Markdown', shortcut: '', icon: 'format', program: 'ReformatMarkdownPredict', type: 'replace', resultField: 'reformatted_text' },

  // Code-focused
  { id: 'document-code', label: 'Add Documentation to Code', shortcut: '', icon: 'doc', program: 'DocumentCodePredict', type: 'replace', resultField: 'documented_code', codeOnly: true },
  { id: 'complete-code', label: 'Complete Code', shortcut: '', icon: 'code', program: 'CompleteCodePredict', type: 'replace', resultField: 'completion', codeOnly: true },
  { id: 'add-type-hints', label: 'Add Type Hints', shortcut: '', icon: 'type', program: 'AddTypeHintsPredict', type: 'replace', resultField: 'typed_code', codeOnly: true },
  { id: 'improve-names', label: 'Improve Names', shortcut: '', icon: 'rename', program: 'ImproveNamesPredict', type: 'replace', resultField: 'improved_code', codeOnly: true },
  { id: 'explain-code', label: 'Explain Code', shortcut: '', icon: 'comment', program: 'ExplainCodePredict', type: 'replace', resultField: 'explained_code', codeOnly: true },
  { id: 'refactor-code', label: 'Refactor Code', shortcut: '', icon: 'refactor', program: 'RefactorCodePredict', type: 'replace', resultField: 'refactored_code', codeOnly: true },
  { id: 'format-code', label: 'Format Code', shortcut: '', icon: 'format', program: 'FormatCodePredict', type: 'replace', resultField: 'formatted_code', codeOnly: true },
];

/**
 * Execute one menu AI definition.
 * @param {import('@codemirror/view').EditorView} view
 * @param {Object} editor
 * @param {Object} def
 */
export async function executeAiDefinition(view, editor, def) {
  const ctx = getAiContext(view);
  const section = getFocusedSectionRange(view);
  const code = getCodeContextAtCursor(view);
  const sel = view.state.selection.main;

  if (def.codeOnly && !code) {
    console.warn(`[SectionControls] ${def.label} requires cursor in a code block.`);
    return;
  }

  const isCodeFinish = def.program === 'FinishCodeLinePredict' || def.program === 'FinishCodeSectionPredict';

  // Operation target
  let from;
  let to;
  if (def.type === 'insert') {
    from = ctx.cursorPos;
    to = ctx.cursorPos;
  } else if (def.codeOnly && code) {
    from = code.replaceFrom;
    to = code.replaceTo;
  } else {
    from = sel.empty ? section.from : sel.from;
    to = sel.empty ? section.to : sel.to;
  }

  // Build params by command family
  let params = {};

  if (def.program.startsWith('Finish')) {
    if (isCodeFinish || (def.codeOnly && code)) {
      params = {
        code_before_cursor: code?.codeBeforeCursor || '',
        language: code?.language || 'text',
        local_context: code?.localContext || '',
        document_context: ctx.documentContext,
      };
    } else {
      params = {
        text_before_cursor: ctx.textBeforeCursor,
        local_context: ctx.localContext,
        document_context: ctx.documentContext,
      };
    }
  } else if (def.program.startsWith('Fix')) {
    params = {
      text_to_fix: view.state.doc.sliceString(from, to),
      local_context: ctx.localContext,
      document_context: ctx.documentContext,
    };
  } else if (def.program.startsWith('CorrectAndFinish')) {
    params = {
      text_to_fix: view.state.doc.sliceString(from, to),
      content_type: code ? 'code' : 'text',
      local_context: code ? code.localContext : ctx.localContext,
      document_context: ctx.documentContext,
    };
  } else if (def.program === 'ReformatMarkdownPredict') {
    params = {
      text: view.state.doc.sliceString(from, to),
      local_context: ctx.localContext,
      document_context: ctx.documentContext,
    };
  } else if (def.program.endsWith('CodePredict')) {
    params = {
      code: code?.selectedCode || view.state.doc.sliceString(from, to),
      language: code?.language || 'text',
      local_context: code?.localContext || ctx.localContext,
      document_context: ctx.documentContext,
    };
  } else {
    params = {
      text_to_fix: view.state.doc.sliceString(from, to),
      local_context: ctx.localContext,
      document_context: ctx.documentContext,
    };
  }

  await runAi(view, def.program, params, {
    type: def.type,
    from,
    to,
    resultField: def.resultField,
  });
}

// ===========================================================================
// AI Quick Commands
// ===========================================================================

export const fixGrammar = (editor) => (view) => {
  const def = AI_COMMAND_DEFINITIONS.find(d => d.id === 'fix-grammar');
  if (def) void executeAiDefinition(view, editor, def);
  return true;
};

export const finishLine = (editor) => (view) => {
  const code = getCodeContextAtCursor(view);
  const def = code
    ? { id: 'finish-code-line', label: 'Complete Code Line', program: 'FinishCodeLinePredict', type: 'insert', resultField: 'completion', codeOnly: true }
    : AI_COMMAND_DEFINITIONS.find(d => d.id === 'finish-sentence');

  if (def) void executeAiDefinition(view, editor, def);
  return true;
};

export const finishSection = (editor) => (view) => {
  const code = getCodeContextAtCursor(view);
  const def = code
    ? { id: 'finish-code-section', label: 'Complete Code Section', program: 'FinishCodeSectionPredict', type: 'insert', resultField: 'completion', codeOnly: true }
    : AI_COMMAND_DEFINITIONS.find(d => d.id === 'finish-paragraph');

  if (def) void executeAiDefinition(view, editor, def);
  return true;
};
