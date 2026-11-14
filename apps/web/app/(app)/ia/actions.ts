"use server";

import type { Result } from "@agencyos/core";
import type { EntryEntity } from "@agencyos/modules/ai/agents";
import * as svc from "@agencyos/modules/ai/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

export const saveProviderAction = async (_: S, fd: FormData) => run((ctx) => svc.saveProvider(ctx, obj(fd)));
export const testProviderAction = async () => run((ctx) => svc.testProvider(ctx), { revalidate: true });
export const removeProviderKeyAction = async () => run((ctx) => svc.removeProviderKey(ctx));
export const updateAgentAction = async (key: string, _: S, fd: FormData) =>
  run((ctx) => svc.updateAgent(ctx, key, { ...obj(fd), tools: fd.getAll("tools").map(String) }));
export const setAgentEnabledAction = async (key: string, enabled: boolean) => run((ctx) => svc.setAgentEnabled(ctx, key, enabled));
export const startRunAction = async (_: S, fd: FormData) => run(async (ctx) => (await svc.startRun(ctx, obj(fd))).id);
export const startEntityRunAction = async (type: EntryEntity, id: string) => run(async (ctx) => (await svc.startEntityRun(ctx, type, id)).id);
export const cancelRunAction = async (id: string) => run((ctx) => svc.cancelRun(ctx, id));
