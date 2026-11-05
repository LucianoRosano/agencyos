"use client";

import { cn, Progress } from "@agencyos/ui";
import { CheckCircle2, CircleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

/** Mismo listado que el servidor (packages/modules/src/library/magic.ts); el servidor valida igual. */
export const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.zip,.docx,.xlsx,.pptx,.txt,.md,.csv,.mp4,.webm,.woff,.woff2,.ttf,.otf";
const MAX = 100 * 1024 * 1024;

type Item = { key: string; name: string; progress: number; status: "pending" | "uploading" | "done" | "error"; message?: string };
export type Uploaded = { id: string; name: string; kind: string; duplicate?: boolean; version?: number };

/** Sube un archivo con XHR (para tener progreso real) al route handler autenticado. */
function send(url: string, file: File, onProgress: (p: number) => void): Promise<{ ok: true; data: Uploaded } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText);
        if (r.ok) resolve({ ok: true, data: r.data });
        else resolve({ ok: false, message: r.error?.message ?? "No se pudo subir" });
      } catch {
        resolve({ ok: false, message: xhr.status === 413 ? "El archivo es demasiado grande." : "No se pudo subir (¿se cerró la sesión?)." });
      }
    };
    xhr.onerror = () => resolve({ ok: false, message: "Error de conexión al subir." });
    xhr.send(file);
  });
}

/**
 * Zona de subida: arrastrar y soltar o elegir, varios archivos (en serie), con progreso por archivo.
 * `endpoint` es /api/files (nuevo) o /api/files/<id>/versions (nueva versión, un solo archivo).
 */
export function UploadZone({
  endpoint = "/api/files",
  query,
  multiple = true,
  compact,
  label,
  hint,
  onUploaded,
  className,
}: {
  endpoint?: string;
  query?: Record<string, string | null | undefined>;
  multiple?: boolean;
  compact?: boolean;
  label?: string;
  hint?: string;
  onUploaded?: (files: Uploaded[]) => void;
  className?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const id = useId();
  const qs = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  const url = qs ? `${endpoint}?${qs}` : endpoint;

  async function upload(list: FileList | File[]) {
    const files = Array.from(list).slice(0, multiple ? 50 : 1);
    if (!files.length || busy) return;
    setBusy(true);
    const batch: Item[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, progress: 0, status: "pending" }));
    setItems((prev) => [...batch, ...prev].slice(0, 20));
    const patch = (key: string, p: Partial<Item>) => setItems((prev) => prev.map((x) => (x.key === key ? { ...x, ...p } : x)));
    const done: Uploaded[] = [];
    for (const [i, f] of files.entries()) {
      const key = batch[i]?.key ?? "";
      if (f.size > MAX) {
        patch(key, { status: "error", message: "Supera los 100 MB." });
        continue;
      }
      patch(key, { status: "uploading" });
      const r = await send(url, f, (p) => patch(key, { progress: p }));
      if (r.ok) {
        done.push(r.data);
        patch(key, { status: "done", progress: 100, message: r.data.duplicate ? "Ya estaba en la biblioteca: se usó el existente." : undefined });
      } else {
        patch(key, { status: "error", message: r.message });
        toast.error(`${f.name}: ${r.message}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (done.length) {
      toast.success(done.length === 1 ? (endpoint.endsWith("/versions") ? "Nueva versión subida" : "Archivo subido") : `${done.length} archivos subidos`);
      onUploaded?.(done);
      router.refresh();
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-bg-elevated text-text-muted transition-colors hover:border-[#FB923C]/60 hover:text-text",
          "focus-within:ring-2 focus-within:ring-accent/40",
          compact ? "min-h-11 px-3 py-2 text-[13px]" : "min-h-24 flex-col justify-center px-4 py-5 text-center text-[14px]",
          over && "border-[#FB923C] bg-[#FB923C]/5 text-text",
        )}
      >
        <Upload className={cn("shrink-0 text-[#FB923C]", compact ? "size-4" : "size-5")} aria-hidden />
        <span>
          <span className="font-medium text-text">{label ?? (multiple ? "Subir archivos" : "Subir archivo")}</span>
          <span className="text-text-muted"> · arrastrá o tocá para elegir</span>
          {hint && !compact ? <span className="mt-1 block text-[12px] text-text-faint">{hint}</span> : null}
        </span>
        <input
          ref={input}
          id={id}
          type="file"
          accept={ACCEPT}
          multiple={multiple}
          disabled={busy}
          className="sr-only"
          aria-label={label ?? "Subir archivos"}
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
      </label>
      {items.length ? (
        <ul className="flex flex-col gap-1.5" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="rounded-md border border-border bg-surface px-3 py-2 text-[13px]">
              <div className="flex items-center gap-2">
                {it.status === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Subido" />
                ) : it.status === "error" ? (
                  <CircleAlert className="size-4 shrink-0 text-danger" aria-label="Error" />
                ) : (
                  <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-[#FB923C] border-t-transparent" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-text">{it.name}</span>
                {it.status === "uploading" ? <span className="font-mono text-[12px] text-text-muted">{Math.round(it.progress)}%</span> : null}
              </div>
              {it.status === "uploading" ? <Progress value={it.progress} className="mt-2" label={`Subiendo ${it.name}`} /> : null}
              {it.message ? <p className={cn("mt-1 text-[12px]", it.status === "error" ? "text-danger" : "text-text-muted")}>{it.message}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
