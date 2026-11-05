"use server";

import type { Result } from "@agencyos/core";
import { verifyPassword } from "@agencyos/modules/auth/reauth";
import { createMcpToken, revokeMcpToken } from "@agencyos/modules/mcp/tokens";
import { setModules, updateProfileName, updateWorkspaceSettings } from "@agencyos/modules/settings/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
export const saveWorkspaceAction = async (_: S, fd: FormData) => run((ctx) => updateWorkspaceSettings(ctx, Object.fromEntries(fd)));
export const saveModulesAction = async (_: S, fd: FormData) => run((ctx) => setModules(ctx, fd.getAll("modules").map(String)));
export const saveProfileAction = async (_: S, fd: FormData) => run((ctx) => updateProfileName(ctx, String(fd.get("name") ?? "")));
export const createTokenAction = async (_: S, fd: FormData) =>
  run(async (ctx) => {
    await verifyPassword(ctx.user.id, String(fd.get("password") ?? ""));
    const r = await createMcpToken(ctx, { name: fd.get("name"), scopes: fd.getAll("scopes").map(String), expiresDays: fd.get("expiresDays") });
    return { token: r.token };
  });
export const revokeTokenAction = async (id: string) => run((ctx) => revokeMcpToken(ctx, id));
export const confirmPasswordAction = async (password: string) => run((ctx) => verifyPassword(ctx.user.id, password), { revalidate: false });

export const pushKeyAction = async () => {
  const { publicVapidKey } = await import("@agencyos/modules/push/service");
  return run((ctx) => publicVapidKey(ctx), { revalidate: false });
};
export const pushSubscribeAction = async (sub: unknown, ua: string) => {
  const { savePushSubscription } = await import("@agencyos/modules/push/service");
  return run((ctx) => savePushSubscription(ctx, sub, ua));
};
export const pushUnsubscribeAction = async (endpoint: string) => {
  const { removePushSubscription } = await import("@agencyos/modules/push/service");
  return run((ctx) => removePushSubscription(ctx, endpoint));
};
export const pushTestAction = async () => {
  const { sendPush } = await import("@agencyos/modules/push/service");
  return run(
    async (ctx) => {
      const n = await sendPush(ctx.workspaceId, ctx.user.id, {
        title: "AGENCYOS",
        body: "Las notificaciones push funcionan en este dispositivo.",
        url: "/hoy",
        tag: "prueba",
      });
      if (!n) throw new Error("No hay dispositivos suscriptos.");
      return n;
    },
    { revalidate: false },
  );
};
export const setPreferenceAction = async (eventType: string, channels: { inApp: boolean; push: boolean; email: boolean }) => {
  const { setPreference } = await import("@agencyos/modules/push/service");
  return run((ctx) => setPreference(ctx, eventType, channels));
};
