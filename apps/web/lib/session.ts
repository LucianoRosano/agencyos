import "server-only";
import type { Ctx, Role } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { getAuth } from "@agencyos/modules/auth/server";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

export type AppCtx = Ctx & { user: { id: string; name: string; email: string; image: string | null }; workspace: typeof schema.workspace.$inferSelect };

/** Contexto autenticado. Redirige a /login, a /setup o a la configuración obligatoria de 2FA. */
export const requireCtx = cache(async (): Promise<AppCtx> => {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.user.twoFactorEnabled) redirect("/seguridad/2fa");
  const h = await headers();
  const db = getDb();
  const [m] = await db
    .select({ m: schema.membership, w: schema.workspace })
    .from(schema.membership)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.membership.workspaceId))
    .where(and(eq(schema.membership.userId, s.user.id), eq(schema.membership.status, "active")))
    .orderBy(asc(schema.membership.createdAt))
    .limit(1);
  if (!m || m.m.role === "client") redirect("/login?error=sin-acceso");
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

export function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}
