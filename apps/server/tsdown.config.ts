import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  external: [
    'cpu-features',
    '../build/Release/cpufeatures.node'
  ],
});
