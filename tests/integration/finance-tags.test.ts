import { todayAR } from "@agencyos/core";
import { createTag, setEntityTags, tagsUsedOn } from "@agencyos/modules/collab/service";
import { financeOverview } from "@agencyos/modules/finance/queries";
import { createAccount, createTransaction } from "@agencyos/modules/finance/service";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

describe("resumen de finanzas filtrado por etiqueta", () => {
  it("los totales del mes y el gráfico cuentan solo los movimientos con la etiqueta", async () => {
    const ws = await makeWorkspace();
    const ledgerId = ws.ledgers.find((l) => l.name === "Agencia")?.id as string;
    const acc = await createAccount(ws, { name: "Caja", ledgerId, kind: "cash", currency: "ARS", openingBalance: "0" });
    const today = todayAR();
    const a = await createTransaction(ws, { kind: "income", amount: "1000", accountId: acc.id, date: today });
    await createTransaction(ws, { kind: "income", amount: "500", accountId: acc.id, date: today });
    const g = await createTransaction(ws, { kind: "expense", amount: "200", accountId: acc.id, date: today });
    const viajes = await createTag(ws, { name: "viajes" });
    await createTag(ws, { name: "sin-uso" });
    await setEntityTags(ws, "transaction", a.id, [viajes.id]);
    await setEntityTags(ws, "transaction", g.id, [viajes.id]);

    expect((await tagsUsedOn(ws, "transaction")).map((t) => t.name)).toEqual(["viajes"]);
    const all = await financeOverview(ws, {});
    expect(all.income).toEqual([{ currency: "ARS", total: "1500.00" }]);
    const only = await financeOverview(ws, { tagId: viajes.id });
    expect(only.income).toEqual([{ currency: "ARS", total: "1000.00" }]);
    expect(only.expense).toEqual([{ currency: "ARS", total: "200.00" }]);
    const bad = await financeOverview(ws, { tagId: "no-es-uuid" });
    expect(bad.income).toEqual([]);
  });
});
