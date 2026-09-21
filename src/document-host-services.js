// Host-owned provenance and optional language services. Everything uses this
// bundle's CodeMirror instance; hosts never need a second copy of CM packages.
import { StateEffect, StateField, RangeSet, Compartment, EditorState } from '@codemirror/state';
import { EditorView, gutter, GutterMarker, hoverTooltip, keymap } from '@codemirror/view';
import { completeAnyWord, acceptCompletion } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { setDiagnostics } from '@codemirror/lint';

export function documentHostServices(options = {}) {
  const setMarks = StateEffect.define();
  class Mark extends GutterMarker {
    constructor(info) { super(); this.info = info; }
    eq(other) { return other.info?.glyph === this.info.glyph && other.info?.title === this.info.title && other.info?.cls === this.info.cls; }
    toDOM() {
      const el = document.createElement('span');
      el.className = 'mrmd-line-mark ' + (this.info.cls || ''); el.textContent = this.info.glyph || '';
      if (this.info.title) el.title = this.info.title;
      return el;
    }
  }
  const marks = StateField.define({
    create: () => RangeSet.empty,
    update(value, tr) {
      // Never retain an author's label on newly edited or shifted text while
      // the host computes the new line mapping asynchronously.
      if (tr.docChanged) value = RangeSet.empty;
      for (const e of tr.effects) if (e.is(setMarks)) {
        const list = e.value instanceof Map ? [...e.value] : Object.entries(e.value || {});
        value = RangeSet.of(list.filter(([n]) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= tr.state.doc.lines)
          .map(([n, info]) => new Mark(info).range(tr.state.doc.line(Number(n)).from)), true);
      }
      return value;
    },
  });
  let view = null, service = null, destroyed = false, hoverSerial = 0;
  const requests = new Set();
  const config = new Compartment();
  function request() { const controller = new AbortController(); requests.add(controller); return controller; }
  function cancelRequests() { for (const c of requests) c.abort(); requests.clear(); }
  const extension = [
    marks,
    EditorView.theme({
      '.mrmd-mark-gutter': { minWidth: '14px' },
      '.mrmd-line-mark': { display: 'inline-block', width: '12px', textAlign: 'center' },
      '.mrmd-language-hover': { maxWidth: '480px', padding: '8px', whiteSpace: 'pre-wrap' },
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        hoverSerial++; cancelRequests(); options.onLineHoverEnd?.();
        update.view.dom.querySelectorAll('.mrmd-mark-gutter [title]').forEach(el => el.removeAttribute('title'));
      }
    }),
    options.lineGutter !== false ? gutter({
      class: 'mrmd-mark-gutter', renderEmptyElements: true,
      markers: v => v.state.field(marks),
      domEventHandlers: {
        mouseover(v, line, event) {
          if (!options.onLineHover) return false;
          const el = event.target.closest('.mrmd-line-mark') || event.target.closest('.cm-gutterElement'); if (!el) return false;
          el.title = 'Loading line attribution…';
          const doc = v.state.doc, ticket = ++hoverSerial;
          const n = v.state.doc.lineAt(line.from).number;
          Promise.resolve(options.onLineHover(n)).then(text => {
            if (!destroyed && ticket === hoverSerial && v.state.doc === doc && el.isConnected && text) el.title = String(text);
          }).catch(() => {});
          return false;
        },
        mouseout() { hoverSerial++; options.onLineHoverEnd?.(); return false; },
        click(v, line) {
          const n = v.state.doc.lineAt(line.from).number;
          let info; v.state.field(marks).between(line.from, line.from, (_a, _b, marker) => { info = marker.info; });
          if (info && options.onMarkClick) { options.onMarkClick(n, info); return true; }
          return false;
        },
      },
    }) : [],
    config.of([]),
    // Native language completion sources stay enabled. Word completion is an
    // explicit Ctrl-Space fallback, not a claim of project-wide intelligence.
    options.wordCompletion ? EditorState.languageData.of(() => [{ autocomplete: c => c.explicit ? completeAnyWord(c) : null }]) : [],
    options.codeKeys ? keymap.of([{ key: 'Tab', run: acceptCompletion }, indentWithTab]) : [],
  ];
  function serviceExtensions(current) {
    if (!current) return [];
    const result = [];
    if (current.complete) result.push(EditorState.languageData.of(() => [{ autocomplete: async c => {
      const doc = c.state.doc, controller = request(); c.addEventListener('abort', () => controller.abort(), { onDocChange: true });
      try {
        const response = await current.complete({ text: doc.toString(), pos: c.pos, explicit: c.explicit, filename: options.filename || '', signal: controller.signal });
        if (destroyed || controller.signal.aborted || service !== current || view.state.doc !== doc || !response) return null;
        if (!Number.isInteger(response.from) || response.from < 0 || response.from > c.pos || !Array.isArray(response.options)) return null;
        if (response.to !== undefined && (!Number.isInteger(response.to) || response.to < c.pos || response.to > doc.length)) return null;
        return { ...response, options: response.options.filter(o => o && typeof o.label === 'string').slice(0, 1000) };
      } catch { return null; } finally { requests.delete(controller); }
    } }]));
    if (current.hover) result.push(hoverTooltip(async (v, pos) => {
      const doc = v.state.doc, controller = request();
      try {
        const text = await current.hover({ text: doc.toString(), pos, filename: options.filename || '', signal: controller.signal });
        if (destroyed || controller.signal.aborted || service !== current || v.state.doc !== doc || !text) return null;
        return { pos, create() { const dom = document.createElement('div'); dom.className = 'mrmd-language-hover'; dom.textContent = String(text); return { dom }; } };
      } catch { return null; } finally { requests.delete(controller); }
    }));
    if (current.definition && options.onNavigateLocation) result.push(keymap.of([{ key: 'F12', run(v) {
      const doc = v.state.doc, controller = request();
      Promise.resolve(current.definition({ text: doc.toString(), pos: v.state.selection.main.head, filename: options.filename || '', signal: controller.signal }))
        .then(location => { if (!destroyed && !controller.signal.aborted && service === current && v.state.doc === doc && location) options.onNavigateLocation(location); })
        .catch(() => {}).finally(() => requests.delete(controller));
      return true;
    } }]));
    return result;
  }
  return {
    extension,
    attach(v) { view = v; },
    setLineMarks(value, expectedContent) {
      if (destroyed || expectedContent !== undefined && view.state.doc.toString() !== expectedContent) return false;
      view.dispatch({ effects: setMarks.of(value) }); return true;
    },
    setFilename(value) { cancelRequests(); options.filename = value; },
    setLanguageServices(value) {
      cancelRequests(); service = value || null;
      view.dispatch({ effects: config.reconfigure(serviceExtensions(service)) });
    },
    setDiagnostics(value, expectedContent) {
      if (destroyed || typeof expectedContent !== 'string' || view.state.doc.toString() !== expectedContent) return false;
      view.dispatch(setDiagnostics(view.state, value)); return true;
    },
    destroy() { destroyed = true; hoverSerial++; cancelRequests(); },
  };
}
