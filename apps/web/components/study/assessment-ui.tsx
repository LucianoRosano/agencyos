"use client";

import { formatDate, L } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { CalendarPlus, GraduationCap, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  createAssessmentAction, createStudyPlanAction, deleteAssessmentAction, deleteCourseAction, gradeAssessmentFormAction, restoreAssessmentAction, restoreCourseAction,
  setCourseStatusAction, setGradeAction, updateAssessmentAction,
} from "@/app/(app)/facultad/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { formatGrade } from "./shared";

export type AssessmentData = {
  id: string;
  kind: string;
  title: string | null;
  date: string;
  time: string | null;
  topicsMd: string | null;
  targetGrade: string | null;
  grade: string | null;
};

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const gradeInput = (g: string | null | undefined) => (g ? String(Number(g)).replace(".", ",") : "");
/** Abre un Sheet después de que el menú termine de cerrarse (evita que Radix deje el body bloqueado). */
const later = (fn: () => void) => setTimeout(fn, 0);

function AssessmentFields({ a, defaultDate }: { a?: AssessmentData; defaultDate?: string }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Tipo" name="kind" defaultValue={a?.kind ?? "parcial"} options={opts(L.assessmentKind)} />
        <TextField label="Título" name="title" defaultValue={a?.title ?? ""} placeholder="Ej.: Parcial 1" maxLength={160} />
        <TextField label="Fecha" name="date" type="date" required defaultValue={a?.date ?? defaultDate ?? ""} />
        <TextField label="Hora (opcional)" name="time" type="time" defaultValue={a?.time ?? ""} />
        <TextField label="Nota objetivo" name="targetGrade" inputMode="decimal" defaultValue={gradeInput(a?.targetGrade)} placeholder="De 0 a 10" />
        <TextField label="Nota obtenida" name="grade" inputMode="decimal" defaultValue={gradeInput(a?.grade)} placeholder="Cuando la tengas" />
      </div>
      <TextAreaField label="Temas (Markdown)" name="topicsMd" defaultValue={a?.topicsMd ?? ""} rows={5} className="font-mono" hint="Un tema por línea o como lista (- tema). El plan de estudio usa esta lista." />
    </>
  );
}

export function NewAssessmentSheet({ courseId, trigger }: { courseId: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nueva evaluación"
      wide
      trigger={trigger ?? <Button variant="secondary"><Plus className="size-4" /> Nueva evaluación</Button>}
    >
      <ActionForm action={createAssessmentAction.bind(null, courseId)} successMessage="Evaluación agendada" onSuccess={() => setOpen(false)}>
        <AssessmentFields />
        <div className="flex justify-end"><SubmitButton>Agendar evaluación</SubmitButton></div>
      </ActionForm>
    </Sheet>
  );
}

/** Acciones de una evaluación: nota, edición, plan de estudio y papelera. */
export function AssessmentActions({ a, name, canPlan, topics }: { a: AssessmentData; name: string; canPlan: boolean; topics: string[] }) {
  const [sheet, setSheet] = useState<null | "grade" | "edit" | "plan">(null);
  const { exec } = useAction();
  const close = () => setSheet(null);
  const onOpen = (o: boolean) => (o ? undefined : close());
  return (
    <div className="flex items-center gap-1">
      <Button size="md" variant={a.grade === null ? "secondary" : "ghost"} onClick={() => setSheet("grade")} aria-label={`Cargar nota de ${name}`}>
        {a.grade === null ? "Cargar nota" : "Cambiar nota"}
      </Button>
      <Menu trigger={<Button variant="ghost" size="icon" aria-label={`Más acciones de ${name}`}><MoreHorizontal className="size-4" /></Button>}>
        <MenuItem icon={<Pencil />} onSelect={() => later(() => setSheet("edit"))}>Editar</MenuItem>
        {canPlan ? <MenuItem icon={<CalendarPlus />} onSelect={() => later(() => setSheet("plan"))}>Armar plan de estudio</MenuItem> : null}
        {a.grade !== null ? (
          <MenuItem onSelect={() => exec(() => setGradeAction(a.id, null), { success: "Nota quitada", undo: () => setGradeAction(a.id, a.grade) })}>Quitar nota</MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${name}» a la papelera? Las tareas del plan de estudio quedan. Restaurable 30 días.`)) return;
            exec(() => deleteAssessmentAction(a.id), { success: "Evaluación en la papelera", undo: () => restoreAssessmentAction(a.id) });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>

      <Sheet open={sheet === "grade"} onOpenChange={onOpen} title={`Nota · ${name}`} description={a.targetGrade ? `Objetivo: ${formatGrade(a.targetGrade)}` : undefined}>
        <ActionForm action={gradeAssessmentFormAction.bind(null, a.id)} successMessage="Nota guardada" onSuccess={close}>
          <TextField label="Nota obtenida" name="grade" inputMode="decimal" defaultValue={gradeInput(a.grade)} placeholder="De 0 a 10" autoFocus hint="Dejala vacía para quitarla." />
          <div className="flex justify-end"><SubmitButton>Guardar nota</SubmitButton></div>
        </ActionForm>
      </Sheet>

      <Sheet open={sheet === "edit"} onOpenChange={onOpen} title="Editar evaluación" wide>
        <ActionForm action={updateAssessmentAction.bind(null, a.id)} successMessage="Evaluación actualizada" onSuccess={close}>
          <AssessmentFields a={a} />
          <div className="flex justify-end"><SubmitButton>Guardar</SubmitButton></div>
        </ActionForm>
      </Sheet>

      {canPlan ? <StudyPlanSheet a={a} name={name} topics={topics} open={sheet === "plan"} onOpenChange={onOpen} onDone={close} /> : null}
    </div>
  );
}

/** "Plan de estudio": una tarea por tema, repartidas hasta la fecha de la evaluación. */
export function StudyPlanSheet({
  a, name, topics, open, onOpenChange, onDone, trigger,
}: { a: AssessmentData; name: string; topics: string[]; open?: boolean; onOpenChange?: (o: boolean) => void; onDone?: () => void; trigger?: ReactNode }) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const setOpen = onOpenChange ?? setOwn;
  return (
    <Sheet
      open={isOpen}
      onOpenChange={setOpen}
      title="Plan de estudio"
      description={`Crea una tarea por tema en el espacio Facultad, con fechas repartidas desde hoy hasta el día anterior a ${name} (${formatDate(a.date)}).`}
      trigger={trigger}
      wide
    >
      <ActionForm
        action={createStudyPlanAction.bind(null, a.id)}
        successMessage={(tasks) => `Plan creado: ${(tasks as unknown[]).length} tareas`}
        onSuccess={() => {
          setOpen(false);
          onDone?.();
        }}
      >
        <TextAreaField label="Temas (uno por línea)" name="topics" defaultValue={topics.map((t) => `- ${t}`).join("\n")} rows={8} className="font-mono" required hint="Podés editarlos: cada línea es una tarea." />
        <TextField label="Empezar el" name="startDate" type="date" hint="Por defecto, hoy." />
        <div className="flex justify-end"><SubmitButton><GraduationCap className="size-4" /> Crear tareas</SubmitButton></div>
      </ActionForm>
    </Sheet>
  );
}

export function CourseMenu({ id, name, status }: { id: string; name: string; status: string }) {
  const { exec } = useAction();
  const router = useRouter();
  return (
    <Menu trigger={<Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal className="size-4" /></Button>}>
      {(Object.keys(L.courseStatus) as (keyof typeof L.courseStatus)[]).filter((s) => s !== status).map((s) => (
        <MenuItem key={s} onSelect={() => exec(() => setCourseStatusAction(id, s), { success: `Materia: ${L.courseStatus[s].toLowerCase()}`, undo: () => setCourseStatusAction(id, status as "cursando") })}>
          Pasar a {L.courseStatus[s].toLowerCase()}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${name}» a la papelera? Sus evaluaciones dejan de verse en Facultad y en el calendario. Restaurable 30 días.`)) return;
          exec(() => deleteCourseAction(id), { success: "Materia en la papelera", undo: () => restoreCourseAction(id), onDone: () => router.push("/facultad") });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}
