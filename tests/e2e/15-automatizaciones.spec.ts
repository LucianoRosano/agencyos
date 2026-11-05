import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

const sign = (secret: string, body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

test("regla desde plantilla → evento desde la UI → prueba y ejecución registrada @visual", async ({ page }, info) => {
  const p = info.project.name;
  await login(page);

  await page.goto("/automatizaciones");
  await expect(page.getByRole("heading", { name: "Automatizaciones" })).toBeVisible();
  await expect(page.getByText("Plantillas", { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "automatizaciones-lista", p);

  // regla desde plantilla (se revisa en el constructor antes de guardar)
  await page.getByRole("link", { name: /Proyecto creado → tarea de preparación/ }).click();
  await page.waitForURL(/\/automatizaciones\/nueva\?plantilla=proyecto-creado-preparar/);
  await expect(page.locator("#rule-event")).toHaveValue("proyecto.creado");
  await expect(page.locator("#act-0-title")).toHaveValue("Preparar carpeta y accesos de {{proyecto.nombre}}");
  await page.fill("#rule-name", `Preparar ${p}`);
  await expectNoHorizontalScroll(page);
  await shot(page, "automatizaciones-constructor", p);
  await page.getByRole("button", { name: "Guardar regla" }).click();
  await page.waitForURL(/\/automatizaciones\/[0-9a-f-]{36}$/);
  const ruleUrl = page.url();
  await expect(page.getByRole("heading", { name: `Preparar ${p}` })).toBeVisible();
  await expect(page.getByText("Todavía no se ejecutó")).toBeVisible();

  // el evento ocurre desde la UI: un proyecto nuevo con el asistente
  await page.goto("/proyectos/nuevo");
  await page.getByText("Tienda online (WooCommerce)").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#name", `Auto ${p}`);
  await page.getByRole("radio", { name: "Personal / facultad" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#definitionOfDone", "Publicada");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#firstAction", `Arrancar ${p}`);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/);

  // modo prueba: simula con el último evento real, sin escribir
  await page.goto(ruleUrl);
  await page.getByRole("button", { name: "Probar con el último evento real" }).click();
  const preview = page.getByTestId("preview");
  await expect(preview.getByText(`Crearía la tarea «Preparar carpeta y accesos de Auto ${p}» en «Auto ${p}»`)).toBeVisible();
  await expect(page.getByText("Todavía no se ejecutó")).toBeVisible();

  // ejecución real con el último evento → queda en el registro
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Ejecutar con el último evento" }).click();
  const runs = page.getByTestId("runs");
  await expect(runs.getByText("Correcta")).toBeVisible();
  await runs.getByText("Proyecto creado").first().click();
  await expect(runs.getByText(`Creó la tarea «Preparar carpeta y accesos de Auto ${p}» en «Auto ${p}»`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "automatizacion-ficha", p);

  await page.goto("/automatizaciones");
  await expect(page.getByRole("link", { name: new RegExp(`Preparar ${p}`) })).toBeVisible();

  // pausar desde la lista (con Deshacer)
  await page.getByRole("button", { name: `Pausar «Preparar ${p}»` }).click();
  await expect(page.getByRole("button", { name: `Activar «Preparar ${p}»` })).toBeVisible();
});

test("webhook entrante: secreto una sola vez, firma válida, repetida e inválida @visual", async ({ page }, info) => {
  const p = info.project.name;
  await login(page);
  await page.goto("/automatizaciones/webhooks");
  await expect(page.getByRole("heading", { name: "Webhooks" })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo webhook" }).first().click();
  await page.fill("#name", `Formulario ${p}`);
  await page.getByRole("button", { name: "Crear" }).click();
  const secret = (await page.getByTestId("webhook-secret").textContent())?.trim() ?? "";
  const url = (await page.getByTestId("webhook-url").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^whsec_/);
  expect(url).toMatch(/\/api\/webhooks\/in\/[0-9a-f-]{36}$/);
  await expectNoHorizontalScroll(page);
  await shot(page, "webhook-secreto", p);
  await page.getByRole("button", { name: "Listo, lo guardé" }).click();

  const body = JSON.stringify({ tipo: "consulta", nombre: `Marta ${p}` });
  const sig = sign(secret, body);
  const ok = await page.request.post(url, { data: body, headers: { "content-type": "application/json", "x-agencyos-signature": sig } });
  expect(ok.status()).toBe(202);
  const again = await page.request.post(url, { data: body, headers: { "content-type": "application/json", "x-agencyos-signature": sig } });
  expect(again.status()).toBe(409);
  const bad = await page.request.post(url, { data: body, headers: { "content-type": "application/json", "x-agencyos-signature": sign("otro", body) } });
  expect(bad.status()).toBe(401);
  const stale = await page.request.post(url, {
    data: body,
    headers: { "content-type": "application/json", "x-agencyos-signature": sign(secret, body, Math.floor(Date.now() / 1000) - 600) },
  });
  expect(stale.status()).toBe(401);

  await page.reload();
  await expect(page.getByText(`Formulario ${p}`)).toBeVisible();
  await expect(page.getByText(/1 entrega · última/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "webhooks", p);
});
