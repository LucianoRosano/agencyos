import {
  addDays,
  addMoney,
  adjustByPercent,
  assertCan,
  type Ctx,
  endOfMonth,
  formatMoney,
  monthName,
  notFound,
  startOfMonth,
  todayAR,
  validation,
  zCurrency,
  zInt,
  zOptDate,
  zOptText,
  zOptUuid,
  zPositiveMoney,
  zRequired,
} from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { getDb, schema, type Tx } from "@agencyos/db";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, scoped } from "../shared/db";

/**
 * Abonos mensuales (retainers). Cada abono genera un cobro por mes el día de facturación (worker diario), con el
 * concepto «Abono <mes> · <concepto>», y si incluye horas compara las registradas en el mes contra las incluidas.
 */
export const RETAINER_STATUSES = ["active", "paused", "cancelled"] as const;

export const retainerInput = z.object({
  clientId: z.string({ error: "Elegí el cliente" }).uuid("Elegí el cliente"),
  projectId: zOptUuid,
  concept: zRequired(160, "El concepto"),
  amount: zPositiveMoney,
  currency: zCurrency.default("ARS"),
  hoursIncluded: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : String(v).replace(",", ".")),
    z
      .string()
      .regex(/^\d{1,4}(\.\d{1,2})?$/, "Horas inválidas")
      .optional(),
  ),
  billingDay: zInt(1, 28).default(1),
  dueDays: zInt(0, 90).default(10),
  startDate: zOptDate,
  endDate: zOptDate,
  notesMd: zOptText(5000),
});

/** Próxima fecha de emisión ≥ `from` con el día de facturación dado. */
export function nextIssueOn(from: string, billingDay: number): string {
  const day = String(billingDay).padStart(2, "0");
  const thisMonth = `${from.slice(0, 7)}-${day}`;
  if (thisMonth >= from) return thisMonth;
  const next = addDays(endOfMonth(from), 1);
  return `${next.slice(0, 7)}-${day}`;
}

async function checkLinks(t: Tx, ctx: Ctx, clientId: string, projectId?: string) {
  await assertOwned(t, ctx, schema.client, clientId, "El cliente");
  if (!projectId) return;
  const [p] = await t
    .select({ clientId: schema.project.clientId })
    .from(schema.project)
    .where(and(eq(schema.project.id, projectId), eq(schema.project.workspaceId, ctx.workspaceId), isNull(schema.project.deletedAt)));
  if (!p) throw notFound("El proyecto");
  if (p.clientId && p.clientId !== clientId) throw validation("El proyecto es de otro cliente.");
}

export async function createRetainer(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = retainerInput.parse(raw);
  const start = input.startDate ?? todayAR();
  if (input.endDate && input.endDate < start) throw validation("La fecha de fin no puede ser anterior al inicio.");
  return getDb().transaction(async (t) => {
    await checkLinks(t, ctx, input.clientId, input.projectId);
    const [row] = await t
      .insert(schema.retainer)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        concept: input.concept,
        amount: input.amount,
        currency: input.currency,
        hoursIncluded: input.hoursIncluded ?? null,
        billingDay: input.billingDay,
        dueDays: input.dueDays,
        startDate: start,
        endDate: input.endDate ?? null,
        nextIssueDate: nextIssueOn(start, input.billingDay),
        notesMd: input.notesMd ?? null,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el abono");
    await recordEvent(t, ctx, {
      type: "abono.creado",
      entityType: "retainer",
      entityId: row.id,
      summary: `Creó el abono «${row.concept}» de ${formatMoney(row.amount, row.currency)} por mes`,
    });
    return row;
  });
}

async function getRow(t: Tx, ctx: Ctx, id: string) {
  const [r] = await t
    .select()
    .from(schema.retainer)
    .where(and(eq(schema.retainer.id, id), scoped(schema.retainer, ctx)))
    .for("update");
  if (!r) throw notFound("El abono");
  return r;
}

export async function updateRetainer(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "finance");
  const input = retainerInput.parse(raw);
  return getDb().transaction(async (t) => {
    const before = await getRow(t, ctx, id);
    await checkLinks(t, ctx, input.clientId, input.projectId);
    const start = input.startDate ?? before.startDate;
    if (input.endDate && input.endDate < start) throw validation("La fecha de fin no puede ser anterior al inicio.");
    // Si cambia el día de facturación, recalcular la próxima emisión desde la que estaba (nunca hacia atrás de hoy).
    const from = before.nextIssueDate > todayAR() ? startOfMonth(before.nextIssueDate) : todayAR();
    const nextIssueDate = input.billingDay !== before.billingDay ? nextIssueOn(from, input.billingDay) : before.nextIssueDate;
    const [row] = await t
      .update(schema.retainer)
      .set({
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        concept: input.concept,
        amount: input.amount,
        currency: input.currency,
        hoursIncluded: input.hoursIncluded ?? null,
        billingDay: input.billingDay,
        dueDays: input.dueDays,
        startDate: start,
        endDate: input.endDate ?? null,
        nextIssueDate,
        notesMd: input.notesMd ?? null,
      })
      .where(eq(schema.retainer.id, id))
      .returning();
    await recordEvent(t, ctx, { type: "abono.editado", entityType: "retainer", entityId: id, summary: `Editó el abono «${input.concept}»` });
    return row;
  });
}

export async function setRetainerStatus(ctx: Ctx, id: string, status: string) {
  assertCan(ctx, "update", "finance");
  const s = z.enum(RETAINER_STATUSES).parse(status);
  return getDb().transaction(async (t) => {
    const before = await getRow(t, ctx, id);
    // Al reanudar, la próxima emisión no puede quedar en el pasado (no se cobran los meses pausados).
    const nextIssueDate = s === "active" && before.nextIssueDate < todayAR() ? nextIssueOn(todayAR(), before.billingDay) : before.nextIssueDate;
    const [row] = await t.update(schema.retainer).set({ status: s, nextIssueDate }).where(eq(schema.retainer.id, id)).returning();
    const verb = { active: "Reanudó", paused: "Pausó", cancelled: "Dio de baja" }[s];
    await recordEvent(t, ctx, { type: `abono.${s}`, entityType: "retainer", entityId: id, summary: `${verb} el abono «${before.concept}»` });
    return row;
  });
}

/** Ajuste de montos (inflación): un porcentaje a los abonos activos y pausados de una moneda (o a los elegidos). */
export const adjustInput = z.object({
  percent: z.preprocess(
    (v) =>
      String(v ?? "")
        .trim()
        .replace(",", ".")
        .replace("%", ""),
    z
      .string()
      .regex(/^-?\d{1,3}(\.\d{1,2})?$/, "Porcentaje inválido")
      .refine((p) => Number(p) !== 0 && Number(p) > -50 && Number(p) <= 300, "Entre −50 % y 300 %, distinto de 0"),
  ),
  currency: zCurrency.default("ARS"),
  roundTo: z.coerce
    .number()
    .refine((n) => [1, 100, 1000].includes(n), "Redondeo inválido")
    .default(100),
  ids: z.array(z.string().uuid()).max(500).optional(),
});

export async function adjustRetainers(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "update", "finance");
  const input = adjustInput.parse(raw);
  return getDb().transaction(async (t) => {
    const rows = await t
      .select()
      .from(schema.retainer)
      .where(
        and(
          scoped(schema.retainer, ctx),
          inArray(schema.retainer.status, ["active", "paused"]),
          eq(schema.retainer.currency, input.currency),
          input.ids?.length ? inArray(schema.retainer.id, input.ids) : undefined,
        ),
      )
      .for("update");
    if (!rows.length) throw validation(`No hay abonos activos o pausados en ${input.currency} para ajustar.`);
    const changes: { id: string; concept: string; from: string; to: string }[] = [];
    for (const r of rows) {
      const to = adjustByPercent(r.amount, input.percent, input.roundTo);
      if (to === r.amount || Number(to) <= 0) continue;
      await t.update(schema.retainer).set({ amount: to }).where(eq(schema.retainer.id, r.id));
      changes.push({ id: r.id, concept: r.concept, from: r.amount, to });
    }
    await recordEvent(t, ctx, {
      type: "abono.ajustado",
      entityType: "retainer",
      entityId: changes[0]?.id,
      summary: `Ajustó ${changes.length} abono${changes.length === 1 ? "" : "s"} en ${input.currency} un ${input.percent.replace(".", ",")} %`,
      payload: { percent: input.percent, currency: input.currency, changes },
    });
    return { count: changes.length, changes };
  });
}

/** Deshacer un ajuste: vuelve cada abono a su monto anterior (solo si nadie lo cambió después). */
export async function revertRetainerAmounts(ctx: Ctx, changes: { id: string; from: string; to: string }[]) {
  assertCan(ctx, "update", "finance");
  const list = z
    .array(z.object({ id: z.string().uuid(), from: zPositiveMoney, to: zPositiveMoney }))
    .max(500)
    .parse(changes);
  return getDb().transaction(async (t) => {
    let n = 0;
    for (const c of list) {
      const res = await t
        .update(schema.retainer)
        .set({ amount: c.from })
        .where(and(eq(schema.retainer.id, c.id), scoped(schema.retainer, ctx), eq(schema.retainer.amount, c.to)))
        .returning({ id: schema.retainer.id });
      n += res.length;
    }
    await recordEvent(t, ctx, { type: "abono.ajuste_deshecho", entityType: "retainer", entityId: list[0]?.id, summary: `Deshizo el ajuste de ${n} abonos` });
    return { count: n };
  });
}

/**
 * Job diario (worker): emite los cobros vencidos de todos los workspaces. Idempotente: cada emisión avanza
 * `next_issue_date` en la misma transacción (FOR UPDATE SKIP LOCKED), así dos workers no duplican cobros.
 * Si el worker estuvo caído, se ponen al día como mucho 3 meses por abono.
 */
export async function issueDueRetainers(today = todayAR()) {
  const db = getDb();
  let issued = 0;
  for (let round = 0; round < 3; round++) {
    const n = await db.transaction(async (t) => {
      const due = await t
        .select()
        .from(schema.retainer)
        .where(and(eq(schema.retainer.status, "active"), lte(schema.retainer.nextIssueDate, today), isNull(schema.retainer.deletedAt)))
        .orderBy(asc(schema.retainer.nextIssueDate))
        .limit(500)
        .for("update", { skipLocked: true });
      let count = 0;
      for (const r of due) {
        if (r.endDate && r.nextIssueDate > r.endDate) {
          await t.update(schema.retainer).set({ status: "cancelled" }).where(eq(schema.retainer.id, r.id));
          continue;
        }
        const month = Number(r.nextIssueDate.slice(5, 7));
        const concept = `Abono ${monthName(month)} ${r.nextIssueDate.slice(0, 4)} · ${r.concept}`.slice(0, 200);
        const [rec] = await t
          .insert(schema.receivable)
          .values({
            workspaceId: r.workspaceId,
            createdBy: r.createdBy,
            clientId: r.clientId,
            projectId: r.projectId,
            concept,
            amount: r.amount,
            currency: r.currency,
            dueDate: addDays(r.nextIssueDate, r.dueDays),
          })
          .returning();
        await t
          .update(schema.retainer)
          .set({ nextIssueDate: nextIssueOn(addDays(r.nextIssueDate, 1), r.billingDay) })
          .where(eq(schema.retainer.id, r.id));
        const sys: Ctx = { workspaceId: r.workspaceId, userId: null, role: "owner", actor: { type: "system", id: null, name: "Abonos" } };
        await recordEvent(t, sys, {
          type: "abono.cobro_generado",
          entityType: "receivable",
          entityId: rec?.id,
          summary: `Generó el cobro «${concept}» por ${formatMoney(r.amount, r.currency)}`,
          payload: { retainerId: r.id },
        });
        count++;
      }
      return count;
    });
    issued += n;
    if (!n) break;
  }
  return issued;
}

// ---------- Lecturas ----------

export async function listRetainers(ctx: Ctx, f: { clientId?: string; month?: string } = {}) {
  assertCan(ctx, "read", "finance");
  const db = getDb();
  const rows = await db
    .select({ r: schema.retainer, clientName: schema.client.name, projectName: schema.project.name })
    .from(schema.retainer)
    .innerJoin(schema.client, eq(schema.client.id, schema.retainer.clientId))
    .leftJoin(schema.project, eq(schema.project.id, schema.retainer.projectId))
    .where(and(scoped(schema.retainer, ctx), f.clientId ? eq(schema.retainer.clientId, f.clientId) : undefined))
    .orderBy(sql`case ${schema.retainer.status} when 'active' then 0 when 'paused' then 1 else 2 end`, asc(schema.client.name));
  // Horas usadas en el mes (por proyecto si el abono tiene proyecto; si no, en todos los proyectos del cliente).
  const ref = f.month ?? todayAR();
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  const withHours = rows.filter((x) => x.r.hoursIncluded);
  const used = new Map<string, number>();
  if (withHours.length) {
    const projectIds = withHours.map((x) => x.r.projectId).filter((x): x is string => Boolean(x));
    const clientIds = withHours.filter((x) => !x.r.projectId).map((x) => x.r.clientId);
    if (projectIds.length) {
      const byProject = await db
        .select({ projectId: schema.timeEntry.projectId, minutes: sql<number>`sum(${schema.timeEntry.minutes})::int` })
        .from(schema.timeEntry)
        .where(and(scoped(schema.timeEntry, ctx), inArray(schema.timeEntry.projectId, projectIds), sql`${schema.timeEntry.date} between ${start} and ${end}`))
        .groupBy(schema.timeEntry.projectId);
      for (const r of byProject) used.set(`p:${r.projectId}`, r.minutes);
    }
    if (clientIds.length) {
      const { minutesByClient } = await import("../time/queries");
      for (const [cid, m] of await minutesByClient(ctx, clientIds, start, end)) used.set(`c:${cid}`, m);
    }
  }
  return rows.map((x) => ({
    ...x,
    minutesUsed: x.r.hoursIncluded ? (used.get(x.r.projectId ? `p:${x.r.projectId}` : `c:${x.r.clientId}`) ?? 0) : null,
  }));
}

/** Ingreso recurrente mensual (MRR) de abonos activos, por moneda. */
export async function retainerMrr(ctx: Ctx) {
  const rows = await getDb()
    .select({ amount: schema.retainer.amount, currency: schema.retainer.currency })
    .from(schema.retainer)
    .where(and(scoped(schema.retainer, ctx), eq(schema.retainer.status, "active")));
  const by = new Map<string, string>();
  for (const r of rows) by.set(r.currency, addMoney(by.get(r.currency) ?? "0", r.amount));
  return { count: rows.length, byCurrency: [...by].map(([currency, total]) => ({ currency, total })) };
}
