import { formatDate, L, label } from "@agencyos/core";
import { portalProject } from "@agencyos/modules/portal/service";
import { Badge, Card, EmptyState, PageHeader, Progress, SectionLabel } from "@agencyos/ui";
import { Download, ExternalLink, FileText, ListChecks, MessageSquareText, PackageCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import { requirePortalCtx } from "@/lib/session";
import { DeliverableActions, FeedbackForm } from "../../portal-ui";

export const metadata = { title: "Proyecto" };

const DELIVERABLE_TONE = { pending: "neutral", delivered: "accent", approved: "success", changes_requested: "warning" } as const;
const PHASE_TONE = { pending: "neutral", in_progress: "accent", done: "success" } as const;
const PRIORITY = ["", "Urgente", "Alta", "Normal", "Baja"];

const bytes = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function PortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pc = await requirePortalCtx();
  if (!pc.clientId) notFound();
  const data = await portalProject(pc, id);
  if (!data) notFound();
  const { project: p, phases, deliverables, site, files } = data;
  const html = deliverables.map((d) => (d.contentMd ? renderMarkdown(d.contentMd) : ""));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/portal" className="hover:text-text">
            ← Tus proyectos
          </Link>
        }
        title={p.name}
        description={p.goal ?? undefined}
        accent="#22D3EE"
      />
      <Card className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
        <div>
          <p className="text-[12px] text-text-muted">Estado</p>
          <p className="mt-1 text-[14px]">{label(L.projectStatus, p.status)}</p>
        </div>
        <div>
          <p className="text-[12px] text-text-muted">Inicio</p>
          <p className="mt-1 font-mono text-[14px]">{formatDate(p.startDate)}</p>
        </div>
        <div>
          <p className="text-[12px] text-text-muted">Fecha objetivo</p>
          <p className="mt-1 font-mono text-[14px]">{formatDate(p.targetDate)}</p>
        </div>
        <div>
          <p className="flex justify-between text-[12px] text-text-muted">
            Avance <span className="font-mono">{p.progress}%</span>
          </p>
          <Progress value={p.progress} className="mt-2" label="Avance del proyecto" />
        </div>
      </Card>

      <section aria-labelledby="etapas">
        <SectionLabel icon={<ListChecks />} className="mb-3">
          <span id="etapas">Etapas</span>
        </SectionLabel>
        <Card className="p-2">
          {phases.length ? (
            <ol className="flex flex-col divide-y divide-border">
              {phases.map((ph, i) => (
                <li key={ph.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <span className="w-6 font-mono text-[12px] text-text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{ph.name}</span>
                  {ph.dueDate ? <span className="hidden font-mono text-[12px] text-text-muted sm:inline">{formatDate(ph.dueDate)}</span> : null}
                  <Badge tone={PHASE_TONE[ph.status as keyof typeof PHASE_TONE] ?? "neutral"}>{label(L.phaseStatus, ph.status)}</Badge>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState compact icon={<ListChecks />} title="Sin etapas cargadas" description="Luciano carga las etapas cuando arranca el proyecto." />
          )}
        </Card>
      </section>

      <section aria-labelledby="entregas-t" id="entregas">
        <SectionLabel icon={<PackageCheck />} className="mb-3">
          <span id="entregas-t">Entregas</span>
        </SectionLabel>
        {deliverables.length ? (
          <div className="flex flex-col gap-3">
            {deliverables.map((d, i) => (
              <Card key={d.id} className="flex flex-col gap-3 p-5" data-testid="portal-deliverable">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[15px] font-medium">{d.title}</p>
                  <Badge tone={DELIVERABLE_TONE[d.status as keyof typeof DELIVERABLE_TONE] ?? "neutral"}>
                    {d.status === "delivered" ? "Para aprobar" : label(L.deliverableStatus, d.status)}
                  </Badge>
                </div>
                {html[i] ? <MarkdownView html={html[i] ?? ""} /> : null}
                <p className="text-[12px] text-text-faint">
                  {d.approvedAt ? `Aprobada el ${formatDate(d.approvedAt)}` : d.dueDate ? `Fecha: ${formatDate(d.dueDate)}` : "Sin fecha"}
                </p>
                {d.status === "delivered" ? <DeliverableActions id={d.id} title={d.title} /> : null}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-5">
            <EmptyState compact icon={<PackageCheck />} title="Todavía no hay entregas" description="Cuando haya algo para revisar te va a aparecer acá." />
          </Card>
        )}
      </section>

      {site ? (
        <section aria-labelledby="revisiones">
          <SectionLabel icon={<MessageSquareText />} className="mb-3">
            <span id="revisiones">Revisiones del sitio</span>
          </SectionLabel>
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-3 text-[14px]">
              <span className="font-medium">{site.name}</span>
              {(site.stagingUrl ?? site.prodUrl) ? (
                <a
                  href={site.stagingUrl ?? site.prodUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center gap-1 text-accent-text hover:underline"
                >
                  Ver el sitio <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
            {site.openRound ? (
              <>
                <p className="text-[13px] text-text-muted">La ronda R{site.openRound.number} está abierta: cargá lo que quieras cambiar, una cosa por ítem.</p>
                <FeedbackForm projectId={p.id} />
                {site.openRound.items.length ? (
                  <ul className="flex flex-col divide-y divide-border border-t border-border" data-testid="portal-feedback">
                    {site.openRound.items.map((it) => (
                      <li key={it.id} className="flex flex-col gap-1 py-3">
                        <p className="text-[14px]">{it.description}</p>
                        <p className="text-[12px] text-text-muted">
                          {it.pageRef ? `${it.pageRef} · ` : ""}
                          {PRIORITY[it.priority] ?? "Normal"} · {label(L.revisionItemStatus, it.status)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-[13px] text-text-muted">
                {site.rounds.length
                  ? `No hay una ronda abierta. La última fue la R${site.rounds[0]?.number}.`
                  : "Todavía no hay rondas de revisión. Luciano te avisa cuando abra la primera."}
              </p>
            )}
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="recursos">
        <SectionLabel icon={<FileText />} className="mb-3">
          <span id="recursos">Recursos compartidos</span>
        </SectionLabel>
        <Card className="p-2">
          {files.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {files.map((f) => (
                <li key={f.id}>
                  <a href={f.url} className="flex min-h-12 items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2" data-testid="portal-file">
                    <FileText className="size-4 shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{f.name}</span>
                    <span className="shrink-0 font-mono text-[12px] text-text-muted">{bytes(f.size)}</span>
                    <Download className="size-4 shrink-0 text-text-muted" aria-label="Descargar" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={<FileText />}
              title="No hay recursos compartidos"
              description="Los archivos que Luciano comparta con vos (logos, documentos, accesos) aparecen acá."
            />
          )}
        </Card>
      </section>
    </div>
  );
}
