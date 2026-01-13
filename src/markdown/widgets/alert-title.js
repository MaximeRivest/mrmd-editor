/**
 * Alert Title Widget
 *
 * Renders GitHub-style alert titles: [!NOTE], [!TIP], [!WARNING], etc.
 * Replaces the raw [!TYPE] marker with a styled badge.
 *
 * @module markdown/widgets/alert-title
 */

import { WidgetType } from '@codemirror/view';

/**
 * Icons for each alert type (using Unicode symbols)
 */
const ALERT_ICONS = {
  note: 'ℹ️',
  tip: '💡',
  important: '❗',
  warning: '⚠️',
  caution: '🛑',
};

/**
 * Widget for rendering alert title badges.
 */
export class AlertTitleWidget extends WidgetType {
  /**
   * @param {string} type - Alert type: 'note', 'tip', 'important', 'warning', 'caution'
   */
  constructor(type) {
    super();
    this.type = type.toLowerCase();
  }

  eq(other) {
    return this.type === other.type;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-alert-title cm-alert-title-${this.type}`;

    // Icon
    const icon = document.createElement('span');
    icon.className = 'cm-alert-icon';
    icon.textContent = ALERT_ICONS[this.type] || 'ℹ️';
    span.appendChild(icon);

    // Text
    const text = document.createElement('span');
    text.className = 'cm-alert-text';
    text.textContent = this.type.charAt(0).toUpperCase() + this.type.slice(1);
    span.appendChild(text);

    return span;
  }

  ignoreEvent() {
    return true;
  }
}
