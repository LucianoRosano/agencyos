import { formatDate, formatDateTime, formatTime, L, label, todayAR } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { getContact } from "@agencyos/modules/crm/queries";
import { Badge, BlockCard, Button, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { BriefcaseBusiness, Info, MessageSquarePlus, MessagesSquare, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { ContactMenu, EditContactSheet } from "@/components/crm/contact-forms";
import { ContactLinks } from "@/components/crm/contact-links";
import { KIND_ICON } from "@/components/crm/icons";
import { InteractionSheet } from "@/components/crm/interaction-form";
import { CLIENT_STATUS_TONE, CRM_ACCENT } from "@/components/crm/shared";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import { requireCtx } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const c = await getContact(ctx, (await params).id);
  return { title: c?.ct.name ?? "Contacto" };
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await getContact(ctx, id);
  if (!data) notFound();
  const { ct } = data;
  const now = new Date();
  const activity = await listActivity(ctx, { entityType: "contact", entityId: id, limit: 50 });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <>
            <Link href="/crm/contactos" className="hover:text-text">
              Contacto
            </Link>
            {ct.role ? ` · ${ct.role}` : ""}
          </>
        }
        title={ct.name}
        accent={CRM_ACCENT}
        actions={
          <>
            <ContactLinks name={ct.name} email={ct.email} phone={ct.phone} whatsapp={ct.whatsapp} />
            {data.clients.length ? (
              <InteractionSheet
                clients={data.clients.map((c) => ({ value: c.id, label: c.name }))}
                contacts={[{ value: ct.id, label: ct.name }]}
                defaultContactId={ct.id}
                now={{ date: todayAR(now), time: formatTime(now) }}
                trigger={
                  <Button variant="primary">
                    <MessageSquarePlus className="size-4" /> Registrar interacción
                  </Button>
                }
              />
            ) : null}
            <EditContactSheet
              id={id}
              defaults={{ name: ct.name, role: ct.role, email: ct.email, phone: ct.phone, whatsapp: ct.whatsapp, notesMd: ct.notesMd }}
            />
            <ContactMenu id={id} name={ct.name} />
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <BlockCard icon={<MessagesSquare />} title="Conversaciones">
            {data.interactions.length ? (
              <ol className="flex flex-col gap-4">
                {data.interactions.map(({ i, clientName }) => (
                  <li key={i.id} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-accent-2/30 bg-accent-2/10 text-accent-2 [&>svg]:size-3.5">
                      {KIND_ICON[i.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-text">
                        {label(L.interactionKind, i.kind)} ·{" "}
                        <Link href={`/crm/clientes/${i.clientId}`} className="hover:underline">
                          {clientName}
                        </Link>
                      </p>
                      <p className="font-mono text-[11px] text-text-faint">{formatDateTime(i.occurredAt)}</p>
                      <MarkdownView html={renderMarkdown(i.summaryMd)} className="mt-1.5 text-[14px]" />
                      {i.nextStep ? (
                        <p className="mt-1 text-[13px] text-text-muted">
                          → {i.nextStep}
                          {i.nextStepDue ? ` · ${formatDate(i.nextStepDue)}` : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact icon={<MessagesSquare />} title="Sin conversaciones registradas" />
            )}
          </BlockCard>
          {activity.length ? (
            <Card className="p-5">
              <SectionLabel className="mb-3">Actividad</SectionLabel>
              <ActivityList rows={activity} />
            </Card>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-5">
            <SectionLabel icon={<Info />} className="mb-4">
              Datos
            </SectionLabel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
              <dt className="text-text-muted">Rol</dt>
              <dd className="min-w-0 truncate">{ct.role ?? "—"}</dd>
              <dt className="text-text-muted">Email</dt>
              <dd className="min-w-0 truncate">
                {ct.email ? (
                  <a href={`mailto:${ct.email}`} className="text-accent-2 hover:underline">
                    {ct.email}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-text-muted">Teléfono</dt>
              <dd className="font-mono text-[13px]">{ct.phone ?? "—"}</dd>
              <dt className="text-text-muted">WhatsApp</dt>
              <dd className="font-mono text-[13px]">{ct.whatsapp ?? "—"}</dd>
              <dt className="text-text-muted">Alta</dt>
              <dd className="font-mono text-[13px]">{formatDate(ct.createdAt)}</dd>
            </dl>
          </Card>
          <BlockCard icon={<BriefcaseBusiness />} title="Clientes">
            {data.clients.length ? (
              <ul className="flex flex-col gap-2">
                {data.clients.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/crm/clientes/${c.id}/contactos`}
                      className="flex items-center gap-2 rounded-[10px] border border-border bg-bg-elevated px-3 py-2.5 hover:border-border-strong"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[14px] text-text">
                          {c.name}
                          {c.isPrimary ? <Star className="size-3.5 shrink-0 fill-current text-warning" aria-label="Contacto principal" /> : null}
                        </span>
                        {c.roleInClient ? <span className="block truncate text-[12px] text-text-muted">{c.roleInClient}</span> : null}
                      </span>
                      <Badge tone={CLIENT_STATUS_TONE[c.status]}>{label(L.clientStatus, c.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-text-muted">No está vinculado a ningún cliente. Vinculalo desde la pestaña Contactos de un cliente.</p>
            )}
          </BlockCard>
          <BlockCard title="Notas">
            <MarkdownView html={renderMarkdown(ct.notesMd)} className="text-[14px]" empty="Sin notas." />
          </BlockCard>
        </div>
      </div>
    </div>
  );
}
