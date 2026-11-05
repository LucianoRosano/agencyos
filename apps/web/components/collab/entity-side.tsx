import { ENTITY_COLORS, L, label } from "@agencyos/core";
import * as collab from "@agencyos/modules/collab/service";
import { Card, SectionLabel } from "@agencyos/ui";
import type { AppCtx } from "@/lib/session";
import { CommentThread, ConnectionsEditor, TagEditor } from "./collab-ui";

/**
 * Panel lateral común de las fichas: etiquetas (N6), "Conectado con" (N5) y comentarios internos (N10).
 * Server Component: carga todo en paralelo y delega la interacción a componentes cliente.
 */
export async function EntitySide({ ctx, type, id, comments = true }: { ctx: AppCtx; type: string; id: string; comments?: boolean }) {
  const [allTags, tagMap, connections, thread] = await Promise.all([
    collab.listTags(ctx),
    collab.tagsFor(ctx, type, [id]),
    collab.listConnections(ctx, type, id),
    comments ? collab.listComments(ctx, type, id) : Promise.resolve([]),
  ]);
  const current = tagMap.get(id) ?? [];
  return (
    <>
      <Card className="p-5" data-testid="entity-tags">
        <SectionLabel className="mb-3">Etiquetas</SectionLabel>
        <TagEditor
          type={type}
          id={id}
          all={allTags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
          selected={current.map((t) => t.id)}
          colors={collab.TAG_COLORS}
        />
      </Card>
      <Card className="p-5" data-testid="entity-connections">
        <SectionLabel className="mb-3">Conectado con</SectionLabel>
        <ConnectionsEditor
          type={type}
          id={id}
          items={connections.map((c) => ({
            ...c,
            typeLabel: label(L.entityType, c.type),
            color: ENTITY_COLORS[c.type] ?? "#8A93A6",
          }))}
        />
      </Card>
      {comments ? (
        <Card className="p-5" data-testid="entity-comments">
          <SectionLabel className="mb-3">Comentarios internos</SectionLabel>
          <CommentThread
            type={type}
            id={id}
            me={ctx.userId ?? ""}
            isOwner={ctx.role === "owner"}
            items={thread.map((r) => ({ id: r.c.id, body: r.c.bodyMd, authorId: r.c.authorId, author: r.authorName ?? "—", at: r.c.createdAt.toISOString() }))}
          />
        </Card>
      ) : null}
    </>
  );
}
