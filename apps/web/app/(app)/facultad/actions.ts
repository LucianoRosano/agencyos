"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/study/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

// Sin revalidar: el formulario redirige a la ficha nueva (si revalidara, /facultad pasaría del estado
// vacío a la lista y desmontaría el formulario antes de poder redirigir).
export const createCourseAction = async (_: S, fd: FormData) => run((ctx) => svc.createCourse(ctx, obj(fd)), { revalidate: false });
export const updateCourseAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateCourse(ctx, id, obj(fd)));
export const setCourseStatusAction = async (id: string, status: (typeof svc.COURSE_STATUSES)[number]) => run((ctx) => svc.setCourseStatus(ctx, id, status));
export const deleteCourseAction = async (id: string) => run((ctx) => moveToTrash(ctx, "course", id));
export const restoreCourseAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "course", id));

export const createAssessmentAction = async (courseId: string, _: S, fd: FormData) => run((ctx) => svc.createAssessment(ctx, courseId, obj(fd)));
export const updateAssessmentAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateAssessment(ctx, id, obj(fd)));
export const gradeAssessmentFormAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.gradeAssessment(ctx, id, fd.get("grade") ?? ""));
export const setGradeAction = async (id: string, grade: string | null) => run((ctx) => svc.gradeAssessment(ctx, id, grade ?? ""));
export const deleteAssessmentAction = async (id: string) => run((ctx) => moveToTrash(ctx, "assessment", id));
export const restoreAssessmentAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "assessment", id));

export const createStudyPlanAction = async (assessmentId: string, _: S, fd: FormData) => run((ctx) => svc.createStudyPlan(ctx, assessmentId, obj(fd)));
