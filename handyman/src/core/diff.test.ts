import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./diff.js";

// Expected outputs generated with CPython 3.12:
//   python3 -c "import difflib; print(list(difflib.unified_diff(a, b, ...)))"
// (see the sprint parity script). Each expected array is difflib's exact
// output for the given inputs.

const range = (from: number, to: number): string[] => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    out.push(`line${i}\n`);
  }
  return out;
};

describe("unifiedDiff", () => {
  it("identical inputs produce no diff", () => {
    expect(
      unifiedDiff(["a\n", "b\n", "c\n"], ["a\n", "b\n", "c\n"], {
        fromFile: "a",
        toFile: "b",
      }),
    ).toEqual([]);
  });

  it("single change", () => {
    expect(
      unifiedDiff(["a\n", "b\n", "c\n"], ["a\n", "B\n", "c\n"], {
        fromFile: "a",
        toFile: "b",
      }),
    ).toEqual(["--- a\n", "+++ b\n", "@@ -1,3 +1,3 @@\n", " a\n", "-b\n", "+B\n", " c\n"]);
  });

  it("multi-hunk", () => {
    const a = range(1, 20);
    const b = a.slice();
    b[1] = "LINE2\n";
    b[15] = "LINE16\n";
    expect(unifiedDiff(a, b, { fromFile: "old.txt", toFile: "new.txt" })).toEqual([
      "--- old.txt\n",
      "+++ new.txt\n",
      "@@ -1,5 +1,5 @@\n",
      " line1\n",
      "-line2\n",
      "+LINE2\n",
      " line3\n",
      " line4\n",
      " line5\n",
      "@@ -13,7 +13,7 @@\n",
      " line13\n",
      " line14\n",
      " line15\n",
      "-line16\n",
      "+LINE16\n",
      " line17\n",
      " line18\n",
      " line19\n",
    ]);
  });

  it("add only", () => {
    expect(
      unifiedDiff(["a\n", "b\n"], ["a\n", "b\n", "c\n", "d\n"], {
        fromFile: "a",
        toFile: "b",
      }),
    ).toEqual(["--- a\n", "+++ b\n", "@@ -1,2 +1,4 @@\n", " a\n", " b\n", "+c\n", "+d\n"]);
  });

  it("delete only", () => {
    expect(
      unifiedDiff(["a\n", "b\n", "c\n", "d\n"], ["a\n", "d\n"], {
        fromFile: "a",
        toFile: "b",
      }),
    ).toEqual(["--- a\n", "+++ b\n", "@@ -1,4 +1,2 @@\n", " a\n", "-b\n", "-c\n", " d\n"]);
  });

  it("empty inputs produce no diff", () => {
    expect(unifiedDiff([], [], { fromFile: "a", toFile: "b" })).toEqual([]);
  });

  it("create from empty (dev/null)", () => {
    expect(unifiedDiff([], ["x\n", "y\n"], { fromFile: "/dev/null", toFile: "b/new" })).toEqual([
      "--- /dev/null\n",
      "+++ b/new\n",
      "@@ -0,0 +1,2 @@\n",
      "+x\n",
      "+y\n",
    ]);
  });

  it("file dates", () => {
    expect(
      unifiedDiff(["a\n"], ["b\n"], {
        fromFile: "old",
        toFile: "new",
        fromFileDate: "2021-01-01",
        toFileDate: "2021-01-02",
      }),
    ).toEqual(["--- old\t2021-01-01\n", "+++ new\t2021-01-02\n", "@@ -1 +1 @@\n", "-a\n", "+b\n"]);
  });

  it("no trailing newline on last line", () => {
    expect(unifiedDiff(["a\n", "b"], ["a\n", "c"], { fromFile: "a", toFile: "b" })).toEqual([
      "--- a\n",
      "+++ b\n",
      "@@ -1,2 +1,2 @@\n",
      " a\n",
      "-b",
      "+c",
    ]);
  });

  it("n=1 context", () => {
    const a = range(1, 20);
    const b = a.slice();
    b[1] = "LINE2\n";
    b[15] = "LINE16\n";
    expect(unifiedDiff(a, b, { fromFile: "old", toFile: "new", n: 1 })).toEqual([
      "--- old\n",
      "+++ new\n",
      "@@ -1,3 +1,3 @@\n",
      " line1\n",
      "-line2\n",
      "+LINE2\n",
      " line3\n",
      "@@ -15,3 +15,3 @@\n",
      " line15\n",
      "-line16\n",
      "+LINE16\n",
      " line17\n",
    ]);
  });
});
