#!/usr/bin/env node
/**
 * `toolbox.js review-notes` (feature 53): the first LLM subcommand of the CLI.
 *
 * Until now the whole LLM layer was unreachable without booting a web server:
 * `buildProviders` had exactly one consumer (apps/web/lib/runtime.ts) and no
 * subcommand touched a model. A reviewer who wanted a checklist had to run
 * `toolbox serve` and POST to it. Now it is one command.
 *
 * `review-notes` is the one chosen because it is the highest-value command for
 * a role and the one that best exercises the shape (workspace + diff +
 * provider). ONE, not five: with this green, we decide whether the remaining
 * relays are worth the same treatment.
 *
 * What it is NOT: a verdict. The checklist is a set of questions to verify.
 * The reviewer signs APPROVED / CHANGES_REQUESTED on the verifier and the
 * diff, never on this output - the system prompt in the core says so too.
 *
 * Lives in its own module (like toolbox_serve.ts, and NOT in the
 * toolbox_review_notes.ts re-export shim) because it is async, while
 * toolbox.ts's main() is a synchronous number-returning dispatcher.
 */
import { resolve } from "node:path";
import {
  buildProviders,
  composeReviewNotesRequest,
  handymanRoot,
  isRegisteredRoot,
  type LlmProvider,
  loadDotEnv,
  relayReviewNotes,
  resolveSummaryModel,
} from "@handyman/toolbox-core";

/** Same shape feature.js itself accepts: nothing can walk out of backlog/. */
const FEATURE_NAME = /^[A-Za-z0-9_-]+$/;

/** Default matches the HTTP relays (resolveRelayTarget). */
const DEFAULT_PROVIDER = "zai";

export const REVIEW_NOTES_USAGE =
  "usage: toolbox.js review-notes --root PATH --feature NAME [--provider ID] [--model M] [--json]";

function fail(message: string): number {
  process.stderr.write(`review-notes: ${message}\n`);
  return 1;
}

interface Options {
  root: string;
  feature: string;
  provider: string;
  model: string | null;
  json: boolean;
}

/** Minimal flag parse; an unknown flag is an error, not silently ignored. */
export function parseReviewNotesArgs(argv: string[]): Options | number {
  const opts: Options = {
    root: "",
    feature: "",
    provider: DEFAULT_PROVIDER,
    model: null,
    json: false,
  };
  const named: Array<keyof Options> = ["root", "feature", "provider", "model"];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${REVIEW_NOTES_USAGE}\n`);
      return 0;
    }
    const key = named.find((n) => arg === `--${n}` || arg.startsWith(`--${n}=`));
    if (key === undefined) {
      process.stderr.write(`${REVIEW_NOTES_USAGE}\nreview-notes: unknown argument: ${arg}\n`);
      return 2;
    }
    let value: string | undefined;
    if (arg.startsWith(`--${key}=`)) {
      value = arg.slice(String(key).length + 3);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i += 1;
      }
    }
    if (value === undefined || value === "") {
      process.stderr.write(`${REVIEW_NOTES_USAGE}\nreview-notes: --${key} expects a value\n`);
      return 2;
    }
    (opts as unknown as Record<string, string>)[key] = value;
  }
  return opts;
}

/**
 * Every rejection below fires BEFORE any model call, in the same order the
 * HTTP relay validates: root present -> root registered -> feature present and
 * well-formed -> provider known. A run that is going to fail costs no tokens.
 */
export async function reviewNotesMain(argv: string[]): Promise<number> {
  const parsed = parseReviewNotesArgs(argv);
  if (typeof parsed === "number") {
    return parsed;
  }
  const { feature, provider: providerId, model, json } = parsed;

  if (!parsed.root) {
    return fail("--root is required");
  }
  const root = resolve(parsed.root);
  loadDotEnv(process.cwd());
  const hroot = handymanRoot(null);
  if (!isRegisteredRoot(hroot, root)) {
    return fail(`root not registered: ${root} (register it with 'toolbox.js register')`);
  }
  if (!feature) {
    return fail("--feature is required");
  }
  if (!FEATURE_NAME.test(feature)) {
    return fail(`invalid feature name: ${feature}`);
  }
  const providers: LlmProvider[] = buildProviders(process.env);
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) {
    const available = providers.map((p) => p.id).join(", ") || "(none configured)";
    return fail(`unknown provider: ${providerId} (available: ${available})`);
  }

  const composed = composeReviewNotesRequest(root, feature);
  const resolvedModel = resolveSummaryModel(model ?? undefined, providerId, process.env);

  let exitCode = 0;
  await relayReviewNotes({
    system: composed.system,
    prompt: composed.prompt,
    diffTruncated: composed.diffTruncated,
    draft: (r, onDelta) =>
      provider.draft({ prompt: r.prompt, system: r.system, model: resolvedModel }, onDelta),
    // Streaming text is the point of the non-JSON mode: the reviewer reads the
    // checklist as it lands. Under --json the deltas are swallowed so stdout
    // holds exactly one parseable object.
    onDelta: (text) => {
      if (!json) {
        process.stdout.write(text);
      }
    },
    onResult: (event) => {
      if (json) {
        process.stdout.write(`${JSON.stringify(event)}\n`);
        return;
      }
      process.stdout.write("\n");
      if (event.diff_truncated) {
        process.stderr.write(
          "NOTE: the diff was truncated by size; part of the change was not seen.\n",
        );
      }
    },
    onError: (error) => {
      process.stderr.write(`review-notes: ${error.code}: ${error.message}\n`);
      exitCode = 1;
    },
  });
  return exitCode;
}
