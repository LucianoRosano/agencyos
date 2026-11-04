import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { buildIcs, escapeText, foldLine } from "@agencyos/modules/calendar/ical";
import { getCalendarItems } from "@agencyos/modules/calendar/queries";
import { getIcalStatus, icalFeed, resolveIcalToken, revokeIcalToken, rotateIcalToken } from "@agencyos/modules/calendar/service";
import { addDeliverable, addPhase, createProject } from "@agencyos/modules/projects/service";
import { createAssessment, createCourse } from "@agencyos/modules/study/service";
import { createTask, setTaskStatus } from "@agencyos/modules/tasks/service";
import { createReminder } from "@agencyos/modules/today/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

type WS = Awaited<ReturnType<typeof makeWorkspace>>;

/** Carga una fila de cada fuente con fecha `d` (las de módulos sin service propio, directo en la base). */
async function seedAllSources(ctx: WS, d: string) {
  const db = getDb();
  const base = { workspaceId: ctx.workspaceId, createdBy: ctx.userId };
  await createTask(ctx, { title: "Tarea con fecha", dueDate: d, dueTime: "10:30" });
  const done = await createTask(ctx, { title: "Tarea hecha", dueDate: d });
  await setTaskStatus(ctx, done.id, "done");
  const p = await createProject(ctx, { name: "Proyecto calendario" });
  await addPhase(ctx, p.id, { name: "Diseño", dueDate: d });
  await addDeliverable(ctx, p.id, { title: "Maqueta", dueDate: d });
  const c = await createCourse(ctx, { name: "Int. a la Programación" });
  await createAssessment(ctx, c.id, { kind: "parcial", title: "Parcial 1", date: d, time: "18:00" });
  const [client] = await db
    .insert(schema.client)
    .values({ ...base, name: "Cliente Cal" })
    .returning();
  const ledger = ctx.ledgers[0];
  if (!client || !ledger) throw new Error("seed");
  await db.insert(schema.receivable).values({ ...base, clientId: client.id, concept: "Anticipo", amount: "1000.00", currency: "ARS", dueDate: d });
  await db
    .insert(schema.payable)
    .values({ ...base, ledgerId: ledger.id, counterpart: "Hostinger", concept: "VPS", amount: "15.00", currency: "USD", dueDate: d });
  await db.insert(schema.subscription).values({ ...base, ledgerId: ledger.id, vendor: "Claude Pro", amount: "20.00", currency: "USD", nextDue: d });
  await createReminder(ctx, { title: "Renovar dominio", kind: "domain", dueDate: d });
  await db.insert(schema.opportunity).values({ ...base, clientId: client.id, title: "Web nueva", nextAction: "Llamar", nextActionDue: d });
  await db
    .insert(schema.interaction)
    .values({ ...base, clientId: client.id, kind: "call", occurredAt: new Date(), summaryMd: "Charla", nextStep: "Mandar propuesta", nextStepDue: d });
  return { project: p, course: c, client };
}

describe("calendario", () => {
  it("agrega todas las fuentes con fecha en el rango (y solo las abiertas)", async () => {
    const ctx = await makeWorkspace();
    const d = addDays(todayAR(), 5);
    await seedAllSources(ctx, d);
    const items = await getCalendarItems(ctx, { from: todayAR(), to: addDays(todayAR(), 10) });
    const sources = new Set(items.map((i) => i.source));
    expect([...sources].sort()).toEqual(["assessment", "crm", "deliverable", "payable", "phase", "receivable", "reminder", "subscription", "task"]);
    expect(items.filter((i) => i.source === "crm").length).toBe(2);
    expect(items.find((i) => i.title === "Tarea hecha")).toBeUndefined();
    const task = items.find((i) => i.source === "task");
    expect(task?.time).toBe("10:30");
    expect(task?.href).toMatch(/^\/tareas\//);
    expect(items.find((i) => i.source === "assessment")?.href).toMatch(/^\/facultad\//);
    expect(items.find((i) => i.source === "payable")?.subtitle).toContain("US$");
    // fuera del rango
    expect(await getCalendarItems(ctx, { from: addDays(d, 1), to: addDays(d, 30) })).toEqual([]);
    // filtrar fuentes
    const only = await getCalendarItems(ctx, { from: d, to: d, sources: ["assessment", "reminder"] });
    expect(new Set(only.map((i) => i.source))).toEqual(new Set(["assessment", "reminder"]));
  });

  it("filtro de espacio: tareas de otro espacio no aparecen; el dinero sí", async () => {
    const ctx = await makeWorkspace();
    const d = addDays(todayAR(), 2);
    const study = ctx.spaces.find((s) => s.kind === "study");
    const agency = ctx.spaces.find((s) => s.kind === "agency");
    await createTask(ctx, { title: "En Facultad", dueDate: d, spaceId: study?.id });
    await createTask(ctx, { title: "En Agencia", dueDate: d, spaceId: agency?.id });
    await createReminder(ctx, { title: "Vence algo", dueDate: d });
    const items = await getCalendarItems(ctx, { from: d, to: d, spaceId: study?.id });
    expect(items.map((i) => i.title).sort()).toEqual(["En Facultad", "Vence algo"]);
  });

  it("aislamiento multi-inquilino: A no ve fechas de B", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const d = addDays(todayAR(), 3);
    await seedAllSources(b, d);
    expect(await getCalendarItems(a, { from: todayAR(), to: addDays(todayAR(), 30) })).toEqual([]);
  });

  it("iCal: token válido devuelve VCALENDAR; inválido, rotado o revocado no", async () => {
    const ctx = await makeWorkspace();
    const d = addDays(todayAR(), 4);
    await seedAllSources(ctx, d);
    expect((await getIcalStatus(ctx)).active).toBe(false);
    const { token } = await rotateIcalToken(ctx);
    expect(token.length).toBeGreaterThanOrEqual(40);
    // se guarda hasheado, nunca en claro
    const [pref] = await getDb()
      .select()
      .from(schema.userPreference)
      .where(and(eq(schema.userPreference.userId, ctx.userId ?? ""), eq(schema.userPreference.key, "ical_token")));
    const v = pref?.value as { hash: string; createdAt: string };
    expect(v.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(pref?.value)).not.toContain(token);
    expect((await getIcalStatus(ctx)).active).toBe(true);

    const ics = await icalFeed(token, { baseUrl: "https://agencyos.test" });
    expect(ics).not.toBeNull();
    expect(ics?.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics?.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics?.match(/BEGIN:VEVENT/g)?.length).toBe(10);
    expect(ics).toContain(`DTSTART;TZID=America/Buenos_Aires:${d.replaceAll("-", "")}T180000`);
    expect(ics).toContain(`DTSTART;VALUE=DATE:${d.replaceAll("-", "")}`);
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toMatch(/UID:assessment-[0-9a-f-]{36}@agencyos/);
    // UID estable entre generaciones
    const uids = (s: string | null) => (s?.match(/UID:[^\r]+/g) ?? []).sort();
    expect(uids(await icalFeed(token))).toEqual(uids(ics));

    expect(await icalFeed("token-inventado-que-no-existe-1234567890")).toBeNull();
    expect(await resolveIcalToken("corto")).toBeNull();

    // rotar invalida el anterior
    const { token: t2 } = await rotateIcalToken(ctx);
    expect(await icalFeed(token)).toBeNull();
    expect(await icalFeed(t2)).not.toBeNull();

    await revokeIcalToken(ctx);
    expect(await icalFeed(t2)).toBeNull();
    expect((await getIcalStatus(ctx)).active).toBe(false);
  });

  it("iCal: cada token resuelve SU workspace (aislamiento)", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    await createTask(a, { title: "Solo de A", dueDate: addDays(todayAR(), 1) });
    await createTask(b, { title: "Solo de B", dueDate: addDays(todayAR(), 1) });
    const { token: ta } = await rotateIcalToken(a);
    const { token: tb } = await rotateIcalToken(b);
    const ia = await icalFeed(ta);
    const ib = await icalFeed(tb);
    expect(ia).toContain("Solo de A");
    expect(ia).not.toContain("Solo de B");
    expect(ib).toContain("Solo de B");
    expect(ib).not.toContain("Solo de A");
  });

  it("iCal: escape y plegado según RFC 5545", () => {
    expect(escapeText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
    const long = `SUMMARY:${"á".repeat(80)}`;
    const folded = foldLine(long);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .map((l, i) => (i === 0 ? l : l.slice(1)))
        .join(""),
    ).toBe(long);
    const ics = buildIcs(
      [{ key: "task-1", source: "task", date: "2030-01-01", time: "23:30", title: "Tarde", subtitle: null, href: "/tareas/1", color: "#fff" }],
      { now: new Date("2030-01-01T00:00:00Z") },
    );
    expect(ics).toContain("DTEND;TZID=America/Buenos_Aires:20300102T003000");
    expect(ics).toContain("DTSTAMP:20300101T000000Z");
  });
});
