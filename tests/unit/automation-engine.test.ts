import {
  cronMatches,
  cronToPreset,
  describeCron,
  deterministicUuid,
  evaluateCondition,
  evaluateConditions,
  interpolate,
  isValidCron,
  lastMatchBetween,
  nextRuns,
  presetToCron,
  signWebhook,
  verifyWebhookSignature,
} from "@agencyos/modules/automations/engine";
import { ruleInput } from "@agencyos/modules/automations/validators";
import { describe, expect, it } from "vitest";

const data = {
  tarea: { titulo: "Revisar SEO", prioridad: 2, vence: "2026-11-01", estado: "todo" },
  proyecto: { nombre: "Tienda Bella", estado: "in_progress", progreso: 40 },
  cliente: { nombre: "Bellezatecnia", email: null },
  payload: { tags: ["web", "urgente"], to: "done" },
  dominio: { renovacion_automatica: false },
};

describe("condiciones", () => {
  it("operadores básicos, sin distinguir mayúsculas", () => {
    expect(evaluateCondition({ field: "proyecto.estado", op: "eq", value: "IN_PROGRESS" }, data)).toBe(true);
    expect(evaluateCondition({ field: "proyecto.estado", op: "neq", value: "done" }, data)).toBe(true);
    expect(evaluateCondition({ field: "cliente.nombre", op: "contains", value: "belleza" }, data)).toBe(true);
    expect(evaluateCondition({ field: "payload.tags", op: "contains", value: "urgente" }, data)).toBe(true);
    expect(evaluateCondition({ field: "cliente.email", op: "exists" }, data)).toBe(false);
    expect(evaluateCondition({ field: "no.existe", op: "eq", value: "x" }, data)).toBe(false);
    expect(evaluateCondition({ field: "dominio.renovacion_automatica", op: "eq", value: "false" }, data)).toBe(true);
  });
  it("números y fechas se comparan por orden", () => {
    expect(evaluateCondition({ field: "tarea.prioridad", op: "lt", value: "3" }, data)).toBe(true);
    expect(evaluateCondition({ field: "proyecto.progreso", op: "gt", value: "50" }, data)).toBe(false);
    expect(evaluateCondition({ field: "tarea.vence", op: "lt", value: "2026-11-05" }, data)).toBe(true);
    expect(evaluateCondition({ field: "tarea.vence", op: "gt", value: "texto" }, data)).toBe(false);
  });
  it("Y / O", () => {
    const items = [
      { field: "proyecto.estado", op: "eq" as const, value: "in_progress" },
      { field: "tarea.prioridad", op: "eq" as const, value: "1" },
    ];
    expect(evaluateConditions({ match: "all", items }, data).passed).toBe(false);
    expect(evaluateConditions({ match: "any", items }, data).passed).toBe(true);
    expect(evaluateConditions({ match: "all", items: [] }, data).passed).toBe(true);
    expect(evaluateConditions({ match: "all", items }, data).details.map((d) => d.passed)).toEqual([true, false]);
  });
});

describe("plantillas {{ }}", () => {
  it("interpola rutas, fechas en dd/mm/aaaa y deja vacío lo desconocido", () => {
    expect(interpolate("Kickoff {{ proyecto.nombre }} · {{cliente.nombre}}", data)).toBe("Kickoff Tienda Bella · Bellezatecnia");
    expect(interpolate("Vence el {{tarea.vence}}", data)).toBe("Vence el 01/11/2026");
    expect(interpolate("Hola {{cliente.inexistente}}!", data)).toBe("Hola !");
    expect(interpolate("{{payload.tags}}", data)).toBe("web, urgente");
    expect(interpolate("Sin variables", data)).toBe("Sin variables");
  });
  it("no ejecuta nada raro: solo rutas con letras, números, _ y .", () => {
    expect(interpolate("{{constructor.constructor('x')()}}", data)).toBe("{{constructor.constructor('x')()}}");
  });
});

describe("cron y presets (hora Argentina)", () => {
  it("presets → cron → descripción en español", () => {
    expect(presetToCron({ preset: "daily", time: "09:00" })).toBe("0 9 * * *");
    expect(presetToCron({ preset: "weekly", time: "09:00", weekday: 1 })).toBe("0 9 * * 1");
    expect(presetToCron({ preset: "monthly", time: "08:30", monthDay: 1 })).toBe("30 8 1 * *");
    expect(presetToCron({ preset: "weekdays", time: "18:15" })).toBe("15 18 * * 1-5");
    expect(describeCron("0 9 * * *")).toBe("Todos los días a las 9:00");
    expect(describeCron("0 9 * * 1")).toBe("Todos los lunes a las 9:00");
    expect(describeCron("0 9 1 * *")).toBe("El día 1 de cada mes a las 9:00");
    expect(describeCron("15 18 * * 1-5")).toBe("De lunes a viernes a las 18:15");
    expect(cronToPreset("0 9 * * 1")).toEqual({ preset: "weekly", time: "09:00", weekday: 1 });
    expect(() => presetToCron({ preset: "monthly", time: "09:00", monthDay: 31 })).toThrow();
    expect(isValidCron("61 * * * *")).toBe(false);
  });
  it("coincide en hora de Argentina (UTC-3)", () => {
    // lunes 09/11/2026 09:00 ART = 12:00 UTC
    expect(cronMatches("0 9 * * 1", new Date("2026-11-09T12:00:00Z"))).toBe(true);
    expect(cronMatches("0 9 * * 1", new Date("2026-11-09T09:00:00Z"))).toBe(false);
    expect(cronMatches("0 9 1 * *", new Date("2026-12-01T12:00:00Z"))).toBe(true);
    const next = nextRuns("0 9 * * 1", new Date("2026-11-05T15:00:00Z"), 2);
    expect(next.map((d) => d.toISOString())).toEqual(["2026-11-09T12:00:00.000Z", "2026-11-16T12:00:00.000Z"]);
    expect(lastMatchBetween("0 9 * * *", new Date("2026-11-05T11:50:00Z"), new Date("2026-11-05T12:05:00Z"))?.toISOString()).toBe("2026-11-05T12:00:00.000Z");
    expect(lastMatchBetween("0 9 * * *", new Date("2026-11-05T12:00:00Z"), new Date("2026-11-05T12:05:00Z"))).toBeNull();
  });
});

describe("firma HMAC de webhooks y anti-replay", () => {
  const secret = "whsec_test";
  const body = '{"hola":"mundo"}';
  it("firma válida dentro de la ventana", () => {
    const now = 1_800_000_000;
    const sig = signWebhook(secret, body, now);
    expect(sig).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, body, sig, now + 10).ok).toBe(true);
  });
  it("rechaza cuerpo alterado, secreto incorrecto, firma ausente y marca vieja (> 5 min)", () => {
    const now = 1_800_000_000;
    const sig = signWebhook(secret, body, now);
    expect(verifyWebhookSignature(secret, `${body} `, sig, now)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyWebhookSignature("otro", body, sig, now)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyWebhookSignature(secret, body, null, now)).toEqual({ ok: false, reason: "missing" });
    expect(verifyWebhookSignature(secret, body, "t=abc,v1=zz", now)).toEqual({ ok: false, reason: "missing" });
    expect(verifyWebhookSignature(secret, body, sig, now + 301)).toEqual({ ok: false, reason: "stale" });
    expect(verifyWebhookSignature(secret, body, sig, now - 301)).toEqual({ ok: false, reason: "stale" });
  });
});

describe("validación de reglas", () => {
  const base = { name: "R", triggerKind: "event", eventType: "proyecto.creado", conditions: { match: "all", items: [] } };
  it("máximo 20 acciones y al menos una", () => {
    const a = { type: "notify", params: { title: "x" } };
    expect(ruleInput.safeParse({ ...base, actions: Array(20).fill(a) }).success).toBe(true);
    expect(ruleInput.safeParse({ ...base, actions: Array(21).fill(a) }).success).toBe(false);
    expect(ruleInput.safeParse({ ...base, actions: [] }).success).toBe(false);
  });
  it("email automático al cliente exige confirmación explícita", () => {
    const email = { type: "send_email", params: { to: "client", subject: "s", body: "b", automatic: true } };
    expect(ruleInput.safeParse({ ...base, actions: [email] }).success).toBe(false);
    const ok = ruleInput.safeParse({ ...base, actions: [{ ...email, params: { ...email.params, confirmAutomatic: true } }] });
    expect(ok.success).toBe(true);
  });
  it("ids deterministas estables y con formato UUID", () => {
    const a = deterministicUuid("x", "y");
    expect(a).toBe(deterministicUuid("x", "y"));
    expect(a).not.toBe(deterministicUuid("x", "z"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
