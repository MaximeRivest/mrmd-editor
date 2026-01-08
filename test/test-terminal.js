/**
 * Terminal Buffer Tests
 *
 * Run with: node test/test-terminal.js
 * (Requires built dist/ or run from src with --experimental-vm-modules)
 */

import { TerminalBuffer, processTerminalOutput, stripAnsi, hasAnsi } from '../src/terminal.js';

// ===========================================================================
// Test Framework
// ===========================================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

function assertContains(str, needle, msg = '') {
  if (!str.includes(needle)) {
    throw new Error(`${msg}\n  Expected to contain: ${JSON.stringify(needle)}\n  In: ${JSON.stringify(str)}`);
  }
}

// ===========================================================================
// Tests
// ===========================================================================

console.log('\n=== TerminalBuffer Tests ===\n');

test('Basic text passthrough', () => {
  assertEqual(processTerminalOutput('Hello World'), 'Hello World');
});

test('Newlines preserved', () => {
  assertEqual(processTerminalOutput('A\nB\nC'), 'A\nB\nC');
});

test('Carriage return overwrites line', () => {
  assertEqual(processTerminalOutput('abc\rxyz'), 'xyz');
});

test('Progress bar simulation', () => {
  assertEqual(processTerminalOutput('0%\r25%\r50%\r100%'), '100%');
});

test('tqdm-style progress', () => {
  const input = 'Download: 0%|     |\rDownload: 50%|███  |\rDownload: 100%|█████|';
  assertEqual(processTerminalOutput(input), 'Download: 100%|█████|');
});

test('Carriage return + newline', () => {
  assertEqual(processTerminalOutput('Loading\rDone!  \nNext'), 'Done!\nNext');
});

test('ANSI colors stripped in toString()', () => {
  assertEqual(processTerminalOutput('\x1b[31mRed\x1b[0m'), 'Red');
});

test('Multiple ANSI codes', () => {
  assertEqual(processTerminalOutput('\x1b[31mA\x1b[0m \x1b[32mB\x1b[0m \x1b[34mC\x1b[0m'), 'A B C');
});

test('Bold and styles stripped', () => {
  assertEqual(processTerminalOutput('\x1b[1mBold\x1b[0m'), 'Bold');
});

test('Cursor up and replace line', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Line1\nLine2\nLine3');
  buffer.write('\x1b[1A');  // Up 1 (to Line2)
  buffer.write('\r');       // Start of line
  buffer.write('NEW');
  buffer.write('\x1b[K');   // Clear to end of line
  assertEqual(buffer.toString(), 'Line1\nNEW\nLine3');
});

test('Cursor up partial overwrite', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Line1\nLine2\nLine3');
  buffer.write('\x1b[1A');  // Up 1 (to Line2), cursor at col 5
  buffer.write('\r');       // Start of line
  buffer.write('NEW');      // Overwrites first 3 chars, leaves "e2"
  assertEqual(buffer.toString(), 'Line1\nNEWe2\nLine3');
});

test('Cursor up appends to shorter line', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Line1\nLine2\nLine3');
  buffer.write('\x1b[2A');  // Up 2 (to Line1), cursor at col 5
  buffer.write('NEW');      // Appends at col 5
  assertEqual(buffer.toString(), 'Line1NEW\nLine2\nLine3');
});

test('Cursor down', () => {
  const buffer = new TerminalBuffer();
  buffer.write('A\nB\nC');
  buffer.write('\x1b[3A');  // Back to top (row 0)
  buffer.write('\x1b[2B');  // Down 2 (row 2)
  buffer.write('\rX');      // Overwrite from start
  assertEqual(buffer.toString(), 'A\nB\nX');
});

test('Clear to end of line', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Hello World');
  buffer.write('\x1b[5D');  // Back 5
  buffer.write('\x1b[K');   // Clear to end
  assertEqual(buffer.toString(), 'Hello');
});

test('Clear entire line', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Hello World');
  buffer.write('\x1b[2K');
  assertEqual(buffer.toString(), '');
});

test('Tab expansion', () => {
  const buffer = new TerminalBuffer();
  buffer.write('A\tB');
  assertEqual(buffer.toString(), 'A       B');
});

test('Backspace', () => {
  // Backspace moves cursor back, space overwrites, but trailing space is trimmed
  assertEqual(processTerminalOutput('Helloo\b '), 'Hello');
});

test('Backspace mid-word', () => {
  assertEqual(processTerminalOutput('Helloo\bX'), 'HelloX');
});

test('256-color code', () => {
  const buffer = new TerminalBuffer();
  buffer.write('\x1b[38;5;208mOrange\x1b[0m');
  assertEqual(buffer.toString(), 'Orange');
  assertContains(buffer.toHtml(), 'style=');
});

test('RGB color code', () => {
  const buffer = new TerminalBuffer();
  buffer.write('\x1b[38;2;255;100;50mRGB\x1b[0m');
  assertEqual(buffer.toString(), 'RGB');
  assertContains(buffer.toHtml(), 'rgb(255,100,50)');
});

test('HTML output has color classes', () => {
  const buffer = new TerminalBuffer();
  buffer.write('\x1b[31mRed\x1b[0m');
  assertContains(buffer.toHtml(), 'ansi-fg-red');
});

test('HTML output has style classes', () => {
  const buffer = new TerminalBuffer();
  buffer.write('\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m');
  assertContains(buffer.toHtml(), 'ansi-bold');
  assertContains(buffer.toHtml(), 'ansi-italic');
});

test('ANSI output preserves codes', () => {
  const buffer = new TerminalBuffer();
  buffer.write('\x1b[31mRed\x1b[0m');
  assertContains(buffer.toAnsi(), '\x1b[31m');
});

test('Streaming: multiple writes', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Hel');
  buffer.write('lo ');
  buffer.write('World');
  assertEqual(buffer.toString(), 'Hello World');
});

test('Streaming: progress updates', () => {
  const buffer = new TerminalBuffer();
  buffer.write('0%');
  assertEqual(buffer.toString(), '0%');
  buffer.write('\r50%');
  assertEqual(buffer.toString(), '50%');
  buffer.write('\r100%');
  assertEqual(buffer.toString(), '100%');
});

test('DEC private modes ignored', () => {
  const buffer = new TerminalBuffer();
  buffer.write('\x1b[?25l');  // Hide cursor
  buffer.write('Text');
  buffer.write('\x1b[?25h');  // Show cursor
  assertEqual(buffer.toString(), 'Text');
});

test('Save and restore cursor', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Hello');
  buffer.write('\x1b[s');     // Save
  buffer.write(' World');
  buffer.write('\x1b[u');     // Restore
  buffer.write('X');
  assertEqual(buffer.toString(), 'HelloXWorld');
});

test('Clear screen', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Line1\nLine2\nLine3');
  buffer.write('\x1b[2J');
  assertEqual(buffer.toString(), '');
});

test('Complex Rich-style output', () => {
  const buffer = new TerminalBuffer();
  buffer.write('\x1b[32m✓\x1b[0m Pass\n');
  buffer.write('\x1b[31m✗\x1b[0m Fail\n');
  assertEqual(buffer.toString(), '✓ Pass\n✗ Fail');
  assertContains(buffer.toHtml(), 'ansi-fg-green');
  assertContains(buffer.toHtml(), 'ansi-fg-red');
});

test('stripAnsi utility', () => {
  assertEqual(stripAnsi('\x1b[31mRed\x1b[0m'), 'Red');
});

test('hasAnsi utility', () => {
  assertEqual(hasAnsi('\x1b[31mRed\x1b[0m'), true);
  assertEqual(hasAnsi('Plain text'), false);
});

test('buffer.clear()', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Hello');
  buffer.clear();
  assertEqual(buffer.toString(), '');
  assertEqual(buffer.lineCount, 1);
});

test('cursor position tracking', () => {
  const buffer = new TerminalBuffer();
  buffer.write('Hello\nWorld');
  assertEqual(buffer.cursor.row, 1);
  assertEqual(buffer.cursor.col, 5);
});

// ===========================================================================
// Summary
// ===========================================================================

console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  process.exit(1);
}
