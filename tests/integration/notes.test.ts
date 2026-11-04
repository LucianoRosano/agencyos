import { inflateRawSync } from "node:zlib";
import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { getBrainGraph, getLayout, getLocalGraph } from "@agencyos/modules/brain/queries";
import { saveLayout } from "@agencyos/modules/brain/service";
import { exportNotesZip } from "@agencyos/modules/notes/export";
import { connectionsOf, folderTree, getNote, listNotes, listVersions, noteTags, unlinkedMentions } from "@agencyos/modules/notes/queries";
import { createNote, getOrCreateDaily, linkUnlinkedMention, restoreVersion, updateNote } from "@agencyos/modules/notes/service";
import { createProject } from "@agencyos/modules/projects/service";
import { moveToTrash } from "@agencyos/modules/trash/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

const db = () => getDb();
const linksFrom = (noteId: string) =>
  db()
    .select()
    .from(schema.link)
    .where(and(eq(schema.link.fromType, "note"), eq(schema.link.fromId, noteId)));

/** Lector mínimo de ZIP (directorio central + deflate) para verificar la exportación. */
function readZip(buf: Uint8Array): Map<string, string> {
  const b = Buffer.from(buf);
  const out = new Map<string, string>();
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = b.readUInt32LE(eocd + 16);
  const n = b.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10);
    const size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const extra = b.readUInt16LE(p + 30);
    const comment = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.subarray(start, start + size);
    if (!name.endsWith("/")) out.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString("utf8"));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

async function makeClient(ws: { workspaceId: string }, name: string, extra: Partial<typeof schema.client.$inferInsert> = {}) {
  const [c] = await db()
    .insert(schema.client)
    .values({ workspaceId: ws.workspaceId, name, status: "active", ...extra })
    .returning();
  if (!c) throw new Error("client");
  return c;
}

describe("notas: enlaces, backlinks y menciones", () => {
  it("guardar una nota crea enlaces [[...]] y el destino ve el backlink; un destino creado después también se enlaza", async () => {
    const ctx = await makeWorkspace();
    const a = await createNote(ctx, { title: "Plan de la tienda", bodyMd: "Ver [[Ideas sueltas|ideas]] y [[Proveedores#Contacto]]." });
    expect(await linksFrom(a.id)).toHaveLength(0); // destinos inexistentes: sin enlace todavía
    const ideas = await createNote(ctx, { title: "Ideas sueltas" });
    const prov = await createNote(ctx, { title: "proveedores" }); // mayúsculas/tildes no importan
    const links = await linksFrom(a.id);
    expect(links.map((l) => l.toId).sort()).toEqual([ideas.id, prov.id].sort());
    expect(links.every((l) => l.kind === "wikilink" && l.toType === "note")).toBe(true);
    const back = await connectionsOf(ctx, "note", ideas.id);
    expect(back[0]?.items[0]).toMatchObject({ id: a.id, title: "Plan de la tienda", direction: "in" });
    const out = await connectionsOf(ctx, "note", a.id);
    expect(out.find((g) => g.type === "note")?.items.map((i) => i.direction)).toEqual(["out", "out"]);
  });

  it("cada guardado reemplaza los enlaces salientes (transacción)", async () => {
    const ctx = await makeWorkspace();
    const b = await createNote(ctx, { title: "B" });
    const c = await createNote(ctx, { title: "C" });
    const a = await createNote(ctx, { title: "A", bodyMd: "[[B]] [[C]] [[B]]" });
    expect(await linksFrom(a.id)).toHaveLength(2);
    const r = await updateNote(ctx, a.id, { bodyMd: "solo [[C]]" });
    expect(r.links).toEqual({ wikilinks: 1, resolved: 1, mentions: 0 });
    expect((await linksFrom(a.id)).map((l) => l.toId)).toEqual([c.id]);
    expect(b.id).toBeTruthy();
  });

  it("menciones @Cliente y #Proyecto (sin tildes, varias palabras) generan enlaces «mention»", async () => {
    const ctx = await makeWorkspace();
    const cli = await makeClient(ctx, "Librería Uno");
    const p = await createProject(ctx, { name: "Tienda WooCommerce", clientId: cli.id });
    const n = await createNote(ctx, { title: "Reunión", bodyMd: "Con @libreria uno sobre #Tienda WooCommerce. Mail: x@libreria.com" });
    const links = await linksFrom(n.id);
    expect(links.map((l) => `${l.toType}:${l.kind}`).sort()).toEqual(["client:mention", "project:mention"]);
    expect(links.find((l) => l.toType === "project")?.toId).toBe(p.id);
    const conn = await connectionsOf(ctx, "client", cli.id);
    expect(conn.find((g) => g.type === "note")?.items[0]?.title).toBe("Reunión");
  });

  it("renombrar el destino reescribe [[enlaces]] en las notas de origen y conserva el backlink", async () => {
    const ctx = await makeWorkspace();
    const dest = await createNote(ctx, { title: "Clon LibreríaOS" });
    const src = await createNote(ctx, { title: "Hoja de ruta", bodyMd: "Paso 1: [[Clon LibreríaOS#Fase 1|clon]] y [[clon libreríaos]]" });
    await updateNote(ctx, dest.id, { title: "LibreríaOS Fiscal" });
    const [after] = await db().select().from(schema.note).where(eq(schema.note.id, src.id));
    expect(after?.bodyMd).toBe("Paso 1: [[LibreríaOS Fiscal#Fase 1|clon]] y [[LibreríaOS Fiscal]]");
    expect((await linksFrom(src.id)).map((l) => l.toId)).toEqual([dest.id]);
    await expect(createNote(ctx, { title: "libreriaos fiscal" })).rejects.toThrow(/Ya existe/);
  });

  it("menciones no enlazadas y «Enlazar»", async () => {
    const ctx = await makeWorkspace();
    const t = await createNote(ctx, { title: "Mercado Pago" });
    const s = await createNote(ctx, { title: "Cobros", bodyMd: "Integrar mercado pago en la tienda." });
    await createNote(ctx, { title: "Ya enlazada", bodyMd: "[[Mercado Pago]]" });
    const um = await unlinkedMentions(ctx, { id: t.id, title: t.title, aliases: t.aliases });
    expect(um.map((u) => u.id)).toEqual([s.id]);
    await linkUnlinkedMention(ctx, s.id, t.id);
    const [after] = await db().select().from(schema.note).where(eq(schema.note.id, s.id));
    expect(after?.bodyMd).toBe("Integrar [[Mercado Pago|mercado pago]] en la tienda.");
    expect(await unlinkedMentions(ctx, { id: t.id, title: t.title, aliases: t.aliases })).toHaveLength(0);
  });
});

describe("notas: frontmatter, carpetas, búsqueda y diaria", () => {
  it("frontmatter → etiquetas y alias; filtros por carpeta, etiqueta y búsqueda sin tildes", async () => {
    const ctx = await makeWorkspace();
    const n = await createNote(ctx, {
      title: "Parcial PSEC",
      folderPath: "/Facultad//PSEC/",
      bodyMd: "---\ntags: [facultad, Parcial]\naliases: [PSEC 1]\n---\nTemas: programación estructurada y recursión.",
    });
    expect(n.folderPath).toBe("Facultad/PSEC");
    expect(n.frontmatter).toMatchObject({ tags: ["facultad", "Parcial"] });
    expect(n.aliases).toEqual(["PSEC 1"]);
    await createNote(ctx, { title: "Otra", bodyMd: "nada", folderPath: "", spaceId: "", entityType: "", entityId: "" }); // formulario vacío
    expect((await listNotes(ctx, { folder: "Facultad" })).map((r) => r.id)).toEqual([n.id]);
    expect((await listNotes(ctx, { tag: "parcial" })).map((r) => r.id)).toEqual([n.id]);
    expect((await listNotes(ctx, { q: "programacion" })).map((r) => r.id)).toEqual([n.id]);
    expect((await listNotes(ctx, { q: "parcal psec" })).map((r) => r.id)).toContain(n.id);
    expect((await noteTags(ctx)).map((t) => t.name)).toEqual(["facultad", "parcial"]);
    const tree = await folderTree(ctx);
    expect(tree.tree[0]).toMatchObject({ name: "Facultad", count: 1, children: [{ name: "PSEC", path: "Facultad/PSEC", count: 1 }] });
    expect(tree.unfiled).toBe(1);
    // un alias resuelve wikilinks
    const ref = await createNote(ctx, { title: "Ref", bodyMd: "[[PSEC 1]]" });
    expect((await linksFrom(ref.id))[0]?.toId).toBe(n.id);
  });

  it("nota diaria: una por día, idempotente", async () => {
    const ctx = await makeWorkspace();
    const d1 = await getOrCreateDaily(ctx);
    const d2 = await getOrCreateDaily(ctx);
    expect(d1.id).toBe(d2.id);
    expect(d1).toMatchObject({ isDaily: true, dailyDate: todayAR(), title: todayAR(), folderPath: "Diario" });
  });

  it("validaciones: título obligatorio, sin corchetes, vínculo a entidad existente", async () => {
    const ctx = await makeWorkspace();
    await expect(createNote(ctx, { title: "" })).rejects.toThrow();
    await expect(createNote(ctx, { title: "Mala [[x]]" })).rejects.toThrow();
    await expect(createNote(ctx, { title: "Huérfana", entityType: "project", entityId: "0190a5b0-0000-7000-8000-000000000000" })).rejects.toThrow(/no existe/);
    const p = await createProject(ctx, { name: "Con notas" });
    const n = await createNote(ctx, { title: "Del proyecto", entityType: "project", entityId: p.id });
    expect(n.spaceId).toBe(p.spaceId);
    expect((await getNote(ctx, n.id))?.entity).toMatchObject({ type: "project", title: "Con notas", href: `/proyectos/${p.id}` });
  });
});

describe("notas: historial de versiones", () => {
  it("una versión como mucho cada 5 minutos; restaurar guarda la actual", async () => {
    const ctx = await makeWorkspace();
    const n = await createNote(ctx, { title: "Versionada", bodyMd: "v1" });
    expect(await listVersions(ctx, n.id)).toHaveLength(1);
    const r2 = await updateNote(ctx, n.id, { bodyMd: "v2" });
    expect(r2.versioned).toBe(false);
    // simular que pasaron 6 minutos desde la última versión
    await db()
      .update(schema.noteVersion)
      .set({ createdAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(schema.noteVersion.noteId, n.id));
    const r3 = await updateNote(ctx, n.id, { bodyMd: "v3" });
    expect(r3.versioned).toBe(true);
    const versions = await listVersions(ctx, n.id);
    expect(versions.map((v) => v.bodyMd)).toEqual(["v3", "v1"]);
    const v1 = versions[1];
    if (!v1) throw new Error("v1");
    const restored = await restoreVersion(ctx, v1.id);
    expect(restored.bodyMd).toBe("v1");
    expect((await listVersions(ctx, n.id)).map((v) => v.bodyMd)).toEqual(["v3", "v3", "v1"]);
    await expect(restoreVersion(ctx, v1.id)).rejects.toThrow(/ya tiene/);
  });
});

describe("notas: seguridad", () => {
  it("aislamiento multi-inquilino: B no ve, edita, enlaza ni borra notas de A", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const na = await createNote(a, { title: "Secreto de A", bodyMd: "privado" });
    expect(await getNote(b, na.id)).toBeNull();
    expect((await listNotes(b, { q: "Secreto" })).length).toBe(0);
    await expect(updateNote(b, na.id, { bodyMd: "hackeado" })).rejects.toThrow(/no existe/);
    await expect(moveToTrash(b, "note", na.id)).rejects.toThrow();
    const nb = await createNote(b, { title: "De B", bodyMd: "[[Secreto de A]]" });
    expect(await linksFrom(nb.id)).toHaveLength(0);
    expect(await connectionsOf(b, "note", na.id)).toEqual([]);
    expect((await getBrainGraph(b)).nodes.some((n) => n.id === na.id)).toBe(false);
  });

  it("permisos MCP: write:notes crea y edita (con enlaces), pero no borra; read:all no escribe", async () => {
    const ctx = await makeWorkspace();
    const bot = agentCtx(ctx, ["read:all", "write:notes"]);
    const t = await createNote(bot, { title: "Destino" });
    const n = await createNote(bot, { title: "Desde Claude", bodyMd: "[[Destino]]" });
    expect((await linksFrom(n.id))[0]?.toId).toBe(t.id);
    await updateNote(bot, n.id, { bodyMd: "editada por MCP" });
    await expect(moveToTrash(bot, "note", n.id)).rejects.toThrow(/alcance/);
    const reader = agentCtx(ctx, ["read:all"]);
    await expect(createNote(reader, { title: "No" })).rejects.toThrow(/alcance/);
    await expect(updateNote(reader, n.id, { bodyMd: "no" })).rejects.toThrow(/alcance/);
    await expect(exportNotesZip(bot)).rejects.toThrow();
  });

  it("papelera: la nota sale de listas y búsquedas", async () => {
    const ctx = await makeWorkspace();
    const n = await createNote(ctx, { title: "Borrable" });
    await moveToTrash(ctx, "note", n.id);
    expect((await listNotes(ctx)).find((r) => r.id === n.id)).toBeUndefined();
    expect(await getNote(ctx, n.id)).toBeNull();
  });
});

describe("notas: exportación y Cerebro", () => {
  it("exporta un ZIP compatible con Obsidian (carpetas + frontmatter)", async () => {
    const ctx = await makeWorkspace();
    await createNote(ctx, { title: "Resumen: unidad 1", folderPath: "Facultad/PSEC", bodyMd: "---\ntags: [psec]\n---\n# Unidad 1\n[[Glosario]]" });
    await createNote(ctx, { title: "Glosario", aliases: "Términos" });
    const { data, count } = await exportNotesZip(ctx);
    expect(count).toBe(2);
    const zip = readZip(new Uint8Array(data));
    expect([...zip.keys()].sort()).toEqual(["Facultad/PSEC/Resumen- unidad 1.md", "Glosario.md"]);
    const md = zip.get("Facultad/PSEC/Resumen- unidad 1.md") ?? "";
    expect(md).toMatch(/^---\ntags:\n {2}- psec\ncreado: \d{4}-\d{2}-\d{2}\nactualizado: /);
    expect(md).toContain("# Unidad 1\n[[Glosario]]");
    expect(zip.get("Glosario.md") ?? "").toContain("aliases:\n  - Términos");
  });

  it("el grafo incluye entidades reales, pertenencia y enlaces; guarda el layout", async () => {
    const ctx = await makeWorkspace();
    const cli = await makeClient(ctx, "Sofía Casa Editorial", { status: "finished" });
    const [contact] = await db().insert(schema.contact).values({ workspaceId: ctx.workspaceId, name: "Nicolás" }).returning();
    if (!contact) throw new Error("contact");
    await db().insert(schema.clientContact).values({ workspaceId: ctx.workspaceId, clientId: cli.id, contactId: contact.id });
    const p = await createProject(ctx, { name: "Panel de Sofía", clientId: cli.id, status: "paused" });
    const solo = await createProject(ctx, { name: "AGENCYOS" });
    const n = await createNote(ctx, { title: "Notas del panel", entityType: "project", entityId: p.id, bodyMd: "Ver #AGENCYOS" });
    const g = await getBrainGraph(ctx);
    const keys = new Set(g.nodes.map((x) => x.key));
    for (const k of [`client:${cli.id}`, `contact:${contact.id}`, `project:${p.id}`, `project:${solo.id}`, `note:${n.id}`]) expect(keys.has(k)).toBe(true);
    const has = (s: string, t: string, kind: string) => g.edges.some((e) => e.kind === kind && ((e.s === s && e.t === t) || (e.s === t && e.t === s)));
    expect(has(`project:${p.id}`, `client:${cli.id}`, "belongs")).toBe(true);
    expect(has(`contact:${contact.id}`, `client:${cli.id}`, "belongs")).toBe(true);
    expect(has(`note:${n.id}`, `project:${p.id}`, "belongs")).toBe(true);
    expect(has(`note:${n.id}`, `project:${solo.id}`, "mention")).toBe(true);
    expect(has(`project:${solo.id}`, `space:${solo.spaceId}`, "space")).toBe(true);
    expect(g.nodes.find((x) => x.key === `project:${p.id}`)).toMatchObject({ dim: true, cluster: `client:${cli.id}` });
    expect(g.nodes.find((x) => x.key === `client:${cli.id}`)?.dim).toBe(true);
    expect(g.nodes.some((x) => x.type === "task")).toBe(false);
    expect((await getBrainGraph(ctx, { includeTasks: true })).nodes.some((x) => x.type === "task")).toBe(false);

    const local = await getLocalGraph(ctx, "project", p.id, 1);
    expect(local.nodes.map((x) => x.key).sort()).toEqual([`client:${cli.id}`, `note:${n.id}`, `project:${p.id}`].sort());
    const local2 = await getLocalGraph(ctx, "project", p.id, 2);
    expect(local2.nodes.length).toBeGreaterThan(local.nodes.length);

    await saveLayout(ctx, { viewKey: "main", positions: { [`note:${n.id}`]: [1.5, -2] } });
    await saveLayout(ctx, { viewKey: "main", positions: { [`note:${n.id}`]: [3, 4], [`project:${p.id}`]: [0, 0] } });
    expect(await getLayout(ctx, "main")).toMatchObject({ nodeCount: 2, positions: { [`note:${n.id}`]: [3, 4] } });
    await expect(saveLayout(ctx, { viewKey: "MAL ESPACIO", positions: {} })).rejects.toThrow();
    const other = await makeWorkspace("otro");
    expect(await getLayout(other, "main")).toBeNull();
  });
});
