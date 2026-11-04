import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

test("asistente de arranque con la plantilla Tienda → primera acción en Hoy @visual", async ({ page }, info) => {
  await login(page);
  await page.goto("/proyectos/nuevo");
  await page.getByText("Tienda online (WooCommerce)").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#name", `Tienda e2e ${info.project.name}`);
  await page.getByRole("radio", { name: "Personal / facultad" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#definitionOfDone", "Tienda publicada y probada");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#firstAction", `Primera acción ${info.project.name}`);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: `Tienda e2e ${info.project.name}` })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "proyecto-ficha", info.project.name);
  await page.goto(`/proyectos/${page.url().split("/").pop()}/etapas`);
  await expect(page.getByText("Checklist de lanzamiento")).toBeVisible();
  await page.goto("/tareas?ver=hoy");
  await expect(page.getByText(`Primera acción ${info.project.name}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "tareas-hoy", info.project.name);
});
