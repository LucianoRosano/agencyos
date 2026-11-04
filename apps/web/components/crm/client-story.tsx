import { formatDateTime, formatMoney, L, label, relativeFromDate } from "@agencyos/core";
import { cn, EmptyState } from "@agencyos/ui";
import { CornerDownRight, FileSignature, FolderKanban, Handshake, MessagesSquare, Sparkles, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import { KIND_ICON } from "./icons";
import { InteractionMenu, NextStepDone } from "./interaction-form";
import { dueTone } from "./shared";

type Interaction = {
  i: { id: string; kind: string; occurredAt: Date; summaryMd: string; nextStep: string | null; nextStepDue: string | null };
  contactName: string | null;
};
type Opp = {
  id: string;
  title: string;
  createdAt: Date;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason: string | null;
  valueAmount: string | null;
  valueCurrency: string;
};
type Project = { id: string; name: string; createdAt: Date };
type Quote = { id: string; number: string; title: string; createdAt: Date; sentAt: Date | null; total: string | null; currency: string | null };

type Item = { key: string; at: Date; icon: ReactNode; tone: string; title: ReactNode; body?: ReactNode; meta?: ReactNode; actions?: ReactNode };

function interactionItem({ i, contactName }: Interaction): Item {
  const due = dueTone(i.nextStepDue);
  return {
    key: `i-${i.id}`,
    at: i.occurredAt,
    icon: KIND_ICON[i.kind] ?? <MessagesSquare />,
    tone: "text-accent-2 border-accent-2/30 bg-accent-2/10",
    title: (
      <>
        {label(L.interactionKind, i.kind)}
        {contactName ? <span className="text-text-muted"> con {contactName}</span> : null}
      </>
    ),
    body: (
      <>
        <MarkdownView html={renderMarkdown(i.summaryMd)} className="text-[14px] text-text" />
        {i.nextStep ? (
          <div className="mt-2 flex items-center gap-2 rounded-[8px] border border-border bg-bg-elevated py-1 pr-1 pl-2.5 text-[13px]">
            <CornerDownRight className="size-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-text">{i.nextStep}</span>
            {due ? <span className={cn("shrink-0 font-mono text-[12px]", due.cls)}>{due.text}</span> : null}
            <NextStepDone id={i.id} text={i.nextStep} due={i.nextStepDue} />
          </div>
        ) : null}
      </>
    ),
    actions: <InteractionMenu id={i.id} />,
  };
}

/** La ficha se lee como una historia: conversaciones + hitos (docs/07 §4). */
export function ClientStory({
  interactions,
  opportunities = [],
  projects = [],
  quotes = [],
  createdAt,
  limit,
  onlyInteractions,
}: {
  interactions: Interaction[];
  opportunities?: Opp[];
  projects?: Project[];
  quotes?: Quote[];
  createdAt?: Date;
  limit?: number;
  onlyInteractions?: boolean;
}) {
  const items: Item[] = interactions.map(interactionItem);
  if (!onlyInteractions) {
    for (const o of opportunities) {
      items.push({
        key: `oc-${o.id}`,
        at: o.createdAt,
        icon: <Handshake />,
        tone: "text-text-muted border-border bg-surface-2",
        title: (
          <>
            Se abrió la oportunidad{" "}
            <Link className="text-text hover:underline" href={`/crm/oportunidades/${o.id}`}>
              «{o.title}»
            </Link>
          </>
        ),
        meta: o.valueAmount ? formatMoney(o.valueAmount, o.valueCurrency) : undefined,
      });
      if (o.wonAt)
        items.push({
          key: `ow-${o.id}`,
          at: o.wonAt,
          icon: <Trophy />,
          tone: "text-success border-success/30 bg-success-soft",
          title: (
            <>
              Ganada:{" "}
              <Link className="hover:underline" href={`/crm/oportunidades/${o.id}`}>
                «{o.title}»
              </Link>
            </>
          ),
          meta: o.valueAmount ? formatMoney(o.valueAmount, o.valueCurrency) : undefined,
        });
      if (o.lostAt)
        items.push({
          key: `ol-${o.id}`,
          at: o.lostAt,
          icon: <XCircle />,
          tone: "text-danger border-danger/30 bg-danger-soft",
          title: <>Perdida: «{o.title}»</>,
          meta: label(L.lostReason, o.lostReason),
        });
    }
    for (const p of projects)
      items.push({
        key: `p-${p.id}`,
        at: p.createdAt,
        icon: <FolderKanban />,
        tone: "text-accent border-accent/30 bg-accent-soft",
        title: (
          <>
            Arrancó el proyecto{" "}
            <Link className="text-text hover:underline" href={`/proyectos/${p.id}`}>
              «{p.name}»
            </Link>
          </>
        ),
      });
    for (const q of quotes)
      items.push({
        key: `q-${q.id}`,
        at: q.sentAt ?? q.createdAt,
        icon: <FileSignature />,
        tone: "text-[#A78BFA] border-[#A78BFA]/30 bg-[#A78BFA]/10",
        title: (
          <>
            {q.sentAt ? "Envió" : "Armó"} el presupuesto{" "}
            <Link className="text-text hover:underline" href={`/presupuestos/${q.id}`}>
              {q.number}
            </Link>
          </>
        ),
        meta: q.total ? formatMoney(q.total, q.currency ?? "ARS") : undefined,
      });
    if (createdAt)
      items.push({ key: "created", at: createdAt, icon: <Sparkles />, tone: "text-text-muted border-border bg-surface-2", title: "Se registró el cliente" });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length)
    return (
      <EmptyState
        compact
        icon={<MessagesSquare />}
        title="Todavía no hay historia"
        description="Registrá la primera conversación: WhatsApp, llamada, reunión o una nota."
      />
    );
  return (
    <ol className="relative flex flex-col">
      {shown.map((it, idx) => (
        <li key={it.key} className="relative flex gap-3 pb-5 last:pb-0">
          {idx < shown.length - 1 ? <span aria-hidden className="absolute top-9 bottom-1 left-[15px] w-px bg-border" /> : null}
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border [&>svg]:size-3.5", it.tone)}>{it.icon}</span>
          <div className="min-w-0 flex-1 pt-1">
            <p className={cn("text-[14px] font-medium text-text", it.actions && "pr-10")}>{it.title}</p>
            {it.actions ? <div className="absolute top-0 right-0">{it.actions}</div> : null}
            <p className="mt-0.5 font-mono text-[11px] text-text-faint" title={formatDateTime(it.at)}>
              {formatDateTime(it.at)} · {relativeFromDate(it.at)}
              {it.meta ? ` · ${it.meta}` : ""}
            </p>
            {it.body ? <div className="mt-2">{it.body}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
