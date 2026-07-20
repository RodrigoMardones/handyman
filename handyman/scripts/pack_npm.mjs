#!/usr/bin/env node
// Builds the publishable `handyman-harness` tarball in a throwaway staging
// dir (feature 64, variante A del explore report). The repo's tsc dist/ stays
// untouched — it is the oracle for the bash suites; the bundled dist exists
// only inside .pack-staging/ and the tarball produced from it.
//
// Publishing stays a human action: this script never talks to the registry
// beyond `npm pack` (offline). Observation shape: last stdout line is
// `status: ok|error`.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PKG_DIR, "..");
const STAGING = join(PKG_DIR, ".pack-staging");
const PUBLISH_NAME = "handyman-harness";

// Must mirror VERBS in src/cli.ts — the inventory guard below fails the pack
// if any verb is missing from the tarball, which also catches drift here.
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
];

function die(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.stdout.write("status: error\n");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8"));

// Version handshake: the skill (usage manifest) and the npm toolchain share
// one version. The tarball ships no SKILL.md, so the published CLI reports
// package.json's version — parity here is what keeps both channels honest.
const skillVersion = (/^\s+version:\s*(.+)$/m.exec(
  readFileSync(join(PKG_DIR, "SKILL.md"), "utf8"),
)?.[1] ?? "").trim();
if (skillVersion !== manifest.version)
  die(
    `SKILL.md metadata.version (${skillVersion || "missing"}) != package.json version (${manifest.version})`,
  );

rmSync(STAGING, { recursive: true, force: true });
mkdirSync(join(STAGING, "dist"), { recursive: true });

const entryPoints = readdirSync(join(PKG_DIR, "src"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => join(PKG_DIR, "src", f));

// ajv is CommonJS: the ESM output needs a createRequire banner or it dies at
// runtime with `require is not defined`. vis-network stays external — the
// toolbox serves its minified UMD file from node_modules, never imports it.
await esbuild.build({
  entryPoints,
  outdir: join(STAGING, "dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["vis-network"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "warning",
});

const publish = {
  name: PUBLISH_NAME,
  version: manifest.version,
  description: manifest.description,
  author: "Rodrigo Mardones",
  license: manifest.license,
  type: "module",
  engines: manifest.engines,
  bin: { handyman: "dist/cli.js" },
  files: ["dist", "assets", "NOTICE"],
  exports: manifest.exports,
  repository: {
    type: "git",
    url: "git+https://github.com/RodrigoMardones/handyman.git",
  },
  dependencies: { "vis-network": manifest.dependencies["vis-network"] },
};
writeFileSync(
  join(STAGING, "package.json"),
  `${JSON.stringify(publish, null, 2)}\n`,
);

cpSync(join(PKG_DIR, "assets"), join(STAGING, "assets"), { recursive: true });
cpSync(join(PKG_DIR, "README.npm.md"), join(STAGING, "README.md"));
cpSync(join(REPO_ROOT, "LICENSE"), join(STAGING, "LICENSE"));
cpSync(join(REPO_ROOT, "NOTICE"), join(STAGING, "NOTICE"));

const packOut = JSON.parse(
  execFileSync("npm", ["pack", "--json"], { cwd: STAGING, encoding: "utf8" }),
);
const report = packOut[0];
const paths = report.files.map((f) => f.path);

// Inventory guards — the executable half of the feature-64 acceptance.
const leaked = paths.filter((p) => p === ".env" || p.endsWith("/.env"));
if (leaked.length > 0) die(`tarball leaks env files: ${leaked.join(", ")}`);
if (JSON.stringify(publish).includes("workspace:"))
  die("publish manifest still references workspace:* dependencies");
const missing = ["cli", ...VERBS].filter((v) => !paths.includes(`dist/${v}.js`));
if (missing.length > 0) die(`tarball is missing verbs: ${missing.join(", ")}`);

process.stdout.write(`tarball: ${join(STAGING, report.filename)}\n`);
process.stdout.write(
  `size: ${report.size} unpacked: ${report.unpackedSize} entries: ${report.entryCount}\n`,
);
process.stdout.write("status: ok\n");
