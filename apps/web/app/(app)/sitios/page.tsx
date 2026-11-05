import { L, label, relativeFromDate } from "@agencyos/core";
import { listSites, siteFormOptions } from "@agencyos/modules/sites/queries";
import { Badge, Button, Dot, EmptyState, PageHeader, Progress, Tabs } from "@agencyos/ui";
import { ExternalLink, LayoutTemplate, MessageSquareWarning, Plus } from "lucide-react";
import Link from "next/link";
import { PUB_ORDER, PUB_TONE, pct, SITES_ACCENT } from "@/components/sites/shared";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Sitios" };

export default async function SitesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const status = sp.estado && (PUB_ORDER as readonly string[]).includes(sp.estado) ? sp.estado : undefined;
  const clientId = sp.cliente && /^[0-9a-f-]{36}$/i.test(sp.cliente) ? sp.cliente : undefined;
  const [rows, { clients }] = await Promise.all([listSites(ctx, { status, clientId, q: sp.q }), siteFormOptions(ctx)]);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ cliente: clientId, q: sp.q, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/sitios?${s}` : "/sitios";
  };
  const filtered = Boolean(status || clientId || sp.q);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Website Factory"
        title="Sitios"
        description="Del briefing a la publicación: estructura, contenidos, revisiones y checklist de lanzamiento."
        accent={SITES_ACCENT}
        actions={
          <Button asChild variant="primary">
            <Link href="/sitios/nuevo">
              <Plus className="size-4" /> Nuevo sitio
            </Link>
          </Button>
        }
      />
      <Tabs
        active={status ?? "todos"}
        items={[{ key: "todos", label: "Todos", href: qs({}) }, ...PUB_ORDER.map((s) => ({ key: s, label: L.publicationStatus[s], href: qs({ estado: s }) }))]}
      />
      <form className="mb-5 flex flex-col gap-2 md:flex-row" action="/sitios">
        {status ? <input type="hidden" name="estado" value={status} /> : null}
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Buscar sitios…"
          aria-label="Buscar sitios"
          className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm"
        />
        <select
          name="cliente"
          defaultValue={clientId ?? ""}
          aria-label="Filtrar por cliente"
          className="select-chevron h-10 w-full appearance-none rounded-[var(--radius-control)] border border-border bg-bg-elevated bg-[length:16px] bg-[right_10px_center] bg-no-repeat px-3 pr-9 text-base md:w-60 md:text-sm"
        >
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {rows.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ s, clientName, slotsDone, slotsTotal, checksDone, checksTotal, openItems }) => (
            <li key={s.id}>
              <Link
                href={`/sitios/${s.id}`}
                className="group flex h-full min-h-44 flex-col rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong md:p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 text-[16px] font-medium text-text">{s.name}</h2>
                  <Badge tone={PUB_TONE[s.publicationStatus]}>{label(L.publicationStatus, s.publicationStatus)}</Badge>
                </div>
                <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-text-muted">
                  <Dot color={clientName ? "#22D3EE" : SITES_ACCENT} />
                  <span className="truncate">
                    {clientName ?? "Sin cliente"} · {label(L.siteKind, s.kind)}
                  </span>
                </p>
                {s.prodUrl || s.stagingUrl ? (
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[12px] text-text-faint">
                    <ExternalLink className="size-3 shrink-0" />
                    <span className="truncate">{(s.prodUrl ?? s.stagingUrl ?? "").replace(/^https?:\/\//, "")}</span>
                  </p>
                ) : null}
                <dl className="mt-4 flex flex-1 flex-col justify-end gap-3 text-[12px]">
                  <div>
                    <dt className="mb-1 flex justify-between text-text-muted">
                      <span>Contenidos</span>
                      <span className="font-mono">{slotsTotal ? `${slotsDone}/${slotsTotal}` : "sin estructura"}</span>
                    </dt>
                    <dd>
                      <Progress value={pct(slotsDone, slotsTotal)} label={`Contenidos aprobados de ${s.name}`} />
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 flex justify-between text-text-muted">
                      <span>Checklist de lanzamiento</span>
                      <span className="font-mono">
                        {checksDone}/{checksTotal}
                      </span>
                    </dt>
                    <dd>
                      <Progress value={pct(checksDone, checksTotal)} tone="success" label={`Checklist de ${s.name}`} />
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between font-mono text-[12px] text-text-faint">
                  <span className="flex items-center gap-1.5">
                    {openItems ? (
                      <>
                        <MessageSquareWarning className="size-3.5 text-warning" /> {openItems} {openItems === 1 ? "cambio pedido" : "cambios pedidos"}
                      </>
                    ) : (
                      label(L.siteStack, s.stack)
                    )}
                  </span>
                  <span>{relativeFromDate(s.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<LayoutTemplate />}
          title={filtered ? "No hay sitios con esos filtros" : "Todavía no hay sitios"}
          description={
            filtered
              ? "Probá con otro estado o cliente."
              : "Cada sitio trae su briefing por tipo, la estructura de páginas, el seguimiento de contenidos y el checklist de lanzamiento de 17 áreas."
          }
          action={
            filtered ? (
              <Button asChild variant="secondary">
                <Link href="/sitios">Ver todos</Link>
              </Button>
            ) : (
              <Button asChild variant="primary">
                <Link href="/sitios/nuevo">
                  <Plus className="size-4" /> Crear el primer sitio
                </Link>
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
