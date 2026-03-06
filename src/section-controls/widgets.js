/**
 * Section Controls Floating DOM
 */

import { showCtrlKModal } from '../ctrl-k-modal.js';
import { findCodeBlockAtPosition } from '../cells.js';
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  fixGrammar,
  finishLine,
  finishSection,
  FORMATTING_COMMAND_DEFINITIONS,
  executeFormattingDefinition,
  AI_COMMAND_DEFINITIONS,
  executeAiDefinition,
} from './commands.js';

let activeCommandMenu = null;

function isMacLikePlatform() {
  const platform = navigator?.platform || '';
  const ua = navigator?.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua);
}

function formatShortcut(shortcut) {
  if (!shortcut) return '';
  const mod = isMacLikePlatform() ? 'Cmd' : 'Ctrl';
  return shortcut.replace(/Mod-/g, `${mod}+`).replace(/-/g, '+');
}

/**
 * Build floating section-controls DOM.
 * @param {import('@codemirror/view').EditorView} view
 * @param {{editor: any, showAi: boolean, showFormatting: boolean}} options
 */
export function createSectionControlsDom(view, options) {
  const root = document.createElement('div');
  root.className = 'cm-section-controls-floating-root';
  root.__cmSectionControlsView = view;

  const toolbar = document.createElement('div');
  toolbar.className = 'cm-section-controls-toolbar';
  root.appendChild(toolbar);

  if (options.showFormatting) {
    const group = document.createElement('div');
    group.className = 'cm-section-controls-group formatting';
    group.append(
      createButton('B', `Bold (${formatShortcut('Mod-B')})`, () => toggleBold(view), 'bold'),
      createButton('I', `Italic (${formatShortcut('Mod-I')})`, () => toggleItalic(view), 'italic'),
      createButton('U', `Underline (${formatShortcut('Mod-U')})`, () => toggleUnderline(view), 'underline'),
    );
    toolbar.appendChild(group);
  }

  if (options.showAi) {
    const group = document.createElement('div');
    group.className = 'cm-section-controls-group ai';
    group.append(
      createIconButton('grammar', `Fix Grammar (${formatShortcut('Mod-G')})`, () => fixGrammar(options.editor)(view), 'ai-grammar'),
      createIconButton('line', `Finish Line (${formatShortcut('Mod-L')})`, () => finishLine(options.editor)(view), 'ai-finish-line'),
      createIconButton('section', `Finish Section (${formatShortcut('Mod-O')})`, () => finishSection(options.editor)(view), 'ai-finish-section'),
      createButton('…', `All Commands (${formatShortcut("Mod-'")})`, () => {
        openSectionControlsMenu(view, options.editor, { anchorEl: group, root });
      }, 'more'),
    );
    toolbar.appendChild(group);
  }

  return root;
}

function createButton(text, title, onClick, className) {
  const btn = document.createElement('button');
  btn.className = `cm-section-controls-btn ${className || ''}`;
  btn.type = 'button';
  btn.textContent = text;
  btn.title = title;

  wireButtonEvents(btn, onClick);
  return btn;
}

function createIconButton(iconName, title, onClick, className) {
  const btn = document.createElement('button');
  btn.className = `cm-section-controls-btn ${className || ''}`;
  btn.type = 'button';
  btn.title = title;
  btn.appendChild(createIconSvg(iconName));

  wireButtonEvents(btn, onClick);
  return btn;
}

function wireButtonEvents(btn, onClick) {
  // Keep cursor/selection stable on click.
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  });
}

function createIconSvg(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = (d) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  };

  if (name === 'grammar') {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '8');
    c.setAttribute('cy', '8');
    c.setAttribute('r', '5');
    svg.appendChild(c);
    path('M5.8 8.1l1.5 1.5 3-3');
  } else if (name === 'line') {
    path('M3 8h8');
    path('M9 5l3 3-3 3');
  } else if (name === 'section') {
    path('M8 3v8');
    path('M5 9.5L8 12.5l3-3');
  } else if (name === 'wand') {
    path('M3.5 12.5l9-9');
    path('M10.5 2.5v2');
    path('M12.5 4.5h-2');
  } else if (name === 'format') {
    path('M3 4h10');
    path('M5 8h6');
    path('M7 12h2');
  } else if (name === 'doc') {
    path('M5 2.5h4l2 2v9H5z');
    path('M9 2.5v2h2');
  } else if (name === 'code') {
    path('M6 5L3.5 8 6 11');
    path('M10 5l2.5 3-2.5 3');
  } else if (name === 'type') {
    path('M4 4h8');
    path('M8 4v8');
  } else if (name === 'rename') {
    path('M3 12h3l6-6-3-3-6 6z');
  } else if (name === 'comment') {
    path('M3 4h10v6H7l-3 2z');
  } else if (name === 'refactor') {
    path('M4.5 6.5A3.5 3.5 0 1 1 8 11.5');
    path('M3.5 6.5h2v-2');
  } else if (name === 'quote') {
    path('M4.5 5.5h2v2h-2v3h3v-5h-3z');
    path('M9.5 5.5h2v2h-2v3h3v-5h-3z');
  } else if (name === 'table') {
    path('M2.5 3.5h11v9h-11z');
    path('M2.5 6.5h11');
    path('M2.5 9.5h11');
    path('M6.5 3.5v9');
    path('M9.5 3.5v9');
  } else if (name === 'list') {
    path('M5.5 4h7');
    path('M5.5 8h7');
    path('M5.5 12h7');
    path('M3.2 4h.2');
    path('M3.2 8h.2');
    path('M3.2 12h.2');
  } else if (name === 'list-number') {
    path('M6 4h6.5');
    path('M6 8h6.5');
    path('M6 12h6.5');
    path('M2.8 4h1v2h-1');
    path('M2.7 8.8c.2-.7 1.3-.7 1.5 0 .1.5-.2.9-.8 1.3-.5.3-.8.6-.8.9h1.7');
    path('M2.7 11.7h1.5l-.7 1.2h.7');
  } else if (name === 'checklist') {
    path('M2.5 3.5h11v9h-11z');
    path('M4.3 6.8l1 1 1.8-1.8');
    path('M8.5 7h3');
    path('M8.5 10h3');
  } else if (name === 'heading') {
    path('M3.5 4v8');
    path('M7.5 4v8');
    path('M3.5 8h4');
    path('M10 12V4l2 2');
  } else if (name === 'minus') {
    path('M3 8h10');
  }

  return svg;
}

function getRootForView(view) {
  const roots = document.querySelectorAll('.cm-section-controls-floating-root');
  for (const root of roots) {
    if (root.__cmSectionControlsView === view) return root;
  }
  return null;
}

export function closeSectionControlsMenu() {
  if (!activeCommandMenu) return;
  const { menu, onDocPointerDown, onDocKeydown, root } = activeCommandMenu;
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onDocKeydown, true);
  root?.classList.remove('menu-open');
  menu.remove();
  activeCommandMenu = null;
}

export function openSectionControlsMenu(view, editor, options = {}) {
  // Toggle behavior: if already open for this view, close.
  if (activeCommandMenu?.view === view) {
    closeSectionControlsMenu();
    return true;
  }

  if (activeCommandMenu) closeSectionControlsMenu();

  const root = options.root || getRootForView(view);
  const anchorEl = options.anchorEl
    || root?.querySelector('.cm-section-controls-group.ai')
    || root?.querySelector('.cm-section-controls-toolbar')
    || root;

  if (!root || !anchorEl) return false;

  const menu = document.createElement('div');
  menu.className = 'cm-section-controls-menu';

  const header = document.createElement('div');
  header.className = 'cm-section-controls-menu-header';
  header.textContent = 'All Commands';
  menu.appendChild(header);

  const formattingSection = document.createElement('div');
  formattingSection.className = 'cm-section-controls-menu-section';
  formattingSection.appendChild(sectionTitle('Formatting'));
  for (const def of FORMATTING_COMMAND_DEFINITIONS) {
    formattingSection.appendChild(menuItem({
      label: def.label,
      shortcut: formatShortcut(def.shortcut || ''),
      icon: def.icon || 'format',
      onClick: () => executeFormattingDefinition(view, def),
    }));
  }
  menu.appendChild(formattingSection);

  const inCode = !!findCodeBlockAtPosition(view.state.doc.toString(), view.state.selection.main.head);

  const aiSection = document.createElement('div');
  aiSection.className = 'cm-section-controls-menu-section';
  aiSection.appendChild(sectionTitle('AI'));

  for (const def of AI_COMMAND_DEFINITIONS) {
    aiSection.appendChild(menuItem({
      label: def.label,
      shortcut: formatShortcut(def.shortcut || ''),
      icon: def.icon || 'wand',
      disabled: !!def.codeOnly && !inCode,
      onClick: () => { void executeAiDefinition(view, editor, def); },
    }));
  }

  aiSection.appendChild(menuItem({
    label: 'Custom Prompt…',
    shortcut: formatShortcut('Mod-K'),
    icon: 'wand',
    onClick: () => showCtrlKModal(view),
  }));

  menu.appendChild(aiSection);

  document.body.appendChild(menu);

  // Position near the existing toolbar for a "grow" feel.
  const anchorRect = anchorEl.getBoundingClientRect();
  const rect = menu.getBoundingClientRect();

  let left = anchorRect.right - rect.width;
  let top = anchorRect.bottom + 6;

  left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.transformOrigin = `${Math.max(12, anchorRect.right - left)}px 0px`;

  root.classList.add('menu-open');

  const focusableItems = () => Array.from(menu.querySelectorAll('.cm-section-controls-menu-item:not(:disabled)'));
  const setActive = (idx) => {
    const items = focusableItems();
    if (!items.length) return;
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    items.forEach((item) => item.classList.remove('is-active'));
    items[clamped].classList.add('is-active');
    items[clamped].focus({ preventScroll: true });
    return clamped;
  };

  let activeIndex = setActive(0) ?? 0;

  const onDocPointerDown = (e) => {
    if (!menu.contains(e.target)) closeSectionControlsMenu();
  };

  const onDocKeydown = (e) => {
    if (!activeCommandMenu || activeCommandMenu.menu !== menu) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeSectionControlsMenu();
      return;
    }

    const items = focusableItems();
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = setActive((activeIndex + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = setActive((activeIndex - 1 + items.length) % items.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndex = setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndex = setActive(items.length - 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList.contains('cm-section-controls-menu-item')) {
      e.preventDefault();
      document.activeElement.click();
    }
  };

  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onDocKeydown, true);

  activeCommandMenu = { menu, onDocPointerDown, onDocKeydown, root, view };
  return true;
}

function sectionTitle(text) {
  const el = document.createElement('div');
  el.className = 'cm-section-controls-menu-title';
  el.textContent = text;
  return el;
}

function menuItem({ label, shortcut, icon, onClick, disabled = false }) {
  const btn = document.createElement('button');
  btn.className = 'cm-section-controls-menu-item';
  btn.type = 'button';
  btn.disabled = !!disabled;

  const left = document.createElement('span');
  left.className = 'cm-section-controls-menu-item-main';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'cm-section-controls-menu-item-icon';
  iconWrap.appendChild(createIconSvg(icon || 'wand'));
  left.appendChild(iconWrap);

  const labelEl = document.createElement('span');
  labelEl.className = 'cm-section-controls-menu-item-label';
  labelEl.textContent = label;
  left.appendChild(labelEl);

  btn.appendChild(left);

  if (shortcut) {
    const keyEl = document.createElement('span');
    keyEl.className = 'cm-section-controls-menu-item-shortcut';
    keyEl.textContent = shortcut;
    btn.appendChild(keyEl);
  }

  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  btn.addEventListener('click', (e) => {
    if (btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    onClick();
    closeSectionControlsMenu();
  });

  return btn;
}

export const sectionControlsStyles = `
.cm-section-controls-floating-root {
  position: fixed;
  z-index: 1000;
  pointer-events: auto;
}

.cm-section-controls-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  opacity: 0.84;
  transition: opacity 0.16s ease, transform 0.16s ease;
  transform: translateY(0) scale(1);
  background: color-mix(in srgb, var(--bg-secondary, #1f2328) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--border, #3d444d) 78%, transparent);
  border-radius: 10px;
  padding: 4px 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(3px);
}

.cm-section-controls-floating-root.menu-open .cm-section-controls-toolbar {
  opacity: 0;
  transform: translateY(-2px) scale(0.96);
  pointer-events: none;
}

.cm-section-controls-toolbar:hover {
  opacity: 1;
  transform: translateY(-1px);
}

.cm-section-controls-group {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.cm-section-controls-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted, #8b949e);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, transform 0.12s ease;
}

.cm-section-controls-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.cm-section-controls-btn:hover {
  background: color-mix(in srgb, var(--hover-bg, #30363d) 80%, transparent);
  color: var(--text, #e6edf3);
  transform: scale(1.05);
}

.cm-section-controls-btn.bold { font-weight: 700; }
.cm-section-controls-btn.italic { font-style: italic; }
.cm-section-controls-btn.underline { text-decoration: underline; }

.cm-section-controls-menu {
  position: fixed;
  z-index: 1002;
  min-width: 320px;
  max-width: 420px;
  max-height: min(72vh, 620px);
  overflow: auto;
  background: var(--bg-secondary, #1f2328);
  border: 1px solid var(--border, #3d444d);
  border-radius: 10px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.35);
  animation: cm-section-controls-menu-grow 120ms ease-out;
}

@keyframes cm-section-controls-menu-grow {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.cm-section-controls-menu-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #3d444d);
  color: var(--text, #e6edf3);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.cm-section-controls-menu-section {
  padding: 8px;
}

.cm-section-controls-menu-title {
  padding: 4px 6px 8px;
  font-size: 11px;
  color: var(--text-muted, #8b949e);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.cm-section-controls-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text, #e6edf3);
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
}

.cm-section-controls-menu-item-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cm-section-controls-menu-item-icon {
  width: 16px;
  height: 16px;
  color: var(--text-muted, #8b949e);
  display: inline-flex;
}

.cm-section-controls-menu-item-icon svg {
  width: 16px;
  height: 16px;
}

.cm-section-controls-menu-item:hover,
.cm-section-controls-menu-item.is-active {
  background: var(--hover-bg, rgba(80, 90, 110, 0.35));
}

.cm-section-controls-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cm-section-controls-menu-item:disabled:hover {
  background: transparent;
}

.cm-section-controls-menu-item-shortcut {
  color: var(--text-muted, #8b949e);
  font-size: 11px;
}

@media (max-width: 768px) {
  .cm-section-controls-floating-root { display: none !important; }
}
`;

let stylesInjected = false;
export function injectSectionControlsStyles() {
  if (stylesInjected || document.querySelector('#cm-section-controls-styles')) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'cm-section-controls-styles';
  style.textContent = sectionControlsStyles;
  document.head.appendChild(style);
}
