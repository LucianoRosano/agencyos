"use client";

import { L } from "@agencyos/core";
import { cn } from "@agencyos/ui";
import Link from "next/link";
import { useState } from "react";
import { setTaskStatusAction } from "@/app/(app)/tareas/actions";
import { useAction } from "@/components/use-action";
import { dueLabel, type TaskRowData } from "./task-row";

const COLS = ["todo", "doing", "waiting", "done"] as const;

/** Kanban por estado. Arrastrar y soltar con mouse; con teclado/táctil, el selector de estado de cada tarjeta. */
export function TaskBoard({ tasks }: { tasks: TaskRowData[] }) {
  const { exec } = useAction();
  const [items, setItems] = useState(tasks);
  const [over, setOver] = useState<string | null>(null);
  function move(id: string, status: (typeof COLS)[number]) {
    setItems((xs) => xs.map((t) => (t.id === id ? { ...t, status } : t)));
    exec(() => setTaskStatusAction(id, status));
  }
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {COLS.map((col) => {
        const list = items.filter((t) => t.status === col);
        return (
          <section
            key={col}
            aria-label={L.taskStatus[col]}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/task");
              if (id) move(id, col);
            }}
            className={cn(
              "flex w-[78vw] shrink-0 snap-start flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface/60 p-3 md:w-auto",
              over === col && "border-accent",
            )}
          >
            <h3 className="flex items-center justify-between px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              {L.taskStatus[col]} <span className="text-text-faint">{list.length}</span>
            </h3>
            {list.map((t) => {
              const due = dueLabel(t.dueDate);
              return (
                <article
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                  className="rounded-[10px] border border-border bg-surface p-3"
                >
                  <Link href={`/tareas/${t.id}`} className="block text-[14px] text-text hover:underline">
                    {t.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-text-muted">
                    <span className="truncate">{t.projectName ?? ""}</span>
                    {due ? <span className={cn("font-mono", due.tone)}>{due.text}</span> : null}
                  </div>
                  <select
                    aria-label={`Estado de «${t.title}»`}
                    value={t.status}
                    onChange={(e) => move(t.id, e.target.value as (typeof COLS)[number])}
                    className="mt-2 h-9 w-full rounded-md border border-border bg-bg-elevated px-2 text-[13px] text-text-muted"
                  >
                    {COLS.map((c) => (
                      <option key={c} value={c}>
                        {L.taskStatus[c]}
                      </option>
                    ))}
                  </select>
                </article>
              );
            })}
            {list.length === 0 ? <p className="px-1 py-4 text-center text-[12px] text-text-faint">Sin tareas</p> : null}
          </section>
        );
      })}
    </div>
  );
}
