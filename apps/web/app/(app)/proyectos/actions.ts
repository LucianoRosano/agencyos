"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/projects/service";
import { archive, moveToTrash, restoreFromTrash, unarchive } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

export const createProjectAction = async (_: S, fd: FormData) => run((ctx) => svc.createProject(ctx, obj(fd)));
export const wizardAction = async (_: S, fd: FormData) => run((ctx) => svc.createFromTemplate(ctx, obj(fd)));
export const updateProjectAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateProject(ctx, id, obj(fd)));
export const setProjectStatusAction = async (id: string, status: (typeof svc.PROJECT_STATUSES)[number]) => run((ctx) => svc.setProjectStatus(ctx, id, status));
export const setNextActionAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.setNextAction(ctx, id, String(fd.get("nextAction") ?? "")));
export const addPhaseAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.addPhase(ctx, id, obj(fd)));
export const setPhaseStatusAction = async (phaseId: string, status: "pending" | "in_progress" | "done") =>
  run((ctx) => svc.setPhaseStatus(ctx, phaseId, status));
export const addBlockerAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.addBlocker(ctx, id, obj(fd)));
export const resolveBlockerAction = async (blockerId: string) => run((ctx) => svc.resolveBlocker(ctx, blockerId));
export const addDecisionAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.addDecision(ctx, id, obj(fd)));
export const addDeliverableAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.addDeliverable(ctx, id, obj(fd)));
export const setDeliverableStatusAction = async (did: string, status: "pending" | "delivered" | "approved" | "changes_requested") =>
  run((ctx) => svc.setDeliverableStatus(ctx, did, status));
export const addChangelogAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.addChangelogEntry(ctx, id, obj(fd)));
export const saveAsTemplateAction = async (id: string, name: string) => run((ctx) => svc.saveAsTemplate(ctx, id, name));
export const deleteProjectAction = async (id: string) => run((ctx) => moveToTrash(ctx, "project", id));
export const restoreProjectAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "project", id));
export const archiveProjectAction = async (id: string) => run((ctx) => archive(ctx, "project", id));
export const unarchiveProjectAction = async (id: string) => run((ctx) => unarchive(ctx, "project", id));
export const deleteTemplateAction = async (id: string) => run((ctx) => moveToTrash(ctx, "project_template", id));
