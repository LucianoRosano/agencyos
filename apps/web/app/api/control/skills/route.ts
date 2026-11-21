import { can } from "@agencyos/core";
import { exportSkillsZip } from "@agencyos/modules/devos/service";
import { apiCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skills activas como `.claude/skills/<slug>/SKILL.md` (formato de Claude Code), en un ZIP para descomprimir en el repo o en ~/.claude. */
export async function GET() {
  const ctx = await apiCtx();
  if (!ctx || !can(ctx, "read", "agent")) return new Response("Sin permiso", { status: 403 });
  const buf = await exportSkillsZip(ctx);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="agencyos-skills.zip"',
      "Cache-Control": "private, no-store",
    },
  });
}
