"use client";

import { Button, Card, cn, Field, Input, Select, Textarea } from "@agencyos/ui";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { wizardAction } from "../actions";

type Tpl = { id: string; name: string; description: string; phases: number; tasks: number };
type Opt = { value: string; label: string };

const STEPS = ["Plantilla", "Para quién", "Terminado", "Fecha", "Primera acción"];

export function Wizard({
  templates,
  clients,
  spaces,
  initialClientId,
  initialTemplateId,
  quoteId,
  initialName,
}: {
  templates: Tpl[];
  clients: Opt[];
  spaces: Opt[];
  initialClientId?: string;
  initialTemplateId?: string;
  quoteId?: string;
  initialName?: string;
}) {
  const [step, setStep] = useState(initialTemplateId ? 1 : 0);
  const [tpl, setTpl] = useState(initialTemplateId ?? "");
  const [forWhom, setForWhom] = useState<"client" | "personal">(initialClientId ? "client" : "personal");
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [spaceId, setSpaceId] = useState("");
  const [name, setName] = useState(initialName ?? "");
  const [dod, setDod] = useState("");
  const [target, setTarget] = useState("");
  const [first, setFirst] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const canNext = [Boolean(tpl), name.trim().length > 0 && (forWhom === "personal" || Boolean(clientId)), dod.trim().length > 0, true, first.trim().length > 0][
    step
  ];

  function submit() {
    const fd = new FormData();
    fd.set("templateId", tpl);
    fd.set("name", name);
    if (forWhom === "client") fd.set("clientId", clientId);
    if (spaceId) fd.set("spaceId", spaceId);
    fd.set("definitionOfDone", dod);
    if (target) fd.set("targetDate", target);
    fd.set("firstAction", first);
    if (quoteId) fd.set("quoteId", quoteId);
    start(async () => {
      const r = await wizardAction(null, fd);
      if (!r.ok) {
        setErrors(r.error.fields ?? {});
        toast.error(r.error.message);
        return;
      }
      toast.success("Proyecto creado. La primera acción ya está en Hoy.");
      router.push(`/proyectos/${(r.data as { id: string }).id}`);
    });
  }

  return (
    <Card className="p-5 md:p-6">
      <ol className="mb-6 flex items-center gap-1.5" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1.5" aria-current={i === step ? "step" : undefined}>
            <span className={cn("h-1 rounded-full", i <= step ? "bg-[image:var(--gradient)]" : "bg-surface-3")} />
            <span className={cn("hidden font-mono text-[10px] uppercase tracking-[0.14em] md:block", i === step ? "text-text" : "text-text-faint")}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mb-4 font-mono text-[12px] text-text-muted md:hidden">
        Paso {step + 1} de 5 · {STEPS[step]}
      </p>

      {step === 0 ? (
        <fieldset className="grid gap-2.5 sm:grid-cols-2">
          <legend className="mb-3 text-[15px] font-medium">¿Qué tipo de proyecto es?</legend>
          {templates.map((t) => (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-[10px] border p-3.5 transition-colors",
                tpl === t.id ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name="tpl" value={t.id} checked={tpl === t.id} onChange={() => setTpl(t.id)} className="sr-only" />
              <span className="text-[14px] font-medium text-text">{t.name}</span>
              <span className="line-clamp-2 text-[12px] text-text-muted">{t.description}</span>
              <span className="mt-1 font-mono text-[11px] text-text-faint">
                {t.phases} etapas · {t.tasks} tareas
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <Field label="Nombre del proyecto" name="name" error={errors.name} required>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Para quién">
            {(["client", "personal"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={forWhom === k}
                onClick={() => setForWhom(k)}
                className={cn(
                  "h-11 rounded-[10px] border text-[14px]",
                  forWhom === k ? "border-accent bg-accent-soft text-text" : "border-border text-text-muted",
                )}
              >
                {k === "client" ? "Para un cliente" : "Personal / facultad"}
              </button>
            ))}
          </div>
          {forWhom === "client" ? (
            <Field
              label="Cliente"
              name="clientId"
              error={errors.clientId}
              hint={clients.length ? undefined : "Todavía no hay clientes: crealo primero en CRM o elegí «Personal»."}
            >
              <Select id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Elegí un cliente</option>
                {clients.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Espacio" name="spaceId">
              <Select id="spaceId" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                <option value="">Personal</option>
                {spaces.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      ) : null}

      {step === 2 ? (
        <Field
          label="¿Qué significa «terminado»?"
          name="definitionOfDone"
          error={errors.definitionOfDone}
          hint="Una o dos frases verificables. Ej.: «Tienda publicada, con pagos y envíos probados y el cliente cargando productos solo»."
        >
          <Textarea id="definitionOfDone" value={dod} onChange={(e) => setDod(e.target.value)} autoFocus rows={4} />
        </Field>
      ) : null}

      {step === 3 ? (
        <Field label="Fecha objetivo (opcional)" name="targetDate" error={errors.targetDate} hint="Las tareas de la plantilla se fechan a partir de hoy.">
          <Input id="targetDate" type="date" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
        </Field>
      ) : null}

      {step === 4 ? (
        <Field label="Primera acción" name="firstAction" error={errors.firstAction} hint="Lo más chico y concreto que podés hacer hoy. Va a aparecer en Hoy.">
          <Input
            id="firstAction"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            autoFocus
            maxLength={300}
            onKeyDown={(e) => {
              if (e.key === "Enter" && first.trim()) submit();
            }}
          />
        </Field>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="size-4" /> Atrás
        </Button>
        {step < 4 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Siguiente <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button variant="primary" onClick={submit} loading={pending} disabled={!canNext}>
            <Check className="size-4" /> Crear proyecto
          </Button>
        )}
      </div>
    </Card>
  );
}
