import {
  Brain,
  BriefcaseBusiness,
  Calendar,
  ChartNoAxesCombined,
  CircleCheck,
  FileSignature,
  FileText,
  FolderKanban,
  GraduationCap,
  Inbox,
  Sun,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

export type NavItem = { key: string; href: string; label: string; icon: ReactNode; module?: string; match?: string; countKey?: string };

export const NAV: NavItem[] = [
  { key: "hoy", href: "/hoy", label: "Hoy", icon: <Sun /> },
  { key: "bandeja", href: "/bandeja", label: "Bandeja", icon: <Inbox />, module: "inbox", countKey: "inbox" },
  { key: "proyectos", href: "/proyectos", label: "Proyectos", icon: <FolderKanban />, module: "projects", countKey: "projects" },
  { key: "tareas", href: "/tareas", label: "Tareas", icon: <CircleCheck />, module: "projects" },
  { key: "clientes", href: "/crm/clientes", label: "Clientes", icon: <BriefcaseBusiness />, module: "crm", match: "/crm", countKey: "clients" },
  { key: "presupuestos", href: "/presupuestos", label: "Presupuestos", icon: <FileSignature />, module: "quotes" },
  { key: "notas", href: "/notas", label: "Notas", icon: <FileText />, module: "notes" },
  { key: "cerebro", href: "/cerebro", label: "Cerebro", icon: <Brain />, module: "brain" },
  { key: "finanzas", href: "/finanzas", label: "Finanzas", icon: <Wallet />, module: "finance" },
  { key: "negocio", href: "/negocio", label: "Negocio", icon: <ChartNoAxesCombined /> },
  { key: "calendario", href: "/calendario", label: "Calendario", icon: <Calendar />, module: "calendar" },
  { key: "facultad", href: "/facultad", label: "Facultad", icon: <GraduationCap />, module: "study" },
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
  ["/espacios", "Espacios"],
  ["/actividad", "Actividad"],
  ["/notificaciones", "Notificaciones"],
];
