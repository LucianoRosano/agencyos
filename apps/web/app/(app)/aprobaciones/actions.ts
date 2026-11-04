"use server";

import { decideApproval } from "@agencyos/modules/approvals/service";
import { run } from "@/lib/action";

export const approveAction = async (id: string) => run((ctx) => decideApproval(ctx, id, "approved"));
export const rejectAction = async (id: string) => run((ctx) => decideApproval(ctx, id, "rejected"));
