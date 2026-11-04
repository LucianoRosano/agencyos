import { cn } from "@agencyos/ui";

/** Muestra HTML ya sanitizado por lib/markdown (nunca HTML del usuario sin sanitizar). */
export function MarkdownView({ html, className, empty }: { html: string; className?: string; empty?: string }) {
  if (!html) return empty ? <p className="text-[14px] text-text-faint">{empty}</p> : null;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitizado con sanitize-html (lista blanca)
  return <div className={cn("prose-ag text-text", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
