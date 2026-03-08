/**
 * Section Controls Plugin (floating overlay)
 */

import { ViewPlugin } from '@codemirror/view';
import { Facet } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { getSelectionFormattingState } from '../markdown/inline-commands.js';
import { createSectionControlsDom, injectSectionControlsStyles } from './widgets.js';

export const sectionControlsFacet = Facet.define({
  combine: (values) => values[0] || { enabled: true, showAi: true, showFormatting: true, mode: 'dots-click' },
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
          mode: this.config.mode,
        });

        document.body.appendChild(this.dom);
        this.updateFormattingState();
      }

      updateFormattingState() {
        if (!this.dom) return;
        const formatting = getSelectionFormattingState(this.view);
        const marks = ['bold', 'italic', 'underline', 'strikethrough', 'code'];
        for (const mark of marks) {
          const btn = this.dom.querySelector(`.cm-section-controls-btn.${mark}`);
          if (!btn) continue;
          const stateKey = mark === 'strikethrough' ? 'strikethrough' : mark;
          btn.classList.toggle('is-active', !!formatting[stateKey]);
          btn.classList.toggle('is-mixed', !!formatting.mixed?.[stateKey]);
        }
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

            return {
              // Distance from right edge of viewport to right edge of content
              rightOffset: window.innerWidth - contentRect.right,
              bottom: coords.bottom,
            };
          },
          write: (m) => {
            if (!this.dom) return;

            if (!m) {
              this.dom.style.display = 'none';
              return;
            }

            const top = Math.max(8, m.bottom + 6);

            this.dom.style.display = 'block';
            this.dom.style.left = 'auto';
            this.dom.style.right = `${Math.max(8, m.rightOffset + 10)}px`;
            this.dom.style.top = `${top}px`;
          },
        });
      }

      update(update) {
        const newConfig = update.state.facet(sectionControlsFacet);
        const configChanged = (
          this.config.enabled !== newConfig.enabled ||
          this.config.showAi !== newConfig.showAi ||
          this.config.showFormatting !== newConfig.showFormatting ||
          this.config.mode !== newConfig.mode
        );

        if (configChanged) {
          this.config = newConfig;
          this.ensureDom();
        }

        if (configChanged || update.selectionSet || update.docChanged) {
          this.updateFormattingState();
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
