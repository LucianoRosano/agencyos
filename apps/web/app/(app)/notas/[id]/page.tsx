import { ENTITY_COLORS, L, label, relativeFromDate } from "@agencyos/core";
import { ENTRY_POINTS } from "@agencyos/modules/ai/agents";
import { availableAgents } from "@agencyos/modules/ai/queries";
import { connectionsOf, folderPaths, getNote, linkableEntities, unlinkedMentions } from "@agencyos/modules/notes/queries";
import { Card, EntityChip, SectionLabel } from "@agencyos/ui";
import { CalendarDays, ChevronLeft, Folder, Pin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentEntryButton } from "@/components/ai/ai-ui";
import { LocalGraph } from "@/components/brain/local-graph";
import { AttachmentsBlock } from "@/components/library/attachments-block";
import { Connections } from "@/components/notes/connections";
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteMenu, NotePropsSheet, UnlinkedMentions } from "@/components/notes/note-side";
import { spaceOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";
import { renderNote } from "../render";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = (await params).id;
  const n = /^[0-9a-f-]{36}$/i.test(id) ? await getNote(ctx, id) : null;
  return { title: n?.n.title ?? "Nota" };
}

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireCtx();
  const data = await getNote(ctx, id);
  if (!data) notFound();
  const { n } = data;
  const [preview, connections, unlinked, spaces, entities, folders, ai] = await Promise.all([
    renderNote(ctx, n.bodyMd),
    connectionsOf(ctx, "note", id),
    unlinkedMentions(ctx, { id, title: n.title, aliases: n.aliases }),
    spaceOpts(ctx),
    linkableEntities(ctx),
    folderPaths(ctx),
    availableAgents(ctx),
  ]);
  const tags = Array.isArray(n.frontmatter.tags) ? (n.frontmatter.tags as unknown[]).map(String) : [];
  const backCount = connections.reduce((s, g) => s + g.items.filter((i) => i.direction !== "out").length, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted">
        <Link
          href={n.folderPath ? `/notas?carpeta=${encodeURIComponent(n.folderPath)}` : "/notas"}
          className="-ml-1 flex h-10 items-center gap-1 rounded-md px-1 hover:text-text md:h-8"
        >
          <ChevronLeft className="size-4" /> Notas
        </Link>
        {n.folderPath ? (
          <span className="flex min-w-0 items-center gap-1 normal-case tracking-normal">
            <Folder className="size-3.5" />
            <span className="truncate">{n.folderPath}</span>
          </span>
        ) : null}
        {n.isDaily ? (
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" /> Diaria
          </span>
        ) : null}
        {n.pinned ? (
          <span className="flex items-center gap-1 text-accent">
            <Pin className="size-3.5" /> Fijada
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">
          {ai.has(ENTRY_POINTS.note.agentKey) ? <AgentEntryButton entityType="note" entityId={id} label={ENTRY_POINTS.note.label} /> : null}
          <NotePropsSheet
            id={id}
            spaces={spaces}
            entities={entities}
            folders={folders}
            defaults={{
              spaceId: n.spaceId,
              folderPath: n.folderPath,
              entity: n.entityType && n.entityId ? `${n.entityType}:${n.entityId}` : "",
              aliases: n.aliases.join(", "),
            }}
          />
          <NoteMenu id={id} title={n.title} pinned={n.pinned} />
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <NoteEditor
          note={{
            id,
            title: n.title,
            bodyMd: n.bodyMd,
            spaceId: n.spaceId,
            folderPath: n.folderPath,
            updatedAt: n.updatedAt.getTime(),
            wordCount: n.wordCount,
          }}
          initialPreview={preview}
        />

        <aside className="flex flex-col gap-4" aria-label="Contexto de la nota">
          <Card className="p-4">
            <SectionLabel className="mb-3">Propiedades</SectionLabel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-text-muted">Espacio</dt>
              <dd className="min-w-0">
                {data.spaceName ? (
                  <EntityChip color={data.spaceColor ?? "#8A93A6"}>{data.spaceName}</EntityChip>
                ) : (
                  <span className="text-text-faint">Sin espacio</span>
                )}
              </dd>
              <dt className="text-text-muted">Vínculo</dt>
              <dd className="min-w-0">
                {data.entity ? (
                  <Link href={data.entity.href} className="hover:underline">
                    <EntityChip color={ENTITY_COLORS[data.entity.type] ?? "#8A93A6"}>
                      {label(L.entityType, data.entity.type)} · {data.entity.title}
                    </EntityChip>
                  </Link>
                ) : (
                  <span className="text-text-faint">Ninguno</span>
                )}
              </dd>
              {tags.length ? (
                <>
                  <dt className="text-text-muted">Etiquetas</dt>
                  <dd className="flex min-w-0 flex-wrap gap-1">
                    {tags.map((t) => (
                      <Link
                        key={t}
                        href={`/notas?etiqueta=${encodeURIComponent(t.toLowerCase().replace(/^#/, ""))}`}
                        className="rounded-md border border-border bg-bg-elevated px-1.5 font-mono text-[12px] text-text-muted hover:text-text"
                      >
                        #{t.replace(/^#/, "")}
                      </Link>
                    ))}
                  </dd>
                </>
              ) : null}
              {n.aliases.length ? (
                <>
                  <dt className="text-text-muted">Alias</dt>
                  <dd className="min-w-0 truncate">{n.aliases.join(", ")}</dd>
                </>
              ) : null}
              <dt className="text-text-muted">Creada</dt>
              <dd>{relativeFromDate(n.createdAt)}</dd>
              <dt className="text-text-muted">Editada</dt>
              <dd>{relativeFromDate(n.updatedAt)}</dd>
            </dl>
          </Card>

          <Card className="p-4">
            <SectionLabel className="mb-3">
              Conectado con <span className="ml-1 text-text-faint">{backCount ? `· ${backCount} backlinks` : ""}</span>
            </SectionLabel>
            <Connections groups={connections} />
          </Card>

          <AttachmentsBlock ctx={ctx} entityType="note" entityId={id} className="p-4" emptyText="Sin archivos adjuntos a esta nota." />

          <Card className="p-4">
            <SectionLabel className="mb-3">Menciones no enlazadas</SectionLabel>
            <UnlinkedMentions noteId={id} items={unlinked} />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between px-4 pt-4">
              <SectionLabel>Grafo local</SectionLabel>
              <Link href={`/cerebro?nodo=${encodeURIComponent(`note:${id}`)}`} className="text-[12px] text-text-muted hover:text-text">
                Abrir en el Cerebro
              </Link>
            </div>
            <LocalGraph entityType="note" entityId={id} depth={1} className="h-64" />
          </Card>
        </aside>
      </div>
    </div>
  );
}
