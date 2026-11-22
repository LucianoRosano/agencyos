"use client";

import { Badge, Button } from "@agencyos/ui";
import { Download, FileUp, Upload } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { applyProductImportAction, previewProductImportAction } from "@/app/comercio/actions";
import { toast } from "@/lib/toast";

type Row = { line: number; status: "ok" | "update" | "same" | "error"; summary: string; message?: string };
type Preview = { rows: Row[]; create: number; update: number; same: number; errors: number };

const TONE = { ok: "success", update: "warning", same: "neutral", error: "danger" } as const;
const LABEL = { ok: "Nuevo", update: "Cambia el precio", same: "Sin cambios", error: "Error" } as const;

/** Importar productos (o una lista de precios nueva) desde un CSV: vista previa → importar. */
export function ProductImport({ template }: { template: string }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const fileId = useId();

  async function onFile(f: File | undefined) {
    setPreview(null);
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return void toast.error("El archivo supera 2 MB. Partilo en varios.");
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    // Excel en Windows suele guardar el CSV en Latin-1: si no es UTF-8 válido, se lee como windows-1252.
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder("windows-1252").decode(buf);
    }
    setCsv(text);
    start(async () => {
      const r = await previewProductImportAction(text);
      if (r.ok) setPreview(r.data as Preview);
      else toast.error(r.error.message);
    });
  }
  function apply() {
    start(async () => {
      const r = await applyProductImportAction(csv);
      if (!r.ok) return void toast.error(r.error.message);
      const d = r.data as Preview;
      toast.success(`Listo: ${d.create} productos nuevos y ${d.update} precios actualizados`);
      setPreview(d);
      setCsv("");
      setFileName("");
    });
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([`﻿${template}\n`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "productos-plantilla.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const changes = preview ? preview.create + preview.update : 0;

  return (
    <div className="flex flex-col gap-4" data-testid="product-import">
      <p className="text-[14px] text-text-muted">
        Columnas (en cualquier orden, con o sin tildes): <code className="font-mono text-[13px] break-words text-text">{template.replaceAll(";", "; ")}</code>.
        Solo <strong className="text-text">Nombre</strong> y <strong className="text-text">Precio</strong> son obligatorias. Si un producto ya existe (mismo
        código, código de barras o nombre) se actualizan su precio y su costo; el stock no se toca.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={fileId}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[14px] text-text hover:bg-surface-2"
        >
          <FileUp className="size-4 shrink-0" aria-hidden /> <span className="max-w-[60vw] truncate">{fileName || "Elegir archivo CSV"}</span>
        </label>
        <input id={fileId} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="ghost" className="h-11" onClick={downloadTemplate}>
          <Download className="size-4" aria-hidden /> Plantilla
        </Button>
        {preview && changes > 0 && csv ? (
          <Button variant="primary" className="h-11" disabled={pending} loading={pending} onClick={apply}>
            <Upload className="size-4" aria-hidden /> Importar {changes}
          </Button>
        ) : null}
      </div>
      {preview ? (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] text-text-muted" aria-live="polite">
            <strong className="text-text">{preview.create}</strong> nuevos · <strong className="text-text">{preview.update}</strong> con precio nuevo ·{" "}
            {preview.same} sin cambios · {preview.errors} con errores
          </p>
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-[10px] border border-border" aria-label="Vista previa de la importación">
            {preview.rows.map((r) => (
              <li key={r.line} className="flex items-start gap-3 px-3 py-2 text-[14px]">
                <span className="w-10 shrink-0 pt-0.5 font-mono text-[12px] text-text-faint">L{r.line}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{r.summary}</span>
                  {r.message ? <span className="block text-[13px] text-text-muted">{r.message}</span> : null}
                </span>
                <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
