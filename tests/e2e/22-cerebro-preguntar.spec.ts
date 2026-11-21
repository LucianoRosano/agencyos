import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

test("Cerebro: preguntar encuentra la nota con su fuente; relacionado en la nota @visual", async ({ page }, info) => {
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  const title = `Acuerdo de envíos ${tag}`;
  await login(page);
  // Dos notas sobre lo mismo, creadas por la API de sincronización (la misma que usa el modo sin conexión)
  const noteId = randomUUID();
  const res = await page.request.post("/api/sync", {
    headers: { "content-type": "application/json" },
    data: {
      mutations: [
        {
          id: randomUUID(),
          type: "note.create",
          entityId: noteId,
          data: { title, bodyMd: `Quedamos con el cliente ${tag} en despachar con Andreani los martes y jueves. El costo lo paga el comprador.` },
        },
        {
          id: randomUUID(),
          type: "note.create",
          entityId: randomUUID(),
          data: { title: `Cotizaciones de correo ${tag}`, bodyMd: `Andreani cotizó más barato que el correo para paquetes chicos (${tag}).` },
        },
      ],
    },
  });
  expect(res.ok()).toBe(true);
  expect((await res.json()).results.map((r: { status: string }) => r.status)).toEqual(["applied", "applied"]);

  await page.goto("/cerebro/preguntar");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Indexar ahora" }).click();
  await expect(page.getByText("Cerebro al día")).toBeVisible({ timeout: 20_000 });
  await page.locator("#brain-q").fill(`¿Qué quedamos con ${tag} sobre los envíos?`);
  await page.getByRole("button", { name: "Preguntar" }).click();
  await expect(page.getByTestId("brain-lead")).toContainText("Andreani");
  await expect(page.getByTestId("brain-hit").first()).toContainText(tag);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "cerebro-preguntar", info.project.name);

  // En la nota: lo relacionado (la otra nota sobre Andreani)
  await page.goto(`/notas/${noteId}`);
  await expect(page.getByTestId("brain-related")).toContainText(`Cotizaciones de correo ${tag}`);

  // Desde el grafo se llega a Preguntar
  await page.goto("/cerebro");
  await expect(page.getByRole("link", { name: "Preguntar" })).toHaveAttribute("href", "/cerebro/preguntar");
});
