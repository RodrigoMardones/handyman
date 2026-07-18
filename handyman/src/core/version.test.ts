import { describe, expect, it } from "vitest";
import { getVersion, HANDYMAN_VERSION } from "./version.js";

describe("version", () => {
  it("exposes a semver-shaped version string", () => {
    expect(HANDYMAN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("getVersion returns the version constant", () => {
    expect(getVersion()).toBe(HANDYMAN_VERSION);
  });
});
