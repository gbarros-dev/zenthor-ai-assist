import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/*/src/**/*.test.ts",
      "apps/backend/convex/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
    ],
  },
});
