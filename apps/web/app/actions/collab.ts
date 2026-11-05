"use server";

import * as svc from "@agencyos/modules/collab/service";
import { globalSearch } from "@agencyos/modules/search/service";
import { run } from "@/lib/action";
import { requireCtx } from "@/lib/session";

export async function createTagAction(name: string, color?: string) {
  return run((ctx) => svc.createTag(ctx, { name, color }));
}
export async function setTagsAction(type: string, id: string, tagIds: string[]) {
  return run((ctx) => svc.setEntityTags(ctx, type, id, tagIds));
}
export async function addCommentAction(type: string, id: string, body: string) {
  return run((ctx) => svc.addComment(ctx, type, id, body));
}
export async function deleteCommentAction(commentId: string) {
  return run((ctx) => svc.deleteComment(ctx, commentId));
}
export async function addLinkAction(fromType: string, fromId: string, toType: string, toId: string) {
  return run((ctx) => svc.addLink(ctx, { type: fromType, id: fromId }, { type: toType, id: toId }));
}
export async function removeLinkAction(linkId: string) {
  return run((ctx) => svc.removeLink(ctx, linkId));
}
export async function searchEntitiesAction(q: string) {
  const ctx = await requireCtx();
  return globalSearch(ctx, q, { limit: 12 });
}
export async function saveViewAction(module: string, name: string, query: string) {
  return run((ctx) => svc.saveView(ctx, { module, name, query }));
}
export async function deleteViewAction(id: string) {
  return run((ctx) => svc.deleteSavedView(ctx, id));
}
