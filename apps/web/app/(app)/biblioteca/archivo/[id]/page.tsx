import { ENTITY_COLORS, formatDateTime, L, label } from "@agencyos/core";
import { folderOptions, getFile, siteOptions } from "@agencyos/modules/library/queries";
import { getStorage } from "@agencyos/modules/shared/storage";
import { Badge, Button, Card, EntityChip, PageHeader, SectionLabel } from "@agencyos/ui";
import { ChevronLeft, Download, ExternalLink, History, Info, Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileThumb, formatBytes, LIBRARY_ACCENT } from "@/components/library/file-visual";
import { EditFileSheet, FileMenu, NewVersionSheet, RestoreVersionButton } from "@/components/library/library-ui";
import { clientOpts, projectOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RASTER = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Archivo" };
  const ctx = await requireCtx();
  const d = await getFile(ctx, id);
  return { title: d?.f.name ?? "Archivo" };
}

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireCtx();
  const d = await getFile(ctx, id);
  if (!d) notFound();
  const { f } = d;
  const [clients, projects, sites, folders] = await Promise.all([clientOpts(ctx), projectOpts(ctx), siteOptions(ctx), folderOptions(ctx)]);
  let text: string | null = null;
  if (f.mime.startsWith("text/")) {
    try {
      const buf = await getStorage().get(f.storageKey);
      text = buf.subarray(0, 20_000).toString("utf8");
      if (buf.length > 20_000) text += "\n…";
    } catch {
      text = null;
    }
  }
  const isImage = f.kind === "image" || f.kind === "logo";
  const props: [string, React.ReactNode][] = [
    ["Tipo", `${label(L.fileKind, f.kind)} · ${f.mime.split(";")[0]}`],
    [
      "Tamaño",
      <span key="size" className="font-mono">
        {formatBytes(f.size)}
      </span>,
    ],
    ...(f.width && f.height
      ? ([["Dimensiones", <span key="dims" className="font-mono">{`${f.width} × ${f.height} px`}</span>]] as [string, React.ReactNode][])
      : []),
    [
      "Versión",
      <span key="ver" className="font-mono">
        v{f.currentVersion}
      </span>,
    ],
    ["Origen", f.origin === "upload" ? "Subido" : f.origin === "generated" ? "Generado" : "Importado"],
    [
      "Cliente",
      f.clientId && d.clientName ? (
        <Link key="client" href={`/crm/clientes/${f.clientId}`} className="hover:underline">
          <EntityChip color={ENTITY_COLORS.client ?? "#22D3EE"}>{d.clientName}</EntityChip>
        </Link>
      ) : (
        <span key="client-none" className="text-text-faint">
          —
        </span>
      ),
    ],
    [
      "Proyecto",
      f.projectId && d.projectName ? (
        <Link key="project" href={`/proyectos/${f.projectId}`} className="hover:underline">
          <EntityChip color={ENTITY_COLORS.project ?? "#7C5CFF"}>{d.projectName}</EntityChip>
        </Link>
      ) : (
        <span key="project-none" className="text-text-faint">
          —
        </span>
      ),
    ],
    ["Sitio", d.siteName ?? <span className="text-text-faint">—</span>],
    [
      "Carpeta",
      f.folderId && d.folderName ? (
        <Link key="folder" href={`/biblioteca?carpeta=${f.folderId}`} className="hover:underline">
          {d.folderName}
        </Link>
      ) : (
        <span key="folder-none" className="text-text-faint">
          —
        </span>
      ),
    ],
    [
      "Etiquetas",
      d.tags.length ? (
        <span key="tags" className="flex flex-wrap gap-1">
          {d.tags.map((t) => (
            <span key={t} className="rounded-md border border-border bg-bg-elevated px-1.5 font-mono text-[12px] text-text-muted">
              #{t}
            </span>
          ))}
        </span>
      ) : (
        <span key="tags-none" className="text-text-faint">
          —
        </span>
      ),
    ],
    ["Subido", formatDateTime(f.createdAt)],
    [
      "SHA-256",
      <span key="sha" className="block truncate font-mono text-[12px] text-text-muted" title={f.sha256}>
        {f.sha256.slice(0, 16)}…
      </span>,
    ],
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/biblioteca"
        className="-ml-1 mb-6 flex h-10 w-fit items-center gap-1 rounded-md px-1 font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted hover:text-text md:mb-9 md:h-8"
      >
        <ChevronLeft className="size-4" /> Biblioteca
      </Link>
      <PageHeader
        eyebrow={label(L.fileKind, f.kind)}
        title={<span className="break-all">{f.name}</span>}
        description={f.description ?? undefined}
        accent={LIBRARY_ACCENT}
        actions={
          <>
            <Button asChild variant="primary">
              <a href={`/api/files/${f.id}/link?dl=1`}>
                <Download className="size-4" /> Descargar
              </a>
            </Button>
            <NewVersionSheet id={f.id} name={f.name} />
            <EditFileSheet
              id={f.id}
              isImage={isImage}
              clients={clients}
              projects={projects}
              sites={sites}
              folders={folders}
              defaults={{
                name: f.name,
                kind: f.kind,
                description: f.description,
                folderId: f.folderId,
                clientId: f.clientId,
                projectId: f.projectId,
                siteId: f.siteId,
                tags: d.tags.join(", "),
              }}
            />
            <FileMenu id={f.id} name={f.name} />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="overflow-hidden">
            {RASTER.has(f.mime) ? (
              <div className="grid min-h-64 place-items-center bg-bg-elevated p-4">
                {/* biome-ignore lint/performance/noImgElement: archivo privado con URL firmada */}
                <img src={d.previewUrl} alt={f.description ?? f.name} className="max-h-[60vh] max-w-full object-contain" />
              </div>
            ) : text !== null ? (
              <pre className="max-h-[60vh] overflow-auto bg-bg-elevated p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-text">
                {text}
              </pre>
            ) : (
              <div className="flex flex-col items-center gap-4 bg-bg-elevated p-6">
                <FileThumb thumbUrl={d.thumbUrl} kind={f.kind} name={f.name} className="h-56 w-full max-w-md rounded-lg" />
                {f.mime === "application/pdf" ? (
                  <Button asChild variant="secondary">
                    <a href={`/api/files/${f.id}/link`} target="_blank" rel="noopener">
                      <ExternalLink className="size-4" /> Abrir el PDF
                    </a>
                  </Button>
                ) : f.mime === "image/svg+xml" ? (
                  <p className="max-w-md text-center text-[13px] text-text-muted">
                    Vista previa rasterizada del SVG sanitizado. Por seguridad, el SVG se descarga (no se abre en el navegador).
                  </p>
                ) : (
                  <p className="text-[13px] text-text-muted">Sin vista previa para este tipo de archivo.</p>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionLabel icon={<History />} className="mb-3">
              Versiones <span className="ml-1 text-text-faint">· {d.versions.length}</span>
            </SectionLabel>
            <ul className="flex flex-col divide-y divide-border">
              {d.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0" data-version={v.version}>
                  <span className="font-mono text-[13px] text-text">v{v.version}</span>
                  {v.version === f.currentVersion ? <Badge tone="success">Actual</Badge> : null}
                  <span className="min-w-0 flex-1 text-[13px] text-text-muted">
                    {formatDateTime(v.createdAt)}
                    {v.uploadedByName ? ` · ${v.uploadedByName}` : ""} · <span className="font-mono">{formatBytes(v.size)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm" className="h-11 md:h-8">
                      <a href={`/api/files/${f.id}/link?v=${v.version}&dl=1`} aria-label={`Descargar versión ${v.version}`}>
                        <Download className="size-4" /> Descargar
                      </a>
                    </Button>
                    {v.version !== f.currentVersion && v.sha256 !== f.sha256 ? <RestoreVersionButton id={f.id} version={v.version} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="flex flex-col gap-5" aria-label="Detalles del archivo">
          <Card className="p-5">
            <SectionLabel icon={<Info />} className="mb-3">
              Propiedades
            </SectionLabel>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13px]">
              {props.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-text-muted">{k}</dt>
                  <dd className="min-w-0 text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <SectionLabel icon={<Link2 />} className="mb-3">
              Adjuntado en <span className="ml-1 text-text-faint">{d.attachments.length ? `· ${d.attachments.length}` : ""}</span>
            </SectionLabel>
            {d.attachments.length ? (
              <ul className="flex flex-col gap-1.5">
                {d.attachments.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href} className="flex min-h-10 items-center gap-2 text-[14px] text-text hover:underline">
                      <EntityChip color={ENTITY_COLORS[a.entityType] ?? "#8A93A6"}>{label(L.entityType, a.entityType)}</EntityChip>
                      <span className="min-w-0 truncate">{a.title || "Sin título"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-faint">No está adjuntado en ningún lado. Adjuntalo desde una tarea, un movimiento, un cliente o una nota.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
