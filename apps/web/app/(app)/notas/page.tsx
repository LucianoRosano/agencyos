import { relativeFromDate } from "@agencyos/core";
import { type FolderNode, folderTree, listNotes, noteTags } from "@agencyos/modules/notes/queries";
import { Button, Card, cn, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Folder, FolderOpen, Hash, Pin, Plus, Search } from "lucide-react";
import Link from "next/link";
import { FilterSelect } from "@/components/notes/filter-select";
import { spaceOpts } from "@/lib/options";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Notas" };

type SP = { q?: string; carpeta?: string; etiqueta?: string; espacio?: string };

function qs(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/notas?${s}` : "/notas";
}

function Tree({ nodes, sp, depth = 0 }: { nodes: FolderNode[]; sp: SP; depth?: number }) {
  return (
    <ul className={cn("flex flex-col", depth > 0 && "ml-3 border-l border-border pl-1.5")}>
      {nodes.map((f) => {
        const active = sp.carpeta === f.path;
        const open = sp.carpeta === f.path || sp.carpeta?.startsWith(`${f.path}/`);
        return (
          <li key={f.path}>
            <Link
              href={qs(sp, { carpeta: f.path })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-[13px]",
                active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {open ? <FolderOpen className="size-3.5 shrink-0" /> : <Folder className="size-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="font-mono text-[11px] text-text-faint">{f.count}</span>
            </Link>
            {f.children.length && open ? <Tree nodes={f.children} sp={sp} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function findFolder(nodes: FolderNode[], path: string): FolderNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    const hit = findFolder(n.children, path);
    if (hit) return hit;
  }
  return undefined;
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const spaceId = sp.espacio || (await getSelectedSpace());
  const [rows, tree, tags, spaces] = await Promise.all([
    listNotes(ctx, { q: sp.q, folder: sp.carpeta, tag: sp.etiqueta, spaceId, limit: 300 }),
    folderTree(ctx),
    noteTags(ctx),
    spaceOpts(ctx),
  ]);
  const filtered = Boolean(sp.q || sp.carpeta || sp.etiqueta || sp.espacio);
  const current = sp.carpeta ? findFolder(tree.tree, sp.carpeta) : undefined;
  const parent = sp.carpeta?.includes("/") ? sp.carpeta.split("/").slice(0, -1).join("/") : undefined;
  const mobileHome = !sp.carpeta && !sp.q && !sp.etiqueta;

  const actions = (
    <>
      <Button asChild variant="ghost" className="h-11 md:h-10">
        <a href="/notas/exportar" download>
          <Download className="size-4" /> <span className="hidden sm:inline">Exportar</span>
        </a>
      </Button>
      <Button asChild variant="secondary" className="h-11 md:h-10">
        <a href="/notas/diaria">
          <CalendarDays className="size-4" /> Nota de hoy
        </a>
      </Button>
      <Button asChild variant="primary" className="h-11 md:h-10">
        <Link href={sp.carpeta ? `/notas/nueva?carpeta=${encodeURIComponent(sp.carpeta)}` : "/notas/nueva"}>
          <Plus className="size-4" /> Nueva nota
        </Link>
      </Button>
    </>
  );

  if (!tree.total) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader eyebrow="Conocimiento" title="Notas" accent="#C9D1E0" />
        <Card className="p-2">
          <EmptyState
            icon={<FileText />}
            title="Todavía no hay notas"
            description="Tu segundo cerebro en Markdown: enlazá ideas con [[Nota]], mencioná @clientes y #proyectos, y miralas conectadas en el Cerebro."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="primary">
                  <Link href="/notas/nueva">
                    <Plus className="size-4" /> Nueva nota
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <a href="/notas/diaria">
                    <CalendarDays className="size-4" /> Nota de hoy
                  </a>
                </Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Conocimiento"
        title="Notas"
        accent="#C9D1E0"
        description={`${tree.total.toLocaleString("es-AR")} notas · Markdown con [[enlaces]], backlinks e historial.`}
        actions={actions}
      />

      <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Carpetas y etiquetas" className="hidden flex-col gap-5 md:flex">
          <div>
            <SectionLabel className="mb-2">Carpetas</SectionLabel>
            <Link
              href={qs(sp, { carpeta: undefined })}
              aria-current={!sp.carpeta ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-[13px]",
                !sp.carpeta ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <FileText className="size-3.5" />
              <span className="flex-1">Todas las notas</span>
              <span className="font-mono text-[11px] text-text-faint">{tree.total}</span>
            </Link>
            <Tree nodes={tree.tree} sp={sp} />
          </div>
          {tags.length ? (
            <div>
              <SectionLabel className="mb-2">Etiquetas</SectionLabel>
              <ul className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <li key={t.name}>
                    <Link
                      href={qs(sp, { etiqueta: sp.etiqueta === t.name ? undefined : t.name })}
                      aria-current={sp.etiqueta === t.name ? "page" : undefined}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[12px]",
                        sp.etiqueta === t.name ? "border-accent/40 bg-accent-soft text-text" : "border-border text-text-muted hover:text-text",
                      )}
                    >
                      #{t.name} <span className="text-text-faint">{t.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </nav>

        <div className="min-w-0">
          {sp.carpeta ? (
            <div className="mb-3 flex items-center gap-2 md:hidden">
              <Link
                href={qs(sp, { carpeta: parent })}
                className="-ml-2 flex h-11 items-center gap-1 rounded-md px-2 text-[14px] text-text-muted"
                aria-label="Volver"
              >
                <ChevronLeft className="size-5" /> {parent ? parent.split("/").pop() : "Notas"}
              </Link>
            </div>
          ) : null}
          {sp.carpeta ? (
            <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold text-text">
              <FolderOpen className="size-4 text-text-muted" /> {sp.carpeta.split("/").pop()}
              <span className="font-mono text-[12px] font-normal text-text-faint">{sp.carpeta}</span>
            </h2>
          ) : null}

          <form action="/notas" className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
            {sp.carpeta ? <input type="hidden" name="carpeta" value={sp.carpeta} /> : null}
            {sp.etiqueta ? <input type="hidden" name="etiqueta" value={sp.etiqueta} /> : null}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
              <input
                name="q"
                defaultValue={sp.q}
                placeholder="Buscar en títulos y contenido…"
                aria-label="Buscar notas"
                className="h-11 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated pr-3 pl-9 text-base md:h-10 md:text-sm"
              />
            </div>
            <FilterSelect
              name="espacio"
              defaultValue={sp.espacio ?? ""}
              placeholder="Todos los espacios"
              options={spaces}
              aria-label="Filtrar por espacio"
              className="h-11 sm:w-48 md:h-10"
            />
          </form>

          {sp.etiqueta ? (
            <p className="mb-3 flex items-center gap-2 text-[13px] text-text-muted">
              <Hash className="size-3.5" /> Etiqueta <span className="font-mono text-text">#{sp.etiqueta}</span>
              <Link href={qs(sp, { etiqueta: undefined })} className="text-accent-2 hover:underline">
                Quitar
              </Link>
            </p>
          ) : null}

          {/* Celular: navegación por pantallas (carpetas → notas → nota) */}
          {mobileHome && tree.tree.length ? (
            <section className="mb-5 md:hidden" aria-label="Carpetas">
              <SectionLabel className="mb-2">Carpetas</SectionLabel>
              <ul className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                {tree.tree.map((f) => (
                  <li key={f.path} className="border-b border-border last:border-0">
                    <Link href={qs(sp, { carpeta: f.path })} className="flex min-h-12 items-center gap-3 px-4 text-[15px] text-text">
                      <Folder className="size-4 text-text-muted" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="font-mono text-[12px] text-text-faint">{f.count}</span>
                      <ChevronRight className="size-4 text-text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {current?.children.length ? (
            <ul className="mb-4 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface md:hidden" aria-label="Subcarpetas">
              {current.children.map((f) => (
                <li key={f.path} className="border-b border-border last:border-0">
                  <Link href={qs(sp, { carpeta: f.path })} className="flex min-h-12 items-center gap-3 px-4 text-[15px] text-text">
                    <Folder className="size-4 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="font-mono text-[12px] text-text-faint">{f.count}</span>
                    <ChevronRight className="size-4 text-text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {mobileHome ? <SectionLabel className="mb-2 md:hidden">Recientes</SectionLabel> : null}
          {rows.length ? (
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface" aria-label="Notas">
              {rows.map((r) => (
                <li key={r.id} className="border-b border-border last:border-0">
                  <Link href={`/notas/${r.id}`} className="flex min-h-14 flex-col gap-0.5 px-4 py-3 hover:bg-surface-2 md:min-h-0">
                    <span className="flex items-center gap-2">
                      {r.pinned ? <Pin className="size-3.5 shrink-0 text-accent" aria-label="Fijada" /> : null}
                      {r.isDaily ? <CalendarDays className="size-3.5 shrink-0 text-text-faint" aria-label="Diaria" /> : null}
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text">{r.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-text-faint">{relativeFromDate(r.updatedAt)}</span>
                    </span>
                    {r.snippet?.trim() ? <span className="line-clamp-1 text-[13px] text-text-muted">{r.snippet}</span> : null}
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-faint">
                      {r.folderPath ? (
                        <span className="flex min-w-0 items-center gap-1">
                          <Folder className="size-3" />
                          <span className="truncate">{r.folderPath}</span>
                        </span>
                      ) : null}
                      {r.spaceName ? (
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="size-1.5 rounded-full" style={{ background: r.spaceColor ?? "#8A93A6" }} />
                          {r.spaceName}
                        </span>
                      ) : null}
                      <span className="font-mono">{r.wordCount} pal.</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Card className="p-2">
              <EmptyState
                compact
                icon={<Search />}
                title={sp.q ? `Nada para «${sp.q}»` : "No hay notas con estos filtros"}
                description={filtered ? "Probá con otras palabras o quitá filtros." : undefined}
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href={sp.q ? `/notas/nueva?titulo=${encodeURIComponent(sp.q)}` : "/notas"}>
                      {sp.q ? (
                        <>
                          <Plus className="size-4" /> Crear «{sp.q}»
                        </>
                      ) : (
                        "Ver todas"
                      )}
                    </Link>
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
