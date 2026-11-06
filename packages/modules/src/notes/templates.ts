import { assertCan, type Ctx, formatDate, notFound, todayAR, validation, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";
import { createNote, noteInput } from "./service";

/** Plantillas de notas (note_template). Variables: {{fecha}}, {{titulo}}, {{cliente}}. */

export const TEMPLATE_VARIABLES = ["fecha", "titulo", "cliente"] as const;

/** Estructura inicial (no son datos de ejemplo): se siembra una sola vez por workspace. */
export const DEFAULT_NOTE_TEMPLATES: { name: string; bodyMd: string }[] = [
  {
    name: "Reunión con cliente",
    bodyMd: `**Fecha:** {{fecha}} · **Cliente:** {{cliente}}

## Participantes
-

## Temas
-

## Decisiones
-

## Próximos pasos
- [ ]
`,
  },
  {
    name: "Briefing rápido",
    bodyMd: `**Cliente:** {{cliente}} · **Fecha:** {{fecha}}

## Objetivo
¿Qué tiene que lograr {{titulo}}?

## Público
-

## Entregables
-

## Referencias
-

## Plazos y presupuesto
-

## Preguntas abiertas
-
`,
  },
  {
    name: "Post-mortem de proyecto",
    bodyMd: `**Proyecto:** {{titulo}} · **Cliente:** {{cliente}} · **Fecha:** {{fecha}}

## Resumen
-

## Qué salió bien
-

## Qué salió mal
-

## Qué aprendimos
-

## Acciones para el próximo
- [ ]
`,
  },
  {
    name: "Idea",
    bodyMd: `**Fecha:** {{fecha}}

## La idea
{{titulo}}:

## Por qué vale la pena
-

## Próximo paso
- [ ]

## Relacionado
- [[ ]]
`,
  },
];

export const noteTemplateInput = z.object({
  name: zRequired(120, "El nombre"),
  bodyMd: z.string().max(100_000, "La plantilla es demasiado larga").default(""),
});

type SeedFlag = { noteTemplatesSeeded?: boolean };

/** Siembra las 4 plantillas la primera vez (marca en workspace.settings para no re-sembrar si se borran). */
export async function ensureNoteTemplates(ctx: Ctx) {
  const [ws] = await getDb().select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
  if ((ws?.settings as SeedFlag | undefined)?.noteTemplatesSeeded) return false;
  return getDb().transaction(async (t) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`note_template:${ctx.workspaceId}`}))`);
    const [w] = await t.select().from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
    if (!w || (w.settings as SeedFlag).noteTemplatesSeeded) return false;
    const [{ n } = { n: 0 }] = await t
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.noteTemplate)
      .where(eq(schema.noteTemplate.workspaceId, ctx.workspaceId));
    if (!n)
      await t
        .insert(schema.noteTemplate)
        .values(DEFAULT_NOTE_TEMPLATES.map((d) => ({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, name: d.name, bodyMd: d.bodyMd })));
    await t
      .update(schema.workspace)
      .set({ settings: { ...w.settings, noteTemplatesSeeded: true } as typeof w.settings })
      .where(eq(schema.workspace.id, ctx.workspaceId));
    return true;
  });
}

export async function listNoteTemplates(ctx: Ctx) {
  return getDb().select().from(schema.noteTemplate).where(scoped(schema.noteTemplate, ctx)).orderBy(asc(schema.noteTemplate.name));
}

async function getTemplate(t: Tx | ReturnType<typeof getDb>, ctx: Ctx, id: string) {
  const [row] = await t
    .select()
    .from(schema.noteTemplate)
    .where(and(eq(schema.noteTemplate.id, id), scoped(schema.noteTemplate, ctx)));
  if (!row) throw notFound("La plantilla");
  return row;
}

export async function getNoteTemplate(ctx: Ctx, id: string) {
  const [row] = await getDb()
    .select()
    .from(schema.noteTemplate)
    .where(and(eq(schema.noteTemplate.id, id), scoped(schema.noteTemplate, ctx)));
  return row ?? null;
}

export async function createNoteTemplate(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "note");
  const input = noteTemplateInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.noteTemplate)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, name: input.name, bodyMd: input.bodyMd })
      .returning();
    if (!row) throw new Error("No se pudo crear la plantilla");
    await recordEvent(t, ctx, {
      type: "nota.plantilla_creada",
      entityType: "note_template",
      entityId: row.id,
      summary: `Creó la plantilla de nota «${row.name}»`,
    });
    return row;
  });
}

export async function updateNoteTemplate(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "note");
  const input = noteTemplateInput.parse(raw);
  return getDb().transaction(async (t) => {
    await getTemplate(t, ctx, id);
    const [row] = await t.update(schema.noteTemplate).set({ name: input.name, bodyMd: input.bodyMd }).where(eq(schema.noteTemplate.id, id)).returning();
    if (!row) throw notFound("La plantilla");
    await recordEvent(t, ctx, {
      type: "nota.plantilla_editada",
      entityType: "note_template",
      entityId: id,
      summary: `Editó la plantilla de nota «${row.name}»`,
    });
    return row;
  });
}

/** Reemplaza {{fecha}}, {{titulo}} y {{cliente}} (con o sin espacios dentro de las llaves). Otras variables quedan tal cual. */
export function applyTemplate(body: string, vars: { fecha: string; titulo: string; cliente: string }) {
  return body.replace(/\{\{\s*(fecha|titulo|título|cliente)\s*\}\}/gi, (_m, k: string) => {
    const key = k.toLowerCase().replace("í", "i") as keyof typeof vars;
    return vars[key] ?? "";
  });
}

/** Cliente para {{cliente}}: la entidad vinculada si es cliente, o el cliente del proyecto vinculado. */
async function clientNameFor(ctx: Ctx, entityType?: string, entityId?: string) {
  if (!entityType || !entityId) return "";
  const db = getDb();
  if (entityType === "client") {
    const [c] = await db
      .select({ name: schema.client.name })
      .from(schema.client)
      .where(and(eq(schema.client.id, entityId), scoped(schema.client, ctx, { withArchived: true })));
    return c?.name ?? "";
  }
  if (entityType === "project") {
    const [p] = await db
      .select({ name: schema.client.name })
      .from(schema.project)
      .innerJoin(schema.client, eq(schema.client.id, schema.project.clientId))
      .where(and(eq(schema.project.id, entityId), scoped(schema.project, ctx, { withArchived: true })));
    return p?.name ?? "";
  }
  return "";
}

/** Crea una nota a partir de una plantilla (mismas reglas que crear una nota: título único, entidad del workspace). */
export async function createNoteFromTemplate(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "note");
  const { templateId, ...rest } = z
    .object({ templateId: z.string({ error: "Elegí una plantilla" }).uuid("Elegí una plantilla") })
    .passthrough()
    .parse(raw);
  const base = noteInput.parse(rest);
  const tpl = await getNoteTemplate(ctx, templateId);
  if (!tpl) throw validation("La plantilla no existe", { templateId: "Elegí una plantilla" });
  const cliente = await clientNameFor(ctx, base.entityType, base.entityId);
  const bodyMd = applyTemplate(tpl.bodyMd, { fecha: formatDate(todayAR()), titulo: base.title, cliente });
  return createNote(ctx, { ...rest, bodyMd });
}
