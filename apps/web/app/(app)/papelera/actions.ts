"use server";

import { purgeOne, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

export const restoreAction = async (type: string, id: string) => run((ctx) => restoreFromTrash(ctx, type, id));
export const purgeAction = async (type: string, id: string) => run((ctx) => purgeOne(ctx, type, id));
