import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createProject } from "@agencyos/modules/projects/service";
import { globalSearch } from "@agencyos/modules/search/service";
import { blueprintTemplate } from "@agencyos/modules/sites/blueprint";
import {
  getBlueprint,
  getBrief,
  getSite,
  listLaunchChecks,
  listRequirements,
  listRounds,
  listSites,
  listSlots,
  siteAssets,
  siteForProject,
} from "@agencyos/modules/sites/queries";
import {
  addRequirement,
  addRevisionItem,
  applyBlueprintTemplate,
  closeRevisionRound,
  createSite,
  ensureDocsNote,
  generateBriefQuestions,
  moveRequirement,
  openRevisionRound,
  restoreBlueprintVersion,
  saveBlueprint,
  saveBrief,
  saveBriefQuestions,
  saveEnvironment,
  setLaunchCheckStatus,
  setPublicationStatus,
  setRevisionItemStatus,
  updateSite,
  updateSlot,
} from "@agencyos/modules/sites/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

async function storeSite(name = "Tienda Librería") {
  const ctx = await makeWorkspace();
  const client = await createClient(ctx, { name: `Cliente ${name}` });
  const project = await createProject(ctx, { name: `Proyecto ${name}`, kind: "store", clientId: client.id });
  const site = await createSite(ctx, { name, projectId: project.id, kind: "store", stack: "woocommerce", stagingUrl: "pruebas.ejemplo.com" });
  return { ctx, client, project, site };
}

describe("sitios (Website Factory)", () => {
  it("crear desde un proyecto: hereda el cliente, siembra briefing, checklist de 17 áreas, entornos y documentación", async () => {
    const { ctx, client, project, site } = await storeSite();
    expect(site.clientId).toBe(client.id);
    expect(site.publicationStatus).toBe("building");
    expect(site.stagingUrl).toBe("https://pruebas.ejemplo.com");
    expect((await siteForProject(ctx, project.id))?.id).toBe(site.id);

    const brief = await getBrief(ctx, site.id);
    expect(brief?.answers).toEqual({});

    const checks = await listLaunchChecks(ctx, site.id);
    expect(new Set(checks.map((c) => c.area)).size).toBe(17);
    expect(checks.every((c) => c.status === "todo")).toBe(true);

    const envs = await getDb().select().from(schema.siteEnvironment).where(eq(schema.siteEnvironment.siteId, site.id));
    expect(envs.map((e) => e.kind)).toEqual(["staging"]);

    const [note] = await getDb()
      .select()
      .from(schema.note)
      .where(eq(schema.note.id, site.docsNoteId as string));
    expect(note?.title).toBe("Documentación técnica · Tienda Librería");
    expect(note?.entityType).toBe("project");
    const [link] = await getDb()
      .select()
      .from(schema.link)
      .where(and(eq(schema.link.toType, "site"), eq(schema.link.toId, site.id)));
    expect(link?.fromId).toBe(note?.id);

    const ev = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.entityId, site.id), eq(schema.domainEvent.type, "sitio.creado")));
    expect(ev).toHaveLength(1);

    // Un proyecto, un sitio
    await expect(createSite(ctx, { name: "Otro", projectId: project.id })).rejects.toThrow(/ya tiene un sitio/);

    const listed = await listSites(ctx, { clientId: client.id });
    expect(listed[0]?.s.id).toBe(site.id);
    expect(listed[0]?.checksTotal).toBe(checks.length);
    expect((await globalSearch(ctx, "Librería", { types: ["site"] }))[0]?.href).toBe(`/sitios/${site.id}`);
  });

  it("editar el sitio y validar datos", async () => {
    const { ctx, site } = await storeSite();
    await expect(createSite(ctx, { name: "" })).rejects.toThrow();
    await expect(createSite(ctx, { name: "X", kind: "intranet" })).rejects.toThrow();
    const r = await updateSite(ctx, site.id, { name: "Tienda nueva", kind: "store", stack: "woocommerce", clientId: site.clientId, projectId: site.projectId });
    expect(r.name).toBe("Tienda nueva");
    expect((await getSite(ctx, site.id))?.s.name).toBe("Tienda nueva");
  });

  it("briefing: guarda respuestas normalizadas, genera la lista única de preguntas y la deja editar", async () => {
    const { ctx, site } = await storeSite();
    const b = await saveBrief(ctx, site.id, { goal_main: "Vender online", payment_methods: ["Mercado Pago"], inventado: "x" });
    expect(b?.answers).toEqual({ goal_main: "Vender online", payment_methods: ["Mercado Pago"] });
    expect(b?.version).toBe(2);
    const q = await generateBriefQuestions(ctx, site.id);
    expect(q?.questionsForClient.length).toBeGreaterThan(10);
    expect(q?.questionsForClient.some((x) => /objetivo principal/.test(x))).toBe(false);
    const edited = await saveBriefQuestions(ctx, site.id, "1. ¿Primera?\n\n- ¿Segunda?\n");
    expect(edited?.questionsForClient).toEqual(["¿Primera?", "¿Segunda?"]);
  });

  it("requerimientos: MoSCoW con criterio de aceptación y orden", async () => {
    const { ctx, site } = await storeSite();
    const a = await addRequirement(ctx, site.id, { title: "Pagar con Mercado Pago", moscow: "must", acceptanceMd: "Pago aprobado crea el pedido" });
    const b = await addRequirement(ctx, site.id, { title: "Lista de deseos", moscow: "could" });
    await expect(addRequirement(ctx, site.id, { title: "X", moscow: "maybe" })).rejects.toThrow();
    await moveRequirement(ctx, b?.id as string, "up");
    expect((await listRequirements(ctx, site.id)).map((r) => r.id)).toEqual([b?.id, a?.id]);
    await moveToTrash(ctx, "site_requirement", a?.id as string);
    expect(await listRequirements(ctx, site.id)).toHaveLength(1);
    await restoreFromTrash(ctx, "site_requirement", a?.id as string);
    expect(await listRequirements(ctx, site.id)).toHaveLength(2);
  });

  it("estructura: cada guardado crea una versión y sincroniza los slots conservando el contenido", async () => {
    const { ctx, site } = await storeSite();
    const v1 = await applyBlueprintTemplate(ctx, site.id);
    expect(v1.blueprint.version).toBe(1);
    expect(v1.blueprint.source).toBe("template");
    const slots1 = await listSlots(ctx, site.id);
    expect(slots1.length).toBe(v1.sync.inserted);
    expect(slots1.every((s) => s.status === "pending")).toBe(true);

    const hero = slots1.find((s) => s.pageKey === "inicio" && s.slotKey === "titulo-principal");
    if (!hero) throw new Error("sin slot");
    await updateSlot(ctx, hero.id, { status: "approved", assigneeType: "client", bodyMd: "# Bienvenidos" });

    // v2: se quita la página de inicio
    const tree = blueprintTemplate("store");
    const withoutHome = { pages: tree.pages.filter((p) => p.key !== "inicio") };
    const v2 = await saveBlueprint(ctx, site.id, JSON.stringify(withoutHome));
    expect(v2.blueprint.version).toBe(2);
    expect(v2.sync.archived).toBeGreaterThan(0);
    const bp = await getBlueprint(ctx, site.id);
    expect(bp.current?.version).toBe(2);
    expect(bp.versions.map((v) => [v.version, v.isCurrent])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect((await listSlots(ctx, site.id)).some((s) => s.id === hero.id)).toBe(false);

    // v3: restaurar v1 revive el slot con su contenido
    const v3 = await restoreBlueprintVersion(ctx, site.id, 1);
    expect(v3.blueprint.version).toBe(3);
    const back = (await listSlots(ctx, site.id)).find((s) => s.id === hero.id);
    expect(back?.status).toBe("approved");
    expect(back?.bodyMd).toBe("# Bienvenidos");
    expect(back?.blueprintVersion).toBe(3);

    // JSON inválido o con claves repetidas no se guarda
    await expect(saveBlueprint(ctx, site.id, "{no es json")).rejects.toThrow(/JSON/);
    await expect(saveBlueprint(ctx, site.id, { pages: [tree.pages[0], tree.pages[0]] })).rejects.toThrow(/repetida/);
    expect((await getBlueprint(ctx, site.id)).current?.version).toBe(3);
  });

  it("revisiones: R1 con un ítem abierto no se puede cerrar; resuelto sí; luego R2", async () => {
    const { ctx, site } = await storeSite();
    const r1 = await openRevisionRound(ctx, site.id);
    expect(r1?.number).toBe(1);
    await expect(openRevisionRound(ctx, site.id)).rejects.toThrow(/sigue abierta/);
    const item = await addRevisionItem(ctx, r1?.id as string, { pageRef: "Inicio", description: "Cambiar foto del hero", priority: 2, assignee: "user" });
    const item2 = await addRevisionItem(ctx, r1?.id as string, { description: "Sumar testimonios", priority: 4 });
    await expect(closeRevisionRound(ctx, r1?.id as string)).rejects.toThrow(/quedan 2 ítems abiertos/);
    await setRevisionItemStatus(ctx, item?.id as string, "resolved");
    await expect(closeRevisionRound(ctx, r1?.id as string)).rejects.toThrow(/queda 1 ítem abierto/);
    await setRevisionItemStatus(ctx, item2?.id as string, "postponed");
    const closed = await closeRevisionRound(ctx, r1?.id as string);
    expect(closed?.status).toBe("closed");
    await expect(addRevisionItem(ctx, r1?.id as string, { description: "Tarde" })).rejects.toThrow(/cerrada/);
    const ev = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.entityId, site.id), eq(schema.domainEvent.type, "revision.ronda_cerrada")));
    expect(ev).toHaveLength(1);
    const r2 = await openRevisionRound(ctx, site.id);
    expect(r2?.number).toBe(2);
    expect((await listRounds(ctx, site.id)).map((r) => r.number)).toEqual([2, 1]);
  });

  it("publicación: no permite «Publicado» con ítems críticos pendientes salvo confirmación", async () => {
    const { ctx, site } = await storeSite();
    await setPublicationStatus(ctx, site.id, "staging");
    await expect(setPublicationStatus(ctx, site.id, "live")).rejects.toThrow(/críticos/);
    const live = await setPublicationStatus(ctx, site.id, "live", true);
    expect(live?.publicationStatus).toBe("live");
    const ev = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.entityId, site.id), eq(schema.domainEvent.type, "sitio.estado_publicacion_cambiado")));
    expect(ev).toHaveLength(2);
    const liveEv = ev.find((e) => (e.payload as { to: string }).to === "live");
    expect((liveEv?.payload as { forcedWithPending?: number } | undefined)?.forcedWithPending).toBeGreaterThan(0);

    // Con todos los críticos hechos, publica sin confirmar
    const other = await createSite(ctx, { name: "Institucional", kind: "institutional" });
    for (const c of await listLaunchChecks(ctx, other.id)) if (c.status === "todo") await setLaunchCheckStatus(ctx, c.id, "done");
    expect((await setPublicationStatus(ctx, other.id, "live"))?.publicationStatus).toBe("live");
    await expect(setPublicationStatus(ctx, other.id, "online")).rejects.toThrow();
  });

  it("entornos: alta y edición sincronizan las URLs del sitio; dominio y hosting se leen por sitio o cliente", async () => {
    const { ctx, site, client } = await storeSite();
    const env = await saveEnvironment(ctx, site.id, null, { kind: "prod", url: "libreriauno.com", phpVersion: "8.2", wpVersion: "6.7" });
    expect(env?.url).toBe("https://libreriauno.com");
    expect((await getSite(ctx, site.id))?.s.prodUrl).toBe("https://libreriauno.com");
    await expect(saveEnvironment(ctx, site.id, null, { kind: "prod", url: "", phpVersion: "x" })).rejects.toThrow();
    const db = getDb();
    await db.insert(schema.domain).values({ workspaceId: ctx.workspaceId, name: "libreriauno.com", clientId: client.id });
    await db.insert(schema.hosting).values({ workspaceId: ctx.workspaceId, provider: "Hostinger", clientId: client.id });
    const assets = await siteAssets(ctx, { id: site.id, clientId: client.id });
    expect(assets.domains.map((d) => d.d.name)).toEqual(["libreriauno.com"]);
    expect(assets.hostings.map((h) => h.h.provider)).toEqual(["Hostinger"]);
  });

  it("documentación: si la nota se borra, se puede volver a crear", async () => {
    const { ctx, site } = await storeSite();
    await moveToTrash(ctx, "note", site.docsNoteId as string);
    const n = await ensureDocsNote(ctx, site.id);
    expect(n.id).not.toBe(site.docsNoteId);
    expect((await getSite(ctx, site.id))?.s.docsNoteId).toBe(n.id);
  });

  it("aislamiento A/B y pertenencia de ids (cliente y proyecto de otro workspace)", async () => {
    const { ctx: a, site } = await storeSite("Sitio de A");
    const b = await makeWorkspace("B");
    const clientB = await createClient(b, { name: "Cliente de B" });
    const projectB = await createProject(b, { name: "Proyecto de B", kind: "store" });

    expect(await listSites(b)).toHaveLength(0);
    expect(await getSite(b, site.id)).toBeNull();
    await expect(updateSite(b, site.id, { name: "Hackeado" })).rejects.toThrow();
    await expect(saveBrief(b, site.id, { goal_main: "x" })).rejects.toThrow();
    await expect(applyBlueprintTemplate(b, site.id)).rejects.toThrow();
    await expect(openRevisionRound(b, site.id)).rejects.toThrow();
    await expect(setPublicationStatus(b, site.id, "live", true)).rejects.toThrow();
    await expect(moveToTrash(b, "site", site.id)).rejects.toThrow();
    const slot = await applyBlueprintTemplate(a, site.id).then(() => listSlots(a, site.id));
    await expect(updateSlot(b, slot[0]?.id as string, { status: "approved" })).rejects.toThrow();

    await expect(createSite(a, { name: "X", clientId: clientB.id })).rejects.toThrow(/cliente/i);
    await expect(createSite(a, { name: "X", projectId: projectB.id })).rejects.toThrow(/proyecto/i);
    await expect(updateSite(a, site.id, { name: "X", projectId: projectB.id })).rejects.toThrow(/proyecto/i);
    const [hostingB] = await getDb().insert(schema.hosting).values({ workspaceId: b.workspaceId, provider: "De B" }).returning();
    await expect(saveEnvironment(a, site.id, null, { kind: "prod", url: "a.com", hostingId: hostingB?.id })).rejects.toThrow(/hosting/i);
  });

  it("permisos: un token MCP de solo lectura no crea sitios; la papelera funciona con Deshacer", async () => {
    const { ctx, site } = await storeSite();
    await expect(createSite(agentCtx(ctx, ["read:all"]), { name: "Desde MCP" })).rejects.toThrow(/alcance/);
    await moveToTrash(ctx, "site", site.id);
    expect(await listSites(ctx)).toHaveLength(0);
    await restoreFromTrash(ctx, "site", site.id);
    expect(await listSites(ctx)).toHaveLength(1);
  });
});
