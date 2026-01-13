/**
 * Task Checkbox Widget
 *
 * Renders interactive checkboxes for GFM task lists.
 * - [ ] Unchecked task
 * - [x] Checked task
 *
 * When clicked, updates the markdown source directly.
 *
 * @module markdown/widgets/checkbox
 */

import { WidgetType } from '@codemirror/view';

/**
 * Widget for rendering task list checkboxes
 */
export class TaskCheckboxWidget extends WidgetType {
  /**
   * @param {boolean} checked - Whether the checkbox is checked
   * @param {number} pos - Position of '[' in the document
   */
  constructor(checked, pos) {
    super();
    this.checked = checked;
    this.pos = pos;
  }

  eq(other) {
    return this.checked === other.checked && this.pos === other.pos;
  }

  toDOM(view) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'cm-task-checkbox';
    checkbox.checked = this.checked;
    checkbox.setAttribute('aria-label', this.checked ? 'Completed task' : 'Incomplete task');

    // Handle click to toggle checkbox in source
    checkbox.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const newChar = this.checked ? ' ' : 'x';
      // Replace the character between [ and ]
      // pos points to '[', so pos+1 is the space or x
      view.dispatch({
        changes: {
          from: this.pos + 1,
          to: this.pos + 2,
          insert: newChar,
        },
      });
    });

    // Prevent focus from leaving editor
    checkbox.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    return checkbox;
  }

  ignoreEvent() {
    return false; // Allow events to propagate for interactivity
  }
}
