"use client";

import { Card } from "@agencyos/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextAreaField } from "@/components/fields";
import { surveyAction } from "./actions";

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Encuesta de satisfacción (NPS) de un proyecto terminado: 0–10 y un comentario opcional. */
export function SurveyCard({ projectId, projectName }: { projectId: string; projectName: string }) {
  return (
    <Card className="p-5" data-testid="portal-survey">
      <ActionForm action={surveyAction.bind(null, projectId)} successMessage="¡Gracias por tu respuesta!">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[15px] font-medium text-text">
            Terminamos «{projectName}». ¿Qué tan probable es que recomiendes a Luciano Rosano a un colega o amigo?
          </legend>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
            {SCORES.map((n) => (
              <label key={n} className="cursor-pointer">
                <input type="radio" name="score" value={n} required className="peer sr-only" />
                <span className="flex h-11 items-center justify-center rounded-[var(--radius-control)] border border-border font-mono text-[14px] text-text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                  {n}
                </span>
              </label>
            ))}
          </div>
          <p className="flex justify-between text-[12px] text-text-muted">
            <span>0 · nada probable</span>
            <span>10 · muy probable</span>
          </p>
        </fieldset>
        <TextAreaField label="¿Qué podríamos mejorar? (opcional)" name="comment" rows={3} maxLength={2000} />
        <div className="flex justify-end">
          <SubmitButton>Enviar</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
