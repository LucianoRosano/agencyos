import { Banknote, Bell, Bot, CalendarClock, FileText, Globe, Search, ShieldAlert, Sparkles, Sun, Users, Workflow } from "lucide-react";
import type { ReactNode } from "react";

/** Ícono y color suave por tipo de aviso (siempre con texto al lado: el color no transmite información solo). */
export function notificationKind(type: string): { icon: ReactNode; tone: string; label: string } {
  const p = type.split(".")[0] ?? "";
  if (type.startsWith("resumen")) return { icon: <Sun />, tone: "bg-[#B7791F]/12 text-[#85570c] dark:text-[#e2b159]", label: "Resumen" };
  if (["cobro", "pago", "suscripcion", "movimiento"].includes(p)) return { icon: <Banknote />, tone: "bg-success-soft text-success", label: "Dinero" };
  if (["presupuesto", "oportunidad"].includes(p)) return { icon: <FileText />, tone: "bg-accent-soft text-accent-text", label: "Presupuestos" };
  if (["sitio", "ssl", "dominio", "certificado", "hosting"].includes(p))
    return { icon: <Globe />, tone: "bg-[#7A4E7E]/12 text-[#7A4E7E] dark:text-[#c9a3cc]", label: "Sitios" };
  if (p === "auditoria") return { icon: <Search />, tone: "bg-[#7A4E7E]/12 text-[#7A4E7E] dark:text-[#c9a3cc]", label: "SEO" };
  if (["tarea", "recordatorio"].includes(p)) return { icon: <CalendarClock />, tone: "bg-[#8C6A4F]/14 text-[#6b5c48] dark:text-[#c9b79e]", label: "Agenda" };
  if (["objetivo", "aprobacion", "agente"].includes(p)) return { icon: <Bot />, tone: "bg-[#5F574D]/12 text-text", label: "Agente" };
  if (p === "security") return { icon: <ShieldAlert />, tone: "bg-danger-soft text-danger", label: "Seguridad" };
  if (["entrega", "revision", "satisfaccion", "usuario"].includes(p))
    return { icon: <Users />, tone: "bg-[#B4637A]/12 text-[#9b4d63] dark:text-[#e3a4b6]", label: "Clientes" };
  if (p === "automatizacion") return { icon: <Workflow />, tone: "bg-surface-3 text-text", label: "Automatización" };
  if (p === "bandeja") return { icon: <Sparkles />, tone: "bg-surface-3 text-text", label: "Bandeja" };
  return { icon: <Bell />, tone: "bg-surface-3 text-text", label: "Aviso" };
}
