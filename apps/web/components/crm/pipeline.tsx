"use client";

import { formatDate, formatMoney, L } from "@agencyos/core";
import { cn, Dot } from "@agencyos/ui";
import { CornerDownRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_STAGES, dueTone, isOpenKey, type StageDef, stageColor, stageName, weightedByCurrency } from "./shared";
import { type OppLite, type QuoteLite, StageSelect, useStageChange } from "./stage-change";

export type PipelineOpp = OppLite & {
  valueAmount: string | null;
  valueCurrency: string;
  probability: number;
  nextAction: string | null;
  nextActionDue: string | null;
  expectedClose: string | null;
};

function Money({ items, weighted = true, empty = "—", inline }: { items: PipelineOpp[]; weighted?: boolean; empty?: string; inline?: boolean }) {
  const sums = weightedByCurrency(items, weighted);
  if (!sums.length) return <span className="text-text-faint">{empty}</span>;
  return (
    <span className={inline ? "flex flex-wrap gap-x-3 whitespace-nowrap" : "flex flex-col items-end gap-0.5 whitespace-nowrap"}>
      {sums.map(([cur, v]) => (
        <span key={cur}>{formatMoney(v, cur)}</span>
      ))}
    </span>
  );
}

/** Pipeline: kanban (arrastrar con mouse + selector de etapa por teclado/táctil) o tabla. */
export function PipelineView({
  opps,
  quotes,
  view,
  stages = DEFAULT_STAGES,
}: {
  opps: PipelineOpp[];
  quotes: QuoteLite[];
  view: "kanban" | "tabla";
  stages?: StageDef[];
}) {
  const [items, setItems] = useState(opps);
  useEffect(() => setItems(opps), [opps]);
  const [over, setOver] = useState<string | null>(null);
  const { request, dialogs, pending } = useStageChange({
    quotes,
    stages,
    onOptimistic: (id, stage) => {
      const prev = items.find((o) => o.id === id)?.stage;
      setItems((xs) => xs.map((o) => (o.id === id ? { ...o, stage } : o)));
      return () => setItems((xs) => xs.map((o) => (o.id === id && prev ? { ...o, stage: prev } : o)));
    },
  });
  const byId = new Map(items.map((o) => [o.id, o]));

  if (view === "tabla") {
    return (
      <>
        {/* Desktop: tabla */}
        <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface md:block">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                <th className="px-4 py-3 font-normal">Oportunidad</th>
                <th className="px-3 py-3 font-normal">Etapa</th>
                <th className="px-3 py-3 text-right font-normal">Valor</th>
                <th className="px-3 py-3 text-right font-normal">Prob.</th>
                <th className="px-3 py-3 text-right font-normal">Ponderado</th>
                <th className="px-3 py-3 font-normal">Próxima acción</th>
                <th className="px-4 py-3 font-normal">Cierre</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => {
                const due = dueTone(o.nextActionDue);
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="max-w-[280px] px-4 py-2.5">
                      <Link href={`/crm/oportunidades/${o.id}`} className="block truncate text-text hover:underline">
                        {o.title}
                      </Link>
                      <Link href={`/crm/clientes/${o.clientId}`} className="block truncate text-[12px] text-text-muted hover:text-text">
                        {o.clientName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <StageSelect opp={o} request={request} disabled={pending} stages={stages} className="h-9 w-44" />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] text-text">
                      {o.valueAmount ? formatMoney(o.valueAmount, o.valueCurrency) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] text-text-muted">{o.probability}%</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] text-text-muted">
                      <Money items={[o]} />
                    </td>
                    <td className="max-w-[240px] px-3 py-2.5">
                      {o.nextAction && isOpenKey(o.stage, stages) ? (
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-text">{o.nextAction}</span>
                          {due ? <span className={cn("shrink-0 font-mono text-[12px]", due.cls)}>{due.text}</span> : null}
                        </span>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-text-muted">{formatDate(o.expectedClose)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-bg-elevated font-mono text-[12px] text-text-muted">
                <td className="px-4 py-3" colSpan={4}>
                  {items.length} oportunidades · ponderado abierto
                </td>
                <td className="px-3 py-3 text-right text-text">
                  <Money items={items.filter((o) => isOpenKey(o.stage, stages))} />
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        {/* Celular: tarjetas */}
        <ul className="flex flex-col gap-2.5 md:hidden">
          {items.map((o) => (
            <OppCard key={o.id} o={o} request={request} pending={pending} stages={stages} showStage />
          ))}
        </ul>
        {dialogs}
      </>
    );
  }

  const openCount = stages.filter((s) => s.kind === "open").length;
  // Desktop ancho: hasta 6 abiertas en una fila y cierres abajo (sin scroll); con más, columnas con scroll propio.
  const grid = openCount <= 6;
  return (
    <>
      {/* Celular/tablet: columnas con scroll horizontal. */}
      <nav aria-label="Ir a la etapa" className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0 xl:hidden">
        {stages.map(({ key: stage, name }) => {
          const n = items.filter((o) => o.stage === stage).length;
          const cls = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12px] text-text-muted";
          const inner = (
            <>
              <Dot color={stageColor(stage, stages)} />
              {name}
              <span className="font-mono text-text-faint">{n}</span>
            </>
          );
          return n ? (
            <a key={stage} href={`#etapa-${stage}`} className={cls}>
              {inner}
            </a>
          ) : (
            <span key={stage} className={cn(cls, "opacity-60")}>
              {inner}
            </span>
          );
        })}
      </nav>
      <div
        className={cn(
          "-mx-4 flex snap-x items-start gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:mx-0 md:px-0",
          grid && "xl:grid xl:grid-cols-[repeat(var(--pipeline-cols),minmax(0,1fr))] xl:items-stretch xl:overflow-visible xl:pb-0",
        )}
        style={{ "--pipeline-cols": String(openCount * 2) } as React.CSSProperties}
      >
        {stages.map(({ key: stage, name, kind }) => {
          const list = items.filter((o) => o.stage === stage);
          const closed = kind !== "open";
          return (
            <section
              key={stage}
              id={`etapa-${stage}`}
              aria-label={`${name}: ${list.length}`}
              data-stage={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const o = byId.get(e.dataTransfer.getData("text/opportunity"));
                if (o) request(o, stage);
              }}
              className={cn(
                "flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface/60 p-2.5 transition-colors md:w-[264px]",
                grid && "xl:w-auto xl:max-w-none xl:min-w-0",
                // En el celular no se arrastra: las columnas vacías se ocultan (los chips muestran el conteo)
                list.length === 0 && "max-md:hidden",
                over === stage && "border-accent bg-accent-soft/40",
              )}
              style={grid ? ({ gridColumn: `span ${closed ? openCount : 2} / span ${closed ? openCount : 2}` } as React.CSSProperties) : undefined}
            >
              <header className="px-1.5 pt-1 pb-1.5">
                <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] whitespace-nowrap text-text-muted">
                  <Dot color={stageColor(stage, stages)} />
                  {name}
                  <span className="text-text-faint">{list.length}</span>
                </h2>
                <p className="mt-1 min-h-[18px] font-mono text-[12px] text-text" title={closed ? "Suma del valor" : "Suma ponderada (valor × probabilidad)"}>
                  {stage === "lost" ? null : <Money items={list} weighted={!closed} empty="" inline />}
                </p>
              </header>
              <ul className={cn("flex flex-col gap-2", closed && grid && "xl:grid xl:grid-cols-2")}>
                {list.map((o) => (
                  <OppCard key={o.id} o={o} request={request} pending={pending} stages={stages} draggable />
                ))}
              </ul>
              {list.length === 0 ? (
                <p className={cn("px-1 text-center text-[12px] text-text-faint", closed ? "py-3" : "py-6")}>
                  {closed ? `Sin oportunidades ${stage === "won" ? "ganadas" : "perdidas"} en los últimos 90 días` : "Vacía"}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
      {dialogs}
    </>
  );
}

function OppCard({
  o,
  request,
  pending,
  draggable,
  showStage,
  stages,
}: {
  o: PipelineOpp;
  request: (o: OppLite, s: string) => void;
  pending: boolean;
  draggable?: boolean;
  showStage?: boolean;
  stages: StageDef[];
}) {
  const due = dueTone(o.nextActionDue);
  return (
    <li
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData("text/opportunity", o.id) : undefined}
      className={cn("rounded-[10px] border border-border bg-surface p-3", draggable && "cursor-grab active:cursor-grabbing")}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/crm/oportunidades/${o.id}`} className="min-w-0 text-[14px] leading-snug font-medium text-text hover:underline">
          {o.title}
        </Link>
        {showStage ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-text-muted">
            <Dot color={stageColor(o.stage, stages)} />
            {stageName(o.stage, stages)}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-[12px] text-text-muted">{o.clientName}</p>
      {o.valueAmount ? (
        <p className="mt-2 flex items-baseline justify-between gap-2 font-mono text-[12px]">
          <span className="text-text">{formatMoney(o.valueAmount, o.valueCurrency)}</span>
          <span className="text-text-faint">{o.probability}%</span>
        </p>
      ) : null}
      {o.nextAction && isOpenKey(o.stage, stages) ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-text-muted">
          <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 line-clamp-2">{o.nextAction}</span>
          {due ? <span className={cn("shrink-0 font-mono", due.cls)}>{due.text}</span> : null}
        </p>
      ) : null}
      {o.stage === "lost" && o.lostReason ? (
        <p className="mt-2 text-[12px] text-danger">Motivo: {L.lostReason[o.lostReason as keyof typeof L.lostReason] ?? o.lostReason}</p>
      ) : null}
      <StageSelect opp={o} request={request} disabled={pending} stages={stages} className="mt-2.5 h-9 md:text-[13px]" />
    </li>
  );
}
