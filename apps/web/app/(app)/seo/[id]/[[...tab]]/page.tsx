import { formatDateTime } from "@agencyos/core";
import { comparableAudits, getAudit, SEO_LABELS } from "@agencyos/modules/seo/queries";
import { Badge, Button, Card, EmptyState, PageHeader, Progress, SectionLabel, Tabs } from "@agencyos/ui";
import { AlertTriangle, Radar } from "lucide-react";
import { notFound } from "next/navigation";
import { SEO_ACCENT } from "@/components/seo/bits";
import { ComparePanel, IssuesPanel, PagesPanel, PerformancePanel, ReportPanel, SummaryPanel } from "@/components/seo/panels";
import { AuditMenu, AutoRefresh } from "@/components/seo/seo-ui";
import { requireCtx } from "@/lib/session";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "problemas", label: "Problemas" },
  { key: "paginas", label: "Páginas" },
  { key: "rendimiento", label: "Rendimiento" },
  { key: "comparar", label: "Comparar" },
  { key: "informe", label: "Informe" },
];

const PHASES: Record<string, string> = {
  robots: "Leyendo robots.txt",
  sitemap: "Leyendo el sitemap",
  crawl: "Rastreando páginas",
  links: "Chequeando enlaces externos",
  google: "Consultando PageSpeed y CrUX",
  issues: "Calculando problemas y puntaje",
  done: "Terminando",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const a = await getAudit(ctx, (await params).id);
  return { title: a ? `SEO · ${a.host}` : "Auditoría SEO" };
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id, tab: parts } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === parts?.[0])?.key ?? "resumen";
  if (parts?.length && (parts.length > 1 || !TABS.some((t) => t.key === parts[0]))) notFound();
  const ctx = await requireCtx();
  const data = await getAudit(ctx, id);
  if (!data) notFound();
  const { audit: a, summary: s } = data;
  const live = a.status === "queued" || a.status === "running";
  const maxPages = Number((a.config as { maxPages?: number }).maxPages ?? 300);
  const issueCount = s.counts ? Object.values(s.counts).reduce((x, y) => x + y, 0) : undefined;
  const comparable = a.status === "completed" ? await comparableAudits(ctx, id) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <AutoRefresh active={live} />
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Auditoría SEO · {SEO_LABELS.status[a.status as keyof typeof SEO_LABELS.status] ?? a.status}
            {data.siteName ? <>· {data.siteName}</> : null}
          </span>
        }
        title={<span className="break-all">{data.host}</span>}
        description={`${a.rootUrl} · ${formatDateTime(a.createdAt)}`}
        accent={SEO_ACCENT}
        actions={<AuditMenu id={a.id} status={a.status} host={data.host} />}
      />
      <Tabs
        active={tab}
        items={TABS.map((t) => ({
          ...t,
          href: `/seo/${id}${t.key === "resumen" ? "" : `/${t.key}`}`,
          count: t.key === "problemas" ? issueCount : t.key === "paginas" && a.pagesCrawled ? a.pagesCrawled : undefined,
        }))}
      />

      {live ? (
        <Card className="mb-5 p-5">
          <SectionLabel icon={<Radar />} className="mb-3">
            {a.status === "queued" ? "En cola" : (PHASES[s.progress?.phase ?? "crawl"] ?? "Rastreando")}
          </SectionLabel>
          <p className="mb-3 text-[14px] text-text-muted">
            {a.status === "queued"
              ? "El worker la toma en menos de un minuto. Podés cerrar esta pantalla: sigue en segundo plano."
              : `${a.pagesCrawled} de hasta ${maxPages} páginas rastreadas${s.progress?.queued ? ` · ${s.progress.queued} en cola` : ""}${s.progress?.blocked ? ` · ${s.progress.blocked} bloqueadas por robots.txt` : ""}.`}
          </p>
          <Progress value={a.status === "queued" ? 0 : Math.min(99, (a.pagesCrawled / Math.max(1, maxPages)) * 100)} label="Progreso del rastreo" />
        </Card>
      ) : null}

      {a.status === "failed" ? (
        <Card className="mb-5 border-danger/40 p-5">
          <SectionLabel icon={<AlertTriangle />} className="mb-2">
            La auditoría falló
          </SectionLabel>
          <p className="text-[14px] text-text">{a.error ?? "Error desconocido."}</p>
          <p className="mt-2 text-[13px] text-text-muted">Revisá que la URL sea pública y responda, y volvé a auditar.</p>
        </Card>
      ) : null}
      {a.status === "cancelled" ? (
        <Card className="mb-5 p-5">
          <p className="text-[14px] text-text-muted">
            Auditoría cancelada. Se guardaron las {a.pagesCrawled} páginas rastreadas hasta ese momento (pestaña Páginas), sin problemas ni puntaje.
          </p>
        </Card>
      ) : null}

      {a.status !== "completed" && tab !== "paginas" ? (
        live ? null : (
          <Card>
            <EmptyState
              icon={<Radar />}
              title="Sin resultados"
              description="Los problemas, el puntaje y el informe aparecen cuando la auditoría se completa."
              action={
                <Button asChild variant="secondary">
                  <a href="/seo">Ver auditorías</a>
                </Button>
              }
            />
          </Card>
        )
      ) : tab === "resumen" ? (
        <SummaryPanel data={data} comparable={comparable} />
      ) : tab === "problemas" ? (
        <IssuesPanel ctx={ctx} data={data} sp={sp} />
      ) : tab === "paginas" ? (
        a.pagesCrawled || !live ? (
          <PagesPanel ctx={ctx} auditId={id} sp={sp} />
        ) : null
      ) : tab === "rendimiento" ? (
        <PerformancePanel ctx={ctx} data={data} />
      ) : tab === "comparar" ? (
        <ComparePanel ctx={ctx} data={data} comparable={comparable} sp={sp} />
      ) : (
        <ReportPanel data={data} />
      )}
      {data.audit.status === "completed" && s.truncated ? (
        <p className="mt-6 flex items-center gap-2 text-[13px] text-text-muted">
          <Badge tone="warning">Nota</Badge> {s.truncated}: las páginas no rastreadas no se analizaron.
        </p>
      ) : null}
    </div>
  );
}
