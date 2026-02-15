/**
 * @fileoverview Dropdown Menu Component
 *
 * A reusable dropdown menu for the shell status bar segments.
 */

// =============================================================================
// MENU COMPONENT
// =============================================================================

/**
 * @typedef {Object} MenuItem
 * @property {'item'|'divider'|'header'|'info'} [type='item']
 * @property {string} [icon] - Icon (emoji or single char)
 * @property {string} [label] - Display text
 * @property {string} [shortcut] - Keyboard shortcut text
 * @property {string} [value] - Value for info items
 * @property {boolean} [checked] - Show checkmark
 * @property {boolean} [disabled] - Disable the item
 * @property {boolean} [active] - Highlight as active/current
 * @property {() => void} [onClick] - Click handler
 */

/**
 * Create a dropdown menu
 * @param {Object} options
 * @param {MenuItem[]} options.items - Menu items
 * @param {HTMLElement} options.anchor - Element to position menu relative to
 * @param {'bottom-left'|'bottom-right'|'top-left'|'top-right'} [options.position='bottom-left']
 * @param {() => void} [options.onClose] - Called when menu closes
 * @returns {{element: HTMLElement, close: () => void, update: (items: MenuItem[]) => void}}
 */
export function createMenu(options) {
  const {
    items,
    anchor,
    position = 'bottom-left',
    onClose,
  } = options;

  // Create menu element
  const menu = document.createElement('div');
  menu.className = 'mrmd-menu';
  menu.setAttribute('role', 'menu');

  // Render items
  function render(menuItems) {
    menu.innerHTML = '';

    for (const item of menuItems) {
      const el = createMenuItem(item, close);
      if (el) {
        menu.appendChild(el);
      }
    }
  }

  // Detect mobile/narrow viewport
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  // Position menu relative to anchor (desktop) or as bottom sheet (mobile)
  function updatePosition() {
    // On mobile, CSS handles the positioning (bottom sheet via @media queries).
    // We just need to not set inline position styles that would conflict.
    if (isMobile()) {
      menu.style.top = '';
      menu.style.left = '';
      menu.style.right = '';
      menu.style.bottom = '';
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    let top, left;

    if (position.startsWith('bottom')) {
      top = anchorRect.bottom + 4;
    } else {
      top = anchorRect.top - menuRect.height - 4;
    }

    if (position.endsWith('left')) {
      left = anchorRect.left;
    } else {
      left = anchorRect.right - menuRect.width;
    }

    // Keep within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left + menuRect.width > viewportWidth - 8) {
      left = viewportWidth - menuRect.width - 8;
    }
    if (left < 8) {
      left = 8;
    }

    if (top + menuRect.height > viewportHeight - 8) {
      top = anchorRect.top - menuRect.height - 4;
    }
    if (top < 8) {
      top = 8;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  // Mobile scrim backdrop (for bottom sheet pattern)
  let scrim = null;

  // Close menu
  function close() {
    menu.remove();
    if (scrim) {
      scrim.remove();
      scrim = null;
    }
    document.removeEventListener('mousedown', handleOutsideClick);
    document.removeEventListener('touchstart', handleOutsideClick);
    document.removeEventListener('keydown', handleKeydown);
    onClose?.();
  }

  // Handle clicks outside menu
  function handleOutsideClick(e) {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) {
      close();
    }
  }

  // Handle keyboard
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      close();
    }
  }

  // Initialize
  render(items);

  // On mobile, add a scrim backdrop behind the bottom sheet
  if (isMobile()) {
    scrim = document.createElement('div');
    scrim.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 999;
      animation: mrmd-fade-in 0.15s ease;
    `;
    scrim.addEventListener('click', close);
    scrim.addEventListener('touchstart', close);
    document.body.appendChild(scrim);
  }

  document.body.appendChild(menu);
  updatePosition();

  // Add event listeners
  document.addEventListener('mousedown', handleOutsideClick);
  document.addEventListener('touchstart', handleOutsideClick);
  document.addEventListener('keydown', handleKeydown);

  return {
    element: menu,
    close,
    update(newItems) {
      render(newItems);
      updatePosition();
    },
  };
}

/**
 * Create a menu item element
 * @private
 */
function createMenuItem(item, closeMenu) {
  const { type = 'item' } = item;

  if (type === 'divider') {
    const el = document.createElement('div');
    el.className = 'mrmd-menu__divider';
    return el;
  }

  if (type === 'header') {
    const el = document.createElement('div');
    el.className = 'mrmd-menu__header';
    el.textContent = item.label || '';
    return el;
  }

  if (type === 'info') {
    const el = document.createElement('div');
    el.className = 'mrmd-menu__info';
    el.innerHTML = `
      <span class="mrmd-menu__info-label">${item.label || ''}</span>
      <span class="mrmd-menu__info-value">${item.value || ''}</span>
    `;
    return el;
  }

  // Regular item
  const el = document.createElement('div');
  el.className = 'mrmd-menu__item';
  el.setAttribute('role', 'menuitem');

  if (item.disabled) {
    el.classList.add('mrmd-menu__item--disabled');
  }
  if (item.active) {
    el.classList.add('mrmd-menu__item--active');
  }

  // Build inner HTML
  let html = '';

  if (item.checked !== undefined) {
    html += `<span class="mrmd-menu__item-check">${item.checked ? '✓' : ''}</span>`;
  } else if (item.icon) {
    html += `<span class="mrmd-menu__item-icon">${item.icon}</span>`;
  }

  html += `<span class="mrmd-menu__item-label">${item.label || ''}</span>`;

  if (item.shortcut) {
    html += `<span class="mrmd-menu__item-shortcut">${item.shortcut}</span>`;
  }

  el.innerHTML = html;

  // Click handler
  if (!item.disabled && item.onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      item.onClick();
      closeMenu();
    });
  }

  return el;
}

/**
 * Create a file browser menu
 * @param {Object} options
 * @param {Array<{name: string, path: string, type: string}>} options.files
 * @param {string} [options.currentPath] - Currently open file path
 * @param {(path: string) => void} options.onSelect
 * @param {() => void} [options.onOpenFile] - "Open file..." action
 * @param {HTMLElement} options.anchor
 * @param {() => void} [options.onClose]
 */
export function createFileMenu(options) {
  const {
    files,
    currentPath,
    onSelect,
    onOpenFile,
    anchor,
    onClose,
  } = options;

  const items = [];

  // Add files
  for (const file of files) {
    if (file.type === 'directory') {
      items.push({
        icon: '📁',
        label: file.name,
        disabled: true, // For now, don't navigate into directories in menu
      });
    } else {
      items.push({
        icon: '📄',
        label: file.name,
        active: file.path === currentPath,
        onClick: () => onSelect(file.path),
      });
    }
  }

  if (files.length === 0) {
    items.push({
      type: 'info',
      label: 'No files',
      value: '',
    });
  }

  // Add "Open file..." action
  if (onOpenFile) {
    items.push({ type: 'divider' });
    items.push({
      icon: '📂',
      label: 'Open file...',
      onClick: onOpenFile,
    });
  }

  return createMenu({ items, anchor, onClose });
}
