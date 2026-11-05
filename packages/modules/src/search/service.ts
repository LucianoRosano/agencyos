import type { Ctx } from "@agencyos/core";
import { sql } from "drizzle-orm";
import { getDb } from "../shared/db";
import { entityHref } from "../shared/entities";

export type SearchHit = { type: string; id: string; title: string; subtitle: string | null; href: string };

/**
 * Búsqueda global tolerante a tildes (unaccent) y a errores leves (pg_trgm).
 * Un solo round-trip con UNION ALL sobre las entidades buscables.
 */
export async function globalSearch(ctx: Ctx, q: string, opts: { types?: string[]; limit?: number } = {}): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 100);
  if (term.length < 1) return [];
  const ws = ctx.workspaceId;
  const lim = opts.limit ?? 30;
  const like = sql`'%' || f_search_norm(${term}) || '%'`;
  const norm = sql`f_search_norm(${term})`;
  const parts = [
    {
      type: "client",
      q: sql`select 'client' as type, id, name as title, coalesce(trade_name, industry) as subtitle, similarity(f_search_norm(coalesce(name,'') || ' ' || coalesce(trade_name,'')), ${norm}) as score from client where workspace_id = ${ws} and deleted_at is null and (f_search_norm(coalesce(name,'') || ' ' || coalesce(trade_name,'')) like ${like} or f_search_norm(coalesce(name,'') || ' ' || coalesce(trade_name,'')) % ${norm})`,
    },
    {
      type: "contact",
      q: sql`select 'contact', id, name, coalesce(role, email), similarity(f_search_norm(coalesce(name,'') || ' ' || coalesce(email,'')), ${norm}) from contact where workspace_id = ${ws} and deleted_at is null and (f_search_norm(coalesce(name,'') || ' ' || coalesce(email,'')) like ${like} or f_search_norm(coalesce(name,'') || ' ' || coalesce(email,'')) % ${norm})`,
    },
    {
      type: "project",
      q: sql`select 'project', id, name, status, similarity(f_search_norm(name), ${norm}) from project where workspace_id = ${ws} and deleted_at is null and (f_search_norm(name) like ${like} or f_search_norm(name) % ${norm})`,
    },
    {
      type: "task",
      q: sql`select 'task', id, title, status, similarity(f_search_norm(title), ${norm}) from task where workspace_id = ${ws} and deleted_at is null and (f_search_norm(title) like ${like} or f_search_norm(title) % ${norm})`,
    },
    {
      type: "opportunity",
      q: sql`select 'opportunity', id, title, stage, similarity(f_search_norm(title), ${norm}) from opportunity where workspace_id = ${ws} and deleted_at is null and (f_search_norm(title) like ${like} or f_search_norm(title) % ${norm})`,
    },
    {
      type: "quote",
      q: sql`select 'quote', id, number || ' · ' || title, status, similarity(f_search_norm(number || ' ' || title), ${norm}) from quote where workspace_id = ${ws} and deleted_at is null and (f_search_norm(number || ' ' || title) like ${like} or f_search_norm(number || ' ' || title) % ${norm})`,
    },
    {
      type: "note",
      q: sql`select 'note', id, title, folder_path, greatest(similarity(f_search_norm(title), ${norm}), case when to_tsvector('spanish', f_unaccent(body_md)) @@ plainto_tsquery('spanish', f_unaccent(${term})) then 0.3 else 0 end) from note where workspace_id = ${ws} and deleted_at is null and (f_search_norm(title) like ${like} or f_search_norm(title) % ${norm} or to_tsvector('spanish', f_unaccent(body_md)) @@ plainto_tsquery('spanish', f_unaccent(${term})))`,
    },
    {
      type: "course",
      q: sql`select 'course', id, name, term, similarity(f_search_norm(name), ${norm}) from course where workspace_id = ${ws} and deleted_at is null and (f_search_norm(name) like ${like} or f_search_norm(name) % ${norm})`,
    },
    {
      type: "site",
      q: sql`select 'site', id, name, coalesce(prod_url, staging_url, kind), similarity(f_search_norm(name || ' ' || coalesce(prod_url,'')), ${norm}) from site where workspace_id = ${ws} and deleted_at is null and (f_search_norm(name || ' ' || coalesce(prod_url,'')) like ${like} or f_search_norm(name) % ${norm})`,
    },
  ].filter((p) => !opts.types || opts.types.includes(p.type));
  if (!parts.length) return [];
  const union = sql.join(
    parts.map((p) => sql`(${p.q} limit 12)`),
    sql` union all `,
  );
  const res = await getDb().execute<{ type: string; id: string; title: string; subtitle: string | null; score: number }>(
    sql`select * from (${union}) s(type, id, title, subtitle, score) order by score desc, title asc limit ${lim}`,
  );
  return res.rows.map((r) => ({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle, href: entityHref(r.type, r.id) }));
}
