import { formatDateTime } from "@agencyos/core";
import { listActivityPage } from "@agencyos/modules/activity/queries";
import { listAuditPage } from "@agencyos/modules/settings/service";
import { Card, SectionLabel, Tabs } from "@agencyos/ui";
import { ActivityList } from "@/components/activity-list";
import { LoadMore } from "@/components/load-more";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Actividad · Configuración" };

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
  // Paginadas por cursor ("Cargar más" con ?hasta=): solo se consulta la pestaña visible.
  const activity = tab === "actividad" ? await listActivityPage(ctx, { hasta: sp.hasta, pageSize: 100 }) : null;
  const audit = tab === "auditoria" ? await listAuditPage(ctx, { hasta: sp.hasta, pageSize: 100 }) : null;
  return (
    <Card className="p-5">
      <Tabs
        active={tab}
        items={[
          { key: "actividad", label: "Actividad", href: "/configuracion/actividad" },
          { key: "auditoria", label: "Auditoría", href: "/configuracion/actividad?ver=auditoria" },
        ]}
      />
      {tab === "actividad" ? (
        <>
          <ActivityList rows={activity?.items ?? []} />
          <LoadMore
            basePath="/configuracion/actividad"
            params={{}}
            nextCursor={activity?.nextCursor ?? null}
            capped={activity?.capped}
            shown={activity?.items.length ?? 0}
          />
        </>
      ) : (
        <>
          <SectionLabel className="mb-3">
            Registro inmutable ·{" "}
            <a className="normal-case tracking-normal text-accent hover:underline" href="/api/auditoria.csv">
              exportar CSV
            </a>
          </SectionLabel>
          <ul className="divide-y divide-border">
            {(audit?.items ?? []).map((a) => (
              <li key={a.id} className="grid gap-1 py-2.5 text-[13px] md:grid-cols-[170px_1fr_auto]">
                <span className="font-mono text-text-faint">{formatDateTime(a.at)}</span>
                <span className="text-text">
                  {ACTION_LABEL[a.action] ?? a.action}
                  {a.targetId && a.action.startsWith("mcp") ? ` · ${a.targetId}` : ""}
                </span>
                <span className="text-text-muted">
                  {a.actorType === "agent" ? "Claude (MCP)" : a.actorType === "system" ? "Sistema" : "Usuario"}
                  {a.ip ? ` · ${a.ip}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <LoadMore
            basePath="/configuracion/actividad"
            params={{ ver: "auditoria" }}
            nextCursor={audit?.nextCursor ?? null}
            capped={audit?.capped}
            shown={audit?.items.length ?? 0}
          />
        </>
      )}
    </Card>
  );
}
