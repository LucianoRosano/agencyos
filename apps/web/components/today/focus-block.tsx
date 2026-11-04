"use client";

import { BlockCard, Button, cn, EmptyState, EntityChip, Sheet } from "@agencyos/ui";
import { Crosshair, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { pickFocusAction, unpickFocusAction } from "@/app/(app)/hoy/actions";
import { setTaskStatusAction } from "@/app/(app)/tareas/actions";
import { TaskCheck } from "@/components/tasks/task-check";
import { useAction } from "@/components/use-action";

export type FocusTask = { id: string; title: string; status: string; estimateMinutes: number | null; projectName: string | null; clientName: string | null; completedAt: Date | null };
type Item = { slot: number; suggested: boolean; task: FocusTask };

export function FocusBlock({ items, candidates }: { items: Item[]; candidates: FocusTask[] }) {
  const { exec } = useAction();
  const [open, setOpen] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set(items.filter((i) => i.task.status === "done").map((i) => i.task.id)));
  const picked = new Set(items.filter((i) => !i.suggested).map((i) => i.task.id));

  function toggle(t: FocusTask) {
    const done = !doneIds.has(t.id);
    setDoneIds((s) => {
      const n = new Set(s);
      if (done) n.add(t.id);
      else n.delete(t.id);
      return n;
    });
    exec(() => setTaskStatusAction(t.id, done ? "done" : "todo"), { success: done ? "¡Hecho!" : "Reabierta", undo: done ? () => setTaskStatusAction(t.id, "todo") : undefined });
  }

  return (
    <BlockCard
      icon={<Crosshair />}
      title="Foco de hoy"
      action={
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title="Elegir el foco de hoy"
          description="Hasta 3 tareas. La primera va destacada."
          trigger={<button type="button" className="text-[13px] text-text-muted hover:text-text">elegir →</button>}
        >
          {candidates.length ? (
            <ul className="flex flex-col gap-1">
              {candidates.map((t) => {
                const on = picked.has(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => exec<unknown>(() => (on ? unpickFocusAction(t.id) : pickFocusAction(t.id)), { success: on ? "Quitada del foco" : "Agregada al foco" })}
                      className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left text-[14px]", on ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}
                    >
                      <Target className={cn("size-4 shrink-0", on ? "text-accent" : "text-text-faint")} />
                      <span className="flex-1">{t.title}</span>
                      {t.projectName ? <span className="truncate text-[12px] text-text-muted">{t.projectName}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[14px] text-text-muted">No hay tareas abiertas con fecha para hoy o vencidas. Creá una o poné fecha a alguna.</p>
          )}
        </Sheet>
      }
    >
      {items.length ? (
        <ol className="flex flex-col gap-3">
          {items.map((it, i) => {
            const done = doneIds.has(it.task.id);
            return (
              <li
                key={it.task.id}
                className={cn(
                  "flex items-center gap-4 rounded-[12px] border p-4 transition-colors",
                  i === 0 && !done ? "border-accent/60 bg-accent-soft/40 glow-active" : "border-border bg-bg-elevated",
                )}
              >
                <span className={cn("font-mono text-[22px] tabular-nums", i === 0 && !done ? "text-accent" : "text-text-faint")}>{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/tareas/${it.task.id}`} className={cn("block text-[16px] leading-snug", done ? "text-text-faint line-through" : "text-text")}>
                    {it.task.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
                    {it.task.projectName || it.task.clientName ? <EntityChip color={it.task.clientName ? "#22D3EE" : "#7C5CFF"}>{it.task.clientName ?? it.task.projectName}</EntityChip> : null}
                    {it.task.estimateMinutes ? <span>~{it.task.estimateMinutes >= 60 ? `${Math.round(it.task.estimateMinutes / 60)} h` : `${it.task.estimateMinutes} min`}</span> : null}
                    {it.suggested ? (
                      <button type="button" className="rounded-md border border-dashed border-border px-2 py-0.5 text-text-muted hover:border-accent hover:text-text" onClick={() => exec(() => pickFocusAction(it.task.id), { success: "Sugerencia aceptada" })}>
                        sugerida · aceptar
                      </button>
                    ) : null}
                  </div>
                </div>
                <TaskCheck size="lg" done={done} onToggle={() => toggle(it.task)} label={done ? `Reabrir «${it.task.title}»` : `Completar «${it.task.title}»`} />
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState compact icon={<Crosshair />} title="Sin foco todavía" description="Cuando tengas tareas para hoy, te sugiero las 3 más importantes." action={<Button size="sm" asChild><Link href="/tareas?nueva=1">Nueva tarea</Link></Button>} />
      )}
    </BlockCard>
  );
}
