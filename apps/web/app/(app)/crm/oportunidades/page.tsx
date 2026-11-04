import { formatMoney } from "@agencyos/core";
import { listOpportunities, quotesOfClients } from "@agencyos/modules/crm/queries";
import { Button, EmptyState, PageHeader } from "@agencyos/ui";
import { Columns3, Handshake, List, Plus } from "lucide-react";
import Link from "next/link";
import { CrmNav, SearchBox } from "@/components/crm/crm-nav";
import { NewOpportunitySheet } from "@/components/crm/opportunity-form";
import { type PipelineOpp, PipelineView } from "@/components/crm/pipeline";
import { CRM_ACCENT, OPEN_STAGES, weightedByCurrency } from "@/components/crm/shared";
import { clientOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Oportunidades" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const view = sp.vista === "tabla" ? "tabla" : "kanban";
  const [rows, clients] = await Promise.all([listOpportunities(ctx, { q: sp.q }), clientOpts(ctx)]);
  const quotes = await quotesOfClients(ctx, [...new Set(rows.map((r) => r.o.clientId))]);
  const opps: PipelineOpp[] = rows.map(({ o, clientName }) => ({
    id: o.id, title: o.title, stage: o.stage, clientId: o.clientId, clientName, lostReason: o.lostReason,
    hasQuote: quotes.some((q) => q.opportunityId === o.id),
    valueAmount: o.valueAmount, valueCurrency: o.valueCurrency, probability: o.probability, nextAction: o.nextAction, nextActionDue: o.nextActionDue, expectedClose: o.expectedClose,
  }));
  const open = opps.filter((o) => OPEN_STAGES.includes(o.stage));
  const weighted = weightedByCurrency(open);
  const qs = (o: Record<string, string>) => `/crm/oportunidades?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), vista: view, ...o })}`;
  const newBtn = (
    <NewOpportunitySheet
      clients={clients}
      openInitially={sp.nueva === "1"}
      defaultClientId={sp.cliente}
      trigger={<Button variant="primary" disabled={!clients.length}><Plus className="size-4" /> Nueva oportunidad</Button>}
    />
  );

  return (
    <div className="mx-auto max-w-[1920px]">
      <PageHeader
        eyebrow="CRM · Pipeline"
        title="Oportunidades"
        accent={CRM_ACCENT}
        description={
          open.length ? (
            <span className="font-mono text-[13px]">
              {open.length} abiertas · ponderado {weighted.length ? weighted.map(([cur, v]) => formatMoney(v, cur)).join(" + ") : "—"}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button asChild variant="ghost" aria-label={view === "kanban" ? "Ver como tabla" : "Ver como kanban"}>
              <Link href={qs({ vista: view === "kanban" ? "tabla" : "kanban" })}>{view === "kanban" ? <List className="size-4" /> : <Columns3 className="size-4" />} {view === "kanban" ? "Tabla" : "Kanban"}</Link>
            </Button>
            {newBtn}
          </>
        }
      />
      <CrmNav active="oportunidades" />
      <SearchBox action="/crm/oportunidades" q={sp.q} placeholder="Buscar por título o cliente…" hidden={{ vista: sp.vista }} />
      {opps.length ? (
        <PipelineView view={view} opps={opps} quotes={quotes} />
      ) : (
        <EmptyState
          icon={<Handshake />}
          title={sp.q ? `Sin resultados para «${sp.q}»` : "El pipeline está vacío"}
          description={clients.length ? "Cada oportunidad avanza de «Nuevo» a «Ganada» (y ahí creás el proyecto) o «Perdida» con su motivo." : "Primero creá un cliente o prospecto; después abrís su oportunidad."}
          action={clients.length ? newBtn : <Button asChild variant="primary"><Link href="/crm/clientes/nuevo"><Plus className="size-4" /> Nuevo cliente</Link></Button>}
        />
      )}
    </div>
  );
}
