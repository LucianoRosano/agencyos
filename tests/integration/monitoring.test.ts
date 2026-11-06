import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createCertificate, createDomain } from "@agencyos/modules/assets/service";
import {
  dueDateAlerts,
  type Fetcher,
  parseRdap,
  purgeUptimeChecks,
  refreshDomainsFromRdap,
  refreshSsl,
  refreshWordpress,
  runUptimeChecks,
} from "@agencyos/modules/monitoring/jobs";
import { downEnvironments, listMonitoredEnvironments } from "@agencyos/modules/monitoring/queries";
import {
  checkNow,
  createMonitoredEnvironment,
  parseMonitorUrl,
  removeWordpressAccess,
  saveWordpressAccess,
  setSiteMonitoring,
} from "@agencyos/modules/monitoring/service";
import type { SafeResponse } from "@agencyos/modules/shared/safe-fetch";
import { getToday } from "@agencyos/modules/today/queries";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const res = (status: number, extra: Partial<SafeResponse> = {}): SafeResponse => ({
  url: "https://x",
  status,
  headers: {},
  body: Buffer.from(""),
  redirects: [],
  ttfbMs: 120,
  ...extra,
});

/** fetch inyectable: nada sale a internet en los tests. */
function fakeFetch(handler: (url: string, method: string, headers: Record<string, string>) => SafeResponse | Error) {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
  const fn: Fetcher = async (url, opts) => {
    const method = opts?.method ?? "GET";
    const headers = opts?.headers ?? {};
    calls.push({ url, method, headers });
    const r = handler(url, method, headers);
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn, calls };
}

async function monitored(name = "Librería Uno", url = "https://libreriauno.com.ar") {
  const ctx = await makeWorkspace();
  const env = await createMonitoredEnvironment(ctx, { siteName: name, url, kind: "prod" });
  return { ctx, env };
}

describe("monitoreo de sitios", () => {
  it("valida la URL sin hacer pedidos (anti-SSRF básico)", () => {
    expect(parseMonitorUrl("libreriauno.com.ar")).toBe("https://libreriauno.com.ar/");
    expect(() => parseMonitorUrl("http://127.0.0.1/")).toThrow();
    expect(() => parseMonitorUrl("http://localhost:3000")).toThrow();
    expect(() => parseMonitorUrl("ftp://x.com")).toThrow();
    expect(() => parseMonitorUrl("https://user:pass@x.com")).toThrow();
  });

  it("crea un sitio mínimo cuando no hay sitios y activa el monitoreo", async () => {
    const { ctx, env } = await monitored();
    const [site] = await getDb().select().from(schema.site).where(eq(schema.site.id, env.siteId));
    expect(site?.name).toBe("Librería Uno");
    expect(site?.prodUrl).toBe("https://libreriauno.com.ar/");
    expect(site?.monitorEnabled).toBe(true);
    await expect(createMonitoredEnvironment(ctx, { siteId: env.siteId, url: "https://libreriauno.com.ar" })).rejects.toThrow(/ya se monitorea/);
    const staging = await createMonitoredEnvironment(ctx, { siteId: env.siteId, url: "https://staging.libreriauno.com.ar", kind: "staging" });
    expect(staging.siteId).toBe(env.siteId);
  });

  it("caída con 2 fallos seguidos (no con 1), recuperación y notificaciones", async () => {
    const { ctx, env } = await monitored();
    let up = true;
    const { fn, calls } = fakeFetch((_u, method) => (up ? res(200) : method === "HEAD" ? new Error("connect ETIMEDOUT") : res(503)));
    const t0 = Date.now();
    const at = (min: number) => new Date(t0 + min * 60_000);

    await runUptimeChecks({ fetcher: fn, now: at(0), workspaceId: ctx.workspaceId });
    expect(calls.map((c) => c.method)).toEqual(["HEAD"]);
    let [e] = await listMonitoredEnvironments(ctx, at(1));
    expect(e?.lastStatus).toBe("up");

    up = false;
    await runUptimeChecks({ fetcher: fn, now: at(5), workspaceId: ctx.workspaceId });
    expect(calls.slice(1).map((c) => c.method)).toEqual(["HEAD", "GET"]); // fallback a GET
    [e] = await listMonitoredEnvironments(ctx, at(6));
    expect(e?.lastStatus).toBe("up"); // un solo fallo: todavía no es caída
    expect(await downEnvironments(ctx)).toHaveLength(0);

    const r = await runUptimeChecks({ fetcher: fn, now: at(10), workspaceId: ctx.workspaceId });
    expect(r.down).toBe(1);
    [e] = await listMonitoredEnvironments(ctx, at(11));
    expect(e?.lastStatus).toBe("down");
    const today = await getToday(ctx, { userId: ctx.userId as string });
    expect(today.catchUp.some((i) => i.kind === "site_down" && i.entityId === env.id)).toBe(true);

    // Un tercer fallo no vuelve a avisar.
    expect((await runUptimeChecks({ fetcher: fn, now: at(15), workspaceId: ctx.workspaceId })).down).toBe(0);

    up = true;
    expect((await runUptimeChecks({ fetcher: fn, now: at(20), workspaceId: ctx.workspaceId })).recovered).toBe(1);
    [e] = await listMonitoredEnvironments(ctx, at(21));
    expect(e?.lastStatus).toBe("up");
    expect(e?.uptime24).toBe(40); // 2 OK de 5
    expect(e?.hours.length).toBe(24);

    const events = await getDb().select({ type: schema.domainEvent.type }).from(schema.domainEvent).where(eq(schema.domainEvent.workspaceId, ctx.workspaceId));
    expect(events.filter((x) => x.type === "sitio.caido")).toHaveLength(1);
    expect(events.filter((x) => x.type === "sitio.recuperado")).toHaveLength(1);
    const notes = await getDb()
      .select({ type: schema.notification.type })
      .from(schema.notification)
      .where(eq(schema.notification.workspaceId, ctx.workspaceId));
    expect(notes.map((n) => n.type).sort()).toEqual(["sitio.caido", "sitio.recuperado"]);
  });

  it("un sitio pausado no se chequea", async () => {
    const { ctx, env } = await monitored();
    await setSiteMonitoring(ctx, env.siteId, false);
    const { fn, calls } = fakeFetch(() => res(200));
    await runUptimeChecks({ fetcher: fn, workspaceId: ctx.workspaceId });
    expect(calls).toHaveLength(0);
  });

  it("SSL: lee vencimiento y emisor del TLS y crea/actualiza el certificado", async () => {
    const { ctx, env } = await monitored();
    let validTo = "Mar 15 12:00:00 2027 GMT";
    const { fn } = fakeFetch(() => res(200, { tls: { validTo, issuer: "Let's Encrypt" } }));
    expect(await refreshSsl({ fetcher: fn, workspaceId: ctx.workspaceId })).toBe(1);
    const certs = () =>
      getDb()
        .select()
        .from(schema.certificate)
        .where(and(eq(schema.certificate.workspaceId, ctx.workspaceId), eq(schema.certificate.kind, "ssl")));
    let list = await certs();
    expect(list).toHaveLength(1);
    expect(list[0]?.subject).toBe("libreriauno.com.ar");
    expect(list[0]?.expiresOn).toBe("2027-03-15");
    expect(list[0]?.siteId).toBe(env.siteId);
    validTo = "Jun 13 12:00:00 2027 GMT";
    await refreshSsl({ fetcher: fn, workspaceId: ctx.workspaceId });
    list = await certs();
    expect(list).toHaveLength(1);
    expect(list[0]?.expiresOn).toBe("2027-06-13");
    const [e] = await listMonitoredEnvironments(ctx);
    expect(e?.sslExpiresOn).toBe("2027-06-13");
    expect(e?.sslIssuer).toBe("Let's Encrypt");
  });

  it("RDAP: completa el vencimiento del dominio y anota la fuente", async () => {
    const ctx = await makeWorkspace();
    const d = await createDomain(ctx, { name: "libreriauno.com.ar" });
    const withDate = await createDomain(ctx, { name: "ya-tiene.com.ar", expiresOn: "2030-01-01" });
    const rdap = {
      events: [
        { eventAction: "registration", eventDate: "2015-01-10T00:00:00Z" },
        { eventAction: "expiration", eventDate: "2027-01-10T00:00:00Z" },
      ],
      entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "NIC Argentina"]]] }],
    };
    expect(parseRdap(rdap)).toEqual({ expiresOn: "2027-01-10", registrar: "NIC Argentina" });
    const { fn, calls } = fakeFetch(() =>
      res(200, { body: Buffer.from(JSON.stringify(rdap)), redirects: ["https://rdap.nic.ar/entity/domain/libreriauno.com.ar"] }),
    );
    expect(await refreshDomainsFromRdap({ fetcher: fn, workspaceId: ctx.workspaceId })).toBe(1);
    expect(calls.map((c) => c.url)).toEqual(["https://rdap.org/domain/libreriauno.com.ar"]);
    const [row] = await getDb().select().from(schema.domain).where(eq(schema.domain.id, d.id));
    expect(row?.expiresOn).toBe("2027-01-10");
    expect(row?.registrar).toBe("NIC Argentina");
    const [act] = await getDb()
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.entityId, d.id), eq(schema.activity.verb, "dominio.vencimiento_rdap")));
    expect((act?.meta as { source?: string } | undefined)?.source).toBe("rdap");
    const [other] = await getDb().select().from(schema.domain).where(eq(schema.domain.id, withDate.id));
    expect(other?.expiresOn).toBe("2030-01-01");
  });

  it("WordPress: la Application Password se guarda cifrada y nunca vuelve en las consultas", async () => {
    const { ctx, env } = await monitored("Sofía", "https://sofia.com.ar");
    const secret = "abcd EFGH ijkl MNOP qrst UVWX";
    await expect(saveWordpressAccess(ctx, env.id, { username: "luciano", appPassword: "corta" })).rejects.toThrow();
    await saveWordpressAccess(ctx, env.id, { username: "luciano", appPassword: secret });
    const [integ] = await getDb()
      .select()
      .from(schema.integration)
      .where(and(eq(schema.integration.workspaceId, ctx.workspaceId), eq(schema.integration.provider, "wordpress")));
    expect(integ?.secretEnc).toBeTruthy();
    expect(integ?.secretEnc?.toString("utf8")).not.toContain("EFGH");
    expect(JSON.stringify(integ?.config)).not.toContain("EFGH");
    const list = await listMonitoredEnvironments(ctx);
    expect(JSON.stringify(list)).not.toContain("EFGH");
    expect(list[0]?.wordpress?.username).toBe("luciano");

    const { fn, calls } = fakeFetch((url, _m, headers) => {
      if (url.endsWith("/wp-json/wp/v2/plugins?context=edit")) {
        const expected = `Basic ${Buffer.from(`luciano:${secret}`).toString("base64")}`;
        if (headers.authorization !== expected) return res(401);
        return res(200, { body: Buffer.from(JSON.stringify([{ name: "WooCommerce", version: "9.3.1", status: "active" }])) });
      }
      return res(200, {
        headers: { "x-powered-by": "PHP/8.2.12" },
        body: Buffer.from('<html><head><meta name="generator" content="WordPress 6.6.2" /></head></html>'),
      });
    });
    expect(await refreshWordpress({ fetcher: fn, workspaceId: ctx.workspaceId })).toBe(1);
    expect(calls.some((c) => c.url === "https://sofia.com.ar/wp-json/wp/v2/plugins?context=edit")).toBe(true);
    const [e] = await listMonitoredEnvironments(ctx);
    expect(e?.wpVersion).toBe("6.6.2");
    expect(e?.phpVersion).toBe("8.2.12");
    expect(e?.wordpress?.plugins).toEqual([{ name: "WooCommerce", version: "9.3.1", status: "active" }]);
    expect(JSON.stringify(e)).not.toContain("EFGH");

    await removeWordpressAccess(ctx, env.id);
    const [after] = await listMonitoredEnvironments(ctx);
    expect(after?.wordpress).toBeNull();
  });

  it("avisos diarios de vencimiento con deduplicación (dominio.por_vencer, ssl.por_vencer)", async () => {
    const ctx = await makeWorkspace();
    const today = todayAR();
    await createDomain(ctx, { name: "avisar.com.ar", expiresOn: addDays(today, 10) });
    await createDomain(ctx, { name: "todavia-no.com.ar", expiresOn: addDays(today, 200) });
    await createCertificate(ctx, { kind: "ssl", subject: "avisar.com.ar", expiresOn: addDays(today, 3), notifyDaysBefore: "14" });
    await dueDateAlerts(today);
    await dueDateAlerts(today);
    const evs = await getDb().select({ type: schema.domainEvent.type }).from(schema.domainEvent).where(eq(schema.domainEvent.workspaceId, ctx.workspaceId));
    expect(evs.filter((e) => e.type === "dominio.por_vencer")).toHaveLength(1);
    expect(evs.filter((e) => e.type === "ssl.por_vencer")).toHaveLength(1);
    const notes = await getDb().select().from(schema.notification).where(eq(schema.notification.workspaceId, ctx.workspaceId));
    expect(notes).toHaveLength(2);
  });

  it("purga de chequeos de más de 90 días", async () => {
    const { ctx, env } = await monitored();
    const old = new Date(Date.now() - 91 * 86_400_000);
    await getDb()
      .insert(schema.uptimeCheck)
      .values([
        { workspaceId: ctx.workspaceId, siteEnvironmentId: env.id, ok: true, checkedAt: old },
        { workspaceId: ctx.workspaceId, siteEnvironmentId: env.id, ok: true },
      ]);
    expect(await purgeUptimeChecks(90)).toBeGreaterThanOrEqual(1);
    const left = await getDb().select().from(schema.uptimeCheck).where(eq(schema.uptimeCheck.siteEnvironmentId, env.id));
    expect(left).toHaveLength(1);
  });

  it("aislamiento A/B: no se ven ni se tocan entornos de otro workspace", async () => {
    const { env: envB } = await monitored("Sitio de B", "https://b.com.ar");
    const a = await makeWorkspace("A");
    expect(await listMonitoredEnvironments(a)).toHaveLength(0);
    await expect(createMonitoredEnvironment(a, { siteId: envB.siteId, url: "https://otra.com.ar" })).rejects.toThrow(/sitio/i);
    await expect(saveWordpressAccess(a, envB.id, { username: "x", appPassword: "abcd efgh ijkl mnop qrst" })).rejects.toThrow();
    await expect(setSiteMonitoring(a, envB.siteId, false)).rejects.toThrow();
    const { fn } = fakeFetch(() => res(200));
    await expect(checkNow(a, envB.id, fn)).rejects.toThrow();
  });
});
