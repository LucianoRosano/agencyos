import { expect, type Page, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

/**
 * IA (F5). Nunca se llama a la API real de Anthropic: la clave de prueba es falsa y en e2e no corre el worker,
 * así que los pedidos quedan en cola y se cancelan.
 */
const FAKE_KEY = "sk-ant-api03-e2e_fake_key_never_sent_0000000000-AB12";
const PM_BUTTON = "Pedir al PM: plan de próximos pasos";

async function createProject(page: Page, name: string) {
  await page.goto("/proyectos/nuevo");
  await page.getByText("Tienda online (WooCommerce)").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#name", name);
  await page.getByRole("radio", { name: "Personal / facultad" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#definitionOfDone", "Tienda publicada");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#firstAction", "Llamar al cliente");
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/);
  return page.url();
}

test("sin clave: solo la configuración y ningún botón de agentes @visual", async ({ page }, info) => {
  await login(page);
  const url = await createProject(page, `Proyecto IA ${info.project.name}`);
  await expect(page.getByRole("heading", { name: `Proyecto IA ${info.project.name}` })).toBeVisible();
  await expect(page.getByRole("button", { name: PM_BUTTON })).toHaveCount(0);

  await page.goto("/ia");
  await expect(page.getByText("Conectar Anthropic")).toBeVisible();
  await expect(page.getByLabel("Clave de API de Anthropic")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ejecuciones" })).toHaveCount(0);
  await expect(page.getByText("Project Manager")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "ia-sin-clave", info.project.name);

  // Las rutas internas sin clave vuelven a la configuración
  await page.goto("/ia/configuracion");
  await page.waitForURL("**/ia");
  await page.goto(url);
  await expect(page.getByRole("button", { name: PM_BUTTON })).toHaveCount(0);
});

test("con clave: agentes, pedido desde la ficha (en cola), cancelar y quitar la clave @visual", async ({ page }, info) => {
  page.on("dialog", (d) => d.accept());
  await login(page);
  const url = await createProject(page, `Proyecto con IA ${info.project.name}`);

  await page.goto("/ia");
  await page.getByLabel("Clave de API de Anthropic").fill(FAKE_KEY);
  await page.getByLabel("Tope mensual (US$)").fill("5");
  await page.getByRole("button", { name: "Guardar y activar" }).click();
  await expect(page.getByRole("heading", { name: "Project Manager" })).toBeVisible();
  await expect(page.getByText("Uso del mes")).toBeVisible();
  expect(await page.content()).not.toContain(FAKE_KEY);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "ia-agentes", info.project.name);

  // Ficha del agente
  await page.goto("/ia/agentes/pm");
  await expect(page.getByLabel("Instrucciones (prompt)")).toContainText("ningún proyecto quede frenado");
  await expect(page.getByLabel("Resumen de finanzas")).toHaveCount(0); // fuera del techo del PM
  await expect(page.getByLabel("Tope por ejecución (US$)")).toHaveValue("0.20");
  await page.getByLabel("Tope mensual (US$)").fill("1.50");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Agente actualizado")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "ia-agente-pm", info.project.name);

  // Botón contextual en la ficha del proyecto → ejecución en cola
  await page.goto(url);
  await page.getByRole("button", { name: PM_BUTTON }).click();
  await page.waitForURL(/\/ia\/ejecuciones\/[0-9a-f-]{36}$/);
  await expect(page.getByText("En cola", { exact: true })).toBeVisible();
  await expect(page.getByText(`Proyecto con IA ${info.project.name}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "ia-ejecucion", info.project.name);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();

  await page.goto("/ia/ejecuciones");
  await expect(page.getByText("Armá un plan de próximos pasos para este proyecto.").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "ia-ejecuciones", info.project.name);

  // Configuración: la clave nunca vuelve al navegador
  await page.goto("/ia/configuracion");
  await expect(page.getByText("…AB12")).toBeVisible();
  expect(await page.content()).not.toContain(FAKE_KEY);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "ia-configuracion", info.project.name);
  await page.getByRole("button", { name: "Quitar clave" }).click();
  await page.waitForURL("**/ia");
  await expect(page.getByText("Conectar Anthropic")).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole("button", { name: PM_BUTTON })).toHaveCount(0);
});
