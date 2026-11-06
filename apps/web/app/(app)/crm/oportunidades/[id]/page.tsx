import { formatDate, formatDateTime, formatMoney, L, label, percentOf } from "@agencyos/core";
import { opportunityServices, serviceCatalog } from "@agencyos/modules/crm/opportunity-services";
import { getOpportunity } from "@agencyos/modules/crm/queries";
import { pipelineFor } from "@agencyos/modules/crm/stages";
import { Badge, BlockCard, Card, cn, PageHeader, SectionLabel } from "@agencyos/ui";
import { Activity, CornerDownRight, FileSignature, Info, Route, Shapes } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { EntitySide } from "@/components/collab/entity-side";
import { EditOpportunitySheet, OpportunityMenu } from "@/components/crm/opportunity-form";
import { OpportunityServices } from "@/components/crm/opportunity-services";
import { LinkedQuotes, OpportunityStage } from "@/components/crm/opportunity-stage";
import { CRM_ACCENT, dueTone } from "@/components/crm/shared";
import { clientOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const o = await getOpportunity(ctx, (await params).id);
  return { title: o?.o.title ?? "Oportunidad" };
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await getOpportunity(ctx, id);
  if (!data) notFound();
  const { o, clientName } = data;
  const quotesOn = ctx.workspace.enabledModules.includes("quotes");
  const [clients, { stages, stageOf }, interest, catalog] = await Promise.all([
    clientOpts(ctx),
    pipelineFor(ctx, [o]),
    opportunityServices(ctx, o.id),
    serviceCatalog(ctx),
  ]);
  const stageKey = stageOf.get(o.id) ?? o.stage;
  const stageLabel = stages.find((s) => s.key === stageKey)?.name ?? label(L.stage, o.stage);
  if (!clients.some((c) => c.value === o.clientId)) clients.unshift({ value: o.clientId, label: clientName });
  const due = dueTone(o.nextActionDue);
  const closed = o.stage === "won" || o.stage === "lost";
  const lite = {
    id: o.id,
    title: o.title,
    stage: stageKey,
    clientId: o.clientId,
    clientName,
    lostReason: o.lostReason,
    hasQuote: data.linkedQuotes.length > 0,
  };
  const quotes = data.quotes.map((q) => ({ ...q, clientId: o.clientId }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            <Link href="/crm/oportunidades" className="hover:text-text">
              Oportunidad
            </Link>
            ·{" "}
            <Link href={`/crm/clientes/${o.clientId}`} className="hover:text-text">
              {clientName}
            </Link>
          </span>
        }
        title={o.title}
        accent={CRM_ACCENT}
        actions={
          <>
            <EditOpportunitySheet
              id={o.id}
              clients={clients}
              defaults={{
                clientId: o.clientId,
                title: o.title,
                valueAmount: o.valueAmount,
                valueCurrency: o.valueCurrency,
                probability: o.probability,
                expectedClose: o.expectedClose,
                nextAction: o.nextAction,
                nextActionDue: o.nextActionDue,
              }}
            />
            <OpportunityMenu id={o.id} title={o.title} />
          </>
        }
      />

      <Card className="mb-5 p-4 md:p-5">
        <SectionLabel icon={<Route />} className="mb-4">
          Etapa · {stageLabel}
        </SectionLabel>
        <OpportunityStage opp={lite} quotes={quotes} stages={stages} />
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {!closed ? (
            <BlockCard icon={<CornerDownRight />} title="Próxima acción">
              {o.nextAction ? (
                <p className="flex flex-wrap items-baseline gap-x-3 text-[15px] text-text">
                  {o.nextAction}
                  {due ? (
                    <span className={cn("font-mono text-[13px]", due.cls)}>
                      {due.text} · {formatDate(o.nextActionDue)}
                    </span>
                  ) : (
                    <span className="text-[13px] text-text-faint">sin fecha</span>
                  )}
                </p>
              ) : (
                <p className="text-[14px] text-text-faint">Sin próxima acción. Editala: con fecha, aparece en Hoy.</p>
              )}
            </BlockCard>
          ) : null}
          <BlockCard icon={<Shapes />} title="Servicios de interés">
            <OpportunityServices
              opportunityId={o.id}
              clientId={o.clientId}
              selected={interest.map((s) => ({ id: s.id, name: s.name }))}
              catalog={catalog}
              canQuote={quotesOn && !closed}
            />
          </BlockCard>
          <BlockCard icon={<FileSignature />} title="Presupuesto">
            <LinkedQuotes opportunityId={o.id} clientId={o.clientId} quotes={data.linkedQuotes.map((q) => ({ ...q, clientId: o.clientId }))} />
          </BlockCard>
          <BlockCard icon={<Activity />} title="Actividad">
            <ActivityList rows={data.activity} />
          </BlockCard>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="h-fit p-5">
            <SectionLabel icon={<Info />} className="mb-4">
              Propiedades
            </SectionLabel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
              <dt className="text-text-muted">Etapa</dt>
              <dd>
                <Badge tone={o.stage === "won" ? "success" : o.stage === "lost" ? "danger" : "info"}>{stageLabel}</Badge>
              </dd>
              <dt className="text-text-muted">Cliente</dt>
              <dd className="min-w-0 truncate">
                <Link href={`/crm/clientes/${o.clientId}`} className="text-text hover:underline">
                  {clientName}
                </Link>
              </dd>
              <dt className="text-text-muted">Valor</dt>
              <dd className="font-mono text-[13px]">{o.valueAmount ? formatMoney(o.valueAmount, o.valueCurrency) : "—"}</dd>
              <dt className="text-text-muted">Probabilidad</dt>
              <dd className="font-mono text-[13px]">{o.probability}%</dd>
              <dt className="text-text-muted">Ponderado</dt>
              <dd className="font-mono text-[13px]">{o.valueAmount ? formatMoney(percentOf(o.valueAmount, o.probability), o.valueCurrency) : "—"}</dd>
              <dt className="text-text-muted">Cierre est.</dt>
              <dd className="font-mono text-[13px]">{formatDate(o.expectedClose)}</dd>
              {o.wonAt ? (
                <>
                  <dt className="text-text-muted">Ganada</dt>
                  <dd className="font-mono text-[13px]">{formatDateTime(o.wonAt)}</dd>
                </>
              ) : null}
              {o.lostAt ? (
                <>
                  <dt className="text-text-muted">Perdida</dt>
                  <dd className="font-mono text-[13px]">{formatDateTime(o.lostAt)}</dd>
                  <dt className="text-text-muted">Motivo</dt>
                  <dd>{label(L.lostReason, o.lostReason)}</dd>
                </>
              ) : null}
              <dt className="text-text-muted">Alta</dt>
              <dd className="font-mono text-[13px]">{formatDate(o.createdAt)}</dd>
            </dl>
          </Card>
          <EntitySide ctx={ctx} type="opportunity" id={o.id} />
        </div>
      </div>
    </div>
  );
}
