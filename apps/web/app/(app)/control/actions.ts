"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/devos/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => {
  const o: Record<string, unknown> = Object.fromEntries(fd);
  o.skillIds = fd.getAll("skillIds").map(String).filter(Boolean);
  return o;
};

export const createGoalAction = async (_: S, fd: FormData) => run((ctx) => svc.createGoal(ctx, obj(fd)));
export const proposePlanAction = async (goalId: string, _: S, fd: FormData) =>
  run((ctx) =>
    svc.proposePlan(ctx, goalId, {
      steps: String(fd.get("plan") ?? "")
        .split("\n")
        .map((l) => l.trim().replace(/^[-*\d.)\s]+/, ""))
        .filter(Boolean)
        .map((l) => {
          const ok = /\(ok\)|\[ok\]|!$/i.test(l);
          const deploy = /^(publicar|desplegar|deploy)/i.test(l);
          return { title: l.replace(/\s*(\(ok\)|\[ok\]|!)$/i, ""), requiresApproval: ok, kind: deploy ? "deploy" : "task" };
        }),
    }),
  );
export const approvePlanAction = async (goalId: string, createTasks: boolean) => run((ctx) => svc.approvePlan(ctx, goalId, { createTasks }));
export const rejectPlanAction = async (goalId: string, _: S, fd: FormData) => run((ctx) => svc.rejectPlan(ctx, goalId, String(fd.get("comment") ?? "")));
export const decideStepAction = async (goalId: string, idx: number, approve: boolean) => run((ctx) => svc.decideStep(ctx, goalId, idx, approve));
export const reviewGoalAction = async (goalId: string, accept: boolean, _: S, fd: FormData) =>
  run((ctx) => svc.reviewGoal(ctx, goalId, accept, String(fd.get("comment") ?? "")));
export const acceptGoalAction = async (goalId: string) => run((ctx) => svc.reviewGoal(ctx, goalId, true));
export const cancelGoalAction = async (goalId: string) => run((ctx) => svc.cancelGoal(ctx, goalId));

export const createSkillAction = async (_: S, fd: FormData) => run((ctx) => svc.createSkill(ctx, Object.fromEntries(fd)));
export const updateSkillAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateSkill(ctx, id, Object.fromEntries(fd)));
export const setSkillActiveAction = async (id: string, active: boolean) => run((ctx) => svc.setSkillActive(ctx, id, active));
export const addSkillTemplateAction = async (key: string) => run((ctx) => svc.addSkillFromTemplate(ctx, key));
