/**
 * @fileoverview Base Dialog Component
 *
 * A reusable modal dialog component.
 */

// =============================================================================
// BASE DIALOG
// =============================================================================

/**
 * @typedef {Object} DialogOptions
 * @property {string} title - Dialog title
 * @property {string|HTMLElement} content - Dialog body content
 * @property {Array<{label: string, primary?: boolean, danger?: boolean, onClick: () => void|Promise<void>}>} [buttons]
 * @property {boolean} [showClose=true] - Show close button
 * @property {() => void} [onClose] - Called when dialog closes
 */

/**
 * Create a modal dialog
 * @param {DialogOptions} options
 * @returns {{element: HTMLElement, close: () => void, setLoading: (loading: boolean) => void}}
 */
export function createDialog(options) {
  const {
    title,
    content,
    buttons = [],
    showClose = true,
    onClose,
  } = options;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'mrmd-dialog-overlay';

  // Create dialog
  const dialog = document.createElement('div');
  dialog.className = 'mrmd-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'mrmd-dialog-title');

  // Header
  const header = document.createElement('div');
  header.className = 'mrmd-dialog__header';

  const titleEl = document.createElement('div');
  titleEl.className = 'mrmd-dialog__title';
  titleEl.id = 'mrmd-dialog-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  if (showClose) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mrmd-dialog__close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);
  }

  dialog.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'mrmd-dialog__body';

  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    body.appendChild(content);
  }

  dialog.appendChild(body);

  // Footer with buttons
  if (buttons.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'mrmd-dialog__footer';

    for (const btn of buttons) {
      const button = document.createElement('button');
      button.className = 'mrmd-button';

      if (btn.primary) {
        button.classList.add('mrmd-button--primary');
      }
      if (btn.danger) {
        button.classList.add('mrmd-button--danger');
      }

      button.textContent = btn.label;

      button.addEventListener('click', async () => {
        try {
          await btn.onClick();
        } catch (error) {
          console.error('Dialog button error:', error);
        }
      });

      footer.appendChild(button);
    }

    dialog.appendChild(footer);
  }

  overlay.appendChild(dialog);

  // Close function
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', handleKeydown);
    onClose?.();
  }

  // Handle escape key
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      close();
    }
  }

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  // Add to document
  document.addEventListener('keydown', handleKeydown);
  document.body.appendChild(overlay);

  // Focus first input or button
  requestAnimationFrame(() => {
    const firstInput = dialog.querySelector('input, button');
    firstInput?.focus();
  });

  return {
    element: dialog,
    overlay,
    body,
    close,
    setLoading(loading) {
      const buttons = dialog.querySelectorAll('.mrmd-button');
      buttons.forEach(btn => {
        btn.disabled = loading;
        if (loading) {
          btn.style.opacity = '0.5';
        } else {
          btn.style.opacity = '';
        }
      });
    },
  };
}

/**
 * Show a confirmation dialog
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmLabel='Confirm']
 * @param {string} [options.cancelLabel='Cancel']
 * @param {boolean} [options.danger=false]
 * @returns {Promise<boolean>}
 */
export function confirm(options) {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
  } = options;

  return new Promise((resolve) => {
    const dialog = createDialog({
      title,
      content: `<p>${message}</p>`,
      buttons: [
        {
          label: cancelLabel,
          onClick: () => {
            dialog.close();
            resolve(false);
          },
        },
        {
          label: confirmLabel,
          primary: !danger,
          danger,
          onClick: () => {
            dialog.close();
            resolve(true);
          },
        },
      ],
      onClose: () => resolve(false),
    });
  });
}

/**
 * Show a prompt dialog
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.placeholder]
 * @param {string} [options.defaultValue='']
 * @param {string} [options.confirmLabel='OK']
 * @param {string} [options.cancelLabel='Cancel']
 * @param {(value: string) => string|null} [options.validate] - Return error message or null if valid
 * @returns {Promise<string|null>} - Returns input value or null if cancelled
 */
export function prompt(options) {
  const {
    title,
    message,
    placeholder,
    defaultValue = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    validate,
  } = options;

  return new Promise((resolve) => {
    // Create content
    const content = document.createElement('div');

    if (message) {
      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.marginBottom = '12px';
      content.appendChild(messageEl);
    }

    const input = document.createElement('input');
    input.className = 'mrmd-input';
    input.type = 'text';
    input.value = defaultValue;
    if (placeholder) input.placeholder = placeholder;
    content.appendChild(input);

    const errorEl = document.createElement('p');
    errorEl.style.color = 'var(--mrmd-error, #f44336)';
    errorEl.style.fontSize = '12px';
    errorEl.style.marginTop = '6px';
    errorEl.style.display = 'none';
    content.appendChild(errorEl);

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = msg ? 'block' : 'none';
    }

    function submit() {
      const value = input.value.trim();

      if (validate) {
        const error = validate(value);
        if (error) {
          showError(error);
          input.focus();
          return;
        }
      }

      dialog.close();
      resolve(value);
    }

    const dialog = createDialog({
      title,
      content,
      buttons: [
        {
          label: cancelLabel,
          onClick: () => {
            dialog.close();
            resolve(null);
          },
        },
        {
          label: confirmLabel,
          primary: true,
          onClick: submit,
        },
      ],
      onClose: () => resolve(null),
    });

    // Handle enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    // Clear error on input
    input.addEventListener('input', () => showError(''));

    // Select all text
    input.select();
  });
}
