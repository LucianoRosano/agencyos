import { assertCan, type Ctx, DomainError, L, label } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { capture } from "../inbox/service";
import { getProject, listProjects } from "../projects/queries";
import { addDecision } from "../projects/service";
import { getRepo, listRepos } from "../repos/queries";
import { generatePlan } from "../repos/service";
import { globalSearch } from "../search/service";
import { getDb, scoped } from "../shared/db";
import { listTasks } from "../tasks/queries";
import { createTask, setTaskStatus, updateTask } from "../tasks/service";
import { getToday, moneySummary } from "../today/queries";
import { moveToTrash } from "../trash/service";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (data: unknown): ToolResult => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });

/**
 * Servidor MCP de AGENCYOS (docs/14 §3). Cada herramienta llama a los mismos services que la UI,
 * con el contexto de máquina del token (alcances). Toda llamada queda en audit_log; las denegadas también.
 */
export function buildMcpServer(ctx: Ctx) {
  const server = new McpServer(
    { name: "agencyos", version: "1.0.0" },
    {
      instructions:
        "AGENCYOS es el sistema operativo de la agencia de Luciano Rosano. Usá ver_hoy para saber qué hay que hacer. Las escrituras fuera de tus alcances se piden con proponer_cambio (crea una aprobación).",
    },
  );

  const wrap =
    <A>(tool: string, fn: (args: A) => Promise<unknown>) =>
    async (args: A): Promise<ToolResult> => {
      try {
        const out = await fn(args);
        await audit(getDb(), ctx, { action: "mcp.tool", targetType: "tool", targetId: tool, after: { ok: true } });
        return text(out);
      } catch (e) {
        const denied = e instanceof DomainError && e.code === "FORBIDDEN";
        const message = e instanceof DomainError ? e.message : "error interno";
        if (!(e instanceof DomainError)) console.error("[mcp]", tool, e);
        await audit(getDb(), ctx, {
          action: denied ? "mcp.denied" : "mcp.error",
          targetType: "tool",
          targetId: tool,
          after: { code: e instanceof DomainError ? e.code : "INTERNAL", message },
        });
        const msg = e instanceof DomainError ? e.message : "Error interno al ejecutar la herramienta.";
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    };

  server.registerTool(
    "buscar",
    {
      title: "Buscar",
      description: "Búsqueda global (clientes, contactos, proyectos, tareas, oportunidades, presupuestos, notas, materias). Tolera tildes y errores leves.",
      inputSchema: { consulta: z.string().min(1), tipos: z.array(z.string()).optional() },
    },
    wrap("buscar", async ({ consulta, tipos }: { consulta: string; tipos?: string[] }) => {
      assertCan(ctx, "read", "project");
      return globalSearch(ctx, consulta, { types: tipos, limit: 30 });
    }),
  );

  server.registerTool(
    "ver_hoy",
    { title: "Ver Hoy", description: "Foco del día, Ponerse al día (vencidos y por vencer) y próximos 7 días.", inputSchema: {} },
    wrap("ver_hoy", async () => {
      assertCan(ctx, "read", "task");
      const d = await getToday(ctx, { userId: ctx.userId ?? "", now: new Date() });
      return {
        fecha: d.today,
        contadores: d.counts,
        foco: d.focus.map((f) => ({ tarea: f.task.title, id: f.task.id, sugerida: f.suggested, proyecto: f.task.projectName })),
        ponerse_al_dia: d.catchUp.map((c) => ({ tipo: c.kind, titulo: c.title, detalle: c.subtitle, id: c.entityId })),
        proximos_7_dias: d.agenda.map((a) => ({ fecha: a.date, hora: a.time, titulo: a.title, tipo: a.kind })),
      };
    }),
  );

  server.registerTool(
    "listar_proyectos",
    {
      title: "Listar proyectos",
      description: "Proyectos con filtros por estado y cliente.",
      inputSchema: {
        estado: z.enum(["idea", "planning", "in_progress", "paused", "blocked", "done", "archived"]).optional(),
        cliente_id: z.string().uuid().optional(),
        incluir_terminados: z.boolean().optional(),
      },
    },
    wrap("listar_proyectos", async ({ estado, cliente_id, incluir_terminados }: { estado?: string; cliente_id?: string; incluir_terminados?: boolean }) => {
      assertCan(ctx, "read", "project");
      const rows = await listProjects(ctx, { status: estado, clientId: cliente_id, includeDone: incluir_terminados });
      return rows.map(({ p, clientName, spaceName }) => ({
        id: p.id,
        nombre: p.name,
        estado: label(L.projectStatus, p.status),
        cliente: clientName,
        espacio: spaceName,
        avance: p.progress,
        siguiente_accion: p.nextAction,
        fecha_objetivo: p.targetDate,
      }));
    }),
  );

  server.registerTool(
    "ver_proyecto",
    {
      title: "Ver proyecto",
      description: "Proyecto completo: etapas, tareas, decisiones, bloqueos, entregas y changelog.",
      inputSchema: { id: z.string().uuid() },
    },
    wrap("ver_proyecto", async ({ id }: { id: string }) => {
      assertCan(ctx, "read", "project");
      const p = await getProject(ctx, id);
      if (!p) throw new DomainError("NOT_FOUND", "El proyecto no existe.");
      return {
        ...p.p,
        cliente: p.clientName,
        etapas: p.phases.map((x) => ({ id: x.id, nombre: x.name, estado: x.status, vence: x.dueDate })),
        tareas: p.tasks.map((t) => ({ id: t.id, titulo: t.title, estado: t.status, vence: t.dueDate, etapa: t.phaseId, prioridad: t.priority })),
        decisiones: p.decisions,
        bloqueos: p.blockers.filter((b) => !b.resolvedAt),
        entregas: p.deliverables,
        changelog: p.changelog.slice(0, 20),
      };
    }),
  );

  server.registerTool(
    "listar_tareas",
    {
      title: "Listar tareas",
      description: "Tareas por vista: hoy, proximas, sin-fecha, todas (abiertas), completadas.",
      inputSchema: { vista: z.enum(["hoy", "proximas", "sin-fecha", "todas", "completadas"]).default("hoy"), proyecto_id: z.string().uuid().optional() },
    },
    wrap("listar_tareas", async ({ vista, proyecto_id }: { vista: "hoy" | "proximas" | "sin-fecha" | "todas" | "completadas"; proyecto_id?: string }) => {
      assertCan(ctx, "read", "task");
      const rows = await listTasks(ctx, { view: vista, projectId: proyecto_id, limit: 100 });
      return rows.map((r) => ({ id: r.t.id, titulo: r.t.title, estado: r.t.status, vence: r.t.dueDate, prioridad: r.t.priority, proyecto: r.projectName }));
    }),
  );

  server.registerTool(
    "ver_cliente",
    {
      title: "Ver cliente",
      description: "Ficha del cliente (sin datos fiscales): contactos, proyectos, oportunidades e interacciones recientes.",
      inputSchema: { id: z.string().uuid() },
    },
    wrap("ver_cliente", async ({ id }: { id: string }) => {
      assertCan(ctx, "read", "crm");
      const db = getDb();
      const [c] = await db
        .select()
        .from(schema.client)
        .where(and(eq(schema.client.id, id), scoped(schema.client, ctx, { withArchived: true })));
      if (!c) throw new DomainError("NOT_FOUND", "El cliente no existe.");
      const [contacts, projects, opps, inter] = await Promise.all([
        db
          .select({ nombre: schema.contact.name, rol: schema.contact.role, email: schema.contact.email, telefono: schema.contact.phone })
          .from(schema.clientContact)
          .innerJoin(schema.contact, eq(schema.contact.id, schema.clientContact.contactId))
          .where(and(eq(schema.clientContact.clientId, id), eq(schema.clientContact.workspaceId, ctx.workspaceId))),
        db
          .select({ id: schema.project.id, nombre: schema.project.name, estado: schema.project.status, siguiente_accion: schema.project.nextAction })
          .from(schema.project)
          .where(and(eq(schema.project.clientId, id), scoped(schema.project, ctx))),
        db
          .select({
            id: schema.opportunity.id,
            titulo: schema.opportunity.title,
            etapa: schema.opportunity.stage,
            proxima_accion: schema.opportunity.nextAction,
          })
          .from(schema.opportunity)
          .where(and(eq(schema.opportunity.clientId, id), scoped(schema.opportunity, ctx))),
        db
          .select({ tipo: schema.interaction.kind, fecha: schema.interaction.occurredAt, resumen: schema.interaction.summaryMd })
          .from(schema.interaction)
          .where(and(eq(schema.interaction.clientId, id), scoped(schema.interaction, ctx)))
          .orderBy(desc(schema.interaction.occurredAt))
          .limit(10),
      ]);
      return {
        id: c.id,
        nombre: c.name,
        nombre_comercial: c.tradeName,
        rubro: c.industry,
        estado: label(L.clientStatus, c.status),
        relacion: label(L.relationship, c.relationship),
        sitio: c.website,
        notas: c.notesMd,
        contactos: contacts,
        proyectos: projects,
        oportunidades: opps,
        interacciones: inter,
      };
    }),
  );

  server.registerTool(
    "ver_finanzas_resumen",
    {
      title: "Resumen de finanzas",
      description: "Ingresos y gastos del mes, por cobrar, por pagar (por moneda, sin conversiones inventadas).",
      inputSchema: {},
    },
    wrap("ver_finanzas_resumen", async () => {
      assertCan(ctx, "read", "finance");
      return moneySummary(ctx);
    }),
  );

  server.registerTool(
    "capturar",
    {
      title: "Capturar en la Bandeja",
      description: "Guarda texto libre en la Bandeja para procesarlo después.",
      inputSchema: { texto: z.string().min(1).max(2000), tipo: z.enum(["task", "note", "idea", "expense", "link"]).optional() },
    },
    wrap("capturar", async ({ texto, tipo }: { texto: string; tipo?: string }) => {
      const r = await capture(ctx, { text: texto, suggestedType: tipo }, "mcp");
      return { ok: true, id: r.id };
    }),
  );

  server.registerTool(
    "crear_tarea",
    {
      title: "Crear tarea",
      description: "Crea una tarea en un proyecto o espacio. Fechas en formato AAAA-MM-DD.",
      inputSchema: {
        titulo: z.string().min(1).max(300),
        proyecto_id: z.string().uuid().optional(),
        fecha: z.string().optional(),
        prioridad: z.number().int().min(1).max(4).optional(),
        descripcion: z.string().optional(),
      },
    },
    wrap("crear_tarea", async (a: { titulo: string; proyecto_id?: string; fecha?: string; prioridad?: number; descripcion?: string }) => {
      const t = await createTask(ctx, {
        title: a.titulo,
        projectId: a.proyecto_id,
        dueDate: a.fecha,
        priority: a.prioridad ?? 3,
        descriptionMd: a.descripcion,
      });
      return { ok: true, id: t.id, titulo: t.title, vence: t.dueDate };
    }),
  );

  server.registerTool(
    "actualizar_tarea",
    {
      title: "Actualizar tarea",
      description: "Cambia título, fecha, prioridad o estado (todo, doing, waiting, done, cancelled).",
      inputSchema: {
        id: z.string().uuid(),
        titulo: z.string().optional(),
        fecha: z.string().optional(),
        prioridad: z.number().int().min(1).max(4).optional(),
        estado: z.enum(["todo", "doing", "waiting", "done", "cancelled"]).optional(),
      },
    },
    wrap(
      "actualizar_tarea",
      async (a: { id: string; titulo?: string; fecha?: string; prioridad?: number; estado?: "todo" | "doing" | "waiting" | "done" | "cancelled" }) => {
        if (a.titulo || a.fecha || a.prioridad)
          await updateTask(ctx, a.id, {
            ...(a.titulo ? { title: a.titulo } : {}),
            ...(a.fecha ? { dueDate: a.fecha } : {}),
            ...(a.prioridad ? { priority: a.prioridad } : {}),
          });
        if (a.estado) await setTaskStatus(ctx, a.id, a.estado);
        return { ok: true };
      },
    ),
  );

  server.registerTool(
    "registrar_decision",
    {
      title: "Registrar decisión",
      description: "Registra una decisión (qué y por qué) en un proyecto.",
      inputSchema: { proyecto_id: z.string().uuid(), decision: z.string().min(1).max(200), motivo: z.string().optional() },
    },
    wrap("registrar_decision", async (a: { proyecto_id: string; decision: string; motivo?: string }) => {
      assertCan(ctx, "update", "project");
      const d = await addDecision(ctx, a.proyecto_id, { title: a.decision, rationaleMd: a.motivo, approvedBy: "Claude (MCP)" });
      return { ok: true, id: d?.id };
    }),
  );

  server.registerTool(
    "crear_nota_proyecto",
    {
      title: "Crear nota de proyecto",
      description: "Crea una nota Markdown vinculada a un proyecto.",
      inputSchema: { proyecto_id: z.string().uuid(), titulo: z.string().min(1).max(160), contenido: z.string().max(50000) },
    },
    wrap("crear_nota_proyecto", async (a: { proyecto_id: string; titulo: string; contenido: string }) => {
      assertCan(ctx, "create", "note");
      const db = getDb();
      const [p] = await db
        .select({ id: schema.project.id, spaceId: schema.project.spaceId })
        .from(schema.project)
        .where(and(eq(schema.project.id, a.proyecto_id), scoped(schema.project, ctx)));
      if (!p) throw new DomainError("NOT_FOUND", "El proyecto no existe.");
      const { createNoteInTx } = await import("../notes/service");
      return db.transaction(async (t) => {
        const n = await createNoteInTx(t, ctx, { title: a.titulo, bodyMd: a.contenido, spaceId: p.spaceId, entityType: "project", entityId: p.id });
        return { ok: true, id: n.id, titulo: n.title };
      });
    }),
  );

  server.registerTool(
    "registrar_interaccion",
    {
      title: "Registrar interacción (CRM)",
      description: "Registra una conversación con un cliente. Requiere el alcance write:crm.",
      inputSchema: {
        cliente_id: z.string().uuid(),
        tipo: z.enum(["whatsapp", "call", "email", "meeting", "message", "note"]),
        resumen: z.string().min(1),
        proximo_paso: z.string().optional(),
        fecha_proximo_paso: z.string().optional(),
      },
    },
    wrap("registrar_interaccion", async (a: { cliente_id: string; tipo: string; resumen: string; proximo_paso?: string; fecha_proximo_paso?: string }) => {
      assertCan(ctx, "create", "crm");
      const db = getDb();
      const [c] = await db
        .select({ id: schema.client.id })
        .from(schema.client)
        .where(and(eq(schema.client.id, a.cliente_id), scoped(schema.client, ctx)));
      if (!c) throw new DomainError("NOT_FOUND", "El cliente no existe.");
      return db.transaction(async (t) => {
        const [i] = await t
          .insert(schema.interaction)
          .values({
            workspaceId: ctx.workspaceId,
            createdBy: ctx.userId,
            clientId: c.id,
            kind: a.tipo,
            occurredAt: new Date(),
            summaryMd: a.resumen,
            nextStep: a.proximo_paso,
            nextStepDue: a.fecha_proximo_paso,
          })
          .returning();
        await t.update(schema.client).set({ lastActivityAt: new Date() }).where(eq(schema.client.id, c.id));
        await recordEvent(t, ctx, {
          type: "interaccion.registrada",
          entityType: "client",
          entityId: c.id,
          summary: `Claude registró una interacción (${label(L.interactionKind, a.tipo)})`,
        });
        return { ok: true, id: i?.id };
      });
    }),
  );

  server.registerTool(
    "eliminar_elemento",
    {
      title: "Eliminar elemento",
      description: "Manda un elemento a la papelera. Normalmente NO está permitido por MCP: usá proponer_cambio.",
      inputSchema: { tipo: z.string(), id: z.string().uuid() },
    },
    wrap("eliminar_elemento", async (a: { tipo: string; id: string }) => {
      await moveToTrash(ctx, a.tipo, a.id);
      return { ok: true };
    }),
  );

  server.registerTool(
    "listar_repositorios",
    {
      title: "Listar repositorios",
      description: "Repositorios de GitHub sincronizados, con alcance, puntaje de salud (0–100), vínculos y checks que no pasan.",
      inputSchema: {
        alcance: z.enum(["prod", "cli", "int", "tpl", "per", "edu"]).optional(),
        solo_desvios: z.boolean().optional(),
      },
    },
    wrap("listar_repositorios", async ({ alcance, solo_desvios }: { alcance?: string; solo_desvios?: boolean }) => {
      assertCan(ctx, "read", "project");
      const rows = await listRepos(ctx, { scope: alcance, band: solo_desvios ? "red" : undefined });
      return Promise.all(
        rows.map(async ({ r, clientName, projectName }) => {
          const d = await getRepo(ctx, r.id);
          return {
            id: r.id,
            nombre: r.fullName,
            alcance: r.scope,
            salud: r.healthScore,
            archivado: r.archived,
            cliente: clientName,
            proyecto: projectName,
            desvios: (d?.checks ?? [])
              .filter((c) => c.status === "fail" || c.status === "warn")
              .map((c) => ({ check: c.checkKey, estado: c.status, detalle: (c.details as { message?: string }).message })),
          };
        }),
      );
    }),
  );

  server.registerTool(
    "proponer_plan_repos",
    {
      title: "Proponer plan de repositorios",
      description:
        "Genera un plan determinístico (convención de nombres, topics, descripción, archivos estándar vía PR, seguridad, protección) para los repositorios indicados o para todos. Queda pendiente: solo Luciano lo aprueba en AGENCYOS.",
      inputSchema: { repositorios: z.array(z.string().uuid()).max(200).optional() },
    },
    wrap("proponer_plan_repos", async ({ repositorios }: { repositorios?: string[] }) => {
      const plan = await generatePlan(ctx, { repositoryIds: repositorios });
      return { ok: true, id: plan.id, nombre: plan.name, estado: "pendiente de aprobación", resumen: plan.summaryMd };
    }),
  );

  server.registerTool(
    "proponer_cambio",
    {
      title: "Proponer cambio",
      description:
        "Para cualquier cambio fuera de tus alcances (borrar, cambiar estados de clientes, dinero, mails a clientes…): crea una aprobación que Luciano revisa en AGENCYOS.",
      inputSchema: {
        titulo: z.string().min(1).max(200),
        detalle: z.string().min(1).max(10000),
        tipo_entidad: z.string().optional(),
        entidad_id: z.string().uuid().optional(),
      },
    },
    wrap("proponer_cambio", async (a: { titulo: string; detalle: string; tipo_entidad?: string; entidad_id?: string }) => {
      assertCan(ctx, "create", "approval");
      const db = getDb();
      return db.transaction(async (t) => {
        const [ap] = await t
          .insert(schema.approval)
          .values({
            workspaceId: ctx.workspaceId,
            createdBy: ctx.userId,
            kind: "mcp_proposal",
            requestedByType: "agent",
            requestedById: ctx.actor.id,
            title: a.titulo,
            entityType: a.tipo_entidad,
            entityId: a.entidad_id,
            proposal: { detalle: a.detalle },
          })
          .returning();
        await recordEvent(t, ctx, { type: "aprobacion.solicitada", entityType: "approval", entityId: ap?.id, summary: `Claude propone: ${a.titulo}` });
        return { ok: true, id: ap?.id, estado: "pendiente de aprobación" };
      });
    }),
  );

  return server;
}
