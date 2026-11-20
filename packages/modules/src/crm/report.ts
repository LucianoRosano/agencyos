import { addMonths, assertCan, type Ctx, L, label, monthName, notFound, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { brandFromSettings } from "../quotes/queries";
import { listRetainers } from "../retainers/service";
import { getDb, scoped } from "../shared/db";

/**
 * Informe mensual para un cliente (PDF con la marca): qué se hizo en el mes, horas, abonos y estado de sus sitios.
 * Solo datos reales; las secciones sin datos se omiten en el PDF.
 */
export type ClientReportDoc = {
  brand: ReturnType<typeof brandFromSettings>;
  clientName: string;
  periodLabel: string;
  generatedOn: string;
  projects: { name: string; status: string; progress: number; done: string[]; doneCount: number; nextAction: string | null }[];
  deliverables: { title: string; project: string; status: string; date: string | null }[];
  minutes: number;
  retainers: { concept: string; amount: string; currency: string; hoursIncluded: string | null; minutesUsed: number | null }[];
  sites: {
    name: string;
    url: string | null;
    uptimePct: number | null;
    checks: number;
    sslExpires: string | null;
    seoScore: number | null;
    seoDate: string | null;
  }[];
  domains: { name: string; expiresOn: string | null }[];
};

export async function clientReportDoc(ctx: Ctx, clientId: string, year: number, month: number): Promise<ClientReportDoc> {
  assertCan(ctx, "read", "crm");
  const db = getDb();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = addMonths(start, 1); // exclusivo
  const startTs = new Date(`${start}T03:00:00Z`); // 00:00 ART
  const endTs = new Date(`${end}T03:00:00Z`);
  const [client] = await db
    .select()
    .from(schema.client)
    .where(and(eq(schema.client.id, clientId), scoped(schema.client, ctx, { withArchived: true })));
  if (!client) throw notFound("El cliente");
  const [ws] = await db.select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));

  const projects = await db
    .select({
      id: schema.project.id,
      name: schema.project.name,
      status: schema.project.status,
      progress: schema.project.progress,
      nextAction: schema.project.nextAction,
    })
    .from(schema.project)
    .where(and(scoped(schema.project, ctx, { withArchived: true }), eq(schema.project.clientId, clientId)));
  const pids = projects.map((p) => p.id);

  const [doneTasks, deliverables, minutesRow, sites, domains, retainers] = await Promise.all([
    pids.length
      ? db
          .select({ projectId: schema.task.projectId, title: schema.task.title })
          .from(schema.task)
          .where(
            and(
              scoped(schema.task, ctx, { withArchived: true }),
              inArray(schema.task.projectId, pids),
              eq(schema.task.status, "done"),
              gte(schema.task.completedAt, startTs),
              lt(schema.task.completedAt, endTs),
            ),
          )
          .orderBy(desc(schema.task.completedAt))
      : Promise.resolve([]),
    pids.length
      ? db
          .select({
            title: schema.deliverable.title,
            projectId: schema.deliverable.projectId,
            status: schema.deliverable.status,
            dueDate: schema.deliverable.dueDate,
            approvedAt: schema.deliverable.approvedAt,
          })
          .from(schema.deliverable)
          .where(
            and(
              scoped(schema.deliverable, ctx),
              inArray(schema.deliverable.projectId, pids),
              // paréntesis externos: `and()` no envuelve los fragmentos sql
              sql`((${schema.deliverable.approvedAt} >= ${startTs} and ${schema.deliverable.approvedAt} < ${endTs}) or (${schema.deliverable.dueDate} >= ${start} and ${schema.deliverable.dueDate} < ${end}))`,
            ),
          )
      : Promise.resolve([]),
    pids.length
      ? db
          .select({ minutes: sql<number>`coalesce(sum(${schema.timeEntry.minutes}), 0)::int` })
          .from(schema.timeEntry)
          .where(
            and(scoped(schema.timeEntry, ctx), inArray(schema.timeEntry.projectId, pids), gte(schema.timeEntry.date, start), lt(schema.timeEntry.date, end)),
          )
      : Promise.resolve([{ minutes: 0 }]),
    db
      .select()
      .from(schema.site)
      .where(and(scoped(schema.site, ctx), eq(schema.site.clientId, clientId))),
    db
      .select({ name: schema.domain.name, expiresOn: schema.domain.expiresOn })
      .from(schema.domain)
      .where(and(scoped(schema.domain, ctx), eq(schema.domain.clientId, clientId))),
    listRetainers(ctx, { clientId, month: start }).catch(() => []),
  ]);

  const siteIds = sites.map((s) => s.id);
  const [envs, certs, audits] = siteIds.length
    ? await Promise.all([
        db
          .select({ id: schema.siteEnvironment.id, siteId: schema.siteEnvironment.siteId, url: schema.siteEnvironment.url, kind: schema.siteEnvironment.kind })
          .from(schema.siteEnvironment)
          .where(and(scoped(schema.siteEnvironment, ctx), inArray(schema.siteEnvironment.siteId, siteIds))),
        db
          .select({ siteId: schema.certificate.siteId, expiresOn: schema.certificate.expiresOn })
          .from(schema.certificate)
          .where(and(scoped(schema.certificate, ctx), inArray(schema.certificate.siteId, siteIds), eq(schema.certificate.kind, "ssl"))),
        db
          .select({ siteId: schema.seoAudit.siteId, score: schema.seoAudit.score, finishedAt: schema.seoAudit.finishedAt })
          .from(schema.seoAudit)
          .where(
            and(
              scoped(schema.seoAudit, ctx),
              inArray(schema.seoAudit.siteId, siteIds),
              eq(schema.seoAudit.status, "done"),
              isNotNull(schema.seoAudit.score),
              lte(schema.seoAudit.finishedAt, endTs),
            ),
          )
          .orderBy(desc(schema.seoAudit.finishedAt)),
      ])
    : [[], [], []];
  const prodEnvs = envs.filter((e) => e.kind === "prod");
  const uptime = prodEnvs.length
    ? await db
        .select({
          envId: schema.uptimeCheck.siteEnvironmentId,
          total: sql<number>`count(*)::int`,
          ok: sql<number>`count(*) filter (where ${schema.uptimeCheck.ok})::int`,
        })
        .from(schema.uptimeCheck)
        .where(
          and(
            eq(schema.uptimeCheck.workspaceId, ctx.workspaceId),
            inArray(
              schema.uptimeCheck.siteEnvironmentId,
              prodEnvs.map((e) => e.id),
            ),
            gte(schema.uptimeCheck.checkedAt, startTs),
            lt(schema.uptimeCheck.checkedAt, endTs),
          ),
        )
        .groupBy(schema.uptimeCheck.siteEnvironmentId)
    : [];

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const doneBy = new Map<string, string[]>();
  for (const t of doneTasks) if (t.projectId) doneBy.set(t.projectId, [...(doneBy.get(t.projectId) ?? []), t.title]);

  return {
    brand: brandFromSettings(ws?.settings as never),
    clientName: client.name,
    periodLabel: `${monthName(month)} ${year}`,
    generatedOn: todayAR(),
    projects: projects
      .filter((p) => doneBy.has(p.id) || ["in_progress", "planning", "blocked"].includes(p.status))
      .map((p) => ({
        name: p.name,
        status: label(L.projectStatus, p.status),
        progress: p.progress,
        done: (doneBy.get(p.id) ?? []).slice(0, 15),
        doneCount: doneBy.get(p.id)?.length ?? 0,
        nextAction: p.nextAction,
      })),
    deliverables: deliverables.map((d) => ({
      title: d.title,
      project: projectName.get(d.projectId ?? "") ?? "",
      status: label(L.deliverableStatus, d.status),
      date: d.approvedAt ? d.approvedAt.toISOString().slice(0, 10) : d.dueDate,
    })),
    minutes: minutesRow[0]?.minutes ?? 0,
    retainers: retainers
      .filter((x) => x.r.status === "active")
      .map((x) => ({ concept: x.r.concept, amount: x.r.amount, currency: x.r.currency, hoursIncluded: x.r.hoursIncluded, minutesUsed: x.minutesUsed })),
    sites: sites.map((s) => {
      const prod = prodEnvs.find((e) => e.siteId === s.id);
      const u = prod ? uptime.find((x) => x.envId === prod.id) : undefined;
      const audit = audits.find((a) => a.siteId === s.id);
      return {
        name: s.name,
        url: prod?.url ?? s.prodUrl ?? null,
        uptimePct: u?.total ? Math.round((u.ok / u.total) * 1000) / 10 : null,
        checks: u?.total ?? 0,
        sslExpires: certs.find((c) => c.siteId === s.id)?.expiresOn ?? null,
        seoScore: audit?.score ?? null,
        seoDate: audit?.finishedAt ? audit.finishedAt.toISOString().slice(0, 10) : null,
      };
    }),
    domains: domains.map((d) => ({ name: d.name, expiresOn: d.expiresOn })),
  };
}

/** Meses con algo para informar (para el selector): por defecto, el mes anterior al actual. */
export function defaultReportMonth(today = todayAR()) {
  const prev = addMonths(`${today.slice(0, 7)}-01`, -1);
  return { year: Number(prev.slice(0, 4)), month: Number(prev.slice(5, 7)) };
}
