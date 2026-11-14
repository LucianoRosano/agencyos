import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

test("etiquetas, comentarios, conexiones y vistas guardadas en proyectos @visual", async ({ page }, info) => {
  await login(page);
  const suffix = info.project.name;
  // proyecto vía asistente rápido
  await page.goto("/proyectos/nuevo");
  await page.getByText("Tienda online (WooCommerce)").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#name", `Colab ${suffix}`);
  await page.getByRole("radio", { name: "Personal / facultad" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#definitionOfDone", "Listo");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#firstAction", `Acción colab ${suffix}`);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();

  // etiqueta nueva
  const tags = page.getByTestId("entity-tags");
  await tags.getByRole("button", { name: "Etiqueta" }).click();
  const tagName = `e2e${suffix.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`;
  await page.getByLabel("Buscar o crear etiqueta").fill(tagName);
  await page.getByRole("button", { name: `Crear #${tagName.toLowerCase()}` }).click();
  await expect(tags.getByText(`#${tagName}`, { exact: false }).first()).toBeVisible();

  // comentario
  const comments = page.getByTestId("entity-comments");
  await comments.getByLabel("Nuevo comentario").fill("Pedir fotos al cliente");
  await comments.getByRole("button", { name: "Comentar" }).click();
  await expect(comments.getByText("Pedir fotos al cliente")).toBeVisible();

  // conexión con otra entidad (la tarea creada por el asistente)
  const conns = page.getByTestId("entity-connections");
  await conns.getByRole("button", { name: "Conectar" }).click();
  await page.getByLabel("Buscar para conectar").fill(`Acción colab ${suffix}`);
  await conns
    .getByRole("button", { name: new RegExp(`Acción colab ${suffix}`) })
    .first()
    .click();
  await expect(conns.getByRole("link", { name: new RegExp(`Acción colab ${suffix}`) })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "colaboracion-ficha", info.project.name);
  await expectAccessible(page);

  // filtro por etiqueta y vista guardada
  await page.goto("/proyectos?estado=activos");
  await page
    .getByRole("navigation", { name: "Filtrar por etiqueta" })
    .getByRole("link", { name: new RegExp(tagName, "i") })
    .click();
  await expect(page.getByText(`Colab ${suffix}`).first()).toBeVisible();
  // la etiqueta se ve en la tarjeta del proyecto
  await expect(page.getByRole("link", { name: new RegExp(`Colab ${suffix}`) }).getByText(new RegExp(`#${tagName}`, "i"))).toBeVisible();
  page.once("dialog", (d) => d.accept(`Vista ${suffix}`));
  await page.getByRole("button", { name: "Guardar vista" }).click();
  await expect(page.getByRole("link", { name: `Vista ${suffix}` })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "proyectos-etiquetas", info.project.name);
  expect(projectUrl).toContain("/proyectos/");
});
