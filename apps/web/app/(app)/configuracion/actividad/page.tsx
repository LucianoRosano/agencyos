import { formatDateTime } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { listAudit } from "@agencyos/modules/settings/service";
import { Card, SectionLabel, Tabs } from "@agencyos/ui";
import { ActivityList } from "@/components/activity-list";
import { requireCtx } from "@/lib/session";

const ACTION_LABEL: Record<string, string> = {
  "setup.owner_created": "Cuenta del dueño creada",
  "mcp_token.created": "Token MCP creado",
  "mcp_token.revoked": "Token MCP revocado",
  "mcp.tool": "Claude usó una herramienta",
  "mcp.denied": "Claude: acción rechazada",
  "mcp.error": "Claude: error",
  "export.full": "Exportación total",
  "entity.purged": "Eliminación definitiva",
  "trash.purged": "Purga de papelera",
  "fiscal.viewed": "Datos fiscales vistos",
  "workspace.settings_updated": "Datos de la agencia actualizados",
  "workspace.modules_updated": "Módulos actualizados",
  "backup.completed": "Backup completado",
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const tab = sp.ver === "auditoria" ? "auditoria" : "actividad";
  return (
    <Card className="p-5">
      <Tabs active={tab} items={[{ key: "actividad", label: "Actividad", href: "/configuracion/actividad" }, { key: "auditoria", label: "Auditoría", href: "/configuracion/actividad?ver=auditoria" }]} />
      {tab === "actividad" ? (
        <ActivityList rows={await listActivity(ctx, { limit: 150 })} />
      ) : (
        <>
          <SectionLabel className="mb-3">Registro inmutable · <a className="normal-case tracking-normal text-accent hover:underline" href="/api/auditoria.csv">exportar CSV</a></SectionLabel>
          <ul className="divide-y divide-border">
            {(await listAudit(ctx)).map((a) => (
              <li key={a.id} className="grid gap-1 py-2.5 text-[13px] md:grid-cols-[170px_1fr_auto]">
                <span className="font-mono text-text-faint">{formatDateTime(a.at)}</span>
                <span className="text-text">{ACTION_LABEL[a.action] ?? a.action}{a.targetId && a.action.startsWith("mcp") ? ` · ${a.targetId}` : ""}</span>
                <span className="text-text-muted">{a.actorType === "agent" ? "Claude (MCP)" : a.actorType === "system" ? "Sistema" : "Usuario"}{a.ip ? ` · ${a.ip}` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
