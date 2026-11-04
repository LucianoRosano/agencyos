import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { getCourse, listCourses, studyOverview } from "@agencyos/modules/study/queries";
import {
  createAssessment, createCourse, createStudyPlan, gradeAssessment, setCourseStatus, spreadDates, topicsFromMarkdown, updateAssessment, updateCourse,
} from "@agencyos/modules/study/service";
import { getToday } from "@agencyos/modules/today/queries";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

const events = async (workspaceId: string, type: string) =>
  getDb().select().from(schema.domainEvent).where(and(eq(schema.domainEvent.workspaceId, workspaceId), eq(schema.domainEvent.type, type)));

describe("facultad: materias y evaluaciones", () => {
  it("arranca vacía: un workspace nuevo no tiene materias", async () => {
    const ctx = await makeWorkspace();
    expect(await listCourses(ctx, { includeAll: true })).toEqual([]);
  });

  it("crea una materia en el espacio Facultad con horarios y registra materia.creada", async () => {
    const ctx = await makeWorkspace();
    const study = ctx.spaces.find((s) => s.kind === "study");
    const c = await createCourse(ctx, {
      name: "Introducción a la Programación",
      program: "Licenciatura en Sistemas · UNGS",
      term: "2026 · 2C",
      commission: "C3",
      teachers: "Pérez, Gómez",
      schedule: JSON.stringify([{ day: 1, from: "18:00", to: "22:00", room: "Aula 7" }]),
      finalGrade: "",
      color: "#22D3EE",
      notesMd: "## Bibliografía",
    });
    expect(c.spaceId).toBe(study?.id);
    expect(c.status).toBe("cursando");
    expect(c.schedule).toEqual([{ day: 1, from: "18:00", to: "22:00", room: "Aula 7" }]);
    expect(c.finalGrade).toBeNull();
    expect((await events(ctx.workspaceId, "materia.creada")).length).toBe(1);
  });

  it("valida: nombre obligatorio, horarios coherentes y nota de 0 a 10", async () => {
    const ctx = await makeWorkspace();
    await expect(createCourse(ctx, { name: "  " })).rejects.toThrow();
    await expect(createCourse(ctx, { name: "X", schedule: [{ day: 1, from: "20:00", to: "18:00" }] })).rejects.toThrow(/termina antes/);
    await expect(createCourse(ctx, { name: "X", finalGrade: "11" })).rejects.toThrow(/0 a 10/);
    const c = await createCourse(ctx, { name: "Mate", finalGrade: "8,5", status: "aprobada" });
    expect(c.finalGrade).toBe("8.50");
  });

  it("edita la materia y cambia el estado", async () => {
    const ctx = await makeWorkspace();
    const c = await createCourse(ctx, { name: "TLED" });
    const u = await updateCourse(ctx, c.id, { name: "TLED II", status: "regular", schedule: [] });
    expect(u.name).toBe("TLED II");
    expect(u.status).toBe("regular");
    const r = await setCourseStatus(ctx, c.id, "aprobada");
    expect(r.course?.status).toBe("aprobada");
    expect(r.previousStatus).toBe("regular");
    expect((await listCourses(ctx)).find((x) => x.id === c.id)).toBeUndefined();
    expect((await listCourses(ctx, { status: "aprobada" })).find((x) => x.id === c.id)).toBeDefined();
  });

  it("evaluaciones: crear, calificar (evaluacion.calificada), avance y promedio coherentes con Hoy", async () => {
    const ctx = await makeWorkspace();
    const today = todayAR();
    const c = await createCourse(ctx, { name: "PSEC" });
    const past = await createAssessment(ctx, c.id, { kind: "tp", title: "TP 1", date: addDays(today, -10) });
    const next = await createAssessment(ctx, c.id, { kind: "parcial", title: "Parcial 1", date: addDays(today, 6), time: "18:00", targetGrade: "9", topicsMd: "- Recursión\n- Listas" });
    await createAssessment(ctx, c.id, { kind: "final", date: addDays(today, 40) });
    expect((await events(ctx.workspaceId, "evaluacion.creada")).length).toBe(3);
    await expect(createAssessment(ctx, c.id, { kind: "parcial", date: "mañana" })).rejects.toThrow();

    await gradeAssessment(ctx, past.id, "7");
    const g2 = await updateAssessment(ctx, next.id, { kind: "parcial", title: "Parcial 1", date: next.date, time: "18:00", targetGrade: "9", grade: "9,5" });
    expect(g2.grade).toBe("9.50");
    expect((await events(ctx.workspaceId, "evaluacion.calificada")).length).toBe(2);

    const [row] = await listCourses(ctx);
    expect(row?.stats.total).toBe(3);
    expect(row?.stats.taken).toBe(2); // pasada + calificada
    expect(row?.stats.progress).toBe(67);
    expect(row?.stats.average).toBe("8.25");
    // Hoy usa el mismo criterio de avance
    const hoy = await getToday(ctx, { userId: ctx.userId ?? "" });
    expect(hoy.study?.courses.find((x) => x.id === c.id)?.progress).toBe(67);

    const ov = await studyOverview(ctx);
    expect(ov.upcoming.map((u) => u.a.kind)).toEqual(["final"]);
    expect(ov.average).toBe("8.25");
  });

  it("plan de estudio: una tarea por tema, fechas repartidas hasta la evaluación, en el espacio Facultad", async () => {
    const ctx = await makeWorkspace();
    const today = todayAR();
    const study = ctx.spaces.find((s) => s.kind === "study");
    const c = await createCourse(ctx, { name: "Int. a la Programación" });
    const a = await createAssessment(ctx, c.id, { kind: "parcial", date: addDays(today, 6), topicsMd: "## Temas\n- Variables\n- Funciones\n- [ ] Recursión" });
    const tasks = await createStudyPlan(ctx, a.id, { topics: "- Variables\n- Funciones\n- Recursión" });
    expect(tasks.map((t) => t.title)).toEqual(["Estudiar: Variables", "Estudiar: Funciones", "Estudiar: Recursión"]);
    expect(tasks.every((t) => t.spaceId === study?.id)).toBe(true);
    expect(tasks[0]?.dueDate).toBe(today);
    expect(tasks[2]?.dueDate).toBe(addDays(today, 5));
    const detail = await getCourse(ctx, c.id);
    expect(detail?.plan.get(a.id)?.length).toBe(3);
    // evaluación pasada → no se puede
    const old = await createAssessment(ctx, c.id, { kind: "tp", date: addDays(today, -1) });
    await expect(createStudyPlan(ctx, old.id, { topics: "- algo" })).rejects.toThrow(/ya pasó/);
    await expect(createStudyPlan(ctx, a.id, { topics: "" })).rejects.toThrow();
  });

  it("helpers puros: temas desde Markdown y reparto de fechas", () => {
    expect(topicsFromMarkdown("# T\n- a\n* b\n1. c\n\n- [x] d")).toEqual(["a", "b", "c", "d"]);
    expect(spreadDates(3, "2030-01-01", "2030-01-08")).toEqual(["2030-01-01", "2030-01-04", "2030-01-07"]);
    expect(spreadDates(1, "2030-01-01", "2030-01-08")).toEqual(["2030-01-07"]);
    expect(spreadDates(4, "2030-01-01", "2030-01-02")).toEqual(["2030-01-01", "2030-01-01", "2030-01-01", "2030-01-01"]);
  });

  it("ficha: apuntes = notas vinculadas a la materia", async () => {
    const ctx = await makeWorkspace();
    const c = await createCourse(ctx, { name: "TLED" });
    await getDb().insert(schema.note).values({ workspaceId: ctx.workspaceId, title: "Resumen módulo I", slug: `resumen-${c.id}`, entityType: "course", entityId: c.id });
    await getDb().insert(schema.note).values({ workspaceId: ctx.workspaceId, title: "Otra nota", slug: `otra-${c.id}` });
    const d = await getCourse(ctx, c.id);
    expect(d?.notes.map((n) => n.title)).toEqual(["Resumen módulo I"]);
  });

  it("papelera: eliminar y restaurar una materia", async () => {
    const ctx = await makeWorkspace();
    const c = await createCourse(ctx, { name: "Borrable" });
    await moveToTrash(ctx, "course", c.id);
    expect(await getCourse(ctx, c.id)).toBeNull();
    await restoreFromTrash(ctx, "course", c.id);
    expect(await getCourse(ctx, c.id)).not.toBeNull();
  });

  it("aislamiento multi-inquilino: A no ve ni modifica materias de B", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const cb = await createCourse(b, { name: "Secreta de B" });
    const ab = await createAssessment(b, cb.id, { kind: "parcial", date: addDays(todayAR(), 3) });
    expect((await listCourses(a, { includeAll: true })).find((x) => x.id === cb.id)).toBeUndefined();
    expect(await getCourse(a, cb.id)).toBeNull();
    await expect(updateCourse(a, cb.id, { name: "Hackeada" })).rejects.toThrow(/no existe/);
    await expect(createAssessment(a, cb.id, { kind: "parcial", date: "2030-01-01" })).rejects.toThrow(/no existe/);
    await expect(gradeAssessment(a, ab.id, "10")).rejects.toThrow(/no existe/);
    await expect(createStudyPlan(a, ab.id, { topics: "- x" })).rejects.toThrow(/no existe/);
    await expect(moveToTrash(a, "course", cb.id)).rejects.toThrow();
  });

  it("permisos MCP: con read:all no puede crear materias", async () => {
    const ctx = await makeWorkspace();
    const bot = agentCtx(ctx, ["read:all", "write:tasks"]);
    await expect(createCourse(bot, { name: "Desde Claude" })).rejects.toThrow(/alcance/);
  });
});
