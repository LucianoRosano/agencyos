"use server";

import { markAllRead, markRead } from "@agencyos/modules/notifications/service";
import { run } from "@/lib/action";

export const markAllReadAction = async () => run((ctx) => markAllRead(ctx));
export const markReadAction = async (id: string) => run((ctx) => markRead(ctx, id));
