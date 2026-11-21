import "server-only";
import type { Ctx, Role } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { getAuth } from "@agencyos/modules/auth/server";
import { assertRateLimit, RATE_RULES } from "@agencyos/modules/shared/rate-limit";
import { loadGrants, portalPrefKey } from "@agencyos/modules/users/service";
import { ACTIVE_WORKSPACE_COOKIE, resolveActiveMembership } from "@agencyos/modules/workspaces/service";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

/**
 * Acceso activo de la sesión: el workspace elegido en el selector (cookie `ag-ws`) si el usuario tiene una
 * membership activa en él; si no, el primero. La cookie nunca da acceso por sí sola (se valida acá).
 */
export const getMembership = cache(async (userId: string) => {
  const preferred = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  return resolveActiveMembership(userId, preferred);
});

/** A dónde va cada rol al entrar. `null` = sin acceso activo. */
export async function homeFor(userId: string): Promise<"/hoy" | "/portal" | null> {
  const m = await getMembership(userId);
  if (!m) return null;
  return m.m.role === "client" ? "/portal" : "/hoy";
}

export type AppCtx = Ctx & { user: { id: string; name: string; email: string; image: string | null }; workspace: typeof schema.workspace.$inferSelect };

/**
 * Rutas internas que puede abrir un colaborador (`member`). Todo lo demás redirige a /hoy.
 * Es una capa de UX: la barrera real son los permisos (core/permissions) y el alcance por proyecto (modules/shared/db).
 */
const MEMBER_ALLOWED = [
  /^\/hoy$/,
  /^\/proyectos(\/(?!nuevo|plantillas)[^/]+(\/.*)?)?$/,
  /^\/tareas(\/.*)?$/,
  /^\/sitios(\/(?!nuevo)[^/]+(\/.*)?)?$/,
  /^\/notificaciones$/,
  /^\/configuracion(\/(seguridad|notificaciones|app))?$/,
];
export const memberCanOpen = (path: string) => MEMBER_ALLOWED.some((re) => re.test(path));

/** Contexto autenticado de la app interna. Redirige a /login, al portal (clientes) o a la configuración obligatoria de 2FA. */
export const requireCtx = cache(async (): Promise<AppCtx> => {
  const s = await getSession();
  if (!s) redirect("/login");
  const m = await getMembership(s.user.id);
  if (!m) redirect("/login?error=sin-acceso");
  // Los clientes nunca entran a la app interna: solo al portal.
  if (m.m.role === "client") redirect("/portal");
  if (!s.user.twoFactorEnabled) redirect("/seguridad/2fa");
  const h = await headers();
  const path = h.get("x-pathname");
  if (m.m.role === "member" && path && !memberCanOpen(path)) redirect("/hoy");
  return {
    workspaceId: m.w.id,
    userId: s.user.id,
    role: m.m.role as Role,
    actor: { type: "user", id: s.user.id, name: s.user.name },
    grants: await loadGrants(m.w.id, s.user.id, m.m.role as Role),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    user: { id: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image ?? null },
    workspace: m.w,
  };
});

/**
 * Contexto para Route Handlers de la app interna (p. ej. /api/sync): mismas reglas que requireCtx pero sin
 * redirecciones; `null` si no hay sesión válida (el handler responde 401).
 */
export async function apiCtx(): Promise<AppCtx | null> {
  const s = await getSession();
  if (!s?.user.twoFactorEnabled) return null;
  const m = await getMembership(s.user.id);
  if (!m || m.m.role === "client") return null;
  const h = await headers();
  return {
    workspaceId: m.w.id,
    userId: s.user.id,
    role: m.m.role as Role,
    actor: { type: "user", id: s.user.id, name: s.user.name },
    grants: await loadGrants(m.w.id, s.user.id, m.m.role as Role),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    user: { id: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image ?? null },
    workspace: m.w,
  };
}

export type PortalCtx = AppCtx & { clientId: string | null };

/** Contexto del portal de clientes: solo rol `client` activo. 2FA opcional. El cliente del CRM sale de user_preference. */
export const requirePortalCtx = cache(async (): Promise<PortalCtx> => {
  const s = await getSession();
  if (!s) redirect("/login");
  const m = await getMembership(s.user.id);
  if (!m) redirect("/login?error=sin-acceso");
  if (m.m.role !== "client") redirect("/hoy");
  // Rate limit por usuario para todo el portal (pantallas, descargas, acciones).
  await assertRateLimit(`portal:${s.user.id}`, RATE_RULES.portalRequest);
  const h = await headers();
  const [pref] = await getDb()
    .select({ value: schema.userPreference.value })
    .from(schema.userPreference)
    .where(and(eq(schema.userPreference.userId, s.user.id), eq(schema.userPreference.key, portalPrefKey(m.w.id))));
  const v = pref?.value as { workspaceId?: string; clientId?: string } | undefined;
  return {
    workspaceId: m.w.id,
    userId: s.user.id,
    role: "client",
    actor: { type: "user", id: s.user.id, name: s.user.name },
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    user: { id: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image ?? null },
    workspace: m.w,
    clientId: v?.workspaceId === m.w.id ? (v.clientId ?? null) : null,
  };
});

/** IP del pedido (detrás del proxy: primer valor de x-forwarded-for). */
export async function requestIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "sin-ip";
}

export function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}
