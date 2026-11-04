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
