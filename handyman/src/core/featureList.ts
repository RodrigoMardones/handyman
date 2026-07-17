/**
 * Byte-identical JSON IO for `feature_list.json` (and any harness JSON state).
 *
 * The Python side writes:
 *   path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
 *                   encoding="utf-8")
 * The JS equivalent `JSON.stringify(data, null, 2) + "\n"` written as UTF-8
 * (no BOM) produces identical bytes for both ASCII and non-ASCII input: both
 * serializers use 2-space indentation and leave non-ASCII characters
 * unescaped.
 *
 * `saveFeatureList` writes atomically (temp file in the same directory + a
 * rename) so a crash never leaves a truncated state file. The final bytes are
 * exactly the string above.
 */
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Serialize harness state to the exact byte string Python writes. */
export function serializeFeatureList(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Parse a UTF-8 JSON file into a plain JS value. */
export function loadFeatureList<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** Atomically write harness state, byte-identical to the Python writer. */
export function saveFeatureList(path: string, data: unknown): void {
  const text = serializeFeatureList(data);
  const tmp = join(
    dirname(path),
    `.${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`,
  );
  try {
    writeFileSync(tmp, text, { encoding: "utf-8" });
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort cleanup; ignore if the temp file was never created
    }
    throw err;
  }
}
