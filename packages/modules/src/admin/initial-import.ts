import { systemCtx } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { getDb, schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";

/**
 * Carga inicial de Luciano (contexto A4 + D9). Sin montos inventados: lo que falta queda como
 * tareas "Completar…" en la Bandeja. Idempotente por nombre. Por defecto solo muestra el plan.
 */
type P = { name: string; status: "idea" | "planning" | "in_progress" | "paused" | "done"; kind: string; nextAction?: string; goal?: string };
type C = {
  name: string;
  relationship: "family" | "referral" | "external";
  status: "active" | "finished" | "prospect";
  industry?: string;
  website?: string;
  city?: string;
  notes?: string;
  projects: P[];
};

export const CLIENTS: C[] = [
  {
    name: "Librería Uno",
    relationship: "family",
    status: "active",
    industry: "Librería, papelería, cotillón y juguetería",
    city: "San Miguel",
    website: "https://pruebas.libreriauno.com",
    notes: "Staging en pruebas.libreriauno.com. Certificado de producción de ARCA vence el 27/10/2028.",
    projects: [
      {
        name: "Tienda WooCommerce",
        status: "in_progress",
        kind: "store",
        goal: "Lanzar la tienda online",
        nextAction: "Recorrer el checklist de lanzamiento de 17 áreas en staging",
      },
      {
        name: "LibreríaOS Panel",
        status: "planning",
        kind: "panel",
        goal: "Panel propio para gestionar el local sin WordPress",
        nextAction: "Diseñar las 2 pantallas del jefe que faltan",
      },
      {
        name: "LibreríaOS Fiscal",
        status: "in_progress",
        kind: "panel",
        goal: "Facturación automática por web services de ARCA (v1.1.0 probada en staging)",
        nextAction: "Esperar la orden de «empecemos con la fase final»",
      },
      {
        name: "Caja del local",
        status: "planning",
        kind: "panel",
        goal: "Sistema de caja con dos cuentas fiscales",
        nextAction: "Definir requerimientos de la caja",
      },
      { name: "App de gestión de empleadas", status: "paused", kind: "panel" },
      { name: "Agente de chat del local", status: "idea", kind: "other" },
    ],
  },
  {
    name: "Sofía Casa Editorial",
    relationship: "family",
    status: "active",
    industry: "Editorial",
    website: "https://sofiacasaeditorial.com",
    projects: [
      {
        name: "Sitio WooCommerce (mantenimiento)",
        status: "in_progress",
        kind: "maintenance",
        goal: "Sitio en producción",
        nextAction: "Revisar actualizaciones y backups del sitio",
      },
      {
        name: "Panel propio de Sofía",
        status: "in_progress",
        kind: "panel",
        goal: "Panel PHP independiente sobre la REST de WooCommerce",
        nextAction: "Inventariar el código del panel en el hosting",
      },
      {
        name: "Facturador ARCA (Python)",
        status: "in_progress",
        kind: "panel",
        goal: "Facturador de escritorio con Playwright",
        nextAction: "Evaluar migrar a LibreríaOS Fiscal",
      },
      { name: "Auditoría SEO", status: "in_progress", kind: "seo", nextAction: "Continuar la auditoría SEO en curso" },
      { name: "Dashboard financiero", status: "planning", kind: "panel", goal: "En diagnóstico" },
      { name: "Clon de LibreríaOS para Sofía", status: "planning", kind: "panel", goal: "Decidido, sin empezar" },
    ],
  },
  {
    name: "ADEH",
    relationship: "family",
    status: "active",
    industry: "Asociación de Estudios Humanísticos",
    projects: [
      {
        name: "Certificados IX Congreso de Lengua y Literatura",
        status: "in_progress",
        kind: "other",
        goal: "Generación de certificados PDF por tandas",
        nextAction: "Generar la próxima tanda de certificados",
      },
    ],
  },
  {
    name: "Bellezatecnia",
    relationship: "family",
    status: "active",
    industry: "Belleza y peluquería (~1.000 productos)",
    projects: [
      {
        name: "Plataforma mayorista",
        status: "in_progress",
        kind: "store",
        goal: "Mayorista B2B en su Hostinger; se transfiere al aprobarse",
        nextAction: "Enviar la lista única de preguntas al cliente",
      },
      { name: "Rediseño de la minorista", status: "idea", kind: "store" },
    ],
  },
  {
    name: "Parinama Nutrición",
    relationship: "external",
    status: "finished",
    industry: "Nutrición (Omnilife)",
    city: "Tandil",
    projects: [
      { name: "Panel Gestión SCE", status: "done", kind: "panel" },
      { name: "SEO completo", status: "done", kind: "seo" },
      { name: "Reescritura legal del contenido", status: "done", kind: "other" },
    ],
  },
];

export const PERSONAL: P[] = [
  {
    name: "AGENCYOS",
    status: "in_progress",
    kind: "personal",
    goal: "Mi sistema operativo personal y de la agencia",
    nextAction: "Probar AGENCYOS a diario y anotar ajustes",
  },
  { name: "SEÑAL", status: "in_progress", kind: "personal", goal: "Diario semanal automatizado en PDF", nextAction: "Preparar la próxima edición semanal" },
  { name: "Ciberseguridad (UTN)", status: "planning", kind: "personal", goal: "Cursos de la UTN el año que viene" },
  { name: "Pasantía UNGS", status: "planning", kind: "personal", goal: "Conseguir una pasantía" },
  { name: "Importación desde China", status: "idea", kind: "personal", goal: "Investigación" },
  {
    name: "Libros-PDF de estudio",
    status: "in_progress",
    kind: "personal",
    goal: "Biblioteca de libros de estudio en PDF",
    nextAction: "Elegir el próximo libro a armar",
  },
  {
    name: "Ecosistema Claude",
    status: "in_progress",
    kind: "personal",
    goal: "Personalizar mi ecosistema de Claude",
    nextAction: "Conectar Claude a AGENCYOS por MCP",
  },
];

export const REMINDERS = [
  { title: "Exportar diseños de LibreríaOS desde Claude Design", kind: "deadline", dueDate: "2026-12-14", notifyDaysBefore: 45 },
  { title: "Certificado de producción de ARCA (Librería Uno)", kind: "certificate", dueDate: "2028-10-27", notifyDaysBefore: 60 },
];

export const INBOX = [
  "Completar montos y fechas de las suscripciones (Claude, Hostinger, dominios, VPS) en Finanzas",
  "Cargar mis cuentas de dinero (efectivo, Mercado Pago, banco, USD) con su saldo inicial",
  "Cargar el catálogo de servicios con precios",
  "Cargar materias y fechas de evaluación de la facultad",
];

export async function runInitialImport({ apply }: { apply: boolean }) {
  const db = getDb();
  const [ws] = await db.select().from(schema.workspace).limit(1);
  if (!ws) throw new Error("Primero creá la cuenta del dueño en /setup.");
  const [m] = await db.select().from(schema.membership).where(eq(schema.membership.workspaceId, ws.id)).limit(1);
  const ctx = { ...systemCtx(ws.id), actor: { type: "system" as const, id: null, name: "Carga inicial" }, userId: m?.userId ?? null };
  const spaces = await db.select().from(schema.space).where(eq(schema.space.workspaceId, ws.id));
  const agency = spaces.find((s) => s.kind === "agency");
  const personal = spaces.find((s) => s.kind === "personal");
  if (!agency || !personal) throw new Error("Faltan los espacios Agencia/Personal.");

  console.log(`\nPlan de carga inicial (${apply ? "APLICANDO" : "solo vista previa; agregá --aplicar para ejecutar"}):`);
  for (const c of CLIENTS) {
    console.log(`\n• Cliente ${c.name} (${c.status})`);
    for (const p of c.projects) console.log(`   - ${p.name} [${p.status}]${p.nextAction ? ` → ${p.nextAction}` : ""}`);
  }
  console.log("\n• Personal:");
  for (const p of PERSONAL) console.log(`   - ${p.name} [${p.status}]`);
  console.log("\n• Vencimientos:", REMINDERS.map((r) => `${r.title} (${r.dueDate})`).join(" · "));
  console.log("• Bandeja:", INBOX.length, "pendientes de completar");
  if (!apply) return;

  await db.transaction(async (t) => {
    for (const c of CLIENTS) {
      let [client] = await t
        .select()
        .from(schema.client)
        .where(and(eq(schema.client.workspaceId, ws.id), eq(schema.client.name, c.name)));
      if (!client) {
        [client] = await t
          .insert(schema.client)
          .values({
            workspaceId: ws.id,
            createdBy: ctx.userId,
            name: c.name,
            relationship: c.relationship,
            status: c.status,
            industry: c.industry,
            website: c.website,
            city: c.city,
            province: "Buenos Aires",
            notesMd: c.notes,
            spaceId: agency.id,
            source: c.relationship === "family" ? "familia" : "referido",
          })
          .returning();
        await recordEvent(t, ctx, { type: "cliente.creado", entityType: "client", entityId: client?.id, summary: `Carga inicial: cliente «${c.name}»` });
      }
      if (!client) continue;
      for (const p of c.projects) await upsertProject(t, ws.id, ctx.userId, { ...p, spaceId: agency.id, clientId: client.id });
    }
    for (const p of PERSONAL) await upsertProject(t, ws.id, ctx.userId, { ...p, spaceId: personal.id });
    for (const r of REMINDERS) {
      const [exists] = await t
        .select()
        .from(schema.reminder)
        .where(and(eq(schema.reminder.workspaceId, ws.id), eq(schema.reminder.title, r.title)));
      if (!exists) await t.insert(schema.reminder).values({ workspaceId: ws.id, createdBy: ctx.userId, ...r });
    }
    for (const text of INBOX) {
      const [exists] = await t
        .select()
        .from(schema.inboxItem)
        .where(and(eq(schema.inboxItem.workspaceId, ws.id), eq(schema.inboxItem.text, text)));
      if (!exists) await t.insert(schema.inboxItem).values({ workspaceId: ws.id, createdBy: ctx.userId, text, suggestedType: "task", source: "app" });
    }
  });
  console.log("\nCarga inicial aplicada.");
}

async function upsertProject(
  t: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  workspaceId: string,
  userId: string | null,
  p: P & { spaceId: string; clientId?: string },
) {
  const [exists] = await t
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(and(eq(schema.project.workspaceId, workspaceId), eq(schema.project.name, p.name)));
  if (exists) return;
  await t.insert(schema.project).values({
    workspaceId,
    createdBy: userId,
    ownerId: userId,
    name: p.name,
    status: p.status,
    kind: p.kind,
    goal: p.goal,
    nextAction: p.nextAction,
    spaceId: p.spaceId,
    clientId: p.clientId ?? null,
    priority: p.status === "in_progress" ? 2 : 3,
  });
}
