import { isIP } from "node:net";
import { assertCan, type Ctx, notFound, validation, zOptText, zOptUuid, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { encryptSecret } from "../shared/crypto";
import { assertOwned, getDb, scoped } from "../shared/db";
import { isBlockedIp } from "../shared/safe-fetch";
import { checkEnvironmentNow, type Fetcher } from "./jobs";

/**
 * Monitoreo de sitios (docs/02 M06 §10): entornos monitoreados, acceso por Application Password de WordPress
 * (cifrado en `integration`, nunca vuelve a la UI). Los chequeos los hace el worker (jobs.ts).
 * Permisos: leer = "project", escribir = "settings".
 */

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Validación sincrónica de la URL a monitorear (el chequeo real pasa siempre por safeFetch). */
export function parseMonitorUrl(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) throw validation("La URL es obligatoria", { url: "La URL es obligatoria" });
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw validation("URL inválida", { url: "URL inválida (ej.: https://libreriauno.com.ar)" });
  }
  const bad = (m: string) => validation(m, { url: m });
  if (u.protocol !== "http:" && u.protocol !== "https:") throw bad("Solo http o https");
  if (u.username || u.password) throw bad("Sin usuario ni contraseña en la URL");
  if (u.port && u.port !== "80" && u.port !== "443") throw bad("Solo los puertos 80 y 443");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw bad("Ese host no se puede monitorear");
  if (isIP(host) && isBlockedIp(host)) throw bad("Esa IP es privada o reservada");
  if (!isIP(host) && !host.includes(".")) throw bad("URL inválida (ej.: https://libreriauno.com.ar)");
  u.hash = "";
  return u.toString();
}

const zMonitorUrl = z.unknown().transform((v) => parseMonitorUrl(v));

export const environmentInput = z
  .object({
    siteId: zOptUuid,
    siteName: zOptText(160),
    clientId: zOptUuid,
    kind: z.preprocess(empty, z.enum(["prod", "staging"]).default("prod")),
    url: zMonitorUrl,
    hostingId: zOptUuid,
  })
  .superRefine((v, c) => {
    if (!v.siteId && !v.siteName) c.addIssue({ code: "custom", path: ["siteName"], message: "Elegí un sitio o escribí el nombre de uno nuevo" });
  });

/**
 * Activa el monitoreo de una URL. Si no se elige un sitio existente, crea un **sitio mínimo**
 * (nombre, cliente y URL) en la tabla `site`, que después se completa desde Sitios.
 */
export async function createMonitoredEnvironment(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "settings");
  const input = environmentInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    await assertOwned(t, ctx, schema.hosting, input.hostingId, "El hosting");
    let siteId = input.siteId;
    if (siteId) {
      await assertOwned(t, ctx, schema.site, siteId, "El sitio");
    } else {
      const [s] = await t
        .insert(schema.site)
        .values({
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          name: input.siteName as string,
          clientId: input.clientId ?? null,
          prodUrl: input.kind === "prod" ? input.url : null,
          stagingUrl: input.kind === "staging" ? input.url : null,
          publicationStatus: input.kind === "prod" ? "live" : "staging",
          monitorEnabled: true,
        })
        .returning();
      if (!s) throw new Error("No se pudo crear el sitio");
      siteId = s.id;
      await recordEvent(t, ctx, { type: "sitio.creado", entityType: "site", entityId: s.id, summary: `Creó el sitio «${s.name}» para monitorearlo` });
    }
    const [dup] = await t
      .select({ id: schema.siteEnvironment.id })
      .from(schema.siteEnvironment)
      .where(and(scoped(schema.siteEnvironment, ctx), eq(schema.siteEnvironment.siteId, siteId), eq(schema.siteEnvironment.url, input.url)))
      .limit(1);
    if (dup) throw validation("Esa URL ya se monitorea en este sitio", { url: "Ya está cargada" });
    const [env] = await t
      .insert(schema.siteEnvironment)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId, kind: input.kind, url: input.url, hostingId: input.hostingId ?? null })
      .returning();
    if (!env) throw new Error("No se pudo crear el entorno");
    await t.update(schema.site).set({ monitorEnabled: true }).where(eq(schema.site.id, siteId));
    await recordEvent(t, ctx, { type: "monitoreo.activado", entityType: "site", entityId: siteId, summary: `Activó el monitoreo de ${input.url}` });
    return env;
  });
}

export const environmentPatch = z.object({
  kind: z.preprocess(empty, z.enum(["prod", "staging"]).default("prod")),
  url: zMonitorUrl,
  hostingId: zOptUuid,
});

export async function updateEnvironment(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = environmentPatch.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.hosting, input.hostingId, "El hosting");
    const [before] = await t
      .select()
      .from(schema.siteEnvironment)
      .where(and(eq(schema.siteEnvironment.id, id), scoped(schema.siteEnvironment, ctx)));
    if (!before) throw notFound("El entorno");
    const changedUrl = before.url !== input.url;
    const [row] = await t
      .update(schema.siteEnvironment)
      .set({
        kind: input.kind,
        url: input.url,
        hostingId: input.hostingId ?? null,
        // Otra URL: el historial de estado ya no aplica.
        ...(changedUrl ? { lastStatus: null, sslExpiresOn: null, sslIssuer: null } : {}),
      })
      .where(eq(schema.siteEnvironment.id, id))
      .returning();
    if (!row) throw notFound("El entorno");
    await recordEvent(t, ctx, { type: "monitoreo.entorno_actualizado", entityType: "site", entityId: row.siteId, summary: `Editó el entorno ${row.url}` });
    return row;
  });
}

/** Activa o pausa el monitoreo de un sitio (todos sus entornos). */
export async function setSiteMonitoring(ctx: Ctx, siteId: string, enabled: boolean) {
  assertCan(ctx, "update", "settings");
  const on = z.boolean().parse(enabled);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.site)
      .set({ monitorEnabled: on })
      .where(and(eq(schema.site.id, siteId), scoped(schema.site, ctx)))
      .returning();
    if (!row) throw notFound("El sitio");
    await recordEvent(t, ctx, {
      type: on ? "monitoreo.activado" : "monitoreo.pausado",
      entityType: "site",
      entityId: siteId,
      summary: `${on ? "Reanudó" : "Pausó"} el monitoreo de «${row.name}»`,
    });
    return row;
  });
}

// --- WordPress (Application Password cifrada) ---
export const wordpressInput = z.object({
  username: zRequired(120, "El usuario"),
  appPassword: z
    .string({ error: "La Application Password es obligatoria" })
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .refine((v) => v.replace(/ /g, "").length >= 16 && v.length <= 200, "Pegá la Application Password que generó WordPress (24 caracteres)"),
});

/**
 * Guarda (o reemplaza) el acceso REST de WordPress de un entorno. La contraseña se cifra con
 * encryptSecret y nunca se devuelve: las consultas solo exponen usuario y estado.
 */
export async function saveWordpressAccess(ctx: Ctx, envId: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  const input = wordpressInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [env] = await t
      .select()
      .from(schema.siteEnvironment)
      .where(and(eq(schema.siteEnvironment.id, envId), scoped(schema.siteEnvironment, ctx)));
    if (!env) throw notFound("El entorno");
    const secretEnc = encryptSecret(input.appPassword);
    const config = { username: input.username, siteEnvironmentId: env.id, url: env.url };
    let integrationId = env.integrationId;
    if (integrationId) {
      const [upd] = await t
        .update(schema.integration)
        .set({ config, secretEnc, status: "active", lastError: null })
        .where(and(eq(schema.integration.id, integrationId), scoped(schema.integration, ctx), eq(schema.integration.provider, "wordpress")))
        .returning({ id: schema.integration.id });
      integrationId = upd?.id ?? null;
    }
    if (!integrationId) {
      const [ins] = await t
        .insert(schema.integration)
        .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, provider: "wordpress", name: `WordPress · ${env.url}`, config, secretEnc })
        .returning({ id: schema.integration.id });
      if (!ins) throw new Error("No se pudo guardar el acceso");
      integrationId = ins.id;
      await t.update(schema.siteEnvironment).set({ integrationId }).where(eq(schema.siteEnvironment.id, env.id));
    }
    await recordEvent(t, ctx, {
      type: "monitoreo.wordpress_configurado",
      entityType: "site",
      entityId: env.siteId,
      summary: `Configuró el acceso REST de WordPress de ${env.url}`,
    });
    return { id: env.id, integrationId, username: input.username };
  });
}

export async function removeWordpressAccess(ctx: Ctx, envId: string) {
  assertCan(ctx, "update", "settings");
  return getDb().transaction(async (t) => {
    const [env] = await t
      .select()
      .from(schema.siteEnvironment)
      .where(and(eq(schema.siteEnvironment.id, envId), scoped(schema.siteEnvironment, ctx)));
    if (!env) throw notFound("El entorno");
    if (env.integrationId) {
      await t
        .update(schema.integration)
        .set({ deletedAt: new Date(), secretEnc: null, status: "revoked" })
        .where(and(eq(schema.integration.id, env.integrationId), eq(schema.integration.workspaceId, ctx.workspaceId)));
      await t.update(schema.siteEnvironment).set({ integrationId: null }).where(eq(schema.siteEnvironment.id, env.id));
    }
    await recordEvent(t, ctx, {
      type: "monitoreo.wordpress_quitado",
      entityType: "site",
      entityId: env.siteId,
      summary: `Quitó el acceso REST de WordPress de ${env.url}`,
    });
    return { id: env.id };
  });
}

/** "Chequear ahora" desde la UI: un chequeo inmediato (cuenta para la detección de caídas). */
export async function checkNow(ctx: Ctx, envId: string, fetcher?: Fetcher) {
  assertCan(ctx, "update", "settings");
  const r = await checkEnvironmentNow(ctx.workspaceId, envId, fetcher);
  if (!r) throw notFound("El entorno");
  return { ok: r.ok, latencyMs: r.latencyMs, error: r.error, status: r.status };
}
