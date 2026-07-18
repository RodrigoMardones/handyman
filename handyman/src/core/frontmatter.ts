/**
 * Minimal, dependency-free YAML-frontmatter parser.
 *
 * Faithful port of `tools_discovery._parse_frontmatter` (Python): read the
 * first `---` fenced block of a markdown file and pick up single-line
 * `key: value` pairs (keys lowercased), folding indented continuation lines
 * into the previous value (enough for a multi-line `description` field).
 * A value that is a bare YAML block-scalar marker (`>`, `|`, `>-`, `|-`,
 * `>+`, `|+`) becomes the empty string and the following lines fold in.
 * Parsing stops at the closing fence. An unreadable file (the Python
 * `OSError`) or one without a first-line fence yields `{}`.
 */
import { readFileSync } from "node:fs";

const FRONT_FENCE = /^---\s*$/;
const KEY_VALUE = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const BLOCK_SCALAR_MARKERS = new Set([">", "|", ">-", "|-", ">+", "|+"]);

/** The line boundaries of Python `str.splitlines()`: LF, VT, FF, CR, FS, GS,
 *  RS, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR (CRLF counts as one). */
const LINE_BREAKS = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029]);

/**
 * Python `str.splitlines()`: split on its line boundaries with no trailing
 * empty element when the text ends with one (`"".splitlines() == []`).
 */
export function splitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (LINE_BREAKS.has(code)) {
      lines.push(text.slice(start, i));
      i += code === 0x0d && text.charCodeAt(i + 1) === 0x0a ? 2 : 1;
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

/** Extract the frontmatter fields of a markdown file (e.g. a `SKILL.md`). */
export function parseFrontmatter(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return {};
  }
  const lines = splitLines(text);
  const first = lines[0];
  if (first === undefined || !FRONT_FENCE.test(first)) {
    return {};
  }
  const fields: Record<string, string> = {};
  let lastKey: string | null = null;
  for (const line of lines.slice(1)) {
    if (FRONT_FENCE.test(line)) {
      break;
    }
    const match = KEY_VALUE.exec(line);
    if (match) {
      lastKey = (match[1] as string).toLowerCase();
      let value = (match[2] as string).trim();
      if (BLOCK_SCALAR_MARKERS.has(value)) {
        value = ""; // YAML block scalar; fold the following lines
      }
      fields[lastKey] = value;
    } else if (lastKey && line.trim()) {
      // Continuation of a folded/multi-line value.
      fields[lastKey] = `${fields[lastKey] as string} ${line.trim()}`.trim();
    }
  }
  return fields;
}
