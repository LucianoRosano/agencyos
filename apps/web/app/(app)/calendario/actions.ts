"use server";

import type { Result } from "@agencyos/core";
import { revokeIcalToken, rotateIcalToken } from "@agencyos/modules/calendar/service";
import { createReminder } from "@agencyos/modules/today/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;

export const createReminderAction = async (_: S, fd: FormData) => run((ctx) => createReminder(ctx, Object.fromEntries(fd)));
/** Genera o rota el token de iCal. El token en claro solo viaja en esta respuesta. */
export const rotateIcalAction = async () => run((ctx) => rotateIcalToken(ctx));
export const revokeIcalAction = async () => run((ctx) => revokeIcalToken(ctx));
