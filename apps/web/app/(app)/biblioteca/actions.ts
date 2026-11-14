"use server";

import type { Result } from "@agencyos/core";
import { attachmentsOf, pickerFiles } from "@agencyos/modules/library/queries";
import * as svc from "@agencyos/modules/library/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

// Archivos
export const updateFileAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateFile(ctx, id, obj(fd)));
export const restoreVersionAction = async (id: string, version: number) => run((ctx) => svc.restoreVersion(ctx, id, version));
export const deleteFileAction = async (id: string) => run((ctx) => moveToTrash(ctx, "file", id));
export const restoreFileAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "file", id));

// Carpetas
export const createFolderAction = async (_: S, fd: FormData) => run((ctx) => svc.createFolder(ctx, obj(fd)));
export const renameFolderAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.renameFolder(ctx, id, obj(fd)));
export const deleteFolderAction = async (id: string) => run((ctx) => moveToTrash(ctx, "folder", id));
export const restoreFolderAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "folder", id));

// Adjuntos
export const listAttachmentsAction = async (entityType: string, entityId: string) =>
  run((ctx) => attachmentsOf(ctx, entityType, entityId), { revalidate: false });
export const attachFileAction = async (fileId: string, entityType: string, entityId: string) =>
  run(async (ctx) => {
    await svc.attachFile(ctx, { fileId, entityType, entityId });
    return true;
  });
export const detachFileAction = async (attachmentId: string) => run((ctx) => svc.detachFile(ctx, attachmentId));
export const pickerFilesAction = async (q: string, kinds?: string[]) => run((ctx) => pickerFiles(ctx, q, kinds), { revalidate: false });

// Kit de marca
export const saveBrandKitAction = async (clientId: string, _: S, fd: FormData) => run((ctx) => svc.saveBrandKit(ctx, clientId, obj(fd)));

// Plantillas
export const createTemplateAction = async (_: S, fd: FormData) => run((ctx) => svc.createTemplate(ctx, obj(fd)));
export const updateTemplateAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateTemplate(ctx, id, obj(fd)));
export const deleteTemplateAction = async (id: string) => run((ctx) => moveToTrash(ctx, "reusable_template", id));
export const restoreTemplateAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "reusable_template", id));

// Portal de clientes (M15): «Compartir con el cliente» (etiqueta reservada «compartido»).
export const setFileSharedAction = async (id: string, shared: boolean) => {
  const { setFileShared } = await import("@agencyos/modules/portal/service");
  return run((ctx) => setFileShared(ctx, id, shared));
};
