import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    poolOptions: {
      threads: { singleThread: true },
    },
    passWithNoTests: true,
    env: {
      DATABASE_URL: `file:${path.join(root, ".vitest.sqlite")}`,
      TESTING_UNLOCK_ALL_ADVENT: "1",
      ADMIN_API_KEY: "test-admin-key",
      INTERNAL_API_KEY: "test-internal-key",
      CORS_ORIGIN: "http://localhost:5173",
      CAMPAIGN_START_DATE: "2099-01-01",
      API_PORT: "4000",
    },
  },
});
