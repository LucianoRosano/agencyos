"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/automations/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

export const createRuleAction = async (_: S, fd: FormData) => run((ctx) => svc.createRule(ctx, obj(fd)));
export const updateRuleAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateRule(ctx, id, obj(fd)));
export const setRuleActiveAction = async (id: string, active: boolean) => run((ctx) => svc.setRuleActive(ctx, id, active));
export const setRuleTestModeAction = async (id: string, on: boolean) => run((ctx) => svc.setRuleTestMode(ctx, id, on));
export const duplicateRuleAction = async (id: string) => run((ctx) => svc.duplicateRule(ctx, id));
export const deleteRuleAction = async (id: string) => run((ctx) => moveToTrash(ctx, "automation_rule", id));
export const restoreRuleAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "automation_rule", id));
export const previewRuleAction = async (id: string) => run((ctx) => svc.previewRule(ctx, id), { revalidate: false });
export const runRuleNowAction = async (id: string) => run((ctx) => svc.runRuleNow(ctx, id));

export const createEndpointAction = async (_: S, fd: FormData) => run((ctx) => svc.createEndpoint(ctx, obj(fd)));
export const rotateEndpointSecretAction = async (id: string) => run((ctx) => svc.rotateEndpointSecret(ctx, id));
export const setEndpointActiveAction = async (id: string, active: boolean) => run((ctx) => svc.setEndpointActive(ctx, id, active));
export const deleteEndpointAction = async (id: string) => run((ctx) => moveToTrash(ctx, "webhook_endpoint", id));
export const restoreEndpointAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "webhook_endpoint", id));
