"use client";

import { Button, Card, cn, Input, Textarea } from "@agencyos/ui";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { defineNextActionAction } from "@/app/(app)/hoy/actions";
import { useAction } from "@/components/use-action";
import { completeReviewAction } from "./actions";

const STEPS = ["Bandeja", "Proyectos", "Ponerse al día", "Dinero", "Focos"];

export function ReviewWizard(p: {
  inbox: number;
  noNextAction: { id: string; title: string }[];
  stalled: { id: string; title: string }[];
  catchUp: { key: string; title: string; subtitle: string; href: string }[];
  money: string[];
  doneNoteId: string | null;
}) {
  const [step, setStep] = useState(0);
  const [defs, setDefs] = useState<Record<string, string>>({});
  const [focuses, setFocuses] = useState<string[]>([""]);
  const [wins, setWins] = useState("");
  const [blockers, setBlockers] = useState("");
  const [moneyNote, setMoneyNote] = useState("");
  const { exec, pending } = useAction();
  const router = useRouter();

  return (
    <Card className="p-5 md:p-6">
      {p.doneNoteId ? (
        <p className="mb-4 rounded-lg border border-success/30 bg-success-soft p-3 text-[13px] text-success">
          Ya hiciste la revisión de esta semana.{" "}
          <Link href={`/notas/${p.doneNoteId}`} className="underline">
            Ver la nota
          </Link>{" "}
          · podés rehacerla.
        </p>
      ) : null}
      <ol className="mb-6 flex gap-1.5" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1.5" aria-current={i === step ? "step" : undefined}>
            <span className={cn("h-1 rounded-full", i <= step ? "bg-[image:var(--gradient)]" : "bg-surface-3")} />
            <span className={cn("hidden font-mono text-[10px] uppercase tracking-[0.14em] md:block", i === step ? "text-text" : "text-text-faint")}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium">1. Vaciá la Bandeja</h2>
          <p className="text-[14px] text-text-muted">{p.inbox ? `Tenés ${p.inbox} ítems sin procesar.` : "La Bandeja está vacía. ¡Bien!"}</p>
          {p.inbox ? (
            <Button asChild className="self-start">
              <Link href="/bandeja?procesar=1">Procesar ahora</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium">2. Proyectos sin siguiente acción</h2>
          {p.noNextAction.length ? (
            p.noNextAction.map((x) => (
              <form
                key={x.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = defs[x.id]?.trim();
                  if (v) exec(() => defineNextActionAction(x.id, v), { success: "Siguiente acción definida" });
                }}
              >
                <span className="flex-1 text-[14px]">{x.title}</span>
                <Input
                  value={defs[x.id] ?? ""}
                  onChange={(e) => setDefs({ ...defs, [x.id]: e.target.value })}
                  placeholder="Siguiente acción…"
                  aria-label={`Siguiente acción de ${x.title}`}
                  className="md:w-64"
                />
                <Button type="submit" size="sm" loading={pending}>
                  Definir
                </Button>
              </form>
            ))
          ) : (
            <p className="text-[14px] text-text-muted">Todos los proyectos en curso tienen siguiente acción.</p>
          )}
          {p.stalled.length ? (
            <>
              <p className="mt-2 text-[13px] text-text-muted">Frenados (más de 14 días sin actividad): ¿siguen, se pausan o se cierran?</p>
              <ul className="flex flex-col gap-1">
                {p.stalled.map((x) => (
                  <li key={x.id}>
                    <Link className="text-[14px] text-accent hover:underline" href={`/proyectos/${x.id}`}>
                      {x.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium">3. Ponerse al día</h2>
          {p.catchUp.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {p.catchUp.slice(0, 12).map((c) => (
                <li key={c.key} className="py-2">
                  <Link href={c.href} className="text-[14px] hover:underline">
                    {c.title}
                  </Link>
                  <p className="text-[12px] text-text-muted">{c.subtitle}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-muted">Nada vencido ni por vencer.</p>
          )}
          <Textarea
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="¿Qué te trabó esta semana?"
            aria-label="Lo que trabó"
            rows={3}
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium">4. Dinero</h2>
          {p.money.length ? (
            <ul className="font-mono text-[14px]">
              {p.money.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-muted">Sin movimientos este mes.</p>
          )}
          <Button asChild variant="ghost" size="sm" className="self-start">
            <Link href="/finanzas">Abrir Finanzas</Link>
          </Button>
          <Textarea
            value={moneyNote}
            onChange={(e) => setMoneyNote(e.target.value)}
            placeholder="Notas de dinero: cobros a reclamar, gastos a recortar…"
            aria-label="Notas de dinero"
            rows={3}
          />
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium">5. Focos de la semana</h2>
          <p className="text-[13px] text-text-muted">Hasta 5. Lo que, si sale, hace que la semana haya valido la pena.</p>
          {focuses.map((f, i) => (
            <div key={`f${i}`} className="flex gap-2">
              <Input
                value={f}
                onChange={(e) => setFocuses(focuses.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Foco ${i + 1}`}
                aria-label={`Foco ${i + 1}`}
              />
              {focuses.length > 1 ? (
                <Button size="icon" variant="ghost" aria-label="Quitar" onClick={() => setFocuses(focuses.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {focuses.length < 5 ? (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setFocuses([...focuses, ""])}>
              + Otro foco
            </Button>
          ) : null}
          <Textarea value={wins} onChange={(e) => setWins(e.target.value)} placeholder="¿Qué salió bien?" aria-label="Lo que salió bien" rows={3} />
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="size-4" /> Atrás
        </Button>
        {step < 4 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
            Siguiente <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              exec(() => completeReviewAction({ wins, blockers, moneyNote, focuses: focuses.map((f) => f.trim()).filter(Boolean) }), {
                success: "Revisión guardada como nota",
                onDone: (n) => router.push(`/notas/${(n as { id: string }).id}`),
              })
            }
          >
            <Check className="size-4" /> Cerrar la semana
          </Button>
        )}
      </div>
    </Card>
  );
}
