"use client";

import { Button, Card, Checkbox, cn, SectionLabel, Textarea } from "@agencyos/ui";
import { Copy, Download, ListChecks, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateQuestionsAction, saveBriefAction, saveQuestionsAction } from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Field = { key: string; label: string; kind: "text" | "textarea" | "select" | "multi" | "date"; options?: string[]; hint?: string; placeholder?: string; question?: string };
type Block = { key: string; title: string; description?: string; fields: Field[] };
type Answers = Record<string, string | string[]>;

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0);

function MultiField({ field, value }: { field: Field; value: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-text-muted">{field.label}</legend>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {field.options?.map((o) => (
          <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-text">
            <Checkbox name={`${field.key}[]`} value={o} defaultChecked={value.includes(o)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Formulario estructurado del briefing (bloques según el tipo de sitio). */
export function BriefForm({ siteId, blocks, answers, version }: { siteId: string; blocks: Block[]; answers: Answers; version: number }) {
  const str = (k: string) => (typeof answers[k] === "string" ? (answers[k] as string) : "");
  const arr = (k: string) => (Array.isArray(answers[k]) ? (answers[k] as string[]) : []);
  return (
    <ActionForm action={saveBriefAction.bind(null, siteId)} successMessage="Briefing guardado" className="gap-5">
      {blocks.map((b, i) => {
        const asked = b.fields.filter((f) => f.question);
        const done = asked.filter((f) => filled(answers[f.key])).length;
        return (
          <Card key={b.key} className="p-4 md:p-5" id={`bloque-${b.key}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <SectionLabel>
                <span className="text-text-faint">{String(i + 1).padStart(2, "0")}</span> {b.title}
              </SectionLabel>
              {asked.length ? (
                <span className={cn("font-mono text-[12px]", done === asked.length ? "text-success" : "text-text-muted")}>
                  {done}/{asked.length}
                </span>
              ) : null}
            </div>
            {b.description ? <p className="-mt-2 mb-4 text-[13px] text-text-muted">{b.description}</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              {b.fields.map((f) => {
                const full = f.kind === "textarea" || f.kind === "multi";
                const cls = full ? "md:col-span-2" : undefined;
                if (f.kind === "multi")
                  return (
                    <div key={f.key} className={cls}>
                      <MultiField field={f} value={arr(f.key)} />
                    </div>
                  );
                if (f.kind === "select")
                  return (
                    <SelectField
                      key={f.key}
                      className={cls}
                      label={f.label}
                      name={f.key}
                      defaultValue={str(f.key)}
                      placeholder="Sin definir"
                      options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                      hint={f.hint}
                    />
                  );
                if (f.kind === "textarea")
                  return <TextAreaField key={f.key} className={cls} label={f.label} name={f.key} defaultValue={str(f.key)} rows={3} placeholder={f.placeholder} hint={f.hint} />;
                return (
                  <TextField
                    key={f.key}
                    className={cls}
                    label={f.label}
                    name={f.key}
                    type={f.kind === "date" ? "date" : "text"}
                    defaultValue={str(f.key)}
                    placeholder={f.placeholder}
                    hint={f.hint}
                  />
                );
              })}
            </div>
          </Card>
        );
      })}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface/95 p-3 backdrop-blur md:bottom-4">
        <span className="font-mono text-[12px] text-text-muted">revisión {version}</span>
        <SubmitButton>Guardar briefing</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Lista única de preguntas al cliente: generar desde lo que falta, editar, copiar para WhatsApp y exportar en PDF. */
export function QuestionsPanel({
  siteId,
  questions,
  missing,
  intro,
  outro,
}: {
  siteId: string;
  questions: string[];
  missing: number;
  intro: string;
  outro: string;
}) {
  const [text, setText] = useState(questions.join("\n"));
  const { exec, pending } = useAction();
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
  async function copy() {
    const msg = `${intro}\n\n${lines.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n${outro}`;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensaje copiado. Pegalo en WhatsApp.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  }
  return (
    <Card className="flex flex-col gap-4 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={<MessageCircleQuestion />}>Preguntas al cliente</SectionLabel>
        <span className="font-mono text-[12px] text-text-muted">{lines.length}</span>
      </div>
      <p className="text-[13px] text-text-muted">
        {missing
          ? `Faltan ${missing} ${missing === 1 ? "dato" : "datos"} del briefing. Generá la lista, editala y mandala de una sola vez.`
          : "El briefing está completo. Podés sumar preguntas a mano."}
      </p>
      <Button
        variant="secondary"
        loading={pending}
        onClick={() => {
          if (lines.length && !confirm("¿Reemplazar la lista actual por las preguntas de lo que falta en el briefing?")) return;
          exec(() => generateQuestionsAction(siteId), {
            success: "Preguntas generadas desde el briefing",
            onDone: (d) => setText(((d as { questionsForClient?: string[] } | undefined)?.questionsForClient ?? []).join("\n")),
          });
        }}
      >
        <Sparkles className="size-4" /> Generar desde lo que falta
      </Button>
      <ActionForm action={saveQuestionsAction.bind(null, siteId)} successMessage="Preguntas guardadas" className="gap-3">
        <label htmlFor="questions" className="sr-only">
          Preguntas (una por línea)
        </label>
        <Textarea
          id="questions"
          name="questions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(16, Math.max(6, lines.length + 1))}
          placeholder="Una pregunta por línea"
          className="text-[14px]"
        />
        <div className="flex flex-wrap gap-2">
          <SubmitButton variant="secondary" className="flex-1">
            <ListChecks className="size-4" /> Guardar lista
          </SubmitButton>
          <Button type="button" variant="primary" className="flex-1" onClick={copy} disabled={!lines.length}>
            <Copy className="size-4" /> Copiar para WhatsApp
          </Button>
        </div>
      </ActionForm>
      <Button asChild variant="outline">
        <a href={`/sitios/${siteId}/briefing-pdf`} download>
          <Download className="size-4" /> PDF del briefing
        </a>
      </Button>
    </Card>
  );
}
