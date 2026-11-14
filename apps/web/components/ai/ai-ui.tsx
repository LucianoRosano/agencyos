"use client";

import { Button, Sheet } from "@agencyos/ui";
import { KeyRound, PlugZap, Sparkles, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  cancelRunAction,
  removeProviderKeyAction,
  saveProviderAction,
  setAgentEnabledAction,
  startEntityRunAction,
  startRunAction,
  testProviderAction,
  updateAgentAction,
} from "@/app/(app)/ia/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };

/** Formulario del proveedor: la clave se escribe pero nunca se muestra (solo "termina en …1234"). */
export function ProviderForm({
  models,
  defaults,
  keyLast4,
}: {
  models: Opt[];
  defaults: { model: string; monthlyBudgetUsd: string };
  keyLast4: string | null;
}) {
  return (
    <ActionForm action={saveProviderAction} successMessage={keyLast4 ? "Configuración guardada" : "Clave guardada. Ya podés usar los agentes."} resetOnSuccess>
      <TextField
        label="Clave de API de Anthropic"
        name="apiKey"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={keyLast4 ? `Configurada · termina en …${keyLast4}` : "sk-ant-…"}
        hint={
          keyLast4
            ? "Dejala vacía para conservar la actual. Se guarda cifrada y nunca se vuelve a mostrar."
            : "Se guarda cifrada (AES-256-GCM) y nunca se vuelve a mostrar. Creala en console.anthropic.com → API Keys."
        }
        required={!keyLast4}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Modelo por defecto" name="defaultModel" defaultValue={defaults.model} options={models} />
        <TextField
          label="Tope mensual (US$)"
          name="monthlyBudgetUsd"
          inputMode="decimal"
          defaultValue={defaults.monthlyBudgetUsd}
          hint="Si se alcanza, ningún agente arranca hasta el mes siguiente y te aviso."
          required
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton>
          <KeyRound className="size-4" /> {keyLast4 ? "Guardar" : "Guardar y activar"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProviderActions() {
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() => exec(() => testProviderAction(), { success: "Conexión correcta", onDone: () => router.refresh() })}
      >
        <PlugZap className="size-4" /> Probar conexión
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          if (!confirm("¿Quitar la clave? Los agentes dejan de estar disponibles y se cancelan los pedidos en cola. El historial se conserva.")) return;
          exec(() => removeProviderKeyAction(), { success: "Clave quitada", redirectTo: "/ia" });
        }}
      >
        <Trash2 className="size-4" /> Quitar clave
      </Button>
    </div>
  );
}

export function AgentToggle({ agentKey, name, enabled }: { agentKey: string; name: string; enabled: boolean }) {
  const { exec, pending } = useAction();
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-text-muted">
      <input
        type="checkbox"
        role="switch"
        aria-checked={enabled}
        checked={enabled}
        disabled={pending}
        aria-label={`${enabled ? "Desactivar" : "Activar"} ${name}`}
        onChange={() =>
          exec(() => setAgentEnabledAction(agentKey, !enabled), {
            success: `${name} ${enabled ? "desactivado" : "activado"}`,
            undo: () => setAgentEnabledAction(agentKey, enabled),
          })
        }
        className="size-4 accent-[var(--accent)]"
      />
      {enabled ? "Activo" : "Inactivo"}
    </label>
  );
}

export function AgentForm({
  agentKey,
  models,
  tools,
  defaults,
  defaultPrompt,
}: {
  agentKey: string;
  models: Opt[];
  tools: { name: string; label: string; kind: string; checked: boolean }[];
  defaults: { modelId: string; monthlyBudgetUsd: string; budgetPerRunUsd: string; maxSteps: number; prompt: string };
  defaultPrompt: string;
}) {
  const [prompt, setPrompt] = useState(defaults.prompt);
  return (
    <ActionForm action={updateAgentAction.bind(null, agentKey)} successMessage="Agente actualizado">
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Modelo" name="modelId" defaultValue={defaults.modelId} placeholder="El del proveedor" options={models} />
        <TextField label="Máximo de pasos" name="maxSteps" type="number" min={1} max={30} defaultValue={String(defaults.maxSteps)} />
        <TextField label="Tope mensual (US$)" name="monthlyBudgetUsd" inputMode="decimal" defaultValue={defaults.monthlyBudgetUsd} />
        <TextField label="Tope por ejecución (US$)" name="budgetPerRunUsd" inputMode="decimal" defaultValue={defaults.budgetPerRunUsd} />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[13px] font-medium text-text">Herramientas (alcances)</legend>
        <p className="mb-2 text-[12px] text-text-faint">Solo las permitidas para este agente. Lo que no esté habilitado lo pide con una aprobación.</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {tools.map((t) => (
            <label key={t.name} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text">
              <input type="checkbox" name="tools" value={t.name} defaultChecked={t.checked} className="size-4 accent-[var(--accent)]" />
              <span className="min-w-0">
                {t.label}
                <span className="ml-2 font-mono text-[11px] text-text-faint">
                  {t.kind === "read" ? "lectura" : t.kind === "propose" ? "propuesta" : "escritura"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextAreaField
        label="Instrucciones (prompt)"
        name="prompt"
        rows={10}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="font-mono"
        hint="Las reglas comunes (no inventar datos, español rioplatense, aprobaciones, datos no confiables) se agregan siempre y no se pueden quitar."
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" disabled={prompt === defaultPrompt} onClick={() => setPrompt(defaultPrompt)}>
          Restaurar prompt original
        </Button>
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NewRunSheet({ agents, defaultAgent }: { agents: Opt[]; defaultAgent?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo pedido a un agente"
      description="Se ejecuta en segundo plano. Te aviso cuando termine; vas a ver cada paso en la traza."
      trigger={
        <Button variant="primary">
          <Sparkles className="size-4" /> Nuevo pedido
        </Button>
      }
    >
      <ActionForm action={startRunAction} successMessage="Pedido en cola" redirectTo={(id) => `/ia/ejecuciones/${id}`} onSuccess={() => setOpen(false)}>
        <SelectField label="Agente" name="agentKey" defaultValue={defaultAgent ?? agents[0]?.value} options={agents} required />
        <TextAreaField label="Pedido" name="request" rows={5} required placeholder="Ej.: ¿Qué proyectos están frenados y qué hago con cada uno?" />
        <div className="flex justify-end">
          <SubmitButton>
            <Sparkles className="size-4" /> Pedir
          </SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function CancelRunButton({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="danger"
      loading={pending}
      onClick={() => {
        if (!confirm("¿Cancelar esta ejecución? Lo que ya hizo (tareas, aprobaciones) queda registrado.")) return;
        exec(() => cancelRunAction(id), { success: "Ejecución cancelada" });
      }}
    >
      <Square className="size-4" /> Cancelar
    </Button>
  );
}

/** Mientras la ejecución está en cola o corriendo, refresca la ficha cada 3 s. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

/** Botón contextual en una ficha (solo se renderiza si hay proveedor y el agente está activo). */
export function AgentEntryButton({ entityType, entityId, label }: { entityType: "project" | "site" | "note"; entityId: string; label: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        exec(() => startEntityRunAction(entityType, entityId), {
          success: "Pedido en cola: el resultado queda como comentario y te aviso.",
          onDone: (id) => router.push(`/ia/ejecuciones/${id}`),
        })
      }
    >
      <Sparkles className="size-4" /> {label}
    </Button>
  );
}
