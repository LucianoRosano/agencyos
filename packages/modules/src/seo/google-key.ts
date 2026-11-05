import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, eq, isNull } from "drizzle-orm";
import { decryptSecret } from "../shared/crypto";

/**
 * API key de Google (PageSpeed Insights + CrUX) guardada CIFRADA en `integration` (provider `google`, config.kind `api_key`).
 * Nunca se devuelve a la UI: solo se descifra en el worker para llamar a Google.
 * `config.usage` lleva el conteo diario de llamadas para el control de cuota.
 */
export const GOOGLE_PROVIDER = "google";
export const GOOGLE_KEY_KIND = "api_key";

export type GoogleKeyConfig = { kind: string; last4?: string; usage?: { date: string; psi: number; crux: number } };

export async function findGoogleKeyRow(workspaceId: string) {
  const rows = await getDb()
    .select()
    .from(schema.integration)
    .where(and(eq(schema.integration.workspaceId, workspaceId), eq(schema.integration.provider, GOOGLE_PROVIDER), isNull(schema.integration.deletedAt)));
  return rows.find((r) => (r.config as GoogleKeyConfig).kind === GOOGLE_KEY_KIND && r.secretEnc) ?? null;
}

export async function getGoogleKeyForWorker(workspaceId: string): Promise<string | null> {
  const row = await findGoogleKeyRow(workspaceId);
  if (!row?.secretEnc || row.status !== "active") return null;
  try {
    return decryptSecret(Buffer.from(row.secretEnc));
  } catch {
    return null;
  }
}

/** Suma llamadas del día (hora Argentina) y devuelve el uso previo. */
export async function recordGoogleUsage(workspaceId: string, add: { psi: number; crux: number }, lastError?: string | null) {
  const row = await findGoogleKeyRow(workspaceId);
  const today = todayAR();
  const cfg = (row?.config ?? { kind: GOOGLE_KEY_KIND }) as GoogleKeyConfig;
  const prev = cfg.usage?.date === today ? cfg.usage : { date: today, psi: 0, crux: 0 };
  if (!row || (!add.psi && !add.crux && lastError === undefined)) return prev;
  const next = { date: today, psi: prev.psi + add.psi, crux: prev.crux + add.crux };
  await getDb()
    .update(schema.integration)
    .set({
      config: { ...cfg, usage: next },
      ...(lastError ? { lastError: lastError.slice(0, 500) } : add.psi || add.crux ? { lastOkAt: new Date(), lastError: null } : {}),
    })
    .where(eq(schema.integration.id, row.id));
  return prev;
}
