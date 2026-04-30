import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../src/cli";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "foreman-cli-"));
  createHarness(projectRoot);
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("foreman cli", () => {
  test("shows harness status", async () => {
    const result = await runCli(["--project", projectRoot, "status"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Install mode: local");
    expect(result.stdout).toContain("1 pending");
    expect(result.stdout).toContain("Active feature: none");
  });

  test("lists features", async () => {
    const result = await runCli(["--project", projectRoot, "feature", "list"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("first_feature");
    expect(result.stdout).toContain("pending");
  });

  test("starts a pending feature", async () => {
    const result = await runCli(["--project", projectRoot, "feature", "start", "1", "--agent", "test-agent"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Started feature");

    const featureList = readFeatureList(projectRoot);
    expect(featureList.features[0].status).toBe("in_progress");

    const current = readFileSync(join(projectRoot, "progress", "current.md"), "utf8");
    expect(current).toContain("test-agent");
    expect(current).toContain("first_feature");
  });

  test("blocks a feature with a reason", async () => {
    await runCli(["--project", projectRoot, "feature", "start", "1"]);
    const result = await runCli(["--project", projectRoot, "feature", "block", "1", "--reason", "waiting for API key"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Blocked feature");

    const featureList = readFeatureList(projectRoot);
    expect(featureList.features[0].status).toBe("blocked");

    const current = readFileSync(join(projectRoot, "progress", "current.md"), "utf8");
    expect(current).toContain("waiting for API key");
  });

  test("refuses to close without approved review", async () => {
    await runCli(["--project", projectRoot, "feature", "start", "1"]);
    const result = await runCli(["--project", projectRoot, "feature", "close", "1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing approved review report");

    const featureList = readFeatureList(projectRoot);
    expect(featureList.features[0].status).toBe("in_progress");
  });

  test("closes with approved review and green verifier", async () => {
    await runCli(["--project", projectRoot, "feature", "start", "1"]);
    writeFileSync(join(projectRoot, "progress", "review_first_feature.md"), "APPROVED\n");

    const result = await runCli(["--project", projectRoot, "feature", "close", "1"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Closed feature");

    const featureList = readFeatureList(projectRoot);
    expect(featureList.features[0].status).toBe("done");

    const history = readFileSync(join(projectRoot, "progress", "history.md"), "utf8");
    expect(history).toContain("Closure:** done");

    const current = readFileSync(join(projectRoot, "progress", "current.md"), "utf8");
    expect(current).toContain("_none_");
  });

  test("verify fails on invalid feature state", async () => {
    const featureList = readFeatureList(projectRoot);
    featureList.features.push({ id: 2, name: "second", title: "Second", status: "in_progress" });
    featureList.features[0].status = "in_progress";
    writeFileSync(join(projectRoot, "feature_list.json"), `${JSON.stringify(featureList, null, 2)}\n`);

    const result = await runCli(["--project", projectRoot, "verify"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("2 features are in_progress");
  });
});

function createHarness(root: string): void {
  mkdirSync(join(root, "progress"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });

  writeFileSync(join(root, "feature_list.json"), `${JSON.stringify({
    project: "fixture-project",
    config: {
      install_mode: "local",
      project_name: "fixture-project",
      project_root: ".",
      foreman_root: null,
      harness_workspace: "."
    },
    rules: {
      one_feature_at_a_time: true,
      require_tests_to_close: true,
      valid_status: ["pending", "in_progress", "done", "blocked"]
    },
    features: [
      {
        id: 1,
        name: "first_feature",
        title: "First feature",
        description: "First fixture feature.",
        acceptance: ["It can be started and closed."],
        status: "pending"
      }
    ]
  }, null, 2)}\n`);

  writeFileSync(join(root, "progress", "current.md"), "# Current Session\n\n- **Feature in progress:** _none_\n");
  writeFileSync(join(root, "progress", "history.md"), "# Session History\n");
  writeFileSync(join(root, "docs", "architecture.md"), "# Architecture\n");
  writeFileSync(join(root, "docs", "conventions.md"), "# Conventions\n");
  writeFileSync(join(root, "docs", "verification.md"), "# Verification\n");
  writeFileSync(join(root, "CHECKPOINTS.md"), "# CHECKPOINTS\n");
  writeFileSync(join(root, "init.sh"), "#!/usr/bin/env bash\nset -euo pipefail\necho verifier ok\n");
  chmodSync(join(root, "init.sh"), 0o755);
}

function readFeatureList(root: string): {
  features: Array<{ id: number | string; name?: string; title?: string; status: string }>;
} {
  return JSON.parse(readFileSync(join(root, "feature_list.json"), "utf8"));
}
