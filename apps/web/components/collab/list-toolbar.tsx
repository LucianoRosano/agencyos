import * as collab from "@agencyos/modules/collab/service";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import type { AppCtx } from "@/lib/session";
import { DeleteViewButton, SaveViewButton } from "./views-ui";

type Module = "tareas" | "proyectos" | "clientes" | "movimientos" | "notas";

/** Barra común de listas: vistas guardadas (N11) y filtro por etiqueta (N6). Sin JS salvo guardar/borrar. */
export async function ListToolbar({ ctx, module, basePath, sp }: { ctx: AppCtx; module: Module; basePath: string; sp: Record<string, string | undefined> }) {
  const [tags, views] = await Promise.all([collab.listTags(ctx), collab.listSavedViews(ctx, module)]);
  const params = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  const current = params.toString();
  const withTag = (tagId: string | null) => {
    const p = new URLSearchParams(params);
    if (tagId) p.set("etiqueta", tagId);
    else p.delete("etiqueta");
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (!tags.length && !views.length && !current) return null;
  const chip = "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors";
  return (
    <div className="mb-4 flex flex-col gap-2" data-testid="list-toolbar">
      {views.length || current ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {views.map((v) => {
            const active = v.query === current;
            return (
              <span key={v.id} className="inline-flex items-center">
                <Link
                  href={v.query ? `${basePath}?${v.query}` : basePath}
                  className={`${chip} ${active ? "border-accent/60 bg-accent/10 text-text" : "border-border text-text-muted hover:text-text"}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Bookmark className="size-3.5" />
                  {v.name}
                </Link>
                {active ? <DeleteViewButton id={v.id} name={v.name} /> : null}
              </span>
            );
          })}
          {current && !views.some((v) => v.query === current) ? <SaveViewButton module={module} query={current} /> : null}
        </div>
      ) : null}
      {tags.length ? (
        <nav aria-label="Filtrar por etiqueta" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {sp.etiqueta ? (
            <Link href={withTag(null)} className={`${chip} shrink-0 border-border text-text-muted hover:text-text`}>
              Todas
            </Link>
          ) : null}
          {tags.map((t) => {
            const on = sp.etiqueta === t.id;
            return (
              <Link
                key={t.id}
                href={withTag(on ? null : t.id)}
                aria-pressed={on}
                className={`${chip} shrink-0 ${on ? "border-transparent text-text" : "border-border text-text-muted hover:text-text"}`}
                style={on ? { background: `color-mix(in srgb, ${t.color} 22%, transparent)` } : undefined}
              >
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: t.color }} />#{t.name}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

/** Filtra filas por etiqueta si `?etiqueta=` está presente. */
export async function filterByTag<T>(ctx: AppCtx, type: string, tagId: string | undefined, rows: T[], idOf: (r: T) => string): Promise<T[]> {
  if (!tagId) return rows;
  const ids = new Set(await collab.idsWithTag(ctx, type, tagId));
  return rows.filter((r) => ids.has(idOf(r)));
}
