import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

test("SaaS para comercios: alta desde AGENCYOS → dueño crea su cuenta → productos → venta → estadísticas @visual", async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  const shopName = `Librería ${tag}`;
  await login(page);

  // Agencia: alta del comercio con invitación para el dueño
  await page.goto("/comercios");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nuevo comercio" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo comercio" });
  await dlg.locator("#name").fill(shopName);
  await dlg.locator("#ownerName").fill("Ana Dueña");
  await dlg.locator("#ownerEmail").fill(`ana-${tag}@libreria.test`);
  await dlg.getByRole("button", { name: "Crear comercio" }).click();
  const link = ((await dlg.getByTestId("shop-invite-link").textContent()) ?? "").trim();
  expect(link).toMatch(/\/comercio\/invitacion\//);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("shop-admin-list")).toContainText(shopName);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);

  // Dueña del comercio, en otro navegador
  const ctx = await browser.newContext({ ...info.project.use });
  const shop = await ctx.newPage();
  await shop.goto(new URL(link).pathname);
  await expect(shop.getByRole("heading", { name: shopName })).toBeVisible();
  await shop.locator("#password").fill("ContraseñaDelLocal-2026");
  await shop.locator("#password2").fill("ContraseñaDelLocal-2026");
  await shop.getByRole("button", { name: "Crear mi cuenta y entrar" }).click();
  await shop.waitForURL("**/comercio");
  await expect(shop.getByRole("heading", { name: /Hola, Ana/ })).toBeVisible();

  // Catálogo
  await shop.goto("/comercio/productos");
  await shop.waitForLoadState("networkidle");
  for (const [name, price, stock, min] of [
    [`Cuaderno A4 ${tag}`, "3.500", "10", "3"],
    [`Lápiz negro ${tag}`, "500", "2", "5"],
  ]) {
    await shop.getByRole("button", { name: "Nuevo producto" }).click();
    const pd = shop.getByRole("dialog", { name: "Nuevo producto" });
    await pd.locator("#name").fill(name);
    await pd.locator("#price").fill(price);
    await pd.locator("#stock").fill(stock);
    await pd.locator("#minStock").fill(min);
    await pd.getByRole("button", { name: "Guardar" }).click();
    await expect(pd).toBeHidden();
  }
  await expect(shop.getByTestId("product-list")).toContainText(`Cuaderno A4 ${tag}`);

  // Venta en el mostrador
  await shop.goto("/comercio/vender");
  await shop.waitForLoadState("networkidle");
  await shop.locator("#pos-q").fill("Cuaderno");
  await shop.getByRole("button", { name: new RegExp(`Cuaderno A4 ${tag}`) }).click();
  await shop.getByRole("button", { name: `Uno más de Cuaderno A4 ${tag}` }).click();
  await expect(shop.getByTestId("pos-total")).toHaveText("$ 7.000");
  await expectNoHorizontalScroll(shop);
  await expectAccessible(shop);
  await shot(shop, "comercio-vender", info.project.name);
  await shop.getByRole("button", { name: "Cobrar" }).click();
  await expect(shop.getByText("Venta n.º 1 registrada")).toBeVisible();

  // Estadísticas y stock bajo
  await shop.goto("/comercio");
  await expect(shop.getByText("$ 7.000").first()).toBeVisible();
  await expect(shop.getByTestId("low-stock")).toContainText(`Lápiz negro ${tag}`);
  await expectNoHorizontalScroll(shop);
  await expectAccessible(shop);
  await shot(shop, "comercio-inicio", info.project.name);
  await shop.goto("/comercio/ventas");
  await expect(shop.getByTestId("sales-list")).toContainText("n.º 1");
  // Comprobante de venta en PDF desde la ficha de la venta
  await shop.getByTestId("sales-list").getByRole("link").filter({ hasText: "n.º 1" }).first().click();
  const comprobante = shop.getByRole("link", { name: "Comprobante" });
  await expect(comprobante).toBeVisible();
  const pdf = await shop.request.get((await comprobante.getAttribute("href")) ?? "");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const ticket = await shop.request.get(`${(await comprobante.getAttribute("href")) ?? ""}?formato=ticket80`);
  expect(ticket.status()).toBe(200);
  expect(ticket.headers()["content-disposition"]).toContain("-ticket.pdf");
  // Cierre de caja del día
  await shop.goto("/comercio/caja");
  await expect(shop.getByTestId("cash-kpis")).toContainText("$ 7.000");
  await expect(shop.getByTestId("cash-payments")).toContainText("Efectivo");
  await expectNoHorizontalScroll(shop);
  await expectAccessible(shop);
  await shot(shop, "comercio-caja", info.project.name);
  const cierre = await shop.request.get((await shop.getByRole("link", { name: "Imprimir cierre" }).getAttribute("href")) ?? "");
  expect(cierre.headers()["content-type"]).toContain("application/pdf");
  // Importar productos por CSV (vista previa → importar) y exportarlos
  await shop.goto("/comercio/productos/importar");
  await shop
    .getByTestId("product-import")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "lista.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`Nombre;Código;Precio;Stock\nGoma de borrar ${tag};GOM-${tag};$ 900;12\n`),
    });
  await expect(shop.getByText(/1\s*nuevos/)).toBeVisible();
  await expectNoHorizontalScroll(shop);
  await expectAccessible(shop);
  await shot(shop, "comercio-importar", info.project.name);
  await shop.getByRole("button", { name: "Importar 1" }).click();
  await expect(shop.getByText(/1 productos nuevos/)).toBeVisible();
  const csvOut = await shop.request.get("/comercio/productos/exportar");
  expect(await csvOut.text()).toContain(`Goma de borrar ${tag}`);
  await shop.goto("/comercio/reportes");
  await expect(shop.getByTestId("report-current")).toContainText("$ 7.000");
  await ctx.close();

  // De vuelta en la agencia: la actividad del comercio
  await page.goto("/comercios");
  await expect(page.getByTestId("shop-admin-list").getByRole("listitem").filter({ hasText: shopName })).toContainText("1 ventas este mes");
});
