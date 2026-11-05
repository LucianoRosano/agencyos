"use client";

import { Badge, Button, cn, Menu, MenuItem, MenuSeparator } from "@agencyos/ui";
import { CheckCircle2, CircleSlash, Copy, FlaskConical, MoreHorizontal, Pause, Pencil, Play, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/use-action";
import {
  deleteRuleAction,
  duplicateRuleAction,
  previewRuleAction,
  restoreRuleAction,
  runRuleNowAction,
  setRuleActiveAction,
  setRuleTestModeAction,
} from "@/app/(app)/automatizaciones/actions";

export function RuleToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant={active ? "outline" : "secondary"}
      loading={pending}
      className="h-11 md:h-8"
      aria-label={`${active ? "Pausar" : "Activar"} «${name}»`}
      onClick={() =>
        exec(() => setRuleActiveAction(id, !active), {
          success: active ? "Regla pausada" : "Regla activada",
          undo: () => setRuleActiveAction(id, active),
        })
      }
    >
      {active ? <Pause className="size-4" /> : <Play className="size-4" />}
      {active ? "Pausar" : "Activar"}
    </Button>
  );
}

export function RuleMenu({ id, name, testMode }: { id: string; name: string; testMode: boolean }) {
  const { exec } = useAction();
  const router = useRouter();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Más acciones">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      <MenuItem icon={<Pencil />} onSelect={() => router.push(`/automatizaciones/${id}/editar`)}>
        Editar
      </MenuItem>
      <MenuItem
        icon={<FlaskConical />}
        onSelect={() =>
          exec(() => setRuleTestModeAction(id, !testMode), {
            success: testMode ? "Salió del modo prueba: ahora ejecuta de verdad" : "Modo prueba: solo registra lo que haría",
            undo: () => setRuleTestModeAction(id, testMode),
          })
        }
      >
        {testMode ? "Salir del modo prueba" : "Pasar a modo prueba"}
      </MenuItem>
      <MenuItem
        icon={<Copy />}
        onSelect={() =>
          exec(() => duplicateRuleAction(id), {
            success: "Regla duplicada (queda pausada)",
            onDone: (r) => router.push(`/automatizaciones/${(r as { id: string }).id}`),
          })
        }
      >
        Duplicar
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${name}» a la papelera? Deja de ejecutarse. Restaurable 30 días.`)) return;
          exec(() => deleteRuleAction(id), {
            success: "Regla en la papelera",
            undo: () => restoreRuleAction(id),
            onDone: () => router.push("/automatizaciones"),
          });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}

type Result = { index: number; type: string; ok: boolean; summary: string; detail?: string; pendingApproval?: boolean };
type Preview =
  | { empty: true; message: string }
  | {
      empty: false;
      items: {
        label: string;
        result: { status: string; output: { results: Result[]; reason?: string; conditions?: { field: string; op: string; value?: string; passed: boolean }[] } };
      }[];
    };

export function ResultList({ results }: { results: Result[] }) {
  if (!results.length) return null;
  return (
    <ol className="flex flex-col gap-1.5">
      {results.map((r) => (
        <li key={`${r.index}-${r.type}`} className="flex items-start gap-2 text-[13px]">
          <span className="mt-0.5 shrink-0" aria-hidden>
            {r.pendingApproval ? (
              <CircleSlash className="size-4 text-warning" />
            ) : r.ok ? (
              <CheckCircle2 className="size-4 text-success" />
            ) : (
              <XCircle className="size-4 text-danger" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-text">
              <span className="font-mono text-[11px] text-text-faint">{r.index + 1}. </span>
              {r.summary}
            </span>
            {r.detail ? <span className="mt-1 block whitespace-pre-wrap break-words rounded-md bg-surface-2 p-2 text-[12px] text-text-muted">{r.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

const OP_TEXT: Record<string, string> = { eq: "=", neq: "≠", contains: "contiene", gt: ">", lt: "<", exists: "tiene valor" };

export function TestPanel({ id, active, testMode, isEvent }: { id: string; active: boolean; testMode: boolean; isEvent: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, start] = useTransition();
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-text-muted">
        {isEvent
          ? "Simulá la regla con el último evento real de su tipo: ves qué haría, sin crear, enviar ni cambiar nada."
          : "Simulá la regla con los elementos que hoy cumplen la programación, sin escribir nada."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          loading={loading}
          className="h-11 md:h-10"
          onClick={() =>
            start(async () => {
              const r = await previewRuleAction(id);
              if (!r.ok) {
                toast.error(r.error.message);
                return;
              }
              setPreview(r.data as Preview);
            })
          }
        >
          <FlaskConical className="size-4" /> {isEvent ? "Probar con el último evento real" : "Probar ahora (simulación)"}
        </Button>
        <Button
          variant="outline"
          loading={pending}
          disabled={!active}
          className="h-11 md:h-10"
          title={active ? undefined : "Activá la regla para ejecutarla"}
          onClick={() => {
            if (!testMode && !confirm(isEvent ? "¿Ejecutar la regla de verdad con el último evento real?" : "¿Ejecutar la regla de verdad ahora?")) return;
            exec(() => runRuleNowAction(id), {
              success: testMode ? "Ejecutada en modo prueba: quedó registrada" : "Ejecutada: mirá el registro",
              onDone: () => router.refresh(),
            });
          }}
        >
          <Play className="size-4" /> {isEvent ? "Ejecutar con el último evento" : "Ejecutar ahora"}
        </Button>
      </div>
      {preview ? (
        <div className="rounded-[var(--radius-control)] border border-border bg-bg-elevated/60 p-3 md:p-4" aria-live="polite" data-testid="preview">
          {preview.empty ? (
            <p className="text-[13px] text-text-muted">{preview.message}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {preview.items.map((it, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: resultado efímero
                <li key={i} className="flex flex-col gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Badge tone="info">Simulación</Badge>
                    <span className="min-w-0 truncate text-text-muted">{it.label}</span>
                  </p>
                  {it.result.output.conditions?.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {it.result.output.conditions.map((c, j) => (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: resultado efímero
                          key={j}
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                            c.passed ? "border-success/30 text-success" : "border-danger/30 text-danger",
                          )}
                        >
                          {c.field} {OP_TEXT[c.op] ?? c.op} {c.op === "exists" ? "" : c.value}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {it.result.output.reason ? <p className="text-[13px] text-text-muted">{it.result.output.reason}</p> : null}
                  <ResultList results={it.result.output.results} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function EditLink({ id }: { id: string }) {
  return (
    <Button asChild variant="secondary">
      <Link href={`/automatizaciones/${id}/editar`}>
        <Pencil className="size-4" /> Editar
      </Link>
    </Button>
  );
}
