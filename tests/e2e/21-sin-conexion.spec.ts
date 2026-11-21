import { expect, type Page, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

/** Espera a que el service worker controle la página (en el primer acceso se activa y toma control). */
async function swReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
}

test("sin conexión: copia en el dispositivo → usar sin internet → al volver se sube todo @visual", async ({ page, context }, info) => {
  test.setTimeout(180_000);
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  const title = `Llamar al proveedor ${tag}`;
  await login(page);

  // Una tarea creada con conexión, para encontrarla después sin internet
  await page.goto("/tareas?nueva=1");
  await page.locator("#title").fill(title);
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByText(/Tarea creada/)).toBeVisible();

  // Configuración → App: copia guardada en el dispositivo
  await page.goto("/configuracion/app");
  await swReady(page);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sincronizar ahora" }).click();
  await expect(page.getByText("Copia actualizada")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("offline-stats")).toContainText("tareas");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "configuracion-app", info.project.name);
  // /local queda guardada para abrir sin conexión
  await page.goto("/local");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => navigator.serviceWorker.controller?.postMessage({ type: "refresh-local" }));
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          caches.has("agencyos-local").then((h) =>
            h
              ? caches
                  .open("agencyos-local")
                  .then((c) => c.match("/local"))
                  .then(Boolean)
              : false,
          ),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);

  // Sin internet: las pantallas de la app abren la versión sin conexión con la copia
  await context.setOffline(true);
  await page.goto("/tareas");
  await expect(page).toHaveURL(/\/local\?ver=tareas/);
  await expect(page.getByRole("status").filter({ hasText: "Sin conexión" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("checkbox").check();
  await expect(page.getByTestId("local-status")).toContainText("1 cambio por subir");
  // Tarea nueva con fecha escrita
  await page.locator("#local-new-task").fill(`Comprar tóner ${tag} mañana`);
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Comprar tóner ${tag}` })).toBeVisible();
  // Bandeja
  await page.getByRole("button", { name: "Bandeja" }).click();
  await page.locator("#local-capture").fill(`Captura en el subte ${tag}`);
  await page.getByRole("button", { name: "Guardar en la Bandeja" }).click();
  await expect(page.getByText(`Captura en el subte ${tag}`)).toBeVisible();
  // Nota nueva
  await page.getByRole("button", { name: "Notas" }).click();
  await page.locator("#local-note-new").fill(`Apuntes offline ${tag}`);
  await page.getByRole("button", { name: "Nota", exact: true }).click();
  await page.locator("#local-note-body").fill("Escrito en el colectivo, sin señal.");
  await expect(page.getByText("Guardado en el dispositivo")).toBeVisible();
  await page.locator("main").getByRole("button", { name: "Notas", exact: true }).click();
  await expectNoHorizontalScroll(page);
  await shot(page, "sin-conexion", info.project.name);

  // Vuelve la conexión: se sube todo solo
  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "Con conexión" })).toBeVisible();
  await expect(page.getByTestId("local-status")).not.toContainText("por subir", { timeout: 20_000 });
  await expectAccessible(page);

  await page.goto(`/tareas?ver=completadas&q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title)).toBeVisible();
  await page.goto(`/tareas?ver=proximas&q=${encodeURIComponent(`Comprar tóner ${tag}`)}`);
  await expect(page.getByText(`Comprar tóner ${tag}`)).toBeVisible();
  await page.goto("/bandeja");
  await expect(page.getByText(`Captura en el subte ${tag}`)).toBeVisible();
  await page.goto(`/notas?q=${encodeURIComponent(`Apuntes offline ${tag}`)}`);
  await expect(page.getByText(`Apuntes offline ${tag}`).first()).toBeVisible();
});
