"use server";

import { completeWeeklyReview } from "@agencyos/modules/review/service";
import { run } from "@/lib/action";

export const completeReviewAction = async (data: { wins?: string; blockers?: string; focuses: string[]; moneyNote?: string }) =>
  run((ctx) => completeWeeklyReview(ctx, data));
