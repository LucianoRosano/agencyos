/**
 * Catálogo de automatizaciones: eventos de dominio (docs/03 §4), campos disponibles por entidad,
 * acciones, fuentes "para cada" de las programaciones y textos de estado. Serializable (se pasa a la UI por props).
 */
import { L } from "@agencyos/core";

export type FieldKind = "text" | "number" | "date" | "enum" | "bool";
export type FieldDef = { path: string; label: string; kind: FieldKind; options?: { value: string; label: string }[] };

const opts = (m: Record<string | number, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const BOOL = [
  { value: "true", label: "Sí" },
  { value: "false", label: "No" },
];

/** Claves en español del contexto de datos de una ejecución (lo que se usa en condiciones y {{plantillas}}). */
export const ENTITY_FIELDS: Record<string, { label: string; fields: FieldDef[] }> = {
  tarea: {
    label: "Tarea",
    fields: [
      { path: "tarea.titulo", label: "Título", kind: "text" },
      { path: "tarea.estado", label: "Estado", kind: "enum", options: opts(L.taskStatus) },
      { path: "tarea.prioridad", label: "Prioridad", kind: "enum", options: opts(L.priority) },
      { path: "tarea.vence", label: "Vence", kind: "date" },
      { path: "tarea.dias_vencida", label: "Días vencida", kind: "number" },
    ],
  },
  proyecto: {
    label: "Proyecto",
    fields: [
      { path: "proyecto.nombre", label: "Nombre", kind: "text" },
      { path: "proyecto.estado", label: "Estado", kind: "enum", options: opts(L.projectStatus) },
      { path: "proyecto.tipo", label: "Tipo", kind: "enum", options: opts(L.projectKind) },
      { path: "proyecto.prioridad", label: "Prioridad", kind: "enum", options: opts(L.priority) },
      { path: "proyecto.siguiente_accion", label: "Siguiente acción", kind: "text" },
      { path: "proyecto.fecha_objetivo", label: "Fecha objetivo", kind: "date" },
      { path: "proyecto.progreso", label: "Progreso (%)", kind: "number" },
    ],
  },
  cliente: {
    label: "Cliente",
    fields: [
      { path: "cliente.nombre", label: "Nombre", kind: "text" },
      { path: "cliente.estado", label: "Estado", kind: "enum", options: opts(L.clientStatus) },
      { path: "cliente.relacion", label: "Relación", kind: "enum", options: opts(L.relationship) },
      { path: "cliente.rubro", label: "Rubro", kind: "text" },
      { path: "cliente.ciudad", label: "Ciudad", kind: "text" },
      { path: "cliente.contacto", label: "Contacto principal", kind: "text" },
      { path: "cliente.email", label: "Email del contacto", kind: "text" },
    ],
  },
  oportunidad: {
    label: "Oportunidad",
    fields: [
      { path: "oportunidad.titulo", label: "Título", kind: "text" },
      { path: "oportunidad.etapa", label: "Etapa", kind: "enum", options: opts(L.stage) },
      { path: "oportunidad.valor", label: "Valor", kind: "number" },
      { path: "oportunidad.moneda", label: "Moneda", kind: "enum", options: opts({ ARS: "ARS", USD: "USD" }) },
      { path: "oportunidad.probabilidad", label: "Probabilidad (%)", kind: "number" },
      { path: "oportunidad.proxima_accion", label: "Próxima acción", kind: "text" },
    ],
  },
  presupuesto: {
    label: "Presupuesto",
    fields: [
      { path: "presupuesto.numero", label: "Número", kind: "text" },
      { path: "presupuesto.titulo", label: "Título", kind: "text" },
      { path: "presupuesto.estado", label: "Estado", kind: "enum", options: opts(L.quoteStatus) },
    ],
  },
  cobro: {
    label: "Cobro",
    fields: [
      { path: "cobro.concepto", label: "Concepto", kind: "text" },
      { path: "cobro.monto", label: "Monto", kind: "number" },
      { path: "cobro.moneda", label: "Moneda", kind: "enum", options: opts({ ARS: "ARS", USD: "USD" }) },
      { path: "cobro.vence", label: "Vence", kind: "date" },
      { path: "cobro.estado", label: "Estado", kind: "enum", options: opts(L.receivableStatus) },
    ],
  },
  dominio: {
    label: "Dominio",
    fields: [
      { path: "dominio.nombre", label: "Nombre", kind: "text" },
      { path: "dominio.vence", label: "Vence", kind: "date" },
      { path: "dominio.dias_para_vencer", label: "Días para vencer", kind: "number" },
      { path: "dominio.renovacion_automatica", label: "Renovación automática", kind: "bool", options: BOOL },
    ],
  },
  sitio: {
    label: "Sitio",
    fields: [
      { path: "sitio.nombre", label: "Nombre", kind: "text" },
      { path: "sitio.url", label: "URL", kind: "text" },
      { path: "sitio.estado", label: "Publicación", kind: "text" },
    ],
  },
  auditoria: {
    label: "Auditoría SEO",
    fields: [
      { path: "auditoria.url", label: "URL", kind: "text" },
      { path: "auditoria.puntaje", label: "Puntaje", kind: "number" },
      { path: "auditoria.estado", label: "Estado", kind: "text" },
    ],
  },
  repositorio: {
    label: "Repositorio",
    fields: [
      { path: "repositorio.nombre", label: "Nombre completo", kind: "text" },
      { path: "repositorio.lenguaje", label: "Lenguaje", kind: "text" },
    ],
  },
  webhook: {
    label: "Webhook",
    fields: [{ path: "webhook.nombre", label: "Nombre del webhook", kind: "text" }],
  },
};

/** Tipo de entidad (domain_event.entity_type) → clave en español y entidades relacionadas que se cargan. */
export const ENTITY_KEYS: Record<string, { key: string; related: string[] }> = {
  task: { key: "tarea", related: ["proyecto", "cliente"] },
  project: { key: "proyecto", related: ["cliente"] },
  client: { key: "cliente", related: [] },
  opportunity: { key: "oportunidad", related: ["cliente"] },
  quote: { key: "presupuesto", related: ["cliente", "proyecto"] },
  receivable: { key: "cobro", related: ["cliente", "proyecto"] },
  domain: { key: "dominio", related: ["cliente", "sitio"] },
  site: { key: "sitio", related: ["cliente", "proyecto"] },
  seo_audit: { key: "auditoria", related: ["sitio", "proyecto", "cliente"] },
  repository: { key: "repositorio", related: [] },
  webhook_endpoint: { key: "webhook", related: [] },
};

export type EventDef = { type: string; label: string; group: string; entity: string; payload?: FieldDef[] };

const FROM_TO = (m: Record<string, string>): FieldDef[] => [
  { path: "payload.from", label: "Estado anterior", kind: "enum", options: opts(m) },
  { path: "payload.to", label: "Estado nuevo", kind: "enum", options: opts(m) },
];

/** Eventos que pueden disparar reglas. Los de módulos F2–F6 siguen la spec (docs/02, docs/03 §4). */
export const EVENT_CATALOG: EventDef[] = [
  { type: "proyecto.creado", label: "Proyecto creado", group: "Proyectos", entity: "project" },
  { type: "proyecto.estado_cambiado", label: "Proyecto cambió de estado", group: "Proyectos", entity: "project", payload: FROM_TO(L.projectStatus) },
  { type: "proyecto.bloqueado", label: "Proyecto bloqueado", group: "Proyectos", entity: "project" },
  { type: "proyecto.siguiente_accion", label: "Proyecto con nueva siguiente acción", group: "Proyectos", entity: "project" },
  { type: "entrega.creada", label: "Entrega creada", group: "Proyectos", entity: "deliverable" },
  { type: "tarea.creada", label: "Tarea creada", group: "Tareas", entity: "task" },
  { type: "tarea.completada", label: "Tarea completada", group: "Tareas", entity: "task" },
  { type: "tarea.estado_cambiado", label: "Tarea cambió de estado", group: "Tareas", entity: "task", payload: FROM_TO(L.taskStatus) },
  { type: "tarea.pospuesta", label: "Tarea pospuesta", group: "Tareas", entity: "task" },
  { type: "cliente.creado", label: "Cliente creado", group: "CRM", entity: "client" },
  { type: "cliente.estado_cambiado", label: "Cliente cambió de estado", group: "CRM", entity: "client", payload: FROM_TO(L.clientStatus) },
  { type: "interaccion.registrada", label: "Interacción registrada", group: "CRM", entity: "interaction" },
  { type: "oportunidad.creada", label: "Oportunidad creada", group: "CRM", entity: "opportunity" },
  { type: "oportunidad.etapa_cambiada", label: "Oportunidad cambió de etapa", group: "CRM", entity: "opportunity", payload: FROM_TO(L.stage) },
  { type: "oportunidad.ganada", label: "Oportunidad ganada", group: "CRM", entity: "opportunity" },
  { type: "oportunidad.perdida", label: "Oportunidad perdida", group: "CRM", entity: "opportunity" },
  { type: "presupuesto.creado", label: "Presupuesto creado", group: "Presupuestos", entity: "quote" },
  { type: "presupuesto.enviado", label: "Presupuesto enviado", group: "Presupuestos", entity: "quote" },
  { type: "presupuesto.visto", label: "Presupuesto visto por el cliente", group: "Presupuestos", entity: "quote" },
  { type: "presupuesto.aceptado", label: "Presupuesto aceptado", group: "Presupuestos", entity: "quote" },
  { type: "presupuesto.rechazado", label: "Presupuesto rechazado", group: "Presupuestos", entity: "quote" },
  { type: "presupuesto.vencido", label: "Presupuesto vencido", group: "Presupuestos", entity: "quote" },
  { type: "cobro.registrado", label: "Cobro registrado", group: "Finanzas", entity: "receivable" },
  { type: "cobro.vencido", label: "Cobro vencido", group: "Finanzas", entity: "receivable" },
  { type: "pago.vencido", label: "Pago vencido", group: "Finanzas", entity: "payable" },
  { type: "movimiento.registrado", label: "Movimiento registrado", group: "Finanzas", entity: "transaction" },
  { type: "sitio.creado", label: "Sitio creado", group: "Sitios y activos", entity: "site" },
  { type: "sitio.caido", label: "Sitio caído", group: "Sitios y activos", entity: "site" },
  { type: "sitio.recuperado", label: "Sitio recuperado", group: "Sitios y activos", entity: "site" },
  { type: "dominio.por_vencer", label: "Dominio por vencer", group: "Sitios y activos", entity: "domain" },
  { type: "ssl.por_vencer", label: "Certificado SSL por vencer", group: "Sitios y activos", entity: "certificate" },
  { type: "auditoria.completada", label: "Auditoría SEO completada", group: "SEO", entity: "seo_audit" },
  { type: "auditoria.regresion_detectada", label: "Auditoría SEO con regresión", group: "SEO", entity: "seo_audit" },
  { type: "repo.release_publicado", label: "Release publicado en GitHub", group: "Repositorios", entity: "repository" },
  { type: "repo.pr_abierto", label: "Pull request abierto", group: "Repositorios", entity: "repository" },
  { type: "repo.push", label: "Push a un repositorio", group: "Repositorios", entity: "repository" },
  { type: "nota.creada", label: "Nota creada", group: "Conocimiento", entity: "note" },
  { type: "bandeja.capturado", label: "Algo capturado en la Bandeja", group: "Conocimiento", entity: "inbox_item" },
  { type: "aprobacion.solicitada", label: "Aprobación solicitada", group: "Sistema", entity: "approval" },
  { type: "webhook.recibido", label: "Webhook entrante recibido", group: "Sistema", entity: "webhook_endpoint" },
  { type: "automatizacion.fallida", label: "Una automatización falló", group: "Sistema", entity: "automation_rule" },
];

export const eventLabel = (type: string | null | undefined) => EVENT_CATALOG.find((e) => e.type === type)?.label ?? type ?? "—";

/** Fuentes "para cada…" de las reglas programadas: la regla corre una vez por elemento (y por versión). */
export const SCHEDULE_SOURCES: Record<string, { label: string; entity: string; daysLabel?: string; help: string }> = {
  none: { label: "Una sola vez por programación", entity: "", help: "La regla corre una vez en cada horario programado." },
  task_overdue: {
    label: "Cada tarea vencida",
    entity: "task",
    daysLabel: "Vencida hace al menos (días)",
    help: "Corre una vez por tarea vencida (si cambia la fecha, cuenta como nueva).",
  },
  opportunity_no_next_action: {
    label: "Cada oportunidad abierta sin próxima acción",
    entity: "opportunity",
    help: "Corre una vez por oportunidad abierta que no tiene próxima acción definida.",
  },
  domain_expiring: {
    label: "Cada dominio por vencer",
    entity: "domain",
    daysLabel: "Vence dentro de (días)",
    help: "Corre una vez por dominio y por fecha de vencimiento.",
  },
  receivable_overdue: {
    label: "Cada cobro vencido",
    entity: "receivable",
    daysLabel: "Vencido hace al menos (días)",
    help: "Corre una vez por cobro vencido y fecha.",
  },
};

export const ACTION_TYPES: Record<string, { label: string; help: string }> = {
  create_task: { label: "Crear tarea", help: "Crea una tarea (opcionalmente en el proyecto del evento)." },
  notify: { label: "Notificarme", help: "Notificación in-app para el dueño y los administradores." },
  send_email: { label: "Enviar email", help: "A vos directo; al cliente, siempre pasa por Aprobaciones salvo que lo marques automático." },
  set_status: { label: "Cambiar estado", help: "Cambia el estado de la tarea o del proyecto del evento." },
  webhook: { label: "Webhook saliente", help: "POST firmado con HMAC-SHA256 a una URL tuya (n8n, Zapier…)." },
  wait: { label: "Esperar", help: "Pausa la ejecución N días y después sigue con las acciones siguientes." },
};

export const RUN_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "warning" | "info" }> = {
  running: { label: "En curso", tone: "info" },
  succeeded: { label: "Correcta", tone: "success" },
  failed: { label: "Falló", tone: "danger" },
  skipped: { label: "Omitida", tone: "neutral" },
  waiting: { label: "Esperando", tone: "warning" },
  waiting_approval: { label: "Esperando aprobación", tone: "warning" },
};

/** Campos siempre disponibles. */
export const COMMON_FIELDS: FieldDef[] = [
  { path: "evento.tipo", label: "Tipo de evento", kind: "text" },
  { path: "evento.actor", label: "Quién lo hizo", kind: "text" },
  { path: "hoy", label: "Fecha de hoy", kind: "date" },
];

/** Campos disponibles para el constructor según el disparador. */
export function fieldsFor(trigger: { kind: "event" | "schedule"; eventType?: string | null; source?: string | null }): { group: string; fields: FieldDef[] }[] {
  let entityType = "";
  let payload: FieldDef[] = [];
  if (trigger.kind === "event") {
    const ev = EVENT_CATALOG.find((e) => e.type === trigger.eventType);
    entityType = ev?.entity ?? "";
    payload = ev?.payload ?? [];
  } else {
    entityType = SCHEDULE_SOURCES[trigger.source ?? "none"]?.entity ?? "";
  }
  const out: { group: string; fields: FieldDef[] }[] = [];
  const ek = ENTITY_KEYS[entityType];
  if (ek) {
    for (const k of [ek.key, ...ek.related]) {
      const def = ENTITY_FIELDS[k];
      if (def) out.push({ group: def.label, fields: def.fields });
    }
  }
  if (trigger.kind === "event" && trigger.eventType === "webhook.recibido") {
    payload = [...payload, { path: "payload.datos.tipo", label: "Dato «tipo» del cuerpo", kind: "text" }];
  }
  if (payload.length) out.push({ group: "Datos del evento", fields: payload });
  if (trigger.kind === "event") out.push({ group: "Evento", fields: COMMON_FIELDS });
  else out.push({ group: "Programación", fields: [COMMON_FIELDS[2] as FieldDef] });
  return out;
}

export const MAX_ACTIONS = 20;
export const MAX_CONDITIONS = 20;
/** Tope de ejecuciones reales por minuto y por workspace (anti-bucle). */
export const MAX_RUNS_PER_MINUTE = 30;
