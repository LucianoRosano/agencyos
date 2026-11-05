"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/seo/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

export const startAuditAction = async (_: S, fd: FormData) => run((ctx) => svc.startAudit(ctx, obj(fd)));
export const reauditAction = async (id: string) => run((ctx) => svc.reaudit(ctx, id));
export const cancelAuditAction = async (id: string) => run((ctx) => svc.cancelAudit(ctx, id));
export const deleteAuditAction = async (id: string) => run((ctx) => moveToTrash(ctx, "seo_audit", id));
export const restoreAuditAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "seo_audit", id));
export const createTasksAction = async (_: S, fd: FormData) => run((ctx) => svc.createTasksFromIssues(ctx, obj(fd)));
export const saveGoogleKeyAction = async (_: S, fd: FormData) => run((ctx) => svc.saveGoogleApiKey(ctx, obj(fd)));
export const removeGoogleKeyAction = async () => run((ctx) => svc.removeGoogleApiKey(ctx));
export const createScheduleAction = async (_: S, fd: FormData) => run((ctx) => svc.createSchedule(ctx, obj(fd)));
export const setScheduleActiveAction = async (id: string, active: boolean) => run((ctx) => svc.setScheduleActive(ctx, id, active));
export const deleteScheduleAction = async (id: string) => run((ctx) => moveToTrash(ctx, "seo_schedule", id));
export const restoreScheduleAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "seo_schedule", id));
