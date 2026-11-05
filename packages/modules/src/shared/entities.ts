import { schema } from "@agencyos/db";

/** Registro de entidades: tabla, campo de título y URL. Base de papelera, enlaces, búsqueda y Cerebro. */
export const ENTITIES = {
  client: { table: schema.client, title: "name", href: (id: string) => `/crm/clientes/${id}` },
  contact: { table: schema.contact, title: "name", href: (id: string) => `/crm/contactos/${id}` },
  opportunity: { table: schema.opportunity, title: "title", href: (id: string) => `/crm/oportunidades/${id}` },
  interaction: { table: schema.interaction, title: "summaryMd", href: (_id: string) => `/crm/clientes` },
  project: { table: schema.project, title: "name", href: (id: string) => `/proyectos/${id}` },
  task: { table: schema.task, title: "title", href: (id: string) => `/tareas/${id}` },
  quote: { table: schema.quote, title: "title", href: (id: string) => `/presupuestos/${id}` },
  service: { table: schema.service, title: "name", href: (_id: string) => `/presupuestos/servicios` },
  note: { table: schema.note, title: "title", href: (id: string) => `/notas/${id}` },
  course: { table: schema.course, title: "name", href: (id: string) => `/facultad/${id}` },
  assessment: { table: schema.assessment, title: "title", href: (_id: string) => `/facultad` },
  transaction: { table: schema.transaction, title: "description", href: (_id: string) => `/finanzas/movimientos` },
  receivable: { table: schema.receivable, title: "concept", href: (_id: string) => `/finanzas/por-cobrar` },
  payable: { table: schema.payable, title: "concept", href: (_id: string) => `/finanzas/por-pagar` },
  subscription: { table: schema.subscription, title: "vendor", href: (_id: string) => `/finanzas/suscripciones` },
  reminder: { table: schema.reminder, title: "title", href: (_id: string) => `/hoy` },
  inbox_item: { table: schema.inboxItem, title: "text", href: (_id: string) => `/bandeja` },
  space: { table: schema.space, title: "name", href: (id: string) => `/espacios/${id}` },
  decision: { table: schema.decision, title: "title", href: (_id: string) => `/proyectos` },
  deliverable: { table: schema.deliverable, title: "title", href: (_id: string) => `/proyectos` },
  account: { table: schema.moneyAccount, title: "name", href: (_id: string) => `/finanzas/cuentas` },
  project_template: { table: schema.projectTemplate, title: "name", href: (_id: string) => `/proyectos/plantillas` },
  site: { table: schema.site, title: "name", href: (id: string) => `/sitios/${id}` },
  domain: { table: schema.domain, title: "name", href: (_id: string) => `/activos/dominios` },
  hosting: { table: schema.hosting, title: "provider", href: (_id: string) => `/activos/hosting` },
  certificate: { table: schema.certificate, title: "subject", href: (_id: string) => `/activos/certificados` },
  credential_ref: { table: schema.credentialRef, title: "label", href: (_id: string) => `/activos` },
  own_product: { table: schema.ownProduct, title: "name", href: (id: string) => `/activos/productos/${id}` },
  installation: { table: schema.installation, title: "configRefMd", href: (_id: string) => `/activos/productos` },
  site_environment: { table: schema.siteEnvironment, title: "url", href: (_id: string) => `/activos/monitoreo` },
  file: { table: schema.file, title: "name", href: (id: string) => `/biblioteca/archivo/${id}` },
  folder: { table: schema.folder, title: "name", href: (id: string) => `/biblioteca?carpeta=${id}` },
  reusable_template: { table: schema.reusableTemplate, title: "name", href: (_id: string) => `/biblioteca/plantillas` },
  seo_audit: { table: schema.seoAudit, title: "rootUrl", href: (id: string) => `/seo/${id}` },
  automation_rule: { table: schema.automationRule, title: "name", href: (id: string) => `/automatizaciones/${id}` },
  repository: { table: schema.repository, title: "fullName", href: (id: string) => `/repositorios/${id}` },
  comment: { table: schema.comment, title: "bodyMd", href: (_id: string) => `/hoy` },
  saved_view: { table: schema.savedView, title: "name", href: (_id: string) => `/hoy` },
  time_entry: { table: schema.timeEntry, title: "note", href: (_id: string) => `/proyectos` },
  note_template: { table: schema.noteTemplate, title: "name", href: (_id: string) => `/notas` },
} as const;

export type EntityType = keyof typeof ENTITIES;
export const isEntityType = (t: string): t is EntityType => t in ENTITIES;
export const entityHref = (type: string, id: string) => (isEntityType(type) ? ENTITIES[type].href(id) : "/hoy");
