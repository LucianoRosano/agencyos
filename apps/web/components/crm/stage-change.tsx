"use client";

import { formatMoney, L } from "@agencyos/core";
import { Button, cn, Select, Sheet } from "@agencyos/ui";
import { FilePlus2, FolderPlus, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveOpportunityAction } from "@/app/(app)/crm/actions";
import { STAGE_ORDER, type StageKey } from "./shared";

export type OppLite = {
  id: string;
  title: string;
  stage: string;
  clientId: string;
  clientName: string;
  lostReason: string | null;
  hasQuote: boolean;
};
export type QuoteLite = { id: string; number: string; title: string; status: string; clientId: string; opportunityId: string | null; total: string | null; currency: string | null };

type Pending = { opp: OppLite; stage: StageKey } | null;

/**
 * Reglas del pipeline en la UI:
 * - «Propuesta enviada» pide vincular un presupuesto del cliente (o ir a crearlo);
 * - «Perdida» pide el motivo;
 * - «Ganada» ofrece crear el proyecto con el asistente.
 * `onOptimistic` aplica el cambio en la vista y devuelve cómo revertirlo si falla.
 */
export function useStageChange({ quotes, onOptimistic }: { quotes: QuoteLite[]; onOptimistic?: (id: string, stage: StageKey) => () => void }) {
  const [quoteFor, setQuoteFor] = useState<Pending>(null);
  const [lostFor, setLostFor] = useState<Pending>(null);
  const [wonInfo, setWonInfo] = useState<{ opp: OppLite; clientActivated: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function apply(opp: OppLite, stage: StageKey, extra: { quoteId?: string; lostReason?: string } = {}) {
    const revert = onOptimistic?.(opp.id, stage);
    const prevStage = opp.stage;
    const prevReason = opp.lostReason;
    start(async () => {
      const r = await moveOpportunityAction(opp.id, { stage, ...extra });
      if (!r.ok) {
        revert?.();
        toast.error(r.error.message);
        return;
      }
      setQuoteFor(null);
      setLostFor(null);
      if (stage === "won") setWonInfo({ opp, clientActivated: r.data.clientActivated });
      toast.success(`«${opp.title}» → ${L.stage[stage]}`, {
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: () => {
            onOptimistic?.(opp.id, prevStage as StageKey);
            void moveOpportunityAction(opp.id, { stage: prevStage, lostReason: prevReason ?? undefined }).then(() => router.refresh());
          },
        },
      });
      router.refresh();
    });
  }

  function request(opp: OppLite, stage: StageKey) {
    if (opp.stage === stage) return;
    if (stage === "proposal_sent" && !opp.hasQuote) setQuoteFor({ opp, stage });
    else if (stage === "lost") setLostFor({ opp, stage });
    else apply(opp, stage);
  }

  const dialogs = (
    <>
      <QuoteDialog pending={pending} target={quoteFor} quotes={quotes} onClose={() => setQuoteFor(null)} onConfirm={(quoteId) => quoteFor && apply(quoteFor.opp, "proposal_sent", { quoteId })} />
      <LostDialog pending={pending} target={lostFor} onClose={() => setLostFor(null)} onConfirm={(lostReason) => lostFor && apply(lostFor.opp, "lost", { lostReason })} />
      <WonDialog info={wonInfo} onClose={() => setWonInfo(null)} />
    </>
  );
  return { request, dialogs, pending };
}

function QuoteDialog({ target, quotes, onClose, onConfirm, pending }: { target: Pending; quotes: QuoteLite[]; onClose: () => void; onConfirm: (quoteId: string) => void; pending: boolean }) {
  const [sel, setSel] = useState("");
  const opp = target?.opp;
  const available = opp ? quotes.filter((q) => q.clientId === opp.clientId && (!q.opportunityId || q.opportunityId === opp.id)) : [];
  const newHref = opp ? `/presupuestos/nuevo?cliente=${opp.clientId}&oportunidad=${opp.id}` : "#";
  return (
    <Sheet open={Boolean(target)} onOpenChange={(o) => { if (!o) { setSel(""); onClose(); } }} title="Vincular un presupuesto" description={opp ? `Para pasar «${opp.title}» a «Propuesta enviada» vinculá el presupuesto que le mandaste a ${opp.clientName}.` : undefined}>
      {available.length ? (
        <fieldset className="mb-4 flex flex-col gap-2">
          <legend className="sr-only">Presupuestos de {opp?.clientName}</legend>
          {available.map((q) => (
            <label key={q.id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[14px] transition-colors", sel === q.id ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}>
              <input type="radio" name="quoteId" value={q.id} checked={sel === q.id} onChange={() => setSel(q.id)} className="accent-[var(--accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text">{q.number} · {q.title}</span>
                <span className="font-mono text-[12px] text-text-muted">{L.quoteStatus[q.status as keyof typeof L.quoteStatus] ?? q.status}{q.total ? ` · ${formatMoney(q.total, q.currency ?? "ARS")}` : ""}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="mb-4 rounded-[10px] border border-dashed border-border p-4 text-[14px] text-text-muted">{opp?.clientName ?? "Este cliente"} todavía no tiene presupuestos para vincular. Crealo y volvé a mover la oportunidad.</p>
      )}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-between">
        <Button asChild variant="ghost">
          <Link href={newHref}><FilePlus2 className="size-4" /> Crear presupuesto</Link>
        </Button>
        <div className="flex flex-col-reverse gap-2 md:flex-row">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {available.length ? <Button variant="primary" disabled={!sel} loading={pending} onClick={() => onConfirm(sel)}>Vincular y mover</Button> : null}
        </div>
      </div>
    </Sheet>
  );
}

function LostDialog({ target, onClose, onConfirm, pending }: { target: Pending; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet open={Boolean(target)} onOpenChange={(o) => { if (!o) { setReason(""); onClose(); } }} title="Marcar como perdida" description={target ? `¿Por qué se perdió «${target.opp.title}»? Sirve para aprender del pipeline.` : undefined}>
      <fieldset className="mb-4 grid grid-cols-2 gap-2">
        <legend className="mb-2 text-[13px] font-medium text-text-muted">Motivo <span className="text-danger">*</span></legend>
        {Object.entries(L.lostReason).map(([k, l]) => (
          <label key={k} className={cn("flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-[14px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", reason === k ? "border-danger/50 bg-danger-soft text-text" : "border-border text-text-muted hover:text-text")}>
            <input type="radio" name="lostReason" value={k} checked={reason === k} onChange={() => setReason(k)} className="sr-only" />
            {l}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" disabled={!reason} loading={pending} onClick={() => onConfirm(reason)}>Marcar perdida</Button>
      </div>
    </Sheet>
  );
}

function WonDialog({ info, onClose }: { info: { opp: OppLite; clientActivated: boolean } | null; onClose: () => void }) {
  const href = info ? `/proyectos/nuevo?${new URLSearchParams({ cliente: info.opp.clientId, nombre: info.opp.title })}` : "#";
  return (
    <Sheet open={Boolean(info)} onOpenChange={(o) => { if (!o) onClose(); }} title="¡Oportunidad ganada!" description={info ? `«${info.opp.title}» con ${info.opp.clientName}.${info.clientActivated ? ` ${info.opp.clientName} pasó a cliente activo.` : ""}` : undefined}>
      <div className="mb-5 flex items-center gap-3 rounded-[10px] border border-success/30 bg-success-soft p-4 text-[14px] text-text">
        <PartyPopper className="size-5 shrink-0 text-success" />
        Siguiente paso: arrancar el proyecto con el asistente (plantilla, terminado y primera acción).
      </div>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="ghost" onClick={onClose}>Ahora no</Button>
        <Button asChild variant="primary">
          <Link href={href}><FolderPlus className="size-4" /> Crear proyecto</Link>
        </Button>
      </div>
    </Sheet>
  );
}

/** Selector de etapa accesible (teclado/táctil). */
export function StageSelect({ opp, request, className, disabled }: { opp: OppLite; request: (o: OppLite, s: StageKey) => void; className?: string; disabled?: boolean }) {
  return (
    <Select aria-label={`Etapa de «${opp.title}»`} value={opp.stage} disabled={disabled} onChange={(e) => request(opp, e.target.value as StageKey)} className={className}>
      {STAGE_ORDER.map((s) => (
        <option key={s} value={s}>{L.stage[s]}</option>
      ))}
    </Select>
  );
}
