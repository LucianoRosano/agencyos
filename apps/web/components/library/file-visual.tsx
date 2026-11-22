import { cn } from "@agencyos/ui";
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, FileType, FileVideo, Shapes } from "lucide-react";

export const LIBRARY_ACCENT = "#C2703D";

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

/**
 * Hoja de documento con esquina doblada y sello «PDF» (sin miniatura real: generar la primera página en el
 * servidor exigiría rasterizar con Chromium + pdf.js por cada subida; la ficha muestra la página real con pdf.js).
 */
function PdfSheet() {
  return (
    <div aria-hidden className="relative aspect-[3/4] h-[72%] max-h-44">
      <div className="absolute inset-0 flex flex-col gap-[9%] rounded-[3px] border border-border-strong bg-surface-2 px-[16%] pt-[26%] [clip-path:polygon(0_0,70%_0,100%_22%,100%_100%,0_100%)]">
        <div className="h-[3%] min-h-px w-full rounded-full bg-text-faint/50" />
        <div className="h-[3%] min-h-px w-full rounded-full bg-text-faint/50" />
        <div className="h-[3%] min-h-px w-4/5 rounded-full bg-text-faint/50" />
        <div className="h-[3%] min-h-px w-3/5 rounded-full bg-text-faint/40" />
      </div>
      <div className="absolute top-0 right-0 h-[22%] w-[30%] rounded-bl-[3px] border-b border-l border-border-strong bg-surface [clip-path:polygon(0_0,100%_100%,0_100%)]" />
      <span className="absolute bottom-[12%] -left-[10%] rounded-[3px] bg-[#A8321F] px-1.5 py-px font-mono text-[10px] leading-4 font-semibold tracking-[0.08em] text-white">
        PDF
      </span>
    </div>
  );
}

/** Miniatura (WebP firmada) o ícono por tipo. `alt` vacío: el nombre ya está al lado. */
export function FileThumb({ thumbUrl, kind, name, className }: { thumbUrl: string | null; kind: string; name: string; className?: string }) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden bg-bg-elevated text-text-muted", className)}>
      {thumbUrl ? (
        // biome-ignore lint/performance/noImgElement: miniatura privada con URL firmada (no pasa por next/image)
        <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
      ) : kind === "pdf" ? (
        <PdfSheet />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <KindIcon kind={kind} name={name} className="size-7" />
          <span className="font-mono text-[11px] tracking-[0.04em] text-text-faint">{extLabel(name)}</span>
        </div>
      )}
    </div>
  );
}
