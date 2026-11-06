import { formatDateTime } from "@agencyos/core";
import { listAudits, SEO_LABELS, siteOptions } from "@agencyos/modules/seo/queries";
import { Badge, Card, EmptyState, Progress } from "@agencyos/ui";
import { ChevronRight, Radar } from "lucide-react";
import Link from "next/link";
import { Delta, ScoreChip, SevCounts } from "@/components/seo/bits";
import { SeoHeader } from "@/components/seo/header";
import { AutoRefresh, NewAuditSheet } from "@/components/seo/seo-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "SEO" };

const STATUS_TONE: Record<string, "neutral" | "accent" | "info" | "success" | "warning" | "danger"> = {
  queued: "neutral",
  running: "info",
  completed: "success",
  failed: "danger",
  cancelled: "warning",
};

export default async function SeoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [audits, sites] = await Promise.all([listAudits(ctx, { q: sp.q }), siteOptions(ctx)]);
  const live = audits.some((a) => a.status === "queued" || a.status === "running");
  return (
    <div className="mx-auto max-w-6xl">
      <AutoRefresh active={live} everyMs={4000} />
      <SeoHeader active="auditorias" actions={<NewAuditSheet sites={sites} />} />
      {audits.length || sp.q ? (
        <form className="mb-5" action="/seo">
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Buscar por dominio…"
            aria-label="Buscar auditorías por dominio"
            className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm"
          />
        </form>
      ) : null}
      {audits.length ? (
        <ul className="flex flex-col gap-3">
          {audits.map((a) => {
            const isLive = a.status === "queued" || a.status === "running";
            return (
              <li key={a.id}>
                <Card className="transition-colors hover:border-border-strong">
                  <Link href={`/seo/${a.id}`} className="flex items-center gap-4 p-4 md:p-5">
                    <ScoreChip score={a.score} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="truncate text-[15px] font-medium text-text">{a.siteName ?? a.host}</span>
                        <Badge tone={STATUS_TONE[a.status]}>{SEO_LABELS.status[a.status as keyof typeof SEO_LABELS.status] ?? a.status}</Badge>
                        {a.status === "completed" ? <Delta value={a.delta} suffix=" pts" /> : null}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[12px] text-text-muted">
                        {a.siteName ? `${a.host} · ` : ""}
                        {formatDateTime(a.createdAt)} · {a.pagesCrawled} páginas
                      </p>
                      {isLive ? (
                        <Progress
                          value={a.status === "queued" ? 0 : Math.min(99, (a.pagesCrawled / Math.max(1, a.maxPages)) * 100)}
                          className="mt-2.5 max-w-md"
                          label={`Progreso de la auditoría de ${a.host}`}
                        />
                      ) : null}
                      {a.status === "failed" && a.error ? <p className="mt-1 line-clamp-2 text-[13px] text-danger">{a.error}</p> : null}
                    </div>
                    <div className="hidden md:block">{a.counts ? <SevCounts counts={a.counts} labels={SEO_LABELS.severity} /> : null}</div>
                    <ChevronRight className="size-4 shrink-0 text-text-faint" aria-hidden />
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<Radar />}
            title={sp.q ? `No hay auditorías de «${sp.q}»` : "Todavía no auditaste ningún sitio"}
            description="Rastreá un sitio con datos reales: errores, enlaces rotos, títulos, robots.txt, sitemap, datos estructurados y rendimiento. Después podés comparar y convertir los problemas en tareas."
            action={<NewAuditSheet sites={sites} />}
          />
        </Card>
      )}
    </div>
  );
}
