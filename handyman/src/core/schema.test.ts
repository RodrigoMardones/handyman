import { describe, expect, it } from "vitest";
import { validateFeatureList, validateHarnessConfig, validateSprint } from "./schema.js";

const validConfig = {
  install_mode: "local" as const,
  project_name: "handyman",
  project_root: "/home/x/handyman",
  harness_workspace: ".handyman",
};

const validFeatureList = {
  project: "handyman",
  features: [{ id: 1, name: "core", status: "in_progress" as const }],
};

describe("validateFeatureList", () => {
  it("accepts a minimal valid document", () => {
    expect(validateFeatureList(validFeatureList)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a missing required top-level key", () => {
    const result = validateFeatureList({ features: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("project");
  });

  it("honors additionalProperties:false on a feature (invented keys rejected)", () => {
    const result = validateFeatureList({
      project: "p",
      features: [{ id: 1, name: "f", status: "done", close_date: "2026-01-01" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("close_date");
  });

  it("rejects an invalid status enum value", () => {
    const result = validateFeatureList({
      project: "p",
      features: [{ id: 1, name: "f", status: "wip" }],
    });
    expect(result.valid).toBe(false);
  });

  it("accepts an optional meta with started_at/done_at timestamps", () => {
    const result = validateFeatureList({
      project: "p",
      features: [
        {
          id: 1,
          name: "f",
          status: "in_progress",
          meta: { started_at: "2026-07-17T12:34:56.789Z", done_at: "2026-07-17T13:00:00.000Z" },
        },
      ],
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("honors additionalProperties:false inside meta (invented keys rejected)", () => {
    const result = validateFeatureList({
      project: "p",
      features: [{ id: 1, name: "f", status: "done", meta: { bogus: 1 } }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("bogus");
  });
});

describe("validateSprint", () => {
  it("accepts a valid closed-sprint frontmatter with closed_at", () => {
    expect(
      validateSprint({
        sprint: "2026-SP3",
        status: "closed",
        updated: "2026-07-17",
        closed_at: "2026-07-17T18:00:00.000Z",
        tags: ["handyman/sprint"],
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it("rejects a malformed sprint id", () => {
    const result = validateSprint({ sprint: "2026-Q1", status: "closed" });
    expect(result.valid).toBe(false);
  });

  it("honors additionalProperties:false (invented keys rejected)", () => {
    const result = validateSprint({ sprint: "2026-SP1", status: "closed", bogus: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("bogus");
  });
});

describe("validateHarnessConfig", () => {
  it("accepts a minimal valid config", () => {
    expect(validateHarnessConfig(validConfig)).toEqual({ valid: true, errors: [] });
  });

  it("rejects an unknown install_mode", () => {
    const result = validateHarnessConfig({ ...validConfig, install_mode: "cloud" });
    expect(result.valid).toBe(false);
  });

  it("rejects additional top-level properties", () => {
    const result = validateHarnessConfig({ ...validConfig, bogus: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("bogus");
  });
});
