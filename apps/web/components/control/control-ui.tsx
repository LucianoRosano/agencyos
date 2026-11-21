"use client";

import { Button, Sheet } from "@agencyos/ui";
import { Check, Copy, Plus, X } from "lucide-react";
import { useState } from "react";
import {
  acceptGoalAction,
  addSkillTemplateAction,
  approvePlanAction,
  cancelGoalAction,
  createGoalAction,
  createSkillAction,
  decideStepAction,
  proposePlanAction,
  rejectPlanAction,
  reviewGoalAction,
  setSkillActiveAction,
  updateSkillAction,
} from "@/app/(app)/control/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { toast } from "@/lib/toast";

type Opt = { value: string; label: string };

export function NewGoalSheet({ projects, clients, skills }: { projects: Opt[]; clients: Opt[]; skills: Opt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo objetivo"
      description="Contá qué querés lograr y cómo vas a saber que está bien. El agente propone el plan; vos lo aprobás."
      wide
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Nuevo objetivo
        </Button>
      }
    >
      <ActionForm action={createGoalAction} successMessage="Objetivo creado" redirectTo={(d) => `/control/objetivos/${(d as { id: string }).id}`}>
        <TextField label="Objetivo" name="title" required maxLength={200} placeholder="Ej.: Arreglar el cálculo de envío del checkout" />
        <TextAreaField label="Descripción y contexto" name="descriptionMd" rows={4} placeholder="Qué pasa hoy, qué se espera, links útiles…" />
        <TextAreaField
          label="Criterios de aceptación"
          name="acceptanceMd"
          rows={3}
          placeholder="Cómo sabés que está terminado (pruebas, capturas, métricas)."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Proyecto" name="projectId" options={projects} placeholder="Sin proyecto" />
          <SelectField label="Cliente" name="clientId" options={clients} placeholder="Sin cliente" />
          <TextField label="Repositorio (dueño/nombre)" name="repo" placeholder="lucianorosano/mi-sitio" />
          <SelectField
            label="Prioridad"
            name="priority"
            defaultValue="3"
            options={[
              { value: "1", label: "Urgente" },
              { value: "2", label: "Alta" },
              { value: "3", label: "Normal" },
              { value: "4", label: "Baja" },
            ]}
          />
        </div>
        {skills.length ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[13px] font-medium text-text-muted">Skills a seguir</legend>
            {skills.map((s) => (
              <label key={s.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px]">
                <input type="checkbox" name="skillIds" value={s.value} className="size-5 accent-[var(--accent)]" />
                {s.label}
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton>Crear objetivo</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

/** Plan escrito a mano (si no lo propone el agente): una línea por paso; «(ok)» al final pide tu aprobación. */
export function WritePlanSheet({ goalId, hasPlan }: { goalId: string; hasPlan: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={hasPlan ? "Rehacer el plan" : "Escribir el plan"}
      description="Un paso por línea. Agregá «(ok)» al final de los pasos que necesitan tu aprobación antes de hacerse. Publicar siempre pide OK."
      trigger={<Button variant={hasPlan ? "ghost" : "secondary"}>{hasPlan ? "Rehacer el plan" : "Escribir el plan"}</Button>}
    >
      <ActionForm action={proposePlanAction.bind(null, goalId)} successMessage="Plan guardado: falta aprobarlo" onSuccess={() => setOpen(false)}>
        <TextAreaField label="Pasos" name="plan" rows={8} required placeholder={"Reproducir el error\nEscribir la prueba\nCorregir\nPublicar (ok)"} />
        <div className="flex justify-end">
          <SubmitButton>Guardar plan</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function PlanDecision({ goalId, hasProject }: { goalId: string; hasProject: boolean }) {
  const { exec, pending } = useAction();
  const [createTasks, setCreateTasks] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {hasProject ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px]">
          <input type="checkbox" checked={createTasks} onChange={(e) => setCreateTasks(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          Crear una tarea por paso en el proyecto (se completan solas al avanzar)
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={pending}
          onClick={() => exec(() => approvePlanAction(goalId, hasProject && createTasks), { success: "Plan aprobado: listo para ejecutar" })}
        >
          <Check className="size-4" /> Aprobar el plan
        </Button>
        <Button variant="ghost" onClick={() => setRejecting((v) => !v)}>
          Pedir cambios
        </Button>
      </div>
      {rejecting ? (
        <ActionForm action={rejectPlanAction.bind(null, goalId)} successMessage="Plan devuelto con tus comentarios" onSuccess={() => setRejecting(false)}>
          <TextAreaField label="Qué cambiar" name="comment" rows={3} required />
          <div className="flex justify-end">
            <SubmitButton>Devolver el plan</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function StepDecision({ goalId, idx, title }: { goalId: string; idx: number; title: string }) {
  const { exec, pending } = useAction();
  return (
    <span className="flex gap-2">
      <Button
        size="sm"
        variant="primary"
        className="h-10"
        loading={pending}
        onClick={() => exec(() => decideStepAction(goalId, idx, true), { success: `Aprobaste «${title}»` })}
      >
        <Check className="size-4" /> Aprobar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-10"
        onClick={() => {
          if (confirm(`¿No aprobar «${title}»? El paso queda salteado.`)) exec(() => decideStepAction(goalId, idx, false), { success: "Paso no aprobado" });
        }}
      >
        <X className="size-4" /> No
      </Button>
    </span>
  );
}

export function ReviewDecision({ goalId }: { goalId: string }) {
  const { exec, pending } = useAction();
  const [returning, setReturning] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={pending} onClick={() => exec(() => acceptGoalAction(goalId), { success: "Objetivo cumplido" })}>
          <Check className="size-4" /> Aceptar el resultado
        </Button>
        <Button variant="ghost" onClick={() => setReturning((v) => !v)}>
          Devolver para corregir
        </Button>
      </div>
      {returning ? (
        <ActionForm
          action={reviewGoalAction.bind(null, goalId, false)}
          successMessage="Devuelto al agente con tus comentarios"
          onSuccess={() => setReturning(false)}
        >
          <TextAreaField label="Qué corregir" name="comment" rows={3} required />
          <div className="flex justify-end">
            <SubmitButton>Devolver</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function CancelGoalButton({ goalId }: { goalId: string }) {
  const { exec } = useAction();
  return (
    <Button
      variant="ghost"
      onClick={() => {
        if (confirm("¿Cancelar este objetivo? Queda en el historial.")) exec(() => cancelGoalAction(goalId), { success: "Objetivo cancelado" });
      }}
    >
      Cancelar objetivo
    </Button>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-10"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        toast.success("Copiado");
      }}
    >
      <Copy className="size-4" /> {label}
    </Button>
  );
}

// ---------- Skills ----------

type SkillDefaults = { name?: string; description?: string; instructionsMd?: string; tools?: string; tags?: string };

function SkillFields({ d = {} }: { d?: SkillDefaults }) {
  return (
    <>
      <TextField label="Nombre" name="name" required maxLength={80} defaultValue={d.name} placeholder="Ej.: Publicar un sitio WordPress" />
      <TextField
        label="Para qué sirve"
        name="description"
        required
        maxLength={400}
        defaultValue={d.description}
        hint="El agente la elige por esta descripción."
      />
      <TextAreaField
        label="Instrucciones (Markdown)"
        name="instructionsMd"
        required
        rows={12}
        defaultValue={d.instructionsMd}
        placeholder={"1. …\n2. …\n3. **Con aprobación:** …"}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Herramientas (separadas por coma)" name="tools" defaultValue={d.tools} placeholder="tomar_objetivo, actualizar_paso" />
        <TextField label="Etiquetas" name="tags" defaultValue={d.tags} placeholder="sitios, código" />
      </div>
    </>
  );
}

export function NewSkillSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nueva skill"
      description="Un procedimiento que el agente sigue paso a paso."
      wide
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Nueva skill
        </Button>
      }
    >
      <ActionForm action={createSkillAction} successMessage="Skill creada" onSuccess={() => setOpen(false)}>
        <SkillFields />
        <div className="flex justify-end">
          <SubmitButton>Crear skill</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function EditSkillForm({ id, d }: { id: string; d: SkillDefaults }) {
  return (
    <ActionForm action={updateSkillAction.bind(null, id)} successMessage="Skill guardada (versión nueva)">
      <SkillFields d={d} />
      <div className="flex justify-end">
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SkillToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() => exec(() => setSkillActiveAction(id, !active), { success: `${active ? "Desactivaste" : "Activaste"} «${name}»` })}
    >
      {active ? "Desactivar" : "Activar"}
    </Button>
  );
}

export function AddTemplateButton({ k, name }: { k: string; name: string }) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-10"
      loading={pending}
      onClick={() => exec(() => addSkillTemplateAction(k), { success: `Agregaste «${name}»` })}
    >
      <Plus className="size-4" /> Agregar
    </Button>
  );
}
