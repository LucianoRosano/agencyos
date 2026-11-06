import { assertCan, type Ctx, notFound, todayAR, validation, zBool, zInt, zOptDate, zOptText, zOptUuid, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, getDb, scoped } from "../shared/db";
import { createTask } from "../tasks/service";
import { compareSemver, normalizeDomain, SEMVER_RE } from "./domain-name";

/**
 * Activos técnicos (docs/02 M06 §7, docs/04 §8): dominios, hosting, certificados, referencias a credenciales,
 * productos propios con versiones e instalaciones. Permisos: leer = "project"; escribir = "settings"
 * (igual que la papelera para estos tipos: solo dueño y administradores).
 */

export const CERT_KINDS = ["ssl", "arca", "other"] as const;
export const PRODUCT_KINDS = ["wp_plugin", "php_panel", "tool", "app"] as const;
export const INSTALLATION_STATUSES = ["active", "paused", "removed"] as const;

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Fecha real (no 31/02) y en un rango razonable. */
const zAssetDate = zOptDate.refine((v) => {
  if (!v) return true;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "1990-01-01" && v <= "2100-12-31";
}, "Fecha inválida");

const zNotify = z.preprocess(empty, zInt(0, 365).default(30));

const SECRET_RE = /(contraseña|contrasena|password|passwd|pwd|clave|token|secret)\s*[:=]/i;
const noSecret = (v: string | undefined) => !v || !SECRET_RE.test(v);
const NO_SECRET_MSG = "Guardá solo la referencia a Bitwarden, nunca la contraseña";

async function owned(t: Tx, ctx: Ctx, input: { clientId?: string; siteId?: string; credentialRefId?: string }) {
  await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
  await assertOwned(t, ctx, schema.site, input.siteId, "El sitio");
  await assertOwned(t, ctx, schema.credentialRef, input.credentialRefId, "La credencial");
}

const run = <T>(outer: Tx | undefined, fn: (t: Tx) => Promise<T>) => (outer ? fn(outer) : getDb().transaction(fn));

/** Para actualizar: los opcionales vacíos se guardan como null. */
function nulls<T extends Record<string, unknown>>(input: T, keys: (keyof T)[]): T {
  const out = { ...input };
  for (const k of keys) if (out[k] === undefined) (out as Record<string, unknown>)[k as string] = null;
  return out;
}

// --- Credenciales (solo referencias a Bitwarden) ---
export const credentialInput = z.object({
  label: zRequired(160, "El nombre"),
  vault: z.preprocess(empty, z.enum(["bitwarden"]).default("bitwarden")),
  itemPath: zRequired(300, "La referencia").refine(noSecret, NO_SECRET_MSG),
  notes: zOptText(2000).refine(noSecret, NO_SECRET_MSG),
});

export async function createCredential(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "settings");
  const input = credentialInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.credentialRef)
      .values({ ...input, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo guardar la credencial");
    await recordEvent(t, ctx, { type: "credencial.creada", entityType: "credential_ref", entityId: row.id, summary: `Agregó la referencia «${row.label}»` });
    return row;
  });
}

export async function updateCredential(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = credentialInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.credentialRef)
      .set(nulls(input, ["notes"]))
      .where(and(eq(schema.credentialRef.id, id), scoped(schema.credentialRef, ctx)))
      .returning();
    if (!row) throw notFound("La credencial");
    await recordEvent(t, ctx, { type: "credencial.actualizada", entityType: "credential_ref", entityId: id, summary: `Editó la referencia «${row.label}»` });
    return row;
  });
}

// --- Dominios ---
export const domainInput = z.object({
  name: z.preprocess(
    (v) => (typeof v === "string" ? (normalizeDomain(v) ?? `!${v}`) : v),
    z
      .string({ error: "El dominio es obligatorio" })
      .min(1, "El dominio es obligatorio")
      .refine((v) => !v.startsWith("!"), "Dominio inválido (ej.: libreriauno.com.ar)"),
  ),
  clientId: zOptUuid,
  siteId: zOptUuid,
  registrar: zOptText(120),
  holder: zOptText(160),
  expiresOn: zAssetDate,
  autoRenew: zBool,
  dnsRef: zOptText(300),
  credentialRefId: zOptUuid,
  notifyDaysBefore: zNotify,
});

async function assertDomainFree(t: Tx, ctx: Ctx, name: string, exceptId?: string) {
  const [dup] = await t
    .select({ id: schema.domain.id, deletedAt: schema.domain.deletedAt })
    .from(schema.domain)
    .where(and(eq(schema.domain.workspaceId, ctx.workspaceId), eq(schema.domain.name, name)))
    .limit(1);
  if (dup && dup.id !== exceptId)
    throw validation("Ese dominio ya está cargado", {
      name: dup.deletedAt ? "Está en la papelera: restauralo desde Papelera" : "Ya está cargado",
    });
}

export async function createDomain(ctx: Ctx, raw: unknown, outer?: Tx) {
  assertCan(ctx, "create", "settings");
  const input = domainInput.parse(raw);
  return run(outer, async (t) => {
    await owned(t, ctx, input);
    await assertDomainFree(t, ctx, input.name);
    const [row] = await t
      .insert(schema.domain)
      .values({ ...input, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo guardar el dominio");
    await recordEvent(t, ctx, { type: "dominio.creado", entityType: "domain", entityId: row.id, summary: `Agregó el dominio ${row.name}` });
    return row;
  });
}

export async function updateDomain(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = domainInput.parse(raw);
  return getDb().transaction(async (t) => {
    await owned(t, ctx, input);
    await assertDomainFree(t, ctx, input.name, id);
    const [row] = await t
      .update(schema.domain)
      .set(nulls(input, ["clientId", "siteId", "registrar", "holder", "expiresOn", "dnsRef", "credentialRefId"]))
      .where(and(eq(schema.domain.id, id), scoped(schema.domain, ctx)))
      .returning();
    if (!row) throw notFound("El dominio");
    await recordEvent(t, ctx, { type: "dominio.actualizado", entityType: "domain", entityId: id, summary: `Editó el dominio ${row.name}` });
    return row;
  });
}

// --- Hosting ---
export const hostingInput = z.object({
  provider: zRequired(120, "El proveedor"),
  plan: zOptText(120),
  clientId: zOptUuid,
  expiresOn: zAssetDate,
  location: zOptText(120),
  credentialRefId: zOptUuid,
  notifyDaysBefore: zNotify,
});

export async function createHosting(ctx: Ctx, raw: unknown, outer?: Tx) {
  assertCan(ctx, "create", "settings");
  const input = hostingInput.parse(raw);
  return run(outer, async (t) => {
    await owned(t, ctx, input);
    const [row] = await t
      .insert(schema.hosting)
      .values({ ...input, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo guardar el hosting");
    await recordEvent(t, ctx, {
      type: "hosting.creado",
      entityType: "hosting",
      entityId: row.id,
      summary: `Agregó el hosting ${row.provider}${row.plan ? ` (${row.plan})` : ""}`,
    });
    return row;
  });
}

export async function updateHosting(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = hostingInput.parse(raw);
  return getDb().transaction(async (t) => {
    await owned(t, ctx, input);
    const [row] = await t
      .update(schema.hosting)
      .set(nulls(input, ["plan", "clientId", "expiresOn", "location", "credentialRefId"]))
      .where(and(eq(schema.hosting.id, id), scoped(schema.hosting, ctx)))
      .returning();
    if (!row) throw notFound("El hosting");
    await recordEvent(t, ctx, { type: "hosting.actualizado", entityType: "hosting", entityId: id, summary: `Editó el hosting ${row.provider}` });
    return row;
  });
}

// --- Certificados (SSL, ARCA, otros) ---
export const certificateInput = z.object({
  kind: z.preprocess(empty, z.enum(CERT_KINDS).default("ssl")),
  subject: zRequired(200, "El nombre o dominio"),
  expiresOn: zAssetDate,
  siteId: zOptUuid,
  clientId: zOptUuid,
  notes: zOptText(2000).refine(noSecret, NO_SECRET_MSG),
  notifyDaysBefore: zNotify,
});

export async function createCertificate(ctx: Ctx, raw: unknown, outer?: Tx) {
  assertCan(ctx, "create", "settings");
  const input = certificateInput.parse(raw);
  return run(outer, async (t) => {
    await owned(t, ctx, input);
    const [row] = await t
      .insert(schema.certificate)
      .values({ ...input, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo guardar el certificado");
    await recordEvent(t, ctx, { type: "certificado.creado", entityType: "certificate", entityId: row.id, summary: `Agregó el certificado «${row.subject}»` });
    return row;
  });
}

export async function updateCertificate(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = certificateInput.parse(raw);
  return getDb().transaction(async (t) => {
    await owned(t, ctx, input);
    const [row] = await t
      .update(schema.certificate)
      .set(nulls(input, ["expiresOn", "siteId", "clientId", "notes"]))
      .where(and(eq(schema.certificate.id, id), scoped(schema.certificate, ctx)))
      .returning();
    if (!row) throw notFound("El certificado");
    await recordEvent(t, ctx, { type: "certificado.actualizado", entityType: "certificate", entityId: id, summary: `Editó el certificado «${row.subject}»` });
    return row;
  });
}

// --- Convertir un vencimiento suelto (tabla reminder) en un activo ---
export const convertReminderInput = z.object({
  target: z.enum(["domain", "hosting", "certificate"], { error: "Elegí en qué convertirlo" }),
  name: zRequired(253, "El nombre"),
  certKind: z.preprocess(empty, z.enum(CERT_KINDS).default("other")),
});

/**
 * Convierte un recordatorio (p. ej. "Certificado de producción de ARCA") en dominio, hosting o certificado
 * con la misma fecha, aviso y cliente; el recordatorio va a la papelera (restaurable 30 días).
 */
export async function convertReminder(ctx: Ctx, reminderId: string, raw: unknown) {
  assertCan(ctx, "create", "settings");
  const input = convertReminderInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [r] = await t
      .select()
      .from(schema.reminder)
      .where(and(eq(schema.reminder.id, reminderId), scoped(schema.reminder, ctx), isNull(schema.reminder.doneAt)))
      .for("update");
    if (!r) throw notFound("El vencimiento");
    const common = { expiresOn: r.dueDate, notifyDaysBefore: r.notifyDaysBefore, clientId: r.clientId ?? undefined };
    let created: { type: "domain" | "hosting" | "certificate"; id: string };
    if (input.target === "domain") {
      const d = await createDomain(ctx, { ...common, name: input.name }, t);
      created = { type: "domain", id: d.id };
    } else if (input.target === "hosting") {
      const h = await createHosting(ctx, { ...common, provider: input.name }, t);
      created = { type: "hosting", id: h.id };
    } else {
      const c = await createCertificate(ctx, { ...common, subject: input.name, kind: input.certKind, notes: r.notesMd ?? undefined }, t);
      created = { type: "certificate", id: c.id };
    }
    await t.update(schema.reminder).set({ deletedAt: new Date() }).where(eq(schema.reminder.id, r.id));
    await recordEvent(t, ctx, {
      type: "recordatorio.convertido",
      entityType: "reminder",
      entityId: r.id,
      summary: `Convirtió el vencimiento «${r.title}» en activo técnico`,
      payload: created,
    });
    return created;
  });
}

// --- Productos propios ---
export const productInput = z.object({
  name: zRequired(160, "El nombre"),
  kind: z.preprocess(empty, z.enum(PRODUCT_KINDS).default("wp_plugin")),
  description: zOptText(2000),
  repositoryId: zOptUuid,
});

export async function createProduct(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "settings");
  const input = productInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.repository, input.repositoryId, "El repositorio");
    const [row] = await t
      .insert(schema.ownProduct)
      .values({ ...input, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo crear el producto");
    await recordEvent(t, ctx, { type: "producto.creado", entityType: "own_product", entityId: row.id, summary: `Creó el producto propio «${row.name}»` });
    return row;
  });
}

export async function updateProduct(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = productInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.repository, input.repositoryId, "El repositorio");
    const [row] = await t
      .update(schema.ownProduct)
      .set(nulls(input, ["description", "repositoryId"]))
      .where(and(eq(schema.ownProduct.id, id), scoped(schema.ownProduct, ctx)))
      .returning();
    if (!row) throw notFound("El producto");
    await recordEvent(t, ctx, { type: "producto.actualizado", entityType: "own_product", entityId: id, summary: `Editó el producto «${row.name}»` });
    return row;
  });
}

async function getProductFor(t: Tx, ctx: Ctx, productId: string) {
  const [p] = await t
    .select()
    .from(schema.ownProduct)
    .where(and(eq(schema.ownProduct.id, productId), scoped(schema.ownProduct, ctx)));
  if (!p) throw notFound("El producto");
  return p;
}

export const versionInput = z.object({
  version: z
    .string({ error: "La versión es obligatoria" })
    .trim()
    .regex(SEMVER_RE, "Usá versionado semántico: 1.4.0")
    .transform((v) => v.replace(/^v/i, "")),
  releasedAt: zAssetDate,
  changelogMd: zOptText(50000),
});

/**
 * Registra una versión nueva. Por cada instalación activa con una versión anterior crea la tarea
 * "Actualizar <producto> a vX en <cliente>" (docs/15 §2.2: un producto, muchas instalaciones).
 */
export async function addVersion(ctx: Ctx, productId: string, raw: unknown) {
  assertCan(ctx, "create", "settings");
  const input = versionInput.parse(raw);
  return getDb().transaction(async (t) => {
    const p = await getProductFor(t, ctx, productId);
    const [dup] = await t
      .select({ id: schema.ownProductVersion.id })
      .from(schema.ownProductVersion)
      .where(and(eq(schema.ownProductVersion.productId, p.id), eq(schema.ownProductVersion.version, input.version), scoped(schema.ownProductVersion, ctx)))
      .limit(1);
    if (dup) throw validation("Esa versión ya está registrada", { version: "Ya existe" });
    const releasedAt = input.releasedAt && input.releasedAt !== todayAR() ? new Date(`${input.releasedAt}T12:00:00-03:00`) : new Date();
    const [v] = await t
      .insert(schema.ownProductVersion)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        productId: p.id,
        version: input.version,
        releasedAt,
        changelogMd: input.changelogMd ?? null,
      })
      .returning();
    if (!v) throw new Error("No se pudo registrar la versión");

    const installs = await t
      .select({
        i: schema.installation,
        version: schema.ownProductVersion.version,
        clientName: schema.client.name,
        siteName: schema.site.name,
      })
      .from(schema.installation)
      .leftJoin(
        schema.ownProductVersion,
        and(eq(schema.ownProductVersion.id, schema.installation.versionId), eq(schema.ownProductVersion.workspaceId, schema.installation.workspaceId)),
      )
      .leftJoin(schema.client, and(eq(schema.client.id, schema.installation.clientId), eq(schema.client.workspaceId, schema.installation.workspaceId)))
      .leftJoin(schema.site, and(eq(schema.site.id, schema.installation.siteId), eq(schema.site.workspaceId, schema.installation.workspaceId)))
      .where(and(scoped(schema.installation, ctx), eq(schema.installation.productId, p.id), eq(schema.installation.status, "active")));
    const outdated = installs.filter((x) => x.version && compareSemver(x.version, v.version) < 0);
    const [agency] = await t
      .select({ id: schema.space.id })
      .from(schema.space)
      .where(and(scoped(schema.space, ctx), eq(schema.space.kind, "agency")))
      .orderBy(asc(schema.space.sort))
      .limit(1);
    const tasks: { id: string; title: string }[] = [];
    for (const x of outdated) {
      const where = x.clientName ?? x.siteName ?? "la instalación";
      const task = await createTask(
        ctx,
        {
          title: `Actualizar ${p.name} a v${v.version} en ${where}`.slice(0, 300),
          descriptionMd: [
            `Instalada: v${x.version}${x.siteName && x.clientName ? ` · sitio ${x.siteName}` : ""}.`,
            `Ver [${p.name} en Activos técnicos](/activos/productos/${p.id}).`,
            v.changelogMd ? `\n## Changelog v${v.version}\n${v.changelogMd}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          spaceId: agency?.id,
          priority: 3,
        },
        t,
      );
      tasks.push({ id: task.id, title: task.title });
    }
    await recordEvent(t, ctx, {
      type: "producto.version_publicada",
      entityType: "own_product",
      entityId: p.id,
      summary: `Publicó ${p.name} v${v.version}${tasks.length ? ` · ${tasks.length} ${tasks.length === 1 ? "instalación para actualizar" : "instalaciones para actualizar"}` : ""}`,
      payload: { versionId: v.id, version: v.version, tasks: tasks.map((x) => x.id) },
    });
    return { version: v, tasks };
  });
}

export async function deleteVersion(ctx: Ctx, versionId: string) {
  assertCan(ctx, "delete", "settings");
  return getDb().transaction(async (t) => {
    const [used] = await t
      .select({ id: schema.installation.id })
      .from(schema.installation)
      .where(and(scoped(schema.installation, ctx), eq(schema.installation.versionId, versionId)))
      .limit(1);
    if (used) throw validation("Hay instalaciones con esta versión: cambiales la versión antes de borrarla");
    const [row] = await t
      .update(schema.ownProductVersion)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.ownProductVersion.id, versionId), scoped(schema.ownProductVersion, ctx)))
      .returning();
    if (!row) throw notFound("La versión");
    await recordEvent(t, ctx, {
      type: "producto.version_eliminada",
      entityType: "own_product",
      entityId: row.productId,
      summary: `Quitó la versión v${row.version}`,
    });
    return row;
  });
}

export async function restoreVersion(ctx: Ctx, versionId: string) {
  assertCan(ctx, "delete", "settings");
  const [row] = await getDb()
    .update(schema.ownProductVersion)
    .set({ deletedAt: null })
    .where(and(eq(schema.ownProductVersion.id, versionId), eq(schema.ownProductVersion.workspaceId, ctx.workspaceId)))
    .returning();
  if (!row) throw notFound("La versión");
  return row;
}

// --- Instalaciones ---
export const installationInput = z
  .object({
    versionId: zOptUuid,
    siteId: zOptUuid,
    clientId: zOptUuid,
    configRefMd: zOptText(5000).refine(noSecret, NO_SECRET_MSG),
    installedAt: zAssetDate,
    status: z.preprocess(empty, z.enum(INSTALLATION_STATUSES).default("active")),
  })
  .superRefine((v, c) => {
    if (!v.clientId && !v.siteId) c.addIssue({ code: "custom", path: ["clientId"], message: "Elegí el cliente o el sitio donde está instalado" });
  });

async function resolveInstallation(t: Tx, ctx: Ctx, productId: string, input: z.infer<typeof installationInput>) {
  await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
  let clientId = input.clientId ?? null;
  if (input.siteId) {
    const [s] = await t
      .select({ clientId: schema.site.clientId })
      .from(schema.site)
      .where(and(eq(schema.site.id, input.siteId), scoped(schema.site, ctx, { withArchived: true })));
    if (!s) throw notFound("El sitio");
    clientId = clientId ?? s.clientId;
  }
  if (input.versionId) {
    const [v] = await t
      .select({ productId: schema.ownProductVersion.productId })
      .from(schema.ownProductVersion)
      .where(and(eq(schema.ownProductVersion.id, input.versionId), scoped(schema.ownProductVersion, ctx)));
    if (!v || v.productId !== productId) throw validation("La versión no es de este producto", { versionId: "Versión inválida" });
  }
  return {
    versionId: input.versionId ?? null,
    siteId: input.siteId ?? null,
    clientId,
    configRefMd: input.configRefMd ?? null,
    installedAt: input.installedAt ?? null,
    status: input.status,
  };
}

export async function createInstallation(ctx: Ctx, productId: string, raw: unknown) {
  assertCan(ctx, "create", "settings");
  const input = installationInput.parse(raw);
  return getDb().transaction(async (t) => {
    const p = await getProductFor(t, ctx, productId);
    const values = await resolveInstallation(t, ctx, p.id, input);
    const [row] = await t
      .insert(schema.installation)
      .values({ ...values, productId: p.id, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo registrar la instalación");
    await recordEvent(t, ctx, { type: "instalacion.creada", entityType: "installation", entityId: row.id, summary: `Registró una instalación de ${p.name}` });
    return row;
  });
}

export async function updateInstallation(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = installationInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(schema.installation)
      .where(and(eq(schema.installation.id, id), scoped(schema.installation, ctx)));
    if (!before) throw notFound("La instalación");
    const values = await resolveInstallation(t, ctx, before.productId, input);
    const [row] = await t.update(schema.installation).set(values).where(eq(schema.installation.id, id)).returning();
    if (!row) throw notFound("La instalación");
    await recordEvent(t, ctx, {
      type: "instalacion.actualizada",
      entityType: "installation",
      entityId: id,
      summary: "Actualizó una instalación",
      payload: { fromVersionId: before.versionId, toVersionId: row.versionId },
    });
    return row;
  });
}
