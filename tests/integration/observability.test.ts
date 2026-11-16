import { getPool } from "@agencyos/db";
import { healthReport, prometheusMetrics } from "@agencyos/modules/shared/health";
import { log, requestIdFrom } from "@agencyos/modules/shared/log";
import { describe, expect, it, vi } from "vitest";
import { GET as metricsGET } from "../../apps/web/app/api/metrics/route";

describe("observabilidad", () => {
  it("health: base ok, worker con latido reciente, outbox y disco", async () => {
    await getPool().query(
      "insert into worker_heartbeat (instance_id, hostname, pid) values ('test-obs', 'h', 1) on conflict (instance_id) do update set last_seen_at = now()",
    );
    const h = await healthReport();
    expect(h.checks.db.status).toBe("ok");
    expect(h.checks.worker.instances).toBeGreaterThanOrEqual(1);
    expect(h.checks.worker.status).toBe("ok");
    expect(h.checks.storage.driver).toBe("disk");
    expect(["ok", "degraded"]).toContain(h.status);
    await getPool().query("delete from worker_heartbeat where instance_id = 'test-obs'");
  });

  it("métricas Prometheus bien formadas", async () => {
    const text = await prometheusMetrics();
    expect(text).toMatch(/^# HELP agencyos_up /m);
    expect(text).toMatch(/^agencyos_db_up 1$/m);
    expect(text).toMatch(/^agencyos_outbox_pending \d+$/m);
    expect(text).toMatch(/^agencyos_db_connections\{application="[^"]+",state="[^"]+"\} \d+$/m);
    // cada línea que no es comentario: nombre{labels} valor
    for (const line of text
      .trim()
      .split("\n")
      .filter((l) => !l.startsWith("#")))
      expect(line).toMatch(/^[a-z_]+(\{[^}]*\})? -?[\d.e+]+$/);
  });

  it("/api/metrics exige METRICS_TOKEN (404 sin configurar, 401 con token incorrecto)", async () => {
    const req = (auth?: string) => new Request("http://x/api/metrics", { headers: auth ? { authorization: auth } : {} });
    delete process.env.METRICS_TOKEN;
    expect((await metricsGET(req("Bearer x"))).status).toBe(404);
    process.env.METRICS_TOKEN = "t".repeat(32);
    try {
      expect((await metricsGET(req())).status).toBe(401);
      expect((await metricsGET(req(`Bearer ${"t".repeat(31)}`))).status).toBe(401);
      const ok = await metricsGET(req(`Bearer ${"t".repeat(32)}`));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toContain("text/plain");
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });

  it("logs JSON con redacción y requestId válido", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info({ requestId: "abc12345", token: "secreto", userEmail: "a@b.c", n: 1 }, "hola");
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    spy.mockRestore();
    expect(line).toMatchObject({ level: "info", msg: "hola", requestId: "abc12345", token: "[redactado]", userEmail: "[redactado]", n: 1 });
    expect(requestIdFrom(new Headers({ "x-request-id": "req-0123456789" }))).toBe("req-0123456789");
    expect(requestIdFrom(new Headers({ "x-request-id": "<script>" }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
