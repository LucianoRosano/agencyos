import { listAudit } from "@agencyos/modules/settings/service";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";
const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET() {
  const ctx = await requireCtx();
  const rows = await listAudit(ctx, { limit: 10000 });
  const csv = ["fecha,actor,accion,objeto,id,ip", ...rows.map((r) => [r.at.toISOString(), r.actorType, r.action, r.targetType, r.targetId, r.ip].map(esc).join(","))].join("\n");
  return new Response(`﻿${csv}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="auditoria.csv"' } });
}
