/**
 * List Marker Widget
 *
 * Renders cleaner list bullets for unordered markdown lists.
 *
 * @module markdown/widgets/list-marker
 */

import { WidgetType } from '@codemirror/view';

/**
 * Widget for rendering unordered list bullets.
 */
export class ListMarkerWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-list-bullet';
    span.textContent = '•';
    return span;
  }

  ignoreEvent() {
    return true;
  }
}
