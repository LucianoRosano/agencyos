import { formatDate, formatMoney, formatTime, L, label, relativeFromDate, subMoney, todayAR } from "@agencyos/core";
import { clientActivity, clientMoney, contactOptions, getClient, mergeCandidates, nextStepsOf } from "@agencyos/modules/crm/queries";
import { Badge, BlockCard, Button, Card, cn, Dot, EmptyState, PageHeader, SectionLabel, Tabs } from "@agencyos/ui";
import {
  BriefcaseBusiness,
  CircleDollarSign,
  CornerDownRight,
  FilePlus2,
  FileSignature,
  FolderKanban,
  FolderPlus,
  Globe,
  Handshake,
  Info,
  ListTodo,
  MessageSquarePlus,
  NotebookText,
  Plus,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { EditClientSheet } from "@/components/crm/client-form";
import { ClientMenu, ClientStatusSelect } from "@/components/crm/client-menu";
import { ClientStory } from "@/components/crm/client-story";
import { ClientContactMenu, LinkContactSheet, NewContactSheet } from "@/components/crm/contact-forms";
import { ContactLinks } from "@/components/crm/contact-links";
import { FiscalCard } from "@/components/crm/fiscal-card";
import { InteractionForm, InteractionSheet, NextStepDone } from "@/components/crm/interaction-form";
import { NewOpportunitySheet } from "@/components/crm/opportunity-form";
import { type PipelineOpp, PipelineView } from "@/components/crm/pipeline";
import { CLIENT_STATUS_TONE, CRM_ACCENT, dueTone, OPEN_STAGES, STAGE_COLOR } from "@/components/crm/shared";
import { MarkdownView } from "@/components/markdown";
import { ProjectCard } from "@/components/project-card";
import { renderMarkdown } from "@/lib/markdown";
import { spaceOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

const ALL_TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "contactos", label: "Contactos" },
  { key: "interacciones", label: "Interacciones" },
  { key: "oportunidades", label: "Oportunidades" },
  { key: "proyectos", label: "Proyectos" },
  { key: "presupuestos", label: "Presupuestos" },
  { key: "dinero", label: "Dinero" },
  { key: "actividad", label: "Actividad" },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const c = await getClient(ctx, (await params).id);
  return { title: c?.c.name ?? "Cliente" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string; tab?: string[] }> }) {
  const { id, tab: tabParts } = await params;
  const ctx = await requireCtx();
  const data = await getClient(ctx, id);
  if (!data) notFound();
  const { c } = data;
  const TABS = ALL_TABS.filter((t) => t.key !== "dinero" || data.canSeeMoney);
  const tab = TABS.find((t) => t.key === tabParts?.[0])?.key ?? "resumen";
  const base = `/crm/clientes/${id}`;
  const now = new Date();
  const nowAR = { date: todayAR(now), time: formatTime(now) };
  const contactOpts = data.contacts.map(({ ct }) => ({ value: ct.id, label: ct.name }));
  const openOpps = data.opportunities.filter((o) => OPEN_STAGES.includes(o.stage));
  const activeProjects = data.projects.filter((p) => !p.archivedAt && !["done", "archived"].includes(p.status));
  const steps = nextStepsOf(data);
  const [spaces, merge, allContacts] = await Promise.all([
    spaceOpts(ctx),
    mergeCandidates(ctx, id),
    tab === "contactos" ? contactOptions(ctx) : Promise.resolve([]),
  ]);
  const linked = new Set(data.contacts.map((x) => x.ct.id));
  const pipelineOpps: PipelineOpp[] = data.opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    stage: o.stage,
    clientId: c.id,
    clientName: c.name,
    lostReason: o.lostReason,
    hasQuote: data.quotes.some((q) => q.opportunityId === o.id),
    valueAmount: o.valueAmount,
    valueCurrency: o.valueCurrency,
    probability: o.probability,
    nextAction: o.nextAction,
    nextActionDue: o.nextActionDue,
    expectedClose: o.expectedClose,
  }));
  const newProjectHref = `/proyectos/nuevo?cliente=${id}`;
  const newQuoteHref = `/presupuestos/nuevo?cliente=${id}`;
  const newOpp = (label = "Nueva oportunidad", variant: "secondary" | "ghost" | "primary" = "secondary") => (
    <NewOpportunitySheet
      clientId={id}
      trigger={
        <Button variant={variant} size={variant === "ghost" ? "sm" : "md"}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    />
  );
  const counts: Record<string, number | undefined> = {
    contactos: data.contacts.length,
    interacciones: data.interactions.length,
    oportunidades: openOpps.length || undefined,
    proyectos: data.projects.length || undefined,
    presupuestos: data.quotes.length || undefined,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            <Link href="/crm/clientes" className="hover:text-text">
              Cliente
            </Link>
            · {label(L.relationship, c.relationship)}
            {data.spaceName ? (
              <>
                ·{" "}
                <span className="inline-flex items-center gap-1.5">
                  <Dot color={data.spaceColor ?? CRM_ACCENT} />
                  {data.spaceName}
                </span>
              </>
            ) : null}
          </span>
        }
        title={c.name}
        description={[c.tradeName, c.industry, [c.city, c.province].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || undefined}
        accent={CRM_ACCENT}
        actions={
          <>
            <ClientStatusSelect id={c.id} status={c.status} />
            <InteractionSheet
              clientId={id}
              contacts={contactOpts}
              now={nowAR}
              trigger={
                <Button variant="primary">
                  <MessageSquarePlus className="size-4" /> Registrar interacción
                </Button>
              }
            />
            <EditClientSheet
              id={id}
              spaces={spaces}
              defaults={{
                name: c.name,
                tradeName: c.tradeName,
                industry: c.industry,
                website: c.website,
                city: c.city,
                province: c.province,
                relationship: c.relationship,
                status: c.status,
                source: c.source,
                spaceId: c.spaceId,
                notesMd: c.notesMd,
              }}
            />
            <ClientMenu
              id={id}
              name={c.name}
              status={c.status}
              projectCount={data.projects.filter((p) => !p.archivedAt).length}
              mergeOptions={merge.map((m) => ({ value: m.id, label: m.name }))}
            />
          </>
        }
      />
      <Tabs active={tab} items={TABS.map((t) => ({ ...t, href: t.key === "resumen" ? base : `${base}/${t.key}`, count: counts[t.key] }))} />

      {tab === "resumen" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <BlockCard icon={<ListTodo />} title="Próximos pasos">
              {steps.length ? (
                <ul className="flex flex-col divide-y divide-border">
                  {steps.map((s) => {
                    const due = dueTone(s.due);
                    return (
                      <li key={s.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <CornerDownRight className="size-4 shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <Link href={s.href} className="block text-[14px] text-text hover:underline">
                            {s.text}
                          </Link>
                          <p className="truncate text-[12px] text-text-muted">{s.source}</p>
                        </div>
                        {due ? <span className={cn("shrink-0 font-mono text-[12px]", due.cls)}>{due.text}</span> : null}
                        {s.interactionId ? <NextStepDone id={s.interactionId} text={s.text} due={s.due} /> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[14px] text-text-muted">
                  Sin próximos pasos. Al registrar una interacción u oportunidad, definí qué sigue y cuándo: aparece en Hoy.
                </p>
              )}
            </BlockCard>

            <BlockCard icon={<Handshake />} title="Oportunidades abiertas" action={newOpp("Nueva", "ghost")}>
              {openOpps.length ? (
                <ul className="flex flex-col gap-2">
                  {openOpps.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/crm/oportunidades/${o.id}`}
                        className="flex items-center gap-3 rounded-[10px] border border-border bg-bg-elevated px-3.5 py-2.5 hover:border-border-strong"
                      >
                        <Dot color={STAGE_COLOR[o.stage] ?? CRM_ACCENT} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-text">{o.title}</span>
                          <span className="font-mono text-[12px] text-text-muted">
                            {label(L.stage, o.stage)} · {o.probability}%
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[13px] text-text">{o.valueAmount ? formatMoney(o.valueAmount, o.valueCurrency) : "—"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-text-muted">No hay oportunidades abiertas.</p>
              )}
            </BlockCard>

            <BlockCard
              icon={<FolderKanban />}
              title="Proyectos activos"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href={newProjectHref}>
                    <FolderPlus className="size-4" /> Nuevo
                  </Link>
                </Button>
              }
            >
              {activeProjects.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeProjects.slice(0, 4).map((p) => (
                    <ProjectCard key={p.id} p={{ ...p, clientName: c.name }} />
                  ))}
                </div>
              ) : (
                <p className="text-[14px] text-text-muted">Sin proyectos activos.</p>
              )}
            </BlockCard>

            <BlockCard
              icon={<NotebookText />}
              title="Historia"
              action={
                <Link href={`${base}/interacciones`} className="text-[13px] text-text-muted hover:text-text">
                  ver conversaciones →
                </Link>
              }
            >
              <ClientStory
                interactions={data.interactions}
                opportunities={data.opportunities}
                projects={data.projects}
                quotes={data.quotes}
                createdAt={c.createdAt}
                limit={10}
              />
            </BlockCard>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Card className="p-5">
              <SectionLabel icon={<Info />} className="mb-4">
                Propiedades
              </SectionLabel>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
                <dt className="text-text-muted">Estado</dt>
                <dd>
                  <Badge tone={CLIENT_STATUS_TONE[c.status]}>{label(L.clientStatus, c.status)}</Badge>
                </dd>
                <dt className="text-text-muted">Relación</dt>
                <dd>{label(L.relationship, c.relationship)}</dd>
                <dt className="text-text-muted">Rubro</dt>
                <dd className="min-w-0 truncate">{c.industry ?? "—"}</dd>
                <dt className="text-text-muted">Sitio</dt>
                <dd className="min-w-0 truncate">
                  {c.website ? (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex max-w-full items-center gap-1.5 text-accent-2 hover:underline"
                    >
                      <Globe className="size-3.5 shrink-0" />
                      <span className="truncate">{c.website.replace(/^https?:\/\//, "")}</span>
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-text-muted">Ubicación</dt>
                <dd className="min-w-0 truncate">{[c.city, c.province].filter(Boolean).join(", ") || "—"}</dd>
                <dt className="text-text-muted">Origen</dt>
                <dd className="min-w-0 truncate">{c.source ?? "—"}</dd>
                <dt className="text-text-muted">Alta</dt>
                <dd className="font-mono text-[13px]">{formatDate(c.createdAt)}</dd>
                <dt className="text-text-muted">Actividad</dt>
                <dd>{relativeFromDate(c.lastActivityAt ?? c.createdAt)}</dd>
              </dl>
            </Card>

            <BlockCard
              icon={<Users />}
              title="Contactos"
              action={
                <Link href={`${base}/contactos`} className="text-[13px] text-text-muted hover:text-text">
                  todos →
                </Link>
              }
            >
              {data.contacts.length ? (
                <ul className="flex flex-col gap-3">
                  {data.contacts.slice(0, 3).map(({ ct, isPrimary, roleInClient }) => (
                    <li key={ct.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/crm/contactos/${ct.id}`} className="flex items-center gap-1.5 truncate text-[14px] text-text hover:underline">
                          {ct.name}
                          {isPrimary ? <Star className="size-3.5 shrink-0 fill-current text-warning" aria-label="Principal" /> : null}
                        </Link>
                        <p className="truncate text-[12px] text-text-muted">{roleInClient ?? ct.role ?? ct.email ?? ct.phone ?? "—"}</p>
                      </div>
                      <ContactLinks name={ct.name} email={ct.email} phone={ct.phone} whatsapp={ct.whatsapp} />
                    </li>
                  ))}
                </ul>
              ) : (
                <NewContactSheet
                  clientId={id}
                  trigger={
                    <Button size="sm" variant="secondary">
                      <UserPlus className="size-4" /> Agregar contacto
                    </Button>
                  }
                />
              )}
            </BlockCard>

            <FiscalCard clientId={id} count={data.fiscalCount} allowed={data.canSeeFiscal} />

            <BlockCard icon={<NotebookText />} title="Notas internas">
              <MarkdownView html={renderMarkdown(c.notesMd)} className="text-[14px]" empty="Sin notas. Editá el cliente para agregarlas (Markdown)." />
            </BlockCard>
          </div>
        </div>
      ) : null}

      {tab === "contactos" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap justify-end gap-2">
            <LinkContactSheet
              clientId={id}
              contacts={allContacts.filter((x) => !linked.has(x.id)).map((x) => ({ value: x.id, label: x.email ? `${x.name} · ${x.email}` : x.name }))}
            />
            <NewContactSheet
              clientId={id}
              trigger={
                <Button variant="primary">
                  <UserPlus className="size-4" /> Nuevo contacto
                </Button>
              }
            />
          </div>
          {data.contacts.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {data.contacts.map(({ ct, isPrimary, roleInClient }) => (
                <li key={ct.id}>
                  <Card className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/crm/contactos/${ct.id}`} className="truncate text-[15px] font-medium text-text hover:underline">
                          {ct.name}
                        </Link>
                        {isPrimary ? (
                          <Badge tone="warning">
                            <Star className="size-3 fill-current" /> Principal
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-text-muted">{roleInClient ?? ct.role ?? "Sin rol"}</p>
                      <p className="mt-2 truncate font-mono text-[12px] text-text-faint">
                        {[ct.email, ct.whatsapp ?? ct.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                      </p>
                      <ContactLinks name={ct.name} email={ct.email} phone={ct.phone} whatsapp={ct.whatsapp} className="mt-3" />
                    </div>
                    <ClientContactMenu clientId={id} contactId={ct.id} name={ct.name} isPrimary={isPrimary} roleInClient={roleInClient} />
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Users />}
              title="Sin contactos"
              description="Agregá a la persona con la que hablás: con su WhatsApp, le escribís con un toque."
            />
          )}
        </div>
      ) : null}

      {tab === "interacciones" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
          <Card className="order-2 p-5 lg:order-1">
            <SectionLabel className="mb-4">Conversaciones</SectionLabel>
            <ClientStory interactions={data.interactions} onlyInteractions />
          </Card>
          <Card className="order-1 h-fit p-5 lg:order-2">
            <SectionLabel icon={<MessageSquarePlus />} className="mb-4">
              Registro rápido
            </SectionLabel>
            <InteractionForm clientId={id} contacts={contactOpts} now={nowAR} compact />
          </Card>
        </div>
      ) : null}

      {tab === "oportunidades" ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">{newOpp("Nueva oportunidad", "primary")}</div>
          {pipelineOpps.length ? (
            <PipelineView view="tabla" opps={pipelineOpps} quotes={data.quotes.map((q) => ({ ...q, clientId: c.id }))} />
          ) : (
            <EmptyState
              icon={<Handshake />}
              title="Sin oportunidades"
              description="Una oportunidad sigue una venta posible por el pipeline hasta ganarla (y crear el proyecto) o perderla."
            />
          )}
        </div>
      ) : null}

      {tab === "proyectos" ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button asChild variant="primary">
              <Link href={newProjectHref}>
                <FolderPlus className="size-4" /> Nuevo proyecto
              </Link>
            </Button>
          </div>
          {data.projects.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.projects.map((p) => (
                <ProjectCard key={p.id} p={{ ...p, clientName: c.name, status: p.archivedAt ? "archived" : p.status }} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FolderKanban />}
              title="Sin proyectos"
              description="Arrancá uno con el asistente: plantilla, qué significa terminado y la primera acción."
            />
          )}
        </div>
      ) : null}

      {tab === "presupuestos" ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button asChild variant="primary">
              <Link href={newQuoteHref}>
                <FilePlus2 className="size-4" /> Nuevo presupuesto
              </Link>
            </Button>
          </div>
          {data.quotes.length ? (
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
              {data.quotes.map((q) => (
                <li key={q.id} className="border-b border-border last:border-0">
                  <Link href={`/presupuestos/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                    <FileSignature className="size-4 shrink-0 text-text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-text">{q.title}</span>
                      <span className="font-mono text-[12px] text-text-muted">
                        {q.number} · {formatDate(q.sentAt ?? q.createdAt)}
                      </span>
                    </span>
                    <Badge
                      tone={
                        q.status === "accepted"
                          ? "success"
                          : q.status === "rejected" || q.status === "expired"
                            ? "danger"
                            : q.status === "draft"
                              ? "neutral"
                              : "info"
                      }
                    >
                      {label(L.quoteStatus, q.status)}
                    </Badge>
                    <span className="hidden w-32 shrink-0 text-right font-mono text-[13px] text-text sm:block">
                      {q.total ? formatMoney(q.total, q.currency ?? "ARS") : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FileSignature />}
              title="Sin presupuestos"
              description="Los presupuestos del cliente aparecen acá; vinculalos a una oportunidad al pasarla a «Propuesta enviada»."
            />
          )}
        </div>
      ) : null}

      {tab === "dinero" && data.canSeeMoney ? <MoneyTab clientId={id} ctx={ctx} /> : null}

      {tab === "actividad" ? (
        <Card className="p-5">
          <ActivityList
            rows={
              await clientActivity(
                ctx,
                id,
                data.opportunities.map((o) => o.id),
              )
            }
          />
        </Card>
      ) : null}
    </div>
  );
}

async function MoneyTab({ clientId, ctx }: { clientId: string; ctx: Awaited<ReturnType<typeof requireCtx>> }) {
  const m = await clientMoney(ctx, clientId);
  const currencies = [...new Set([...m.collected.map((x) => x.currency), ...m.pending.map((x) => x.currency)])].sort();
  if (!currencies.length) {
    return (
      <EmptyState
        icon={<CircleDollarSign />}
        title="Sin movimientos con este cliente"
        description="Cuando registres cobros o cuentas por cobrar en Finanzas vinculadas a este cliente, aparecen acá por moneda."
      />
    );
  }
  const today = todayAR();
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {currencies.flatMap((cur) => {
          const col = m.collected.find((x) => x.currency === cur);
          const pen = m.pending.find((x) => x.currency === cur);
          return [
            <Card key={`c-${cur}`} className="p-4">
              <p className="text-[13px] text-text-muted">Cobrado · {cur}</p>
              <p className="mt-1 font-mono text-[20px] text-success">{formatMoney(col?.total ?? "0", cur)}</p>
              <p className="mt-1 font-mono text-[11px] text-text-faint">{col?.n ?? 0} ingresos</p>
            </Card>,
            <Card key={`p-${cur}`} className="p-4">
              <p className="text-[13px] text-text-muted">Por cobrar · {cur}</p>
              <p className="mt-1 font-mono text-[20px] text-warning">{formatMoney(pen?.total ?? "0", cur)}</p>
              <p className="mt-1 font-mono text-[11px] text-text-faint">{pen?.n ?? 0} pendientes</p>
            </Card>,
          ];
        })}
      </div>
      <p className="text-[12px] text-text-faint">Montos por moneda, sin convertir.</p>
      <BlockCard
        icon={<BriefcaseBusiness />}
        title="Cobros pendientes"
        action={
          <Link href="/finanzas/por-cobrar" className="text-[13px] text-text-muted hover:text-text">
            finanzas →
          </Link>
        }
      >
        {m.receivables.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {m.receivables.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-text">{r.concept}</span>
                  <span className={cn("font-mono text-[12px]", r.dueDate && r.dueDate < today ? "text-danger" : "text-text-muted")}>
                    {r.dueDate ? `vence ${formatDate(r.dueDate)}` : "sin vencimiento"} · {label(L.receivableStatus, r.status)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[13px] text-text">{formatMoney(subMoney(r.amount, r.paidAmount), r.currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-text-muted">No hay cobros pendientes.</p>
        )}
      </BlockCard>
    </div>
  );
}
