import "server-only";
import type { Ctx } from "@agencyos/core";
import { getDb } from "@agencyos/db";
import { normName, parseFrontmatter, parseWikilinks } from "@agencyos/modules/notes/parse";
import { resolveNoteTitles } from "@agencyos/modules/notes/service";
import { renderMarkdown } from "@/lib/markdown";

export type NotePreview = { html: string; frontmatter: Record<string, unknown> };

/**
 * Vista previa de una nota: frontmatter aparte y cuerpo renderizado con `[[enlaces]]` resueltos.
 * Un enlace a una nota inexistente apunta a /notas/nueva?titulo=… (la vista previa ofrece crearla con un clic).
 */
export async function renderNote(ctx: Ctx, md: string): Promise<NotePreview> {
  const { data, body } = parseFrontmatter(md);
  const targets = await resolveNoteTitles(getDb(), ctx, parseWikilinks(body).map((w) => w.target));
  const html = renderMarkdown(body, (title) => {
    const hit = targets.get(normName(title.replace(/\.md$/i, "").split("/").pop() ?? title));
    return hit ? `/notas/${hit.id}` : `/notas/nueva?titulo=${encodeURIComponent(title.trim())}`;
  });
  return { html, frontmatter: data };
}
