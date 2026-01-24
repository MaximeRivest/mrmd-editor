/**
 * Cell Control Widgets
 *
 * CodeMirror WidgetType classes for cell controls:
 * - PlayButton: Run a cell
 * - StopButton: Cancel running/queued cell
 * - StatusBadge: Show queued/running status with position
 * - CopyButton: Copy code/output
 * - CellControlsWidget: Container for all controls
 */

import { WidgetType } from '@codemirror/view';

/**
 * @typedef {import('../state/schema.js').CellStatusInfo} CellStatusInfo
 * @typedef {import('../config/schema.js').CellButtonsConfig} CellButtonsConfig
 */

// CSS class prefix for theming
const PREFIX = 'cm-cell-controls';

/**
 * Terminal controls widget - button to launch terminal for ```term blocks
 */
export class TerminalControlsWidget extends WidgetType {
  constructor(options) {
    super();
    this.blockIndex = options.blockIndex;
    this.block = options.block;
    this.callbacks = options.callbacks;
  }

  eq(other) {
    return (
      other instanceof TerminalControlsWidget &&
      this.blockIndex === other.blockIndex &&
      this.block.start === other.block.start
    );
  }

  toDOM() {
    const container = document.createElement('span');
    container.className = `${PREFIX} ${PREFIX}-terminal`;
    container.dataset.blockIndex = String(this.blockIndex);

    // Terminal launch button
    const btn = document.createElement('button');
    btn.className = `${PREFIX}-btn ${PREFIX}-btn-terminal`;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 17 10 11 4 5"></polyline>
      <line x1="12" y1="19" x2="20" y2="19"></line>
    </svg>`;
    btn.title = 'Launch Terminal';
    btn.setAttribute('aria-label', `Launch terminal for block ${this.blockIndex + 1}`);

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onLaunchTerminal?.(this.block, this.blockIndex);
    };

    container.appendChild(btn);
    return container;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Main cell controls widget - container for buttons and status
 */
export class CellControlsWidget extends WidgetType {
  /**
   * @param {Object} options
   * @param {number} options.cellIndex - Cell index
   * @param {string} options.language - Cell language
   * @param {CellStatusInfo} options.status - Current cell status
   * @param {CellButtonsConfig} options.buttons - Which buttons to show
   * @param {number} options.queueTotal - Total items in queue
   * @param {Object} options.callbacks - Action callbacks
   * @param {function} options.callbacks.onRun - Called when run is clicked
   * @param {function} options.callbacks.onStop - Called when stop is clicked
   * @param {function} options.callbacks.onClear - Called when clear is clicked
   * @param {function} options.callbacks.onCopy - Called when copy is clicked
   * @param {function} options.callbacks.onCopyOutput - Called when copy output is clicked
   * @param {function} options.callbacks.onCopyBoth - Called when copy both is clicked
   */
  constructor(options) {
    super();
    this.cellIndex = options.cellIndex;
    this.language = options.language;
    this.status = options.status;
    this.buttons = options.buttons;
    this.queueTotal = options.queueTotal;
    this.callbacks = options.callbacks;
  }

  eq(other) {
    return (
      other instanceof CellControlsWidget &&
      this.cellIndex === other.cellIndex &&
      this.status.status === other.status.status &&
      this.status.queuePosition === other.status.queuePosition &&
      this.queueTotal === other.queueTotal &&
      this.language === other.language
    );
  }

  toDOM() {
    const container = document.createElement('span');
    container.className = `${PREFIX}`;
    container.dataset.cellIndex = String(this.cellIndex);

    const { status, queuePosition } = this.status;

    // Status-based rendering
    if (status === 'running') {
      // Running: show spinner + stop button
      container.appendChild(this._createRunningIndicator());
      if (this.buttons.stop) {
        container.appendChild(this._createStopButton());
      }
    } else if (status === 'queued') {
      // Queued: show position badge + stop button
      container.appendChild(this._createQueueBadge(queuePosition));
      if (this.buttons.stop) {
        container.appendChild(this._createStopButton());
      }
    } else {
      // Idle/success/error: show play button + action buttons
      if (this.buttons.run) {
        container.appendChild(this._createPlayButton());
      }
      if (this.buttons.copy) {
        container.appendChild(this._createCopyButton());
      }
      if (this.buttons.clear) {
        container.appendChild(this._createClearButton());
      }
    }

    return container;
  }

  _createPlayButton() {
    const btn = document.createElement('button');
    btn.className = `${PREFIX}-btn ${PREFIX}-btn-play`;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>`;
    btn.title = `Run ${this.language || 'code'} (Ctrl+Enter)`;
    btn.setAttribute('aria-label', `Run cell ${this.cellIndex + 1}`);

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onRun?.(this.cellIndex);
    };

    return btn;
  }

  _createStopButton() {
    const btn = document.createElement('button');
    btn.className = `${PREFIX}-btn ${PREFIX}-btn-stop`;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h12v12H6z"/>
    </svg>`;
    btn.title = 'Cancel execution';
    btn.setAttribute('aria-label', `Cancel cell ${this.cellIndex + 1}`);

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onStop?.(this.cellIndex, this.status.execId);
    };

    return btn;
  }

  _createRunningIndicator() {
    const indicator = document.createElement('span');
    indicator.className = `${PREFIX}-status ${PREFIX}-status-running`;
    indicator.innerHTML = `<svg class="${PREFIX}-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32">
        <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite"/>
      </circle>
    </svg>`;
    if (this.queueTotal > 1) {
      const posLabel = document.createElement('span');
      posLabel.className = `${PREFIX}-pos`;
      posLabel.textContent = `1/${this.queueTotal}`;
      indicator.appendChild(posLabel);
    }
    return indicator;
  }

  _createQueueBadge(position) {
    const badge = document.createElement('span');
    badge.className = `${PREFIX}-status ${PREFIX}-status-queued`;

    const icon = document.createElement('span');
    icon.className = `${PREFIX}-queue-icon`;
    icon.textContent = '\u23F3'; // Hourglass
    badge.appendChild(icon);

    if (position !== null && this.queueTotal > 0) {
      const posLabel = document.createElement('span');
      posLabel.className = `${PREFIX}-pos`;
      // Position in display is: (running=1) + queuePosition
      const displayPos = position + (this.queueTotal > this.status.queuePosition ? 1 : 0);
      posLabel.textContent = `${position + 1}/${this.queueTotal}`;
      badge.appendChild(posLabel);
    }

    return badge;
  }

  _createCopyButton() {
    const btn = document.createElement('button');
    btn.className = `${PREFIX}-btn ${PREFIX}-btn-copy`;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>`;
    btn.title = 'Copy code';
    btn.setAttribute('aria-label', `Copy code from cell ${this.cellIndex + 1}`);

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onCopy?.(this.cellIndex);
      this._showCopyFeedback(btn);
    };

    return btn;
  }

  _createClearButton() {
    const btn = document.createElement('button');
    btn.className = `${PREFIX}-btn ${PREFIX}-btn-clear`;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>`;
    btn.title = 'Clear output';
    btn.setAttribute('aria-label', `Clear output of cell ${this.cellIndex + 1}`);

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onClear?.(this.cellIndex);
    };

    return btn;
  }

  _showCopyFeedback(btn) {
    const original = btn.innerHTML;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 6L9 17l-5-5"/>
    </svg>`;
    btn.classList.add(`${PREFIX}-btn-copied`);
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove(`${PREFIX}-btn-copied`);
    }, 1500);
  }

  ignoreEvent() {
    return true; // Handle all events ourselves
  }
}

/**
 * Gutter marker for cell controls (alternative to inline widget)
 */
export class CellControlsGutterMarker extends WidgetType {
  constructor(options) {
    super();
    this.cellIndex = options.cellIndex;
    this.status = options.status;
    this.queueTotal = options.queueTotal;
    this.callbacks = options.callbacks;
  }

  eq(other) {
    return (
      other instanceof CellControlsGutterMarker &&
      this.cellIndex === other.cellIndex &&
      this.status.status === other.status.status &&
      this.status.queuePosition === other.status.queuePosition
    );
  }

  toDOM() {
    const marker = document.createElement('div');
    marker.className = `${PREFIX}-gutter`;

    const { status } = this.status;

    if (status === 'running') {
      marker.innerHTML = `<span class="${PREFIX}-gutter-running">\u25CF</span>`;
      marker.title = 'Running...';
    } else if (status === 'queued') {
      marker.innerHTML = `<span class="${PREFIX}-gutter-queued">\u23F3</span>`;
      marker.title = `Queued (${this.status.queuePosition}/${this.queueTotal})`;
    } else {
      marker.innerHTML = `<span class="${PREFIX}-gutter-play">\u25B6</span>`;
      marker.title = 'Run cell';
      marker.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onRun?.(this.cellIndex);
      };
    }

    return marker;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Inject CSS styles for cell controls
 *
 * Uses widget theme tokens (--widget-*) for consistent theming.
 * Falls back to reasonable defaults if tokens aren't set.
 */
export function injectCellControlsStyles() {
  if (document.getElementById('mrmd-cell-controls-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mrmd-cell-controls-styles';
  style.textContent = `
    /* Cell Controls Container */
    .${PREFIX} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
      vertical-align: middle;
      font-size: var(--widget-font-size-label, 12px);
      font-family: var(--widget-font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }

    /* Buttons - minimal, icon only */
    .${PREFIX}-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--widget-text-muted, #9e9e9e);
      cursor: pointer;
      opacity: 0.6;
      transition: opacity 0.15s ease;
    }

    .${PREFIX}-btn:hover {
      opacity: 1;
      background: transparent;
    }

    .${PREFIX}-btn:active {
      transform: scale(0.95);
    }

    /* Play button - success color */
    .${PREFIX}-btn-play {
      color: var(--widget-success, #4caf50);
    }

    .${PREFIX}-btn-play:hover {
      background: transparent;
    }

    /* Stop button - error color */
    .${PREFIX}-btn-stop {
      color: var(--widget-error, #f44336);
    }

    .${PREFIX}-btn-stop:hover {
      background: transparent;
    }

    /* Copy button */
    .${PREFIX}-btn-copy {
      color: var(--widget-text-muted, #9e9e9e);
    }

    .${PREFIX}-btn-copied {
      color: var(--widget-success, #4caf50);
    }

    /* Clear button */
    .${PREFIX}-btn-clear {
      color: var(--widget-text-muted, #9e9e9e);
    }

    /* Status indicators */
    .${PREFIX}-status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: var(--widget-border-radius, 4px);
      font-size: var(--widget-font-size-small, 11px);
      font-weight: 500;
    }

    /* Running status - use info color */
    .${PREFIX}-status-running {
      color: var(--widget-info, #3b82f6);
      background: color-mix(in srgb, var(--widget-info, #3b82f6) 10%, transparent);
    }

    /* Queued status - use warning color */
    .${PREFIX}-status-queued {
      color: var(--widget-warning, #f59e0b);
      background: color-mix(in srgb, var(--widget-warning, #f59e0b) 10%, transparent);
    }

    .${PREFIX}-spinner {
      animation: ${PREFIX}-spin 1s linear infinite;
    }

    @keyframes ${PREFIX}-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .${PREFIX}-pos {
      font-variant-numeric: tabular-nums;
      font-size: 10px;
      opacity: 0.8;
    }

    .${PREFIX}-queue-icon {
      font-size: 12px;
    }

    /* Gutter styles */
    .${PREFIX}-gutter {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      cursor: pointer;
      font-size: 10px;
    }

    .${PREFIX}-gutter-play {
      color: var(--widget-success, #22c55e);
      opacity: 0.5;
      transition: opacity 0.15s;
    }

    .${PREFIX}-gutter:hover .${PREFIX}-gutter-play {
      opacity: 1;
    }

    .${PREFIX}-gutter-running {
      color: var(--widget-info, #3b82f6);
      animation: ${PREFIX}-pulse 1s ease-in-out infinite;
    }

    .${PREFIX}-gutter-queued {
      color: var(--widget-warning, #f59e0b);
    }

    @keyframes ${PREFIX}-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Terminal button */
    .${PREFIX}-btn-terminal {
      color: var(--widget-info, #3b82f6);
    }

    .${PREFIX}-btn-terminal:hover {
      color: var(--widget-info, #60a5fa);
    }
  `;

  document.head.appendChild(style);
}
