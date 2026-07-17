/**
 * Faithful port of Python's `difflib.SequenceMatcher` +
 * `difflib.unified_diff`.
 *
 * The output matches CPython's exactly: the `---`/`+++` header lines (with an
 * optional `\t{date}`), the `@@ -start,len +start,len @@` hunk headers (a
 * length of 1 is omitted; empty ranges use `start,0` with `start` = the line
 * just before the range), and the ` `/`-`/`+ line prefixes with
 * SequenceMatcher's grouped opcodes (n lines of context per hunk).
 *
 * As in difflib, content lines are emitted verbatim with only a one-char
 * prefix — they are expected to already carry their line terminators (e.g.
 * from `splitlines(keepends=True)`), so a final line without a trailing
 * newline stays without one. Only the header and hunk lines get `lineterm`
 * appended.
 */

/** A run of `size` elements equal in both sequences, starting at a[i]/b[j]. */
interface MatchBlock {
  i: number;
  j: number;
  size: number;
}

/** One opcode: `[tag, aStart, aEnd, bStart, bEnd]`. */
type Opcode = [
  tag: "replace" | "delete" | "insert" | "equal",
  i1: number,
  i2: number,
  j1: number,
  j2: number,
];

/**
 * Port of `difflib.SequenceMatcher` restricted to the features `unified_diff`
 * needs (isjunk is always null there). autojunk mirrors CPython: elements
 * appearing in more than 1% of a >=200-element `b` are treated as junk.
 */
export class SequenceMatcher<T> {
  private readonly a: readonly T[];
  private readonly b: readonly T[];
  private b2j = new Map<T, number[]>();
  private bjunk = new Set<T>();
  private readonly autojunk: boolean;
  private matchingBlocks: MatchBlock[] | null = null;
  private opcodes: Opcode[] | null = null;

  constructor(a: readonly T[], b: readonly T[], autojunk = true) {
    this.a = a;
    this.b = b;
    this.autojunk = autojunk;
    this.chainB();
  }

  private chainB(): void {
    const b = this.b;
    const b2j = new Map<T, number[]>();
    for (let i = 0; i < b.length; i++) {
      const elt = b[i] as T;
      const idxs = b2j.get(elt);
      if (idxs) {
        idxs.push(i);
      } else {
        b2j.set(elt, [i]);
      }
    }

    // Purge popular (non-junk) elements when autojunk applies.
    const n = b.length;
    if (this.autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      const popular: T[] = [];
      for (const [elt, idxs] of b2j) {
        if (idxs.length > ntest) {
          popular.push(elt);
        }
      }
      for (const elt of popular) {
        b2j.delete(elt);
      }
    }

    this.b2j = b2j;
    this.bjunk = new Set();
  }

  findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): MatchBlock {
    const a = this.a;
    const b = this.b;
    const b2j = this.b2j;
    const bjunk = this.bjunk;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();

    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>();
      const indices = b2j.get(a[i] as T);
      if (indices) {
        for (const j of indices) {
          if (j < blo) continue;
          if (j >= bhi) break;
          const k = (j2len.get(j - 1) ?? 0) + 1;
          newj2len.set(j, k);
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
      j2len = newj2len;
    }

    // Extend past non-junk equal elements.
    while (
      besti > alo &&
      bestj > blo &&
      !bjunk.has(b[bestj - 1] as T) &&
      a[besti - 1] === b[bestj - 1]
    ) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      !bjunk.has(b[bestj + bestsize] as T) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize++;
    }

    // Extend past junk equal elements.
    while (
      besti > alo &&
      bestj > blo &&
      bjunk.has(b[bestj - 1] as T) &&
      a[besti - 1] === b[bestj - 1]
    ) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      bjunk.has(b[bestj + bestsize] as T) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize++;
    }

    return { i: besti, j: bestj, size: bestsize };
  }

  getMatchingBlocks(): MatchBlock[] {
    if (this.matchingBlocks !== null) {
      return this.matchingBlocks;
    }
    const la = this.a.length;
    const lb = this.b.length;

    const queue: Array<[number, number, number, number]> = [[0, la, 0, lb]];
    const blocks: MatchBlock[] = [];
    while (queue.length > 0) {
      const [alo, ahi, blo, bhi] = queue.pop() as [number, number, number, number];
      const m = this.findLongestMatch(alo, ahi, blo, bhi);
      const { i, j, size } = m;
      if (size > 0) {
        blocks.push(m);
        if (alo < i && blo < j) {
          queue.push([alo, i, blo, j]);
        }
        if (i + size < ahi && j + size < bhi) {
          queue.push([i + size, ahi, j + size, bhi]);
        }
      }
    }
    blocks.sort((x, y) => x.i - y.i || x.j - y.j || x.size - y.size);

    // Collapse adjacent blocks.
    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    const nonAdjacent: MatchBlock[] = [];
    for (const { i: i2, j: j2, size: k2 } of blocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1 > 0) {
          nonAdjacent.push({ i: i1, j: j1, size: k1 });
        }
        i1 = i2;
        j1 = j2;
        k1 = k2;
      }
    }
    if (k1 > 0) {
      nonAdjacent.push({ i: i1, j: j1, size: k1 });
    }
    nonAdjacent.push({ i: la, j: lb, size: 0 });

    this.matchingBlocks = nonAdjacent;
    return nonAdjacent;
  }

  getOpcodes(): Opcode[] {
    if (this.opcodes !== null) {
      return this.opcodes;
    }
    let i = 0;
    let j = 0;
    const answer: Opcode[] = [];
    for (const { i: ai, j: bj, size } of this.getMatchingBlocks()) {
      let tag: Opcode[0] | "" = "";
      if (i < ai && j < bj) {
        tag = "replace";
      } else if (i < ai) {
        tag = "delete";
      } else if (j < bj) {
        tag = "insert";
      }
      if (tag !== "") {
        answer.push([tag, i, ai, j, bj]);
      }
      i = ai + size;
      j = bj + size;
      if (size > 0) {
        answer.push(["equal", ai, i, bj, j]);
      }
    }
    this.opcodes = answer;
    return answer;
  }

  getGroupedOpcodes(n = 3): Opcode[][] {
    let codes = this.getOpcodes();
    if (codes.length === 0) {
      codes = [["equal", 0, 1, 0, 1]];
    } else {
      codes = codes.slice();
    }

    // Fix up leading/trailing equal groups so they show at most n context lines.
    const first = codes[0] as Opcode;
    if (first[0] === "equal") {
      const [tag, i1, i2, j1, j2] = first;
      codes[0] = [tag, Math.max(i1, i2 - n), i2, Math.max(j1, j2 - n), j2];
    }
    const last = codes[codes.length - 1] as Opcode;
    if (last[0] === "equal") {
      const [tag, i1, i2, j1, j2] = last;
      codes[codes.length - 1] = [tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)];
    }

    const nn = n + n;
    const groups: Opcode[][] = [];
    let group: Opcode[] = [];
    for (const [tag, i1, i2, j1, j2] of codes) {
      // Break the group on a large unchanged span.
      if (tag === "equal" && i2 - i1 > nn) {
        group.push([tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)]);
        groups.push(group);
        group = [[tag, Math.max(i1, i2 - n), i2, Math.max(j1, j2 - n), j2]];
        continue;
      }
      group.push([tag, i1, i2, j1, j2]);
    }
    if (group.length > 0 && !(group.length === 1 && (group[0] as Opcode)[0] === "equal")) {
      groups.push(group);
    }
    return groups;
  }
}

/** Options for {@link unifiedDiff}. */
export interface UnifiedDiffOptions {
  fromFile?: string;
  toFile?: string;
  fromFileDate?: string;
  toFileDate?: string;
  /** Lines of context per hunk (default 3). */
  n?: number;
  /** Terminator appended to header/hunk lines (default "\n"). */
  lineterm?: string;
}

/** Convert a range to unified-diff "ed" notation (a length of 1 is omitted). */
function formatRangeUnified(start: number, stop: number): string {
  let beginning = start + 1;
  const length = stop - start;
  if (length === 1) {
    return String(beginning);
  }
  if (length === 0) {
    beginning -= 1;
  }
  return `${beginning},${length}`;
}

/**
 * Port of `difflib.unified_diff`. Returns the diff lines as an array (join
 * with "" to reproduce `sys.stdout.writelines(diff)`; the terminators live in
 * the header/hunk lines and in the content lines themselves).
 */
export function unifiedDiff(
  aLines: readonly string[],
  bLines: readonly string[],
  options: UnifiedDiffOptions = {},
): string[] {
  const {
    fromFile = "",
    toFile = "",
    fromFileDate = "",
    toFileDate = "",
    n = 3,
    lineterm = "\n",
  } = options;

  const out: string[] = [];
  let started = false;
  const matcher = new SequenceMatcher(aLines, bLines);

  for (const group of matcher.getGroupedOpcodes(n)) {
    if (!started) {
      started = true;
      const fromDate = fromFileDate ? `\t${fromFileDate}` : "";
      const toDate = toFileDate ? `\t${toFileDate}` : "";
      out.push(`--- ${fromFile}${fromDate}${lineterm}`);
      out.push(`+++ ${toFile}${toDate}${lineterm}`);
    }

    const first = group[0] as Opcode;
    const lastOp = group[group.length - 1] as Opcode;
    const file1Range = formatRangeUnified(first[1], lastOp[2]);
    const file2Range = formatRangeUnified(first[3], lastOp[4]);
    out.push(`@@ -${file1Range} +${file2Range} @@${lineterm}`);

    for (const [tag, i1, i2, j1, j2] of group) {
      if (tag === "equal") {
        for (let k = i1; k < i2; k++) {
          out.push(` ${aLines[k]}`);
        }
        continue;
      }
      if (tag === "replace" || tag === "delete") {
        for (let k = i1; k < i2; k++) {
          out.push(`-${aLines[k]}`);
        }
      }
      if (tag === "replace" || tag === "insert") {
        for (let k = j1; k < j2; k++) {
          out.push(`+${bLines[k]}`);
        }
      }
    }
  }

  return out;
}
