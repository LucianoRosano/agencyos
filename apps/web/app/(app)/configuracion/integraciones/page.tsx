import { formatDate, formatDateTime } from "@agencyos/core";
import { listMcpTokens } from "@agencyos/modules/mcp/tokens";
import { Badge, Card, SectionLabel } from "@agencyos/ui";
import { requireCtx } from "@/lib/session";
import { NewTokenForm, RevokeButton } from "./tokens-ui";

export default async function IntegrationsPage() {
  const ctx = await requireCtx();
  const tokens = await listMcpTokens(ctx);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const brevo = Boolean(process.env.BREVO_API_KEY);
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <SectionLabel className="mb-1">Claude vía MCP</SectionLabel>
        <p className="mb-4 text-[13px] text-text-muted">
          Conectá Claude Code o claude.ai a <code className="font-mono text-text">{base}/mcp</code> con un token. Por defecto puede leer todo y crear en la
          Bandeja, tareas, notas y decisiones; lo demás lo propone como aprobación.
        </p>
        {tokens.length ? (
          <ul className="mb-5 divide-y divide-border rounded-[10px] border border-border">
            {tokens.map((t) => {
              const expired = t.expiresAt && t.expiresAt < new Date();
              return (
                <li key={t.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
                  <div className="flex-1">
                    <p className="text-[14px]">
                      {t.name} <span className="font-mono text-[12px] text-text-faint">{t.prefix}…</span>
                    </p>
                    <p className="text-[12px] text-text-muted">{t.scopes.join(" · ")}</p>
                    <p className="font-mono text-[11px] text-text-faint">
                      creado {formatDate(t.createdAt)} · vence {formatDate(t.expiresAt)} · último uso {t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "nunca"}
                    </p>
                  </div>
                  {t.revokedAt ? <Badge>Revocado</Badge> : expired ? <Badge tone="warning">Vencido</Badge> : <RevokeButton id={t.id} name={t.name} />}
                </li>
              );
            })}
          </ul>
        ) : null}
        <NewTokenForm base={base} />
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-3">Email (Brevo)</SectionLabel>
        <p className="text-[14px] text-text-muted">
          {brevo ? <Badge tone="success">Configurado</Badge> : <Badge tone="warning">Sin configurar</Badge>} Se usa para la recuperación de contraseña y avisos.
          Se activa con la variable <code className="font-mono">BREVO_API_KEY</code> en el servidor (ver docs/DEPLOYMENT.md).
        </p>
      </Card>
    </div>
  );
}
