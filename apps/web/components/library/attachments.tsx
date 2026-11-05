"use client";

import { Button, EmptyState, Input, Sheet } from "@agencyos/ui";
import { Download, Library, Paperclip, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { attachFileAction, detachFileAction, listAttachmentsAction, pickerFilesAction } from "@/app/(app)/biblioteca/actions";
import { FileThumb, formatBytes } from "./file-visual";
import { UploadZone } from "./uploader";

export type AttachmentView = {
  attachmentId: string;
  fileId: string;
  name: string;
  mime: string;
  kind: string;
  size: number;
  version: number;
  thumbUrl: string | null;
  downloadUrl: string;
};
type PickerFile = { id: string; name: string; kind: string; size: number; clientName: string | null; thumbUrl: string | null };

/**
 * Adjuntos de cualquier entidad (tarea, movimiento, cliente, nota…): lista, subir, elegir de la biblioteca y quitar.
 * Usa `file_attachment`. Si no recibe `initial`, carga la lista al montarse.
 */
export function Attachments({
  entityType,
  entityId,
  initial,
  emptyText = "Sin archivos adjuntos.",
  uploadLabel = "Adjuntar archivo",
}: {
  entityType: string;
  entityId: string;
  initial?: AttachmentView[];
  emptyText?: string;
  uploadLabel?: string;
}) {
  const [items, setItems] = useState<AttachmentView[] | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = useCallback(() => {
    start(async () => {
      const r = await listAttachmentsAction(entityType, entityId);
      if (r.ok) {
        setItems(r.data as AttachmentView[]);
        setError(null);
      } else setError(r.error.message);
    });
  }, [entityType, entityId]);

  useEffect(() => {
    if (!initial) reload();
  }, [initial, reload]);
  useEffect(() => {
    if (initial) setItems(initial);
  }, [initial]);

  function remove(a: AttachmentView) {
    start(async () => {
      const r = await detachFileAction(a.attachmentId);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setItems((prev) => prev?.filter((x) => x.attachmentId !== a.attachmentId) ?? null);
      toast.success(`Se quitó «${a.name}» (sigue en la Biblioteca)`, {
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: () =>
            void attachFileAction(a.fileId, entityType, entityId).then((u) => {
              if (u.ok) reload();
              else toast.error(u.error.message);
            }),
        },
      });
    });
  }

  return (
    <div className="@container flex flex-col gap-3" data-attachments={`${entityType}:${entityId}`}>
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : items === null ? (
        <p className="text-[13px] text-text-faint" aria-busy="true">
          Cargando adjuntos…
        </p>
      ) : items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.attachmentId} className="flex items-center gap-3 rounded-[10px] border border-border bg-bg-elevated p-2 pr-1">
              <FileThumb thumbUrl={a.thumbUrl} kind={a.kind} name={a.name} className="size-11 shrink-0 rounded-md [&_svg]:size-5 [&_span]:hidden" />
              <div className="min-w-0 flex-1">
                <Link href={`/biblioteca/archivo/${a.fileId}`} className="block truncate text-[14px] text-text hover:underline">
                  {a.name}
                </Link>
                <span className="font-mono text-[12px] text-text-muted">
                  {formatBytes(a.size)}
                  {a.version > 1 ? ` · v${a.version}` : ""}
                </span>
              </div>
              <Button asChild variant="ghost" size="icon" className="size-11 md:size-9">
                <a href={`/api/files/${a.fileId}/link?dl=1`} aria-label={`Descargar ${a.name}`}>
                  <Download className="size-4" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Quitar ${a.name}`} disabled={pending} onClick={() => remove(a)}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-text-faint">{emptyText}</p>
      )}
      <div className="flex flex-col gap-2 @md:flex-row @md:items-start">
        <UploadZone compact className="flex-1" label={uploadLabel} query={{ attachType: entityType, attachId: entityId }} onUploaded={reload} />
        <LibraryPicker
          onPick={(f) =>
            start(async () => {
              const r = await attachFileAction(f.id, entityType, entityId);
              if (r.ok) {
                toast.success(`Adjuntaste «${f.name}»`);
                reload();
              } else toast.error(r.error.message);
            })
          }
        />
      </div>
    </div>
  );
}

/** Selector "Elegir de la biblioteca" con búsqueda. */
export function LibraryPicker({
  onPick,
  kinds,
  trigger,
  title = "Elegir de la biblioteca",
}: {
  onPick: (f: PickerFile) => void;
  kinds?: string[];
  trigger?: React.ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<PickerFile[] | null>(null);
  const [, start] = useTransition();
  const kindsKey = kinds?.join(",") ?? "";

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () =>
        start(async () => {
          const r = await pickerFilesAction(q, kindsKey ? kindsKey.split(",") : undefined);
          if (r.ok) setFiles(r.data as PickerFile[]);
          else toast.error(r.error.message);
        }),
      200,
    );
    return () => clearTimeout(t);
  }, [open, q, kindsKey]);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={title}
      description="Buscá por nombre o descripción."
      trigger={
        trigger ?? (
          <Button variant="secondary" className="h-11 md:h-10">
            <Library className="size-4" /> De la biblioteca
          </Button>
        )
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar archivos…" aria-label="Buscar archivos" className="pl-9" autoFocus />
      </div>
      {files === null ? (
        <p className="py-6 text-center text-[13px] text-text-faint">Buscando…</p>
      ) : files.length ? (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(f);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-[10px] border border-border bg-bg-elevated p-2 text-left hover:border-border-strong"
              >
                <FileThumb thumbUrl={f.thumbUrl} kind={f.kind} name={f.name} className="size-11 shrink-0 rounded-md [&_span]:hidden" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-text">{f.name}</span>
                  <span className="font-mono text-[12px] text-text-muted">
                    {formatBytes(f.size)}
                    {f.clientName ? ` · ${f.clientName}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          icon={<Paperclip />}
          title={q ? "Nada coincide con la búsqueda" : "La biblioteca está vacía"}
          description={q ? "Probá con otra palabra." : "Subí archivos desde acá mismo o desde la Biblioteca."}
          action={
            <Button asChild variant="secondary">
              <Link href="/biblioteca">Ir a la Biblioteca</Link>
            </Button>
          }
        />
      )}
    </Sheet>
  );
}
