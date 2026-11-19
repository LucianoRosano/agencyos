import { getPool } from "@agencyos/db";
import { acquireLease, releaseLease } from "@agencyos/modules/shared/job-lease";
import { describe, expect, it } from "vitest";
import type { Job } from "../../apps/worker/src/registry";
import { WorkerRuntime } from "../../apps/worker/src/runtime";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("worker escalable", () => {
  it("dos workers en paralelo no corren el mismo job exclusivo a la vez", async () => {
    const a = new WorkerRuntime();
    const b = new WorkerRuntime();
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const job: Job = {
      name: `test-excl-${Date.now()}`,
      cron: "* * * * *",
      quiet: true,
      run: async () => {
        active++;
        runs++;
        maxActive = Math.max(maxActive, active);
        await sleep(150);
        active--;
        return runs;
      },
    };
    const results = await Promise.all([a.run(job), b.run(job), a.run(job), b.run(job)]);
    expect(maxActive).toBe(1);
    expect(runs).toBe(1);
    expect(results.filter((r) => (r as { skipped?: string })?.skipped === "otro worker")).toHaveLength(3);
    // terminado, el lease se libera: la próxima ocurrencia corre
    expect(await b.run(job)).toBe(2);
  });

  it("un job no exclusivo corre en paralelo; un lease vencido (worker caído) se puede tomar", async () => {
    const rt = new WorkerRuntime();
    let active = 0;
    let maxActive = 0;
    const job: Job = {
      name: "test-par",
      cron: "",
      exclusive: false,
      quiet: true,
      run: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(50);
        active--;
      },
    };
    await Promise.all([rt.run(job), rt.run(job), rt.run(job)]);
    expect(maxActive).toBe(3);

    const name = `test-lease-${Date.now()}`;
    expect(await acquireLease(name, "muerto", 1)).toBe(true);
    await sleep(20);
    expect(await acquireLease(name, "vivo", 60_000)).toBe(true);
    expect(await acquireLease(name, "otro", 60_000)).toBe(false);
    await releaseLease(name, "vivo");
  });

  it("apagado ordenado: drain espera el job en curso y no acepta nuevos; el latido se registra y se limpia", async () => {
    const rt = new WorkerRuntime();
    await rt.heartbeat();
    const hb = await getPool().query("select running_jobs from worker_heartbeat where instance_id = $1", [rt.instanceId]);
    expect(hb.rowCount).toBe(1);
    let finished = false;
    const job: Job = {
      name: `test-drain-${Date.now()}`,
      cron: "",
      quiet: true,
      run: async () => {
        await sleep(300);
        finished = true;
        return "ok";
      },
    };
    const running = rt.run(job);
    await sleep(30);
    expect(rt.inFlight).toBe(1);
    const pending = await rt.drain(5_000);
    expect(pending).toBe(0);
    expect(finished).toBe(true);
    expect(await running).toBe("ok");
    expect(await rt.run(job)).toEqual({ skipped: "apagando" });
    await rt.cleanup();
    const gone = await getPool().query("select 1 from worker_heartbeat where instance_id = $1", [rt.instanceId]);
    expect(gone.rowCount).toBe(0);
  });

  it("drain respeta el tope de espera", async () => {
    const rt = new WorkerRuntime();
    const job: Job = { name: `test-slow-${Date.now()}`, cron: "", quiet: true, exclusive: false, run: () => sleep(2_000) };
    void rt.run(job);
    await sleep(10);
    const t = Date.now();
    expect(await rt.drain(100)).toBe(1);
    expect(Date.now() - t).toBeLessThan(1_000);
  });
});
