"use client";

import { Button, Card, cn, Select, Textarea } from "@agencyos/ui";
import { Check, Pause, Play, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { completeFocusTaskAction, logFocusAction } from "./actions";

type T = { id: string; title: string; project: string | null };

/** Modo foco: una tarea en pantalla, temporizador opcional (25/50), notas al costado y registro del tiempo. */
export function FocusMode({ tasks, initialTaskId, minutesToday }: { tasks: T[]; initialTaskId?: string; minutesToday: number }) {
  const [taskId, setTaskId] = useState(initialTaskId ?? "");
  const [preset, setPreset] = useState<25 | 50 | 0>(25);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState("");
  const started = useRef<Date | null>(null);
  const task = tasks.find((t) => t.id === taskId);
  const total = preset * 60;
  const remaining = preset ? Math.max(0, total - elapsed) : elapsed;

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, [running]);

  useEffect(() => {
    if (preset && running && elapsed >= total) {
      setRunning(false);
      toast.success("¡Tiempo! Registrá la sesión.");
      if ("vibrate" in navigator) navigator.vibrate?.(200);
    }
  }, [elapsed, preset, running, total]);

  useEffect(() => {
    document.title = running ? `${fmt(remaining)} · Modo foco` : "Modo foco · AGENCYOS";
  }, [running, remaining]);

  async function finish(markDone: boolean) {
    setRunning(false);
    const minutes = Math.max(1, Math.round(elapsed / 60));
    if (elapsed >= 30) {
      const r = await logFocusAction({ taskId: taskId || undefined, startedAt: (started.current ?? new Date()).toISOString(), minutes, notesMd: notes || undefined });
      if (!r.ok) return toast.error(r.error.message);
    }
    if (markDone && taskId) await completeFocusTaskAction(taskId);
    toast.success(markDone ? "Tarea completada y sesión registrada" : `Sesión de ${minutes} min registrada`);
    setElapsed(0);
    setNotes("");
    started.current = null;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-text-muted">Modo foco · {minutesToday} min hoy</p>
        <Link href="/hoy" className="text-[13px] text-text-muted hover:text-text">Salir</Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="flex flex-col items-center gap-6 p-6 text-center md:p-10">
          <Select aria-label="Tarea" value={taskId} onChange={(e) => setTaskId(e.target.value)} className="max-w-md">
            <option value="">Sin tarea (foco libre)</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
          <h1 className="max-w-2xl text-[26px] font-semibold leading-tight md:text-[34px]">{task?.title ?? "Foco libre"}</h1>
          {task?.project ? <p className="-mt-4 text-[14px] text-text-muted">{task.project}</p> : null}
          <p className={cn("font-mono text-[72px] leading-none tabular-nums md:text-[104px]", running ? "text-gradient" : "text-text")} aria-live="polite">{fmt(remaining)}</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Temporizador">
            {([25, 50, 0] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={preset === p} disabled={running} onClick={() => { setPreset(p); setElapsed(0); }} className={cn("h-10 rounded-full border px-4 text-[13px]", preset === p ? "border-accent bg-accent-soft" : "border-border text-text-muted")}>
                {p ? `${p} min` : "Libre"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {running ? (
              <Button size="lg" onClick={() => setRunning(false)}><Pause className="size-4" /> Pausar</Button>
            ) : (
              <Button size="lg" variant="primary" onClick={() => { if (!started.current) started.current = new Date(); setRunning(true); }}><Play className="size-4" /> {elapsed ? "Seguir" : "Empezar"}</Button>
            )}
            {elapsed > 0 ? <Button size="lg" variant="secondary" onClick={() => finish(false)}><Square className="size-4" /> Terminar sesión</Button> : null}
            {taskId ? <Button size="lg" variant="secondary" onClick={() => finish(true)}><Check className="size-4" /> Completar tarea</Button> : null}
          </div>
        </Card>
        <Card className="flex flex-col p-5">
          <label htmlFor="focus-notes" className="mb-2 font-mono text-[12px] uppercase tracking-[0.18em] text-text-muted">Notas de la sesión</label>
          <Textarea id="focus-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-64 flex-1" placeholder="Lo que vas resolviendo, dudas, próximos pasos… Se guardan en la tarea al terminar." />
        </Card>
      </div>
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
