import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Fidelity renders hit a single-slot simulator pool; running tests
    // concurrently would just serialize at the server and burn timeouts.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
