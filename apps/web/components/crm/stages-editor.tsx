"use client";

import { Badge, Button, cn, Dot, Field, Input } from "@agencyos/ui";
import { ArrowDown, ArrowUp, Check, Lock, Trash2 } from "lucide-react";
import { addStageAction, deleteStageAction, moveStageAction, restoreStageAction, updateStageAction } from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton, useFieldError } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { type StageDef, stageColor } from "./shared";

/** Campo con id único por fila (varios formularios en la misma página). */
function RowField({ label, name, uid, required, ...props }: { label: string; name: string; uid: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = useFieldError(name);
  const id = `${name}-${uid}`;
  return (
    <Field label={label} name={id} error={error} required={required}>
      <Input id={id} name={name} aria-invalid={error ? true : undefined} {...props} />
    </Field>
  );
}

export type EditableStage = StageDef & { probability: number; system: boolean };

/** Editor de etapas: renombrar, probabilidad por defecto, subir/bajar, agregar intermedias y eliminar las propias. */
export function StagesEditor({ stages }: { stages: EditableStage[] }) {
  const { exec, pending } = useAction();
  const open = stages.filter((s) => s.kind === "open");
  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-2" aria-label="Etapas del pipeline">
        {stages.map((s) => {
          const i = open.findIndex((o) => o.key === s.key);
          const closed = s.kind !== "open";
          return (
            <li key={s.key} className={cn("rounded-[10px] border border-border bg-bg-elevated p-3", closed && "bg-surface")} data-stage-key={s.key}>
              <ActionForm action={updateStageAction.bind(null, s.key)} successMessage="Etapa guardada" className="gap-3">
                <div className="flex items-center gap-2">
                  <Dot color={stageColor(s.key, stages)} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                    {closed ? (s.kind === "won" ? "Cierre · ganada" : "Cierre · perdida") : `Etapa ${i + 1}`}
                  </span>
                  {s.system ? (
                    <Badge className="ml-auto">
                      <Lock className="size-3" /> Sistema
                    </Badge>
                  ) : (
                    <Badge tone="accent" className="ml-auto">
                      Propia
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto] md:items-end">
                  <RowField label="Nombre" name="name" uid={s.key} required maxLength={40} defaultValue={s.name} />
                  {closed ? (
                    <>
                      <input type="hidden" name="probability" value={s.probability} />
                      <p className="self-end pb-2.5 font-mono text-[13px] text-text-muted">{s.probability}%</p>
                    </>
                  ) : (
                    <RowField
                      label="Prob. %"
                      name="probability"
                      uid={s.key}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      defaultValue={String(s.probability)}
                    />
                  )}
                  <div className="col-span-2 flex items-center gap-1 md:col-span-1">
                    {closed ? null : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="max-md:size-11"
                          aria-label={`Subir «${s.name}»`}
                          disabled={pending || i <= 0}
                          onClick={() => exec(() => moveStageAction(s.key, "up"))}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="max-md:size-11"
                          aria-label={`Bajar «${s.name}»`}
                          disabled={pending || i >= open.length - 1}
                          onClick={() => exec(() => moveStageAction(s.key, "down"))}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                      </>
                    )}
                    {!s.system ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="max-md:size-11 text-danger"
                        aria-label={`Eliminar «${s.name}»`}
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`¿Eliminar la etapa «${s.name}»? Sus oportunidades vuelven a verse en la etapa anterior del sistema.`)) return;
                          exec(() => deleteStageAction(s.key), { success: "Etapa eliminada", undo: () => restoreStageAction(s.key) });
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                    <SubmitButton variant="secondary" className="ml-auto">
                      <Check className="size-4" /> Guardar
                    </SubmitButton>
                  </div>
                </div>
              </ActionForm>
            </li>
          );
        })}
      </ol>

      <div className="rounded-[10px] border border-dashed border-border p-4">
        <p className="mb-3 text-[14px] font-medium text-text">Agregar etapa intermedia</p>
        <ActionForm action={addStageAction} successMessage="Etapa agregada" resetOnSuccess className="gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_auto] md:items-end">
            <TextField label="Nombre" name="name" required maxLength={40} placeholder="Ej.: Demo" />
            <TextField label="Prob. %" name="probability" type="number" inputMode="numeric" min={0} max={100} defaultValue="30" />
            <SelectField
              label="Después de"
              name="afterKey"
              defaultValue={open[open.length - 1]?.key ?? ""}
              options={open.map((s) => ({ value: s.key, label: s.name }))}
            />
            <SubmitButton>Agregar</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
