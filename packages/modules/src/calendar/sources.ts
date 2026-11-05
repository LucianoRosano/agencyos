/** Fuentes del calendario (M12b). Seguro para el cliente: sin imports de servidor. */
export const CALENDAR_SOURCES = [
  { key: "task", label: "Tareas", color: "#60A5FA" },
  { key: "phase", label: "Etapas", color: "#7C5CFF" },
  { key: "deliverable", label: "Entregas", color: "#A78BFA" },
  { key: "assessment", label: "Evaluaciones", color: "#FBBF24" },
  { key: "receivable", label: "Cobros", color: "#34D399" },
  { key: "payable", label: "Pagos", color: "#F43F5E" },
  { key: "subscription", label: "Suscripciones", color: "#2DD4BF" },
  { key: "reminder", label: "Vencimientos", color: "#F472B6" },
  { key: "asset", label: "Activos técnicos", color: "#E879F9" },
  { key: "crm", label: "CRM", color: "#22D3EE" },
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
