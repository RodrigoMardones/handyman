import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWorkspace } from "./workspace.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hm-ws-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const write = (rel: string, content: string): void => {
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
};

describe("resolveWorkspace", () => {
  it("falls back to root when nothing is present", () => {
    expect(resolveWorkspace(root)).toBe(root);
  });

  it("prefers harness.config.json harness_workspace (relative -> joined to root)", () => {
    write("harness.config.json", JSON.stringify({ harness_workspace: "ws" }));
    expect(resolveWorkspace(root)).toBe(join(root, "ws"));
  });

  it("keeps an absolute harness.config.json workspace as-is", () => {
    write("harness.config.json", JSON.stringify({ harness_workspace: "/abs/ws" }));
    expect(resolveWorkspace(root)).toBe("/abs/ws");
  });

  it("falls through to feature_list.json config.harness_workspace", () => {
    write("harness.config.json", JSON.stringify({ other: true }));
    write("feature_list.json", JSON.stringify({ config: { harness_workspace: "flws" } }));
    expect(resolveWorkspace(root)).toBe(join(root, "flws"));
  });

  it("swallows malformed harness.config.json and uses the next rule", () => {
    write("harness.config.json", "{ not json");
    write("feature_list.json", JSON.stringify({ config: { harness_workspace: "flws" } }));
    expect(resolveWorkspace(root)).toBe(join(root, "flws"));
  });

  it("swallows malformed feature_list.json and falls through to .handyman", () => {
    write("feature_list.json", "{ broken");
    write(".handyman/feature_list.json", JSON.stringify({ project: "p", features: [] }));
    expect(resolveWorkspace(root)).toBe(join(root, ".handyman"));
  });

  it("uses .handyman when its feature_list.json exists and no config points elsewhere", () => {
    write(".handyman/feature_list.json", JSON.stringify({ project: "p", features: [] }));
    expect(resolveWorkspace(root)).toBe(join(root, ".handyman"));
  });

  it("ignores an empty-string workspace value (Python truthiness) and falls through", () => {
    write("harness.config.json", JSON.stringify({ harness_workspace: "" }));
    expect(resolveWorkspace(root)).toBe(root);
  });
});
