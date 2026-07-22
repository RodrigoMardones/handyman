import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "./seed.js";

let root: string;
let workspace: string;
let seedDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hm-seed-"));
  workspace = join(root, ".handyman");
  seedDir = join(root, ".handyman.seed");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a file at an absolute path, creating parent dirs. */
const writeFile = (path: string, content: string): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
};

/** Minimal but valid live harness to export from. */
function makeLiveHarness(): void {
  writeFile(
    join(root, "harness.config.json"),
    JSON.stringify({ harness_workspace: ".handyman", harness_version: "3.5.0", project_name: "p" }),
  );
  writeFile(join(root, "init.sh"), "#!/usr/bin/env bash\necho ok\n");
  for (const doc of ["business", "architecture", "conventions", "verification"]) {
    writeFile(join(workspace, "memory", `${doc}.md`), `# ${doc}\n`);
  }
}

describe("seed export", () => {
  it("writes Tier 1+2 files, templates, and a valid manifest", () => {
    makeLiveHarness();
    const rc = main(["--root", root, "export", "--seed", seedDir]);
    expect(rc).toBe(0);
    // Tier 1
    expect(existsSync(join(seedDir, "init.sh"))).toBe(true);
    expect(existsSync(join(seedDir, "harness.config.json"))).toBe(true);
    // Tier 2
    for (const doc of ["business", "architecture", "conventions", "verification"]) {
      expect(existsSync(join(seedDir, "memory", `${doc}.md`))).toBe(true);
    }
    // manifest
    expect(existsSync(join(seedDir, "manifest.json"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(seedDir, "manifest.json"), "utf8"));
    expect(manifest.handyman_seed).toBe(1);
    expect(manifest.harness_version).toBe("3.5.0");
    expect(manifest.tier).toEqual([1, 2]);
    expect(manifest.files.length).toBe(6);
    expect(manifest.templates.length).toBeGreaterThan(0);
  });

  it("skips missing source files instead of failing", () => {
    // No memory docs present: export still succeeds for Tier 1 + manifest.
    writeFile(join(root, "harness.config.json"), JSON.stringify({ harness_workspace: ".handyman" }));
    writeFile(join(root, "init.sh"), "#!/bin/sh\n");
    const rc = main(["--root", root, "export", "--seed", seedDir]);
    expect(rc).toBe(0);
    expect(existsSync(join(seedDir, "init.sh"))).toBe(true);
  });

  it("falls back to package version when harness_version is absent", () => {
    writeFile(join(root, "harness.config.json"), JSON.stringify({ harness_workspace: ".handyman" }));
    writeFile(join(root, "init.sh"), "#!/bin/sh\n");
    main(["--root", root, "export", "--seed", seedDir]);
    const manifest = JSON.parse(readFileSync(join(seedDir, "manifest.json"), "utf8"));
    expect(manifest.harness_version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("seed import", () => {
  it("bootstraps a skeleton then overlays Tier 1+2 into a clean repo", () => {
    makeLiveHarness();
    main(["--root", root, "export", "--seed", seedDir]);
    // Fresh target repo: drop the seed into a new root with no harness.
    const fresh = mkdtempSync(join(tmpdir(), "hm-import-"));
    const freshSeed = join(fresh, ".handyman.seed");
    cpRecursive(seedDir, freshSeed);
    const rc = main(["--root", fresh, "import", "--seed", ".handyman.seed"]);
    expect(rc).toBe(0);
    // Bootstrap skeleton (templates) present.
    expect(existsSync(join(fresh, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(fresh, "CHECKPOINTS.md"))).toBe(true);
    expect(existsSync(join(fresh, ".handyman", "feature_list.json"))).toBe(true);
    expect(existsSync(join(fresh, ".handyman", "progress", "current.md"))).toBe(true);
    // Overlay Tier 1+2.
    expect(existsSync(join(fresh, "init.sh"))).toBe(true);
    expect(existsSync(join(fresh, "harness.config.json"))).toBe(true);
    for (const doc of ["business", "architecture", "conventions", "verification"]) {
      expect(existsSync(join(fresh, ".handyman", "memory", `${doc}.md`))).toBe(true);
    }
    // No stray template litter at the repo root.
    expect(existsSync(join(fresh, "init.template.sh"))).toBe(false);
    rmSync(fresh, { recursive: true, force: true });
  });

  it("is non-destructive: re-importing keeps existing files unchanged", () => {
    makeLiveHarness();
    main(["--root", root, "export", "--seed", seedDir]);
    const fresh = mkdtempSync(join(tmpdir(), "hm-imp2-"));
    const freshSeed = join(fresh, ".handyman.seed");
    cpRecursive(seedDir, freshSeed);
    main(["--root", fresh, "import", "--seed", ".handyman.seed"]);
    // Corrupt an overlaid file; the re-run must NOT overwrite it.
    writeFile(join(fresh, "init.sh"), "# HAND-EDITED\n");
    main(["--root", fresh, "import", "--seed", ".handyman.seed", "--overlay"]);
    expect(readFileSync(join(fresh, "init.sh"), "utf8")).toBe("# HAND-EDITED\n");
    rmSync(fresh, { recursive: true, force: true });
  });

  it("errors when the seed folder is missing", () => {
    const rc = main(["--root", root, "import", "--seed", join(root, "nope")]);
    expect(rc).toBe(1);
  });

  it("errors when the seed lacks a manifest.json", () => {
    writeFile(join(seedDir, "init.sh"), "#!/bin/sh\n");
    const rc = main(["--root", root, "import", "--seed", ".handyman.seed"]);
    expect(rc).toBe(1);
  });
});

describe("seed usage", () => {
  it("rejects an unknown subcommand with exit 2", () => {
    expect(() => main(["--root", root, "frobnicate"])).toThrow();
  });
  it("rejects a missing subcommand with exit 2", () => {
    expect(() => main(["--root", root])).toThrow();
  });
});

/** Minimal recursive copy. */
function cpRecursive(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true });
}
