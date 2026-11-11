import { addDays, assertCan, type Ctx, can, diffDays, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDb, scoped } from "../shared/db";
import { compareSemver } from "./domain-name";

/** Un vencimiento de activo técnico (dominio, hosting o certificado). Lo usan Activos, Hoy y Calendario. */
export type AssetDue = {
  kind: "domain" | "hosting" | "certificate";
  id: string;
  title: string;
  detail: string | null;
  expiresOn: string;
  notifyDaysBefore: number;
  certKind?: string;
  clientName: string | null;
  href: string;
};

const KIND_HREF = { domain: "/activos/dominios", hosting: "/activos/hosting", certificate: "/activos/certificados" } as const;

/** Vencimientos con fecha ≤ `to` (incluye los ya vencidos), opcionalmente desde `from`. */
export async function assetDueDates(ctx: Ctx, opts: { to: string; from?: string }): Promise<AssetDue[]> {
  if (!can(ctx, "read", "project")) return [];
  const db = getDb();
  const range = (col: PgColumn) => and(isNotNull(col), lte(col, opts.to), opts.from ? sql`${col} >= ${opts.from}` : undefined);
  const [domains, hostings, certs] = await Promise.all([
    db
      .select({ d: schema.domain, clientName: schema.client.name })
      .from(schema.domain)
      .leftJoin(schema.client, and(eq(schema.client.id, schema.domain.clientId), eq(schema.client.workspaceId, schema.domain.workspaceId)))
      .where(and(scoped(schema.domain, ctx), range(schema.domain.expiresOn))),
    db
      .select({ h: schema.hosting, clientName: schema.client.name })
      .from(schema.hosting)
      .leftJoin(schema.client, and(eq(schema.client.id, schema.hosting.clientId), eq(schema.client.workspaceId, schema.hosting.workspaceId)))
      .where(and(scoped(schema.hosting, ctx), range(schema.hosting.expiresOn))),
    db
      .select({ c: schema.certificate, clientName: schema.client.name })
      .from(schema.certificate)
      .leftJoin(schema.client, and(eq(schema.client.id, schema.certificate.clientId), eq(schema.client.workspaceId, schema.certificate.workspaceId)))
      .where(and(scoped(schema.certificate, ctx), range(schema.certificate.expiresOn))),
  ]);
  const out: AssetDue[] = [
    ...domains.map(({ d, clientName }) => ({
      kind: "domain" as const,
      id: d.id,
      title: d.name,
      detail: d.autoRenew ? "renovación automática" : d.registrar,
      expiresOn: d.expiresOn as string,
      notifyDaysBefore: d.notifyDaysBefore,
      clientName,
      href: `${KIND_HREF.domain}?ver=${d.id}`,
    })),
    ...hostings.map(({ h, clientName }) => ({
      kind: "hosting" as const,
      id: h.id,
      title: `${h.provider}${h.plan ? ` · ${h.plan}` : ""}`,
      detail: h.location,
      expiresOn: h.expiresOn as string,
      notifyDaysBefore: h.notifyDaysBefore,
      clientName,
      href: `${KIND_HREF.hosting}?ver=${h.id}`,
    })),
    ...certs.map(({ c, clientName }) => ({
      kind: "certificate" as const,
      id: c.id,
      title: c.subject,
      detail: null,
      certKind: c.kind,
      expiresOn: c.expiresOn as string,
      notifyDaysBefore: c.notifyDaysBefore,
      clientName,
      href: `${KIND_HREF.certificate}?ver=${c.id}`,
    })),
  ];
  return out.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.title.localeCompare(b.title, "es"));
}

/** Texto de tipo para un vencimiento (Hoy, Calendario, Resumen). */
export function assetKindLabel(a: Pick<AssetDue, "kind" | "certKind">) {
  if (a.kind === "domain") return "Dominio";
  if (a.kind === "hosting") return "Hosting";
  return a.certKind === "arca" ? "Certificado ARCA" : a.certKind === "ssl" ? "Certificado SSL" : "Certificado";
}

export async function listDomains(ctx: Ctx) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const rows = await db
    .select({ d: schema.domain, clientName: schema.client.name, siteName: schema.site.name, credentialLabel: schema.credentialRef.label })
    .from(schema.domain)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.domain.clientId), eq(schema.client.workspaceId, schema.domain.workspaceId)))
    .leftJoin(schema.site, and(eq(schema.site.id, schema.domain.siteId), eq(schema.site.workspaceId, schema.domain.workspaceId)))
    .leftJoin(
      schema.credentialRef,
      and(eq(schema.credentialRef.id, schema.domain.credentialRefId), eq(schema.credentialRef.workspaceId, schema.domain.workspaceId)),
    )
    .where(scoped(schema.domain, ctx))
    .orderBy(sql`${schema.domain.expiresOn} asc nulls last`, asc(schema.domain.name));
  // Fuente del vencimiento: si lo completó el chequeo RDAP, queda en la actividad del dominio.
  const ids = rows.map((r) => r.d.id);
  const rdap = ids.length
    ? await db
        .selectDistinctOn([schema.activity.entityId], { id: schema.activity.entityId, at: schema.activity.occurredAt })
        .from(schema.activity)
        .where(
          and(eq(schema.activity.workspaceId, ctx.workspaceId), eq(schema.activity.verb, "dominio.vencimiento_rdap"), inArray(schema.activity.entityId, ids)),
        )
        .orderBy(schema.activity.entityId, desc(schema.activity.occurredAt))
    : [];
  const src = new Map(rdap.map((r) => [r.id, r.at]));
  return rows.map((r) => ({ ...r, rdapAt: src.get(r.d.id) ?? null }));
}

export async function listHostings(ctx: Ctx) {
  assertCan(ctx, "read", "project");
  return getDb()
    .select({ h: schema.hosting, clientName: schema.client.name, credentialLabel: schema.credentialRef.label })
    .from(schema.hosting)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.hosting.clientId), eq(schema.client.workspaceId, schema.hosting.workspaceId)))
    .leftJoin(
      schema.credentialRef,
      and(eq(schema.credentialRef.id, schema.hosting.credentialRefId), eq(schema.credentialRef.workspaceId, schema.hosting.workspaceId)),
    )
    .where(scoped(schema.hosting, ctx))
    .orderBy(sql`${schema.hosting.expiresOn} asc nulls last`, asc(schema.hosting.provider));
}

export async function listCertificates(ctx: Ctx) {
  assertCan(ctx, "read", "project");
  return getDb()
    .select({ c: schema.certificate, clientName: schema.client.name, siteName: schema.site.name })
    .from(schema.certificate)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.certificate.clientId), eq(schema.client.workspaceId, schema.certificate.workspaceId)))
    .leftJoin(schema.site, and(eq(schema.site.id, schema.certificate.siteId), eq(schema.site.workspaceId, schema.certificate.workspaceId)))
    .where(scoped(schema.certificate, ctx))
    .orderBy(sql`${schema.certificate.expiresOn} asc nulls last`, asc(schema.certificate.subject));
}

export async function listCredentials(ctx: Ctx) {
  assertCan(ctx, "read", "settings");
  const db = getDb();
  const rows = await db.select().from(schema.credentialRef).where(scoped(schema.credentialRef, ctx)).orderBy(asc(schema.credentialRef.label));
  const [d, h] = await Promise.all([
    db
      .select({ id: schema.domain.credentialRefId, n: sql<number>`count(*)::int` })
      .from(schema.domain)
      .where(and(scoped(schema.domain, ctx), isNotNull(schema.domain.credentialRefId)))
      .groupBy(schema.domain.credentialRefId),
    db
      .select({ id: schema.hosting.credentialRefId, n: sql<number>`count(*)::int` })
      .from(schema.hosting)
      .where(and(scoped(schema.hosting, ctx), isNotNull(schema.hosting.credentialRefId)))
      .groupBy(schema.hosting.credentialRefId),
  ]);
  const uses = new Map<string, number>();
  for (const r of [...d, ...h]) if (r.id) uses.set(r.id, (uses.get(r.id) ?? 0) + r.n);
  return rows.map((c) => ({ ...c, uses: uses.get(c.id) ?? 0 }));
}

export async function listProducts(ctx: Ctx) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const products = await db.select().from(schema.ownProduct).where(scoped(schema.ownProduct, ctx)).orderBy(asc(schema.ownProduct.name));
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const [versions, installs] = await Promise.all([
    db
      .select({ id: schema.ownProductVersion.id, productId: schema.ownProductVersion.productId, version: schema.ownProductVersion.version })
      .from(schema.ownProductVersion)
      .where(and(scoped(schema.ownProductVersion, ctx), inArray(schema.ownProductVersion.productId, ids))),
    db
      .select({ productId: schema.installation.productId, versionId: schema.installation.versionId, status: schema.installation.status })
      .from(schema.installation)
      .where(and(scoped(schema.installation, ctx), inArray(schema.installation.productId, ids))),
  ]);
  return products.map((p) => {
    const vs = versions.filter((v) => v.productId === p.id).sort((a, b) => compareSemver(b.version, a.version));
    const latest = vs[0] ?? null;
    const active = installs.filter((i) => i.productId === p.id && i.status === "active");
    const vmap = new Map(vs.map((v) => [v.id, v.version]));
    const outdated = latest
      ? active.filter((i) => i.versionId && i.versionId !== latest.id && compareSemver(vmap.get(i.versionId) ?? "0.0.0", latest.version) < 0).length
      : 0;
    return { ...p, latest: latest?.version ?? null, versions: vs.length, installations: active.length, outdated };
  });
}

export async function getProduct(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const [p] = await db
    .select({ p: schema.ownProduct, repoName: schema.repository.fullName })
    .from(schema.ownProduct)
    .leftJoin(
      schema.repository,
      and(eq(schema.repository.id, schema.ownProduct.repositoryId), eq(schema.repository.workspaceId, schema.ownProduct.workspaceId)),
    )
    .where(and(eq(schema.ownProduct.id, id), scoped(schema.ownProduct, ctx, { withArchived: true })));
  if (!p) return null;
  const [versions, installs] = await Promise.all([
    db
      .select()
      .from(schema.ownProductVersion)
      .where(and(scoped(schema.ownProductVersion, ctx), eq(schema.ownProductVersion.productId, id))),
    db
      .select({ i: schema.installation, clientName: schema.client.name, siteName: schema.site.name, siteUrl: schema.site.prodUrl })
      .from(schema.installation)
      .leftJoin(schema.client, and(eq(schema.client.id, schema.installation.clientId), eq(schema.client.workspaceId, schema.installation.workspaceId)))
      .leftJoin(schema.site, and(eq(schema.site.id, schema.installation.siteId), eq(schema.site.workspaceId, schema.installation.workspaceId)))
      .where(and(scoped(schema.installation, ctx), eq(schema.installation.productId, id)))
      .orderBy(asc(schema.installation.status), asc(schema.client.name)),
  ]);
  versions.sort((a, b) => compareSemver(b.version, a.version));
  const vmap = new Map(versions.map((v) => [v.id, v.version]));
  const latest = versions[0]?.version ?? null;
  return {
    ...p,
    versions,
    latest,
    installations: installs.map((x) => {
      const version = x.i.versionId ? (vmap.get(x.i.versionId) ?? null) : null;
      return { ...x, version, outdated: Boolean(latest && version && compareSemver(version, latest) < 0) };
    }),
  };
}

/** Opciones de los formularios de Activos. */
export async function assetFormOptions(ctx: Ctx) {
  const db = getDb();
  const [clients, sites, credentials, repos] = await Promise.all([
    db
      .select({ id: schema.client.id, name: schema.client.name })
      .from(schema.client)
      .where(and(scoped(schema.client, ctx), sql`${schema.client.status} <> 'archived'`))
      .orderBy(asc(schema.client.name)),
    db
      .select({ id: schema.site.id, name: schema.site.name, clientId: schema.site.clientId })
      .from(schema.site)
      .where(scoped(schema.site, ctx))
      .orderBy(asc(schema.site.name)),
    can(ctx, "read", "settings")
      ? db
          .select({ id: schema.credentialRef.id, label: schema.credentialRef.label })
          .from(schema.credentialRef)
          .where(scoped(schema.credentialRef, ctx))
          .orderBy(asc(schema.credentialRef.label))
      : Promise.resolve([]),
    db
      .select({ id: schema.repository.id, name: schema.repository.fullName })
      .from(schema.repository)
      .where(scoped(schema.repository, ctx))
      .orderBy(asc(schema.repository.fullName)),
  ]);
  return {
    clients: clients.map((c) => ({ value: c.id, label: c.name })),
    sites: sites.map((s) => ({ value: s.id, label: s.name })),
    credentials: credentials.map((c) => ({ value: c.id, label: c.label })),
    repositories: repos.map((r) => ({ value: r.id, label: r.name })),
  };
}
export type AssetFormOptions = Awaited<ReturnType<typeof assetFormOptions>>;

/** Vencimientos sueltos (tabla reminder) que se pueden convertir en activos técnicos. */
export async function convertibleReminders(ctx: Ctx) {
  if (!can(ctx, "read", "reminder")) return [];
  return getDb()
    .select({ id: schema.reminder.id, title: schema.reminder.title, kind: schema.reminder.kind, dueDate: schema.reminder.dueDate })
    .from(schema.reminder)
    .where(
      and(
        scoped(schema.reminder, ctx),
        isNull(schema.reminder.doneAt),
        inArray(schema.reminder.kind, ["domain", "hosting", "certificate", "deadline", "other"]),
      ),
    )
    .orderBy(asc(schema.reminder.dueDate));
}

/** Resumen: vencimientos de los próximos `days` días (y los vencidos). */
export async function assetsOverview(ctx: Ctx, days = 90) {
  const today = todayAR();
  const due = await assetDueDates(ctx, { to: addDays(today, days) });
  return due.map((d) => ({ ...d, daysLeft: diffDays(d.expiresOn, today) }));
}
