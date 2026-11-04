"use server";

import { capture } from "@agencyos/modules/inbox/service";
import { globalSearch } from "@agencyos/modules/search/service";
import { cookies } from "next/headers";
import { run } from "@/lib/action";
import { requireCtx } from "@/lib/session";

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
