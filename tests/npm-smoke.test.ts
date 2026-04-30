import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("npm distribution", () => {
  test("compiled CLI runs with Node", () => {
    const build = spawnSync("bun", ["run", "build"], {
      cwd: projectRoot,
      encoding: "utf8"
    });

    expect(build.status, build.stderr || build.stdout).toBe(0);

    const distBin = join(projectRoot, "dist", "bin", "foreman.js");
    expect(existsSync(distBin)).toBe(true);
    expect(readFileSync(distBin, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);

    const help = spawnSync("node", [distBin, "help"], {
      cwd: projectRoot,
      encoding: "utf8"
    });

    expect(help.status, help.stderr || help.stdout).toBe(0);
    expect(help.stdout).toContain("Foreman CLI");
  });
});
