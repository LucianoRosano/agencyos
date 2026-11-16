"use client";

import { Menu, MenuItem, MenuLabel, MenuSeparator, Sheet } from "@agencyos/ui";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { createWorkspaceAction, switchWorkspaceAction } from "@/app/actions/shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

export type WorkspaceOpt = { id: string; name: string };

/** Selector de espacio de trabajo (barra lateral y menú del celular). El dueño puede crear uno nuevo. */
export function WorkspaceSwitcher({
  current,
  workspaces,
  canCreate,
  compact,
}: {
  current: WorkspaceOpt;
  workspaces: WorkspaceOpt[];
  canCreate: boolean;
  compact?: boolean;
}) {
  const { exec, pending } = useAction();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <button
            type="button"
            disabled={pending}
            aria-label={`Espacio de trabajo: ${current.name}. Cambiar`}
            className={
              compact
                ? "grid size-11 place-items-center rounded-xl border border-border bg-surface-2 text-text-muted"
                : "flex min-h-11 w-full items-center gap-3 rounded-[10px] border border-border bg-surface px-3 text-left hover:border-border-strong"
            }
          >
            {compact ? (
              <ChevronsUpDown className="size-4" />
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">Espacio de trabajo</span>
                  <span className="block truncate text-[14px] text-text">{current.name}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-text-muted" />
              </>
            )}
          </button>
        }
      >
        <MenuLabel>Espacios de trabajo</MenuLabel>
        {workspaces.map((w) => (
          <MenuItem
            key={w.id}
            icon={w.id === current.id ? <Check /> : <span className="size-4" />}
            onSelect={() => {
              if (w.id !== current.id) exec(() => switchWorkspaceAction(w.id));
            }}
          >
            {w.name}
          </MenuItem>
        ))}
        {canCreate ? (
          <>
            <MenuSeparator />
            <MenuItem icon={<Plus />} onSelect={() => setCreating(true)}>
              Nuevo espacio de trabajo
            </MenuItem>
          </>
        ) : null}
      </Menu>
      {canCreate ? (
        <Sheet
          open={creating}
          onOpenChange={setCreating}
          title="Nuevo espacio de trabajo"
          description="Queda separado del actual (proyectos, clientes, finanzas y notas propios) y arranca con la estructura inicial."
        >
          <ActionForm action={createWorkspaceAction} successMessage="Espacio de trabajo creado">
            <TextField label="Nombre" name="name" required maxLength={60} autoFocus placeholder="Ej.: Personal, Segunda marca" />
            <div className="flex justify-end">
              <SubmitButton>Crear y entrar</SubmitButton>
            </div>
          </ActionForm>
        </Sheet>
      ) : null}
    </>
  );
}
