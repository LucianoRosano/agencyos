import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { expect, type Page, test } from "@playwright/test";
import { type SeoFixture, startSeoFixture } from "../fixtures/seo-site";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

/**
 * SEO Auditor de punta a punta contra un sitio LOCAL de prueba (nunca sitios reales).
 * La auditoría la procesa el mismo código del worker (`src/seo/cli.ts`, cola `seo-audit`) con la opción
 * explícita de test (NODE_ENV=test + SEO_ALLOW_LOCAL=1) que permite 127.0.0.1.
 */
const run = promisify(execFile);
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";

let site: SeoFixture;
test.beforeAll(async () => {
  site = await startSeoFixture();
});
test.afterAll(async () => {
  await site.close();
});

/** Despacha la cola como el worker (asíncrono: el sitio fixture vive en este proceso). */
async function processQueue() {
  await run("pnpm", ["--filter", "@agencyos/modules", "exec", "tsx", "src/seo/cli.ts"], {
    env: { ...process.env, DATABASE_URL: E2E_DB, NODE_ENV: "test", SEO_ALLOW_LOCAL: "1", APP_ENCRYPTION_KEY: "1".repeat(64) },
    timeout: 120_000,
  });
}

async function waitCompleted(page: Page) {
  await processQueue();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Auditoría SEO · Completada")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

test("auditar el sitio de prueba → problemas → comparar dos corridas → CSV @visual", async ({ page }, info) => {
  test.setTimeout(240_000);
  site.setVersion(1);
  await login(page);
  await page.goto("/seo");
  await expect(page.getByRole("heading", { name: "SEO" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 1) Nueva auditoría
  await page.getByRole("button", { name: "Auditar" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#rootUrl").fill(site.url);
  await dialog.locator("#maxPages").fill("50");
  await expectNoHorizontalScroll(page);
  await shot(page, "seo-nueva-auditoria", info.project.name);
  await dialog.getByRole("button", { name: "Auditar" }).click();
  await page.waitForURL(/\/seo\/[0-9a-f-]{36}$/);
  const firstUrl = page.url();
  await expect(page.getByText("Auditoría SEO · En cola")).toBeVisible();

  await waitCompleted(page);
  await expect(page.getByRole("img", { name: /Puntaje \d+ de 100/ })).toBeVisible();
  await expect(page.getByText("Lo que más resta")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "seo-resumen", info.project.name);

  // 2) Problemas esperados del sitio fixture
  await page.getByRole("link", { name: /^Problemas/ }).click();
  await page.waitForURL(/\/problemas$/);
  for (const t of [
    "Falta la meta description",
    "Enlace interno roto",
    "Cadena de redirecciones",
    "JSON-LD con error de sintaxis",
    "URL del sitemap bloqueada por robots.txt",
  ])
    await expect(page.getByRole("heading", { name: new RegExp(t) })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "seo-problemas", info.project.name);

  // Crear tarea desde un grupo
  const group = page.locator("#meta_description_missing");
  await group.getByRole("button", { name: "Crear tarea" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click();
  await expect(page.getByText(/1 tarea creada/)).toBeVisible();
  await expect(group.getByText("Con tarea")).toBeVisible();

  // Páginas y Rendimiento (sin API key: se dice explícitamente)
  await page.goto(`${firstUrl}/paginas`);
  await expect(page.getByText(`${site.url}servicios`, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "seo-paginas", info.project.name);
  await page.goto(`${firstUrl}/rendimiento`);
  await expect(page.getByText("Configurá la API key gratuita de Google para ver Lighthouse y Core Web Vitals.")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 3) Segunda corrida con cambios (se corrige una meta description y aparece un 5xx) → comparar
  site.setVersion(2);
  await page.goto(firstUrl);
  await page.getByRole("button", { name: "Volver a auditar" }).click();
  await page.waitForURL((u) => /\/seo\/[0-9a-f-]{36}$/.test(u.pathname) && u.toString() !== firstUrl);
  await waitCompleted(page);
  site.setVersion(1);
  const secondUrl = page.url();
  await page.goto(`${secondUrl}/comparar`);
  await expect(page.getByText("Nuevos ·")).toBeVisible();
  await expect(page.getByText("Página con error del servidor (5xx)").first()).toBeVisible();
  await expect(page.getByText("Falta la meta description").first()).toBeVisible();
  await expect(page.getByText(/[▲▼=] /).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "seo-comparar", info.project.name);

  // 4) Informe: CSV de problemas
  await page.goto(`${secondUrl}/informe`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Descargar CSV" }).click()]);
  const csv = readFileSync((await download.path()) as string, "utf8");
  expect(csv.split("\r\n")[0]).toContain("categoria;severidad;codigo;problema;url");
  expect(csv).toContain("http_5xx");
  // el PDF se genera (Chromium del servidor)
  const pdf = await page.request.get(`${secondUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await shot(page, "seo-informe", info.project.name);

  // Lista con las dos auditorías y delta
  await page.goto("/seo");
  await expect(page.getByText(/pts/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "seo-lista", info.project.name);
});
