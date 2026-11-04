import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Bandeja → procesar → tarea con fecha → aparece en Hoy → completarla @visual", async ({ page }, info) => {
  const text = `Llamar a Sofía por el panel ${info.project.name}`;
  await login(page);
  await page.keyboard.press("c").catch(() => undefined);
  if (
    !(await page
      .getByRole("dialog", { name: "Capturar" })
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByRole("button", { name: "Capturar" }).first().click();
  }
  await page.getByPlaceholder("Una tarea, una idea, un gasto, un link…").fill(text);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Guardado en la Bandeja")).toBeVisible();
  await page.goto("/bandeja");
  await expect(page.getByText(text)).toBeVisible();
  await page.getByRole("link", { name: /Procesar/ }).click();
  // procesar hasta encontrar el nuestro
  for (let i = 0; i < 10; i++) {
    if (await page.getByText(text, { exact: true }).isVisible()) break;
    await page.getByRole("button", { name: "Saltear →" }).click();
  }
  await page.getByRole("button", { name: "Tarea", exact: true }).click();
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByText("Convertido en tarea")).toBeVisible();
  await page.goto("/hoy");
  await expect(page.getByRole("heading", { name: /Buen(os|as)? (día|tardes|noches), Luciano/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "hoy", info.project.name);
  await expectAccessible(page);
  await page.goto("/tareas?ver=hoy");
  const row = page.getByRole("listitem").filter({ hasText: text });
  await row.getByRole("checkbox").click();
  await expect(page.getByText("Tarea completada")).toBeVisible();
});

test("paleta Ctrl+K: buscar con y sin tildes, crear desde la paleta", async ({ page }, info) => {
  await login(page);
  await page.goto("/hoy");
  const title = `Revisión del catálogo ${info.project.name}`;
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder(/Buscar clientes, proyectos/);
  await input.fill(title);
  await page.getByRole("option", { name: new RegExp(`Crear tarea para hoy: «${title}»`) }).click();
  await expect(page.getByText("Tarea creada para hoy")).toBeVisible();
  await page.keyboard.press("Control+k");
  // con tildes
  await input.fill("Revisión del catálogo");
  await expect(page.getByRole("option", { name: new RegExp(`${title}.*tarea$`) })).toBeVisible();
  // sin tildes y en minúsculas
  await input.fill("revision del catalogo");
  await expect(page.getByRole("option", { name: new RegExp(`${title}.*tarea$`) })).toBeVisible();
  // con un error leve de tipeo
  await input.fill("revisoin del catalogo");
  await expect(page.getByRole("option", { name: new RegExp(`${title}.*tarea$`) })).toBeVisible();
  await page.getByRole("option", { name: new RegExp(`${title}.*tarea$`) }).click();
  await expect(page).toHaveURL(/\/tareas\/[0-9a-f-]{36}$/);
});

test("papelera: eliminar → deshacer; eliminar → restaurar", async ({ page }, info) => {
  await login(page);
  await page.goto("/tareas?ver=hoy");
  await page.getByRole("link", { name: new RegExp(`Revisión del catálogo ${info.project.name}`) }).click();
  await page.getByRole("button", { name: "Más acciones" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("menuitem", { name: "Eliminar" }).click();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText("Deshecho")).toBeVisible();
  await page.goto("/tareas?ver=hoy");
  await expect(page.getByText(`Revisión del catálogo ${info.project.name}`)).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`Revisión del catálogo ${info.project.name}`) }).click();
  await page.getByRole("button", { name: "Más acciones" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("menuitem", { name: "Eliminar" }).click();
  await page.waitForURL("**/tareas");
  await page.goto("/papelera");
  const item = page
    .locator("div")
    .filter({ hasText: `Revisión del catálogo ${info.project.name}` })
    .filter({ has: page.getByRole("button", { name: "Restaurar" }) })
    .last();
  await item.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Restaurado")).toBeVisible();
  await page.goto("/tareas?ver=hoy");
  await expect(page.getByText(`Revisión del catálogo ${info.project.name}`)).toBeVisible();
});

test("MCP: token de alcance limitado → crear_tarea funciona y eliminar es rechazado", async ({ page, request }, info) => {
  await login(page);
  await page.goto("/configuracion/integraciones");
  await page.getByLabel("Nombre").fill(`Claude e2e ${info.project.name}`);
  await page.getByLabel("Confirmá tu contraseña").fill("ContraseñaSegura2026!");
  await page.getByRole("button", { name: "Crear token" }).click();
  const token = (await page.locator("code").filter({ hasText: /^ag_/ }).first().textContent())?.trim() ?? "";
  expect(token.startsWith("ag_")).toBe(true);
  await expectNoHorizontalScroll(page);
  const call = (name: string, args: Record<string, unknown>) =>
    request.post("/mcp", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    });
  const init = await request.post("/mcp", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } },
    },
  });
  expect(init.ok()).toBe(true);
  const ok = await call("crear_tarea", { titulo: `Tarea MCP ${info.project.name}` });
  const okBody = await ok.json();
  expect(okBody.result.isError ?? false).toBe(false);
  const no = await call("eliminar_elemento", { tipo: "project", id: "00000000-0000-7000-8000-000000000000" });
  expect((await no.json()).result.isError).toBe(true);
  const unauth = await request.post("/mcp", { headers: { authorization: "Bearer ag_falso", "content-type": "application/json" }, data: {} });
  expect(unauth.status()).toBe(401);
  await page.goto("/configuracion/actividad?ver=auditoria");
  await expect(page.getByText("Claude: acción rechazada").first()).toBeVisible();
});

test("pantallas del núcleo sin scroll horizontal y accesibles @visual", async ({ page }, info) => {
  await login(page);
  for (const path of [
    "/hoy",
    "/negocio",
    "/bandeja",
    "/proyectos",
    "/tareas",
    "/espacios",
    "/papelera",
    "/aprobaciones",
    "/notificaciones",
    "/foco",
    "/configuracion",
    "/configuracion/seguridad",
    "/configuracion/integraciones",
    "/configuracion/estado",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalScroll(page);
    if (["/hoy", "/negocio", "/proyectos", "/configuracion"].includes(path)) await shot(page, path.slice(1).replace(/\//g, "-") || "raiz", info.project.name);
  }
  await expectAccessible(page);
});
