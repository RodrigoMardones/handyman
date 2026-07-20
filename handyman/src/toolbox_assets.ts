/**
 * toolBox served assets (feature 44): vendor UMDs resolved from THIS
 * package's node_modules, and the per-harness graphify export with the
 * same-origin vis-network rewrite.
 *
 * Originally extracted from toolbox_serve.ts so the Next route handlers
 * and the Node observer would share EXACTLY the same resolution and
 * rewrite logic. The Node observer was decommissioned in feature 50;
 * apps/web is now the sole consumer, reaching this module through the
 * runtime loader (toolbox_state.ts re-exports it), which matters because
 * resolution is relative to import.meta.url and must never be bundled.
 */
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { loadRegistry } from "@handyman/toolbox-core/registry";
import { readText } from "@handyman/toolbox-core/state";

const require = createRequire(import.meta.url);

// Browser libs served from node_modules (UMD builds). Feature
// toolbox_panel_retirement removed the React panel UMDs (react, react-dom,
// htm, marked, dompurify, minisearch) once parity was reached in apps/web;
// only the graphify renderer stays. graph.html loads vis-network from
// unpkg.com by default, which the strict CSP blocks. Serving the standalone
// UMD locally and rewriting the script src on the fly (see graphFile) keeps
// the graph self-contained and CSP-safe, matching the Plan C vendor pattern.
const vendorFiles: Record<string, [string, string]> = {
  "vis-network.js": ["vis-network", "standalone/umd/vis-network.min.js"],
};

function packageRoot(pkg: string): string | null {
  try {
    return dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    // Some export maps (htm, minisearch) hide package.json: derive the
    // root from the resolved entry path instead.
    try {
      const entry = require.resolve(pkg);
      const marker = `${sep}node_modules${sep}${pkg}${sep}`;
      const idx = entry.lastIndexOf(marker);
      return idx === -1 ? null : entry.slice(0, idx + marker.length - 1);
    } catch {
      return null;
    }
  }
}

/** UMD source for a whitelisted vendor name, or null when unknown/absent. */
export function vendorText(name: string): string | null {
  const spec = vendorFiles[name];
  if (!spec) {
    return null;
  }
  const root = packageRoot(spec[0]);
  return root === null ? null : readText(join(root, spec[1]));
}

export type GraphFileResult =
  | { status: "unknown_harness" }
  | { status: "no_export" }
  | { status: "ok"; text: string; type: string };

/**
 * The graphify export of the harness whose project_name (fallback: root
 * basename) matches `wanted`. graph.html gets the unpkg vis-network script
 * tag rewritten to the same-origin /vendor path (integrity/crossorigin
 * dropped: they no longer apply locally); the on-disk file stays untouched.
 */
export function graphFile(hroot: string, wanted: string, kind: "html" | "json"): GraphFileResult {
  const [registry] = loadRegistry(hroot);
  const entry = registry.harnesses.find((e) => {
    const raw = readText(join(e.project_root, "harness.config.json"));
    let name = e.project_root.split("/").pop() ?? e.project_root;
    if (raw) {
      try {
        name = String((JSON.parse(raw) as Record<string, unknown>).project_name ?? name);
      } catch {
        // keep basename
      }
    }
    return name === wanted;
  });
  if (!entry) {
    return { status: "unknown_harness" };
  }
  let text = readText(join(entry.project_root, "graphify-out", `graph.${kind}`));
  if (text === null) {
    return { status: "no_export" };
  }
  if (kind === "html") {
    text = text.replace(
      /<script\s+src="https:\/\/unpkg\.com\/vis-network@[^"]*"[^>]*><\/script>/,
      '<script src="/vendor/vis-network.js"></script>',
    );
  }
  const type = kind === "html" ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
  return { status: "ok", text, type };
}
