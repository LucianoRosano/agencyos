/** Constantes de UI del módulo Sitios (seguras para el cliente). */
export const SITES_ACCENT = "#F472B6";

type Tone = "neutral" | "accent" | "info" | "success" | "warning" | "danger";

export const SLOT_STATUS_ORDER = ["pending", "draft", "review", "approved", "published"] as const;
export const SLOT_TONE: Record<string, Tone> = { pending: "neutral", draft: "info", review: "warning", approved: "success", published: "accent" };
/** Color del estado de contenido (siempre acompañado de texto o ícono). */
export const SLOT_COLOR: Record<string, string> = {
  pending: "var(--text-faint)",
  draft: "#60A5FA",
  review: "var(--warning)",
  approved: "var(--success)",
  published: "var(--accent)",
};

export const PUB_ORDER = ["building", "staging", "ready", "live", "maintenance"] as const;
export const PUB_TONE: Record<string, Tone> = { building: "neutral", staging: "info", ready: "warning", live: "success", maintenance: "accent" };

export const MOSCOW_TONE: Record<string, Tone> = { must: "danger", should: "warning", could: "info", wont: "neutral" };
export const REVISION_TONE: Record<string, Tone> = { open: "warning", in_progress: "info", resolved: "success", postponed: "neutral" };

export const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

export const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

export type Opt = { value: string; label: string };
