import { L } from "@agencyos/core";
import { getFolder, libraryTree, listFiles, listFolders, siteOptions, storageUsage } from "@agencyos/modules/library/queries";
import { Button, EmptyState, PageHeader, Progress, Tabs } from "@agencyos/ui";
import { ChevronRight, LayoutGrid, LayoutTemplate, Library, List, Palette, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { FileGrid, type FolderItem } from "@/components/library/file-grid";
import { formatBytes, LIBRARY_ACCENT } from "@/components/library/file-visual";
import { FolderMenu, NewFolderSheet } from "@/components/library/library-ui";
import { UploadZone } from "@/components/library/uploader";
import { clientOpts, projectOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Biblioteca" };

const VIEWS = [
  { key: "todos", label: "Todos" },
  { key: "logos", label: "Logos" },
  { key: "imagenes", label: "Imágenes" },
  { key: "documentos", label: "Documentos" },
  { key: "ultimos", label: "Últimos" },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v?: string) => (v && UUID.test(v) ? v : undefined);
const ctl = "h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base text-text md:text-sm";
const sel = `${ctl} select-chevron appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9`;

type SP = Record<string, string | undefined>;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const view = VIEWS.find((v) => v.key === sp.vista)?.key ?? "todos";
  const mode = sp.modo === "lista" ? "lista" : "grilla";
  const clientId = uuid(sp.cliente);
  const projectId = uuid(sp.proyecto);
  const siteId = uuid(sp.sitio);
  const folderId = uuid(sp.carpeta);
  const kind = (Object.keys(L.fileKind) as string[]).includes(sp.tipo ?? "") ? sp.tipo : undefined;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const explorer = view === "todos" && !q && !kind && !siteId;

  const [clients, projects, sites, usage, folderData] = await Promise.all([
    clientOpts(ctx),
    projectOpts(ctx),
    siteOptions(ctx),
    storageUsage(ctx),
    folderId ? getFolder(ctx, folderId) : Promise.resolve(null),
  ]);
  const folder = folderData?.folder;
  const levelClient = folder ? (folder.clientId ?? undefined) : clientId;
  const levelProject = folder ? (folder.projectId ?? undefined) : projectId;
  const clientName = clients.find((c) => c.value === levelClient)?.label;
  const projectName = projects.find((p) => p.value === levelProject)?.label;

  const href = (p: SP) => {
    const s = new URLSearchParams(Object.entries({ modo: mode === "lista" ? "lista" : undefined, ...p }).filter((e): e is [string, string] => Boolean(e[1])));
    const str = s.toString();
    return `/biblioteca${str ? `?${str}` : ""}`;
  };
  const keep: SP = { vista: view === "todos" ? undefined : view, q, cliente: clientId, proyecto: projectId, sitio: siteId, tipo: kind, carpeta: folderId };

  const folders: FolderItem[] = [];
  let files: Awaited<ReturnType<typeof listFiles>>;
  if (explorer) {
    const [subFolders, tree, list] = await Promise.all([
      listFolders(ctx, { parentId: folder?.id ?? null, clientId: levelClient, projectId: levelProject }),
      !folder && !levelClient ? libraryTree(ctx) : levelClient && !levelProject && !folder ? libraryTree(ctx) : Promise.resolve([]),
      folder
        ? listFiles(ctx, { folderId: folder.id })
        : listFiles(ctx, { rootOnly: true, clientId: levelClient, noClient: !levelClient, projectId: levelProject, noProject: !levelProject }),
    ]);
    files = list;
    if (!folder && !levelClient) {
      folders.push(...tree.map((c) => ({ id: `c-${c.id}`, name: c.name, files: c.n, href: href({ cliente: c.id }), sub: `Cliente · ${c.n} archivos` })));
    } else if (!folder && levelClient && !levelProject) {
      const c = tree.find((x) => x.id === levelClient);
      folders.push(
        ...(c?.projects ?? []).map((p) => ({
          id: `p-${p.id}`,
          name: p.name,
          files: p.n,
          href: href({ cliente: levelClient, proyecto: p.id }),
          sub: `Proyecto · ${p.n} archivos`,
        })),
      );
    }
    folders.push(...subFolders.map((d) => ({ id: d.id, name: d.name, files: d.files, href: href({ carpeta: d.id }) })));
  } else {
    files = await listFiles(ctx, { view, q, clientId, projectId, siteId, kind });
  }

  const where = folder
    ? `«${folder.name}»`
    : projectName
      ? `el proyecto «${projectName}»`
      : clientName
        ? `el cliente «${clientName}»`
        : "la raíz de la biblioteca";
  const crumbs: { label: string; href: string }[] = [];
  if (explorer && (levelClient || folder)) {
    crumbs.push({ label: "Biblioteca", href: href({}) });
    if (levelClient && clientName) crumbs.push({ label: clientName, href: href({ cliente: levelClient }) });
    if (levelProject && projectName) crumbs.push({ label: projectName, href: href({ cliente: levelClient, proyecto: levelProject }) });
    for (const p of folderData?.path ?? []) crumbs.push({ label: p.name, href: href({ carpeta: p.id }) });
  }
  const parentHref = crumbs.length > 1 ? (crumbs[crumbs.length - 2]?.href ?? "/biblioteca") : "/biblioteca";
  const filtered = Boolean(q || kind || siteId || (!explorer && (clientId || projectId)));
  const empty = !folders.length && !files.length;
  const uploadZone = (className: string) => (
    <UploadZone
      className={className}
      query={explorer ? { folderId: folder?.id, clientId: folder ? undefined : levelClient, projectId: folder ? undefined : levelProject } : undefined}
      hint={`Se guarda en ${explorer ? where : "la raíz de la biblioteca"}. Hasta 100 MB por archivo: imágenes, PDF, documentos, ZIP, video y tipografías.`}
    />
  );
  const pct = usage.limit ? (usage.used / usage.limit) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Recursos"
        title="Biblioteca"
        description="Logos, imágenes, documentos y fuentes de cada cliente y proyecto, con versiones."
        accent={LIBRARY_ACCENT}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/biblioteca/plantillas">
                <LayoutTemplate className="size-4" /> Plantillas
              </Link>
            </Button>
            {levelClient ? (
              <Button asChild variant="ghost">
                <Link href={`/biblioteca/marca/${levelClient}`}>
                  <Palette className="size-4" /> Kit de marca
                </Link>
              </Button>
            ) : null}
            {explorer ? <NewFolderSheet parentId={folder?.id} clientId={levelClient} projectId={levelProject} where={where} /> : null}
          </>
        }
      />
      <Tabs active={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: href({ vista: v.key === "todos" ? undefined : v.key }) }))} />

      <details className="group mb-4 rounded-[var(--radius-card)] border border-border bg-surface" open={filtered || undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[14px] text-text-muted marker:hidden">
          <SlidersHorizontal className="size-4" /> Buscar y filtrar
          {filtered ? <span className="font-mono text-[11px] text-accent-2">activos</span> : null}
        </summary>
        <form action="/biblioteca" className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-6">
          {view !== "todos" ? <input type="hidden" name="vista" value={view} /> : null}
          {mode === "lista" ? <input type="hidden" name="modo" value="lista" /> : null}
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o descripción…" aria-label="Buscar archivos" className={`${ctl} lg:col-span-2`} />
          <select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente" className={sel}>
            <option value="">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select name="proyecto" defaultValue={projectId ?? ""} aria-label="Proyecto" className={sel}>
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select name="sitio" defaultValue={siteId ?? ""} aria-label="Sitio" className={sel}>
            <option value="">Todos los sitios</option>
            {sites.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={kind ?? ""} aria-label="Tipo" className={sel}>
            <option value="">Todos los tipos</option>
            {Object.entries(L.fileKind).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href={href({ vista: view === "todos" ? undefined : view })}>Limpiar</Link>
              </Button>
            ) : null}
            <Button type="submit" variant="secondary">
              Aplicar
            </Button>
          </div>
        </form>
      </details>

      {empty && !filtered ? null : uploadZone("mb-5")}

      <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2">
        {crumbs.length ? (
          <nav aria-label="Ubicación" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-text-muted">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex min-w-0 items-center gap-1">
                {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-text-faint" aria-hidden /> : null}
                {i === crumbs.length - 1 ? (
                  <span className="truncate text-text" aria-current="page">
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="flex h-10 items-center truncate hover:text-text md:h-8">
                    {c.label}
                  </Link>
                )}
              </span>
            ))}
            {folder ? <FolderMenu id={folder.id} name={folder.name} parentHref={parentHref} /> : null}
          </nav>
        ) : (
          <p className="text-[13px] text-text-muted">
            {explorer ? "Clientes, carpetas y archivos sueltos" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
          </p>
        )}
        <div className="flex items-center gap-1" role="group" aria-label="Modo de vista">
          <Button asChild variant={mode === "grilla" ? "secondary" : "ghost"} size="icon" className="size-11 md:size-9">
            <Link href={href({ ...keep, modo: undefined })} aria-label="Grilla" aria-current={mode === "grilla" ? "true" : undefined} replace>
              <LayoutGrid className="size-4" />
            </Link>
          </Button>
          <Button asChild variant={mode === "lista" ? "secondary" : "ghost"} size="icon" className="size-11 md:size-9">
            <Link href={href({ ...keep, modo: "lista" })} aria-label="Lista" aria-current={mode === "lista" ? "true" : undefined} replace>
              <List className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {!empty ? (
        <FileGrid files={files} folders={folders} mode={mode} />
      ) : (
        <EmptyState
          icon={<Library />}
          title={
            filtered
              ? "No hay archivos con estos filtros"
              : folder
                ? "Esta carpeta está vacía"
                : view === "logos"
                  ? "Todavía no hay logos"
                  : view !== "todos"
                    ? "Todavía no hay archivos de este tipo"
                    : "La biblioteca está vacía"
          }
          description={
            filtered
              ? "Probá con otra búsqueda o limpiá los filtros."
              : view === "logos"
                ? "Marcá una imagen como logo desde su ficha, o agregala al kit de marca del cliente."
                : "Subí logos, fotos, documentos y tipografías. Quedan con versiones y se pueden adjuntar a tareas, movimientos, clientes y notas."
          }
          action={
            filtered ? (
              <Button asChild>
                <Link href={href({ vista: view === "todos" ? undefined : view })}>Limpiar filtros</Link>
              </Button>
            ) : (
              uploadZone("w-[min(28rem,80vw)]")
            )
          }
        />
      )}

      <section aria-label="Espacio usado" className="mt-8 max-w-sm">
        <div className="mb-1.5 flex items-center justify-between font-mono text-[12px] text-text-muted">
          <span>Espacio usado</span>
          <span>
            {formatBytes(usage.used)} de {formatBytes(usage.limit)}
          </span>
        </div>
        <Progress value={pct} tone={pct > 90 ? "warning" : "gradient"} label="Espacio usado de la biblioteca" />
      </section>
    </div>
  );
}
