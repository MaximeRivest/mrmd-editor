/**
 * Keys as a person reads them. CodeMirror names keys 'Mod-j', 'Alt-]',
 * 'Shift-Enter'; a label says 'Ctrl+J' (⌘J on a Mac). One speller for
 * every key the editor shows — button labels, titles, the AI command box —
 * and for the keys it reports to its host (editor.keyHelp()), so a label
 * never disagrees with the binding it names.
 */

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// CodeMirror's modifier spellings (see its normalizeKeyName), to one name each.
const MODIFIERS = {
  mod: mac => (mac ? 'meta' : 'ctrl'),
  ctrl: () => 'ctrl', control: () => 'ctrl', c: () => 'ctrl',
  alt: () => 'alt', a: () => 'alt',
  shift: () => 'shift', s: () => 'shift',
  meta: () => 'meta', cmd: () => 'meta', m: () => 'meta',
};
// Printed in this order: Apple's (⌃⌥⇧⌘) and the usual one elsewhere.
const ORDER = ['ctrl', 'alt', 'shift', 'meta'];
const WORDS = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' };
const GLYPHS = { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' };

const KEYS = {
  Escape: 'Esc', Esc: 'Esc',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ' ': 'Space', Space: 'Space',
  PageUp: 'PgUp', PageDown: 'PgDn',
};

/**
 * A CodeMirror key name as a label: formatKey('Mod-j') → 'Ctrl+J' (⌘J on a
 * Mac), formatKey('Alt-]') → 'Alt+]' (⌥]), formatKey('Escape') → 'Esc'.
 * Throws on a modifier CodeMirror would not accept: a misspelt key name is
 * a bug, not something to show.
 * @param {string} name
 * @param {{mac?: boolean}} [options] spell for a Mac (default: this device)
 */
export function formatKey(name, { mac = MAC } = {}) {
  const parts = String(name).split(/-(?!$)/);
  const key = parts.pop();
  const mods = new Set();
  for (const part of parts) {
    const spell = MODIFIERS[part.toLowerCase()];
    if (!spell) throw new TypeError(`formatKey: unknown modifier "${part}" in "${name}"`);
    mods.add(spell(mac));
  }
  const shown = KEYS[key] || (key.length === 1 ? key.toUpperCase() : key);
  const held = ORDER.filter(m => mods.has(m));
  return mac
    ? held.map(m => GLYPHS[m]).join('') + shown
    : [...held.map(m => WORDS[m]), shown].join('+');
}
