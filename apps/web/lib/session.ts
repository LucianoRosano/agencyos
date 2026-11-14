import "server-only";
import type { Ctx, Role } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { getAuth } from "@agencyos/modules/auth/server";
import { portalPrefKey } from "@agencyos/modules/users/service";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

/** Primer acceso activo del usuario (hoy hay un workspace por instalación). */
export const getMembership = cache(async (userId: string) => {
  const [m] = await getDb()
    .select({ m: schema.membership, w: schema.workspace })
    .from(schema.membership)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.membership.workspaceId))
    .where(and(eq(schema.membership.userId, userId), eq(schema.membership.status, "active")))
    .orderBy(asc(schema.membership.createdAt))
    .limit(1);
  return m ?? null;
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
  /^\/configuracion(\/(seguridad|notificaciones))?$/,
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
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    user: { id: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image ?? null },
    workspace: m.w,
  };
});

export type PortalCtx = AppCtx & { clientId: string | null };

/** Contexto del portal de clientes: solo rol `client` activo. 2FA opcional. El cliente del CRM sale de user_preference. */
export const requirePortalCtx = cache(async (): Promise<PortalCtx> => {
  const s = await getSession();
  if (!s) redirect("/login");
  const m = await getMembership(s.user.id);
  if (!m) redirect("/login?error=sin-acceso");
  if (m.m.role !== "client") redirect("/hoy");
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

export function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}
