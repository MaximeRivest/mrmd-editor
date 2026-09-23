import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatKey } from '../src/key-names.js';

test('keys read as the keyboard says them, elsewhere than on a Mac', () => {
  const pc = name => formatKey(name, { mac: false });
  assert.equal(pc('Mod-j'), 'Ctrl+J');
  assert.equal(pc('Alt-]'), 'Alt+]');
  assert.equal(pc('Shift-Enter'), 'Shift+Enter');
  assert.equal(pc('Mod-Enter'), 'Ctrl+Enter');
  assert.equal(pc('Escape'), 'Esc');
  assert.equal(pc('Tab'), 'Tab');
  assert.equal(pc('ArrowDown'), '↓');
  assert.equal(pc('Mod-Shift-z'), 'Ctrl+Shift+Z');
});

test('on a Mac, Mod is Command and modifiers are glyphs in Apple order', () => {
  const mac = name => formatKey(name, { mac: true });
  assert.equal(mac('Mod-j'), '⌘J');
  assert.equal(mac('Alt-]'), '⌥]');
  assert.equal(mac('Shift-Mod-z'), '⇧⌘Z', 'written in any order, printed ⌃⌥⇧⌘');
  assert.equal(mac('Ctrl-Alt-a'), '⌃⌥A');
  assert.equal(mac('Escape'), 'Esc');
});

test('CodeMirror spellings of the modifiers are all accepted; a key named "-" too', () => {
  assert.equal(formatKey('c-a-s-x', { mac: false }), 'Ctrl+Alt+Shift+X');
  assert.equal(formatKey('Control-Meta-k', { mac: false }), 'Ctrl+Meta+K');
  assert.equal(formatKey('Mod--', { mac: false }), 'Ctrl+-');
});

test('a misspelt modifier is an error, not a label', () => {
  assert.throws(() => formatKey('Cmdd-j'), /unknown modifier "Cmdd"/);
});
