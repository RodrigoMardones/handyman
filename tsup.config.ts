import { defineConfig } from "tsup";

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: {
      cli: "src/cli.ts"
    },
    format: ["esm"],
    outDir: "dist",
    platform: "node",
    sourcemap: true,
    splitting: false,
    target: "node18"
  },
  {
    clean: false,
    dts: false,
    entry: {
      "bin/foreman": "bin/foreman-node.ts"
    },
    format: ["esm"],
    outDir: "dist",
    platform: "node",
    sourcemap: true,
    splitting: false,
    target: "node18"
  }
]);
