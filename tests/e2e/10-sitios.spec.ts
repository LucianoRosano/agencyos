import { expect, test } from "@playwright/test";
import pg from "pg";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

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

/** Cliente y proyecto Tienda de prueba (CRM y Proyectos no son parte de este módulo; datos SOLO de test). */
async function seedStoreProject(project: string) {
  const [ws] = await sql<{ id: string }>("select id from workspace order by created_at limit 1");
  const [space] = await sql<{ id: string }>("select id from space where workspace_id = $1 order by sort limit 1", [ws?.id]);
  const [c] = await sql<{ id: string }>("insert into client (id, workspace_id, name, status) values (gen_random_uuid(), $1, $2, 'active') returning id", [
    ws?.id,
    `Librería e2e ${project}`,
  ]);
  const [p] = await sql<{ id: string }>(
    "insert into project (id, workspace_id, space_id, client_id, name, kind, status) values (gen_random_uuid(), $1, $2, $3, $4, 'store', 'planning') returning id",
    [ws?.id, space?.id, c?.id, `Tienda online ${project}`],
  );
  return { clientId: c?.id as string, projectId: p?.id as string };
}

test("sitio para cliente: proyecto Tienda → crear sitio → briefing → preguntas → estructura → contenido → R1 → checklist @visual", async ({ page }, info) => {
  test.setTimeout(240_000);
  const p = info.project.name;
  page.on("dialog", (d) => void d.accept());
  await login(page);
  const { projectId } = await seedStoreProject(p);

  // Proyecto Tienda → «Crear sitio» (precarga cliente y proyecto)
  await page.goto(`/proyectos/${projectId}`);
  await page.getByRole("link", { name: "Crear sitio" }).click();
  await page.waitForURL(/\/sitios\/nuevo\?proyecto=/);
  await expect(page.locator("#name")).toHaveValue(`Tienda online ${p}`);
  await expect(page.locator("#kind")).toHaveValue("store");
  await expect(page.locator("#clientId option:checked")).toHaveText(`Librería e2e ${p}`);
  await page.fill("#stagingUrl", "pruebas.libreria-e2e.com.ar");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Crear sitio" }).click();
  await page.waitForURL(/\/sitios\/[0-9a-f-]{36}$/);
  const siteUrl = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: `Tienda online ${p}` })).toBeVisible();

  // Briefing
  await page.fill("#goal_main", "Vender útiles y juguetes online en San Miguel");
  await page.locator('input[name="payment_methods[]"][value="Mercado Pago"]').check();
  await page.getByRole("button", { name: "Guardar briefing" }).click();
  await expect(page.getByText("Briefing guardado")).toBeVisible();

  // Lista única de preguntas: solo lo que falta
  await page.getByRole("button", { name: "Generar desde lo que falta" }).click();
  await expect(page.getByText("Preguntas generadas desde el briefing")).toBeVisible();
  const questions = page.locator("#questions");
  await expect(questions).toContainText("¿Cómo vas a enviar los pedidos?");
  await expect(questions).not.toContainText("objetivo principal");
  await expect(questions).not.toContainText("medios de pago querés ofrecer");
  const pdf = await page.request.get(`${siteUrl}/briefing-pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await page.reload();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "sitio-briefing", p);

  // Estructura desde la plantilla Tienda
  await page.goto(`${siteUrl}/estructura`);
  await expect(page.getByText("Todavía no hay estructura")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Plantilla de estructura" })).toHaveValue("store");
  await page.getByRole("button", { name: "Generar desde plantilla" }).click();
  await expect(page.getByText("v1", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Páginas del sitio" }).getByText("Carrito y checkout")).toBeVisible();

  // Contenidos: un slot aprobado
  await page.goto(`${siteUrl}/contenidos`);
  await page.getByRole("combobox", { name: "Estado de «Título principal»" }).selectOption("approved");
  await expect(page.getByText("«Título principal»: aprobado")).toBeVisible();

  await page.goto(`${siteUrl}/estructura`);
  await expect(page.locator("li").filter({ hasText: "Título principal" }).getByText("Aprobado")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "sitio-estructura", p);

  // Revisiones: R1 con un ítem; no cierra con el ítem abierto; resuelto sí
  await page.goto(`${siteUrl}/revisiones`);
  await page.getByRole("button", { name: "Abrir ronda R1" }).click();
  await expect(page.getByText("Ronda R1 abierta")).toBeVisible();
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await page.fill("#description", "Cambiar la foto del hero por una del local");
  await page.fill("#pageRef", "Inicio");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByText("Ítem agregado")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar R1" }).click();
  await expect(page.getByText(/queda 1 ítem abierto/)).toBeVisible();
  await page.getByRole("combobox", { name: "Estado del ítem" }).selectOption("resolved");
  await expect(page.getByText("Ítem: resuelto")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar R1" }).click();
  await expect(page.getByText("Ronda R1 cerrada")).toBeVisible();
  await expect(page.getByText("Cerrada", { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "sitio-revisiones", p);

  // Publicación: 17 áreas; publicar con críticos pendientes pide confirmación
  await page.goto(`${siteUrl}/publicacion`);
  await expect(page.locator("details")).toHaveCount(17);
  const first = page.getByRole("group", { name: /Estado de «Indexación habilitada/ });
  await first.getByRole("button", { name: "Hecho" }).click();
  await expect(page.getByText(/^Hecho: Indexación habilitada/)).toBeVisible();
  await page.getByRole("combobox", { name: "Estado de publicación" }).last().selectOption("live");
  await expect(page.getByText("Estado: publicado")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "sitio-publicacion", p);

  // Lista con filtros
  await page.goto("/sitios?estado=live");
  await expect(page.getByRole("heading", { name: `Tienda online ${p}` })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "sitios-lista", p);
});
