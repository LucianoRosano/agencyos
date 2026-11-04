"use client";

import { Button, cn, Sheet } from "@agencyos/ui";
import { CornerDownRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createCategoryAction, deleteCategoryAction, renameCategoryAction, restoreCategoryAction } from "@/app/(app)/finanzas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Cat = {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
  depth: number;
};

/** Gestión simple de categorías: crear, renombrar y mandar a la papelera. */
export function CategoryManager({ categories }: { categories: Cat[] }) {
  const { exec } = useAction();
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const list = categories.filter((c) => c.kind === kind);
  const roots = list.filter((c) => c.depth === 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tipo de categoría" className="flex rounded-[var(--radius-control)] border border-border bg-bg-elevated p-1">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("h-9 min-w-24 rounded-md px-3 text-[13px]", kind === k ? "bg-surface-2 font-medium text-text" : "text-text-muted hover:text-text")}
            >
              {k === "expense" ? "Gastos" : "Ingresos"}
            </button>
          ))}
        </div>
        <NewCategory kind={kind} roots={roots} />
      </div>
      <ul className="divide-y divide-border rounded-[10px] border border-border">
        {list.map((c) => (
          <li key={c.id} className={cn("flex min-h-12 items-center gap-2 pr-1.5 text-[14px]", c.depth ? "pl-8" : "pl-4")}>
            {c.depth ? <CornerDownRight className="size-3.5 shrink-0 text-text-faint" aria-hidden /> : null}
            <span className="min-w-0 flex-1 truncate text-text">{c.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 md:size-9"
              aria-label={`Renombrar ${c.name}`}
              onClick={() => {
                const n = prompt("Nuevo nombre de la categoría", c.name);
                if (n && n.trim() && n.trim() !== c.name)
                  exec(() => renameCategoryAction(c.id, n), {
                    success: "Categoría renombrada",
                    undo: () => renameCategoryAction(c.id, c.name),
                  });
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-text-muted hover:text-danger md:size-9"
              aria-label={`Eliminar ${c.name}`}
              onClick={() => {
                if (!confirm(`¿Mandar «${c.name}» a la papelera?${c.depth ? "" : " También sus subcategorías."} Los movimientos ya cargados conservan la categoría.`)) return;
                exec(() => deleteCategoryAction(c.id), {
                  success: "Categoría en la papelera",
                  undo: () => restoreCategoryAction(c.id),
                });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
        {!list.length ? <li className="px-4 py-6 text-center text-[13px] text-text-muted">Sin categorías de {kind === "expense" ? "gastos" : "ingresos"}.</li> : null}
      </ul>
    </div>
  );
}

function NewCategory({ kind, roots }: { kind: "income" | "expense"; roots: Cat[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={`Nueva categoría de ${kind === "expense" ? "gastos" : "ingresos"}`}
      trigger={
        <Button variant="secondary">
          <Plus className="size-4" /> Categoría
        </Button>
      }
    >
      <ActionForm action={createCategoryAction} successMessage="Categoría creada" onSuccess={() => setOpen(false)}>
        <input type="hidden" name="kind" value={kind} />
        <TextField label="Nombre" name="name" required autoFocus maxLength={80} />
        <SelectField
          label="Dentro de (opcional)"
          name="parentId"
          placeholder="Categoría principal"
          options={roots.map((r) => ({ value: r.id, label: r.name }))}
          hint="Para subcategorías, por ejemplo Herramientas / SaaS › Diseño."
        />
        <div className="flex justify-end">
          <SubmitButton>Crear</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
