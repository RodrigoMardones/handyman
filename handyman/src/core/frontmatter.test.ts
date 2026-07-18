import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseFrontmatter, splitLines } from "./frontmatter.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hm-fm-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const write = (name: string, content: string): string => {
  const path = join(root, name);
  writeFileSync(path, content, "utf-8");
  return path;
};

describe("splitLines", () => {
  it("mirrors str.splitlines(): no trailing empty element", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
    expect(splitLines("a\n\n")).toEqual(["a", ""]);
  });

  it("treats CRLF as a single boundary and CR alone as one", () => {
    expect(splitLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
  });

  it("splits on the exotic Python boundaries (VT, FF, NEL, LS, PS)", () => {
    expect(splitLines("a\vb\fc\u0085d\u2028e\u2029f")).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("parseFrontmatter", () => {
  it("returns {} for a missing file (Python OSError)", () => {
    expect(parseFrontmatter(join(root, "nope.md"))).toEqual({});
  });

  it("returns {} for a directory path (Python OSError)", () => {
    expect(parseFrontmatter(root)).toEqual({});
  });

  it("returns {} when the first line is not a --- fence", () => {
    const path = write("no-fence.md", "# Title\nname: x\n");
    expect(parseFrontmatter(path)).toEqual({});
  });

  it("returns {} for an empty file", () => {
    const path = write("empty.md", "");
    expect(parseFrontmatter(path)).toEqual({});
  });

  it("parses key: value pairs and lowercases keys", () => {
    const path = write("basic.md", "---\nName: demo\nDescription: does things\n---\n# Body\n");
    expect(parseFrontmatter(path)).toEqual({ name: "demo", description: "does things" });
  });

  it("accepts a fence with trailing whitespace and stops at the closing fence", () => {
    const path = write("fence.md", "---  \nname: demo\n---\nafter: not-parsed\n");
    expect(parseFrontmatter(path)).toEqual({ name: "demo" });
  });

  it("folds indented continuation lines with a single space", () => {
    const path = write(
      "cont.md",
      "---\ndescription: first part\n  second part\n\tthird part\n---\n",
    );
    expect(parseFrontmatter(path)).toEqual({
      description: "first part second part third part",
    });
  });

  it("treats YAML block-scalar markers as empty then folds the block", () => {
    for (const marker of [">", "|", ">-", "|-", ">+", "|+"]) {
      const path = write("scalar.md", `---\ndescription: ${marker}\n  folded line\n  more\n---\n`);
      expect(parseFrontmatter(path)).toEqual({ description: "folded line more" });
    }
  });

  it("keeps a literal > with content (not a bare block-scalar marker)", () => {
    const path = write("gt.md", "---\ndescription: > inline\n---\n");
    expect(parseFrontmatter(path)).toEqual({ description: "> inline" });
  });

  it("ignores blank lines inside a folded value", () => {
    const path = write("blank.md", "---\ndescription: |\n\n  after blank\n---\n");
    expect(parseFrontmatter(path)).toEqual({ description: "after blank" });
  });

  it("ignores continuation lines before any key", () => {
    const path = write("orphan.md", "---\n  orphan line\nname: demo\n---\n");
    expect(parseFrontmatter(path)).toEqual({ name: "demo" });
  });

  it("keeps the last occurrence of a duplicated key", () => {
    const path = write("dup.md", "---\nname: first\nname: second\n---\n");
    expect(parseFrontmatter(path)).toEqual({ name: "second" });
  });

  it("only matches [A-Za-z0-9_-]+ keys; others fold into the previous value", () => {
    const path = write("keys.md", "---\nname: demo\nbad key: ignored\n---\n");
    expect(parseFrontmatter(path)).toEqual({ name: "demo bad key: ignored" });
  });

  it("parses an unclosed fence through to EOF", () => {
    const path = write("open.md", "---\nname: demo\nstatus: approved\n");
    expect(parseFrontmatter(path)).toEqual({ name: "demo", status: "approved" });
  });

  it("keeps empty values for bare keys", () => {
    const path = write("bare.md", "---\nfeature:\nstatus: approved\n---\n");
    expect(parseFrontmatter(path)).toEqual({ feature: "", status: "approved" });
  });
});
