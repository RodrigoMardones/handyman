/**
 * Ajv-backed validation for the harness JSON contracts.
 *
 * Validates against the REAL schemas shipped under `assets/schemas/`
 * (`feature_list.schema.json`, `harness.config.schema.json`) — the same files
 * the Python `check_schema` gate uses. Both are draft-07 with
 * `additionalProperties: false`, which Ajv honors by default: keys the
 * contract does not define are rejected.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

/** Outcome of a schema validation: a flag plus readable error strings. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Resolve a bundled schema by filename. Both `src/core/` (vitest) and
 * `dist/core/` (built) sit two levels below the package root, so
 * `../../assets/schemas/<name>` is correct in either location.
 */
function readSchema(name: string): object {
  const url = new URL(`../../assets/schemas/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf-8"));
}

// Single Ajv instance; `allErrors` collects every violation, not just the first.
const ajv = new Ajv({ allErrors: true, strict: false });

const featureListValidator: ValidateFunction = ajv.compile(readSchema("feature_list.schema.json"));
const harnessConfigValidator: ValidateFunction = ajv.compile(
  readSchema("harness.config.schema.json"),
);

/** Turn one Ajv error into a readable `location: message` string. */
function formatError(error: ErrorObject): string {
  const location = error.instancePath === "" ? "(root)" : error.instancePath;
  const extra =
    error.keyword === "additionalProperties" && typeof error.params.additionalProperty === "string"
      ? ` (${error.params.additionalProperty})`
      : "";
  return `${location}: ${error.message ?? "invalid"}${extra}`;
}

function toResult(validator: ValidateFunction, data: unknown): ValidationResult {
  const valid = validator(data) as boolean;
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validator.errors ?? []).map(formatError);
  return { valid: false, errors };
}

/** Validate a parsed `feature_list.json` document. */
export function validateFeatureList(data: unknown): ValidationResult {
  return toResult(featureListValidator, data);
}

/** Validate a parsed `harness.config.json` document. */
export function validateHarnessConfig(data: unknown): ValidationResult {
  return toResult(harnessConfigValidator, data);
}
