import { uploadFile } from "@agencyos/modules/library/service";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";
import { fileNameFrom, forbiddenOrigin, jsonResult, readBody, sameOrigin } from "./upload-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subida de un archivo (cuerpo crudo, un archivo por pedido; el cliente manda varios en serie con progreso).
 * Nombre en `X-File-Name` (URL-encoded). Metadatos por query: folderId, clientId, projectId, siteId, attachType, attachId, dedupe.
 * No usa Server Actions para no subir el límite global de cuerpo (2 MB).
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const ctx = await requireCtx();
  return jsonResult(async () => {
    const data = await readBody(req);
    const meta = Object.fromEntries(req.nextUrl.searchParams);
    const { file, duplicate } = await uploadFile(ctx, fileNameFrom(req), data, meta);
    return { id: file.id, name: file.name, kind: file.kind, duplicate };
  });
}
