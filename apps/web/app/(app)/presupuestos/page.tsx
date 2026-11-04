import { formatDate, formatMoney, L, relativeDays, todayAR } from "@agencyos/core";
import { listQuotes, quoteCounts } from "@agencyos/modules/quotes/queries";
import { Button, EmptyState, PageHeader, Tabs } from "@agencyos/ui";
import { FileSignature, Package, Plus } from "lucide-react";
import Link from "next/link";
import { QuoteStatusBadge } from "@/components/quotes/status-badge";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Presupuestos" };

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "abiertos", label: "Abiertos" },
  { key: "draft", label: L.quoteStatus.draft },
  { key: "sent", label: L.quoteStatus.sent },
  { key: "viewed", label: L.quoteStatus.viewed },
  { key: "accepted", label: L.quoteStatus.accepted },
  { key: "rejected", label: L.quoteStatus.rejected },
  { key: "expired", label: L.quoteStatus.expired },
  { key: "void", label: L.quoteStatus.void },
];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const active = FILTERS.some((f) => f.key === sp.estado) ? (sp.estado as string) : "todos";
  const [rows, counts] = await Promise.all([listQuotes(ctx, { status: active === "todos" ? undefined : active, q: sp.q?.trim() || undefined }), quoteCounts(ctx)]);
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  const today = todayAR();
  const countFor = (k: string) => (k === "todos" ? total : k === "abiertos" ? (counts.draft ?? 0) + (counts.sent ?? 0) + (counts.viewed ?? 0) : (counts[k] ?? 0));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Presupuestos y servicios"
        title="Presupuestos"
        accent="#A78BFA"
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/presupuestos/servicios">
                <Package className="size-4" /> Servicios
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/presupuestos/nuevo">
                <Plus className="size-4" /> Nuevo presupuesto
              </Link>
            </Button>
          </>
        }
      />
      <Tabs
        active={active}
        items={FILTERS.filter((f) => ["todos", "abiertos"].includes(f.key) || countFor(f.key) > 0 || f.key === active).map((f) => ({
          key: f.key,
          label: f.label,
          href: `/presupuestos${f.key === "todos" ? "" : `?estado=${f.key}`}`,
          count: countFor(f.key),
        }))}
      />
      <form className="mb-5" action="/presupuestos" role="search">
        {active !== "todos" ? <input type="hidden" name="estado" value={active} /> : null}
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Buscar por número, título o cliente…"
          aria-label="Buscar presupuestos"
          className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm"
        />
      </form>
      {rows.length ? (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <div className="hidden grid-cols-[150px_minmax(0,1fr)_120px_150px_120px] gap-4 border-b border-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint md:grid">
            <span>Número</span>
            <span>Presupuesto</span>
            <span>Estado</span>
            <span className="text-right">Total</span>
            <span className="text-right">Válido hasta</span>
          </div>
          <ul>
            {rows.map(({ q, clientName, total: amount, currency, validUntil, version }) => {
              const open = ["sent", "viewed"].includes(q.status);
              return (
                <li key={q.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/presupuestos/${q.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-surface-2 md:grid-cols-[150px_minmax(0,1fr)_120px_150px_120px] md:items-center"
                  >
                    <span className="whitespace-nowrap font-mono text-[12px] text-text-muted md:text-[13px]">
                      {q.number}
                      {version && version > 1 ? <span className="text-text-faint"> · v{version}</span> : null}
                    </span>
                    <span className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                      <span className="block truncate text-[15px] text-text">{q.title}</span>
                      <span className="block truncate text-[13px] text-text-muted">{clientName ?? "—"}</span>
                    </span>
                    <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start">
                      <QuoteStatusBadge status={q.status} />
                    </span>
                    <span className="row-start-3 font-mono text-[15px] text-text md:row-start-auto md:text-right">{amount ? formatMoney(amount, currency ?? "ARS") : "—"}</span>
                    <span className={`row-start-3 self-center text-right font-mono text-[12px] md:row-start-auto md:text-[13px] ${open && validUntil && validUntil < today ? "text-warning" : "text-text-muted"}`}>
                      {validUntil ? (open ? `${formatDate(validUntil)} · ${relativeDays(validUntil, today)}` : formatDate(validUntil)) : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={<FileSignature />}
          title={sp.q ? `Sin resultados para «${sp.q}»` : active !== "todos" ? "No hay presupuestos en este estado" : "Todavía no hay presupuestos"}
          description={
            sp.q || active !== "todos"
              ? "Probá con otro filtro o buscá por número, título o cliente."
              : "Armá el primero: ítems del catálogo o libres, descuentos, plan de cobro y un PDF prolijo con tu marca, listo para mandar."
          }
          action={
            <Button asChild variant="primary">
              <Link href="/presupuestos/nuevo">
                <Plus className="size-4" /> Nuevo presupuesto
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
