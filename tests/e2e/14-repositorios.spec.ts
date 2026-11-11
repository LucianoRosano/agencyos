import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, OWNER, shot } from "./helpers";

/**
 * Repositorios con GitHub SIMULADO (GITHUB_FAKE=1, docs/09 §3.7):
 * conectar → sincronizar → estándar → generar plan → aprobar (reautenticación) → ejecución en el worker → auditoría.
 */

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";

/** Corre el job del worker que ejecuta planes aprobados (otro proceso, como en producción). */
function runWorkerJob() {
  const code = `const m = await import("@agencyos/modules/repos/jobs"); const r = await m.reposExecutePlans(); console.log(JSON.stringify(r)); const db = await import("@agencyos/db"); await db.closeDb();`;
  const out = execFileSync("pnpm", ["--silent", "--filter", "@agencyos/worker", "exec", "tsx", "--input-type=module", "-e", code], {
    env: { ...process.env, DATABASE_URL: E2E_DB, GITHUB_FAKE: "1", NODE_ENV: "test" },
    encoding: "utf8",
  });
  return out;
}

test("repositorios: sincronizar → estándar → plan → aprobar → ejecución → auditoría @visual", async ({ page }, info) => {
  test.setTimeout(180_000);
  const tag = info.project.name;
  await login(page);

  // 1. Conectar (simulado) o resincronizar
  await page.goto("/repositorios");
  const connect = page.getByRole("button", { name: "Conectar GitHub simulado" });
  if (await connect.count()) {
    await expectNoHorizontalScroll(page);
    await shot(page, "repositorios-sin-conexion", tag);
    await connect.click();
    await expect(page.getByText("GitHub simulado conectado y sincronizado")).toBeVisible({ timeout: 30_000 });
  } else {
    await page.getByRole("button", { name: "Sincronizar" }).click();
    await expect(page.getByText("Repositorios sincronizados")).toBeVisible({ timeout: 30_000 });
  }
  await page.reload();
  const isMobile = (page.viewportSize()?.width ?? 1440) < 768;
  const row = isMobile ? page.locator('[data-repo-card="Panel_Sofia"]') : page.locator('[data-repo="Panel_Sofia"]');
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: /Salud \d+ de 100/ })).toBeVisible();
  await expect(
    page
      .locator(isMobile ? '[data-repo-card="prod-libreriaos-fiscal"]' : '[data-repo="prod-libreriaos-fiscal"]')
      .getByRole("img", { name: "Salud 100 de 100" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "repositorios-lista", tag);

  // 2. Hoy: el repo con secretos aparece como crítico en "Ponerse al día"
  await page.goto("/hoy");
  await expect(page.getByText("edu-ungs-sistemas: gitleaks encontró secretos")).toBeVisible();

  // 3. Estándar del repositorio fuera de convención
  await page.goto("/repositorios");
  await row.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Panel_Sofia" })).toBeVisible();
  await page.getByRole("link", { name: /^Estándar/ }).click();
  await expect(page.locator('[data-check="nombre"][data-status="fail"]')).toContainText("cli-sofia-panel");
  await expect(page.locator('[data-check="claude_md"][data-status="fail"]')).toBeVisible();
  await expect(page.locator('[data-check="secretos"][data-status="warn"]')).toContainText("No verificado");
  await expectNoHorizontalScroll(page);
  await shot(page, "repositorio-estandar", tag);

  // 4. Generar plan → revisar acciones con diff
  await page.getByRole("button", { name: "Generar plan" }).first().click();
  await page.waitForURL(/\/repositorios\/planes\/[0-9a-f-]+$/);
  await expect(page.locator('[data-action="rename"]')).toContainText("+ cli-sofia-panel");
  await expect(page.locator('[data-action="set_topics"]')).toBeVisible();
  await expect(page.locator('[data-action="add_file"]').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "plan-por-aprobar", tag);

  // 5. Aprobar con reautenticación (primero contraseña incorrecta)
  await page.getByRole("button", { name: "Aprobar" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Aprobar plan" })).toBeVisible();
  await sheet.locator("#password").fill("incorrecta-123");
  await sheet.getByRole("button", { name: "Aprobar y ejecutar" }).click();
  await expect(sheet.getByText("Contraseña incorrecta").first()).toBeVisible();
  await sheet.locator("#password").fill(OWNER.password);
  await sheet.getByRole("button", { name: "Aprobar y ejecutar" }).click();
  // al aprobar, la página se revalida: el plan queda en cola para el worker
  await expect(page.getByText(/El worker lo ejecuta en el próximo minuto/)).toBeVisible();
  await expect(page.getByText("Aprobado · en cola").first()).toBeVisible();
  await expect(page.locator("[data-audit]")).toContainText("Plan aprobado (con reautenticación)");

  // 6. El worker ejecuta (proceso aparte, GitHub simulado)
  const out = runWorkerJob();
  expect(out).toContain('"status":"done"');
  await page.reload();
  await expect(page.getByText("Ejecutado").first()).toBeVisible();
  await expect(page.locator('[data-action="rename"][data-status="done"]')).toBeVisible();
  await expect(page.locator('[data-action="add_file"][data-status="done"]').first()).toContainText("PR #");
  const auditCard = page.locator("[data-audit]");
  await expect(auditCard).toContainText("Plan aprobado (con reautenticación)");
  await expect(auditCard).toContainText("GitHub · rename");
  await expect(auditCard).toContainText("Ejecución terminada");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "plan-ejecutado", tag);

  // 7. El repositorio quedó renombrado y con mejor salud; la actividad lo registra
  await page.locator('[data-action="rename"]').getByRole("link").click();
  await expect(page.getByRole("heading", { name: "cli-sofia-panel" })).toBeVisible();
  await page.getByRole("link", { name: "Actividad" }).click();
  await expect(page.getByText(/Renombró luciano-demo\/cli-sofia-panel|Renombró luciano-demo\/Panel_Sofia/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "repositorio-actividad", tag);
});
