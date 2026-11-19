import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createAccount } from "@agencyos/modules/finance/service";
import { applyClientsImport, applyTransactionsImport, previewClientsImport, previewTransactionsImport } from "@agencyos/modules/import/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const ledgerOf = (ws: Awaited<ReturnType<typeof makeWorkspace>>) => ws.ledgers[0]?.id as string;

describe("importación CSV", () => {
  it("clientes: vista previa, duplicados, estados en español y aplicar", async () => {
    const ws = await makeWorkspace();
    await createClient(ws, { name: "Panadería Sol" });
    const csv = [
      "Nombre;Rubro;Ciudad;Email;Estado",
      "Panaderia sol;Panadería;San Miguel;;Activo", // duplicado (sin tilde)
      "Librería Uno;Librería;Bella Vista;hola@libreriauno.com;Prospecto",
      ";Sin nombre;;;",
      "Ferretería Max;Ferretería;;;Cualquiera",
      "Estudio Nora;Contable;;nora@estudio.com;",
    ].join("\n");
    const p = await previewClientsImport(ws, csv);
    expect({ ok: p.ok, duplicates: p.duplicates, errors: p.errors }).toEqual({ ok: 2, duplicates: 1, errors: 2 });
    // la vista previa no escribe
    expect((await getDb().select().from(schema.client).where(eq(schema.client.workspaceId, ws.workspaceId))).length).toBe(1);
    const r = await applyClientsImport(ws, csv);
    expect(r.created).toBe(2);
    const rows = await getDb().select().from(schema.client).where(eq(schema.client.workspaceId, ws.workspaceId));
    expect(rows.map((c) => c.name).sort()).toEqual(["Estudio Nora", "Librería Uno", "Panadería Sol"]);
    expect(rows.find((c) => c.name === "Librería Uno")?.status).toBe("prospect");
    // reimportar no duplica
    expect((await applyClientsImport(ws, csv)).created).toBe(0);
  });

  it("movimientos: montos es-AR, signo y crédito/débito, deduplicación por cuenta", async () => {
    const ws = await makeWorkspace();
    const acc = await createAccount(ws, {
      name: "Banco",
      ledgerId: ledgerOf(ws),
      kind: "bank",
      currency: "ARS",
      openingBalance: "0",
      openingDate: "2026-01-01",
    });
    const csv = [
      "Fecha;Descripción;Monto",
      "05/11/2026;Cobro Librería;$ 150.000,00",
      "06/11/2026;Hosting;-12.500,50",
      "07/11/2026;Raro;abc",
      "32/11/2026;Mala fecha;10",
    ].join("\n");
    const p = await previewTransactionsImport(ws, csv, acc.id);
    expect({ ok: p.ok, errors: p.errors }).toEqual({ ok: 2, errors: 2 });
    const r = await applyTransactionsImport(ws, csv, acc.id);
    expect(r.created).toBe(2);
    const txs = await getDb()
      .select()
      .from(schema.transaction)
      .where(and(eq(schema.transaction.workspaceId, ws.workspaceId), eq(schema.transaction.accountId, acc.id)));
    expect(txs.map((t) => [t.kind, t.amount]).sort()).toEqual([
      ["expense", "12500.50"],
      ["income", "150000.00"],
    ]);
    const again = await previewTransactionsImport(ws, csv, acc.id);
    expect(again.duplicates).toBe(2);
    // formato banco con columnas Crédito / Débito
    const bank = ["Fecha;Concepto;Crédito;Débito", "2026-11-08;Transferencia recibida;1.000,00;", "2026-11-09;Comisión;;150,00"].join("\n");
    expect((await applyTransactionsImport(ws, bank, acc.id)).created).toBe(2);
  });

  it("aislamiento y permisos: la cuenta de otro workspace no sirve; un colaborador no importa", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const accA = await createAccount(a, { name: "Caja", ledgerId: ledgerOf(a), kind: "cash", currency: "ARS", openingBalance: "0", openingDate: "2026-01-01" });
    await expect(previewTransactionsImport(b, "Fecha;Monto\n01/11/2026;10", accA.id)).rejects.toThrow();
    const member = { ...a, role: "member" as const };
    await expect(previewClientsImport(member, "Nombre\nX")).rejects.toThrow();
    await expect(previewTransactionsImport(member, "Fecha;Monto\n01/11/2026;10", accA.id)).rejects.toThrow();
  });

  it("valida tamaño, encabezados y columnas obligatorias", async () => {
    const ws = await makeWorkspace();
    await expect(previewClientsImport(ws, "")).rejects.toThrow();
    await expect(previewClientsImport(ws, "Rubro\nX")).rejects.toThrow(/Nombre/);
    const acc = await createAccount(ws, {
      name: "Caja",
      ledgerId: ledgerOf(ws),
      kind: "cash",
      currency: "ARS",
      openingBalance: "0",
      openingDate: "2026-01-01",
    });
    await expect(previewTransactionsImport(ws, "Descripción\nX", acc.id)).rejects.toThrow(/Fecha/);
  });
});

describe("importación CSV · validación por fila", () => {
  it("un email inválido se marca en la vista previa y no se crea", async () => {
    const ws = await makeWorkspace();
    const p = await previewClientsImport(ws, "Nombre;Email\nMal Mail;no-es-un-mail\nBien;bien@ejemplo.com");
    expect(p.errors).toBe(1);
    expect(p.rows.find((r) => r.summary === "Mal Mail")?.message).toMatch(/contactEmail/);
    expect((await applyClientsImport(ws, "Nombre;Email\nMal Mail;no-es-un-mail\nBien;bien@ejemplo.com")).created).toBe(1);
  });
});
