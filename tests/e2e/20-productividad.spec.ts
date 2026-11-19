import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

test("fechas en lenguaje natural: paleta y formulario de tarea", async ({ page }, info) => {
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  await login(page);
  // Paleta: «mañana 10hs» → tarea para mañana a las 10
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder(/Buscar clientes, proyectos/);
  await input.fill(`Llamar a Bruno ${tag} mañana 10hs`);
  const create = page.getByRole("option", { name: new RegExp(`Crear tarea «Llamar a Bruno ${tag}» para`) });
  await expect(create).toBeVisible();
  await create.click();
  await expect(page.getByText(/Tarea creada para/)).toBeVisible();
  await page.goto("/tareas?ver=proximas");
  await expect(page.getByText(`Llamar a Bruno ${tag}`, { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: `Llamar a Bruno ${tag}` })
      .getByText(/mañana 10:00/),
  ).toBeVisible();

  // Carga de la semana: la tarea de mañana (sin estimar) aparece en la franja
  await expect(page.getByTestId("week-load")).toBeVisible();
  await expect(page.getByTestId("week-load").getByText(/s\/e/).first()).toBeVisible();

  // Formulario: al salir del título completa fecha y hora
  await page.goto("/tareas?nueva=1");
  const title = page.locator("#title");
  await title.fill(`Revisar contrato ${tag} el viernes a las 18:30`);
  await page.locator("#dueDate").focus();
  await expect(title).toHaveValue(`Revisar contrato ${tag}`);
  await expect(page.locator("#dueTime")).toHaveValue("18:30");
  await expect(page.locator("#dueDate")).not.toHaveValue("");
  await expect(page.getByText(/Fecha tomada del título: viernes/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("compartir desde el celular (Web Share Target) → Bandeja", async ({ page }, info) => {
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  await login(page);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.share_target.action).toBe("/compartir");
  await page.goto(
    `/compartir?title=${encodeURIComponent(`Artículo ${tag}`)}&text=${encodeURIComponent("Mirá esto")}&url=${encodeURIComponent("https://example.com/nota")}`,
  );
  const area = page.locator("#share-text");
  await expect(area).toHaveValue(`Artículo ${tag}\nMirá esto\nhttps://example.com/nota`);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Guardar en la Bandeja" }).click();
  await page.waitForURL("**/bandeja");
  await expect(page.getByText(`Artículo ${tag}`).first()).toBeVisible();
});

test("importar clientes desde CSV con vista previa @visual", async ({ page }, info) => {
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  await login(page);
  await page.goto("/configuracion/datos");
  const panel = page.getByTestId("import-panel");
  await page.waitForLoadState("networkidle");
  const csv = `Nombre;Rubro;Ciudad;Email\nImport Uno ${tag};Panadería;San Miguel;uno-${tag}@ejemplo.com\nImport Dos ${tag};Librería;;\n;sin nombre;;`;
  await panel.locator('input[type="file"]').setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await panel.getByRole("button", { name: "Vista previa" }).click();
  await expect(panel.getByText(/2 para crear/)).toBeVisible();
  await expect(panel.getByText("Falta el nombre")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "importar-csv", info.project.name);
  await panel.getByRole("button", { name: "Importar 2" }).click();
  await expect(page.getByText(/Importación lista: 2 clientes creados/)).toBeVisible();
  await page.goto(`/crm/clientes?q=${encodeURIComponent(`Import Uno ${tag}`)}`);
  await expect(page.getByRole("link", { name: `Import Uno ${tag}` }).first()).toBeVisible();
});

test("abonos mensuales: crear, ingreso recurrente y menú @visual", async ({ page }, info) => {
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  await login(page);
  // cliente para el abono
  await page.goto("/crm/clientes/nuevo");
  await page.fill("#name", `Abonado ${tag}`);
  await page.getByRole("button", { name: /Crear cliente|Guardar/ }).click();
  await page.waitForURL(/\/crm\/clientes\/[0-9a-f-]{36}/);
  await page.goto("/finanzas/abonos");
  await page
    .getByRole("button", { name: /Nuevo abono|Crear el primero/ })
    .first()
    .click();
  const dlg = page.getByRole("dialog", { name: "Nuevo abono mensual" });
  await dlg.locator("#clientId").selectOption({ label: `Abonado ${tag}` });
  await dlg.locator("#concept").fill(`Mantenimiento ${tag}`);
  await dlg.locator("#amount").fill("45.000");
  await dlg.locator("#hoursIncluded").fill("5");
  await dlg.getByRole("button", { name: "Crear abono" }).click();
  await expect(dlg).toBeHidden();
  const card = page.locator(`[data-retainer="Mantenimiento ${tag}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText("$ 45.000,00")).toBeVisible();
  await expect(card.getByText(/Horas del mes/)).toBeVisible();
  await expect(page.getByTestId("mrr")).toContainText("ARS / mes");
  await expectNoHorizontalScroll(page);
  await shot(page, "abonos", info.project.name);
  await card.getByRole("button", { name: `Acciones de Mantenimiento ${tag}` }).click();
  await page.getByRole("menuitem", { name: "Pausar" }).click();
  await expect(page.getByText(/Abono en pausa/)).toBeVisible();
});
