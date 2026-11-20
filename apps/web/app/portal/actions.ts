"use server";

import { ok, type Result, toResultError } from "@agencyos/core";
import * as portal from "@agencyos/modules/portal/service";
import { assertRateLimit, RATE_RULES } from "@agencyos/modules/shared/rate-limit";
import { revalidatePath } from "next/cache";
import { type PortalCtx, requirePortalCtx } from "@/lib/session";

/** Como run() pero con el contexto del portal (solo rol cliente). */
async function runPortal<T>(fn: (pc: PortalCtx) => Promise<T>): Promise<Result<T>> {
  try {
    const pc = await requirePortalCtx();
    await assertRateLimit(`portal:write:${pc.userId}`, RATE_RULES.portalWrite);
    const data = await fn(pc);
    revalidatePath("/portal", "layout");
    return ok(data);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_")
    )
      throw e;
    return toResultError(e);
  }
}

type S = Result<unknown> | null;
export const approveDeliverableAction = async (id: string) => runPortal((pc) => portal.decideDeliverable(pc, id, { decision: "approve" }).then(() => null));
export const requestChangesAction = async (id: string, _: S, fd: FormData) =>
  runPortal((pc) => portal.decideDeliverable(pc, id, { decision: "changes", comment: fd.get("comment") }).then(() => null));
export const feedbackAction = async (projectId: string, _: S, fd: FormData) =>
  runPortal((pc) => portal.addSiteFeedback(pc, projectId, Object.fromEntries(fd)).then((item) => ({ id: item?.id ?? null })));
export const decideQuoteAction = async (quoteId: string, _: S, fd: FormData) =>
  runPortal((pc) => portal.decidePortalQuote(pc, quoteId, Object.fromEntries(fd)));
export const surveyAction = async (projectId: string, _: S, fd: FormData) =>
  runPortal((pc) => portal.answerSurvey(pc, projectId, Object.fromEntries(fd)).then(() => null));
