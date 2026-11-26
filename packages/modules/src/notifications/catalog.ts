/**
 * Catálogo de avisos: qué eventos notifican, cómo se llaman en Configuración y su prioridad por defecto.
 * `owners` = a quién le llega (dueño y administradores del workspace) salvo que el evento indique otra persona.
 */
export type Priority = "urgent" | "normal" | "low";
export type NotifyGroup = "Día a día" | "Dinero" | "Clientes" | "Sitios" | "Agente y Claude" | "Seguridad";

export const NOTIFY_EVENTS: { type: string; label: string; group: NotifyGroup; priority: Priority; hint?: string }[] = [
  { type: "resumen.diario", label: "Resumen del día (a la hora que elijas)", group: "Día a día", priority: "normal" },
  { type: "resumen.cierre", label: "Cierre del día (lo que hiciste y lo de mañana)", group: "Día a día", priority: "low" },
  { type: "resumen.semanal", label: "Resumen de la semana (lunes)", group: "Día a día", priority: "normal" },
  { type: "tarea.recordatorio", label: "Tareas con hora (15 minutos antes)", group: "Día a día", priority: "normal" },
  { type: "recordatorio.vence", label: "Vencimientos agendados (días antes y el día)", group: "Día a día", priority: "normal" },
  { type: "cobro.vencido", label: "Cobro vencido", group: "Dinero", priority: "normal" },
  { type: "pago.vencido", label: "Pago vencido", group: "Dinero", priority: "normal" },
  { type: "presupuesto.visto", label: "El cliente abrió un presupuesto", group: "Clientes", priority: "normal" },
  { type: "presupuesto.aceptado", label: "Presupuesto aceptado", group: "Clientes", priority: "normal" },
  { type: "presupuesto.rechazado", label: "Presupuesto rechazado", group: "Clientes", priority: "normal" },
  { type: "presupuesto.vencido", label: "Presupuesto vencido sin respuesta", group: "Clientes", priority: "low" },
  { type: "oportunidad.ganada", label: "Oportunidad ganada", group: "Clientes", priority: "low" },
  { type: "entrega.aprobada_por_cliente", label: "El cliente aprobó una entrega", group: "Clientes", priority: "normal" },
  { type: "entrega.cambios_pedidos", label: "El cliente pidió cambios", group: "Clientes", priority: "normal" },
  { type: "revision.feedback_cliente", label: "Comentarios del cliente en una revisión", group: "Clientes", priority: "normal" },
  { type: "satisfaccion.respondida", label: "Encuesta de satisfacción respondida", group: "Clientes", priority: "low" },
  { type: "usuario.unido", label: "Alguien aceptó una invitación", group: "Clientes", priority: "low" },
  { type: "sitio.caido", label: "Sitio caído", group: "Sitios", priority: "urgent" },
  { type: "sitio.recuperado", label: "Sitio recuperado", group: "Sitios", priority: "normal" },
  { type: "ssl.por_vencer", label: "Certificado SSL por vencer", group: "Sitios", priority: "normal" },
  { type: "dominio.por_vencer", label: "Dominio por vencer", group: "Sitios", priority: "normal" },
  { type: "auditoria.regresion_detectada", label: "Regresión en una auditoría SEO", group: "Sitios", priority: "normal" },
  { type: "objetivo.pregunta", label: "El agente te hace una pregunta", group: "Agente y Claude", priority: "normal" },
  { type: "objetivo.plan_propuesto", label: "El agente propuso un plan", group: "Agente y Claude", priority: "normal" },
  { type: "objetivo.aprobacion_pedida", label: "El agente pide aprobación para un paso", group: "Agente y Claude", priority: "normal" },
  { type: "objetivo.para_revisar", label: "Un objetivo terminó y espera tu revisión", group: "Agente y Claude", priority: "normal" },
  { type: "aprobacion.solicitada", label: "Claude propone un cambio", group: "Agente y Claude", priority: "normal" },
  { type: "agente.actividad", label: "Todo lo que hace Claude por MCP", group: "Agente y Claude", priority: "low" },
  { type: "security.new_device", label: "Inicio de sesión desde un dispositivo nuevo", group: "Seguridad", priority: "urgent" },
];

const BY_TYPE = new Map(NOTIFY_EVENTS.map((e) => [e.type, e]));
export const eventMeta = (type: string) => BY_TYPE.get(type);
export const defaultPriority = (type: string): Priority => BY_TYPE.get(type)?.priority ?? "normal";
