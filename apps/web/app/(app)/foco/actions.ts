"use server";

import { setTaskStatus } from "@agencyos/modules/tasks/service";
import { logFocusSession } from "@agencyos/modules/today/service";
import { run } from "@/lib/action";

export const logFocusAction = async (data: { taskId?: string; startedAt: string; minutes: number; notesMd?: string }) => run((ctx) => logFocusSession(ctx, data));
export const completeFocusTaskAction = async (taskId: string) => run((ctx) => setTaskStatus(ctx, taskId, "done"));
