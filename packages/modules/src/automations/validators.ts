import { z } from "zod";
import { MAX_ACTIONS, MAX_CONDITIONS, SCHEDULE_SOURCES } from "./catalog";

const text = (max: number, what: string) => z.string({ error: `${what} es obligatorio` }).trim().min(1, `${what} es obligatorio`).max(max, `Máximo ${max} caracteres`);
const optText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`).optional();

export const conditionZ = z.object({
  field: z
    .string()
    .trim()
    .regex(/^[a-z_]+(\.[a-z0-9_]+){0,3}$/, "Elegí un campo"),
  op: z.enum(["eq", "neq", "contains", "gt", "lt", "exists"]),
  value: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

export const TASK_STATUS_VALUES = ["todo", "doing", "waiting", "done", "cancelled"] as const;
export const PROJECT_STATUS_VALUES = ["idea", "planning", "in_progress", "paused", "blocked", "done"] as const;

export const actionZ = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    params: z.object({
      title: text(300, "El título"),
      description: optText(5000),
      priority: z.coerce.number().int().min(1).max(4).default(3),
      dueInDays: z.coerce.number().int().min(0, "Mínimo 0").max(365, "Máximo 365").optional(),
      project: z.enum(["none", "event"]).default("event"),
    }),
  }),
  z.object({
    type: z.literal("notify"),
    params: z.object({ title: text(200, "El título"), body: optText(2000) }),
  }),
  z.object({
    type: z.literal("send_email"),
    params: z
      .object({
        to: z.enum(["owner", "client"]),
        subject: text(200, "El asunto"),
        body: text(10000, "El texto"),
        automatic: z.boolean().default(false),
        confirmAutomatic: z.boolean().optional(),
      })
      .refine((p) => p.to !== "client" || !p.automatic || p.confirmAutomatic === true, {
        message: "Confirmá que el email al cliente se envía sin revisión",
        path: ["confirmAutomatic"],
      })
      .transform(({ confirmAutomatic: _c, ...p }) => ({ ...p, automatic: p.to === "client" ? p.automatic : false })),
  }),
  z.object({
    type: z.literal("set_status"),
    params: z
      .object({ target: z.enum(["task", "project"]), status: z.string() })
      .refine((p) => (p.target === "task" ? (TASK_STATUS_VALUES as readonly string[]) : (PROJECT_STATUS_VALUES as readonly string[])).includes(p.status), {
        message: "Estado inválido",
        path: ["status"],
      }),
  }),
  z.object({
    type: z.literal("webhook"),
    params: z.object({ endpointId: z.string().uuid("Elegí un webhook saliente") }),
  }),
  z.object({
    type: z.literal("wait"),
    params: z.object({ days: z.coerce.number().int().min(1, "Mínimo 1 día").max(90, "Máximo 90 días") }),
  }),
]);
export type ActionInput = z.input<typeof actionZ>;
export type ActionParsed = z.output<typeof actionZ>;

export const scheduleZ = z.object({
  preset: z.enum(["daily", "weekdays", "weekly", "monthly", "hourly"]),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Hora inválida")
    .default("09:00"),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  monthDay: z.coerce.number().int().min(1, "Entre 1 y 28").max(28, "Entre 1 y 28").optional(),
});

export const sourceZ = z.object({
  kind: z.string().refine((k) => k in SCHEDULE_SOURCES, "Fuente inválida"),
  days: z.coerce.number().int().min(0).max(365).optional(),
});

export const ruleInput = z
  .object({
    name: text(120, "El nombre"),
    triggerKind: z.enum(["event", "schedule"]),
    eventType: z
      .string()
      .regex(/^[a-z_]+\.[a-z_]+$/, "Elegí un evento")
      .optional(),
    schedule: scheduleZ.optional(),
    source: sourceZ.optional(),
    conditions: z.object({ match: z.enum(["all", "any"]).default("all"), items: z.array(conditionZ).max(MAX_CONDITIONS, `Máximo ${MAX_CONDITIONS} condiciones`) }),
    actions: z.array(actionZ).min(1, "Agregá al menos una acción").max(MAX_ACTIONS, `Máximo ${MAX_ACTIONS} acciones por regla`),
    testMode: z.boolean().optional(),
    templateKey: z.string().max(80).optional(),
  })
  .superRefine((r, c) => {
    if (r.triggerKind === "event" && !r.eventType) c.addIssue({ code: "custom", message: "Elegí el evento que dispara la regla", path: ["eventType"] });
    if (r.triggerKind === "schedule" && !r.schedule) c.addIssue({ code: "custom", message: "Elegí cuándo corre", path: ["schedule"] });
    if (r.triggerKind === "schedule" && r.schedule?.preset === "weekly" && r.schedule.weekday === undefined)
      c.addIssue({ code: "custom", message: "Elegí el día", path: ["schedule", "weekday"] });
    if (r.triggerKind === "schedule" && r.schedule?.preset === "monthly" && r.schedule.monthDay === undefined)
      c.addIssue({ code: "custom", message: "Elegí el día del mes", path: ["schedule", "monthDay"] });
    r.conditions.items.forEach((it, i) => {
      if (it.op !== "exists" && !it.value) c.addIssue({ code: "custom", message: "Completá el valor", path: ["conditions", "items", i, "value"] });
    });
  });

export type RuleInput = z.input<typeof ruleInput>;
export type RuleParsed = z.output<typeof ruleInput>;
