import { attachFeedbackCapture, MAX_CAPTURE_BYTES } from "@agencyos/modules/portal/service";
import { assertRateLimit, RATE_RULES } from "@agencyos/modules/shared/rate-limit";
import type { NextRequest } from "next/server";
import { fileNameFrom, forbiddenOrigin, jsonResult, readBody, sameOrigin } from "@/app/api/files/upload-utils";
import { requirePortalCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Captura del feedback del portal (cuerpo crudo, una imagen por pedido; nombre en X-File-Name).
 * Exige sesión de cliente, mismo origen y que el ítem sea de una ronda abierta de un sitio de SU cliente.
 * Máximo 10 MB (se corta la lectura apenas se pasa).
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const pc = await requirePortalCtx();
  return jsonResult(async () => {
    await assertRateLimit(`portal:captura:${pc.userId}`, RATE_RULES.portalCapture);
    const data = await readBody(req, MAX_CAPTURE_BYTES, "La captura supera los 10 MB.");
    return attachFeedbackCapture(pc, req.nextUrl.searchParams.get("item") ?? "", fileNameFrom(req), data);
  });
}
