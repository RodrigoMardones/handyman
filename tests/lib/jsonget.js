#!/usr/bin/env node
/*
 * Portable JSON helper for the test harness (replaces python3 -c "import json...").
 *
 * Node is the single test runtime after the Python→TypeScript migration, so the
 * shell suites need a way to read/mutate JSON without jq or python. This script
 * is CommonJS (it lives under tests/, where the nearest package.json is the repo
 * root, which has no "type":"module"), so `require` is always available.
 *
 * Usage:
 *   node jsonget.js read  <file> <expr> [args...]   read: parse <file> into `d`,
 *                                                   evaluate JS <expr> with `d`
 *                                                   and `a` (the trailing args)
 *                                                   in scope, print the result.
 *                                                   undefined/null -> "".
 *                                                   `a` is the args array.
 *   node jsonget.js valid <file>                    exit 0 when <file> is valid
 *                                                   JSON, non-zero otherwise.
 *
 * The JS expression replaces the former python `d[...]` expression verbatim in
 * spirit (e.g. `d.models.implementer`, `d.tools.implementer.join(",")`,
 * `(d.features.find(f => f.name === a[0]) || {}).status || ""`).
 */
"use strict";

const fs = require("fs");

const [, , verb, file, expr, ...rest] = process.argv;

function fail(msg, code) {
  process.stderr.write(String(msg) + "\n");
  process.exit(code || 1);
}

if (verb === "valid") {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
    process.exit(0);
  } catch (e) {
    process.exit(1);
  }
}

if (verb === "read") {
  if (!file) fail("read: missing <file>", 2);
  if (expr === undefined) fail("read: missing <expr>", 2);
  let d;
  try {
    d = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail("read: cannot parse JSON: " + file + " (" + e.message + ")", 2);
  }
  const a = rest;
  let result;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("d", "a", "return (" + expr + ");");
    result = fn(d, a);
  } catch (e) {
    fail("read: expression error: " + e.message, 1);
  }
  // Parity with the former python `-c "print(expr)"`: null/None and the
  // booleans print as the Python reprs the shell assertions still expect.
  // (Exprs that explicitly return "" bypass this — the value is already a
  // string before formatting.)
  let out;
  if (result === undefined || result === null) {
    out = "None";
  } else if (typeof result === "boolean") {
    out = result ? "True" : "False";
  } else if (typeof result === "string") {
    out = result;
  } else {
    out = String(result);
  }
  process.stdout.write(out);
  process.exit(0);
}

fail("unknown verb: " + verb + " (expected: read | valid)", 2);
