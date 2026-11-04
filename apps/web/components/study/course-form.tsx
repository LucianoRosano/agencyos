"use client";

import { L } from "@agencyos/core";
import { Button, Input, Select, Sheet } from "@agencyos/ui";
import { Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createCourseAction, updateCourseAction } from "@/app/(app)/facultad/actions";
import { ActionForm, SubmitButton, useFieldError } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { COURSE_COLORS, DAY_OPTIONS, type Slot } from "./shared";

export type CourseDefaults = {
  name?: string;
  program?: string | null;
  term?: string | null;
  commission?: string | null;
  teachers?: string | null;
  status?: string;
  finalGrade?: string | null;
  color?: string | null;
  notesMd?: string | null;
  schedule?: Slot[];
};

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const s = (v: string | null | undefined) => v ?? "";

/** Alta o edición de una materia (Sheet: modal en desktop, hoja inferior en el celular). */
export function CourseSheet({ id, defaults = {}, trigger }: { id?: string; defaults?: CourseDefaults; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(id);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={editing ? "Editar materia" : "Nueva materia"}
      description={editing ? undefined : "Cargá lo básico; el resto lo podés completar después."}
      wide
      trigger={trigger}
    >
      <ActionForm
        action={id ? updateCourseAction.bind(null, id) : createCourseAction}
        successMessage={editing ? "Materia actualizada" : "Materia creada"}
        onSuccess={() => setOpen(false)}
        redirectTo={editing ? undefined : (data) => `/facultad/${(data as { id: string }).id}`}
      >
        <TextField
          label="Nombre"
          name="name"
          required
          defaultValue={s(defaults.name)}
          autoFocus
          maxLength={160}
          placeholder="Ej.: Introducción a la Programación"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Carrera" name="program" defaultValue={s(defaults.program)} placeholder="Licenciatura en Sistemas · UNGS" maxLength={160} />
          <TextField label="Cuatrimestre" name="term" defaultValue={s(defaults.term)} placeholder="2026 · 2.º cuatrimestre" maxLength={60} />
          <TextField label="Comisión" name="commission" defaultValue={s(defaults.commission)} maxLength={60} />
          <SelectField label="Estado" name="status" defaultValue={defaults.status ?? "cursando"} options={opts(L.courseStatus)} />
          <TextField label="Docentes" name="teachers" defaultValue={s(defaults.teachers)} placeholder="Nombres separados por coma" maxLength={500} />
          <TextField
            label="Nota final"
            name="finalGrade"
            defaultValue={defaults.finalGrade ? String(Number(defaults.finalGrade)).replace(".", ",") : ""}
            inputMode="decimal"
            placeholder="De 0 a 10"
            hint="Solo si ya la tenés."
          />
        </div>
        <ColorPicker defaultValue={defaults.color ?? COURSE_COLORS[0]} />
        <ScheduleEditor initial={defaults.schedule ?? []} />
        <TextAreaField
          label="Notas (Markdown)"
          name="notesMd"
          defaultValue={s(defaults.notesMd)}
          rows={5}
          className="font-mono"
          hint="Bibliografía, criterios de aprobación, links del aula virtual…"
        />
        <div className="flex justify-end">
          <SubmitButton>{editing ? "Guardar" : "Crear materia"}</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

function ColorPicker({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-text-muted">Color</legend>
      <div className="flex flex-wrap gap-1">
        {COURSE_COLORS.map((c) => (
          <label key={c} className="grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] hover:bg-surface-2">
            <input type="radio" name="color" value={c} checked={value === c} onChange={() => setValue(c)} className="peer sr-only" aria-label={`Color ${c}`} />
            <span
              className="size-6 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
              style={{ background: c }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Lista editable de horarios (día / desde / hasta / aula). Viaja como JSON en un input oculto. */
function ScheduleEditor({ initial }: { initial: Slot[] }) {
  const [rows, setRows] = useState<Slot[]>(initial);
  const error = useFieldError("schedule");
  const update = (i: number, patch: Partial<Slot>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-text-muted">Horarios</legend>
      <input type="hidden" name="schedule" value={JSON.stringify(rows.map((r) => ({ ...r, room: r.room?.trim() || undefined })))} />
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const bad = r.from && r.to && r.to <= r.from;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: filas editables sin id propio
              <li key={i} className="rounded-[var(--radius-control)] border border-border bg-bg-elevated p-2.5">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.2fr_1fr_1fr_1.2fr_auto]">
                  <Select
                    aria-label={`Día del horario ${i + 1}`}
                    value={r.day}
                    onChange={(e) => update(i, { day: Number(e.target.value) })}
                    className="col-span-2 md:col-span-1"
                  >
                    {DAY_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="time"
                    aria-label={`Desde (horario ${i + 1})`}
                    value={r.from}
                    onChange={(e) => update(i, { from: e.target.value })}
                    aria-invalid={bad || undefined}
                  />
                  <Input
                    type="time"
                    aria-label={`Hasta (horario ${i + 1})`}
                    value={r.to}
                    onChange={(e) => update(i, { to: e.target.value })}
                    aria-invalid={bad || undefined}
                  />
                  <Input
                    aria-label={`Aula (horario ${i + 1})`}
                    placeholder="Aula"
                    value={r.room ?? ""}
                    onChange={(e) => update(i, { room: e.target.value })}
                    maxLength={80}
                    className="col-span-2 md:col-span-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar horario ${i + 1}`}
                    onClick={() => setRows((x) => x.filter((_, k) => k !== i))}
                    className="col-span-2 w-full md:col-span-1 md:w-10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {bad ? <p className="mt-1.5 text-[12px] text-danger">El horario termina antes de empezar.</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-text-faint">Sin horarios cargados.</p>
      )}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="outline" className="self-start" onClick={() => setRows((r) => [...r, { day: 1, from: "18:00", to: "22:00", room: "" }])}>
        <Plus className="size-4" /> Agregar horario
      </Button>
    </fieldset>
  );
}
