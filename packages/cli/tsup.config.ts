import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  onSuccess: async () => {
    const specDir = join("dist", "spec");
    mkdirSync(specDir, { recursive: true });
    copyFileSync(
      join("..", "..", "spec", "plugdev.schema.json"),
      join(specDir, "plugdev.schema.json"),
    );
  },
});
