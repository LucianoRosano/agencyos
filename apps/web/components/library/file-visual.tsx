import { cn } from "@agencyos/ui";
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, FileType, FileVideo, Shapes } from "lucide-react";

export const LIBRARY_ACCENT = "#FB923C";

/** Tamaño legible en es-AR: "1,2 MB". */
export function formatBytes(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toLocaleString("es-AR", { maximumFractionDigits: x < 10 ? 1 : 0 })} ${units[i]}`;
}

export const extLabel = (name: string) => (name.includes(".") ? (name.split(".").pop() ?? "").toUpperCase() : "");

export function KindIcon({ kind, name, className }: { kind: string; name?: string; className?: string }) {
  const ext = name ? extLabel(name) : "";
  const cls = cn("size-5", className);
  if (kind === "image") return <FileImage className={cls} aria-hidden />;
  if (kind === "logo") return <Shapes className={cls} aria-hidden />;
  if (kind === "pdf") return <FileText className={cls} aria-hidden />;
  if (kind === "video") return <FileVideo className={cls} aria-hidden />;
  if (kind === "archive") return <FileArchive className={cls} aria-hidden />;
  if (kind === "font") return <FileType className={cls} aria-hidden />;
  if (kind === "document" && ["XLSX", "CSV"].includes(ext)) return <FileSpreadsheet className={cls} aria-hidden />;
  if (kind === "document") return <FileText className={cls} aria-hidden />;
  return <File className={cls} aria-hidden />;
}

/** Miniatura (WebP firmada) o ícono por tipo. `alt` vacío: el nombre ya está al lado. */
export function FileThumb({ thumbUrl, kind, name, className }: { thumbUrl: string | null; kind: string; name: string; className?: string }) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden bg-bg-elevated text-text-muted", className)}>
      {thumbUrl ? (
        // biome-ignore lint/performance/noImgElement: miniatura privada con URL firmada (no pasa por next/image)
        <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <KindIcon kind={kind} name={name} className="size-7" />
          <span className="font-mono text-[11px] tracking-[0.12em] text-text-faint">{extLabel(name)}</span>
        </div>
      )}
    </div>
  );
}
