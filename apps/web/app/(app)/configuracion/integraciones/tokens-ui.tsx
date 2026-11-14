"use client";

import { DEFAULT_MCP_SCOPES, MCP_SCOPES } from "@agencyos/core";
import { Button } from "@agencyos/ui";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { createTokenAction, revokeTokenAction } from "../actions";

const SCOPE_LABEL: Record<string, string> = {
  "read:all": "Leer todo (sin datos fiscales)",
  "write:inbox": "Capturar en la Bandeja",
  "write:tasks": "Crear y editar tareas",
  "write:notes": "Crear notas",
  "write:decisions": "Registrar decisiones",
  "write:crm": "Registrar interacciones del CRM",
  "write:finance": "Registrar movimientos (desactivado por defecto)",
  "propose:*": "Proponer cambios (aprobaciones)",
  "write:comments": "Comentarios internos en fichas",
};

export function NewTokenForm({ base }: { base: string }) {
  const [token, setToken] = useState<string | null>(null);
  if (token) {
    const cmd = `claude mcp add --transport http agencyos ${base}/mcp --header "Authorization: Bearer ${token}"`;
    return (
      <div className="rounded-[10px] border border-warning/40 bg-warning-soft p-4">
        <p className="mb-2 text-[14px] font-medium text-warning">Copiá el token ahora: no se vuelve a mostrar.</p>
        <code className="block break-all rounded bg-bg-elevated p-2 font-mono text-[12px]">{token}</code>
        <p className="mt-3 mb-1 text-[13px] text-text-muted">Para Claude Code:</p>
        <code className="block break-all rounded bg-bg-elevated p-2 font-mono text-[12px]">{cmd}</code>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(token);
              toast.success("Token copiado");
            }}
          >
            <Copy className="size-4" /> Copiar token
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setToken(null)}>
            Listo, lo guardé
          </Button>
        </div>
      </div>
    );
  }
  return (
    <ActionForm action={createTokenAction} onSuccess={(d) => setToken((d as { token: string }).token)} successMessage="Token creado">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nombre" name="name" placeholder="Claude Code en mi PC" required />
        <SelectField
          label="Vence en"
          name="expiresDays"
          defaultValue="90"
          options={[
            { value: "30", label: "30 días" },
            { value: "90", label: "90 días" },
            { value: "365", label: "1 año" },
          ]}
        />
      </div>
      <fieldset className="grid gap-1 md:grid-cols-2">
        <legend className="mb-1 text-[13px] font-medium text-text-muted">Alcances</legend>
        {MCP_SCOPES.map((s) => (
          <label key={s} className="flex min-h-10 items-center gap-2.5 text-[14px]">
            <input type="checkbox" name="scopes" value={s} defaultChecked={DEFAULT_MCP_SCOPES.includes(s)} className="size-4 accent-[var(--accent)]" />
            {SCOPE_LABEL[s] ?? s}
          </label>
        ))}
      </fieldset>
      <TextField label="Confirmá tu contraseña" name="password" type="password" autoComplete="current-password" required className="md:max-w-sm" />
      <SubmitButton className="self-start">Crear token</SubmitButton>
    </ActionForm>
  );
}

export function RevokeButton({ id, name }: { id: string; name: string }) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="danger"
      loading={pending}
      onClick={() => {
        if (confirm(`¿Revocar «${name}»? Claude deja de poder usarlo al instante.`)) exec(() => revokeTokenAction(id), { success: "Token revocado" });
      }}
    >
      Revocar
    </Button>
  );
}
