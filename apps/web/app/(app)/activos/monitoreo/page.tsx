import { relativeFromDate, todayAR } from "@agencyos/core";
import { assetFormOptions } from "@agencyos/modules/assets/queries";
import { listMonitoredEnvironments, monitoringFormOptions } from "@agencyos/modules/monitoring/queries";
import { Badge, Card, EmptyState, EntityChip, Sparkline } from "@agencyos/ui";
import { Activity, Puzzle } from "lucide-react";
import { AssetsHeader } from "@/components/assets/header";
import { EnvironmentActions, NewEnvironmentButton } from "@/components/assets/monitor-ui";
import { DueText, ENV_KIND, Meta, StatusBadge } from "@/components/assets/shared";
import { UptimeBars } from "@/components/assets/uptime";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Monitoreo · Activos técnicos" };

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`);

export default async function MonitoreoPage() {
  const ctx = await requireCtx();
  const [envs, mopts, aopts] = await Promise.all([listMonitoredEnvironments(ctx), monitoringFormOptions(ctx), assetFormOptions(ctx)]);
  const options = { sites: mopts.sites, hostings: mopts.hostings, clients: aopts.clients };
  const today = todayAR();
  return (
    <div className="mx-auto max-w-6xl">
      <AssetsHeader
        active="monitoreo"
        title="Monitoreo de sitios"
        description="Uptime cada 5 minutos, SSL y versiones de WordPress/PHP una vez por día. Si un sitio no responde 2 veces seguidas, te avisa."
        actions={<NewEnvironmentButton options={options} />}
        counts={{ monitoreo: envs.length }}
      />
      {envs.length ? (
        <ul className="flex flex-col gap-3">
          {envs.map((e) => {
            const series = e.hours.filter((h) => h.avgLatency !== null).map((h) => h.avgLatency as number);
            return (
              <li key={e.id} data-env={e.url}>
                <Card className={`p-4 md:p-5 ${e.monitorEnabled ? "" : "opacity-70"}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={e.monitorEnabled ? e.lastStatus : null} />
                        <h3 className="truncate text-[16px] font-medium text-text">{e.siteName}</h3>
                        <Badge>{ENV_KIND[e.kind] ?? e.kind}</Badge>
                        {!e.monitorEnabled ? <Badge tone="warning">En pausa</Badge> : null}
                        {e.clientName ? <EntityChip color="#22D3EE">{e.clientName}</EntityChip> : null}
                      </div>
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block truncate font-mono text-[13px] text-text-muted hover:text-text"
                      >
                        {e.url}
                      </a>
                    </div>
                    <EnvironmentActions
                      hostings={options.hostings}
                      env={{
                        id: e.id,
                        url: e.url,
                        kind: e.kind,
                        hostingId: e.hostingId,
                        siteId: e.siteId,
                        siteName: e.siteName,
                        monitorEnabled: e.monitorEnabled,
                        wordpress: e.wordpress ? { username: e.wordpress.username } : null,
                      }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                        <span>Últimas 24 h</span>
                        <span>{e.lastCheckedAt ? `último chequeo ${relativeFromDate(e.lastCheckedAt)}` : "sin chequeos todavía"}</span>
                      </div>
                      <UptimeBars hours={e.hours} />
                    </div>
                    <div className="hidden w-40 md:block">
                      <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">Latencia</p>
                      {series.length >= 2 ? (
                        <Sparkline values={series} color="var(--accent-2)" />
                      ) : (
                        <p className="h-7 text-[12px] text-text-faint">sin datos</p>
                      )}
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 md:grid-cols-6">
                    <Meta label="Uptime 24 h">{pct(e.uptime24)}</Meta>
                    <Meta label="Uptime 7 d">{pct(e.uptime7)}</Meta>
                    <Meta label="Latencia 24 h">{e.latency24 !== null ? `${e.latency24} ms` : "—"}</Meta>
                    <Meta label="SSL">
                      {e.url.startsWith("https://") ? <DueText expiresOn={e.sslExpiresOn} today={today} notify={14} className="text-[13px]" /> : "sin HTTPS"}
                    </Meta>
                    <Meta label="WordPress / PHP">
                      {e.wpVersion || e.phpVersion
                        ? [e.wpVersion ? `WP ${e.wpVersion}` : null, e.phpVersion ? `PHP ${e.phpVersion}` : null].filter(Boolean).join(" · ")
                        : "—"}
                    </Meta>
                    <Meta label="Hosting">{e.hostingName ?? "—"}</Meta>
                  </dl>
                  {e.wordpress ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
                      <Puzzle className="size-3.5" aria-hidden />
                      {e.wordpress.lastError ? (
                        <span className="text-danger">WordPress: {e.wordpress.lastError}</span>
                      ) : e.wordpress.plugins.length ? (
                        <span className="min-w-0 truncate">
                          {e.wordpress.plugins.length} plugins:{" "}
                          {e.wordpress.plugins
                            .slice(0, 6)
                            .map((p) => `${p.name} ${p.version}`)
                            .join(" · ")}
                          {e.wordpress.plugins.length > 6 ? " …" : ""}
                        </span>
                      ) : (
                        <span>WordPress conectado como {e.wordpress.username}; las versiones se leen en el chequeo diario.</span>
                      )}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<Activity />}
            title="Ningún sitio monitoreado"
            description="Activá el monitoreo de un sitio: chequeo cada 5 minutos, aviso si se cae y lectura automática del SSL."
            action={<NewEnvironmentButton options={options} label="Monitorear el primero" />}
          />
        </Card>
      )}
    </div>
  );
}
