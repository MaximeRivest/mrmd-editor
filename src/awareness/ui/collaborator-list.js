/**
 * Collaborator List UI Component
 *
 * Renders a list of all connected collaborators with rich information:
 * - Avatar with color
 * - Name and type badge
 * - Status (typing, idle, executing, etc.)
 * - What they're doing (hovering over X, completing Y, executing cell Z)
 *
 * @module awareness/ui/collaborator-list
 */

// #region COMPONENT

/**
 * @typedef {Object} CollaboratorListOptions
 * @property {HTMLElement} container - Container element to render into
 * @property {import('../state.js').AwarenessStateManager} stateManager
 * @property {boolean} [showSelf=true] - Show local user in list
 * @property {boolean} [showStatus=true] - Show status indicators
 * @property {boolean} [showActivity=true] - Show hover/autocomplete/execution info
 * @property {boolean} [showTypes=true] - Show type badges (human, ai, runtime)
 * @property {boolean} [compact=false] - Compact mode (less detail)
 * @property {string} [position='inline'] - 'inline' | 'floating'
 * @property {function} [onCollaboratorClick] - Click handler
 */

/**
 * Creates a collaborator list component
 *
 * @param {CollaboratorListOptions} options
 * @returns {{update: function, destroy: function, element: HTMLElement}}
 */
export function createCollaboratorList(options) {
  const {
    container,
    stateManager,
    showSelf = true,
    showStatus = true,
    showActivity = true,
    showTypes = true,
    compact = false,
    position = 'inline',
    onCollaboratorClick,
  } = options;

  // Create wrapper element
  const wrapper = document.createElement('div');
  wrapper.className = `mrmd-collaborator-list mrmd-collaborator-list--${position}${compact ? ' mrmd-collaborator-list--compact' : ''}`;

  // Track current collaborators for diffing
  let currentCollaborators = [];

  /**
   * Render the collaborator list
   */
  function render() {
    const collaborators = stateManager.getCollaborators({ includeSelf: showSelf });

    // Group by type for nicer display
    const humans = collaborators.filter(c => c.user.type === 'human');
    const ais = collaborators.filter(c => c.user.type === 'ai');
    const runtimes = collaborators.filter(c => c.user.type === 'runtime');
    const others = collaborators.filter(c => !['human', 'ai', 'runtime'].includes(c.user.type));

    wrapper.innerHTML = '';

    // Header with count
    if (!compact) {
      const header = document.createElement('div');
      header.className = 'mrmd-collaborator-list__header';
      header.innerHTML = `
        <span class="mrmd-collaborator-list__title">Collaborators</span>
        <span class="mrmd-collaborator-list__count">${collaborators.length}</span>
      `;
      wrapper.appendChild(header);
    }

    // Render each group
    const listEl = document.createElement('div');
    listEl.className = 'mrmd-collaborator-list__items';

    // Humans first
    humans.forEach(c => listEl.appendChild(createCollaboratorItem(c)));

    // Then AIs
    if (ais.length > 0 && !compact) {
      listEl.appendChild(createSeparator('AI'));
    }
    ais.forEach(c => listEl.appendChild(createCollaboratorItem(c)));

    // Then Runtimes
    if (runtimes.length > 0 && !compact) {
      listEl.appendChild(createSeparator('Runtimes'));
    }
    runtimes.forEach(c => listEl.appendChild(createCollaboratorItem(c)));

    // Others
    others.forEach(c => listEl.appendChild(createCollaboratorItem(c)));

    wrapper.appendChild(listEl);

    // Empty state
    if (collaborators.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mrmd-collaborator-list__empty';
      empty.textContent = 'No collaborators';
      wrapper.appendChild(empty);
    }

    currentCollaborators = collaborators;
  }

  /**
   * Create a separator between groups
   * @param {string} label
   * @returns {HTMLElement}
   */
  function createSeparator(label) {
    const sep = document.createElement('div');
    sep.className = 'mrmd-collaborator-list__separator';
    sep.innerHTML = `<span>${label}</span>`;
    return sep;
  }

  /**
   * Create a collaborator item element
   * @param {{clientId: number, user: import('../state.js').AwarenessUserState}} collaborator
   * @returns {HTMLElement}
   */
  function createCollaboratorItem({ clientId, user }) {
    const item = document.createElement('div');
    item.className = `mrmd-collaborator-item mrmd-collaborator-item--${user.type || 'unknown'}`;
    item.dataset.clientId = clientId;

    // Is this the local user?
    const isLocal = clientId === stateManager.awareness.clientID;
    if (isLocal) {
      item.classList.add('mrmd-collaborator-item--self');
    }

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'mrmd-collaborator-item__avatar';
    avatar.style.backgroundColor = user.color || '#666';
    avatar.textContent = getInitial(user.name, user.type);
    avatar.title = user.name || 'Anonymous';

    // Status dot on avatar
    if (showStatus && user.status && user.status !== 'idle') {
      const statusDot = document.createElement('span');
      statusDot.className = `mrmd-collaborator-item__status-dot mrmd-collaborator-item__status-dot--${user.status}`;
      avatar.appendChild(statusDot);
    }

    item.appendChild(avatar);

    // Info section
    const info = document.createElement('div');
    info.className = 'mrmd-collaborator-item__info';

    // Name row
    const nameRow = document.createElement('div');
    nameRow.className = 'mrmd-collaborator-item__name-row';

    const name = document.createElement('span');
    name.className = 'mrmd-collaborator-item__name';
    name.textContent = user.name || 'Anonymous';
    if (isLocal) {
      name.textContent += ' (you)';
    }
    nameRow.appendChild(name);

    // Type badge
    if (showTypes && user.type) {
      const badge = document.createElement('span');
      badge.className = `mrmd-collaborator-item__badge mrmd-collaborator-item__badge--${user.type}`;
      badge.textContent = user.type;
      nameRow.appendChild(badge);
    }

    info.appendChild(nameRow);

    // Activity row (what they're doing)
    if (showActivity && !compact) {
      const activity = getActivityText(user);
      if (activity) {
        const activityEl = document.createElement('div');
        activityEl.className = 'mrmd-collaborator-item__activity';
        activityEl.innerHTML = activity;
        info.appendChild(activityEl);
      }
    }

    item.appendChild(info);

    // Click handler
    if (onCollaboratorClick) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => onCollaboratorClick({ clientId, user }));
    }

    return item;
  }

  /**
   * Get activity description text
   * @param {import('../state.js').AwarenessUserState} user
   * @returns {string}
   */
  function getActivityText(user) {
    // Execution takes priority
    if (user.execution) {
      const { cellIndex, progress, progressText } = user.execution;
      if (progress !== undefined) {
        const pct = Math.round(progress * 100);
        return `<span class="activity-executing">Executing cell ${cellIndex}</span> <span class="activity-progress">${progressText || pct + '%'}</span>`;
      }
      return `<span class="activity-executing">Executing cell ${cellIndex}</span>`;
    }

    // AI generation
    if (user.generation && (user.status === 'streaming' || user.status === 'thinking')) {
      const { targetCell, tokensGenerated, model } = user.generation;
      let text = `<span class="activity-streaming">Generating</span>`;
      if (targetCell !== undefined) {
        text += ` in cell ${targetCell}`;
      }
      if (tokensGenerated) {
        text += ` <span class="activity-tokens">${tokensGenerated} tokens</span>`;
      }
      return text;
    }

    // Hover
    if (user.hover) {
      const { symbol, type, info } = user.hover;
      let text = `<span class="activity-hover">Inspecting</span> <code>${symbol}</code>`;
      if (type) {
        text += ` <span class="activity-type">${type}</span>`;
      }
      return text;
    }

    // Autocomplete
    if (user.autocomplete) {
      const { query, items } = user.autocomplete;
      const preview = items.slice(0, 2).join(', ');
      return `<span class="activity-autocomplete">Completing</span> <code>${query}</code> → ${preview}...`;
    }

    // Status-based fallback
    switch (user.status) {
      case 'typing':
        return '<span class="activity-typing">Typing...</span>';
      case 'selecting':
        return '<span class="activity-selecting">Selecting</span>';
      case 'thinking':
        return '<span class="activity-thinking">Thinking...</span>';
      default:
        return '';
    }
  }

  /**
   * Get initial letter for avatar
   * @param {string} name
   * @param {string} type
   * @returns {string}
   */
  function getInitial(name, type) {
    if (type === 'runtime') {
      // Use language icon or first letter
      const icons = { python: '🐍', javascript: 'JS', typescript: 'TS', rust: '🦀', go: 'Go' };
      const lang = name?.toLowerCase();
      return icons[lang] || (name?.[0] || 'R').toUpperCase();
    }
    if (type === 'ai') {
      return '🤖';
    }
    return (name?.[0] || '?').toUpperCase();
  }

  // Initial render
  render();

  // Subscribe to changes
  const unsubscribe = stateManager.onChange(() => {
    render();
  });

  // Append to container
  if (container) {
    container.appendChild(wrapper);
  }

  return {
    element: wrapper,
    update: render,
    destroy() {
      unsubscribe();
      wrapper.remove();
    },
  };
}

// #endregion COMPONENT

// #region FLOATING

/**
 * Creates a floating collaborator list that can be positioned anywhere.
 *
 * @param {Object} options
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {Object} [options.position] - Position config
 * @param {string} [options.position.top]
 * @param {string} [options.position.right]
 * @param {string} [options.position.bottom]
 * @param {string} [options.position.left]
 * @returns {{show: function, hide: function, toggle: function, destroy: function, element: HTMLElement}}
 */
export function createFloatingCollaboratorList({ stateManager, position = {} }) {
  const container = document.createElement('div');
  container.className = 'mrmd-collaborator-list-floating';
  container.style.cssText = `
    position: fixed;
    z-index: 1000;
    min-width: 200px;
    max-width: 300px;
    max-height: 400px;
    overflow: auto;
    background: var(--mrmd-bg, #1e1e1e);
    border: 1px solid var(--mrmd-border, #333);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    ${position.top ? `top: ${position.top};` : ''}
    ${position.right ? `right: ${position.right};` : ''}
    ${position.bottom ? `bottom: ${position.bottom};` : ''}
    ${position.left ? `left: ${position.left};` : ''}
  `;

  // Default position if none specified
  if (!position.top && !position.bottom) {
    container.style.top = '20px';
  }
  if (!position.left && !position.right) {
    container.style.right = '20px';
  }

  const list = createCollaboratorList({
    container,
    stateManager,
    showSelf: true,
    showStatus: true,
    showActivity: true,
    showTypes: true,
    position: 'floating',
  });

  // Initially hidden
  container.style.display = 'none';
  document.body.appendChild(container);

  return {
    element: container,
    show() {
      container.style.display = 'block';
    },
    hide() {
      container.style.display = 'none';
    },
    toggle() {
      container.style.display = container.style.display === 'none' ? 'block' : 'none';
    },
    isVisible() {
      return container.style.display !== 'none';
    },
    destroy() {
      list.destroy();
      container.remove();
    },
  };
}

// #endregion FLOATING

// #region AVATAR_ROW

/**
 * Creates a compact avatar row showing just collaborator avatars.
 * Hovering shows full info.
 *
 * @param {Object} options
 * @param {HTMLElement} options.container
 * @param {import('../state.js').AwarenessStateManager} options.stateManager
 * @param {number} [options.maxAvatars=5] - Max avatars to show before "+N"
 * @returns {{update: function, destroy: function, element: HTMLElement}}
 */
export function createAvatarRow({ container, stateManager, maxAvatars = 5 }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mrmd-avatar-row';

  function render() {
    const collaborators = stateManager.getCollaborators();
    wrapper.innerHTML = '';

    const shown = collaborators.slice(0, maxAvatars);
    const overflow = collaborators.length - maxAvatars;

    shown.forEach(({ clientId, user }) => {
      const avatar = document.createElement('div');
      avatar.className = `mrmd-avatar-row__avatar mrmd-avatar-row__avatar--${user.type || 'unknown'}`;
      avatar.style.backgroundColor = user.color || '#666';
      avatar.textContent = (user.name?.[0] || '?').toUpperCase();
      avatar.title = `${user.name || 'Anonymous'} (${user.type || 'unknown'})${user.status ? ' - ' + user.status : ''}`;

      // Status indicator
      if (user.status && user.status !== 'idle') {
        avatar.classList.add(`mrmd-avatar-row__avatar--${user.status}`);
      }

      wrapper.appendChild(avatar);
    });

    if (overflow > 0) {
      const more = document.createElement('div');
      more.className = 'mrmd-avatar-row__more';
      more.textContent = `+${overflow}`;
      more.title = `${overflow} more collaborator${overflow > 1 ? 's' : ''}`;
      wrapper.appendChild(more);
    }
  }

  render();

  const unsubscribe = stateManager.onChange(render);

  if (container) {
    container.appendChild(wrapper);
  }

  return {
    element: wrapper,
    update: render,
    destroy() {
      unsubscribe();
      wrapper.remove();
    },
  };
}

// #endregion AVATAR_ROW

// #region EXPORTS

export default {
  createCollaboratorList,
  createFloatingCollaboratorList,
  createAvatarRow,
};

// #endregion EXPORTS
