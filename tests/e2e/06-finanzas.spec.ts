import { expect, test } from "@playwright/test";
import pg from "pg";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

/** Fecha de calendario en Argentina (+N días), "YYYY-MM-DD". */
const dayAR = (plus = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Buenos_Aires" }).format(new Date(Date.now() + plus * 86_400_000));
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
function addMonth(iso: string) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

test("finanzas: suscripción que vence en 3 días → Hoy → «Registrar pago» → gasto creado y fecha avanzada @visual", async ({ page }, info) => {
  const tag = info.project.name;
  const account = `Caja ${tag}`;
  const vendor = `Hostinger ${tag}`;
  const due = dayAR(3);
  await login(page);

  // 1. Cuenta con saldo inicial
  await page.goto("/finanzas/cuentas?nueva=1");
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Nueva cuenta" })).toBeVisible();
  await sheet.locator("#name").fill(account);
  await sheet.locator("#openingBalance").fill("250.000,50");
  await sheet.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.locator(`[data-account="${account}"]`)).toBeVisible();
  await expect(page.locator(`[data-account="${account}"]`)).toContainText("$ 250.000,50");
  await expectNoHorizontalScroll(page);

  // 2. Un ingreso desde "Registrar" (?nuevo=1)
  await page.goto("/finanzas/movimientos?nuevo=1");
  await expect(page.getByRole("heading", { name: "Registrar movimiento" })).toBeVisible();
  await page.getByRole("radio", { name: "Ingreso" }).click();
  const tx = page.getByRole("dialog");
  await tx.locator("#amount").fill("80000");
  await tx.locator("#accountId").selectOption({ label: `${account} · ARS · Agencia` });
  await tx.locator("#description").fill(`Mantenimiento ${tag}`);
  await tx.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(page.getByText(`Mantenimiento ${tag}`).filter({ visible: true }).first()).toBeVisible();

  // 3. Suscripción que vence en 3 días
  await page.goto("/finanzas/suscripciones");
  await page
    .getByRole("button", { name: /Nueva suscripción|Agregar la primera/ })
    .first()
    .click();
  const sub = page.getByRole("dialog");
  await sub.locator("#vendor").fill(vendor);
  await sub.locator("#amount").fill("15000");
  await sub.locator("#nextDue").fill(due);
  await sub.locator("#accountId").selectOption({ label: `${account} · ARS` });
  await sub.getByRole("button", { name: "Agregar" }).click();
  const row = page.locator(`[data-vendor="${vendor}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("vence en 3 d");
  const subId = await row.getAttribute("data-sub");
  expect(subId).toBeTruthy();

  // 4. Aparece en "Ponerse al día" de Hoy (si /hoy ya renderiza ese bloque) y en el resumen de Finanzas
  await page.goto("/hoy");
  if (await page.getByText(/ponerse al día/i).count()) {
    await expect(page.getByText(`Renovar ${vendor}`)).toBeVisible();
  }
  await page.goto("/finanzas");
  await expect(page.getByText(`Renovar ${vendor}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-resumen", tag);

  // 5. Deep link de Hoy → "Registrar pago"
  await page.goto(`/finanzas/suscripciones?pagar=${subId}`);
  const pay = page.getByRole("dialog");
  await expect(pay.getByRole("heading", { name: `Registrar pago · ${vendor}` })).toBeVisible();
  await expect(pay.locator("#amount")).toHaveValue("15000.00");
  await pay.getByRole("button", { name: "Registrar pago" }).click();
  const next = addMonth(due);
  await expect(page.getByText(`Pago registrado · próximo vencimiento ${ddmmyyyy(next)}`)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/pagar=/);
  await expect(row).toContainText(`vence el ${ddmmyyyy(next)}`);
  await expect(row).toContainText(`último pago ${ddmmyyyy(dayAR())}`);
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-suscripciones", tag);

  // 6. El gasto quedó en Movimientos y descontó del saldo
  await page.goto("/finanzas/movimientos");
  await expect(page.getByText(`Pago ${vendor}`).filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-movimientos", tag);
  await page.goto("/finanzas/cuentas");
  await expect(page.locator(`[data-account="${account}"]`)).toContainText("$ 315.000,50");
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-cuentas", tag);

  // 7. Reportes y CSV autenticado
  await page.goto("/finanzas/reportes");
  await expect(page.getByText("Mensual ·").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-reportes", tag);
  const csv = await page.request.get("/finanzas/reportes/csv?tipo=movimientos");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(`Pago ${vendor}`);
});

test("finanzas: cobro parcial de un cliente → constancia imprimible @visual", async ({ page }, info) => {
  const tag = info.project.name;
  const clientName = `Librería ${tag}`;
  const concept = `Sitio web · anticipo ${tag}`;
  await login(page);
  // El alta de clientes es del módulo CRM: el cliente se inserta directo en la base de e2e (solo datos de test).
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e" });
  await db.connect();
  const ws = await db.query<{ id: string }>("select id from workspace limit 1");
  await db.query("insert into client (id, workspace_id, name, status) values (gen_random_uuid(), $1, $2, 'active')", [ws.rows[0]?.id, clientName]);
  await db.end();

  await page.goto("/finanzas/por-cobrar");
  await page
    .getByRole("button", { name: /Nuevo cobro|Agregar un cobro/ })
    .first()
    .click();
  const form = page.getByRole("dialog");
  await form.locator("#clientId").selectOption({ label: clientName });
  await form.locator("#concept").fill(concept);
  await form.locator("#amount").fill("100000");
  await form.locator("#dueDate").fill(dayAR(10));
  await form.getByRole("button", { name: "Agregar" }).click();
  const row = page.locator("[data-receivable]").filter({ hasText: concept });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Pendiente");

  await row.getByRole("button", { name: "Registrar cobro" }).click();
  const collect = page.getByRole("dialog");
  await collect.locator("#amount").fill("40000");
  await collect.getByRole("button", { name: "Registrar cobro" }).click();
  await expect(page.getByText(/Cobro registrado · constancia C-\d{4}-\d{4}/)).toBeVisible();
  await expect(row).toContainText("Parcial");
  await expect(row).toContainText("$ 60.000");
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-por-cobrar", tag);

  const href = await row.getByRole("link", { name: "Constancia" }).first().getAttribute("href");
  expect(href).toMatch(/^\/finanzas\/constancia\/[0-9a-f-]{36}$/);
  await page.goto(href as string);
  await expect(page.getByText("Documento no válido como factura").first()).toBeVisible();
  await expect(page.getByText("Luciano Rosano").first()).toBeVisible();
  await expect(page.getByText(clientName)).toBeVisible();
  await expect(page.getByText("$ 40.000,00")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-constancia", tag);
});

test("finanzas: exportar a Excel (XLSX) y CSV", async ({ page }) => {
  await login(page);
  await page.goto("/finanzas/reportes");
  const xlsxHref = await page.getByRole("link", { name: "Movimientos Excel" }).getAttribute("href");
  const xlsx = await page.request.get(xlsxHref as string);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  const csv = await page.request.get((xlsxHref as string).replace("/xlsx", "/csv"));
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Fecha;Tipo;Libro");
});
