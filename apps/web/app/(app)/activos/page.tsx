import { formatDate } from "@agencyos/core";
import { assetFormOptions, assetKindLabel, assetsOverview, convertibleReminders } from "@agencyos/modules/assets/queries";
import { listMonitoredEnvironments, monitoringFormOptions } from "@agencyos/modules/monitoring/queries";
import { BlockCard, cn, EmptyState } from "@agencyos/ui";
import { Activity, CalendarClock, ChevronRight, Globe, Server, ShieldCheck, Shuffle } from "lucide-react";
import Link from "next/link";
import { ConvertReminderButton, NewDomainButton } from "@/components/assets/asset-forms";
import { AssetsHeader } from "@/components/assets/header";
import { NewEnvironmentButton } from "@/components/assets/monitor-ui";
import { StatusBadge } from "@/components/assets/shared";
import { UptimeBars } from "@/components/assets/uptime";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Activos técnicos" };

const ICON = { domain: <Globe />, hosting: <Server />, certificate: <ShieldCheck /> } as const;

export default async function ActivosPage() {
  const ctx = await requireCtx();
  const [due, envs, reminders, aopts, mopts] = await Promise.all([
    assetsOverview(ctx, 90),
    listMonitoredEnvironments(ctx),
    convertibleReminders(ctx),
    assetFormOptions(ctx),
    monitoringFormOptions(ctx),
  ]);
  const envOptions = { sites: mopts.sites, hostings: mopts.hostings, clients: aopts.clients };
  const down = envs.filter((e) => e.monitorEnabled && e.lastStatus === "down").length;
  const overdue = due.filter((d) => d.daysLeft < 0).length;

  return (
    <div className="mx-auto max-w-6xl">
      <AssetsHeader
        active="resumen"
        title="Activos técnicos"
        description="Dominios, hosting, certificados, productos propios y el estado de cada sitio, con avisos antes de que algo venza o se caiga."
        actions={<NewDomainButton options={aopts} variant="secondary" />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "Vencen en 30 días", v: due.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 30).length, tone: "text-warning" },
          { k: "Vencidos", v: overdue, tone: overdue ? "text-danger" : "text-text" },
          { k: "Sitios monitoreados", v: envs.filter((e) => e.monitorEnabled).length, tone: "text-text" },
          { k: "Caídos ahora", v: down, tone: down ? "text-danger" : "text-text" },
        ].map((x) => (
          <div key={x.k} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{x.k}</p>
            <p className={cn("mt-1 font-mono text-[26px] font-semibold tabular-nums", x.v ? x.tone : "text-text")}>{x.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <BlockCard icon={<CalendarClock />} title="Próximos vencimientos · 90 días">
          {due.length ? (
            <ul className="flex flex-col">
              {due.map((d) => (
                <li key={`${d.kind}-${d.id}`} className="border-b border-border last:border-0">
                  <Link href={d.href} className="flex min-h-11 items-center gap-3 py-2.5">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-[10px] border [&>svg]:size-4",
                        d.daysLeft <= 7
                          ? "border-danger/30 bg-danger-soft text-danger"
                          : d.daysLeft <= d.notifyDaysBefore
                            ? "border-warning/30 bg-warning-soft text-warning"
                            : "border-border bg-surface-2 text-text-muted",
                      )}
                    >
                      {ICON[d.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-text">{d.title}</span>
                      <span className="block truncate text-[12px] text-text-muted">{[assetKindLabel(d), d.clientName].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={cn(
                          "block text-[13px]",
                          d.daysLeft < 0
                            ? "text-danger"
                            : d.daysLeft <= 7
                              ? "text-danger"
                              : d.daysLeft <= d.notifyDaysBefore
                                ? "text-warning"
                                : "text-text-muted",
                        )}
                      >
                        {d.daysLeft < 0 ? `venció hace ${-d.daysLeft} d` : d.daysLeft === 0 ? "hoy" : `en ${d.daysLeft} d`}
                      </span>
                      <span className="block font-mono text-[11px] text-text-faint">{formatDate(d.expiresOn)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={<CalendarClock />}
              title="Nada vence en los próximos 90 días"
              description="Cargá dominios, hostings y certificados con su fecha para que te avise a tiempo."
              action={<NewDomainButton options={aopts} label="Agregar dominio" variant="secondary" />}
            />
          )}
        </BlockCard>

        <BlockCard
          icon={<Activity />}
          title="Sitios monitoreados"
          action={
            envs.length ? (
              <Link href="/activos/monitoreo" className="inline-flex min-h-11 items-center gap-1 text-[13px] text-text-muted hover:text-text md:min-h-0">
                ver todo <ChevronRight className="size-3.5" />
              </Link>
            ) : null
          }
        >
          {envs.length ? (
            <ul className="flex flex-col">
              {envs.slice(0, 8).map((e) => (
                <li key={e.id} className="flex flex-col gap-2 border-b border-border py-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={e.monitorEnabled ? e.lastStatus : null} />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-text">{e.siteName}</span>
                    <span className="font-mono text-[12px] tabular-nums text-text-muted">
                      {e.uptime24 !== null ? `${e.uptime24.toLocaleString("es-AR")} %` : "—"}
                      {e.latency24 !== null ? ` · ${e.latency24} ms` : ""}
                    </span>
                  </div>
                  <UptimeBars hours={e.hours} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={<Activity />}
              title="Ningún sitio monitoreado"
              description="Chequeo cada 5 minutos, aviso si se cae y lectura automática del SSL."
              action={<NewEnvironmentButton options={envOptions} variant="secondary" />}
            />
          )}
        </BlockCard>
      </div>

      {reminders.length ? (
        <BlockCard icon={<Shuffle />} title="Vencimientos sueltos para ordenar" className="mt-5">
          <p className="mb-3 text-[13px] text-text-muted">
            Estos vencimientos se cargaron antes de que existiera Activos técnicos. Convertilos en certificado, dominio u hosting para tenerlos con su cliente y
            su aviso.
          </p>
          <ul className="flex flex-col">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-text">{r.title}</span>
                  <span className="block font-mono text-[11px] text-text-faint">vence el {formatDate(r.dueDate)}</span>
                </span>
                <ConvertReminderButton r={r} />
              </li>
            ))}
          </ul>
        </BlockCard>
      ) : null}
    </div>
  );
}
