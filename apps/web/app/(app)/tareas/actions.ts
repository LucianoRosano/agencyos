"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/tasks/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

export async function createTaskAction(_prev: Result<unknown> | null, fd: FormData) {
  return run((ctx) => svc.createTask(ctx, Object.fromEntries(fd)));
}
export async function updateTaskAction(id: string, _prev: Result<unknown> | null, fd: FormData) {
  return run((ctx) => svc.updateTask(ctx, id, Object.fromEntries(fd)));
}
export async function setTaskStatusAction(id: string, status: (typeof svc.TASK_STATUSES)[number]) {
  return run((ctx) => svc.setTaskStatus(ctx, id, status));
}
export async function snoozeTaskAction(id: string, days = 1) {
  return run((ctx) => svc.snoozeTask(ctx, id, days));
}
export async function setTaskDueAction(id: string, due: string | null) {
  return run((ctx) => svc.setTaskDue(ctx, id, due));
}
export async function deleteTaskAction(id: string) {
  return run((ctx) => moveToTrash(ctx, "task", id));
}
export async function restoreTaskAction(id: string) {
  return run((ctx) => restoreFromTrash(ctx, "task", id));
}
export async function convertToProjectAction(id: string) {
  return run((ctx) => svc.convertTaskToProject(ctx, id));
}
export async function addChecklistAction(taskId: string, text: string) {
  return run((ctx) => svc.addChecklistItem(ctx, taskId, text));
}
export async function toggleChecklistAction(itemId: string) {
  return run((ctx) => svc.toggleChecklistItem(ctx, itemId));
}
export async function removeChecklistAction(itemId: string) {
  return run((ctx) => svc.removeChecklistItem(ctx, itemId));
}
