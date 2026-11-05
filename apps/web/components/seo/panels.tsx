import { formatDateTime } from "@agencyos/core";
import { issueDef } from "@agencyos/modules/seo/catalog";
import {
  type CompareRow,
  compareAudits,
  detailText,
  type getAudit,
  getPerformance,
  listIssueGroups,
  listPages,
  SEO_CATEGORIES,
  SEO_LABELS,
  SEO_SEVERITIES,
} from "@agencyos/modules/seo/queries";
import { Badge, Button, Card, cn, EmptyState, SectionLabel } from "@agencyos/ui";
import { CheckCircle2, Download, FileDown, FileText, Gauge, KeyRound, ListChecks, ListTodo, Scale } from "lucide-react";
import Link from "next/link";
import { projectOpts } from "@/lib/options";
import type { AppCtx } from "@/lib/session";
import { Delta, ScoreChip, ScoreRing, SEV_COLOR, SevCounts, SeverityBadge, scoreTone } from "./bits";
import { CreateTasksSheet } from "./seo-ui";

type AuditData = NonNullable<Awaited<ReturnType<typeof getAudit>>>;
type SP = Record<string, string | undefined>;
const CAT = SEO_LABELS.category as Record<string, string>;
const SEV = SEO_LABELS.severity as Record<string, string>;
const kb = (n: number | null) => (n === null ? "—" : n < 1024 ? `${n} B` : `${Math.round(n / 1024).toLocaleString("es-AR")} KB`);
const fmtMs = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n >= 1000 ? `${(n / 1000).toLocaleString("es-AR", { maximumFractionDigits: 2 })} s` : `${n} ms`;

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] whitespace-nowrap transition-colors md:h-8",
        active ? "border-accent/50 bg-accent-soft text-text" : "border-border text-text-muted hover:text-text",
      )}
    >
      {children}
    </Link>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[18px] text-text">{value}</dd>
      {sub ? <dd className="text-[12px] text-text-faint">{sub}</dd> : null}
    </div>
  );
}

// — Resumen —

export async function SummaryPanel({ data, comparable }: { data: AuditData; comparable: { id: string; score: number | null; createdAt: Date }[] }) {
  const { audit: a, summary: s } = data;
  const prev = comparable.find((c) => c.createdAt < a.createdAt);
  const delta = prev && prev.score !== null && a.score !== null ? a.score - prev.score : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[380px_1fr] [&>*]:min-w-0">
        <Card className="flex flex-col items-center gap-4 p-5 text-center">
          <SectionLabel className="self-start">Puntaje</SectionLabel>
          <ScoreRing score={a.score} size={168} />
          {prev ? (
            <p className="text-[13px] text-text-muted">
              <Delta value={delta} suffix=" pts" /> vs. la auditoría del {formatDateTime(prev.createdAt)}
            </p>
          ) : (
            <p className="text-[13px] text-text-faint">Primera auditoría de este sitio: la próxima se va a comparar con esta.</p>
          )}
          {s.counts ? <SevCounts counts={s.counts} labels={SEV} /> : null}
          <details className="w-full text-left">
            <summary className="flex min-h-11 cursor-pointer items-center text-[13px] text-text-muted hover:text-text">
              Cómo se calcula ({a.scoreFormulaVersion})
            </summary>
            <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{s.formula?.text}</p>
          </details>
        </Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SEO_CATEGORIES.map((c) => {
            const x = (s.categories?.[c] ?? {}) as Record<string, number>;
            return (
              <Link key={c} href={`/seo/${a.id}/problemas?categoria=${c}`} className="block">
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-border-strong">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium text-text">{CAT[c]}</span>
                    <span className="font-mono text-[20px] font-semibold" style={{ color: scoreTone(x.score ?? null) }}>
                      {x.score ?? "—"}
                    </span>
                  </div>
                  <SevCounts counts={x} labels={SEV} />
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-5">
          <SectionLabel className="mb-4">Rastreo</SectionLabel>
          <dl className="grid grid-cols-2 gap-4">
            <Stat label="Páginas" value={a.pagesCrawled} sub={`${s.pages?.indexable ?? 0} indexables`} />
            <Stat label="Con error" value={s.pages?.errors ?? 0} sub={`${s.pages?.redirects ?? 0} redirecciones`} />
            <Stat label="TTFB mediano" value={fmtMs(s.pages?.medianTtfbMs)} sub={`p90 ${fmtMs(s.pages?.p90TtfbMs)}`} />
            <Stat label="Duración" value={fmtMs(s.durationMs ?? null)} />
          </dl>
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-4">robots.txt y sitemap</SectionLabel>
          <ul className="flex flex-col gap-2.5 text-[14px]">
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">robots.txt</span>
              <span className="text-right text-text">
                {s.robots?.found ? `${s.robots.rules} regla${s.robots.rules === 1 ? "" : "s"} para el auditor` : "No encontrado"}
                {s.robots?.blocksAll ? " · bloquea todo" : ""}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Sitemap</span>
              <span className="text-right text-text">{s.sitemap?.found ? (s.sitemap.error ? "Inválido" : `${s.sitemap.urls} URLs`) : "No encontrado"}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Bloqueadas por robots</span>
              <span className="font-mono text-text">{s.progress?.blocked ?? 0}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Del sitemap sin rastrear</span>
              <span className="font-mono text-text">{s.sitemap?.notCrawled ?? 0}</span>
            </li>
          </ul>
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-4">Enlaces y seguridad</SectionLabel>
          <ul className="flex flex-col gap-2.5 text-[14px]">
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Rotos (internos / externos)</span>
              <span className="font-mono text-text">
                {s.links?.brokenInternal ?? 0} / {s.links?.brokenExternal ?? 0}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Externos chequeados</span>
              <span className="font-mono text-text">{s.links?.externalChecked ?? 0}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">HTTPS</span>
              <span className="text-text">{s.https?.rootIsHttps ? "Sí" : "No"}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">HTTP → HTTPS</span>
              <span className="text-text">
                {!s.https?.rootIsHttps ? "—" : s.https.httpRedirectsToHttps === null ? "Sin dato" : s.https.httpRedirectsToHttps ? "Redirige" : "No redirige"}
              </span>
            </li>
          </ul>
        </Card>
      </div>

      {s.penalties?.length ? (
        <Card className="p-5">
          <SectionLabel className="mb-4">Lo que más resta</SectionLabel>
          <ul className="flex flex-col divide-y divide-border">
            {s.penalties.slice(0, 6).map((p) => (
              <li key={p.code} className="flex items-center gap-3 py-2.5">
                <SeverityBadge severity={p.severity} label={SEV[p.severity] ?? p.severity} />
                <Link href={`/seo/${a.id}/problemas#${p.code}`} className="min-w-0 flex-1 truncate text-[14px] text-text hover:underline">
                  {issueTitle(p.code)}
                </Link>
                <span className="font-mono text-[12px] text-text-muted">−{p.penalty.toLocaleString("es-AR")}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<CheckCircle2 />} title="Sin problemas detectados" description="No se encontraron problemas en las páginas rastreadas." compact />
        </Card>
      )}
    </div>
  );
}

const issueTitle = (code: string) => issueDef(code).title;

// — Problemas —

export async function IssuesPanel({ ctx, data, sp }: { ctx: AppCtx; data: AuditData; sp: SP }) {
  const id = data.audit.id;
  const category = SEO_CATEGORIES.includes(sp.categoria as never) ? sp.categoria : undefined;
  const severity = SEO_SEVERITIES.includes(sp.severidad as never) ? sp.severidad : undefined;
  const [groups, projects] = await Promise.all([listIssueGroups(ctx, id, { category, severity }), projectOpts(ctx)]);
  const siteProject = data.siteProjectId && data.siteProjectName ? { id: data.siteProjectId, name: data.siteProjectName } : null;
  const q = (o: SP) => {
    const p = new URLSearchParams();
    const c = "categoria" in o ? o.categoria : category;
    const s = "severidad" in o ? o.severidad : severity;
    if (c) p.set("categoria", c);
    if (s) p.set("severidad", s);
    const str = p.toString();
    return `/seo/${id}/problemas${str ? `?${str}` : ""}`;
  };
  const counts = data.summary.categories ?? {};
  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Chip href={q({ categoria: undefined })} active={!category}>
          Todas
        </Chip>
        {SEO_CATEGORIES.map((c) => (
          <Chip key={c} href={q({ categoria: c })} active={category === c}>
            {CAT[c]} <span className="font-mono text-[11px] text-text-faint">{(counts[c] as Record<string, number> | undefined)?.total ?? 0}</span>
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Chip href={q({ severidad: undefined })} active={!severity}>
          Toda severidad
        </Chip>
        {SEO_SEVERITIES.map((s) => (
          <Chip key={s} href={q({ severidad: s })} active={severity === s}>
            <span aria-hidden className="size-2 rounded-full" style={{ background: SEV_COLOR[s] }} />
            {SEV[s]}
          </Chip>
        ))}
      </div>
      {groups.length ? (
        groups.map((g) => (
          <Card key={g.code} id={g.code} className="scroll-mt-20 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={g.severity} label={SEV[g.severity] ?? g.severity} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">{CAT[g.category]}</span>
                  {g.withTask ? (
                    <Badge tone="success">
                      <ListTodo className="size-3" /> {g.withTask === g.count ? "Con tarea" : `${g.withTask} con tarea`}
                    </Badge>
                  ) : null}
                </div>
                <h3 className="mt-2 text-[16px] font-medium text-text">
                  {g.def.title} <span className="font-mono text-[13px] text-text-muted">· {g.count}</span>
                </h3>
              </div>
              <CreateTasksSheet auditId={id} code={g.code} title={g.def.title} count={g.count} projects={projects} siteProject={siteProject} />
            </div>
            <p className="mt-2 text-[14px] text-text-muted">{g.def.why}</p>
            <p className="mt-2 text-[14px] text-text">
              <span className="font-medium">Cómo corregirlo: </span>
              {g.def.fix}
            </p>
            {g.items.some((i) => i.url) ? (
              <details className="mt-3 group" open={g.count <= 3}>
                <summary className="flex min-h-11 cursor-pointer items-center text-[13px] text-text-muted hover:text-text">
                  {g.count === 1 ? "Ver la URL afectada" : `Ver las ${g.count} URLs afectadas`}
                </summary>
                <ul className="mt-1 flex flex-col divide-y divide-border rounded-lg border border-border">
                  {g.items.slice(0, 100).map((i, k) => (
                    <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <a
                          href={i.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="block truncate font-mono text-[12px] text-text hover:underline"
                        >
                          {i.url ?? "Todo el sitio"}
                        </a>
                        {detailText(i.details) ? <p className="truncate text-[12px] text-text-faint">{detailText(i.details)}</p> : null}
                      </div>
                      {i.taskId ? (
                        <Link href={`/tareas/${i.taskId}`} className="inline-flex min-h-11 items-center text-[12px] text-success md:min-h-8">
                          Tarea
                        </Link>
                      ) : k < 20 && g.count > 1 ? (
                        <CreateTasksSheet
                          auditId={id}
                          issueId={i.id}
                          title={`${g.def.title} · ${i.url ?? ""}`}
                          count={1}
                          projects={projects}
                          siteProject={siteProject}
                          compact
                        />
                      ) : null}
                    </li>
                  ))}
                  {g.count > 100 ? <li className="px-3 py-2 text-[12px] text-text-faint">… y {g.count - 100} más (en el CSV).</li> : null}
                </ul>
              </details>
            ) : (
              <p className="mt-3 text-[13px] text-text-faint">
                Afecta a todo el sitio{detailText(g.items[0]?.details ?? {}) ? ` · ${detailText(g.items[0]?.details ?? {})}` : ""}.
              </p>
            )}
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState
            icon={<CheckCircle2 />}
            title={category || severity ? "Sin problemas con ese filtro" : "Sin problemas detectados"}
            description="Probá con otra categoría o severidad."
            action={
              category || severity ? (
                <Button asChild variant="secondary">
                  <Link href={`/seo/${id}/problemas`}>Ver todos</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}
    </div>
  );
}

// — Páginas —

const PAGE_FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "errores", label: "Con error" },
  { key: "redirecciones", label: "Redirecciones" },
  { key: "noindex", label: "No indexables" },
  { key: "lentas", label: "Lentas" },
];
const PER_PAGE = 50;

export async function PagesPanel({ ctx, auditId, sp }: { ctx: AppCtx; auditId: string; sp: SP }) {
  const filter = PAGE_FILTERS.some((f) => f.key === sp.ver) ? (sp.ver as string) : "todas";
  const page = Math.max(1, Number(sp.pagina) || 1);
  const { rows, total } = await listPages(ctx, auditId, { filter, q: sp.q, offset: (page - 1) * PER_PAGE, limit: PER_PAGE });
  const href = (o: { ver?: string; pagina?: number }) => {
    const p = new URLSearchParams();
    const v = o.ver ?? filter;
    if (v !== "todas") p.set("ver", v);
    if (sp.q) p.set("q", sp.q);
    if (o.pagina && o.pagina > 1) p.set("pagina", String(o.pagina));
    const s = p.toString();
    return `/seo/${auditId}/paginas${s ? `?${s}` : ""}`;
  };
  const statusTone = (s: number | null) => (s === null ? "danger" : s >= 400 ? "danger" : s >= 300 ? "warning" : "success");
  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {PAGE_FILTERS.map((f) => (
          <Chip key={f.key} href={href({ ver: f.key })} active={filter === f.key}>
            {f.label}
          </Chip>
        ))}
      </div>
      <form action={`/seo/${auditId}/paginas`}>
        {filter !== "todas" ? <input type="hidden" name="ver" value={filter} /> : null}
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Filtrar por URL…"
          aria-label="Filtrar páginas por URL"
          className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm"
        />
      </form>
      {rows.length ? (
        <>
          {/* Celular: tarjetas */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <Card className="p-3.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(p.statusCode)}>{p.statusCode ?? "Error"}</Badge>
                    {p.indexable ? null : p.statusCode === 200 ? <Badge>No indexable</Badge> : null}
                    <span className="ml-auto font-mono text-[12px] text-text-muted">{fmtMs(p.ttfbMs)}</span>
                  </div>
                  <p className="mt-2 break-all font-mono text-[12px] text-text">{p.url}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-text-muted">{p.redirectTo ? `→ ${p.redirectTo}` : (p.title ?? "Sin título")}</p>
                </Card>
              </li>
            ))}
          </ul>
          {/* Desktop: tabla */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  <th className="w-[38%] px-4 py-3 font-normal">URL</th>
                  <th className="w-[8%] px-2 py-3 font-normal">Estado</th>
                  <th className="px-2 py-3 font-normal">Título / destino</th>
                  <th className="w-[7%] px-2 py-3 text-right font-normal">Prof.</th>
                  <th className="w-[8%] px-2 py-3 text-right font-normal">Palabras</th>
                  <th className="w-[8%] px-2 py-3 text-right font-normal">TTFB</th>
                  <th className="w-[8%] px-4 py-3 text-right font-normal">Peso</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="truncate px-4 py-2.5 font-mono text-[12px] text-text" title={p.url}>
                      {p.url}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge tone={statusTone(p.statusCode)}>{p.statusCode ?? "Error"}</Badge>
                    </td>
                    <td className="truncate px-2 py-2.5 text-text-muted" title={p.redirectTo ?? p.title ?? ""}>
                      {p.redirectTo ? `→ ${p.redirectTo}` : (p.title ?? "—")}
                      {p.statusCode === 200 && !p.indexable ? <span className="ml-2 text-[11px] text-warning">no indexable</span> : null}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono">{p.depth ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right font-mono">{p.wordCount ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right font-mono">{fmtMs(p.ttfbMs)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{kb(p.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="flex items-center justify-between gap-3 text-[13px] text-text-muted">
            <span className="font-mono">
              {(page - 1) * PER_PAGE + 1}–{(page - 1) * PER_PAGE + rows.length} de {total}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="secondary" size="sm" className="min-h-11 md:min-h-8">
                  <Link href={href({ pagina: page - 1 })}>Anteriores</Link>
                </Button>
              ) : null}
              {page * PER_PAGE < total ? (
                <Button asChild variant="secondary" size="sm" className="min-h-11 md:min-h-8">
                  <Link href={href({ pagina: page + 1 })}>Siguientes</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <Card>
          <EmptyState icon={<ListChecks />} title="No hay páginas con ese filtro" description="Probá con otro filtro o sin búsqueda." compact />
        </Card>
      )}
    </div>
  );
}

// — Rendimiento —

function LhScore({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <ScoreChip score={value} />
      <span className="text-[12px] text-text-muted">{label}</span>
    </div>
  );
}

export async function PerformancePanel({ ctx, data }: { ctx: AppCtx; data: AuditData }) {
  const perf = await getPerformance(ctx, data.audit.id);
  const g = data.summary.google;
  const byUrl = new Map<string, typeof perf.lab>();
  for (const l of perf.lab) byUrl.set(l.url, [...(byUrl.get(l.url) ?? []), l]);
  const s = data.summary;
  return (
    <div className="flex flex-col gap-5">
      {!g?.configured ? (
        <Card className="p-5">
          <SectionLabel icon={<KeyRound />} className="mb-3">
            Lighthouse y Core Web Vitals
          </SectionLabel>
          <p className="text-[14px] text-text">Configurá la API key gratuita de Google para ver Lighthouse y Core Web Vitals.</p>
          <p className="mt-1 text-[13px] text-text-muted">Se aplica a las próximas auditorías. Abajo, los tiempos que midió el rastreador propio.</p>
          <Button asChild variant="secondary" className="mt-4">
            <Link href="/seo/google">
              <KeyRound className="size-4" /> Configurar API key
            </Link>
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <SectionLabel icon={<Gauge />} className="mb-1">
              Lighthouse · datos de laboratorio
            </SectionLabel>
            <p className="mb-4 text-[13px] text-text-muted">
              Puntajes de PageSpeed Insights tal como los devuelve Google (simulación controlada, no usuarios reales).
            </p>
            {perf.lab.length ? (
              <div className="flex flex-col gap-5">
                {[...byUrl.entries()].map(([url, rows]) => (
                  <div key={url}>
                    <p className="mb-3 break-all font-mono text-[12px] text-text-muted">{url}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {rows.map((r) => {
                        const m = r.labMetrics as Record<string, number | null>;
                        return (
                          <div key={r.strategy} className="rounded-lg border border-border p-4">
                            <p className="mb-3 text-[13px] font-medium text-text">{SEO_LABELS.strategy[r.strategy] ?? r.strategy}</p>
                            <div className="grid grid-cols-4 gap-2">
                              <LhScore label="Rendimiento" value={r.performance} />
                              <LhScore label="Accesib." value={r.accessibility} />
                              <LhScore label="Prácticas" value={r.bestPractices} />
                              <LhScore label="SEO" value={r.seo} />
                            </div>
                            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
                              <Stat label="LCP" value={fmtMs(m.lcpMs)} />
                              <Stat label="TBT" value={fmtMs(m.tbtMs)} />
                              <Stat label="CLS" value={m.cls ?? "—"} />
                            </dl>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-text-muted">No se obtuvieron datos de Lighthouse en esta auditoría.</p>
            )}
            {g.psi.errors.length ? (
              <ul className="mt-4 flex flex-col gap-1 text-[13px] text-warning">
                {g.psi.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
          </Card>
          <Card className="p-5">
            <SectionLabel icon={<Gauge />} className="mb-1">
              Core Web Vitals · usuarios reales (CrUX)
            </SectionLabel>
            <p className="mb-4 text-[13px] text-text-muted">
              Percentil 75 de los últimos 28 días en Chrome. Umbral «bueno»: LCP ≤ 2,5 s · INP ≤ 200 ms · CLS ≤ 0,1.
            </p>
            {perf.field.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {perf.field.map((f) => (
                  <li key={f.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-mono text-[12px] text-text">{f.urlOrOrigin}</p>
                      <p className="text-[12px] text-text-muted">{SEO_LABELS.formFactor[f.formFactor] ?? f.formFactor}</p>
                    </div>
                    {f.hasData ? (
                      <dl className="grid grid-cols-3 gap-4 md:w-[360px]">
                        <Stat label="LCP" value={fmtMs(f.lcpP75)} />
                        <Stat label="INP" value={fmtMs(f.inpP75)} />
                        <Stat label="CLS" value={f.clsP75 ?? "—"} />
                      </dl>
                    ) : (
                      <p className="text-[13px] text-text-muted md:w-[360px]">Sin datos de campo suficientes (solo hay datos de laboratorio).</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-text-muted">Sin datos de campo suficientes.</p>
            )}
            {g.crux.errors.length ? (
              <ul className="mt-4 flex flex-col gap-1 text-[13px] text-warning">
                {g.crux.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        </>
      )}
      <Card className="p-5">
        <SectionLabel className="mb-1">Tiempo de respuesta del servidor</SectionLabel>
        <p className="mb-4 text-[13px] text-text-muted">Medido por el rastreador propio: tiempo hasta el primer byte (TTFB) del HTML de cada página.</p>
        <dl className="mb-4 grid grid-cols-2 gap-4 md:max-w-sm">
          <Stat label="Mediana" value={fmtMs(s.pages?.medianTtfbMs)} />
          <Stat label="Percentil 90" value={fmtMs(s.pages?.p90TtfbMs)} />
        </dl>
        {perf.slowest.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {perf.slowest.map((p) => (
              <li key={p.url} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text">{p.url}</span>
                <span className="font-mono text-[12px] text-text-muted">{kb(p.sizeBytes)}</span>
                <span className={cn("w-16 text-right font-mono text-[12px]", (p.ttfbMs ?? 0) > 800 ? "text-warning" : "text-text")}>{fmtMs(p.ttfbMs)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}

// — Comparar —

function CompareList({ title, rows, tone, empty }: { title: string; rows: CompareRow[]; tone: string; empty: string }) {
  return (
    <Card className="p-5">
      <SectionLabel className="mb-3">
        <span style={{ color: tone }}>{title}</span>
      </SectionLabel>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.code} className="py-2.5">
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 md:min-h-8">
                  <SeverityBadge severity={r.severity} label={SEV[r.severity] ?? r.severity} />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-text">{r.def.title}</span>
                  <span className="font-mono text-[12px] text-text-muted">{r.urls.length}</span>
                </summary>
                <ul className="mt-2 flex flex-col gap-1 pl-1">
                  {r.urls.slice(0, 30).map((u, i) => (
                    <li key={`${u}-${i}`} className="truncate font-mono text-[12px] text-text-muted">
                      {u ?? "Todo el sitio"}
                    </li>
                  ))}
                  {r.urls.length > 30 ? <li className="text-[12px] text-text-faint">… y {r.urls.length - 30} más</li> : null}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-text-muted">{empty}</p>
      )}
    </Card>
  );
}

export async function ComparePanel({
  ctx,
  data,
  comparable,
  sp,
}: {
  ctx: AppCtx;
  data: AuditData;
  comparable: { id: string; score: number | null; createdAt: Date }[];
  sp: SP;
}) {
  const id = data.audit.id;
  if (!comparable.length)
    return (
      <Card>
        <EmptyState
          icon={<Scale />}
          title="Todavía no hay con qué comparar"
          description="La comparación necesita otra auditoría completada del mismo sitio. Volvé a auditar más adelante (o programala) y vas a ver problemas nuevos, resueltos y persistentes."
        />
      </Card>
    );
  const baseId = comparable.some((c) => c.id === sp.con)
    ? (sp.con as string)
    : (comparable.find((c) => c.createdAt < data.audit.createdAt) ?? comparable[0])?.id;
  const cmp = baseId ? await compareAudits(ctx, id, baseId) : null;
  return (
    <div className="flex flex-col gap-5">
      <form action={`/seo/${id}/comparar`} className="flex flex-col gap-2 md:flex-row md:items-end">
        <label className="flex flex-col gap-1.5 text-[13px] text-text-muted md:w-96">
          Comparar con
          <select
            name="con"
            defaultValue={baseId}
            className="h-11 rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base text-text md:h-10 md:text-sm"
          >
            {comparable.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDateTime(c.createdAt)} · puntaje {c.score ?? "—"}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          <Scale className="size-4" /> Comparar
        </Button>
      </form>
      {cmp && !("error" in cmp) ? (
        <>
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Puntaje</p>
                <p className="mt-1 font-mono text-[22px] text-text">
                  {cmp.base.score ?? "—"} → {cmp.target.score ?? "—"}
                </p>
                <Delta value={cmp.scoreDelta} suffix=" pts" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Nuevos</p>
                <p className="mt-1 font-mono text-[22px] text-danger">{cmp.counts.added}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Resueltos</p>
                <p className="mt-1 font-mono text-[22px] text-success">{cmp.counts.resolved}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Persistentes</p>
                <p className="mt-1 font-mono text-[22px] text-text">{cmp.counts.persistent}</p>
              </div>
            </div>
            <p className="mt-4 text-[12px] text-text-faint">
              {formatDateTime(cmp.base.createdAt)} ({cmp.base.pages} páginas) → {formatDateTime(cmp.target.createdAt)} ({cmp.target.pages} páginas). Se comparan
              por fingerprint (tipo de problema + URL).
            </p>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="p-5">
              <SectionLabel className="mb-3">Por categoría</SectionLabel>
              <ul className="flex flex-col divide-y divide-border">
                {cmp.catDelta.map((c) => (
                  <li key={c.category} className="flex items-center gap-3 py-2 text-[14px]">
                    <span className="flex-1 text-text">{CAT[c.category]}</span>
                    <span className="font-mono text-[12px] text-text-muted">
                      {c.base ?? "—"} → {c.target ?? "—"}
                    </span>
                    <span className="w-20 text-right">
                      <Delta value={c.base !== null && c.target !== null ? c.target - c.base : null} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <SectionLabel className="mb-3">Por severidad (cantidad)</SectionLabel>
              <ul className="flex flex-col divide-y divide-border">
                {cmp.sevDelta.map((s) => (
                  <li key={s.severity} className="flex items-center gap-3 py-2 text-[14px]">
                    <span className="flex-1">
                      <SeverityBadge severity={s.severity} label={SEV[s.severity] ?? s.severity} />
                    </span>
                    <span className="font-mono text-[12px] text-text-muted">
                      {s.base} → {s.target}
                    </span>
                    <span className="w-20 text-right">
                      <Delta value={s.target - s.base} invert />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
            <CompareList title={`Nuevos · ${cmp.counts.added}`} rows={cmp.added} tone="var(--danger)" empty="Ningún problema nuevo." />
            <CompareList title={`Resueltos · ${cmp.counts.resolved}`} rows={cmp.resolved} tone="var(--success)" empty="Nada resuelto todavía." />
            <CompareList title={`Persistentes · ${cmp.counts.persistent}`} rows={cmp.persistent} tone="var(--text-muted)" empty="Sin problemas persistentes." />
          </div>
        </>
      ) : (
        <Card className="p-5 text-[14px] text-text-muted">No se pudo comparar: elegí otra auditoría del mismo sitio.</Card>
      )}
    </div>
  );
}

// — Informe —

export function ReportPanel({ data }: { data: AuditData }) {
  const id = data.audit.id;
  return (
    <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel icon={<FileText />}>Informe PDF</SectionLabel>
        <p className="text-[14px] text-text-muted">
          A4 con la marca de la agencia: puntaje y fórmula, resultados por categoría, Lighthouse y Core Web Vitals, problemas con cómo corregirlos y comparación
          con la auditoría anterior. Listo para mandar al cliente (vos decidís cuándo).
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Button asChild variant="primary">
            <a href={`/seo/${id}/pdf`} download>
              <FileDown className="size-4" /> Descargar PDF
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href={`/seo/${id}/pdf?ver=1`} target="_blank" rel="noopener">
              Ver en otra pestaña
            </a>
          </Button>
        </div>
      </Card>
      <Card className="flex flex-col gap-3 p-5">
        <SectionLabel icon={<Download />}>CSV de problemas</SectionLabel>
        <p className="text-[14px] text-text-muted">
          Una fila por problema y URL: categoría, severidad, código, detalle, cómo corregirlo y fingerprint. Separado por «;» para Excel/Sheets en español.
        </p>
        <div className="mt-auto pt-2">
          <Button asChild variant="secondary">
            <a href={`/seo/${id}/csv`} download>
              <Download className="size-4" /> Descargar CSV
            </a>
          </Button>
        </div>
      </Card>
    </div>
  );
}
