import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

/** Fecha "YYYY-MM-DD" en hora de Argentina, N días desde hoy. */
function inDaysAR(n: number) {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

test("dominio que vence en 10 días → Hoy; producto propio con instalación y versión nueva → tarea @visual", async ({ page }, info) => {
  const tag = info.project.name.replace(/[^a-z0-9]/g, "");
  const client = `Cliente Activos ${tag}`;
  const domain = `vence-${tag}.com.ar`;
  const product = `LibreríaOS ${tag}`;
  await login(page);

  // Cliente (para dominio e instalación)
  await page.goto("/crm/clientes/nuevo");
  await page.fill("#name", client);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await page.waitForURL(/\/crm\/clientes\/[0-9a-f-]{36}$/);

  // Dominio que vence en 10 días (se carga con https://www. y se normaliza)
  await page.goto("/activos/dominios");
  await page.getByRole("button", { name: "Nuevo dominio" }).first().click();
  const dd = page.getByRole("dialog", { name: "Nuevo dominio" });
  await dd.locator("#name").fill(`https://www.${domain}/`);
  await dd.locator("#clientId").selectOption({ label: client });
  await dd.locator("#expiresOn").fill(inDaysAR(10));
  await dd.getByRole("button", { name: "Agregar" }).click();
  await expect(dd).toBeHidden();
  await expect(page.getByRole("heading", { name: domain })).toBeVisible();
  await expect(page.locator(`[data-domain="${domain}"]`).getByText("vence en 10 d")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "activos-dominios", info.project.name);

  // Aparece en Hoy → Ponerse al día
  await page.goto("/hoy");
  const item = page.getByText(`Renovar dominio ${domain}`).first();
  await expect(item).toBeAttached();
  // En el celular se ven 3 ítems y "Ver N más" (se reintenta hasta que la página esté hidratada).
  await expect(async () => {
    const more = page.getByRole("button", { name: /Ver \d+ más/ });
    if (await more.isVisible()) await more.click();
    await expect(item).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // Resumen de Activos
  await page.goto("/activos");
  await expect(page.getByRole("link", { name: new RegExp(domain) })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "activos-resumen", info.project.name);

  // Producto propio + versión 1.0.0 + instalación
  await page.goto("/activos/productos");
  await page.getByRole("button", { name: /Nuevo producto|Crear el primero/ }).first().click();
  const pd = page.getByRole("dialog", { name: "Nuevo producto propio" });
  await pd.locator("#name").fill(product);
  await pd.getByRole("button", { name: "Crear" }).click();
  await page.waitForURL(/\/activos\/productos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: product })).toBeVisible();

  const addVersion = async (v: string, changelog?: string) => {
    await page.getByRole("button", { name: "Registrar versión" }).first().click();
    const vd = page.getByRole("dialog", { name: `Nueva versión de ${product}` });
    await vd.locator("#version").fill(v);
    if (changelog) await vd.locator("#changelogMd").fill(changelog);
    await vd.getByRole("button", { name: "Registrar versión" }).click();
    await expect(vd).toBeHidden();
  };
  await addVersion("1.0.0", "- Primera versión");

  await page.getByRole("button", { name: "Registrar instalación" }).first().click();
  const idl = page.getByRole("dialog", { name: "Nueva instalación" });
  await idl.locator("#clientId").selectOption({ label: client });
  await idl.getByRole("button", { name: "Registrar" }).click();
  await expect(idl).toBeHidden();
  await expect(page.locator(`[data-installation="${client}"]`).getByText("v1.0.0")).toBeVisible();

  // Versión nueva → tarea "Actualizar … en <cliente>"
  await addVersion("1.1.0", "- Factura C\n- Arreglo de redondeo");
  await expect(page.getByText(/1 tarea creada/).first()).toBeVisible();
  await expect(page.locator(`[data-installation="${client}"]`).getByText("→ v1.1.0 disponible")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "activos-producto", info.project.name);

  await page.goto(`/tareas?ver=todas&q=${encodeURIComponent(`Actualizar ${product}`)}`);
  await expect(page.getByText(`Actualizar ${product} a v1.1.0 en ${client}`).first()).toBeVisible();

  // Monitoreo (estado vacío o lista) sin desbordes
  await page.goto("/activos/monitoreo");
  await expect(page.getByRole("heading", { name: "Monitoreo de sitios" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "activos-monitoreo", info.project.name);
});
