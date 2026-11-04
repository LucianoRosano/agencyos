import { formatDateTime, relativeFromDate } from "@agencyos/core";
import { systemStatus } from "@agencyos/modules/settings/service";
import { Badge, Card, SectionLabel } from "@agencyos/ui";
import { requireCtx } from "@/lib/session";

export default async function StatusPage() {
  const ctx = await requireCtx();
  const s = await systemStatus(ctx);
  const workerOk = s.workerSeenAt && Date.now() - s.workerSeenAt.getTime() < 10 * 60_000;
  const backupOk = s.lastBackupAt && Date.now() - s.lastBackupAt.getTime() < 36 * 3_600_000;
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-[14px] last:border-0">
      <dt className="text-text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="p-5">
        <SectionLabel className="mb-3">Aplicación</SectionLabel>
        <dl>
          {row("Versión", <span className="font-mono">{s.version}</span>)}
          {row("Node.js", <span className="font-mono">{s.node}</span>)}
          {row("PostgreSQL", <span className="font-mono">{s.db.version}</span>)}
          {row("Tamaño de la base", <span className="font-mono">{s.db.size}</span>)}
          {row("Email (Brevo)", s.integrations.brevo ? <Badge tone="success">OK</Badge> : <Badge tone="warning">Sin configurar</Badge>)}
        </dl>
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-3">Worker y backups</SectionLabel>
        <dl>
          {row(
            "Worker",
            workerOk ? (
              <Badge tone="success">Activo · {relativeFromDate(s.workerSeenAt)}</Badge>
            ) : (
              <Badge tone="danger">{s.workerSeenAt ? `Sin señal desde ${formatDateTime(s.workerSeenAt)}` : "Nunca se conectó"}</Badge>
            ),
          )}
          {row("Eventos sin despachar", <span className="font-mono">{s.outbox.pending}</span>)}
          {row("Jobs fallidos (7 días)", <span className="font-mono">{s.failedJobs.reduce((a, b) => a + b.n, 0)}</span>)}
          {row(
            "Último backup",
            backupOk ? (
              <Badge tone="success">{formatDateTime(s.lastBackupAt)}</Badge>
            ) : (
              <Badge tone="warning">{s.lastBackupAt ? formatDateTime(s.lastBackupAt) : "Sin backups registrados"}</Badge>
            ),
          )}
        </dl>
        {s.queue.length ? <p className="mt-3 font-mono text-[12px] text-text-faint">Cola: {s.queue.map((q) => `${q.state} ${q.n}`).join(" · ")}</p> : null}
      </Card>
    </div>
  );
}
