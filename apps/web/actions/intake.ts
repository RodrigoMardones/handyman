"use server";

/**
 * submitIntake (feature 46): the server action that persists a reviewed
 * intake draft as the target harness's feature-request.md.
 *
 * This is where server actions enter the unified app - and deliberately
 * ONLY here: actions are React RPC (opaque protocol, not curl-able), so
 * the public HTTP surface stays on route handlers for the parity oracle,
 * while the UI's one real mutation gets the progressive-enhancement path.
 * Both entrances share the SAME core function (writeIntake), so validation
 * order, the tagged-files footer and the single-allowlisted-file guarantee
 * can never drift. The /intake page (feature 48) is the consumer.
 */
import { INTAKE_MAX_BYTES, intakeHttp, writeIntake } from "@handyman/toolbox-core";
import { getRuntime } from "../lib/runtime";

export interface SubmitIntakeResult {
  ok: boolean;
  /** Human-readable outcome, mirroring the HTTP relay's error strings. */
  message: string;
  /** Absolute path of the written feature-request.md when ok. */
  path?: string;
  /** Count of tagged files recorded in the footer when ok. */
  files?: number;
}

export async function submitIntake(
  root: string,
  draftMd: string,
  files: string[] = [],
): Promise<SubmitIntakeResult> {
  // Same 256 KB cap the HTTP relay enforces while reading the body.
  if (Buffer.byteLength(draftMd, "utf-8") > INTAKE_MAX_BYTES) {
    return { ok: false, message: "invalid body: expects {root, draft_md}" };
  }
  const runtime = getRuntime();
  const result = writeIntake(
    runtime.hroot,
    root,
    draftMd,
    files.filter((f) => typeof f === "string"),
  );
  const { body } = intakeHttp(result);
  const mapped = body as { ok: boolean; error?: string; path?: string; files?: number };
  if (!mapped.ok) {
    return { ok: false, message: mapped.error ?? "intake failed" };
  }
  return { ok: true, message: "feature-request.md written", path: mapped.path, files: mapped.files };
}
