"use client";

import { formatMoney, L } from "@agencyos/core";
import { Button, cn } from "@agencyos/ui";
import { Check, FileSignature, FolderPlus, Unlink } from "lucide-react";
import Link from "next/link";
import { unlinkQuoteAction } from "@/app/(app)/crm/actions";
import { useAction } from "@/components/use-action";
import { DEFAULT_STAGES, type StageDef, stageColor } from "./shared";
import { type OppLite, type QuoteLite, StageSelect, useStageChange } from "./stage-change";

/** Etapas como pasos (botones) + cierre ganada/perdida; mismo flujo de reglas que el kanban. */
export function OpportunityStage({ opp, quotes, stages = DEFAULT_STAGES }: { opp: OppLite; quotes: QuoteLite[]; stages?: StageDef[] }) {
  const { request, dialogs, pending } = useStageChange({ quotes, stages });
  const open = stages.filter((s) => s.kind === "open");
  const idx = open.findIndex((s) => s.key === opp.stage);
  const closed = opp.stage === "won" || opp.stage === "lost";
  return (
    <div className="flex flex-col gap-4">
      <ol className="hidden grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-1.5 md:grid" aria-label="Etapas del pipeline">
        {open.map(({ key: s, name }, i) => {
          const done = closed ? opp.stage === "won" : i < idx;
          const current = s === opp.stage;
          return (
            <li key={s}>
              <button
                type="button"
                disabled={pending || current}
                onClick={() => request(opp, s)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-2 text-[13px] transition-colors",
                  current
                    ? "border-accent-2/60 bg-accent-2/10 text-text"
                    : done
                      ? "border-border bg-surface-2 text-text-muted hover:text-text"
                      : "border-border text-text-faint hover:text-text hover:border-border-strong",
                )}
              >
                {done ? <Check className="size-3.5 text-success" /> : <span className="size-2 rounded-full" style={{ background: stageColor(s, stages) }} />}
                <span className="truncate">{name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <StageSelect opp={opp} request={request} disabled={pending} stages={stages} className="md:hidden" />
        <div className="grid grid-cols-2 gap-2 md:ml-auto md:flex">
          <Button variant="secondary" disabled={pending || opp.stage === "won"} onClick={() => request(opp, "won")} className="text-success">
            <Check className="size-4" /> Ganada
          </Button>
          <Button variant="secondary" disabled={pending || opp.stage === "lost"} onClick={() => request(opp, "lost")} className="text-danger">
            Perdida
          </Button>
        </div>
      </div>
      {opp.stage === "won" ? (
        <div className="flex flex-col gap-3 rounded-[10px] border border-success/30 bg-success-soft p-4 md:flex-row md:items-center">
          <p className="flex-1 text-[14px] text-text">Oportunidad ganada. Arrancá el proyecto con el asistente.</p>
          <Button asChild variant="primary">
            <Link href={`/proyectos/nuevo?${new URLSearchParams({ cliente: opp.clientId, nombre: opp.title })}`}>
              <FolderPlus className="size-4" /> Crear proyecto
            </Link>
          </Button>
        </div>
      ) : null}
      {dialogs}
    </div>
  );
}

export function LinkedQuotes({ opportunityId, quotes, clientId }: { opportunityId: string; quotes: QuoteLite[]; clientId: string }) {
  const { exec } = useAction();
  if (!quotes.length) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[14px] text-text-muted">Sin presupuesto vinculado. Se vincula al pasar a «Propuesta enviada».</p>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/presupuestos/nuevo?cliente=${clientId}&oportunidad=${opportunityId}`}>
            <FileSignature className="size-4" /> Crear presupuesto
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {quotes.map((q) => (
        <li key={q.id} className="flex items-center gap-2 rounded-[10px] border border-border bg-bg-elevated py-1.5 pr-1.5 pl-3.5">
          <Link href={`/presupuestos/${q.id}`} className="min-w-0 flex-1 py-1">
            <span className="block truncate text-[14px] text-text hover:underline">
              {q.number} · {q.title}
            </span>
            <span className="font-mono text-[12px] text-text-muted">
              {L.quoteStatus[q.status as keyof typeof L.quoteStatus] ?? q.status}
              {q.total ? ` · ${formatMoney(q.total, q.currency ?? "ARS")}` : ""}
            </span>
          </Link>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Desvincular ${q.number}`}
            onClick={() => exec(() => unlinkQuoteAction(opportunityId, q.id), { success: "Presupuesto desvinculado" })}
          >
            <Unlink className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
