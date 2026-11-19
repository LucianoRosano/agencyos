"use server";

import * as imp from "@agencyos/modules/import/service";
import { run } from "@/lib/action";

export async function previewImportAction(kind: "clientes" | "movimientos", csv: string, accountId: string) {
  return run((ctx) => (kind === "clientes" ? imp.previewClientsImport(ctx, csv) : imp.previewTransactionsImport(ctx, csv, accountId)), {
    revalidate: false,
  });
}

export async function applyImportAction(kind: "clientes" | "movimientos", csv: string, accountId: string) {
  return run((ctx) => (kind === "clientes" ? imp.applyClientsImport(ctx, csv) : imp.applyTransactionsImport(ctx, csv, accountId)));
}
