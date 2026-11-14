"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/time/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

// Registro de horas (proyectos y tareas)
export const createTimeEntryAction = async (_: S, fd: FormData) => run((ctx) => svc.createTimeEntry(ctx, obj(fd)));
export const updateTimeEntryAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateTimeEntry(ctx, id, obj(fd)));
export const deleteTimeEntryAction = async (id: string) => run((ctx) => moveToTrash(ctx, "time_entry", id));
export const restoreTimeEntryAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "time_entry", id));
export const setTargetRateAction = async (_: S, fd: FormData) => run((ctx) => svc.setTargetHourlyRate(ctx, obj(fd)));
