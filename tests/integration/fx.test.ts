import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { latestFxRates, refreshFxRates } from "@agencyos/modules/fx/service";
import { describe, expect, it } from "vitest";

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("cotización del dólar (DolarAPI)", () => {
  it("guarda las del día, actualiza si se vuelve a traer e ignora tipos desconocidos", async () => {
    await getDb().delete(schema.fxRate);
    const first = await refreshFxRates(
      reply([
        { moneda: "USD", casa: "oficial", nombre: "Oficial", compra: 1550, venta: 1600, fechaActualizacion: "2026-11-20T18:55:00.000Z" },
        { moneda: "USD", casa: "bolsa", nombre: "Bolsa", compra: 1682.6, venta: 1743.1, fechaActualizacion: "2026-11-21T20:59:00.000Z" },
        { moneda: "USD", casa: "blue", nombre: "Blue", compra: 1655, venta: 1675, fechaActualizacion: null },
        { moneda: "USD", casa: "inventado", nombre: "X", compra: 1, venta: 2 },
      ]),
    );
    expect(first).toEqual({ saved: 3, skipped: false });
    await refreshFxRates(reply([{ casa: "blue", compra: 1660, venta: 1690, fechaActualizacion: "2026-11-21T21:00:00.000Z" }]));
    const rates = await latestFxRates();
    expect(rates.map((r) => [r.label, r.sell])).toEqual([
      ["Oficial", "1600.0000"],
      ["MEP", "1743.1000"],
      ["Blue", "1690.0000"],
    ]);
    expect(rates.every((r) => r.day === todayAR())).toBe(true);
  });

  it("si la API falla o responde algo inválido, no guarda nada y avisa", async () => {
    await expect(refreshFxRates(reply({ error: "x" }, 503))).rejects.toThrow(/503/);
    await expect(refreshFxRates(reply([{ casa: "oficial", compra: "mucho" }]))).rejects.toThrow();
  });
});
