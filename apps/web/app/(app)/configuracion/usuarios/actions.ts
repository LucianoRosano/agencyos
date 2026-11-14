"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/users/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const form = (fd: FormData) => ({
  email: fd.get("email"),
  role: fd.get("role"),
  clientId: fd.get("clientId"),
  projectIds: fd.getAll("projectIds").map(String),
});

export const inviteAction = async (_: S, fd: FormData) =>
  run(async (ctx) => {
    const r = await svc.createInvitation(ctx, form(fd));
    return { url: r.url, emailed: r.emailed };
  });
export const renewInvitationAction = async (id: string, send: boolean) =>
  run(async (ctx) => {
    const r = await svc.renewInvitation(ctx, id, { send });
    return { url: r.url, emailed: r.emailed };
  });
export const revokeInvitationAction = async (id: string) => run((ctx) => svc.revokeInvitation(ctx, id).then(() => null));
export const changeRoleAction = async (membershipId: string, _: S, fd: FormData) => run((ctx) => svc.changeRole(ctx, membershipId, form(fd)).then(() => null));
export const deactivateUserAction = async (membershipId: string) => run((ctx) => svc.deactivateUser(ctx, membershipId).then(() => null));
export const reactivateUserAction = async (membershipId: string) => run((ctx) => svc.reactivateUser(ctx, membershipId).then(() => null));
