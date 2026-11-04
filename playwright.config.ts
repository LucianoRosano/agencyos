import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";
const theme = (t: "dark" | "light") => ({ name: "ag-theme", value: t, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const });

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure", locale: "es-AR", timezoneId: "America/Buenos_Aires" },
  projects: [
    { name: "desktop-1440-dark", use: { viewport: { width: 1440, height: 900 }, storageState: { cookies: [theme("dark")], origins: [] } } },
    { name: "mobile-390-dark", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, storageState: { cookies: [theme("dark")], origins: [] } } },
    { name: "desktop-1440-light", use: { viewport: { width: 1440, height: 900 }, storageState: { cookies: [theme("light")], origins: [] } }, grep: /@visual/ },
    { name: "mobile-390-light", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, storageState: { cookies: [theme("light")], origins: [] } }, grep: /@visual/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter @agencyos/web exec next ${process.env.E2E_PROD ? "start" : "dev"} --port ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          DATABASE_URL: E2E_DB,
          APP_URL: baseURL,
          AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
          AUTH_HIBP: "off",
          AUTH_RATE_LIMIT: "off",
          APP_ENCRYPTION_KEY: "1111111111111111111111111111111111111111111111111111111111111111",
          NEXT_DIST_DIR: ".next-e2e",
        },
      },
});
