/**
 * Table Widget and Parser
 *
 * Renders markdown tables as HTML tables with Tufte Markdown extensions.
 * Uses the stable layout pattern to avoid jitter.
 *
 * Tufte Markdown Extensions:
 * - Column widths: |:--{30%}| in delimiter row
 * - Colspan: | > | merges with cell to left
 * - Rowspan: | ^ | merges with cell above
 * - Decimal alignment: |---.| in delimiter row
 *
 * @module markdown/widgets/table
 */

import { WidgetType } from '@codemirror/view';

// =============================================================================
// Constants
// =============================================================================

/** Marker for colspan (merge with cell to left) */
const COLSPAN_MARKER = '>';

/** Marker for rowspan (merge with cell above) */
const ROWSPAN_MARKER = '^';

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Check if a line looks like a table row (contains pipes)
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isTableLine(line) {
  if (line.startsWith('```') || line.startsWith('~~~')) {
    return false;
  }
  return line.includes('|');
}

/**
 * Check if a line is a table delimiter row.
 * Enhanced to support Tufte extensions: |:--{30%}| and |---.|
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isTableDelimiter(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') && !trimmed.includes('|')) {
    return false;
  }

  const cells = splitTableRow(trimmed);
  if (cells.length === 0) {
    return false;
  }

  // Each cell must match the delimiter pattern
  // Extended pattern allows: colons, dashes, dots, and width specs
  const delimiterPattern = /^:?-+(?:\{[^}]+\})?\.?:?$|^:?-+\.?(?:\{[^}]+\})?:?$/;
  return cells.every(cell => delimiterPattern.test(cell.trim()));
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Split a table row into cells, handling escaped pipes
 *
 * @param {string} line
 * @returns {string[]}
 */
export function splitTableRow(line) {
  const cells = [];
  let current = '';
  let i = 0;

  const trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    i = trimmed.indexOf('|') + 1;
  } else {
    i = 0;
  }

  while (i < trimmed.length) {
    const char = trimmed[i];

    if (char === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      // Escaped pipe - include the pipe in content
      current += '|';
      i += 2;
    } else if (char === '|') {
      // Cell boundary
      cells.push(current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Don't add the last segment if it's empty (trailing pipe case)
  if (current.trim() !== '') {
    cells.push(current);
  }

  return cells;
}

/**
 * Parse column alignments and widths from a delimiter row
 *
 * @param {string} delimiterLine
 * @returns {{ alignments: (string|null)[], widths: (Object|null)[], decimalColumns: Set<number> }}
 */
export function parseDelimiterRow(delimiterLine) {
  const cells = splitTableRow(delimiterLine);
  const alignments = [];
  const widths = [];
  const decimalColumns = new Set();

  cells.forEach((cell, index) => {
    const trimmed = cell.trim();

    // Extract width if present: {30%}, {100px}, {2fr}, {1.5em}
    let width = null;
    const widthMatch = trimmed.match(/\{(\d+(?:\.\d+)?)(px|%|fr|em)\}/);
    if (widthMatch) {
      width = {
        value: parseFloat(widthMatch[1]),
        unit: widthMatch[2],
      };
    }
    widths.push(width);

    // Remove width specification for alignment parsing
    const alignPart = trimmed.replace(/\{[^}]+\}/, '');

    // Check for decimal alignment marker (.)
    const hasDecimal = alignPart.includes('.');
    if (hasDecimal) {
      decimalColumns.add(index);
    }

    // Parse alignment from colons
    const leftColon = alignPart.startsWith(':');
    const rightColon = alignPart.endsWith(':');

    if (hasDecimal) {
      alignments.push('decimal');
    } else if (leftColon && rightColon) {
      alignments.push('center');
    } else if (rightColon) {
      alignments.push('right');
    } else if (leftColon) {
      alignments.push('left');
    } else {
      alignments.push(null);
    }
  });

  return { alignments, widths, decimalColumns };
}

/**
 * Check if cell content is a colspan marker
 */
function isColspanMarker(content) {
  return content.trim() === COLSPAN_MARKER;
}

/**
 * Check if cell content is a rowspan marker
 */
function isRowspanMarker(content) {
  return content.trim() === ROWSPAN_MARKER;
}

/**
 * Parse a table row into structured cells
 */
function parseTableRow(line, isHeader = false, isDelimiter = false) {
  const rawCells = splitTableRow(line);

  const cells = rawCells.map(raw => {
    const content = raw.trim();
    return {
      content,
      raw,
      colspan: 1,
      rowspan: 1,
      hidden: false,
      isColspanMarker: isColspanMarker(content),
      isRowspanMarker: isRowspanMarker(content),
    };
  });

  return {
    cells,
    isHeader,
    isDelimiter,
  };
}

/**
 * Process colspan markers in a table
 */
function processColspans(rows) {
  for (const row of rows) {
    if (row.isDelimiter) continue;

    for (let col = row.cells.length - 1; col >= 0; col--) {
      const cell = row.cells[col];

      if (cell.isColspanMarker && col > 0) {
        let targetCol = col - 1;
        while (targetCol >= 0 && row.cells[targetCol].isColspanMarker) {
          targetCol--;
        }

        if (targetCol >= 0) {
          row.cells[targetCol].colspan++;
          cell.hidden = true;
        }
      }
    }
  }
}

/**
 * Process rowspan markers in a table
 */
function processRowspans(rows) {
  const dataStartIndex = rows.findIndex(r => !r.isHeader && !r.isDelimiter);
  if (dataStartIndex === -1) return;

  for (let rowIdx = rows.length - 1; rowIdx >= 0; rowIdx--) {
    const row = rows[rowIdx];
    if (row.isDelimiter) continue;

    for (let col = 0; col < row.cells.length; col++) {
      const cell = row.cells[col];

      if (cell.isRowspanMarker) {
        let targetRow = rowIdx - 1;
        while (targetRow >= 0) {
          const aboveRow = rows[targetRow];
          if (aboveRow.isDelimiter) {
            targetRow--;
            continue;
          }

          if (col < aboveRow.cells.length) {
            const aboveCell = aboveRow.cells[col];
            if (aboveCell.isRowspanMarker) {
              targetRow--;
              continue;
            }
            aboveCell.rowspan++;
            cell.hidden = true;
            break;
          }
          break;
        }
      }
    }
  }
}

/**
 * Parse a complete markdown table from text lines
 *
 * @param {string[]} lines - Array of line strings making up the table
 * @returns {Object|null} Parsed table structure
 */
export function parseTable(lines) {
  if (lines.length < 2) {
    return null;
  }

  // Find the delimiter row
  let delimiterIndex = -1;
  for (let i = 0; i < lines.length && i < 3; i++) {
    if (isTableDelimiter(lines[i])) {
      delimiterIndex = i;
      break;
    }
  }

  if (delimiterIndex === -1 || delimiterIndex === 0) {
    return null;
  }

  // Parse delimiter row
  const { alignments, widths, decimalColumns } = parseDelimiterRow(lines[delimiterIndex]);
  const columnCount = alignments.length;

  // Parse all rows
  const rows = [];

  for (let i = 0; i < lines.length; i++) {
    if (i === delimiterIndex) {
      rows.push(parseTableRow(lines[i], false, true));
    } else if (i < delimiterIndex) {
      rows.push(parseTableRow(lines[i], true, false));
    } else {
      rows.push(parseTableRow(lines[i], false, false));
    }
  }

  // Process colspan and rowspan markers
  processColspans(rows);
  processRowspans(rows);

  return {
    rows,
    alignments,
    columnWidths: widths,
    columnCount,
    decimalColumns,
  };
}

/**
 * Check if cell content looks like a number
 *
 * @param {string} content
 * @returns {boolean}
 */
export function isNumericContent(content) {
  const trimmed = content.trim();
  if (trimmed === '') return false;

  const numericPattern = /^[$€£¥]?\s*-?[\d,]+(?:\.\d+)?\s*[%MKBkmb]?$/;
  return numericPattern.test(trimmed);
}

/**
 * Generate a stable table ID from position
 *
 * @param {number} from - Start position
 * @returns {string}
 */
export function generateTableId(from) {
  return `table-${from}`;
}

// =============================================================================
// Widget
// =============================================================================

/**
 * Widget for rendering markdown tables.
 */
export class TableWidget extends WidgetType {
  /**
   * @param {Object} table - Parsed table data
   * @param {string} tableId - Unique table identifier
   * @param {Object} options - Rendering options
   */
  constructor(table, tableId, options = {}) {
    super();
    this.table = table;
    this.tableId = tableId;
    this.options = options;
  }

  eq(other) {
    if (this.tableId !== other.tableId) return false;
    if (this.table.columnCount !== other.table.columnCount) return false;
    if (this.table.rows.length !== other.table.rows.length) return false;

    for (let i = 0; i < this.table.rows.length; i++) {
      const a = this.table.rows[i];
      const b = other.table.rows[i];

      if (a.cells.length !== b.cells.length) return false;
      if (a.isHeader !== b.isHeader) return false;
      if (a.isDelimiter !== b.isDelimiter) return false;

      for (let j = 0; j < a.cells.length; j++) {
        if (a.cells[j].content !== b.cells[j].content) return false;
        if (a.cells[j].colspan !== b.cells[j].colspan) return false;
        if (a.cells[j].rowspan !== b.cells[j].rowspan) return false;
        if (a.cells[j].hidden !== b.cells[j].hidden) return false;
      }
    }

    for (let i = 0; i < this.table.alignments.length; i++) {
      if (this.table.alignments[i] !== other.table.alignments[i]) {
        return false;
      }
    }

    if (this.options.caption !== other.options.caption) return false;
    if (this.options.captionPosition !== other.options.captionPosition) return false;

    return true;
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'cm-table-widget';
    container.dataset.tableId = this.tableId;

    const tableEl = document.createElement('table');
    tableEl.className = 'cm-table';

    // Add column widths via colgroup if specified
    this.applyColumnWidths(tableEl);

    // Add caption if present
    if (this.options.caption) {
      const caption = document.createElement('caption');
      caption.className = 'cm-table-caption';
      if (this.options.captionPosition === 'below') {
        caption.classList.add('cm-table-caption-below');
      }
      caption.textContent = this.options.caption;
      tableEl.appendChild(caption);
    }

    // Detect numeric columns for alignment
    const numericColumns = this.detectNumericColumns();

    // Compute decimal alignment info (Tufte's requirement)
    const decimalInfo = this.computeDecimalAlignment(numericColumns);

    // Render rows
    let thead = null;
    const tbody = document.createElement('tbody');

    for (const row of this.table.rows) {
      if (row.isDelimiter) continue;

      const tr = document.createElement('tr');

      for (let i = 0; i < row.cells.length; i++) {
        const cell = row.cells[i];

        // Skip hidden cells
        if (cell.hidden) continue;

        const cellEl = document.createElement(row.isHeader ? 'th' : 'td');

        // Apply colspan/rowspan
        if (cell.colspan > 1) {
          cellEl.colSpan = cell.colspan;
        }
        if (cell.rowspan > 1) {
          cellEl.rowSpan = cell.rowspan;
        }

        // Apply alignment
        const alignment = this.getEffectiveAlignment(i, numericColumns);
        if (alignment) {
          cellEl.classList.add(`cm-table-align-${alignment}`);
        }

        // Render cell content
        const isNumeric = !row.isHeader && isNumericContent(cell.content);
        if (isNumeric) {
          cellEl.classList.add('cm-table-cell-numeric');
        }

        // Use decimal alignment for numeric columns
        if (isNumeric && decimalInfo.has(i)) {
          this.renderDecimalAligned(cellEl, cell.content, decimalInfo.get(i));
        } else {
          cellEl.innerHTML = this.renderInlineMarkdown(cell.content);
        }

        tr.appendChild(cellEl);
      }

      if (row.isHeader) {
        if (!thead) {
          thead = document.createElement('thead');
        }
        thead.appendChild(tr);
      } else {
        tbody.appendChild(tr);
      }
    }

    if (thead) {
      tableEl.appendChild(thead);
    }
    tableEl.appendChild(tbody);

    container.appendChild(tableEl);
    return container;
  }

  /**
   * Detect which columns should use decimal alignment
   */
  detectNumericColumns() {
    const numericColumns = new Set();

    // Include explicitly marked decimal columns
    if (this.table.decimalColumns) {
      for (const col of this.table.decimalColumns) {
        numericColumns.add(col);
      }
    }

    // Auto-detect numeric columns (>70% numeric content)
    for (let col = 0; col < this.table.columnCount; col++) {
      if (numericColumns.has(col)) continue;

      let numericCount = 0;
      let totalCount = 0;

      for (const row of this.table.rows) {
        if (row.isHeader || row.isDelimiter) continue;
        const cell = row.cells[col];
        if (cell && cell.content.trim() !== '' && !cell.hidden) {
          totalCount++;
          if (isNumericContent(cell.content)) {
            numericCount++;
          }
        }
      }

      if (totalCount > 0 && numericCount / totalCount > 0.7) {
        numericColumns.add(col);
      }
    }

    return numericColumns;
  }

  /**
   * Compute decimal alignment info for numeric columns
   */
  computeDecimalAlignment(numericColumns) {
    const info = new Map();

    for (const col of numericColumns) {
      let maxIntWidth = 0;
      let maxDecWidth = 0;

      for (const row of this.table.rows) {
        if (row.isHeader || row.isDelimiter) continue;
        const cell = row.cells[col];
        if (!cell || cell.hidden) continue;

        const parts = this.splitDecimal(cell.content);
        if (parts) {
          maxIntWidth = Math.max(maxIntWidth, parts.integer.length);
          maxDecWidth = Math.max(maxDecWidth, parts.decimal.length);
        }
      }

      if (maxIntWidth > 0 || maxDecWidth > 0) {
        info.set(col, { maxIntWidth, maxDecWidth });
      }
    }

    return info;
  }

  /**
   * Parse numeric string into parts for decimal alignment
   * Handles: $1,234.56M, -12.5%, €100, 1.2M, 78,000, etc.
   */
  parseNumericParts(content) {
    const trimmed = content.trim();
    if (!trimmed) return null;

    // Match: [currency][-][digits,digits][.digits][suffix]
    const match = trimmed.match(/^([$€£¥]?)\s*(-?[\d,]+(?:\.\d+)?)\s*([%MKBkmb]?)$/);
    if (!match) return null;

    const [, prefix, number, suffix] = match;
    const dotIndex = number.indexOf('.');

    if (dotIndex === -1) {
      return {
        prefix: prefix || '',
        integer: number,
        decimal: '',
        suffix: suffix || '',
      };
    }

    return {
      prefix: prefix || '',
      integer: number.slice(0, dotIndex),
      decimal: number.slice(dotIndex),
      suffix: suffix || '',
    };
  }

  /**
   * Split numeric string into integer and decimal parts
   */
  splitDecimal(content) {
    const parts = this.parseNumericParts(content);
    if (!parts) return null;

    return {
      integer: parts.prefix + parts.integer,
      decimal: parts.decimal + parts.suffix,
    };
  }

  /**
   * Render a number with decimal alignment (Tufte's requirement)
   */
  renderDecimalAligned(cellEl, content, info) {
    const parts = this.splitDecimal(content);

    if (!parts) {
      cellEl.textContent = content;
      return;
    }

    cellEl.classList.add('cm-table-cell-decimal-aligned');

    const intSpan = document.createElement('span');
    intSpan.className = 'cm-table-decimal-int';
    intSpan.textContent = parts.integer;
    intSpan.style.minWidth = `${info.maxIntWidth}ch`;

    const decSpan = document.createElement('span');
    decSpan.className = 'cm-table-decimal-frac';
    decSpan.textContent = parts.decimal;
    decSpan.style.minWidth = `${info.maxDecWidth}ch`;

    cellEl.appendChild(intSpan);
    cellEl.appendChild(decSpan);
  }

  /**
   * Apply column widths using colgroup
   */
  applyColumnWidths(tableEl) {
    const widths = this.table.columnWidths;
    const hasWidths = widths && widths.some(w => w !== null);

    if (!hasWidths) return;

    const colgroup = document.createElement('colgroup');

    for (let i = 0; i < this.table.columnCount; i++) {
      const col = document.createElement('col');
      const width = widths[i];

      if (width) {
        col.style.width = `${width.value}${width.unit}`;
      }

      colgroup.appendChild(col);
    }

    tableEl.appendChild(colgroup);
  }

  /**
   * Get effective alignment for a column
   * Priority: explicit decimal > explicit alignment > auto-detect > default
   */
  getEffectiveAlignment(columnIndex, numericColumns) {
    // Check explicit decimal columns first
    if (this.table.decimalColumns && this.table.decimalColumns.has(columnIndex)) {
      return 'decimal';
    }

    // Check explicit alignment from delimiter row
    const explicit = this.table.alignments[columnIndex];
    if (explicit && explicit !== 'decimal') {
      return explicit;
    }

    // Auto-align numeric columns to right
    if (numericColumns && numericColumns.has(columnIndex)) {
      return 'right';
    }

    return null;
  }

  /**
   * Render basic inline markdown (bold, italic, code)
   */
  renderInlineMarkdown(content) {
    let html = this.escapeHtml(content);

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

    return html;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  ignoreEvent() {
    return true;
  }
}
