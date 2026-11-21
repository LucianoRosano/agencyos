/** Fuentes del calendario (M12b). Seguro para el cliente: sin imports de servidor. */
export const CALENDAR_SOURCES = [
  { key: "task", label: "Tareas", color: "#8C6A4F" },
  { key: "phase", label: "Etapas", color: "#A9471F" },
  { key: "deliverable", label: "Entregas", color: "#9C6B5A" },
  { key: "assessment", label: "Evaluaciones", color: "#B7791F" },
  { key: "receivable", label: "Cobros", color: "#4F7A52" },
  { key: "payable", label: "Pagos", color: "#A8321F" },
  { key: "subscription", label: "Suscripciones", color: "#2DD4BF" },
  { key: "reminder", label: "Vencimientos", color: "#B4637A" },
  { key: "asset", label: "Activos técnicos", color: "#E879F9" },
  { key: "crm", label: "CRM", color: "#7A4E7E" },
] as const;

export type CalendarSource = (typeof CALENDAR_SOURCES)[number]["key"];
export const SOURCE_KEYS = CALENDAR_SOURCES.map((s) => s.key) as CalendarSource[];
export const isCalendarSource = (s: string): s is CalendarSource => (SOURCE_KEYS as string[]).includes(s);
export const sourceMeta = (s: CalendarSource) => CALENDAR_SOURCES.find((x) => x.key === s) ?? CALENDAR_SOURCES[0];

export type CalendarItem = {
  /** Estable: tipo + id (sirve de UID en iCal). */
  key: string;
  source: CalendarSource;
  date: string;
  time: string | null;
  title: string;
  subtitle: string | null;
  href: string;
  color: string;
};
