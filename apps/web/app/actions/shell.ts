"use server";

import { forbidden, type Result, toResultError } from "@agencyos/core";
import { capture } from "@agencyos/modules/inbox/service";
import { globalSearch } from "@agencyos/modules/search/service";
import { ACTIVE_WORKSPACE_COOKIE, canSwitchTo, createWorkspace } from "@agencyos/modules/workspaces/service";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { run } from "@/lib/action";
import { getSession, requireCtx } from "@/lib/session";

const YEAR = 60 * 60 * 24 * 365;

export async function setSpaceAction(spaceId: string) {
  (await cookies()).set("ag-space", spaceId || "all", { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: true });
  return run(async () => spaceId);
}

export async function setThemeAction(theme: "dark" | "light" | "system") {
  (await cookies()).set("ag-theme", theme, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return run(async () => theme);
}

export async function searchAction(q: string) {
  const ctx = await requireCtx();
  return globalSearch(ctx, q, { limit: 24 });
}

export async function captureAction(_prev: unknown, fd: FormData) {
  return run((ctx) => capture(ctx, Object.fromEntries(fd)));
}

export async function quickTaskAction(title: string) {
  const { createTask } = await import("@agencyos/modules/tasks/service");
  const { todayAR } = await import("@agencyos/core");
  return run((ctx) => createTask(ctx, { title, dueDate: todayAR() }));
}

/** Cookie del workspace activo: solo guarda la preferencia; requireCtx la valida contra las memberships activas. */
async function setActiveWorkspace(workspaceId: string) {
  const jar = await cookies();
  jar.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    httpOnly: true,
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
  });
  // El filtro de espacio (ag-space) es de otro workspace: se reinicia.
  jar.set("ag-space", "all", { path: "/", maxAge: YEAR, sameSite: "lax", httpOnly: true });
}

/** Cambiar de espacio de trabajo desde el selector de la barra lateral. */
export async function switchWorkspaceAction(workspaceId: string): Promise<Result<null>> {
  let to: string;
  try {
    const s = await getSession();
    if (!s) throw forbidden();
    const m = await canSwitchTo(s.user.id, workspaceId);
    if (!m) throw forbidden("No tenés acceso a ese espacio de trabajo.");
    await setActiveWorkspace(workspaceId);
    to = m.role === "client" ? "/portal" : "/hoy";
  } catch (e) {
    return toResultError(e);
  }
  redirect(to);
}

/** El dueño crea un espacio de trabajo nuevo y pasa a trabajar en él. */
export async function createWorkspaceAction(_prev: unknown, fd: FormData): Promise<Result<null>> {
  try {
    const ctx = await requireCtx();
    const ws = await createWorkspace(ctx, { name: fd.get("name") });
    await setActiveWorkspace(ws.id);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return toResultError(e);
  }
  redirect("/hoy");
}
