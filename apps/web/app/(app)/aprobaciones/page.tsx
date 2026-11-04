import { formatDateTime } from "@agencyos/core";
import { listApprovals } from "@agencyos/modules/approvals/service";
import { Badge, Card, EmptyState, PageHeader } from "@agencyos/ui";
import { ShieldCheck } from "lucide-react";
import { requireCtx } from "@/lib/session";
import { ApprovalButtons } from "./buttons";

export const metadata = { title: "Aprobaciones" };

export default async function ApprovalsPage() {
  const ctx = await requireCtx();
  const items = await listApprovals(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Humano en el bucle" title="Aprobaciones" description="Lo que Claude propone y no tiene permiso para hacer solo." accent="#7C5CFF" />
      {items.length ? (
        <div className="flex flex-col gap-3">
          {items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{a.requestedByType === "agent" ? "Claude (MCP)" : "Sistema"} · {formatDateTime(a.createdAt)}</p>
                <Badge tone={a.status === "pending" ? "warning" : a.status === "approved" ? "success" : "neutral"}>{a.status === "pending" ? "Pendiente" : a.status === "approved" ? "Aprobada" : "Rechazada"}</Badge>
              </div>
              <p className="text-[16px] font-medium">{a.title}</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-[12px] text-text-muted">{String((a.proposal as { detalle?: string }).detalle ?? "")}</pre>
              {a.status === "pending" ? <ApprovalButtons id={a.id} /> : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<ShieldCheck />} title="Sin propuestas" description="Cuando Claude proponga un cambio fuera de sus permisos, aparece acá para que lo apruebes o rechaces." />
      )}
    </div>
  );
}
