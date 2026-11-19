"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/retainers/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;

export const createRetainerAction = async (_: S, fd: FormData) => run((ctx) => svc.createRetainer(ctx, Object.fromEntries(fd)));
export const updateRetainerAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateRetainer(ctx, id, Object.fromEntries(fd)));
export const setRetainerStatusAction = async (id: string, status: "active" | "paused" | "cancelled") => run((ctx) => svc.setRetainerStatus(ctx, id, status));
export const deleteRetainerAction = async (id: string) => run((ctx) => moveToTrash(ctx, "retainer", id));
export const restoreRetainerAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "retainer", id));
