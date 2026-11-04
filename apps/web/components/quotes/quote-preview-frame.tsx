import { cn } from "@agencyos/ui";

/**
 * Vista previa del PDF: el mismo HTML en un iframe aislado (sin scripts).
 * `allow-same-origin` solo para cargar la fuente Geist desde /presupuestos/fuente.
 */
export function QuotePreviewFrame({ html, className, title = "Vista previa del presupuesto" }: { html: string; className?: string; title?: string }) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      className={cn("block w-full rounded-[var(--radius-card)] border border-border bg-[#e7e7ec]", className)}
    />
  );
}
