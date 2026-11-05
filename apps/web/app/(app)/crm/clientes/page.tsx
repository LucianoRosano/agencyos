import { L, label, relativeFromDate } from "@agencyos/core";
import { clientStatusCounts, listClients } from "@agencyos/modules/crm/queries";
import { Badge, Button, EmptyState, PageHeader } from "@agencyos/ui";
import { BriefcaseBusiness, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { filterByTag, ListToolbar } from "@/components/collab/list-toolbar";
import { CrmNav, FilterChips, SearchBox } from "@/components/crm/crm-nav";
import { CLIENT_STATUS_TONE, CRM_ACCENT } from "@/components/crm/shared";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Clientes" };

const FILTERS = ["todos", "prospect", "active", "paused", "finished", "archived"] as const;
const PLURAL: Record<string, string> = {
  todos: "Todos",
  prospect: "Prospectos",
  active: "Activos",
  paused: "En pausa",
  finished: "Terminados",
  archived: "Archivados",
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const status = FILTERS.find((f) => f === sp.estado && f !== "todos");
  const spaceId = await getSelectedSpace();
  const [allRows, counts] = await Promise.all([listClients(ctx, { status, q: sp.q, spaceId }), clientStatusCounts(ctx, spaceId)]);
  const rows = await filterByTag(ctx, "client", sp.etiqueta, allRows, (r) => r.c.id);
  const notArchived = Object.entries(counts).reduce((a, [k, n]) => (k === "archived" ? a : a + n), 0);
  const href = (k: string) => `/crm/clientes?${new URLSearchParams({ estado: k, ...(sp.q ? { q: sp.q } : {}) })}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="CRM"
        title="Clientes"
        accent={CRM_ACCENT}
        actions={
          <Button asChild variant="primary">
            <Link href="/crm/clientes/nuevo">
              <Plus className="size-4" /> Nuevo cliente
            </Link>
          </Button>
        }
      />
      <CrmNav active="clientes" />
      <FilterChips
        active={status ?? "todos"}
        items={FILTERS.map((k) => ({ key: k, label: PLURAL[k] ?? k, href: href(k), count: k === "todos" ? notArchived : (counts[k] ?? 0) }))}
      />
      <SearchBox action="/crm/clientes" q={sp.q} placeholder="Buscar por nombre, rubro o ciudad…" hidden={{ estado: sp.estado, etiqueta: sp.etiqueta }} />
      <ListToolbar ctx={ctx} module="clientes" basePath="/crm/clientes" sp={sp} />

      {rows.length ? (
        <>
          <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                  <th className="px-4 py-3 font-normal">Cliente</th>
                  <th className="px-3 py-3 font-normal">Estado</th>
                  <th className="px-3 py-3 font-normal">Contacto</th>
                  <th className="px-3 py-3 font-normal">Rubro · ciudad</th>
                  <th className="px-3 py-3 text-right font-normal">Oport.</th>
                  <th className="px-3 py-3 text-right font-normal">Proy.</th>
                  <th className="px-4 py-3 text-right font-normal">Actividad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, primaryContact, openOpps, activeProjects }) => (
                  <tr key={c.id} className="group border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="max-w-[280px] px-4 py-3">
                      <Link href={`/crm/clientes/${c.id}`} className="block truncate font-medium text-text group-hover:underline">
                        {c.name}
                      </Link>
                      {c.tradeName ? <span className="block truncate text-[12px] text-text-muted">{c.tradeName}</span> : null}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={CLIENT_STATUS_TONE[c.status]}>{label(L.clientStatus, c.status)}</Badge>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-text-muted">{primaryContact ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-text-muted">{[c.industry, c.city].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-text-muted">{openOpps || "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] text-text-muted">{activeProjects || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] whitespace-nowrap text-text-faint">
                      {relativeFromDate(c.lastActivityAt ?? c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2.5 md:hidden">
            {rows.map(({ c, primaryContact, openOpps }) => (
              <li key={c.id}>
                <Link
                  href={`/crm/clientes/${c.id}`}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 active:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[15px] font-medium text-text">{c.name}</p>
                      <Badge tone={CLIENT_STATUS_TONE[c.status]}>{label(L.clientStatus, c.status)}</Badge>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-text-muted">
                      {[primaryContact, c.industry, c.city].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-text-faint">
                      {openOpps ? `${openOpps} oport. abiertas · ` : ""}
                      {relativeFromDate(c.lastActivityAt ?? c.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          icon={<BriefcaseBusiness />}
          title={
            sp.q ? `Sin resultados para «${sp.q}»` : status ? `No hay clientes «${label(L.clientStatus, status).toLowerCase()}»` : "Todavía no hay clientes"
          }
          description="Registrá clientes y prospectos con su contacto principal; desde la ficha seguís conversaciones, oportunidades, proyectos y dinero."
          action={
            <Button asChild variant="primary">
              <Link href="/crm/clientes/nuevo">
                <Plus className="size-4" /> Nuevo cliente
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
