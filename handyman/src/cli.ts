#!/usr/bin/env node
import { fileURLToPath } from "node:url";
/**
 * Single-bin dispatcher for the published package: `handyman <verb> [args...]`
 * re-executes `dist/<verb>.js` in-process. Additive on top of the per-verb
 * entrypoints — the bash suites keep calling `node dist/<verb>.js` directly,
 * so this file changes nothing for the repo oracle (feature 64).
 *
 * The verb modules guard their main() on being the executed entry, reading
 * process.argv at evaluation time; argv is re-pointed at the verb file BEFORE
 * the dynamic import so `handyman feature ready` observes the exact argv
 * shape of `node dist/feature.js ready` (prog name included).
 */

const VERBS = [
  "backlog",
  "evals",
  "feature",
  "index_md",
  "metrics",
  "preflight",
  "sprint",
  "toolbox",
  "tools_discovery",
  "update_harness",
  "upgrade_harness",
  "validate_harness",
] as const;

function usage(): string {
  const list = VERBS.map((v) => `  ${v}`).join("\n");
  return `usage: handyman <verb> [args...]\n\nverbs:\n${list}\n\nEach verb accepts --help for its own options.\nhandyman --version prints the toolchain version.\n`;
}

const [verb, ...rest] = process.argv.slice(2);

if (!verb || verb === "--help" || verb === "-h") {
  process.stdout.write(usage());
  process.exit(verb ? 0 : 2);
}

if (verb === "--version" || verb === "-v") {
  const { readFileSync } = await import("node:fs");
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

if (!(VERBS as readonly string[]).includes(verb)) {
  process.stderr.write(`error: unknown verb '${verb}'\n\n${usage()}`);
  process.exit(2);
}

const target = new URL(`./${verb}.js`, import.meta.url);
process.argv = [process.argv[0] ?? "node", fileURLToPath(target), ...rest];
await import(target.href);
