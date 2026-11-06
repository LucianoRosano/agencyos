"use server";

import { type Result, validation } from "@agencyos/core";
import { verifyPassword } from "@agencyos/modules/auth/reauth";
import { fakeModeEnabled } from "@agencyos/modules/repos/github";
import { FAKE_INSTALLATION_ID } from "@agencyos/modules/repos/github-fake";
import * as svc from "@agencyos/modules/repos/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

export const syncReposAction = async () => run((ctx) => svc.syncWorkspace(ctx));
export const generatePlanAction = async (repositoryIds?: string[]) => run((ctx) => svc.generatePlan(ctx, { repositoryIds }));
export const updateLinksAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateLinks(ctx, id, obj(fd)));
export const createRepoPlanAction = async (projectId: string, _: S, fd: FormData) => run((ctx) => svc.createRepoPlan(ctx, projectId, obj(fd)));
export const previewRepoNameAction = async (projectId: string, input: { scope: string; tech?: string; name: string }) =>
  run((ctx) => svc.previewRepoName(ctx, projectId, input), { revalidate: false });
export const rejectPlanAction = async (id: string) => run((ctx) => svc.rejectPlan(ctx, id));

/** Aprobar exige reautenticación (docs/08 §2): contraseña + acciones elegidas. */
export const approvePlanAction = async (id: string, _: S, fd: FormData) =>
  run(async (ctx) => {
    await verifyPassword(ctx.user.id, String(fd.get("password") ?? ""));
    return svc.approvePlan(ctx, id, { actionIds: fd.getAll("actionIds").map(String) });
  });

/** Solo en modo simulado (tests): conecta la instalación de fixtures. En producción no existe. */
export const connectFakeAction = async () =>
  run(async (ctx) => {
    if (!fakeModeEnabled()) throw validation("No disponible.");
    await svc.connectInstallation(ctx, FAKE_INSTALLATION_ID);
    return svc.syncWorkspace(ctx);
  });
