#!/usr/bin/env node
// Builds the runnable bundle of the Mastra runtime (feature 102,
// mastra_runtime_pack): one ESM file per runner in dist-bundle/ so the
// runners execute with PLAIN NODE (no tsx) from any cwd. The package stays
// private — the artifact runs from the monorepo / local install, it is NOT
// a publishable package (no manifest staging, no npm pack here).
//
// Externals — resolved from node_modules at RUNTIME, relative to the BUNDLE
// location (never to the caller's cwd): every third-party dependency
// (@mastra/* incl. the duckdb/libsql native bindings they pull, @ai-sdk/*,
// zod, the mastra dev CLI). Only the package's own src/ + runner drivers are
// inlined — the bundle is thin on purpose (the package is private and always
// runs from its installation, so node_modules is guaranteed to be there).
// handyman-harness is never a static import: src/ports/harness-install.ts
// resolves it at runtime via createRequire(import.meta.url) — in the bundle
// that URL is dist-bundle/<runner>.mjs, so resolution walks up to the
// package's node_modules and follows the workspace link to the real
// package (which is where assets/ and dist/ live). Listing it in `external`
// is documentation-in-code; esbuild never sees the resolution.
//
// No createRequire banner: nothing bundled is CJS (own src is pure ESM TS).
// If a CJS dependency is ever inlined, copy the banner line from
// handyman/scripts/pack_npm.mjs (feature 64).
//
// Entry guards: the runners execute TOP-LEVEL (they are drivers, not
// importable units), so the bundles need no basename(argv[1]) guard — each
// bundle file IS the executable entry. (Contrast with handyman's cli.js
// dispatcher, whose verb modules double as importable units, feature 100.)
//
// Observation shape (house pattern): last stdout line is `status: ok|error`.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(PKG_DIR, "dist-bundle");
const RUNNERS = ["run-feature", "run-workflow", "run-skill", "run-hub"];

function die(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.stdout.write("status: error\n");
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: RUNNERS.map((r) => join(PKG_DIR, `${r}.ts`)),
  outdir: OUT_DIR,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["@mastra/*", "@ai-sdk/*", "zod", "mastra", "handyman-harness"],
  logLevel: "warning",
});

// Inventory guards (house pattern): every runner shipped, and third-party
// deps stayed external — an inlined @mastra means the external list drifted.
for (const runner of RUNNERS) {
  if (!existsSync(join(OUT_DIR, `${runner}.mjs`)))
    die(`bundle is missing ${runner}.mjs`);
}
const sample = readFileSync(join(OUT_DIR, "run-feature.mjs"), "utf8");
if (!/from\s+["']@mastra\//.test(sample))
  die("@mastra/* got inlined into run-feature.mjs — the external list drifted");

process.stdout.write(
  `bundle: ${OUT_DIR} (${RUNNERS.length} runners, node20 ESM, externals: @mastra/* @ai-sdk/* zod mastra handyman-harness)\n`,
);
process.stdout.write("status: ok\n");
