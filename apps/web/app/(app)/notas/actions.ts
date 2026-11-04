"use server";

import { notFound, type Result } from "@agencyos/core";
import { getNote, listVersions } from "@agencyos/modules/notes/queries";
import * as svc from "@agencyos/modules/notes/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { run } from "@/lib/action";
import { requireCtx } from "@/lib/session";
import { renderNote } from "./render";

type S = Result<unknown> | null;
const obj = (fd: FormData) => Object.fromEntries(fd);

/** Formulario de propiedades: "entity" llega como "tipo:id". */
function withEntity(fd: FormData) {
  const o: Record<string, unknown> = obj(fd);
  if ("entity" in o) {
    const [type, id] = String(o.entity ?? "").split(":");
    o.entityType = type && id ? type : "";
    o.entityId = type && id ? id : "";
    delete o.entity;
  }
  return o;
}

export const createNoteAction = async (_: S, fd: FormData) => run((ctx) => svc.createNote(ctx, withEntity(fd)));

/** Crea la nota destino de un [[enlace]] desde la vista previa (mismo espacio y carpeta que la nota de origen). */
export const createLinkedNoteAction = async (title: string, from?: { spaceId?: string | null; folderPath?: string | null }) =>
  run((ctx) => svc.createNote(ctx, { title, spaceId: from?.spaceId ?? undefined, folderPath: from?.folderPath ?? undefined }));

export type SaveNoteResponse = { html: string; frontmatter: Record<string, unknown>; title: string; savedAt: number; versioned: boolean; linkSig: string; wordCount: number };

/** Autoguardado: guarda (transacción con enlaces y versión) y devuelve la vista previa. Sin revalidar toda la página. */
export const saveNoteAction = async (id: string, patch: { title?: string; bodyMd?: string }) =>
  run(
    async (ctx): Promise<SaveNoteResponse> => {
      const res = await svc.updateNote(ctx, id, patch);
      const preview = await renderNote(ctx, res.note.bodyMd);
      return {
        ...preview,
        title: res.note.title,
        savedAt: res.note.updatedAt.getTime(),
        versioned: res.versioned,
        linkSig: res.links ? `${res.links.resolved}:${res.links.mentions}` : "",
        wordCount: res.note.wordCount,
      };
    },
    { revalidate: false },
  );

/** Vista previa del contenido guardado (tras restaurar una versión o enlazar una mención). */
export async function notePreviewAction(id: string) {
  return run(
    async (ctx) => {
      const n = await getNote(ctx, id);
      if (!n) throw notFound("La nota");
      return { ...(await renderNote(ctx, n.n.bodyMd)), bodyMd: n.n.bodyMd, title: n.n.title };
    },
    { revalidate: false },
  );
}

export const updateNotePropsAction = async (id: string, _: S, fd: FormData) => run((ctx) => svc.updateNote(ctx, id, withEntity(fd)).then((r) => r.note));
export const setNotePinnedAction = async (id: string, pinned: boolean) => run((ctx) => svc.setNotePinned(ctx, id, pinned));
export const deleteNoteAction = async (id: string) => run((ctx) => moveToTrash(ctx, "note", id));
export const restoreNoteAction = async (id: string) => run((ctx) => restoreFromTrash(ctx, "note", id));
export const restoreVersionAction = async (versionId: string) => run((ctx) => svc.restoreVersion(ctx, versionId));
export const linkMentionAction = async (sourceId: string, targetId: string) => run((ctx) => svc.linkUnlinkedMention(ctx, sourceId, targetId));

export async function noteVersionsAction(noteId: string) {
  const ctx = await requireCtx();
  const rows = await listVersions(ctx, noteId);
  return rows.map((v) => ({ id: v.id, title: v.title, bodyMd: v.bodyMd, createdAt: v.createdAt.getTime() }));
}
