import { uploadVersion } from "@agencyos/modules/library/service";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";
import { fileNameFrom, forbiddenOrigin, jsonResult, readBody, sameOrigin } from "../../upload-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nueva versión de un archivo (mismo formato que la subida). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const ctx = await requireCtx();
  const { id } = await params;
  return jsonResult(async () => {
    const data = await readBody(req);
    const row = await uploadVersion(ctx, id, fileNameFrom(req), data);
    return { id, version: row?.currentVersion };
  });
}
