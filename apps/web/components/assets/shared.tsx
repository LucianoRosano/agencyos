import { diffDays, formatDate } from "@agencyos/core";
import { Badge, cn } from "@agencyos/ui";

/** Piezas de presentación de Activos técnicos sin estado (server y client components). */

export const ASSETS_ACCENT = "#F472B6";

export type Opt = { value: string; label: string };

export const CERT_KIND: Record<string, string> = { ssl: "SSL", arca: "ARCA", other: "Otro" };
export const PRODUCT_KIND: Record<string, string> = { wp_plugin: "Plugin de WordPress", php_panel: "Panel PHP", tool: "Herramienta", app: "Aplicación" };
export const INSTALLATION_STATUS: Record<string, string> = { active: "Activa", paused: "En pausa", removed: "Desinstalada" };
export const ENV_KIND: Record<string, string> = { prod: "Producción", staging: "Staging" };

export const opts = (m: Record<string, string>) => Object.entries(m).map(([value, l]) => ({ value, label: l }));

/** Texto y tono de un vencimiento. El color siempre va con texto (no solo color). */
export function dueInfo(expiresOn: string | null, today: string, notifyDaysBefore = 30) {
  if (!expiresOn) return { text: "sin vencimiento cargado", tone: "text-text-faint", level: "none" as const };
  const d = diffDays(expiresOn, today);
  if (d < 0) return { text: `venció hace ${-d} d`, tone: "text-danger", level: "overdue" as const };
  if (d === 0) return { text: "vence hoy", tone: "text-danger", level: "soon" as const };
  if (d <= Math.min(7, notifyDaysBefore)) return { text: `vence en ${d} d`, tone: "text-danger", level: "soon" as const };
  if (d <= notifyDaysBefore) return { text: `vence en ${d} d`, tone: "text-warning", level: "warn" as const };
  return { text: `vence el ${formatDate(expiresOn)}`, tone: "text-text-muted", level: "ok" as const };
}

export function DueText({ expiresOn, today, notify, className }: { expiresOn: string | null; today: string; notify?: number; className?: string }) {
  const i = dueInfo(expiresOn, today, notify);
  return (
    <span className={cn("text-[13px]", i.tone, className)}>
      {i.text}
      {expiresOn && i.level !== "ok" ? <span className="ml-1 font-mono text-[11px] text-text-faint">{formatDate(expiresOn)}</span> : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  if (status === "up") return <Badge tone="success">● Responde</Badge>;
  if (status === "down") return <Badge tone="danger">▲ Caído</Badge>;
  return <Badge>○ Sin datos</Badge>;
}

/** Línea "Propiedad: valor" de una tarjeta. */
export function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-text">{children}</dd>
    </div>
  );
}
