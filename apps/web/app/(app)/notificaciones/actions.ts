"use server";

import type { Result } from "@agencyos/core";
import {
  archiveNotification,
  markAllRead,
  markRead,
  markUnread,
  markUnreadMany,
  snoozeNotification,
  unsnoozeNotification,
} from "@agencyos/modules/notifications/service";
import { saveNotifySettings } from "@agencyos/modules/notifications/settings";
import { run } from "@/lib/action";

export const markAllReadAction = async () => run((ctx) => markAllRead(ctx));
export const markUnreadManyAction = async (ids: string[]) => run((ctx) => markUnreadMany(ctx, ids));
export const markReadAction = async (id: string) => run((ctx) => markRead(ctx, id));
export const markUnreadAction = async (id: string) => run((ctx) => markUnread(ctx, id));
export const archiveAction = async (id: string, archived = true) => run((ctx) => archiveNotification(ctx, id, archived));
export const snoozeAction = async (id: string, option: string) => run((ctx) => snoozeNotification(ctx, id, option));
export const unsnoozeAction = async (id: string) => run((ctx) => unsnoozeNotification(ctx, id));
export const saveNotifySettingsAction = async (_: Result<unknown> | null, fd: FormData) =>
  run((ctx) => saveNotifySettings(ctx.userId ?? "", Object.fromEntries(fd)));
