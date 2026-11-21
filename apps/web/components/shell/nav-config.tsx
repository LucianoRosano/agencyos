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
  Gauge,
  GitBranch,
  GraduationCap,
  Inbox,
  LayoutTemplate,
  Library,
  Radar,
  Server,
  Sparkles,
  Store,
  Sun,
  Wallet,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";

export type NavGroup = "agencia" | "conocimiento" | "sistema";
/** `go`: tecla del atajo «G luego …». Una sola fuente para el atajo, el tooltip de la barra lateral y la ayuda «?». */
export type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: ReactNode;
  module?: string;
  match?: string;
  countKey?: string;
  group?: NavGroup;
  go?: string;
};
export const NAV_GROUP_LABEL: Record<NavGroup, string> = { agencia: "Agencia", conocimiento: "Conocimiento", sistema: "Sistema" };

export const NAV: NavItem[] = [
  { key: "hoy", href: "/hoy", label: "Hoy", icon: <Sun />, go: "H" },
  { key: "bandeja", href: "/bandeja", label: "Bandeja", icon: <Inbox />, module: "inbox", countKey: "inbox", go: "I" },
  { key: "negocio", href: "/negocio", label: "Negocio", icon: <ChartNoAxesCombined />, group: "agencia", go: "O" },
  {
    key: "clientes",
    href: "/crm/clientes",
    label: "Clientes",
    icon: <BriefcaseBusiness />,
    module: "crm",
    match: "/crm",
    countKey: "clients",
    group: "agencia",
    go: "C",
  },
  { key: "proyectos", href: "/proyectos", label: "Proyectos", icon: <FolderKanban />, module: "projects", countKey: "projects", group: "agencia", go: "P" },
  { key: "tareas", href: "/tareas", label: "Tareas", icon: <CircleCheck />, module: "projects", group: "agencia", go: "T" },
  { key: "presupuestos", href: "/presupuestos", label: "Presupuestos", icon: <FileSignature />, module: "quotes", group: "agencia", go: "U" },
  { key: "finanzas", href: "/finanzas", label: "Finanzas", icon: <Wallet />, module: "finance", group: "agencia", go: "F" },
  { key: "sitios", href: "/sitios", label: "Sitios", icon: <LayoutTemplate />, module: "sites", group: "agencia", go: "S" },
  { key: "activos", href: "/activos", label: "Activos técnicos", icon: <Server />, module: "assets", group: "agencia", go: "A" },
  { key: "seo", href: "/seo", label: "SEO", icon: <Radar />, module: "seo", group: "agencia", go: "E" },
  { key: "repositorios", href: "/repositorios", label: "Repositorios", icon: <GitBranch />, module: "repos", group: "agencia", go: "R" },
  { key: "comercios", href: "/comercios", label: "Comercios (SaaS)", icon: <Store />, group: "agencia", go: "Q" },
  { key: "biblioteca", href: "/biblioteca", label: "Biblioteca", icon: <Library />, module: "library", group: "agencia", go: "L" },
  { key: "notas", href: "/notas", label: "Notas", icon: <FileText />, module: "notes", group: "conocimiento", go: "N" },
  { key: "cerebro", href: "/cerebro", label: "Cerebro", icon: <Brain />, module: "brain", group: "conocimiento", go: "B" },
  { key: "calendario", href: "/calendario", label: "Calendario", icon: <Calendar />, module: "calendar", group: "conocimiento", go: "K" },
  { key: "facultad", href: "/facultad", label: "Facultad", icon: <GraduationCap />, module: "study", group: "conocimiento", go: "Y" },
  { key: "control", href: "/control", label: "Centro de control", icon: <Gauge />, group: "sistema", go: "X" },
  { key: "revision", href: "/revision-semanal", label: "Revisión semanal", icon: <CalendarCheck />, module: "review", group: "sistema", go: "V" },
  { key: "automatizaciones", href: "/automatizaciones", label: "Automatizaciones", icon: <Workflow />, module: "automations", group: "sistema", go: "M" },
  { key: "ia", href: "/ia", label: "IA", icon: <Sparkles />, module: "ai", group: "sistema", go: "J" },
];

/** Lo que ve un colaborador (M15): solo trabajo de proyectos. */
const MEMBER_NAV = ["hoy", "proyectos", "tareas", "sitios"];

export function navFor(enabled: string[], role?: string) {
  return NAV.filter((n) => (!n.module || enabled.includes(n.module)) && (role !== "member" || MEMBER_NAV.includes(n.key)));
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
  ["/comercios", "Comercios"],
  ["/control/objetivos", "Objetivos"],
  ["/control/skills", "Skills"],
  ["/control", "Centro de control"],
  ["/revision-semanal", "Revisión semanal"],
  ["/aprobaciones", "Aprobaciones"],
  ["/espacios", "Espacios"],
  ["/actividad", "Actividad"],
  ["/notificaciones", "Notificaciones"],
];
