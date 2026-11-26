import { expect, test } from "@playwright/test";
import pg from "pg";
import { expectAccessible, expectNoHorizontalScroll, login, OWNER, shot } from "./helpers";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";

async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** Crea avisos para el dueño (como los dejaría el worker). */
async function seed(tag: string, items: { type: string; title: string; priority?: string; read?: boolean }[]) {
  const [u] = await q<{ id: string; workspace_id: string }>(
    "select u.id, m.workspace_id from \"user\" u join membership m on m.user_id = u.id where u.email = $1 and m.role = 'owner' limit 1",
    [OWNER.email],
  );
  if (!u) throw new Error("sin dueño");
  for (const [i, it] of items.entries())
    await q(
      `insert into notification (id, workspace_id, user_id, type, title, priority, dedupe_key, read_at, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now() - ($8 || ' seconds')::interval)`,
      [u.workspace_id, u.id, it.type, it.title, it.priority ?? "normal", `e2e:${tag}:${i}`, it.read ? new Date() : null, String(items.length - i)],
    );
}

test("centro de avisos: sin leer, urgente, posponer, archivar, todo leído con deshacer, abrir y aviso en vivo @visual", async ({ page }, info) => {
  test.setTimeout(120_000);
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  await login(page);
  await q("update notification set read_at = now() where read_at is null");
  await seed(tag, [
    { type: "sitio.caido", title: `Se cayó tienda-${tag}.com.ar`, priority: "urgent" },
    { type: "presupuesto.visto", title: `El cliente abrió el presupuesto P-${tag}` },
    { type: "objetivo.pregunta", title: `El agente pregunta algo ${tag}` },
    { type: "cobro.vencido", title: `Cobro vencido ${tag}` },
  ]);
  await page.goto("/notificaciones");
  await expect(page.getByRole("link", { name: "Sin leer" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Urgente").first()).toBeVisible();
  await expect(page.getByText(`El cliente abrió el presupuesto P-${tag}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "notificaciones", info.project.name);

  // Posponer → pasa a «Pospuestas» (y se puede deshacer)
  await page.getByRole("button", { name: `Acciones de «Cobro vencido ${tag}»` }).click();
  await page.getByRole("menuitem", { name: "Mañana a las 9" }).click();
  await expect(page.getByText(/Pospuesto: mañana a las 9/)).toBeVisible();
  await expect(page.getByText(`Cobro vencido ${tag}`)).toBeHidden();
  await page.goto("/notificaciones?ver=pospuestas");
  await expect(page.getByText(`Cobro vencido ${tag}`)).toBeVisible();
  await expect(page.getByText(/vuelve /).first()).toBeVisible();

  // Archivar
  await page.goto("/notificaciones?ver=sin-leer");
  await page.getByRole("button", { name: `Acciones de «El agente pregunta algo ${tag}»` }).click();
  await page.getByRole("menuitem", { name: "Archivar" }).click();
  await expect(page.getByText("Archivado")).toBeVisible();
  await expect(page.getByText(`El agente pregunta algo ${tag}`)).toBeHidden();

  // Todo leído → Deshacer
  await page.getByRole("button", { name: "Todo leído" }).click();
  await expect(page.getByText("Estás al día")).toBeVisible();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText(`El cliente abrió el presupuesto P-${tag}`)).toBeVisible();

  // Abrir un aviso lo marca leído y lleva a lo que avisa
  await page.getByText(`El cliente abrió el presupuesto P-${tag}`).click();
  await page.waitForURL(/\/hoy/);
  await page.goto("/notificaciones?ver=sin-leer");
  await expect(page.getByText(`El cliente abrió el presupuesto P-${tag}`)).toBeHidden();

  // En vivo: llega uno nuevo con la app abierta → aviso abajo con «Ver» y la campana se actualiza
  await page.goto("/hoy");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await seed(`${tag}-live`, [{ type: "presupuesto.aceptado", title: `Aceptaron el presupuesto ${tag}` }]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(`Aceptaron el presupuesto ${tag}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Ver" })).toBeVisible();
});

test("configuración de avisos: horario de descanso, resúmenes y preferencias agrupadas @visual", async ({ page }, info) => {
  await login(page);
  await page.goto("/configuracion/notificaciones");
  await expect(page.getByText("Descanso y resúmenes")).toBeVisible();
  await page.locator("#quietFrom").fill("23:00");
  await page.locator("#digestHour").selectOption("9");
  await page.getByLabel("Cierre del día: lo que hiciste y lo primero de mañana").check();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Preferencias guardadas")).toBeVisible();
  await page.reload();
  await expect(page.locator("#quietFrom")).toHaveValue("23:00");
  await expect(page.locator("#digestHour")).toHaveValue("9");
  await expect(page.getByText("El agente te hace una pregunta")).toBeVisible();
  await expect(page.getByText("Sitio caído")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "configuracion-notificaciones", info.project.name);
});
