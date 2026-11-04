"use server";

import type { Result } from "@agencyos/core";
import * as svc from "@agencyos/modules/inbox/service";
import { createProject } from "@agencyos/modules/projects/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

export const toTaskAction = async (id: string, _: Result<unknown> | null, fd: FormData) => run((ctx) => svc.convertToTask(ctx, id, Object.fromEntries(fd)));
export const toNoteAction = async (id: string) => run((ctx) => svc.convertToNote(ctx, id));
export const toProjectAction = async (id: string) =>
  run(async (ctx) => {
    const item = await svc.getItem(ctx, id);
    const p = await createProject(ctx, { name: item.text.split("\n")[0]?.slice(0, 160), spaceId: item.spaceId ?? undefined, status: "idea", notesMd: item.text });
    await svc.markProcessed(ctx, id, { type: "project", id: p.id });
    return p;
  });
export const discardAction = async (id: string) => run((ctx) => svc.markProcessed(ctx, id));
export const undoProcessAction = async (id: string) => run((ctx) => svc.unprocess(ctx, id));
export const deleteItemAction = async (id: string) => run((ctx) => moveToTrash(ctx, "inbox_item", id));
export const restoreItemAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "inbox_item", id));
export const setSpaceAction = async (id: string, spaceId: string) => run((ctx) => svc.setItemSpace(ctx, id, spaceId));
export const editTextAction = async (id: string, text: string) => run((ctx) => svc.updateItemText(ctx, id, text));
