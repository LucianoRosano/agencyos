"use server";

import { indexPending } from "@agencyos/modules/brain/knowledge";
import { run } from "@/lib/action";

/** Ponerse al día ya (sin esperar al worker): indexa hasta 300 fuentes de este espacio de trabajo. */
export const indexNowAction = async () => run((ctx) => indexPending({ workspaceId: ctx.workspaceId, limit: 50 }));
