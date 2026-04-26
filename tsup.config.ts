import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  target: "node20",
  external: ["@elizaos/core"],
});
