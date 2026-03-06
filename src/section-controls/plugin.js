/**
 * Section Controls Plugin (floating overlay)
 */

import { ViewPlugin } from '@codemirror/view';
import { Facet } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { createSectionControlsDom, injectSectionControlsStyles } from './widgets.js';

export const sectionControlsFacet = Facet.define({
  combine: (values) => values[0] || { enabled: true, showAi: true, showFormatting: true },
});

function getSectionAnchorPos(state) {
  const head = state.selection.main.head;
  const tree = syntaxTree(state);
  let node = tree.resolveInner(head, -1);

  while (node?.parent && node.parent.name !== 'Document') {
    node = node.parent;
  }

  // Fallback to current line end.
  if (!node || node.name === 'Document') return state.doc.lineAt(head).to;

  // End of top-level block (paragraph/list/table/code/etc.).
  const safe = Math.max(node.from, Math.min(node.to - 1, state.doc.length));
  return state.doc.lineAt(safe).to;
}

export function createSectionControlsPlugin(editor) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.config = view.state.facet(sectionControlsFacet);
        this.dom = null;
        this.measurePending = false;
        this.lastWidth = 260;

        injectSectionControlsStyles();

        this.onWindowResize = () => this.scheduleReposition();
        this.onScroll = () => this.scheduleReposition();
        window.addEventListener('resize', this.onWindowResize);
        this.view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });

        this.ensureDom();
        this.scheduleReposition();
      }

      ensureDom() {
        if (this.dom) {
          this.dom.remove();
          this.dom = null;
        }

        if (!this.config.enabled || (!this.config.showAi && !this.config.showFormatting)) {
          return;
        }

        this.dom = createSectionControlsDom(this.view, {
          editor,
          showAi: this.config.showAi,
          showFormatting: this.config.showFormatting,
        });

        document.body.appendChild(this.dom);
      }

      scheduleReposition() {
        if (!this.dom || this.measurePending) return;

        this.measurePending = true;

        this.view.requestMeasure({
          read: (view) => {
            this.measurePending = false;
            if (!this.dom) return null;

            const anchor = getSectionAnchorPos(view.state);
            const coords = view.coordsAtPos(anchor);
            if (!coords) return null;

            const contentRect = view.contentDOM.getBoundingClientRect();
            const width = this.dom.offsetWidth || this.lastWidth;

            return {
              right: contentRect.right,
              bottom: coords.bottom,
              width,
            };
          },
          write: (m) => {
            if (!this.dom) return;

            if (!m) {
              this.dom.style.display = 'none';
              return;
            }

            const left = Math.max(8, m.right - m.width - 10);
            const top = Math.max(8, m.bottom + 6);

            this.lastWidth = m.width;
            this.dom.style.display = 'block';
            this.dom.style.left = `${left}px`;
            this.dom.style.top = `${top}px`;
          },
        });
      }

      update(update) {
        const newConfig = update.state.facet(sectionControlsFacet);
        const configChanged = (
          this.config.enabled !== newConfig.enabled ||
          this.config.showAi !== newConfig.showAi ||
          this.config.showFormatting !== newConfig.showFormatting
        );

        if (configChanged) {
          this.config = newConfig;
          this.ensureDom();
        }

        if (
          configChanged ||
          update.selectionSet ||
          update.docChanged ||
          update.viewportChanged ||
          update.focusChanged
        ) {
          this.scheduleReposition();
        }
      }

      destroy() {
        window.removeEventListener('resize', this.onWindowResize);
        this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
        if (this.dom) {
          this.dom.remove();
          this.dom = null;
        }
      }
    }
  );
}
