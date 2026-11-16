import { deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

/** PDF válido mínimo con una página por texto (Helvetica estándar), con xref correcto. */
function makePdf(pages: string[]) {
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids: string[] = [];
  for (const t of pages) {
    const content = `BT /F1 42 Tf 72 680 Td (${t.replace(/[()\\]/g, "")}) Tj ET 0.2 0.4 0.9 rg 72 300 300 200 re f`;
    kids.push(`${objs.length + 1} 0 R`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objs.length + 2} 0 R >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
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
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Espera la hidratación (el input de archivos necesita su onChange) y sube. */
async function upload(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles(files);
}

test("biblioteca: vista previa de PDF con pdf.js (canvas, páginas, sin errores de CSP) @visual", async ({ page }, info) => {
  test.setTimeout(120_000);
  const p = slug(info.project.name);
  const csp: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|worker/i.test(m.text())) csp.push(m.text());
  });
  await login(page);
  await page.goto("/biblioteca");
  const name = `presentacion-${p}-${Date.now() % 100000}.pdf`;
  await upload(page, [{ name, mimeType: "application/pdf", buffer: makePdf([`Portada ${p}`, `Segunda ${p}`]) }]);
  await expect(page.getByText("Archivo subido")).toBeVisible({ timeout: 20_000 });
  // en la grilla: hoja con sello PDF (sin miniatura real)
  await expect(page.locator(`[data-file="${name}"]`).first()).toBeVisible();
  await page.locator(`[data-file="${name}"]`).first().click();
  await page.waitForURL(/\/biblioteca\/archivo\/[0-9a-f-]{36}$/);
  const preview = page.getByTestId("pdf-preview");
  const canvas = preview.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(canvas).toHaveAttribute("data-page", "1");
  // se dibujó de verdad (hay píxeles no blancos)
  await expect
    .poll(() =>
      canvas.evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
        if (!d) return 0;
        let dark = 0;
        for (let i = 0; i < d.length; i += 16) if ((d[i] ?? 255) < 200) dark++;
        return dark;
      }),
    )
    .toBeGreaterThan(50);
  await expect(preview.getByText("1 / 2")).toBeVisible();
  await preview.getByRole("button", { name: "Página siguiente" }).click();
  await expect(canvas).toHaveAttribute("data-page", "2");
  await expect(preview.getByText("2 / 2")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  await expect(preview.getByRole("link", { name: "Abrir el PDF" })).toBeVisible();
  expect(csp, csp.join("\n")).toEqual([]);
  await expectNoHorizontalScroll(page);
  await shot(page, "biblioteca-pdf", info.project.name);
  await expectAccessible(page);
});

test("biblioteca: mover carpetas (no dentro de sí misma) y archivos, con Deshacer", async ({ page }, info) => {
  test.setTimeout(120_000);
  const p = slug(info.project.name);
  const k = Date.now() % 100000;
  const dest = `Destino ${p} ${k}`;
  const src = `Origen ${p} ${k}`;
  const sub = `Sub ${p} ${k}`;
  await login(page);
  const newFolder = async (n: string) => {
    await page.getByRole("button", { name: "Carpeta", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: "Nueva carpeta" });
    await dlg.locator("#name").fill(n);
    await dlg.getByRole("button", { name: "Crear carpeta" }).click();
    await expect(page.getByText("Carpeta creada").first()).toBeVisible();
    await expect(dlg).toHaveCount(0);
  };
  await page.goto("/biblioteca");
  await newFolder(dest);
  await newFolder(src);
  await page
    .getByRole("link", { name: new RegExp(src) })
    .first()
    .click();
  await page.waitForURL(/carpeta=/);
  const srcUrl = page.url();
  await newFolder(sub);

  // Mover a…: no ofrece la carpeta misma ni sus subcarpetas
  await page.getByRole("button", { name: "Acciones de la carpeta" }).click();
  await page.getByRole("menuitem", { name: "Mover a…" }).click();
  const dlg = page.getByRole("dialog", { name: "Mover carpeta" });
  const select = dlg.locator("#move-target");
  const labels = await select.locator("option").allTextContents();
  expect(labels).toContain(dest);
  expect(labels.some((l) => l.includes(src))).toBe(false);
  expect(labels).not.toContain("Raíz de la biblioteca"); // es su ubicación actual
  await expectNoHorizontalScroll(page);
  await shot(page, "biblioteca-mover", info.project.name);
  await select.selectOption({ label: dest });
  await dlg.getByRole("button", { name: "Mover" }).click();
  await expect(page.getByText(`Carpeta movida a «${dest}»`)).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Ubicación" });
  await expect(crumbs).toContainText(dest);
  // Deshacer → vuelve a la raíz
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText("Deshecho")).toBeVisible();
  await page.goto(srcUrl);
  await expect(crumbs).not.toContainText(dest);

  // archivo: Mover a… desde su ficha
  await page.goto("/biblioteca");
  const png = `mover-${p}-${k}.png`;
  await upload(page, [{ name: png, mimeType: "image/png", buffer: makePng(40, 30, [k % 250, 90, 160]) }]);
  await expect(page.getByText("Archivo subido")).toBeVisible({ timeout: 20_000 });
  await page.locator(`[data-file="${png}"]`).first().click();
  await page.waitForURL(/\/biblioteca\/archivo\//);
  await page.getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("menuitem", { name: "Mover a…" }).click();
  const fdlg = page.getByRole("dialog", { name: "Mover archivo" });
  await expect(fdlg.locator("#move-target option", { hasText: "Raíz de la biblioteca" })).toHaveCount(0); // ya está ahí
  await fdlg.locator("#move-target").selectOption({ label: dest });
  await fdlg.getByRole("button", { name: "Mover" }).click();
  await expect(page.getByText(`Archivo movido a «${dest}»`)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Detalles del archivo" }).getByRole("link", { name: dest })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("finanzas: etiquetar un movimiento desde su menú y filtrar por etiqueta @visual", async ({ page }, info) => {
  test.setTimeout(120_000);
  const p = slug(info.project.name);
  const k = Date.now() % 100000;
  const account = `Banco ${p} ${k}`;
  const tagName = `viaje-${p}`.slice(0, 40);
  await login(page);
  await page.goto("/finanzas/cuentas?nueva=1");
  const sheet = page.getByRole("dialog");
  await sheet.locator("#name").fill(account);
  await sheet.locator("#openingBalance").fill("1000");
  await sheet.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.locator(`[data-account="${account}"]`)).toBeVisible();
  const addTx = async (kind: "Ingreso" | "Gasto", amount: string, desc: string) => {
    await page.goto("/finanzas/movimientos?nuevo=1");
    await page.getByRole("radio", { name: kind }).click();
    const tx = page.getByRole("dialog");
    await tx.locator("#amount").fill(amount);
    await tx.locator("#accountId").selectOption({ label: `${account} · ARS · Agencia` });
    await tx.locator("#description").fill(desc);
    await tx.getByRole("button", { name: `Registrar ${kind.toLowerCase()}` }).click();
    await expect(page.getByText(desc).filter({ visible: true }).first()).toBeVisible();
  };
  const tagged = `Viático ${p} ${k}`;
  const other = `Honorarios ${p} ${k}`;
  await addTx("Gasto", "1500", tagged);
  await addTx("Ingreso", "90000", other);

  // etiquetar desde el menú del movimiento
  await page.goto("/finanzas/movimientos");
  const row = page.locator("[data-tx]").filter({ hasText: tagged, visible: true }).first();
  await row.getByRole("button", { name: "Acciones del movimiento" }).click();
  await page.getByRole("menuitem", { name: "Etiquetas" }).click();
  const tdlg = page.getByRole("dialog", { name: "Etiquetas" });
  await tdlg.getByRole("button", { name: "Etiqueta" }).click();
  await tdlg.getByLabel("Buscar o crear etiqueta").fill(tagName);
  await tdlg.getByLabel("Buscar o crear etiqueta").press("Enter");
  await expect(tdlg.getByRole("button", { name: `Quitar #${tagName}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toContainText(`#${tagName}`);

  // filtro por etiqueta (chips de la barra) dentro de la consulta paginada
  await page
    .getByRole("navigation", { name: "Filtrar por etiqueta" })
    .getByRole("link", { name: `#${tagName}` })
    .click();
  await expect(page).toHaveURL(/etiqueta=[0-9a-f-]{36}/);
  await expect(page.locator("[data-tx]").filter({ hasText: tagged, visible: true })).toHaveCount(1);
  await expect(page.locator("[data-tx]").filter({ hasText: other, visible: true })).toHaveCount(0);
  await expect(page.getByText("Gastos (filtro)")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "finanzas-movimientos-etiqueta", info.project.name);
  await expectAccessible(page);
});

test("finanzas: informe PDF de reportes (200 + application/pdf)", async ({ page }) => {
  await login(page);
  await page.goto("/finanzas/reportes");
  const link = page.getByTestId("finance-report-pdf");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/finanzas\/reportes\/pdf/);
  const res = await page.request.get(href as string);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
  await expectNoHorizontalScroll(page);
});

test("cerebro: el botón 3D aparece y monta un canvas WebGL; volver a 2D @visual", async ({ page }, info) => {
  test.setTimeout(90_000);
  const mobile = info.project.name.startsWith("mobile");
  // datos SOLO de test (base e2e recreada en cada corrida): un cliente con un proyecto para que haya grafo
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    const ws = (await c.query("select id from workspace order by created_at limit 1")).rows[0]?.id as string;
    if (!(await c.query("select 1 from client where workspace_id = $1 and name = 'Estudio 3D'", [ws])).rowCount) {
      const space = (await c.query("select id from space where workspace_id = $1 and kind = 'agency'", [ws])).rows[0]?.id as string;
      const cl = (
        await c.query("insert into client (id, workspace_id, name, space_id) values (gen_random_uuid(), $1, 'Estudio 3D', $2) returning id", [ws, space])
      ).rows[0]?.id as string;
      await c.query(
        "insert into project (id, workspace_id, name, client_id, space_id, status, next_action) values (gen_random_uuid(), $1, 'Sitio Estudio 3D', $2, $3, 'in_progress', 'Revisar con el cliente')",
        [ws, cl, space],
      );
    }
  } finally {
    await c.end();
  }
  await login(page);
  await page.goto("/cerebro");
  await expect(page.getByTestId("brain-canvas")).toBeVisible();
  if (mobile) await page.getByRole("button", { name: "Ver el grafo en 3D" }).click();
  else await page.getByRole("radiogroup", { name: "Dimensión del grafo" }).getByRole("radio", { name: "3D" }).click();
  const three = page.getByTestId("brain-3d");
  await expect(three.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("brain-canvas")).toHaveCount(0);
  await page.waitForTimeout(2000);
  await expectNoHorizontalScroll(page);
  await shot(page, "cerebro-3d", info.project.name);
  // volver a 2D
  if (mobile) await page.getByRole("button", { name: "Volver al grafo 2D" }).click();
  else await page.getByRole("radiogroup", { name: "Dimensión del grafo" }).getByRole("radio", { name: "2D" }).click();
  await expect(page.getByTestId("brain-canvas")).toBeVisible();
  await expect(three).toHaveCount(0);
});
