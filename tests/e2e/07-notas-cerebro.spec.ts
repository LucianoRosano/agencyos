import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";

/**
 * Datos SOLO de test (base e2e recreada en cada corrida): una red mínima de clientes, proyectos,
 * personas, materias y notas enlazadas para que el Cerebro tenga algo que dibujar en las capturas.
 */
async function seedGraph() {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    const ws = (await c.query("select id from workspace order by created_at limit 1")).rows[0]?.id as string;
    if ((await c.query("select 1 from client where workspace_id = $1 and name = 'Librería Uno'", [ws])).rowCount) return;
    const spaces = Object.fromEntries((await c.query("select id, kind from space where workspace_id = $1", [ws])).rows.map((r) => [r.kind, r.id]));
    const days = (d: number) => new Date(Date.now() - d * 86_400_000);
    const one = async (sql: string, params: unknown[]) => (await c.query(sql, params)).rows[0]?.id as string;
    const client = (name: string, status: string, created: number, active: number) =>
      one("insert into client (id, workspace_id, name, status, space_id, created_at, updated_at, last_activity_at) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6) returning id", [ws, name, status, spaces.agency, days(created), days(active)]);
    const project = (name: string, clientId: string | null, space: string, status: string, progress: number, created: number, active: number, next?: string) =>
      one(
        "insert into project (id, workspace_id, name, client_id, space_id, status, progress, next_action, created_at, updated_at, last_activity_at) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning id",
        [ws, name, clientId, space, status, progress, next ?? (status === "in_progress" ? "Revisar con el cliente" : null), days(created), days(active)],
      );
    const contact = async (name: string, clientId: string, created: number) => {
      const id = await one("insert into contact (id, workspace_id, name, created_at, updated_at) values (gen_random_uuid(), $1, $2, $3, $3) returning id", [ws, name, days(created)]);
      await c.query("insert into client_contact (id, workspace_id, client_id, contact_id) values (gen_random_uuid(), $1, $2, $3)", [ws, clientId, id]);
      return id;
    };
    const course = (name: string, created: number) =>
      one("insert into course (id, workspace_id, name, status, space_id, created_at, updated_at) values (gen_random_uuid(), $1, $2, 'cursando', $3, $4, $4) returning id", [ws, name, spaces.study, days(created)]);
    const FOLDER: Record<string, string> = {
      "Mails de pedido": "Clientes/Librería Uno", "Facturación AFIP": "Clientes/Librería Uno", "Catálogo de Sofía": "Clientes/Sofía",
      "Arquitectura AGENCYOS": "Proyectos/AGENCYOS", SEÑAL: "Proyectos/AGENCYOS", Recursión: "Facultad/Programación", Matrices: "Facultad/Matemática",
      "TLED · Unidad 2": "Facultad/TLED", "Parcial PSEC": "Facultad/PSEC",
    };
    const note = (title: string, created: number, active: number, entity?: [string, string], space?: string) =>
      one(
        "insert into note (id, workspace_id, title, slug, space_id, folder_path, body_md, word_count, entity_type, entity_id, created_at, updated_at) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 12, $7, $8, $9, $10) returning id",
        [ws, title, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`, space ?? spaces.agency, FOLDER[title] ?? null, `Apuntes de ${title}: decisiones, pendientes y enlaces.`, entity?.[0] ?? null, entity?.[1] ?? null, days(created), days(active)],
      );
    const link = (ft: string, f: string, tt: string, t: string, kind = "wikilink") =>
      c.query("insert into link (id, workspace_id, from_type, from_id, to_type, to_id, kind) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6) on conflict do nothing", [ws, ft, f, tt, t, kind]);

    const lib = await client("Librería Uno", "active", 170, 2);
    const sofia = await client("Sofía Casa Editorial", "active", 150, 3);
    const bella = await client("Bellezatecnia", "active", 90, 12);
    const adeh = await client("ADEH", "active", 60, 25);
    const pari = await client("Parinama", "finished", 160, 80);
    const fiscal = await project("LibreríaOS Fiscal", lib, spaces.agency, "in_progress", 82, 120, 2, "Instalar en librerianuo.com y emitir las 4 facturas reales de prueba");
    const panel = await project("LibreríaOS Panel", lib, spaces.agency, "in_progress", 64, 140, 5);
    const tienda = await project("Tienda WooCommerce", lib, spaces.agency, "in_progress", 40, 100, 9);
    await project("Caja del local", lib, spaces.agency, "planning", 10, 60, 20);
    const psofia = await project("Panel de Sofía", sofia, spaces.agency, "in_progress", 55, 110, 1);
    const seo = await project("SEO del catálogo", sofia, spaces.agency, "planning", 15, 70, 30);
    const clon = await project("Clon LibreríaOS", sofia, spaces.agency, "idea", 0, 40, 40);
    const mayo = await project("Plataforma mayorista", bella, spaces.agency, "in_progress", 35, 80, 6);
    const mino = await project("Rediseño minorista", bella, spaces.agency, "paused", 20, 85, 50);
    const cert = await project("Certificados IX Congreso", adeh, spaces.agency, "in_progress", 70, 55, 4);
    const seoP = await project("SEO Parinama", pari, spaces.agency, "done", 100, 150, 90);
    const agos = await project("AGENCYOS", null, spaces.personal, "in_progress", 30, 30, 0, "Terminar Notas y Cerebro");
    const china = await project("Importación China", null, spaces.personal, "idea", 0, 45, 35);
    const pasantia = await project("Pasantía UNGS", null, spaces.personal, "in_progress", 50, 75, 8);
    const gladys = await contact("Gladys", lib, 160);
    const nico = await contact("Nicolás", sofia, 140);
    await contact("Papá", sofia, 130);
    await contact("Marta", bella, 85);
    const prog = await course("Int. a la Programación", 120);
    const mate = await course("Int. a la Matemática", 118);
    const tled = await course("TLED", 115);
    const psec = await course("PSEC", 60);
    const notes = {
      mails: await note("Mails de pedido", 90, 3, ["project", fiscal]),
      afip: await note("Facturación AFIP", 80, 2, ["project", fiscal]),
      woo: await note("WooCommerce — gotchas", 70, 15, ["project", tienda]),
      catalogo: await note("Catálogo de Sofía", 65, 3, ["client", sofia]),
      brief: await note("Brief Bellezatecnia", 60, 12, ["client", bella]),
      hosting: await note("Hostinger", 100, 40),
      ciber: await note("Ciberseguridad UTN", 50, 20, undefined, spaces.personal),
      senal: await note("SEÑAL", 40, 6, ["project", agos], spaces.personal),
      arquitectura: await note("Arquitectura AGENCYOS", 25, 0, ["project", agos], spaces.personal),
      recursion: await note("Recursión", 100, 10, ["course", prog], spaces.study),
      matrices: await note("Matrices", 98, 30, ["course", mate], spaces.study),
      tledApunte: await note("TLED · Unidad 2", 90, 5, ["course", tled], spaces.study),
      parcial: await note("Parcial PSEC", 30, 1, ["course", psec], spaces.study),
      compliance: await note("Compliance de contenido", 140, 95, ["project", seoP]),
    };
    await link("note", notes.mails, "note", notes.afip);
    await link("note", notes.afip, "project", panel, "mention");
    await link("note", notes.woo, "note", notes.hosting);
    await link("note", notes.catalogo, "project", clon, "mention");
    await link("note", notes.catalogo, "note", notes.woo);
    await link("note", notes.brief, "project", mino, "mention");
    await link("note", notes.arquitectura, "note", notes.senal);
    await link("note", notes.arquitectura, "note", notes.hosting);
    await link("note", notes.arquitectura, "project", fiscal, "mention");
    await link("note", notes.ciber, "note", notes.arquitectura);
    await link("note", notes.parcial, "note", notes.recursion);
    await link("note", notes.tledApunte, "note", notes.recursion);
    await link("note", notes.mails, "contact", gladys, "mention");
    await link("note", notes.catalogo, "contact", nico, "mention");
    await link("project", seo, "project", psofia, "related");
    await link("project", cert, "note", notes.hosting, "related");
    await link("project", pasantia, "note", notes.ciber, "related");
    await link("project", china, "note", notes.arquitectura, "related");
    await link("project", mayo, "project", tienda, "related");
  } finally {
    await c.end();
  }
}

async function typeInEditor(page: Page, text: string) {
  const editor = page.locator(".cm-content");
  await editor.waitFor();
  await editor.click();
  await page.keyboard.type(text);
}

test("notas enlazadas con [[...]] → backlink → Cerebro (buscar y volar, lista) @visual", async ({ page }, info) => {
  const p = info.project.name;
  const mobile = p.startsWith("mobile");
  const dest = `Destino e2e ${p}`;
  const src = `Origen e2e ${p}`;
  await login(page);
  await seedGraph();

  // 1) Nota destino
  await page.goto("/notas/nueva");
  await page.fill("#title", dest);
  await page.getByRole("button", { name: "Crear nota" }).click();
  await page.waitForURL(/\/notas\/[0-9a-f-]{36}$/);
  const destUrl = page.url();
  await typeInEditor(page, "# Objetivo\nEsta nota recibe un **backlink**.");
  await expect(page.getByTestId("save-status")).toHaveText(/Guardado/, { timeout: 15_000 });

  // 2) Nota de origen que la enlaza
  await page.goto("/notas/nueva");
  await page.fill("#title", src);
  await page.getByRole("button", { name: "Crear nota" }).click();
  await page.waitForURL(/\/notas\/[0-9a-f-]{36}$/);
  await typeInEditor(page, `## Plan\nVer [[${dest}]] y [[Nota inexistente ${p}]].\nRepasar con @Librería Uno el #AGENCYOS`);
  await expect(page.getByTestId("save-status")).toHaveText(/Guardado/, { timeout: 15_000 });
  if (mobile) await page.getByRole("tab", { name: "Ver" }).click();
  const preview = page.locator(".note-preview");
  await expect(preview.getByRole("link", { name: dest })).toHaveAttribute("href", new URL(destUrl).pathname);
  await expect(preview.locator(`a[href^="/notas/nueva"]`)).toHaveText(`Nota inexistente ${p}`);
  await page.reload();
  await expect(page.getByTestId("connections")).toContainText(dest);
  await expect(page.getByTestId("connections")).toContainText("Librería Uno");
  await expectNoHorizontalScroll(page);
  await shot(page, "nota-editor", p);

  // 3) Backlink visible en la nota destino
  await page.goto(destUrl);
  await expect(page.getByTestId("connections")).toContainText(src);

  // 4) Lista de notas
  await page.goto("/notas");
  await expect(page.getByRole("link", { name: new RegExp(src) })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "notas-lista", p);

  // 5) Cerebro: buscar y volar → panel / hoja con la nota
  await page.goto("/cerebro");
  await expect(page.getByTestId("brain-canvas")).toBeVisible();
  await page.waitForTimeout(500);
  if (!mobile) await page.keyboard.press("/");
  const search = page.getByRole("combobox", { name: "Buscar y volar a un nodo" });
  if (mobile) await search.click();
  await expect(search).toBeFocused();
  await search.fill(dest.slice(0, 18));
  await page.getByRole("option", { name: new RegExp(dest) }).click();
  const panel = page.getByTestId(mobile ? "brain-sheet" : "brain-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(dest);
  if (!mobile) await expect(panel).toContainText(src); // vecino directo
  await expect(panel.getByRole("link", { name: /Abrir/ })).toHaveAttribute("href", new URL(destUrl).pathname);
  await expectNoHorizontalScroll(page);

  // captura con un proyecto seleccionado (como la referencia)
  await search.fill("LibreríaOS Fis");
  await page.getByRole("option", { name: /LibreríaOS Fiscal/ }).click();
  await expect(panel).toContainText("LibreríaOS Fiscal");
  await page.waitForTimeout(3500); // layout del worker + animación de cámara
  if (!mobile) {
    await page.getByRole("button", { name: "Encuadrar todo" }).click();
    await page.waitForTimeout(900);
  }
  await shot(page, "cerebro", p);

  // 6) Vista Lista equivalente y navegable con teclado
  if (mobile) {
    await page.getByRole("button", { name: "Filtros y línea de tiempo" }).click();
    await page.getByRole("radio", { name: "Lista" }).click();
  } else {
    await page.getByRole("radio", { name: "Lista" }).click();
  }
  const list = page.getByTestId("brain-list");
  await expect(list).toBeVisible();
  await expect(list.getByRole("link", { name: new RegExp(dest) })).toBeVisible();
  const first = list.locator("[data-row]").first();
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(list.locator("[data-row]").nth(1)).toBeFocused();
  await expectNoHorizontalScroll(page);
  await shot(page, "cerebro-lista", p);
  // volver al grafo para la próxima corrida
  if (mobile) {
    await page.getByRole("button", { name: "Filtros y línea de tiempo" }).click();
    await page.getByRole("radio", { name: "Grafo" }).click();
  } else await page.getByRole("radio", { name: "Grafo" }).click();
});
