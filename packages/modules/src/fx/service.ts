import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { desc, sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Cotización del dólar automática (gratis, sin cuenta): DolarAPI (https://dolarapi.com, datos públicos de Argentina).
 * El worker guarda las cotizaciones del día; la app las muestra y las ofrece para completar la cotización de un
 * movimiento o un presupuesto en dólares. Nunca se aplica sola: siempre la elige la persona.
 */
export const FX_SOURCES = ["oficial", "bolsa", "blue", "contadoconliqui", "tarjeta", "mayorista", "cripto"] as const;
export type FxSource = (typeof FX_SOURCES)[number];
export const FX_LABEL: Record<FxSource, string> = {
  oficial: "Oficial",
  bolsa: "MEP",
  blue: "Blue",
  contadoconliqui: "CCL",
  tarjeta: "Tarjeta",
  mayorista: "Mayorista",
  cripto: "Cripto",
};
/** Las que se muestran en la app (en este orden). */
export const FX_SHOWN: FxSource[] = ["oficial", "bolsa", "blue"];

const apiRow = z.object({
  casa: z.string(),
  compra: z.number().nonnegative().nullable(),
  venta: z.number().nonnegative().nullable(),
  fechaActualizacion: z.string().nullable().optional(),
});

const fxUrl = () => process.env.FX_API_URL ?? "https://dolarapi.com/v1/dolares";

/** Trae las cotizaciones y guarda las del día (una fila por tipo; si ya estaba, se actualiza). */
export async function refreshFxRates(fetchImpl: typeof fetch = fetch) {
  if (process.env.FX_DISABLED === "1") return { saved: 0, skipped: true };
  const res = await fetchImpl(fxUrl(), { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`DolarAPI respondió ${res.status}`);
  const rows = z.array(apiRow).parse(await res.json());
  const day = todayAR();
  const values = rows
    .filter((r): r is typeof r & { casa: FxSource } => (FX_SOURCES as readonly string[]).includes(r.casa))
    .map((r) => ({
      day,
      source: r.casa,
      buy: r.compra === null ? null : r.compra.toFixed(4),
      sell: r.venta === null ? null : r.venta.toFixed(4),
      quotedAt: r.fechaActualizacion ? new Date(r.fechaActualizacion) : null,
      fetchedAt: new Date(),
    }));
  if (!values.length) return { saved: 0, skipped: false };
  await getDb()
    .insert(schema.fxRate)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.fxRate.day, schema.fxRate.source],
      set: { buy: sql`excluded.buy`, sell: sql`excluded.sell`, quotedAt: sql`excluded.quoted_at`, fetchedAt: sql`excluded.fetched_at` },
    });
  return { saved: values.length, skipped: false };
}

export type FxQuote = { source: FxSource; label: string; buy: string | null; sell: string | null; day: string; quotedAt: Date | null };

/** Última cotización guardada de cada tipo mostrado (puede ser de días anteriores si el worker no corrió). */
export async function latestFxRates(): Promise<FxQuote[]> {
  const rows = await getDb()
    .selectDistinctOn([schema.fxRate.source])
    .from(schema.fxRate)
    .where(
      sql`${schema.fxRate.source} in (${sql.join(
        FX_SHOWN.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    )
    .orderBy(schema.fxRate.source, desc(schema.fxRate.day));
  const by = new Map(rows.map((r) => [r.source, r]));
  return FX_SHOWN.filter((s) => by.has(s)).map((s) => {
    const r = by.get(s);
    return { source: s, label: FX_LABEL[s], buy: r?.buy ?? null, sell: r?.sell ?? null, day: r?.day ?? "", quotedAt: r?.quotedAt ?? null };
  });
}
