import { deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
/** PNG RGB sólido (color distinto por proyecto para no deduplicar entre corridas). */
function makePng(w: number, h: number, rgb: [number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const seed = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 200, 7);

async function upload(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.locator('input[type="file"]').first().setInputFiles(files);
}

test("biblioteca: subir PNG y PDF → miniatura → nueva versión → adjuntar a una tarea → descargar @visual", async ({ page }, info) => {
  test.setTimeout(120_000);
  const p = slug(info.project.name);
  const n = seed(p);
  const png = `logo-${p}.png`;
  const pdf = `brief-${p}.pdf`;
  await login(page);
  await page.goto("/biblioteca");
  await expect(page.getByRole("heading", { name: "Biblioteca" })).toBeVisible();
  await upload(page, [
    { name: png, mimeType: "image/png", buffer: makePng(320, 200, [250, 146 - (n % 40), 60]) },
    { name: pdf, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% brief ${p}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`) },
  ]);
  await expect(page.getByText("2 archivos subidos")).toBeVisible({ timeout: 20_000 });

  // miniatura WebP visible (cargada de verdad) en la grilla
  const card = page.locator(`[data-file="${png}"]`).first();
  await expect(card).toBeVisible();
  const img = card.locator("img");
  await expect(img).toHaveAttribute("src", /thumb=1.*sig=/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(`[data-file="${pdf}"]`).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "biblioteca", info.project.name);
  await expectAccessible(page);

  // vista de lista
  await page.getByRole("link", { name: "Lista" }).click();
  await expect(page).toHaveURL(/modo=lista/);
  await expect(page.locator(`[data-file="${pdf}"]`).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // nueva versión
  await page.goto("/biblioteca");
  await page.locator(`[data-file="${png}"]`).first().click();
  await page.waitForURL(/\/biblioteca\/archivo\/[0-9a-f-]{36}$/);
  const fileUrl = page.url();
  await page.getByRole("button", { name: "Nueva versión" }).click();
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({ name: png, mimeType: "image/png", buffer: makePng(400, 200, [30, 120 + (n % 60), 250]) });
  await expect(page.getByText("Nueva versión subida")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-version="2"]')).toBeVisible();
  await expect(page.locator('[data-version="1"]')).toBeVisible();
  await expect(page.getByText("400 × 200 px")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "biblioteca-archivo", info.project.name);

  // tarea nueva desde la paleta y adjuntar desde la biblioteca
  const title = `Tarea con adjunto ${info.project.name}`;
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Buscar clientes, proyectos/).fill(title);
  await page.getByRole("option", { name: new RegExp(`Crear tarea para hoy: «${title}»`) }).click();
  await expect(page.getByText("Tarea creada para hoy")).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Buscar clientes, proyectos/).fill(title);
  await page.getByRole("option", { name: new RegExp(`${title}.*tarea$`) }).click();
  await page.waitForURL(/\/tareas\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "De la biblioteca" }).click();
  await page.getByRole("dialog").getByPlaceholder("Buscar archivos…").fill(`logo-${p}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(png) })
    .click();
  await expect(page.getByText(`Adjuntaste «${png}»`)).toBeVisible();
  const attached = page.locator('[data-attachments^="task:"]').getByRole("link", { name: png, exact: true });
  await expect(attached).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "tarea-adjuntos", info.project.name);

  // descargar desde el adjunto (URL firmada)
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: `Descargar ${png}` }).click()]);
  expect(download.suggestedFilename()).toBe(png);

  // la ficha muestra dónde está adjuntado
  await page.goto(fileUrl);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();

  // una URL firmada adulterada falla
  const id = fileUrl.split("/").pop();
  const bad = await page.request.get(`/api/files/${id}?exp=9999999999&sig=${"0".repeat(64)}`);
  expect(bad.status()).toBe(403);
});

test("biblioteca: un .exe renombrado a .png es rechazado", async ({ page }, info) => {
  await login(page);
  await page.goto("/biblioteca");
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(512, 0)]);
  const name = `virus-${slug(info.project.name)}.png`;
  await upload(page, [{ name, mimeType: "image/png", buffer: exe }]);
  await expect(page.getByText(/no es un \.png real/).first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.locator(`[data-file="${name}"]`)).toHaveCount(0);
});

test("plantillas con variables y kit de marca del cliente @visual", async ({ page }, info) => {
  test.setTimeout(120_000);
  const p = slug(info.project.name);
  await login(page);

  // plantilla: crear → usar completando la variable
  await page.goto("/biblioteca/plantillas");
  await page.getByRole("button", { name: "Nueva plantilla" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Nueva plantilla" });
  await dlg.locator("#name").fill(`Bienvenida ${p}`);
  await dlg.locator("#kind").selectOption("snippet");
  await dlg.locator("#bodyMd").fill("Hola {{nombre}}, ya está tu sitio.");
  await dlg.getByRole("button", { name: "Crear plantilla" }).click();
  await expect(page.getByText("Plantilla creada")).toBeVisible();
  const card = page.locator(`[data-template="Bienvenida ${p}"]`);
  await card.getByRole("button", { name: "Usar" }).click();
  const use = page.getByRole("dialog", { name: `Usar «Bienvenida ${p}»` });
  await use.getByLabel("Valor de nombre").fill("Ana");
  await expect(use.locator("[data-template-output]")).toHaveText("Hola Ana, ya está tu sitio.");
  await page.keyboard.press("Escape");
  await expectNoHorizontalScroll(page);
  await shot(page, "biblioteca-plantillas", info.project.name);

  // kit de marca: cliente nuevo → pestaña Archivos → armar kit (logo subido + color)
  await page.goto("/crm/clientes/nuevo");
  await page.fill("#name", `Marca e2e ${p}`);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await page.waitForURL(/\/crm\/clientes\/[0-9a-f-]{36}$/);
  const clientId = page.url().split("/").pop();
  await page.goto(`/crm/clientes/${clientId}/archivos`);
  await expect(page.getByText("Kit de marca").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "Armar" }).click();
  await page.waitForURL(`**/biblioteca/marca/${clientId}`);
  await page.getByRole("button", { name: "Agregar color" }).click();
  await page.getByLabel("Nombre del color 1").fill("Primario");
  await page.getByLabel("Hex del color 1").fill("#7C5CFF");
  await page
    .getByLabel("Subir logos")
    .setInputFiles({ name: `isotipo-${p}.png`, mimeType: "image/png", buffer: makePng(64, 64, [124, 92, 255 - (seed(p) % 50)]) });
  await expect(page.getByRole("button", { name: `Quitar isotipo-${p}.png` })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Guardar kit de marca" }).click();
  await expect(page.getByText("Kit de marca guardado")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Hex del color 1")).toHaveValue("#7C5CFF");
  await expect(page.getByRole("button", { name: `Quitar isotipo-${p}.png` })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "biblioteca-marca", info.project.name);
  await page.goto("/biblioteca?vista=logos");
  await expect(page.locator(`[data-file="isotipo-${p}.png"]`).first()).toBeVisible();
});
