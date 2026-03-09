import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: "v8",
      include: [
        "src/annotate.ts",
        "src/index.ts",
        "src/parser.ts",
        "src/transform.ts",
        "src/visitor.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 100,
        branches: 85,
        statements: 90,
      },
    },
  },
});
