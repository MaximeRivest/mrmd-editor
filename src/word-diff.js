/**
 * Word-level diff for showing a proposed replacement against the text it
 * replaces: which words stay, which go, which arrive.
 *
 * Tokens are runs of letters/digits, runs of whitespace, and single other
 * characters, so punctuation fixes show as punctuation, not as a changed
 * word. The alignment is a longest common subsequence over tokens. Its table
 * is capped (`maxCells`): past the cap there is no diff (null) and the
 * caller shows the proposal whole — a diff of two long unrelated texts
 * helps nobody and would cost quadratic time.
 */

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

/** Split text into diff tokens (concatenating them gives the text back). */
export function diffTokens(text) {
  return String(text ?? '').match(TOKEN) || [];
}

/**
 * Diff `before` against `after` by words.
 * @returns {Array<{type: 'same'|'del'|'ins', text: string}> | null}
 *   segments in reading order (deletions before insertions at a change),
 *   adjacent segments of one type merged; null when the texts are too long
 *   to align within `maxCells`.
 */
export function wordDiff(before, after, { maxCells = 250_000 } = {}) {
  const a = diffTokens(before);
  const b = diffTokens(after);
  // Common prefix and suffix cost nothing and shrink the table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start;
  if ((n + 1) * (m + 1) > maxCells) return null;

  // lcs[i][j]: common tokens of a[start+i..endA) and b[start+j..endB).
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] = a[start + i] === b[start + j]
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  // Between two unchanged stretches, everything removed reads first and
  // everything added after it: "old words" then "new words", not a
  // word-by-word interleaving of the two.
  const out = [];
  let removed = '', added = '';
  const append = (type, text) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  const same = text => {
    append('del', removed); append('ins', added);
    removed = ''; added = '';
    append('same', text);
  };
  same(a.slice(0, start).join(''));
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      same(a[start + i]); i++; j++;
    } else if (j >= m || (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      removed += a[start + i]; i++;
    } else {
      added += b[start + j]; j++;
    }
  }
  same(a.slice(endA).join(''));
  return out;
}
