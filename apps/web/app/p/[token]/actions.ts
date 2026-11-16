"use server";

import { ok, type Result, toResultError } from "@agencyos/core";
import { decidePublicQuote } from "@agencyos/modules/quotes/public";
import { clientIp, RATE_LIMIT_MESSAGE, RATE_RULES, rateLimit } from "@agencyos/modules/shared/rate-limit";
import { headers } from "next/headers";

/** Acción pública (sin sesión): el token es la autorización; una sola respuesta por presupuesto. */
export async function decideAction(token: string, _prev: Result<unknown> | null, fd: FormData): Promise<Result<{ decision: string }>> {
  try {
    const h = await headers();
    if (!(await rateLimit(RATE_RULES.publicDecide, clientIp(h))).ok) return { ok: false, error: { code: "CONFLICT", message: RATE_LIMIT_MESSAGE } };
    const r = await decidePublicQuote(token, Object.fromEntries(fd), {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    });
    return ok(r);
  } catch (e) {
    return toResultError(e);
  }
}
