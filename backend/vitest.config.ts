import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // B-6 (2026-08-09): coverage is a blocking gate (CI), not informational.
    // Current: ~74% all-files. Thresholds 60/50/60/60 prevent silent regressions.
    coverage: {
      enabled: true,
      provider: "v8",
      thresholds: {
        lines: 60,
        functions: 50,
        branches: 60,
        statements: 60,
      },
    },
  },
});
