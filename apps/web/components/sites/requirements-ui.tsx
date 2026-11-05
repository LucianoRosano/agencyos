"use client";

import { L } from "@agencyos/core";
import { Badge, Button, Card, Select, Sheet } from "@agencyos/ui";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  addRequirementAction,
  deleteRequirementAction,
  moveRequirementAction,
  restoreRequirementAction,
  setRequirementStatusAction,
  updateRequirementAction,
} from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { MarkdownView } from "@/components/markdown";
import { useAction } from "@/components/use-action";
import { MOSCOW_TONE, opts } from "./shared";

type Req = { id: string; title: string; moscow: string; acceptanceMd: string | null; status: string; html: string };

function RequirementFields({ r }: { r?: Req }) {
  return (
    <>
      <TextField label="Requerimiento" name="title" required defaultValue={r?.title} placeholder="Ej.: Pagar con Mercado Pago" maxLength={200} />
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Prioridad (MoSCoW)" name="moscow" defaultValue={r?.moscow ?? "must"} options={opts(L.moscow)} />
        <SelectField label="Estado" name="status" defaultValue={r?.status ?? "pending"} options={opts(L.requirementStatus)} />
      </div>
      <TextAreaField
        label="Criterio de aceptación (Markdown)"
        name="acceptanceMd"
        defaultValue={r?.acceptanceMd ?? ""}
        rows={4}
        placeholder="Ej.: un pago aprobado crea el pedido en estado «Procesando» y llega el mail al cliente."
      />
    </>
  );
}

export function NewRequirementSheet({ siteId, label = "Nuevo requerimiento" }: { siteId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo requerimiento"
      wide
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> {label}
        </Button>
      }
    >
      <ActionForm action={addRequirementAction.bind(null, siteId)} successMessage="Requerimiento agregado" onSuccess={() => setOpen(false)}>
        <RequirementFields />
        <div className="flex justify-end">
          <SubmitButton>Agregar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

function EditRequirementSheet({ r }: { r: Req }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Editar requerimiento"
      wide
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Editar «${r.title}»`}>
          <Pencil className="size-4" />
        </Button>
      }
    >
      <ActionForm action={updateRequirementAction.bind(null, r.id)} successMessage="Requerimiento actualizado" onSuccess={() => setOpen(false)}>
        <RequirementFields r={r} />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function RequirementList({ items }: { items: Req[] }) {
  const { exec, pending } = useAction();
  return (
    <ol className="flex flex-col gap-2">
      {items.map((r, i) => (
        <li key={r.id}>
          <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
            <span className="font-mono text-[13px] text-text-faint md:pt-0.5">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={MOSCOW_TONE[r.moscow]}>{L.moscow[r.moscow as keyof typeof L.moscow]?.split(" · ")[0] ?? r.moscow}</Badge>
                <p className={r.status === "done" ? "text-[15px] text-text-muted line-through" : "text-[15px] text-text"}>{r.title}</p>
              </div>
              {r.html ? (
                <div className="mt-2 border-l-2 border-border pl-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">Criterio de aceptación</p>
                  <MarkdownView html={r.html} className="mt-1 text-[14px] text-text-muted" />
                </div>
              ) : (
                <p className="mt-1 text-[13px] text-text-faint">Sin criterio de aceptación.</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Select
                aria-label={`Estado de «${r.title}»`}
                defaultValue={r.status}
                onChange={(e) => exec(() => setRequirementStatusAction(r.id, e.target.value), { success: "Requerimiento actualizado" })}
                className="mr-1 w-full md:w-36"
              >
                {Object.entries(L.requirementStatus).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" size="icon" aria-label="Subir" disabled={i === 0 || pending} onClick={() => exec(() => moveRequirementAction(r.id, "up"))}>
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Bajar"
                disabled={i === items.length - 1 || pending}
                onClick={() => exec(() => moveRequirementAction(r.id, "down"))}
              >
                <ArrowDown className="size-4" />
              </Button>
              <EditRequirementSheet r={r} />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Eliminar «${r.title}»`}
                onClick={() => {
                  if (!confirm(`¿Mandar «${r.title}» a la papelera? Restaurable 30 días.`)) return;
                  exec(() => deleteRequirementAction(r.id), { success: "Requerimiento en la papelera", undo: () => restoreRequirementAction(r.id) });
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}
