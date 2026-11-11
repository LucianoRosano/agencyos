"use client";

import { BlockCard, Button, cn, EmptyState, Input } from "@agencyos/ui";
import {
  AlarmClock,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CirclePause,
  CreditCard,
  FileSignature,
  Globe,
  Hourglass,
  Inbox,
  MessagesSquare,
  ServerCrash,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { completeReminderAction, defineNextActionAction, postponeBlockerAction, reopenReminderAction, resolveBlockerAction } from "@/app/(app)/hoy/actions";
import { setTaskDueAction, setTaskStatusAction, snoozeTaskAction } from "@/app/(app)/tareas/actions";
import { useAction } from "@/components/use-action";

export type CatchUpItem = {
  key: string;
  kind: string;
  title: string;
  subtitle: string;
  severity: string;
  entityId: string;
  href: string;
  date?: string | null;
};

const ICON: Record<string, { icon: React.ReactNode; tone: string }> = {
  task: { icon: <CircleAlert />, tone: "text-danger bg-danger-soft border-danger/30" },
  payable: { icon: <CreditCard />, tone: "text-warning bg-warning-soft border-warning/30" },
  subscription: { icon: <CreditCard />, tone: "text-warning bg-warning-soft border-warning/30" },
  receivable: { icon: <Wallet />, tone: "text-success bg-success-soft border-success/30" },
  quote: { icon: <FileSignature />, tone: "text-success bg-success-soft border-success/30" },
  reminder: { icon: <CircleAlert />, tone: "text-danger bg-danger-soft border-danger/30" },
  project_no_action: { icon: <CirclePause />, tone: "text-text-muted bg-surface-2 border-border" },
  project_stalled: { icon: <CirclePause />, tone: "text-text-muted bg-surface-2 border-border" },
  blocker: { icon: <Hourglass />, tone: "text-warning bg-warning-soft border-warning/30" },
  opportunity: { icon: <Target />, tone: "text-accent-2 bg-accent-2/10 border-accent-2/30" },
  interaction: { icon: <MessagesSquare />, tone: "text-accent-2 bg-accent-2/10 border-accent-2/30" },
  inbox: { icon: <Inbox />, tone: "text-accent-2 bg-accent-2/10 border-accent-2/30" },
  approval: { icon: <ShieldCheck />, tone: "text-accent bg-accent-soft border-accent/30" },
  asset: { icon: <Globe />, tone: "text-warning bg-warning-soft border-warning/30" },
  site_down: { icon: <ServerCrash />, tone: "text-danger bg-danger-soft border-danger/30" },
};

function Action({ item, onGone }: { item: CatchUpItem; onGone: () => void }) {
  const { exec, pending } = useAction();
  const [defining, setDefining] = useState(false);
  const [text, setText] = useState("");
  const btn = (label: string, fn: () => void, variant: "secondary" | "ghost" = "secondary") => (
    <Button size="sm" variant={variant} loading={pending} onClick={fn}>
      {label}
    </Button>
  );
  const link = (label: string) => (
    <Button size="sm" variant="secondary" asChild>
      <Link href={item.href}>{label}</Link>
    </Button>
  );
  switch (item.kind) {
    case "task":
      return (
        <div className="flex gap-1.5">
          {btn("Hecho", () => {
            onGone();
            exec(() => setTaskStatusAction(item.entityId, "done"), { success: "Tarea completada", undo: () => setTaskStatusAction(item.entityId, "todo") });
          })}
          {btn(
            "Posponer",
            () => {
              onGone();
              exec(() => snoozeTaskAction(item.entityId, 1), {
                success: "Pospuesta para mañana",
                undo: () => setTaskDueAction(item.entityId, item.date ?? null),
              });
            },
            "ghost",
          )}
        </div>
      );
    case "payable":
    case "subscription":
      return link("Registrar pago");
    case "receivable":
      return link("Registrar cobro");
    case "reminder":
      return btn("Hecho", () => {
        onGone();
        exec(() => completeReminderAction(item.entityId), { success: "Listo", undo: () => reopenReminderAction(item.entityId) });
      });
    case "blocker":
      return (
        <div className="flex gap-1.5">
          {btn("Llegó", () => {
            onGone();
            exec(() => resolveBlockerAction(item.entityId), { success: "Bloqueo resuelto" });
          })}
          {btn(
            "+3 días",
            () => {
              onGone();
              exec(() => postponeBlockerAction(item.entityId), { success: "Lo revisás en 3 días" });
            },
            "ghost",
          )}
        </div>
      );
    case "project_no_action":
      return defining ? (
        <form
          className="flex w-full gap-1.5 md:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            onGone();
            exec(() => defineNextActionAction(item.entityId, text), { success: "Siguiente acción definida" });
          }}
        >
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Siguiente acción…"
            className="h-9"
            aria-label="Siguiente acción"
          />
          <Button size="sm" type="submit">
            OK
          </Button>
        </form>
      ) : (
        btn("Definir", () => setDefining(true))
      );
    case "inbox":
      return link("Procesar");
    case "approval":
      return link("Revisar");
    case "quote":
      return link("Seguir");
    case "asset":
      return link("Ver vencimiento");
    case "site_down":
      return link("Ver monitoreo");
    default:
      return link("Abrir");
  }
}

export function CatchUpBlock({ items }: { items: CatchUpItem[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const visible = items.filter((i) => !gone.has(i.key));
  return (
    <BlockCard
      icon={<AlarmClock />}
      title="Ponerse al día"
      action={
        visible.length ? (
          <span className="grid h-6 min-w-6 place-items-center rounded-full border border-danger/40 px-1.5 font-mono text-[12px] text-danger">
            {visible.length}
          </span>
        ) : null
      }
    >
      {visible.length ? (
        <ul className="flex flex-col">
          {visible.map((it, i) => (
            <li
              key={it.key}
              className={cn(
                "flex-col gap-3 border-b border-border py-3.5 last:border-0 md:flex-row md:items-center",
                i >= 3 && !expanded ? "hidden" : "flex",
                i >= 6 && !expanded ? "md:hidden" : "md:flex",
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3.5">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-[10px] border [&>svg]:size-[18px]", ICON[it.kind]?.tone)}>
                  {ICON[it.kind]?.icon ?? <CircleCheck />}
                </span>
                <Link href={it.href} className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug text-text">{it.title}</p>
                  <p className="mt-0.5 text-[13px] text-text-muted">{it.subtitle}</p>
                </Link>
                <ChevronRight className="mt-2 size-4 shrink-0 text-text-faint md:hidden" />
              </div>
              <div className="pl-[54px] md:pl-0">
                <Action item={it} onGone={() => setGone((s) => new Set(s).add(it.key))} />
              </div>
            </li>
          ))}
          {visible.length > 3 && !expanded ? (
            <li className="pt-2">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border text-[14px] text-text-muted hover:text-text",
                  visible.length <= 6 && "md:hidden",
                )}
              >
                Ver {visible.length - 3} más <ChevronDown className="size-4" />
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <EmptyState compact icon={<CircleCheck />} title="Estás al día" description="Nada vencido ni por vencer. Buen momento para avanzar el foco." />
      )}
    </BlockCard>
  );
}
