import { getDb, schema } from "@agencyos/db";
import { createProject } from "@agencyos/modules/projects/service";
import { runAudit } from "@agencyos/modules/seo/crawler";
import { getGoogleKeyForWorker } from "@agencyos/modules/seo/google-key";
import { processQueuedAudits } from "@agencyos/modules/seo/jobs";
import { compareAudits, getAudit, getGoogleKeyStatus, issuesCsv, listAudits, listIssueGroups, listPages } from "@agencyos/modules/seo/queries";
import {
  cancelAudit,
  createSchedule,
  createTasksFromIssues,
  enqueueDueSchedules,
  reaudit,
  saveGoogleApiKey,
  setScheduleActive,
  startAudit,
} from "@agencyos/modules/seo/service";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SeoFixture, startSeoFixture } from "../fixtures/seo-site";
import { makeWorkspace } from "./helpers";

let site: SeoFixture;

beforeAll(async () => {
  // Opción explícita del módulo SEO para rastrear el servidor local de prueba (solo con NODE_ENV=test).
  process.env.SEO_ALLOW_LOCAL = "1";
  site = await startSeoFixture();
});
afterAll(async () => {
  delete process.env.SEO_ALLOW_LOCAL;
  await site.close();
});

const fast = { maxPages: 50, maxDepth: 5 };

async function auditAndRun(ctx: Awaited<ReturnType<typeof makeWorkspace>>, extra: Record<string, unknown> = {}) {
  const a = await startAudit(ctx, { rootUrl: site.url, ...fast, ...extra });
  expect(a.status).toBe("queued");
  // retardo mínimo entre pedidos para que el test sea rápido (la config real usa 250 ms)
  await getDb()
    .update(schema.seoAudit)
    .set({ config: { ...(a.config as object), delayMs: 0 } })
    .where(eq(schema.seoAudit.id, a.id));
  const r = await runAudit(a.id);
  return { id: a.id, status: r?.status };
}

describe("SEO Auditor", () => {
  it("audita el sitio local: respeta robots.txt, valida sitemap y detecta los problemas esperados", async () => {
    site.setVersion(1);
    const ctx = await makeWorkspace();
    const { id, status } = await auditAndRun(ctx);
    expect(status).toBe("completed");
    const data = await getAudit(ctx, id);
    expect(data?.audit.status).toBe("completed");
    expect(data?.audit.score).toBeGreaterThan(0);
    expect(data?.audit.score).toBeLessThan(100);
    expect(data?.audit.scoreFormulaVersion).toBe("seo-score/1");
    expect(data?.summary.formula?.text).toMatch(/Puntaje = 100/);
    expect(data?.summary.robots?.found).toBe(true);
    expect(data?.summary.sitemap?.urls).toBe(6);

    // robots.txt: nunca se pidió /privado/ y el user-agent es el del auditor
    expect(site.hits.some((h) => h.includes("/privado/"))).toBe(false);
    expect(site.hits.filter((h) => h.includes("127.0.0.1")).every((h) => h.includes("AGENCYOS-SEO-Auditor/1.0 (+lucianorosanott@gmail.com)"))).toBe(true);

    const groups = await listIssueGroups(ctx, id);
    const codes = new Map(groups.map((g) => [g.code, g]));
    const urlsOf = (c: string) => codes.get(c)?.items.map((i) => i.url) ?? [];
    expect(urlsOf("meta_description_missing")).toContain(`${site.url}servicios`);
    expect(urlsOf("h1_multiple")).toContain(`${site.url}servicios`);
    expect(urlsOf("img_alt_missing")).toEqual([`${site.url}servicios`]); // alt="" decorativo no cuenta
    expect(urlsOf("jsonld_invalid")).toContain(`${site.url}servicios`);
    expect(urlsOf("title_missing")).toContain(`${site.url}nosotros`);
    expect(urlsOf("thin_content")).toContain(`${site.url}nosotros`);
    expect(urlsOf("lang_missing")).toContain(`${site.url}nosotros`);
    expect(urlsOf("og_missing")).toContain(`${site.url}nosotros`);
    expect(urlsOf("noindex")).toContain(`${site.url}contacto`);
    expect(urlsOf("sitemap_url_noindex")).toContain(`${site.url}contacto`);
    expect(urlsOf("broken_internal_link")).toContain(`${site.url}vieja`);
    expect(urlsOf("sitemap_url_error")).toContain(`${site.url}vieja`);
    expect(urlsOf("sitemap_url_blocked")).toContain(`${site.url}privado/panel`);
    expect(urlsOf("blocked_by_robots")).toContain(`${site.url}privado/panel`);
    expect(urlsOf("redirect_chain")).toContain(`${site.url}redir`);
    expect(urlsOf("temporary_redirect")).toContain(`${site.url}redir2`);
    expect(urlsOf("internal_link_to_redirect")).toContain(`${site.url}redir`);
    expect(urlsOf("slow_ttfb")).toContain(`${site.url}lenta`);
    expect(urlsOf("not_in_sitemap")).toContain(`${site.url}lenta`);
    expect(urlsOf("broken_external_link")).toEqual([`http://localhost:${site.port}/externo-roto`]); // HEAD 405 → GET ok
    expect(codes.get("no_https")?.items[0]?.url).toBeNull();
    // cada problema trae categoría, severidad, explicación y cómo corregirlo
    for (const g of groups) {
      expect(g.def.fix.length).toBeGreaterThan(10);
      expect(["critical", "high", "medium", "low"]).toContain(g.severity);
    }
    // la página que solo está en el sitemap también se validó
    const pages = await listPages(ctx, id, { limit: 500 });
    expect(pages.rows.find((p) => p.url === `${site.url}solo-sitemap`)?.statusCode).toBe(200);
    expect(pages.rows.find((p) => p.url === `${site.url}privado/panel`)).toBeUndefined();
    const home = pages.rows.find((p) => p.url === site.url);
    expect(home?.indexable).toBe(true);
    expect(home?.h1).toEqual(["Desarrollo web para pymes"]);
    expect(home?.ttfbMs).not.toBeNull();
    // sin API key: Google se saltea (y se informa)
    expect(data?.summary.google?.configured).toBe(false);
    const ev = await getDb()
      .select({ type: schema.domainEvent.type })
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, ctx.workspaceId), eq(schema.domainEvent.entityId, id)));
    expect(ev.map((e) => e.type)).toEqual(expect.arrayContaining(["auditoria.encolada", "auditoria.iniciada", "auditoria.completada"]));
  });

  it("compara dos corridas: resueltos, nuevos y persistentes; la regresión notifica", async () => {
    site.setVersion(1);
    const ctx = await makeWorkspace();
    const first = await auditAndRun(ctx);
    site.setVersion(2);
    const r2 = await reaudit(ctx, first.id);
    await getDb()
      .update(schema.seoAudit)
      .set({ config: { ...(r2.config as object), delayMs: 0 } })
      .where(eq(schema.seoAudit.id, r2.id));
    await runAudit(r2.id);
    site.setVersion(1);
    const cmp = await compareAudits(ctx, r2.id, first.id);
    if (!cmp || "error" in cmp) throw new Error("sin comparación");
    expect(cmp.resolved.find((g) => g.code === "meta_description_missing")?.urls).toContain(`${site.url}servicios`);
    expect(cmp.added.find((g) => g.code === "http_5xx")?.urls).toContain(`${site.url}nosotros`);
    expect(cmp.persistent.find((g) => g.code === "jsonld_invalid")).toBeDefined();
    expect(cmp.scoreDelta).not.toBeNull();
    const second = await getAudit(ctx, r2.id);
    expect(second?.summary.regression?.newCritical).toBeGreaterThan(0);
    const notes = await getDb().select().from(schema.notification).where(eq(schema.notification.workspaceId, ctx.workspaceId));
    expect(notes.some((n) => n.type === "auditoria.regresion_detectada" && n.entityId === r2.id)).toBe(true);
    const list = await listAudits(ctx);
    expect(list[0]?.id).toBe(r2.id);
    expect(list[0]?.delta).toBe(cmp.scoreDelta);
  });

  it("crea tareas desde un grupo (en el proyecto elegido) y desde un problema puntual", async () => {
    site.setVersion(1);
    const ctx = await makeWorkspace();
    const { id } = await auditAndRun(ctx, { checkExternal: "" });
    const project = await createProject(ctx, { name: "SEO del sitio" });
    const r = await createTasksFromIssues(ctx, { auditId: id, code: "meta_description_missing", mode: "group", projectId: project.id });
    expect(r.created).toHaveLength(1);
    const [task] = await getDb()
      .select()
      .from(schema.task)
      .where(eq(schema.task.id, r.created[0]?.id as string));
    expect(task?.projectId).toBe(project.id);
    expect(task?.title).toMatch(/^SEO · Falta la meta description/);
    expect(task?.descriptionMd).toMatch(/Cómo corregirlo/);
    const groups = await listIssueGroups(ctx, id);
    expect(groups.find((g) => g.code === "meta_description_missing")?.withTask).toBeGreaterThan(0);
    const one = groups.find((g) => g.code === "title_missing")?.items[0];
    const r2 = await createTasksFromIssues(ctx, { auditId: id, issueId: one?.id });
    expect(r2.created).toHaveLength(1);
    // CSV: neutraliza fórmulas y trae encabezado
    const csv = await issuesCsv(ctx, id);
    expect(csv?.csv.split("\r\n")[0]).toContain("categoria;severidad;codigo");
    expect(csv?.csv).toContain("meta_description_missing");
  });

  it("cancelar una auditoría en cola; no se duplica una auditoría en curso del mismo sitio", async () => {
    const ctx = await makeWorkspace();
    const a = await startAudit(ctx, { rootUrl: site.url, ...fast });
    await expect(startAudit(ctx, { rootUrl: site.url })).rejects.toThrow(/en cola o en curso/);
    const c = await cancelAudit(ctx, a.id);
    expect(c.status).toBe("cancelled");
    expect(await runAudit(a.id)).toBeNull(); // el worker no toma una cancelada
    await expect(cancelAudit(ctx, a.id)).rejects.toThrow();
  });

  it("validaciones: URL inválida, límites y destinos privados (fuera del modo de test) fallan con mensaje claro", async () => {
    const ctx = await makeWorkspace();
    await expect(startAudit(ctx, { rootUrl: "ftp://ejemplo.com" })).rejects.toThrow();
    await expect(startAudit(ctx, { rootUrl: "https://ejemplo.com", maxPages: 5000 })).rejects.toThrow();
    await expect(startAudit(ctx, {})).rejects.toThrow(/URL/);
    // sin la opción de test, 127.0.0.1 queda bloqueado por el anti-SSRF
    process.env.SEO_ALLOW_LOCAL = "0";
    try {
      const a = await startAudit(ctx, { rootUrl: site.url });
      const r = await runAudit(a.id);
      expect(r?.status).toBe("failed");
      const d = await getAudit(ctx, a.id);
      expect(d?.audit.error).toMatch(/Destino no permitido/);
    } finally {
      process.env.SEO_ALLOW_LOCAL = "1";
    }
  });

  it("API key de Google: se guarda cifrada y nunca se devuelve", async () => {
    const ctx = await makeWorkspace();
    expect((await getGoogleKeyStatus(ctx)).configured).toBe(false);
    const key = "AIzaSyTEST_0123456789abcdefghijklmnop";
    await saveGoogleApiKey(ctx, { apiKey: key });
    const st = await getGoogleKeyStatus(ctx);
    expect(st.configured).toBe(true);
    expect(st.last4).toBe("mnop");
    expect(JSON.stringify(st)).not.toContain(key);
    const [row] = await getDb().select().from(schema.integration).where(eq(schema.integration.workspaceId, ctx.workspaceId));
    expect(Buffer.from(row?.secretEnc ?? []).toString("utf8")).not.toContain(key);
    expect(await getGoogleKeyForWorker(ctx.workspaceId)).toBe(key);
    await expect(saveGoogleApiKey(ctx, { apiKey: "corta" })).rejects.toThrow();
  });

  it("programadas: el job diario encola las que tocan y corre la próxima fecha", async () => {
    const ctx = await makeWorkspace();
    const s = await createSchedule(ctx, { rootUrl: site.url, frequency: "weekly", maxPages: 10 });
    const before = await listAudits(ctx);
    const n = await enqueueDueSchedules(s.nextRunOn as string);
    expect(n).toBeGreaterThanOrEqual(1);
    const after = await listAudits(ctx);
    expect(after.length).toBe(before.length + 1);
    const [row] = await getDb().select().from(schema.seoSchedule).where(eq(schema.seoSchedule.id, s.id));
    expect(row?.nextRunOn).not.toBe(s.nextRunOn);
    await setScheduleActive(ctx, s.id, false);
    // pausada: no se vuelve a encolar
    await cancelAudit(ctx, after[0]?.id as string);
    expect(await enqueueDueSchedules("2099-01-01")).toBe(0);
  });

  it("el job del worker procesa la cola", async () => {
    site.setVersion(1);
    const ctx = await makeWorkspace();
    const a = await startAudit(ctx, { rootUrl: site.url, maxPages: 3, maxDepth: 1, checkExternal: "" });
    const r = await processQueuedAudits({ max: 5 });
    expect(r.processed).toBeGreaterThanOrEqual(1);
    expect((await getAudit(ctx, a.id))?.audit.status).toBe("completed");
  });

  it("aislamiento multi-inquilino: B no ve ni opera auditorías de A", async () => {
    site.setVersion(1);
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const { id } = await auditAndRun(a, { maxPages: 3, checkExternal: "" });
    expect(await getAudit(b, id)).toBeNull();
    expect(await listIssueGroups(b, id)).toEqual([]);
    expect((await listPages(b, id)).rows).toEqual([]);
    expect((await listAudits(b)).find((x) => x.id === id)).toBeUndefined();
    expect(await issuesCsv(b, id)).toBeNull();
    await expect(reaudit(b, id)).rejects.toThrow();
    await expect(cancelAudit(b, id)).rejects.toThrow();
    await expect(createTasksFromIssues(b, { auditId: id, code: "title_missing" })).rejects.toThrow();
    const pa = await createProject(a, { name: "Proyecto de A" });
    // B no puede crear tareas en un proyecto de A
    const own = await auditAndRun(b, { maxPages: 3, checkExternal: "" });
    await expect(createTasksFromIssues(b, { auditId: own.id, code: "no_https", projectId: pa.id })).rejects.toThrow();
    const cmp = await compareAudits(b, own.id, id);
    expect(cmp).toBeNull();
  });

  it("permisos: un miembro no puede cargar la API key", async () => {
    const ctx = await makeWorkspace();
    await expect(saveGoogleApiKey({ ...ctx, role: "member" }, { apiKey: "AIzaSyTEST_0123456789abcdefghijklmnop" })).rejects.toThrow(/permiso/);
  });
});
