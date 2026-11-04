import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** El CRM no es parte de este módulo: el cliente y la oportunidad de prueba se insertan directo (datos SOLO de test). */
async function seedClient(project: string) {
  const [ws] = await sql<{ id: string }>("select id from workspace order by created_at limit 1");
  if (!ws) throw new Error("sin workspace");
  const [c] = await sql<{ id: string }>("insert into client (id, workspace_id, name, status) values (gen_random_uuid(), $1, $2, 'prospect') returning id", [
    ws.id,
    `Cliente e2e ${project}`,
  ]);
  const [o] = await sql<{ id: string }>(
    "insert into opportunity (id, workspace_id, client_id, title, stage) values (gen_random_uuid(), $1, $2, $3, 'meeting') returning id",
    [ws.id, c?.id, `Tienda online ${project}`],
  );
  return { clientId: c?.id as string, oppId: o?.id as string };
}

const field = (page: Page, id: string) => page.locator(`[id="${id}"]`);

test("presupuesto: 3 ítems con descuentos → PDF → enviado → v2 → aceptado → proyecto + 2 cobros @visual", async ({ page }, info) => {
  test.setTimeout(180_000);
  const p = info.project.name;
  const mobile = p.includes("mobile");
  await login(page);
  const { oppId } = await seedClient(p);

  // Catálogo: un servicio con plantilla de proyecto
  await page.goto("/presupuestos/servicios");
  await page
    .getByRole("button", { name: /Nuevo servicio|Cargar el primer servicio/ })
    .first()
    .click();
  await page.fill("#name", `Tienda WooCommerce ${p}`);
  await page.fill("#priceArs", "300000");
  await page.locator("#projectTemplateId").selectOption({ label: "Tienda online (WooCommerce)" });
  await page.getByRole("button", { name: "Guardar servicio" }).click();
  await expect(page.getByRole("heading", { name: `Tienda WooCommerce ${p}` })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "presupuestos-servicios", p);

  // Editor: precargado desde la oportunidad
  await page.goto(`/presupuestos/nuevo?oportunidad=${oppId}`);
  await expect(field(page, "title")).toHaveValue(`Tienda online ${p}`);
  await field(page, "items.0.serviceId").selectOption({ label: `Tienda WooCommerce ${p}` });
  await expect(field(page, "items.0.description")).toHaveValue(`Tienda WooCommerce ${p}`);
  await expect(field(page, "items.0.unitPrice")).toHaveValue("300000");
  await field(page, "items.0.discountType").selectOption("percent");
  await field(page, "items.0.discountValue").fill("10");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await field(page, "items.1.description").fill("Carga de productos");
  await field(page, "items.1.quantity").fill("2");
  await field(page, "items.1.unitPrice").fill("50000");
  await field(page, "items.1.discountType").selectOption("amount");
  await field(page, "items.1.discountValue").fill("10000");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await field(page, "items.2.description").fill("Capacitación");
  await field(page, "items.2.unitPrice").fill("45000");
  await page.locator("#globalDiscountType").selectOption("percent");
  await page.locator("#globalDiscountValue").fill("5");
  await page.getByRole("radio", { name: "Por etapas" }).check({ force: true });
  await expect(page.getByText("Suma: 100 %")).toBeVisible();
  // Totales calculados en el servidor: 445.000 − 40.000 − 20.250
  await expect(page.getByTestId("savebar-total")).toHaveText("$ 384.750,00");
  await expectNoHorizontalScroll(page);
  await shot(page, "presupuesto-editor", p);
  if (mobile) await page.getByRole("radio", { name: "Vista previa" }).check({ force: true });
  const frame = page.frameLocator('iframe[title="Vista previa del presupuesto"]');
  await expect(frame.locator("[data-total]")).toHaveText("$ 384.750");
  await expect(frame.getByText("Luciano Rosano").first()).toBeVisible();
  await expect(frame.getByText("Precios finales").first()).toBeVisible();
  await shot(page, "presupuesto-vista-previa", p);

  await page.getByRole("button", { name: "Crear presupuesto" }).click();
  await page.waitForURL(/\/presupuestos\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop() as string;
  await expect(page.getByTestId("quote-total")).toHaveText("$ 384.750");
  await expectNoHorizontalScroll(page);
  await shot(page, "presupuesto-ficha", p);

  // PDF generado en el servidor
  const res = await page.request.get(`/api/presupuestos/${id}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toMatch(/filename="P-\d{4}-\d{4}\.pdf"/);
  const pdf = await res.body();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.length).toBeGreaterThan(10_000);

  // Enviado (MVP: PDF + texto) → la oportunidad pasa a «Propuesta enviada»
  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(page.getByRole("textbox", { name: "Texto para WhatsApp o email" })).toHaveValue(/Total: \$ 384\.750 \(precios finales\)/);
  await page.getByRole("button", { name: "Ya lo envié" }).click();
  await expect(page.getByText("Enviado", { exact: true }).first()).toBeVisible();
  expect((await sql<{ stage: string }>("select stage from opportunity where id = $1", [oppId]))[0]?.stage).toBe("proposal_sent");

  // Enviado no se edita: nueva versión
  await page.goto(`/presupuestos/${id}/editar`);
  await expect(page.getByText("es de solo lectura")).toBeVisible();
  await page.getByRole("button", { name: "Crear versión v2" }).click();
  await expect(field(page, "items.2.quantity")).toBeVisible();
  await field(page, "items.2.quantity").fill("2");
  // 490.000 − 40.000 = 450.000; −5 % = 427.500
  await expect(page.getByTestId("savebar-total")).toHaveText("$ 427.500,00");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.waitForURL(/\/presupuestos\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("quote-total")).toHaveText("$ 427.500");
  await page.goto(`/presupuestos/${id}/versiones`);
  await expect(page.getByText("Cambiado")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "presupuesto-versiones", p);

  // v2 enviada y aceptada → proyecto + 2 cobros 50/50
  await page.goto(`/presupuestos/${id}`);
  await page.getByRole("button", { name: "Marcar como enviado" }).click();
  await page.getByRole("button", { name: "Ya lo envié" }).click();
  await expect(page.getByRole("button", { name: "Aceptar" })).toBeVisible();
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText("Crear 2 cobros pendientes")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar aceptación" }).click();
  await expect(page.getByText("Aceptado", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Cobros" }).getByRole("listitem")).toHaveCount(2);
  const recs = await sql<{ amount: string; project_id: string }>("select amount, project_id from receivable where quote_id = $1 order by due_date", [id]);
  expect(recs.map((r) => r.amount)).toEqual(["213750.00", "213750.00"]);
  expect((await sql<{ stage: string }>("select stage from opportunity where id = $1", [oppId]))[0]?.stage).toBe("won");
  await expectNoHorizontalScroll(page);
  await shot(page, "presupuesto-aceptado", p);
  await page.getByRole("link", { name: "Ver proyecto" }).first().click();
  await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: `Tienda online ${p}` })).toBeVisible();
  expect(recs[0]?.project_id).toBe(page.url().split("/").pop());

  // Lista con filtro por estado
  await page.goto("/presupuestos?estado=accepted");
  await expect(page.getByText(`Tienda online ${p}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "presupuestos-lista", p);
});
