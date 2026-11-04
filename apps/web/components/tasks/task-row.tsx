"use client";

import { diffDays, formatDayMonth, recurrenceLabel, todayAR } from "@agencyos/core";
import { cn, EntityChip } from "@agencyos/ui";
import { Clock, Repeat } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { setTaskDueAction, setTaskStatusAction, snoozeTaskAction } from "@/app/(app)/tareas/actions";
import { useAction } from "@/components/use-action";
import { TaskCheck } from "./task-check";

export type TaskRowData = {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  rrule: string | null;
  projectName?: string | null;
  clientName?: string | null;
  spaceColor?: string | null;
};

export function dueLabel(due: string | null, today = todayAR()) {
  if (!due) return null;
  const d = diffDays(due, today);
  if (d === 0) return { text: "hoy", tone: "text-accent-2" };
  if (d === 1) return { text: "mañana", tone: "text-text-muted" };
  if (d < 0) return { text: d === -1 ? "ayer" : `hace ${-d} d`, tone: "text-danger" };
  if (d < 7) return { text: `en ${d} d`, tone: "text-text-muted" };
  return { text: formatDayMonth(due), tone: "text-text-muted" };
}

const PRIO = ["", "bg-danger", "bg-warning", "bg-accent-2", "bg-text-faint"];

/** Fila de tarea: completar con un toque; en el celular, deslizar → completa y ← pospone. */
export function TaskRow({ task, showProject = true }: { task: TaskRowData; showProject?: boolean }) {
  const { exec, pending } = useAction();
  const [done, setDone] = useState(task.status === "done");
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const due = dueLabel(task.dueDate);

  function complete() {
    const next = !done;
    setDone(next);
    exec(() => setTaskStatusAction(task.id, next ? "done" : "todo"), {
      success: next ? "Tarea completada" : "Tarea reabierta",
      undo: next ? () => setTaskStatusAction(task.id, "todo") : undefined,
    });
  }
  function snooze() {
    const prev = task.dueDate;
    exec(() => snoozeTaskAction(task.id, 1), { success: "Pospuesta para mañana", undo: () => setTaskDueAction(task.id, prev) });
  }

  return (
    <li className="relative overflow-hidden rounded-[10px]">
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center px-5 text-[13px] font-medium",
          dx > 0 ? "justify-start bg-success-soft text-success" : "justify-end bg-warning-soft text-warning",
        )}
      >
        {dx > 0 ? "Completar" : dx < 0 ? "Posponer" : ""}
      </div>
      <div
        className={cn("relative flex min-h-14 items-center gap-3 border-b border-border bg-surface px-3 py-2.5 transition-transform", pending && "opacity-60")}
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? "none" : undefined, touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const ddx = e.clientX - start.current.x;
          if (Math.abs(e.clientY - start.current.y) > 30 && Math.abs(ddx) < 20) {
            start.current = null;
            setDx(0);
            return;
          }
          setDx(Math.max(-120, Math.min(120, ddx)));
        }}
        onPointerUp={() => {
          if (!start.current) return;
          start.current = null;
          if (dx > 80) complete();
          else if (dx < -80) snooze();
          setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
      >
        <TaskCheck done={done} onToggle={complete} label={done ? `Reabrir «${task.title}»` : `Completar «${task.title}»`} />
        <Link href={`/tareas/${task.id}`} className="min-w-0 flex-1">
          <span className={cn("block truncate text-[15px]", done ? "text-text-faint line-through" : "text-text")}>{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
            {task.priority <= 2 ? (
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", PRIO[task.priority])} title={`Prioridad P${task.priority}`} />
            ) : null}
            {showProject && (task.projectName || task.clientName) ? (
              <EntityChip color={task.clientName ? "#22D3EE" : (task.spaceColor ?? "#7C5CFF")}>{task.projectName ?? task.clientName}</EntityChip>
            ) : null}
            {due ? (
              <span className={cn("inline-flex items-center gap-1 font-mono", due.tone)}>
                <Clock className="size-3" />
                {due.text}
                {task.dueTime ? ` ${task.dueTime}` : ""}
              </span>
            ) : null}
            {task.rrule ? (
              <span className="inline-flex items-center gap-1 text-text-faint" title={recurrenceLabel(task.rrule) ?? ""}>
                <Repeat className="size-3" />
              </span>
            ) : null}
          </span>
        </Link>
      </div>
    </li>
  );
}
