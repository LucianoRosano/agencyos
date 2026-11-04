import "server-only";
import { can } from "@agencyos/core";
import { agencyLedger, listAccounts, listCategories, listLedgers } from "@agencyos/modules/finance/queries";
import { clientOpts, projectOpts } from "@/lib/options";
import { type AppCtx, requireCtx } from "@/lib/session";
import type { FormOptions } from "./shared";

export type SP = Record<string, string | undefined>;

/**
 * Contexto común de las páginas de Finanzas: permisos y libro seleccionado.
 * El libro se persiste en la query string (`?libro=<id>`); sin parámetro = vista combinada.
 */
export async function financePage(sp: SP) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "finance")) return { allowed: false as const, ctx };
  const ledgers = await listLedgers(ctx);
  const ledger = ledgers.find((l) => l.id === sp.libro) ?? null;
  const agency = agencyLedger(ledgers);
  return {
    allowed: true as const,
    ctx,
    ledgers,
    ledger,
    ledgerId: ledger?.id,
    /** Los cobros a clientes son de la Agencia: se ven en la vista combinada y en el libro de Agencia. */
    showReceivables: !ledger || ledger.id === agency?.id,
    defaultLedgerId: ledger?.id ?? agency?.id ?? "",
  };
}

export async function formOptions(ctx: AppCtx): Promise<FormOptions> {
  const [accounts, categories, clients, projects, ledgers] = await Promise.all([
    listAccounts(ctx),
    listCategories(ctx),
    clientOpts(ctx),
    projectOpts(ctx),
    listLedgers(ctx),
  ]);
  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      ledgerId: a.ledgerId,
      ledgerName: a.ledgerName,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      depth: c.depth,
    })),
    clients,
    projects,
    ledgers: ledgers.map((l) => ({ value: l.id, label: l.name })),
  };
}

/** Query string con el libro actual + extras. */
export function qs(libro: string | undefined, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  if (libro) p.set("libro", libro);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
