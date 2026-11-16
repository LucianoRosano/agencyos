import { getPool } from "@agencyos/db";

/**
 * Exclusión mutua entre procesos worker (docs/SCALING.md §Worker) — tabla `job_lease`, sin conexiones retenidas.
 *
 * pg-boss ya evita que dos workers ENCOLEN la misma ocurrencia de un cron, pero si una corrida tarda más que el
 * intervalo (p. ej. el outbox con muchos eventos) la siguiente ocurrencia podría tomarla OTRO worker en paralelo.
 * El lease lo impide: quien no lo obtiene, saltea la corrida (la próxima la retoma). El lease se renueva mientras el
 * job corre y vence solo si el proceso muere (TTL), así un worker caído no bloquea para siempre.
 */
export async function acquireLease(name: string, holder: string, ttlMs: number): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `insert into job_lease (name, holder, acquired_at, expires_at) values ($1, $2, now(), now() + $3 * interval '1 millisecond')
     on conflict (name) do update set holder = excluded.holder, acquired_at = now(), expires_at = excluded.expires_at
     where job_lease.expires_at < now()`,
    [name, holder, ttlMs],
  );
  return (rowCount ?? 0) > 0;
}

export async function renewLease(name: string, holder: string, ttlMs: number): Promise<boolean> {
  const { rowCount } = await getPool().query("update job_lease set expires_at = now() + $3 * interval '1 millisecond' where name = $1 and holder = $2", [
    name,
    holder,
    ttlMs,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function releaseLease(name: string, holder: string): Promise<void> {
  await getPool().query("delete from job_lease where name = $1 and holder = $2", [name, holder]);
}

export async function releaseAllLeases(holder: string): Promise<void> {
  await getPool().query("delete from job_lease where holder = $1", [holder]);
}

export type LeaseResult<T> = { ran: true; result: T } | { ran: false };

/** Corre `fn` solo si este holder obtiene el lease; lo renueva cada ttl/3 y lo libera al terminar. */
export async function withLease<T>(name: string, holder: string, ttlMs: number, fn: () => Promise<T>): Promise<LeaseResult<T>> {
  if (!(await acquireLease(name, holder, ttlMs))) return { ran: false };
  const timer = setInterval(() => void renewLease(name, holder, ttlMs).catch(() => undefined), Math.max(1000, Math.floor(ttlMs / 3)));
  timer.unref?.();
  try {
    return { ran: true, result: await fn() };
  } finally {
    clearInterval(timer);
    await releaseLease(name, holder).catch(() => undefined);
  }
}
