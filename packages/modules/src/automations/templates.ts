import type { RuleInput } from "./validators";

/** Plantillas listas para usar (docs/02 M09). Se cargan en el constructor para revisarlas antes de guardar. */
export type AutomationTemplate = { key: string; name: string; description: string; rule: RuleInput };

export const TEMPLATES: AutomationTemplate[] = [
  {
    key: "presupuesto-aceptado-kickoff",
    name: "Presupuesto aceptado → tarea de kickoff",
    description: "El proyecto y los cobros ya los crea la aceptación; esto agrega la reunión de arranque en ese proyecto.",
    rule: {
      name: "Presupuesto aceptado → kickoff",
      triggerKind: "event",
      eventType: "presupuesto.aceptado",
      conditions: { match: "all", items: [] },
      actions: [
        {
          type: "create_task",
          params: {
            title: "Kickoff con {{cliente.nombre}}: {{presupuesto.titulo}}",
            description: "Reunión de arranque. El proyecto y los cobros ya se crearon al aceptar {{presupuesto.numero}}.",
            priority: 2,
            dueInDays: 2,
            project: "event",
          },
        },
      ],
    },
  },
  {
    key: "dominio-vence-30",
    name: "Dominio vence en 30 días → tarea + email al cliente",
    description: "Todos los días a las 9:00 revisa los dominios; el email al cliente queda en Aprobaciones hasta que lo apruebes.",
    rule: {
      name: "Dominio por vencer (30 días)",
      triggerKind: "schedule",
      schedule: { preset: "daily", time: "09:00" },
      source: { kind: "domain_expiring", days: 30 },
      conditions: { match: "all", items: [{ field: "dominio.renovacion_automatica", op: "eq", value: "false" }] },
      actions: [
        {
          type: "create_task",
          params: { title: "Renovar el dominio {{dominio.nombre}} (vence el {{dominio.vence}})", priority: 2, dueInDays: 7, project: "event" },
        },
        {
          type: "send_email",
          params: {
            to: "client",
            subject: "Tu dominio {{dominio.nombre}} vence el {{dominio.vence}}",
            body: "Hola {{cliente.contacto}}:\n\nTe aviso que el dominio {{dominio.nombre}} vence el {{dominio.vence}}. Si querés, me encargo de la renovación para que el sitio no se caiga.\n\nSaludos,\nLuciano Rosano",
            automatic: false,
          },
        },
      ],
    },
  },
  {
    key: "release-github-zip",
    name: "Release publicado en GitHub → tarea «subir zip al cliente»",
    description: "Cuando publicás un release, queda la tarea de entregar el zip.",
    rule: {
      name: "Release publicado → subir zip",
      triggerKind: "event",
      eventType: "repo.release_publicado",
      conditions: { match: "all", items: [] },
      actions: [
        {
          type: "create_task",
          params: { title: "Subir el zip de {{repositorio.nombre}} al cliente", description: "Release publicado en GitHub.", priority: 2, dueInDays: 1, project: "none" },
        },
      ],
    },
  },
  {
    key: "auditoria-regresion",
    name: "Auditoría con regresión → tarea en el proyecto del sitio",
    description: "Si una auditoría SEO empeora, crea la tarea de revisión en el proyecto del sitio.",
    rule: {
      name: "Regresión SEO → tarea",
      triggerKind: "event",
      eventType: "auditoria.regresion_detectada",
      conditions: { match: "all", items: [] },
      actions: [
        {
          type: "create_task",
          params: { title: "Revisar la regresión SEO de {{auditoria.url}}", description: "Puntaje actual: {{auditoria.puntaje}}.", priority: 2, dueInDays: 3, project: "event" },
        },
      ],
    },
  },
  {
    key: "tarea-vencida-notificar",
    name: "Tarea vencida hace 3 días → notificarme",
    description: "Todos los días a las 9:00, una notificación por cada tarea con 3 o más días de atraso.",
    rule: {
      name: "Tarea vencida hace 3 días → notificarme",
      triggerKind: "schedule",
      schedule: { preset: "daily", time: "09:00" },
      source: { kind: "task_overdue", days: 3 },
      conditions: { match: "all", items: [] },
      actions: [{ type: "notify", params: { title: "«{{tarea.titulo}}» está vencida hace {{tarea.dias_vencida}} días", body: "Venció el {{tarea.vence}}." } }],
    },
  },
  {
    key: "oportunidad-sin-proxima-accion",
    name: "Oportunidad sin próxima acción → tarea de seguimiento",
    description: "Los lunes a las 9:00, una tarea de seguimiento por cada oportunidad abierta sin próxima acción.",
    rule: {
      name: "Oportunidad sin próxima acción → seguimiento",
      triggerKind: "schedule",
      schedule: { preset: "weekly", time: "09:00", weekday: 1 },
      source: { kind: "opportunity_no_next_action" },
      conditions: { match: "all", items: [] },
      actions: [
        {
          type: "create_task",
          params: { title: "Seguimiento: {{oportunidad.titulo}} ({{cliente.nombre}})", description: "Definí la próxima acción de la oportunidad.", priority: 2, dueInDays: 0, project: "none" },
        },
      ],
    },
  },
  {
    key: "proyecto-creado-preparar",
    name: "Proyecto creado → tarea de preparación",
    description: "Cada proyecto nuevo arranca con la tarea de preparar carpeta, accesos y repositorio.",
    rule: {
      name: "Proyecto creado → preparar",
      triggerKind: "event",
      eventType: "proyecto.creado",
      conditions: { match: "all", items: [] },
      actions: [
        {
          type: "create_task",
          params: { title: "Preparar carpeta y accesos de {{proyecto.nombre}}", description: "Carpeta, accesos (referencias a Bitwarden) y repositorio.", priority: 3, dueInDays: 1, project: "event" },
        },
      ],
    },
  },
];

export const findTemplate = (key: string | null | undefined) => TEMPLATES.find((t) => t.key === key) ?? null;
