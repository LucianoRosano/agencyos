"use server";

import { formToObject, type Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/sites/service";
import { archive, moveToTrash, restoreFromTrash, unarchive } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

// Sitio
export const createSiteAction = async (_: S, fd: FormData) => run((ctx) => svc.createSite(ctx, obj(fd)));
export const updateSiteAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateSite(ctx, id, obj(fd)));
export const setPublicationStatusAction = async (id: string, status: string, force = false) => run((ctx) => svc.setPublicationStatus(ctx, id, status, force));
export const deleteSiteAction = async (id: string) => run((ctx) => moveToTrash(ctx, "site", id));
export const restoreSiteAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "site", id));
export const archiveSiteAction = async (id: string) => run((ctx) => archive(ctx, "site", id));
export const unarchiveSiteAction = async (id: string) => run((ctx) => unarchive(ctx, "site", id));

// Briefing (los campos múltiples llegan como `clave[]`)
export const saveBriefAction = async (siteId: string, _: S, fd: FormData) => run((ctx) => svc.saveBrief(ctx, siteId, formToObject(fd)));
export const generateQuestionsAction = async (siteId: string) => run((ctx) => svc.generateBriefQuestions(ctx, siteId));
export const saveQuestionsAction = async (siteId: string, _: S, fd: FormData) => run((ctx) => svc.saveBriefQuestions(ctx, siteId, fd.get("questions")));

// Requerimientos
export const addRequirementAction = async (siteId: string, _: S, fd: FormData) => run((ctx) => svc.addRequirement(ctx, siteId, obj(fd)));
export const updateRequirementAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateRequirement(ctx, id, obj(fd)));
export const setRequirementStatusAction = async (id: string, status: string) => run((ctx) => svc.setRequirementStatus(ctx, id, status));
export const moveRequirementAction = async (id: string, dir: "up" | "down") => run((ctx) => svc.moveRequirement(ctx, id, dir));
export const deleteRequirementAction = async (id: string) => run((ctx) => moveToTrash(ctx, "site_requirement", id));
export const restoreRequirementAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "site_requirement", id));

// Estructura
export const saveBlueprintAction = async (siteId: string, treeJson: string) =>
  run(async (ctx) => {
    const r = await svc.saveBlueprint(ctx, siteId, treeJson, "manual");
    return { version: r.blueprint.version, sync: r.sync };
  });
export const applyTemplateAction = async (siteId: string, kind: string) =>
  run(async (ctx) => {
    const r = await svc.applyBlueprintTemplate(ctx, siteId, kind);
    return { version: r.blueprint.version, sync: r.sync };
  });
export const restoreBlueprintAction = async (siteId: string, version: number) =>
  run(async (ctx) => {
    const r = await svc.restoreBlueprintVersion(ctx, siteId, version);
    return { version: r.blueprint.version, sync: r.sync };
  });

// Contenidos
export const updateSlotAction = async (slotId: string, _: S, fd: FormData) => run((ctx) => svc.updateSlot(ctx, slotId, obj(fd)));
export const setSlotStatusAction = async (slotId: string, status: string) => run((ctx) => svc.setSlotStatus(ctx, slotId, status));

// Revisiones
export const openRoundAction = async (siteId: string) => run((ctx) => svc.openRevisionRound(ctx, siteId));
export const closeRoundAction = async (roundId: string) => run((ctx) => svc.closeRevisionRound(ctx, roundId));
export const addRevisionItemAction = async (roundId: string, _: S, fd: FormData) => run((ctx) => svc.addRevisionItem(ctx, roundId, obj(fd)));
export const updateRevisionItemAction = async (itemId: string, _: S, fd: FormData) => run((ctx) => svc.updateRevisionItem(ctx, itemId, obj(fd)));
export const setRevisionItemStatusAction = async (itemId: string, status: string) => run((ctx) => svc.setRevisionItemStatus(ctx, itemId, status));

// Entornos
export const saveEnvironmentAction = async (siteId: string, envId: string | null, _: S, fd: FormData) =>
  run((ctx) => svc.saveEnvironment(ctx, siteId, envId, obj(fd)));
export const deleteEnvironmentAction = async (envId: string) =>
  run(async (ctx) => {
    const r = await moveToTrash(ctx, "site_environment", envId);
    await svc.resyncSiteUrls(ctx, envId);
    return r;
  });
export const restoreEnvironmentAction = async (envId: string) =>
  run(async (ctx) => {
    const r = await restoreFromTrash(ctx, "site_environment", envId);
    await svc.resyncSiteUrls(ctx, envId);
    return r;
  });

// Checklist de lanzamiento
export const updateLaunchCheckAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateLaunchCheck(ctx, id, obj(fd)));
export const setLaunchCheckStatusAction = async (id: string, status: string) => run((ctx) => svc.setLaunchCheckStatus(ctx, id, status));
export const addLaunchCheckAction = async (siteId: string, _: S, fd: FormData) => run((ctx) => svc.addLaunchCheck(ctx, siteId, obj(fd)));

// Documentación
export const ensureDocsNoteAction = async (siteId: string) => run((ctx) => svc.ensureDocsNote(ctx, siteId));
