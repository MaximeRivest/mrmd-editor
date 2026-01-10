/**
 * Terminal Buffer
 *
 * Processes streaming terminal output with proper cursor movement and ANSI handling.
 * Enables progress bars (tqdm, rich) to display correctly during execution.
 *
 * Philosophy (from VISION.md):
 * - "The .md file is truth" - stored output should be plain text
 * - "Opens in any editor. Grep-able." - no raw escape codes in storage
 * - Rich display is optional enhancement, not requirement
 *
 * Output modes:
 * - toString()  → Plain text (for document storage)
 * - toAnsi()    → With ANSI codes (for terminal display)
 * - toHtml()    → HTML with styled spans (for rich editor display)
 *
 * @module terminal
 */

// #region TYPES

/**
 * Style state for a character cell
 * @typedef {Object} CellStyle
 * @property {string|null} fg - Foreground color
 * @property {string|null} bg - Background color
 * @property {boolean} bold
 * @property {boolean} dim
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {boolean} strikethrough
 * @property {boolean} inverse
 */

/**
 * A single character cell
 * @typedef {Object} Cell
 * @property {string} char - The character
 * @property {CellStyle} style - Applied style
 */

// #endregion TYPES

// #region STYLE_HELPERS

/** @returns {CellStyle} */
function createDefaultStyle() {
  return {
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
  };
}

/** @param {CellStyle} style @returns {CellStyle} */
function cloneStyle(style) {
  return { ...style };
}

/** @param {CellStyle} a @param {CellStyle} b @returns {boolean} */
function stylesEqual(a, b) {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.inverse === b.inverse
  );
}

/** @param {CellStyle} style @returns {boolean} */
function hasStyle(style) {
  return (
    style.fg !== null ||
    style.bg !== null ||
    style.bold ||
    style.dim ||
    style.italic ||
    style.underline ||
    style.strikethrough ||
    style.inverse
  );
}

// #endregion STYLE_HELPERS

// #region COLOR_MAPS

/** ANSI foreground color codes → names */
const FG_COLORS = {
  30: 'black', 31: 'red', 32: 'green', 33: 'yellow',
  34: 'blue', 35: 'magenta', 36: 'cyan', 37: 'white',
  90: 'bright-black', 91: 'bright-red', 92: 'bright-green', 93: 'bright-yellow',
  94: 'bright-blue', 95: 'bright-magenta', 96: 'bright-cyan', 97: 'bright-white',
};

/** ANSI background color codes → names */
const BG_COLORS = {
  40: 'black', 41: 'red', 42: 'green', 43: 'yellow',
  44: 'blue', 45: 'magenta', 46: 'cyan', 47: 'white',
  100: 'bright-black', 101: 'bright-red', 102: 'bright-green', 103: 'bright-yellow',
  104: 'bright-blue', 105: 'bright-magenta', 106: 'bright-cyan', 107: 'bright-white',
};

/** Color names → CSS colors */
const CSS_COLORS = {
  'black': '#000000', 'red': '#cc0000', 'green': '#00cc00', 'yellow': '#cccc00',
  'blue': '#0000cc', 'magenta': '#cc00cc', 'cyan': '#00cccc', 'white': '#cccccc',
  'bright-black': '#666666', 'bright-red': '#ff0000', 'bright-green': '#00ff00',
  'bright-yellow': '#ffff00', 'bright-blue': '#0000ff', 'bright-magenta': '#ff00ff',
  'bright-cyan': '#00ffff', 'bright-white': '#ffffff',
};

// #endregion COLOR_MAPS

// #region TERMINAL_BUFFER

/**
 * Terminal buffer that processes cursor movement and ANSI codes
 */
export class TerminalBuffer {
  /** @type {Cell[][]} */
  #lines = [[]];

  /** @type {number} */
  #row = 0;

  /** @type {number} */
  #col = 0;

  /** @type {CellStyle} */
  #currentStyle = createDefaultStyle();

  /** @type {{row: number, col: number}|null} */
  #savedCursor = null;

  /**
   * Process terminal output and write to buffer
   * @param {string} text - Raw terminal output with escape sequences
   */
  write(text) {
    let i = 0;

    while (i < text.length) {
      // Check for escape sequence
      if (text[i] === '\x1b' && text[i + 1] === '[') {
        i = this.#parseEscapeSequence(text, i);
        continue;
      }

      // Handle special characters
      const char = text[i];

      if (char === '\r') {
        // Carriage return - back to start of line
        this.#col = 0;
      } else if (char === '\n') {
        // Newline - next line, column 0
        this.#row++;
        this.#col = 0;
        this.#ensureRow(this.#row);
      } else if (char === '\b') {
        // Backspace
        this.#col = Math.max(0, this.#col - 1);
      } else if (char === '\t') {
        // Tab - move to next 8-column boundary
        this.#col = Math.floor(this.#col / 8) * 8 + 8;
      } else if (char.charCodeAt(0) >= 32) {
        // Printable character
        this.#writeChar(char);
      }
      // Ignore other control characters

      i++;
    }
  }

  /**
   * Parse an escape sequence starting at position i
   * @param {string} text
   * @param {number} i
   * @returns {number} Next index
   */
  #parseEscapeSequence(text, i) {
    // Skip \x1b[
    let j = i + 2;

    // Check for DEC private mode prefix '?'
    const isPrivateMode = text[j] === '?';
    if (isPrivateMode) j++;

    // Collect parameter bytes (digits and semicolons)
    let params = '';
    while (j < text.length && /[0-9;]/.test(text[j])) {
      params += text[j];
      j++;
    }

    // Get command byte
    const cmd = text[j] || '';
    j++;

    // Ignore DEC private modes (cursor visibility, alternate screen, etc.)
    if (isPrivateMode) {
      return j;
    }

    // Parse parameter numbers
    const nums = params ? params.split(';').map(n => parseInt(n) || 0) : [];
    const n = nums[0] || 1;

    switch (cmd) {
      case 'm': // SGR - Select Graphic Rendition (colors/styles)
        this.#applySgr(nums.length > 0 ? nums : [0]);
        break;

      case 'A': // Cursor Up
        this.#row = Math.max(0, this.#row - n);
        break;

      case 'B': // Cursor Down
        this.#row += n;
        this.#ensureRow(this.#row);
        break;

      case 'C': // Cursor Forward (Right)
        this.#col += n;
        break;

      case 'D': // Cursor Back (Left)
        this.#col = Math.max(0, this.#col - n);
        break;

      case 'E': // Cursor Next Line
        this.#row += n;
        this.#col = 0;
        this.#ensureRow(this.#row);
        break;

      case 'F': // Cursor Previous Line
        this.#row = Math.max(0, this.#row - n);
        this.#col = 0;
        break;

      case 'G': // Cursor Horizontal Absolute
        this.#col = Math.max(0, n - 1);
        break;

      case 'H': // Cursor Position (row;col)
      case 'f':
        this.#row = Math.max(0, (nums[0] || 1) - 1);
        this.#col = Math.max(0, (nums[1] || 1) - 1);
        this.#ensureRow(this.#row);
        break;

      case 'J': // Erase in Display
        if (n === 0 || params === '') {
          this.#clearToEndOfScreen();
        } else if (n === 1) {
          this.#clearFromStartOfScreen();
        } else if (n === 2 || n === 3) {
          this.#clearScreen();
        }
        break;

      case 'K': // Erase in Line
        if (n === 0 || params === '') {
          this.#clearToEndOfLine();
        } else if (n === 1) {
          this.#clearFromStartOfLine();
        } else if (n === 2) {
          this.#clearLine();
        }
        break;

      case 's': // Save Cursor Position
        this.#savedCursor = { row: this.#row, col: this.#col };
        break;

      case 'u': // Restore Cursor Position
        if (this.#savedCursor) {
          this.#row = this.#savedCursor.row;
          this.#col = this.#savedCursor.col;
        }
        break;
    }

    return j;
  }

  /**
   * Apply SGR (Select Graphic Rendition) codes
   * @param {number[]} codes
   */
  #applySgr(codes) {
    let i = 0;
    while (i < codes.length) {
      const code = codes[i];

      switch (code) {
        case 0: this.#currentStyle = createDefaultStyle(); break;
        case 1: this.#currentStyle.bold = true; break;
        case 2: this.#currentStyle.dim = true; break;
        case 3: this.#currentStyle.italic = true; break;
        case 4: this.#currentStyle.underline = true; break;
        case 7: this.#currentStyle.inverse = true; break;
        case 9: this.#currentStyle.strikethrough = true; break;
        case 22: this.#currentStyle.bold = false; this.#currentStyle.dim = false; break;
        case 23: this.#currentStyle.italic = false; break;
        case 24: this.#currentStyle.underline = false; break;
        case 27: this.#currentStyle.inverse = false; break;
        case 29: this.#currentStyle.strikethrough = false; break;
        case 39: this.#currentStyle.fg = null; break;
        case 49: this.#currentStyle.bg = null; break;
        default:
          // Foreground colors
          if (FG_COLORS[code]) {
            this.#currentStyle.fg = FG_COLORS[code];
          }
          // Background colors
          else if (BG_COLORS[code]) {
            this.#currentStyle.bg = BG_COLORS[code];
          }
          // 256-color: 38;5;n or 48;5;n
          else if (code === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            this.#currentStyle.fg = `256-${codes[i + 2]}`;
            i += 2;
          } else if (code === 48 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
            this.#currentStyle.bg = `256-${codes[i + 2]}`;
            i += 2;
          }
          // 24-bit RGB: 38;2;r;g;b or 48;2;r;g;b
          else if (code === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            this.#currentStyle.fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
            i += 4;
          } else if (code === 48 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
            this.#currentStyle.bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
            i += 4;
          }
      }
      i++;
    }
  }

  /**
   * Write a character at current cursor position
   * @param {string} char
   */
  #writeChar(char) {
    this.#ensureRow(this.#row);
    const line = this.#lines[this.#row];

    // Extend line if needed
    while (line.length <= this.#col) {
      line.push({ char: ' ', style: createDefaultStyle() });
    }

    // Write character with current style
    line[this.#col] = {
      char,
      style: cloneStyle(this.#currentStyle),
    };

    this.#col++;
  }

  /** @param {number} row */
  #ensureRow(row) {
    while (this.#lines.length <= row) {
      this.#lines.push([]);
    }
  }

  #clearToEndOfLine() {
    if (this.#lines[this.#row]) {
      this.#lines[this.#row] = this.#lines[this.#row].slice(0, this.#col);
    }
  }

  #clearFromStartOfLine() {
    if (this.#lines[this.#row]) {
      const line = this.#lines[this.#row];
      for (let i = 0; i <= this.#col && i < line.length; i++) {
        line[i] = { char: ' ', style: createDefaultStyle() };
      }
    }
  }

  #clearLine() {
    this.#lines[this.#row] = [];
  }

  #clearToEndOfScreen() {
    this.#clearToEndOfLine();
    for (let r = this.#row + 1; r < this.#lines.length; r++) {
      this.#lines[r] = [];
    }
  }

  #clearFromStartOfScreen() {
    for (let r = 0; r < this.#row; r++) {
      this.#lines[r] = [];
    }
    this.#clearFromStartOfLine();
  }

  #clearScreen() {
    this.#lines = [[]];
    this.#row = 0;
    this.#col = 0;
  }

  // ===========================================================================
  // Output Methods
  // ===========================================================================

  /**
   * Convert buffer to plain text (for document storage)
   *
   * This is the primary output method for mrmd.
   * Per VISION.md: "The .md file is truth. Opens in any editor. Grep-able."
   *
   * @returns {string}
   */
  toString() {
    const output = [];

    for (const line of this.#lines) {
      let lineText = '';
      for (const cell of line) {
        lineText += cell.char;
      }
      // Trim trailing spaces
      output.push(lineText.trimEnd());
    }

    // Trim trailing empty lines
    while (output.length > 0 && output[output.length - 1] === '') {
      output.pop();
    }

    return output.join('\n');
  }

  /**
   * Convert buffer to string with ANSI escape codes
   *
   * Use this for terminal-like display or when passing to another
   * terminal-aware renderer.
   *
   * @returns {string}
   */
  toAnsi() {
    const output = [];
    let currentStyle = createDefaultStyle();

    for (let r = 0; r < this.#lines.length; r++) {
      const line = this.#lines[r];
      let lineOutput = '';

      for (const cell of line) {
        if (!stylesEqual(currentStyle, cell.style)) {
          lineOutput += styleToAnsi(cell.style, currentStyle);
          currentStyle = cloneStyle(cell.style);
        }
        lineOutput += cell.char;
      }

      // Reset at end of line if there's active styling
      if (hasStyle(currentStyle)) {
        lineOutput += '\x1b[0m';
        currentStyle = createDefaultStyle();
      }

      output.push(lineOutput);
    }

    // Trim trailing empty lines
    while (output.length > 0 && output[output.length - 1] === '') {
      output.pop();
    }

    return output.join('\n');
  }

  /**
   * Convert buffer to HTML with styled spans
   *
   * Use this for rich display in the editor.
   * Styles are applied via CSS classes and inline styles.
   *
   * @param {Object} [options]
   * @param {boolean} [options.useClasses=true] - Use CSS classes (ansi-red, etc.)
   * @param {boolean} [options.escapeHtml=true] - Escape HTML entities
   * @returns {string}
   */
  toHtml(options = {}) {
    const { useClasses = true, escapeHtml = true } = options;
    const output = [];

    for (const line of this.#lines) {
      let lineHtml = '';
      let currentStyle = createDefaultStyle();
      let spanOpen = false;

      for (const cell of line) {
        const styleChanged = !stylesEqual(currentStyle, cell.style);

        if (styleChanged && spanOpen) {
          lineHtml += '</span>';
          spanOpen = false;
        }

        if (styleChanged && hasStyle(cell.style)) {
          lineHtml += styleToHtmlSpan(cell.style, useClasses);
          spanOpen = true;
        }

        currentStyle = cell.style;

        // Escape HTML entities
        let char = cell.char;
        if (escapeHtml) {
          if (char === '<') char = '&lt;';
          else if (char === '>') char = '&gt;';
          else if (char === '&') char = '&amp;';
          else if (char === '"') char = '&quot;';
        }

        lineHtml += char;
      }

      if (spanOpen) {
        lineHtml += '</span>';
      }

      output.push(lineHtml);
    }

    // Trim trailing empty lines
    while (output.length > 0 && output[output.length - 1] === '') {
      output.pop();
    }

    return output.join('\n');
  }

  /**
   * Clear the buffer and reset cursor
   */
  clear() {
    this.#lines = [[]];
    this.#row = 0;
    this.#col = 0;
    this.#currentStyle = createDefaultStyle();
    this.#savedCursor = null;
  }

  /**
   * Get current line count
   * @returns {number}
   */
  get lineCount() {
    return this.#lines.length;
  }

  /**
   * Get current cursor position
   * @returns {{row: number, col: number}}
   */
  get cursor() {
    return { row: this.#row, col: this.#col };
  }
}

// #endregion TERMINAL_BUFFER

// #region STYLE_OUTPUT_HELPERS

/**
 * Convert style to ANSI escape codes
 * @param {CellStyle} newStyle
 * @param {CellStyle} oldStyle
 * @returns {string}
 */
function styleToAnsi(newStyle, oldStyle) {
  const codes = [];

  // Check if we need a reset
  const needsReset = (
    (oldStyle.bold && !newStyle.bold) ||
    (oldStyle.dim && !newStyle.dim) ||
    (oldStyle.italic && !newStyle.italic) ||
    (oldStyle.underline && !newStyle.underline) ||
    (oldStyle.strikethrough && !newStyle.strikethrough) ||
    (oldStyle.inverse && !newStyle.inverse) ||
    (oldStyle.fg !== null && newStyle.fg === null) ||
    (oldStyle.bg !== null && newStyle.bg === null)
  );

  if (needsReset) {
    codes.push(0);
    // After reset, re-apply all active styles
    if (newStyle.bold) codes.push(1);
    if (newStyle.dim) codes.push(2);
    if (newStyle.italic) codes.push(3);
    if (newStyle.underline) codes.push(4);
    if (newStyle.inverse) codes.push(7);
    if (newStyle.strikethrough) codes.push(9);
    if (newStyle.fg) codes.push(...colorToAnsiCode(newStyle.fg, false));
    if (newStyle.bg) codes.push(...colorToAnsiCode(newStyle.bg, true));
  } else {
    // Just emit the changes
    if (newStyle.bold && !oldStyle.bold) codes.push(1);
    if (newStyle.dim && !oldStyle.dim) codes.push(2);
    if (newStyle.italic && !oldStyle.italic) codes.push(3);
    if (newStyle.underline && !oldStyle.underline) codes.push(4);
    if (newStyle.inverse && !oldStyle.inverse) codes.push(7);
    if (newStyle.strikethrough && !oldStyle.strikethrough) codes.push(9);
    if (newStyle.fg !== oldStyle.fg && newStyle.fg) {
      codes.push(...colorToAnsiCode(newStyle.fg, false));
    }
    if (newStyle.bg !== oldStyle.bg && newStyle.bg) {
      codes.push(...colorToAnsiCode(newStyle.bg, true));
    }
  }

  if (codes.length === 0) return '';
  return `\x1b[${codes.join(';')}m`;
}

/**
 * Convert color name to ANSI code(s)
 * @param {string} color
 * @param {boolean} isBg
 * @returns {number[]}
 */
function colorToAnsiCode(color, isBg) {
  const offset = isBg ? 10 : 0;

  const standardColors = {
    'black': 30, 'red': 31, 'green': 32, 'yellow': 33,
    'blue': 34, 'magenta': 35, 'cyan': 36, 'white': 37,
    'bright-black': 90, 'bright-red': 91, 'bright-green': 92, 'bright-yellow': 93,
    'bright-blue': 94, 'bright-magenta': 95, 'bright-cyan': 96, 'bright-white': 97,
  };

  if (standardColors[color]) {
    return [standardColors[color] + offset];
  }

  // 256-color
  if (color.startsWith('256-')) {
    const n = parseInt(color.slice(4));
    return isBg ? [48, 5, n] : [38, 5, n];
  }

  // RGB
  if (color.startsWith('rgb(')) {
    const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (match) {
      const [, r, g, b] = match.map(Number);
      return isBg ? [48, 2, r, g, b] : [38, 2, r, g, b];
    }
  }

  return [];
}

/**
 * Convert style to HTML span opening tag
 * @param {CellStyle} style
 * @param {boolean} useClasses
 * @returns {string}
 */
function styleToHtmlSpan(style, useClasses) {
  const classes = [];
  const inlineStyles = [];

  if (style.bold) classes.push('ansi-bold');
  if (style.dim) classes.push('ansi-dim');
  if (style.italic) classes.push('ansi-italic');
  if (style.underline) classes.push('ansi-underline');
  if (style.strikethrough) classes.push('ansi-strikethrough');
  if (style.inverse) classes.push('ansi-inverse');

  if (style.fg) {
    if (useClasses && CSS_COLORS[style.fg]) {
      classes.push(`ansi-fg-${style.fg}`);
    } else {
      inlineStyles.push(`color:${colorToCss(style.fg)}`);
    }
  }

  if (style.bg) {
    if (useClasses && CSS_COLORS[style.bg]) {
      classes.push(`ansi-bg-${style.bg}`);
    } else {
      inlineStyles.push(`background-color:${colorToCss(style.bg)}`);
    }
  }

  let attrs = '';
  if (classes.length > 0) {
    attrs += ` class="${classes.join(' ')}"`;
  }
  if (inlineStyles.length > 0) {
    attrs += ` style="${inlineStyles.join(';')}"`;
  }

  return `<span${attrs}>`;
}

/**
 * Convert color name to CSS color
 * @param {string} color
 * @returns {string}
 */
function colorToCss(color) {
  if (CSS_COLORS[color]) {
    return CSS_COLORS[color];
  }

  // 256-color - convert to RGB approximation
  if (color.startsWith('256-')) {
    const n = parseInt(color.slice(4));
    return ansi256ToCss(n);
  }

  // RGB - already in CSS format
  if (color.startsWith('rgb(')) {
    return color;
  }

  return 'inherit';
}

/**
 * Convert 256-color index to CSS color
 * @param {number} n
 * @returns {string}
 */
function ansi256ToCss(n) {
  // Standard colors (0-15)
  if (n < 16) {
    const standard = [
      '#000000', '#cc0000', '#00cc00', '#cccc00', '#0000cc', '#cc00cc', '#00cccc', '#cccccc',
      '#666666', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
    ];
    return standard[n];
  }

  // Color cube (16-231): 6x6x6 RGB
  if (n < 232) {
    const idx = n - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    const toHex = v => (v === 0 ? 0 : 55 + v * 40).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Grayscale (232-255): 24 shades
  const gray = 8 + (n - 232) * 10;
  const hex = gray.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

// #endregion STYLE_OUTPUT_HELPERS

// #region EXPORTS

/**
 * Process terminal output through a buffer
 *
 * Convenience function for one-shot processing.
 *
 * @param {string} text - Raw terminal output
 * @returns {string} - Processed plain text
 */
export function processTerminalOutput(text) {
  const buffer = new TerminalBuffer();
  buffer.write(text);
  return buffer.toString();
}

/**
 * Process terminal output and return HTML
 *
 * @param {string} text - Raw terminal output
 * @param {Object} [options] - Options for toHtml()
 * @returns {string} - HTML with styled spans
 */
export function terminalToHtml(text, options) {
  const buffer = new TerminalBuffer();
  buffer.write(text);
  return buffer.toHtml(options);
}

/**
 * Strip ANSI codes from text (without cursor processing)
 *
 * Use this when you just want to remove escape codes without
 * terminal emulation. For proper progress bar handling, use
 * processTerminalOutput() instead.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Check if text contains ANSI codes
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasAnsi(text) {
  return /\x1b\[/.test(text);
}

/**
 * CSS styles for ANSI HTML output
 *
 * Include in your stylesheet or inject via JS.
 */
export const ansiStyles = `
/* ANSI text styles */
.ansi-bold { font-weight: bold; }
.ansi-dim { opacity: 0.7; }
.ansi-italic { font-style: italic; }
.ansi-underline { text-decoration: underline; }
.ansi-strikethrough { text-decoration: line-through; }
.ansi-inverse { filter: invert(1); }

/* ANSI foreground colors - use CSS variables from widget theme */
.ansi-fg-black { color: var(--ansi-black, #1e1e1e); }
.ansi-fg-red { color: var(--ansi-red, #f87171); }
.ansi-fg-green { color: var(--ansi-green, #4ade80); }
.ansi-fg-yellow { color: var(--ansi-yellow, #facc15); }
.ansi-fg-blue { color: var(--ansi-blue, #60a5fa); }
.ansi-fg-magenta { color: var(--ansi-magenta, #c084fc); }
.ansi-fg-cyan { color: var(--ansi-cyan, #22d3ee); }
.ansi-fg-white { color: var(--ansi-white, #e0e0e0); }
.ansi-fg-bright-black { color: var(--ansi-bright-black, #6b7280); }
.ansi-fg-bright-red { color: var(--ansi-bright-red, #fca5a5); }
.ansi-fg-bright-green { color: var(--ansi-bright-green, #86efac); }
.ansi-fg-bright-yellow { color: var(--ansi-bright-yellow, #fde047); }
.ansi-fg-bright-blue { color: var(--ansi-bright-blue, #93c5fd); }
.ansi-fg-bright-magenta { color: var(--ansi-bright-magenta, #d8b4fe); }
.ansi-fg-bright-cyan { color: var(--ansi-bright-cyan, #67e8f9); }
.ansi-fg-bright-white { color: var(--ansi-bright-white, #ffffff); }

/* ANSI background colors - use CSS variables from widget theme */
.ansi-bg-black { background-color: var(--ansi-black, #1e1e1e); }
.ansi-bg-red { background-color: var(--ansi-red, #f87171); }
.ansi-bg-green { background-color: var(--ansi-green, #4ade80); }
.ansi-bg-yellow { background-color: var(--ansi-yellow, #facc15); }
.ansi-bg-blue { background-color: var(--ansi-blue, #60a5fa); }
.ansi-bg-magenta { background-color: var(--ansi-magenta, #c084fc); }
.ansi-bg-cyan { background-color: var(--ansi-cyan, #22d3ee); }
.ansi-bg-white { background-color: var(--ansi-white, #e0e0e0); }
.ansi-bg-bright-black { background-color: var(--ansi-bright-black, #6b7280); }
.ansi-bg-bright-red { background-color: var(--ansi-bright-red, #fca5a5); }
.ansi-bg-bright-green { background-color: var(--ansi-bright-green, #86efac); }
.ansi-bg-bright-yellow { background-color: var(--ansi-bright-yellow, #fde047); }
.ansi-bg-bright-blue { background-color: var(--ansi-bright-blue, #93c5fd); }
.ansi-bg-bright-magenta { background-color: var(--ansi-bright-magenta, #d8b4fe); }
.ansi-bg-bright-cyan { background-color: var(--ansi-bright-cyan, #67e8f9); }
.ansi-bg-bright-white { background-color: var(--ansi-bright-white, #ffffff); }
`;

// #endregion EXPORTS
