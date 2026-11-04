import { getDb } from "@agencyos/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Liveness (?live=1) y readiness (base de datos). Sin datos sensibles. */
export async function GET(req: Request) {
  const live = new URL(req.url).searchParams.has("live");
  const version = process.env.APP_VERSION ?? "dev";
  if (live) return Response.json({ ok: true, version });
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok", version });
  } catch {
    return Response.json({ ok: false, db: "error", version }, { status: 503 });
  }
}
