import { formatDate, formatDateTime, formatMoney, L, label, todayAR } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { diffVersions } from "@agencyos/modules/quotes/calc";
import { acceptancePreview, editorOptions, getQuote, getQuoteDocument, shareText } from "@agencyos/modules/quotes/queries";
import { Badge, Button, Card, PageHeader, SectionLabel, Tabs } from "@agencyos/ui";
import { ArrowRight, FolderKanban, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { EntitySide } from "@/components/collab/entity-side";
import { PublicLinkSheet } from "@/components/quotes/public-link";
import { AcceptSheet, NewVersionButton, PdfButton, QuoteMenu, RejectSheet, SendSheet } from "@/components/quotes/quote-actions";
import { QuoteEditor } from "@/components/quotes/quote-editor";
import { QuotePreviewFrame } from "@/components/quotes/quote-preview-frame";
import { QuoteStatusBadge } from "@/components/quotes/status-badge";
import { requireCtx } from "@/lib/session";
import { draftFromVersion, previewHtml, previewState } from "../../lib";

const TABS = [
  { key: "vista-previa", label: "Vista previa" },
  { key: "editar", label: "Editar" },
  { key: "versiones", label: "Versiones" },
  { key: "actividad", label: "Actividad" },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = (await params).id;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getQuote(ctx, id) : null;
  return { title: d ? `${d.q.number} · ${d.q.title}` : "Presupuesto" };
}

const KIND_LABEL = { added: "Agregado", removed: "Quitado", changed: "Cambiado", same: "Sin cambios" } as const;
const KIND_TONE = { added: "success", removed: "danger", changed: "warning", same: "neutral" } as const;
const TOTAL_LABEL = { subtotal: "Subtotal", discountTotal: "Descuentos", total: "Total" } as const;

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id, tab: tabParts } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tab = TABS.find((t) => t.key === tabParts?.[0])?.key ?? "vista-previa";
  const ctx = await requireCtx();
  const data = await getQuote(ctx, id);
  if (!data?.current) notFound();
  const { q, current: v } = data;
  const doc = await getQuoteDocument(ctx, id);
  if (!doc) notFound();
  const today = todayAR();
  const editable = q.status === "draft" && !v.lockedAt;
  const maxVersion = Math.max(...data.versions.map((x) => x.version));
  const text = shareText(doc, data.contactName);
  const canDecide = ["sent", "viewed", "expired"].includes(q.status);
  const accept = canDecide ? await acceptancePreview(ctx, data) : null;
  const money = (a: string) => formatMoney(a, v.currency);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {q.number} · v{v.version}
            </span>
            {data.clientName ? (
              <Link href={`/crm/clientes/${q.clientId}`} className="hover:text-text">
                · {data.clientName}
              </Link>
            ) : null}
          </span>
        }
        title={q.title}
        accent="#A78BFA"
        actions={
          <>
            <PdfButton id={id} />
            {["sent", "viewed"].includes(q.status) ? (
              <PublicLinkSheet
                id={id}
                number={q.number}
                hasLink={Boolean(q.publicTokenHash && q.publicExpiresAt && q.publicExpiresAt > new Date())}
                contactEmail={data.contactEmail ?? null}
                emailEnabled={Boolean(process.env.BREVO_API_KEY)}
              />
            ) : null}
            {q.status === "draft" ? <SendSheet id={id} number={q.number} text={text} validUntil={v.validUntil} today={today} /> : null}
            {canDecide && accept ? (
              <>
                <RejectSheet id={id} number={q.number} />
                <AcceptSheet
                  id={id}
                  number={q.number}
                  canCreateProject={!q.projectId}
                  templateName={accept.templateName}
                  title={q.title}
                  opportunityTitle={data.opportunityTitle && !["won", "lost"].includes(data.opportunityStage ?? "") ? data.opportunityTitle : null}
                  schedule={accept.schedule.map((s) => ({ label: s.label, amount: s.amount, dueDate: s.dueDate }))}
                  currency={v.currency}
                  planLabel={label(L.paymentPlanKind, v.paymentPlan.kind)}
                />
              </>
            ) : null}
            {q.projectId ? (
              <Button asChild variant="secondary">
                <Link href={`/proyectos/${q.projectId}`}>
                  <FolderKanban className="size-4" /> Ver proyecto
                </Link>
              </Button>
            ) : null}
            <QuoteMenu id={id} number={q.number} status={q.status} text={text} nextVersion={maxVersion + 1} />
          </>
        }
      />
      <Tabs
        active={tab}
        items={TABS.map((t) => ({
          ...t,
          href: `/presupuestos/${id}${t.key === "vista-previa" ? "" : `/${t.key}`}`,
          count: t.key === "versiones" ? data.versions.length : undefined,
        }))}
      />

      {tab === "vista-previa" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="order-2 lg:order-1">
            <QuotePreviewFrame html={previewHtml(doc)} className="h-[78dvh]" />
          </div>
          <div className="order-1 flex flex-col gap-5 lg:order-2">
            <Card className="p-5">
              <SectionLabel className="mb-4">Propiedades</SectionLabel>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[14px]">
                <dt className="text-text-muted">Estado</dt>
                <dd>
                  <QuoteStatusBadge status={q.status} />
                </dd>
                <dt className="text-text-muted">Total</dt>
                <dd className="font-mono text-[17px] font-semibold text-text" data-testid="quote-total">
                  {money(v.total)}
                </dd>
                <dt className="text-text-muted">Subtotal</dt>
                <dd className="font-mono">{money(v.subtotal)}</dd>
                <dt className="text-text-muted">Descuentos</dt>
                <dd className="font-mono">−{money(v.discountTotal)}</dd>
                <dt className="text-text-muted">Plan</dt>
                <dd>{label(L.paymentPlanKind, v.paymentPlan.kind)}</dd>
                <dt className="text-text-muted">Cliente</dt>
                <dd className="truncate">{data.clientName ?? "—"}</dd>
                <dt className="text-text-muted">Contacto</dt>
                <dd className="truncate">{data.contactName ?? "—"}</dd>
                <dt className="text-text-muted">Oportunidad</dt>
                <dd className="truncate">
                  {q.opportunityId ? (
                    <Link href={`/crm/oportunidades/${q.opportunityId}`} className="hover:underline">
                      {data.opportunityTitle} <span className="text-text-faint">· {label(L.stage, data.opportunityStage)}</span>
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-text-muted">Fecha</dt>
                <dd className="font-mono">{formatDate(v.issueDate)}</dd>
                <dt className="text-text-muted">Válido hasta</dt>
                <dd className={`font-mono ${["sent", "viewed"].includes(q.status) && v.validUntil < today ? "text-warning" : ""}`}>
                  {formatDate(v.validUntil)}
                </dd>
                {q.sentAt ? (
                  <>
                    <dt className="text-text-muted">Enviado</dt>
                    <dd className="font-mono">{formatDateTime(q.sentAt)}</dd>
                  </>
                ) : null}
                {q.decidedAt ? (
                  <>
                    <dt className="text-text-muted">Decidido</dt>
                    <dd className="font-mono">{formatDateTime(q.decidedAt)}</dd>
                  </>
                ) : null}
              </dl>
            </Card>
            {q.projectId || data.receivables.length ? (
              <Card className="p-5">
                <SectionLabel className="mb-3">Conectado con</SectionLabel>
                {q.projectId ? (
                  <Link href={`/proyectos/${q.projectId}`} className="mb-3 flex items-center gap-2 text-[14px] text-text hover:underline">
                    <FolderKanban className="size-4 text-[#7C5CFF]" /> {data.projectName ?? "Proyecto"}
                  </Link>
                ) : null}
                {data.receivables.length ? (
                  <ul className="flex flex-col gap-1.5 text-[13px]" aria-label="Cobros">
                    {data.receivables.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-text-muted">
                          {r.concept.replace(`${q.number} · `, "")} · {formatDate(r.dueDate)}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="whitespace-nowrap font-mono text-text">{formatMoney(r.amount, r.currency)}</span>
                          <Badge tone={r.status === "paid" ? "success" : "neutral"}>{label(L.receivableStatus, r.status)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            ) : null}
            <EntitySide ctx={ctx} type="quote" id={id} />
          </div>
        </div>
      ) : null}

      {tab === "editar" ? (
        editable ? (
          await (async () => {
            const opts = await editorOptions(ctx);
            const items = data.versions.find((x) => x.id === v.id)?.items ?? [];
            return (
              <QuoteEditor
                quoteId={id}
                number={q.number}
                version={v.version}
                initial={draftFromVersion(q, v, items)}
                options={{
                  ...opts,
                  clients: opts.clients.some((c) => c.id === q.clientId)
                    ? opts.clients
                    : [...opts.clients, { id: q.clientId, name: data.clientName ?? "Cliente" }],
                }}
                initialPreview={previewState(doc)}
              />
            );
          })()
        ) : (
          <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-text-muted">
              <Lock className="size-4" />
            </span>
            <div className="flex-1">
              <p className="text-[15px] font-medium text-text">La versión v{v.version} es de solo lectura</p>
              <p className="mt-0.5 text-[14px] text-text-muted">
                {q.status === "accepted" || q.status === "void"
                  ? `El presupuesto está ${label(L.quoteStatus, q.status).toLowerCase()}: ya no admite cambios.`
                  : `Se envió${q.sentAt ? ` el ${formatDate(q.sentAt)}` : ""}. Un presupuesto enviado no se edita: creá la versión v${maxVersion + 1} (se copian los ítems y los textos) y volvé a enviarla.`}
              </p>
            </div>
            {["sent", "viewed", "expired", "rejected"].includes(q.status) ? <NewVersionButton id={id} next={maxVersion + 1} variant="primary" /> : null}
          </Card>
        )
      ) : null}

      {tab === "versiones" ? <VersionsTab id={id} data={data} a={sp.a} b={sp.b} money={money} /> : null}

      {tab === "actividad" ? (
        <Card className="p-5">
          <ActivityList rows={await listActivity(ctx, { entityType: "quote", entityId: id, limit: 100 })} />
        </Card>
      ) : null}
    </div>
  );
}

function VersionsTab({
  id,
  data,
  a,
  b,
  money,
}: {
  id: string;
  data: NonNullable<Awaited<ReturnType<typeof getQuote>>>;
  a?: string;
  b?: string;
  money: (v: string) => string;
}) {
  const versions = data.versions;
  const byNo = (n?: string) => versions.find((v) => String(v.version) === n);
  const after = byNo(b) ?? versions[0];
  const before = byNo(a) ?? versions.find((v) => after && v.version < after.version) ?? versions[1];
  const diff = before && after && before.id !== after.id ? diffVersions(before, after) : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <ol className="flex flex-col gap-2">
        {versions.map((v) => (
          <li key={v.id}>
            <Card className="flex items-center gap-3 p-4">
              <span className="font-mono text-[15px] font-semibold text-text">v{v.version}</span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[14px] text-text">{money(v.total)}</p>
                <p className="text-[12px] text-text-muted">
                  {formatDate(v.issueDate)} · {v.lockedAt ? `bloqueada ${formatDate(v.lockedAt)}` : "borrador"}
                  {v.id === data.q.currentVersionId ? " · actual" : ""}
                </p>
              </div>
              <a
                href={`/api/presupuestos/${id}/pdf?version=${v.id}`}
                download
                className="text-[13px] text-text-muted hover:text-text"
                aria-label={`Descargar PDF de la versión ${v.version}`}
              >
                PDF
              </a>
            </Card>
          </li>
        ))}
      </ol>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <SectionLabel>Comparar versiones</SectionLabel>
          {versions.length > 1 ? (
            <form className="flex items-end gap-2" action={`/presupuestos/${id}/versiones`}>
              <label className="flex flex-col gap-1 text-[12px] text-text-muted">
                Antes
                <select
                  name="a"
                  defaultValue={before ? String(before.version) : ""}
                  className="h-10 rounded-[var(--radius-control)] border border-border bg-bg-elevated px-2 text-base md:text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
              <ArrowRight className="mb-3 size-4 text-text-faint" />
              <label className="flex flex-col gap-1 text-[12px] text-text-muted">
                Después
                <select
                  name="b"
                  defaultValue={after ? String(after.version) : ""}
                  className="h-10 rounded-[var(--radius-control)] border border-border bg-bg-elevated px-2 text-base md:text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="secondary">
                Comparar
              </Button>
            </form>
          ) : null}
        </div>
        {versions.length < 2 ? (
          <p className="text-[14px] text-text-muted">Hay una sola versión. Cuando edites un presupuesto ya enviado se crea la v2 y acá vas a ver qué cambió.</p>
        ) : !diff ? (
          <p className="text-[14px] text-text-muted">Elegí dos versiones distintas.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border" aria-label="Diferencias de ítems">
              {diff.items.map((it, i) => {
                const cur = it.kind === "removed" ? it.before : it.after;
                const prev = it.kind === "added" ? null : it.before;
                return (
                  <li key={`${it.kind}-${i}`} className="flex flex-col gap-1.5 p-3 md:flex-row md:items-center md:gap-4">
                    <Badge tone={KIND_TONE[it.kind]} className="w-fit">
                      {KIND_LABEL[it.kind]}
                    </Badge>
                    <span className={`min-w-0 flex-1 text-[14px] ${it.kind === "removed" ? "text-text-muted line-through" : "text-text"}`}>
                      {cur.description}
                    </span>
                    <span className="flex flex-wrap gap-x-2 font-mono text-[13px] text-text-muted">
                      {prev && it.kind === "changed" ? (
                        <span className="whitespace-nowrap">
                          {Number(prev.quantity)} × {money(prev.unitPrice)} = {money(prev.lineTotal)} <span className="text-text-faint">→</span>
                        </span>
                      ) : null}
                      <span className="whitespace-nowrap text-text">
                        {Number(cur.quantity)} × {money(cur.unitPrice)} = {money(cur.lineTotal)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <dl className="flex flex-col divide-y divide-border text-[14px]">
              {diff.totals.map((t) => (
                <div key={t.field} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <dt className={t.field === "total" ? "font-medium text-text" : "text-text-muted"}>{TOTAL_LABEL[t.field]}</dt>
                  <dd className="flex flex-wrap items-baseline justify-end gap-x-3 font-mono">
                    <span className="whitespace-nowrap text-text-muted">
                      {money(t.before)} → <span className="text-text">{money(t.after)}</span>
                    </span>
                    <span className={`whitespace-nowrap ${Number(t.delta) === 0 ? "text-text-faint" : Number(t.delta) > 0 ? "text-success" : "text-danger"}`}>
                      {Number(t.delta) > 0 ? "+" : Number(t.delta) < 0 ? "−" : "±"}
                      {money(t.delta.replace("-", ""))}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            {diff.currencyChanged ? <p className="text-[13px] text-warning">Ojo: las versiones están en monedas distintas.</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
