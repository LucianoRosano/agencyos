import { addMoney, diffDays, formatDayMonth, L, percentOf, todayAR } from "@agencyos/core";

/** Acento del módulo CRM (docs/07 §2). */
export const CRM_ACCENT = "#22D3EE";

export const VAT_LABELS: Record<string, string> = {
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo",
  exento: "Exento",
  consumidor_final: "Consumidor final",
  no_responsable: "No responsable",
};

export const STAGE_ORDER = ["new", "contacted", "meeting", "proposal_sent", "negotiation", "won", "lost"] as const;
export type StageKey = (typeof STAGE_ORDER)[number];
export const OPEN_STAGES: readonly string[] = STAGE_ORDER.slice(0, 5);

/** Color del punto de etapa (siempre acompañado del texto). */
export const STAGE_COLOR: Record<string, string> = {
  new: "#8A93A6",
  contacted: "#60A5FA",
  meeting: "#22D3EE",
  proposal_sent: "#A78BFA",
  negotiation: "#FBBF24",
  won: "#34D399",
  lost: "#F43F5E",
};

export const CLIENT_STATUS_TONE: Record<string, "neutral" | "accent" | "info" | "success" | "warning" | "danger"> = {
  prospect: "info",
  active: "success",
  paused: "warning",
  finished: "neutral",
  archived: "neutral",
};

/** Etapa del pipeline tal como la ve la UI (crm_stage del workspace o, sin configurar, las fijas de L.stage). */
export type StageDef = { key: string; name: string; kind: "open" | "won" | "lost"; base: string; probability?: number };

export const DEFAULT_STAGES: StageDef[] = STAGE_ORDER.map((k) => ({
  key: k,
  name: L.stage[k],
  kind: k === "won" ? "won" : k === "lost" ? "lost" : "open",
  base: k,
}));

/** Color de una etapa: el de su clave de sistema o, si es propia, el de su etapa base. */
export const stageColor = (key: string, stages: StageDef[] = DEFAULT_STAGES) =>
  STAGE_COLOR[key] ?? STAGE_COLOR[stages.find((s) => s.key === key)?.base ?? ""] ?? "#8A93A6";
export const stageName = (key: string, stages: StageDef[] = DEFAULT_STAGES) => stages.find((s) => s.key === key)?.name ?? L.stage[key as StageKey] ?? key;
export const isOpenKey = (key: string, stages: StageDef[] = DEFAULT_STAGES) => stages.find((s) => s.key === key)?.kind === "open";

export const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
export const stageOpts = () => STAGE_ORDER.map((s) => ({ value: s, label: L.stage[s] }));

/** Enlace de WhatsApp: solo dígitos; un número local argentino de 10 dígitos se completa con 549. */
export function waHref(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `549${d}`;
  return `https://wa.me/${d}`;
}
export const telHref = (phone: string | null | undefined) => (phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null);

/** Suma ponderada (valor × probabilidad) por moneda, sin convertir. */
export function weightedByCurrency(items: { valueAmount: string | null; valueCurrency: string; probability: number }[], weighted = true) {
  const acc: Record<string, string> = {};
  for (const o of items) {
    if (!o.valueAmount) continue;
    const v = weighted ? percentOf(o.valueAmount, o.probability) : o.valueAmount;
    acc[o.valueCurrency] = addMoney(acc[o.valueCurrency] ?? "0", v);
  }
  return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b));
}

export function dueTone(due: string | null, today = todayAR()) {
  if (!due) return null;
  const d = diffDays(due, today);
  if (d === 0) return { text: "hoy", cls: "text-accent-2" };
  if (d === 1) return { text: "mañana", cls: "text-text-muted" };
  if (d < 0) return { text: d === -1 ? "ayer" : `hace ${-d} d`, cls: "text-danger" };
  if (d < 7) return { text: `en ${d} d`, cls: "text-text-muted" };
  return { text: formatDayMonth(due), cls: "text-text-muted" };
}
