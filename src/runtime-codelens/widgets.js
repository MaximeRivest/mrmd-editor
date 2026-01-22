/**
 * Runtime CodeLens Widget
 *
 * Renders the CodeLens UI with:
 * - Language label (🐍 Python, ⬢ Node, etc.)
 * - Action buttons (Start, Restart, Stop)
 * - Status indicator (● connected, ○ stopped)
 * - "Restart All" button for multi-runtime configs
 */

import { WidgetType } from '@codemirror/view';

/** Language display labels */
const LANGUAGE_LABELS = {
  python: '🐍 Python',
  bash: '$ Bash',
  node: '⬢ Node',
  julia: '◐ Julia',
  r: '📊 R',
  shell: '⌘ Shell',
};

/**
 * @typedef {Object} RuntimeStatus
 * @property {boolean} alive - Whether runtime is running
 * @property {number} [pid] - Process ID
 * @property {number} [port] - Port number
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} RuntimeInfo
 * @property {string} language - Runtime language
 * @property {string} name - Session name
 * @property {string} [venv] - Virtual environment path
 * @property {string} [cwd] - Working directory
 * @property {RuntimeStatus} [status] - Current status
 */

/**
 * @typedef {Object} RuntimeCodeLensCallbacks
 * @property {(runtime: RuntimeInfo) => void} [onStart] - Start runtime
 * @property {(name: string) => void} [onStop] - Stop runtime by name
 * @property {(name: string) => void} [onRestart] - Restart runtime by name
 * @property {() => void} [onRestartAll] - Restart all runtimes
 */

export class RuntimeCodeLensWidget extends WidgetType {
  /**
   * @param {Object} options
   * @param {RuntimeInfo[]} options.runtimes - Runtime configurations with status
   * @param {RuntimeCodeLensCallbacks} options.callbacks - Action callbacks
   * @param {'config' | 'frontmatter'} options.blockType - Block type
   */
  constructor(options) {
    super();
    this.runtimes = options.runtimes || [];
    this.callbacks = options.callbacks || {};
    this.blockType = options.blockType || 'config';
  }

  eq(other) {
    if (!(other instanceof RuntimeCodeLensWidget)) return false;
    if (this.runtimes.length !== other.runtimes.length) return false;
    if (this.blockType !== other.blockType) return false;

    // Compare each runtime's status
    for (let i = 0; i < this.runtimes.length; i++) {
      const a = this.runtimes[i];
      const b = other.runtimes[i];
      if (a.name !== b.name) return false;
      if (a.language !== b.language) return false;
      if (a.status?.alive !== b.status?.alive) return false;
      if (a.status?.pid !== b.status?.pid) return false;
    }

    return true;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-runtime-codelens';

    // Render each runtime's controls
    for (const runtime of this.runtimes) {
      container.appendChild(this._createRuntimeRow(runtime));
    }

    // "Restart All" button (only for config blocks with multiple runtimes)
    if (this.blockType === 'config' && this.runtimes.length > 1) {
      const restartAllRow = document.createElement('div');
      restartAllRow.className = 'cm-runtime-codelens-row cm-runtime-codelens-row--all';

      const restartAllBtn = this._createButton('↻ Restart All', 'Restart all runtimes', () => {
        this.callbacks.onRestartAll?.();
      });
      restartAllBtn.className += ' cm-runtime-codelens-btn--restart-all';
      restartAllRow.appendChild(restartAllBtn);
      container.appendChild(restartAllRow);
    }

    return container;
  }

  /**
   * Create a row for a single runtime
   * @param {RuntimeInfo} runtime
   * @returns {HTMLElement}
   */
  _createRuntimeRow(runtime) {
    const row = document.createElement('div');
    row.className = 'cm-runtime-codelens-row';

    // Language label
    const label = document.createElement('span');
    label.className = 'cm-runtime-codelens-label';
    label.textContent = LANGUAGE_LABELS[runtime.language] || runtime.language;
    row.appendChild(label);

    // Session name (if not "default")
    if (runtime.name && runtime.name !== 'default') {
      const nameBadge = document.createElement('span');
      nameBadge.className = 'cm-runtime-codelens-name';
      nameBadge.textContent = runtime.name;
      row.appendChild(nameBadge);
    }

    // Actions container
    const actions = document.createElement('div');
    actions.className = 'cm-runtime-codelens-actions';

    const isAlive = runtime.status?.alive;

    if (!isAlive) {
      // Not running: show Start button
      actions.appendChild(
        this._createButton('▶', 'Start', () => {
          this.callbacks.onStart?.(runtime);
        })
      );
    } else {
      // Running: show Restart and Stop buttons
      actions.appendChild(
        this._createButton('↻', 'Restart', () => {
          this.callbacks.onRestart?.(runtime.name);
        })
      );
      actions.appendChild(
        this._createButton('■', 'Stop', () => {
          this.callbacks.onStop?.(runtime.name);
        })
      );
    }

    row.appendChild(actions);

    // Status indicator
    const status = document.createElement('span');
    status.className = 'cm-runtime-codelens-status';
    status.innerHTML = this._renderStatus(runtime.status);
    row.appendChild(status);

    return row;
  }

  /**
   * Create a button element
   * @param {string} text - Button text
   * @param {string} title - Tooltip
   * @param {() => void} onClick - Click handler
   * @returns {HTMLButtonElement}
   */
  _createButton(text, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'cm-runtime-codelens-btn';
    btn.textContent = text;
    btn.title = title;
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    };
    return btn;
  }

  /**
   * Render status indicator HTML
   * @param {RuntimeStatus} [status]
   * @returns {string}
   */
  _renderStatus(status) {
    if (!status) {
      return '<span class="cm-runtime-codelens-dot cm-runtime-codelens-dot--gray"></span><span class="cm-runtime-codelens-status-text">Not started</span>';
    }

    if (status.error) {
      return `<span class="cm-runtime-codelens-dot cm-runtime-codelens-dot--red"></span><span class="cm-runtime-codelens-status-text">Error</span>`;
    }

    if (status.alive) {
      const pidText = status.pid ? ` (PID ${status.pid})` : '';
      return `<span class="cm-runtime-codelens-dot cm-runtime-codelens-dot--green"></span><span class="cm-runtime-codelens-status-text">Connected${pidText}</span>`;
    }

    return '<span class="cm-runtime-codelens-dot cm-runtime-codelens-dot--gray"></span><span class="cm-runtime-codelens-status-text">Stopped</span>';
  }

  ignoreEvent() {
    // Let our buttons handle their own events
    return true;
  }

  destroy() {
    // Cleanup if needed
  }
}
