import { can, formatDateTime, L, label } from "@agencyos/core";
import { formatUsd } from "@agencyos/modules/ai/pricing";
import { getRun } from "@agencyos/modules/ai/queries";
import { entityHref } from "@agencyos/modules/shared/entities";
import { Badge, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { ChevronLeft, FileText, ListTree, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutoRefresh, CancelRunButton } from "@/components/ai/ai-ui";
import { duration, IA_ACCENT, RunStatus } from "@/components/ai/ia-shell";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import { requireCtx } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Ejecución de agente" };

const ENTITY_OUT: Record<string, string> = {
  task: "Tarea",
  approval: "Aprobación",
  note: "Nota",
  comment: "Comentario",
  inbox_item: "Ítem de Bandeja",
  decision: "Decisión",
};

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg-elevated p-3 font-mono text-[12px] leading-relaxed text-text-muted">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireCtx();
  if (!can(ctx, "update", "settings")) redirect("/ia");
  const data = await getRun(ctx, id);
  if (!data) notFound();
  const { run, steps, def } = data;
  const input = (run.input ?? {}) as { request?: string; entityType?: string | null; entityId?: string | null; entityTitle?: string | null };
  const outputs = (run.outputEntities ?? []) as { type: string; id: string }[];
  const live = run.status === "queued" || run.status === "running";
  const name = def?.name ?? run.agentKey;

  return (
    <div className="mx-auto max-w-5xl">
      <AutoRefresh active={live} />
      <Link
        href="/ia/ejecuciones"
        className="-ml-1 mb-3 flex h-10 w-fit items-center gap-1 rounded-md px-1 font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted hover:text-text"
      >
        <ChevronLeft className="size-4" /> Ejecuciones
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            {name} · {label(L.agentTrigger, run.trigger)} · {formatDateTime(run.startedAt)}
          </span>
        }
        title={input.request ?? "Ejecución"}
        accent={IA_ACCENT}
        actions={
          <>
            <RunStatus status={run.status} />
            {live ? <CancelRunButton id={run.id} /> : null}
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Costo estimado", formatUsd(run.costUsd)],
          ["Duración", duration(run)],
          ["Tokens", `${run.tokensIn.toLocaleString("es-AR")} → ${run.tokensOut.toLocaleString("es-AR")}`],
          ["Modelo", run.modelUsed ?? "—"],
        ].map(([k, v]) => (
          <Card key={k} className="p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{k}</dt>
            <dd className="mt-1 truncate font-mono text-[14px] tabular-nums text-text">{v}</dd>
          </Card>
        ))}
      </dl>

      {input.entityType && input.entityId ? (
        <p className="mb-4 text-[13px] text-text-muted">
          Pedido desde {label(L.entityType, input.entityType).toLowerCase()}{" "}
          <Link href={entityHref(input.entityType, input.entityId)} className="text-text underline-offset-2 hover:underline">
            {input.entityTitle ?? "sin título"}
          </Link>
          {run.status === "succeeded" ? " · el resultado quedó como comentario interno." : ""}
        </p>
      ) : null}

      {run.errorMessage ? (
        <p
          className={`mb-5 rounded-md border p-3 text-[13px] ${run.status === "cancelled" ? "border-border bg-surface-2 text-text-muted" : "border-danger/30 bg-danger-soft text-danger"}`}
        >
          {run.errorMessage}
        </p>
      ) : null}

      <Card className="mb-6 p-5">
        <SectionLabel icon={<FileText />} className="mb-4">
          Resultado
        </SectionLabel>
        {run.outputMd ? (
          <MarkdownView html={renderMarkdown(run.outputMd)} />
        ) : (
          <p className="text-[14px] text-text-faint">
            {live ? (run.status === "queued" ? "En cola: el worker la toma en segundos." : "Trabajando…") : "Sin resultado."}
          </p>
        )}
        {outputs.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-[13px] font-medium text-text">Lo que generó</p>
            <ul className="flex flex-wrap gap-2">
              {outputs.map((o) => (
                <li key={`${o.type}:${o.id}`}>
                  {o.type === "approval" ? (
                    <Link href="/aprobaciones" className="inline-flex min-h-9 items-center">
                      <Badge tone="warning">Aprobación pendiente</Badge>
                    </Link>
                  ) : o.type === "task" ? (
                    <Link href={`/tareas/${o.id}`} className="inline-flex min-h-9 items-center">
                      <Badge tone="info">Tarea</Badge>
                    </Link>
                  ) : o.type === "note" ? (
                    <Link href={`/notas/${o.id}`} className="inline-flex min-h-9 items-center">
                      <Badge tone="info">Nota</Badge>
                    </Link>
                  ) : (
                    <Badge>{ENTITY_OUT[o.type] ?? o.type}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <SectionLabel icon={<ListTree />} className="mb-3">
        Traza · {steps.length} pasos
      </SectionLabel>
      {steps.length ? (
        <ol className="relative flex flex-col gap-3 border-l border-border pl-5">
          {steps.map((s) => {
            const out = (s.output ?? {}) as { texto?: string; herramientas?: string[]; stop_reason?: string; resultado?: string };
            return (
              <li key={s.id} className="relative">
                <span
                  aria-hidden
                  className={`absolute -left-[26px] top-3 size-2.5 rounded-full border-2 border-bg ${s.error ? "bg-danger" : s.kind === "approval" ? "bg-warning" : s.kind === "tool" ? "bg-accent-2" : "bg-accent"}`}
                />
                <Card className="p-3.5">
                  <details>
                    <summary className="flex min-h-9 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[11px] text-text-faint">#{s.index + 1}</span>
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-text">
                        {s.kind !== "model" ? <Wrench className="size-3.5 text-text-muted" /> : null}
                        {s.kind === "model" ? "Modelo" : s.toolName}
                      </span>
                      {s.kind !== "model" ? <Badge>{label(L.agentStepKind, s.kind)}</Badge> : null}
                      {s.error ? <Badge tone="danger">Error</Badge> : null}
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-text-faint">
                        {s.tokens ? `${s.tokens.toLocaleString("es-AR")} tokens · ` : ""}
                        {s.latencyMs !== null ? `${(s.latencyMs / 1000).toFixed(1).replace(".", ",")} s` : ""}
                      </span>
                    </summary>
                    {s.error ? <p className="mt-2 text-[13px] text-danger">{s.error}</p> : null}
                    {s.kind === "model" && out.texto ? <p className="mt-2 whitespace-pre-wrap text-[13px] text-text-muted">{out.texto}</p> : null}
                    {s.kind === "model" && out.herramientas?.length ? (
                      <p className="mt-2 text-[12px] text-text-faint">Pidió: {out.herramientas.join(", ")}</p>
                    ) : null}
                    {s.kind !== "model" ? (
                      <>
                        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">Entrada</p>
                        <Json value={s.input} />
                        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">Resultado (resumido)</p>
                        <Json value={out.resultado ?? s.output} />
                      </>
                    ) : null}
                  </details>
                </Card>
              </li>
            );
          })}
        </ol>
      ) : (
        <Card>
          <EmptyState
            compact
            icon={<ListTree />}
            title={live ? "Esperando el primer paso" : "Sin pasos registrados"}
            description="Cada llamada al modelo y cada herramienta aparecen acá."
          />
        </Card>
      )}
    </div>
  );
}
