"use server";

import type { Result } from "@agencyos/core";
import { postponeBlocker, resolveBlocker, setNextAction } from "@agencyos/modules/projects/service";
import {
  completeReminder,
  createReminder,
  getTodayLayout,
  pickFocus,
  reopenReminder,
  saveTodayLayout,
  TODAY_BLOCKS,
  type TodayLayout,
  unpickFocus,
} from "@agencyos/modules/today/service";
import { z } from "zod";
import { run } from "@/lib/action";

export const pickFocusAction = async (taskId: string) => run((ctx) => pickFocus(ctx, taskId));
export const unpickFocusAction = async (taskId: string) => run((ctx) => unpickFocus(ctx, taskId));
export const completeReminderAction = async (id: string) => run((ctx) => completeReminder(ctx, id));
export const reopenReminderAction = async (id: string) => run((ctx) => reopenReminder(ctx, id));
export const createReminderAction = async (_: Result<unknown> | null, fd: FormData) => run((ctx) => createReminder(ctx, Object.fromEntries(fd)));
export const resolveBlockerAction = async (id: string) => run((ctx) => resolveBlocker(ctx, id));
export const postponeBlockerAction = async (id: string) => run((ctx) => postponeBlocker(ctx, id, 3));
export const defineNextActionAction = async (projectId: string, text: string) => run((ctx) => setNextAction(ctx, projectId, text));

const layoutSchema = z.object({ order: z.array(z.enum(TODAY_BLOCKS)), hidden: z.array(z.enum(TODAY_BLOCKS)) });
export const saveLayoutAction = async (layout: TodayLayout) =>
  run(async (ctx) => {
    const parsed = layoutSchema.parse(layout);
    await saveTodayLayout(ctx.user.id, parsed);
    return getTodayLayout(ctx.user.id);
  });
