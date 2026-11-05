"use client";

import { Button, Checkbox, Field, Input, Textarea } from "@agencyos/ui";
import { useActionState, useState } from "react";
import { decideAction } from "./actions";

export function DecisionForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(decideAction.bind(null, token), null);
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  if (state?.ok) {
    return (
      <p className="mt-3 text-[15px]">
        {state.data.decision === "accepted"
          ? "¡Listo! El presupuesto quedó aceptado. Luciano se va a comunicar para arrancar."
          : "Registramos tu respuesta. Gracias por avisar."}
      </p>
    );
  }
  const err = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Respuesta">
        {(["accepted", "rejected"] as const).map((d) => (
          <label
            key={d}
            className={`flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-[14px] ${decision === d ? "border-accent bg-accent-soft" : "border-border text-text-muted"}`}
          >
            <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} className="sr-only" />
            {d === "accepted" ? "Acepto" : "No, gracias"}
          </label>
        ))}
      </div>
      <Field label="Tu nombre y apellido" name="signerName" error={err?.fields?.signerName}>
        <Input id="signerName" name="signerName" required autoComplete="name" />
      </Field>
      <Field label={decision === "accepted" ? "Comentario (opcional)" : "¿Nos contás por qué? (opcional)"} name="comment">
        <Textarea id="comment" name="comment" rows={3} />
      </Field>
      {decision === "accepted" ? (
        <label className="flex items-start gap-3 text-[14px]">
          <Checkbox name="agree" className="mt-0.5" required />
          <span>Leí el presupuesto y acepto el alcance, los plazos y las condiciones de pago.</span>
        </label>
      ) : null}
      {err ? (
        <p className="text-[13px] text-danger" role="alert">
          {err.message}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        {decision === "accepted" ? "Aceptar presupuesto" : "Enviar respuesta"}
      </Button>
    </form>
  );
}
