import {
  Brain,
  BriefcaseBusiness,
  Calendar,
  CalendarCheck,
  ChartNoAxesCombined,
  CircleCheck,
  FileSignature,
  FileText,
  FolderKanban,
  GitBranch,
  GraduationCap,
  Inbox,
  LayoutTemplate,
  Library,
  Radar,
  Server,
  Sparkles,
  Sun,
  Wallet,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";

export type NavGroup = "agencia" | "conocimiento" | "sistema";
export type NavItem = { key: string; href: string; label: string; icon: ReactNode; module?: string; match?: string; countKey?: string; group?: NavGroup };
export const NAV_GROUP_LABEL: Record<NavGroup, string> = { agencia: "Agencia", conocimiento: "Conocimiento", sistema: "Sistema" };

export const NAV: NavItem[] = [
  { key: "hoy", href: "/hoy", label: "Hoy", icon: <Sun /> },
  { key: "bandeja", href: "/bandeja", label: "Bandeja", icon: <Inbox />, module: "inbox", countKey: "inbox" },
  { key: "negocio", href: "/negocio", label: "Negocio", icon: <ChartNoAxesCombined />, group: "agencia" },
  {
    key: "clientes",
    href: "/crm/clientes",
    label: "Clientes",
    icon: <BriefcaseBusiness />,
    module: "crm",
    match: "/crm",
    countKey: "clients",
    group: "agencia",
  },
  { key: "proyectos", href: "/proyectos", label: "Proyectos", icon: <FolderKanban />, module: "projects", countKey: "projects", group: "agencia" },
  { key: "tareas", href: "/tareas", label: "Tareas", icon: <CircleCheck />, module: "projects", group: "agencia" },
  { key: "presupuestos", href: "/presupuestos", label: "Presupuestos", icon: <FileSignature />, module: "quotes", group: "agencia" },
  { key: "finanzas", href: "/finanzas", label: "Finanzas", icon: <Wallet />, module: "finance", group: "agencia" },
  { key: "sitios", href: "/sitios", label: "Sitios", icon: <LayoutTemplate />, module: "sites", group: "agencia" },
  { key: "activos", href: "/activos", label: "Activos técnicos", icon: <Server />, module: "assets", group: "agencia" },
  { key: "seo", href: "/seo", label: "SEO", icon: <Radar />, module: "seo", group: "agencia" },
  { key: "repositorios", href: "/repositorios", label: "Repositorios", icon: <GitBranch />, module: "repos", group: "agencia" },
  { key: "biblioteca", href: "/biblioteca", label: "Biblioteca", icon: <Library />, module: "library", group: "agencia" },
  { key: "notas", href: "/notas", label: "Notas", icon: <FileText />, module: "notes", group: "conocimiento" },
  { key: "cerebro", href: "/cerebro", label: "Cerebro", icon: <Brain />, module: "brain", group: "conocimiento" },
  { key: "calendario", href: "/calendario", label: "Calendario", icon: <Calendar />, module: "calendar", group: "conocimiento" },
  { key: "facultad", href: "/facultad", label: "Facultad", icon: <GraduationCap />, module: "study", group: "conocimiento" },
  { key: "revision", href: "/revision-semanal", label: "Revisión semanal", icon: <CalendarCheck />, module: "review", group: "sistema" },
  { key: "automatizaciones", href: "/automatizaciones", label: "Automatizaciones", icon: <Workflow />, module: "automations", group: "sistema" },
  { key: "ia", href: "/ia", label: "IA", icon: <Sparkles />, module: "ai", group: "sistema" },
];

export function navFor(enabled: string[]) {
  return NAV.filter((n) => !n.module || enabled.includes(n.module));
}

/** Títulos de migas por prefijo de ruta. */
export const ROUTE_TITLES: [string, string][] = [
  ["/hoy", "Hoy"],
  ["/negocio", "Negocio"],
  ["/bandeja", "Bandeja"],
  ["/proyectos/plantillas", "Plantillas"],
  ["/proyectos", "Proyectos"],
  ["/tareas", "Tareas"],
  ["/crm/contactos", "Contactos"],
  ["/crm/oportunidades", "Oportunidades"],
  ["/crm", "Clientes"],
  ["/presupuestos/servicios", "Servicios"],
  ["/presupuestos", "Presupuestos"],
  ["/finanzas", "Finanzas"],
  ["/notas", "Notas"],
  ["/cerebro", "Cerebro"],
  ["/calendario", "Calendario"],
  ["/facultad", "Facultad"],
  ["/foco", "Modo foco"],
  ["/papelera", "Papelera"],
  ["/configuracion", "Configuración"],
  ["/sitios", "Sitios"],
  ["/activos", "Activos técnicos"],
  ["/seo", "SEO"],
  ["/repositorios", "Repositorios"],
  ["/biblioteca", "Biblioteca"],
  ["/automatizaciones", "Automatizaciones"],
  ["/ia", "IA"],
  ["/revision-semanal", "Revisión semanal"],
  ["/aprobaciones", "Aprobaciones"],
  ["/espacios", "Espacios"],
  ["/actividad", "Actividad"],
  ["/notificaciones", "Notificaciones"],
];
