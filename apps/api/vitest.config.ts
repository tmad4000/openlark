import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    env: {
      NODE_ENV: "test",
    },
    // Disable parallel file execution for integration tests (shared database state)
    fileParallelism: false,
    // Run tests within files sequentially too
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
