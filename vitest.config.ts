import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      TZ: "America/Buenos_Aires",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_test",
      AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      AUTH_HIBP: "off",
      APP_ENCRYPTION_KEY: "2222222222222222222222222222222222222222222222222222222222222222",
    },
    coverage: { include: ["packages/core/src/**", "packages/modules/src/**/service.ts"], reporter: ["text", "html"] },
  },
});
