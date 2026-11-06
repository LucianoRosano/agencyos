"use client";

import { Button, cn, EntityChip, Sheet } from "@agencyos/ui";
import { FileSignature, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { setOpportunityServicesAction } from "@/app/(app)/crm/actions";
import { useAction } from "@/components/use-action";

type Svc = { id: string; name: string; unit?: string };

/** Servicios de interés: chips + hoja con el catálogo (multi). «Crear presupuesto» los precarga como ítems. */
export function OpportunityServices({
  opportunityId,
  clientId,
  selected,
  catalog,
  canQuote,
}: {
  opportunityId: string;
  clientId: string;
  selected: Svc[];
  catalog: Svc[];
  canQuote: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(selected.map((s) => s.id));
  const { exec, pending } = useAction();
  const prev = selected.map((s) => s.id);

  function save() {
    exec(() => setOpportunityServicesAction(opportunityId, sel), {
      success: "Servicios actualizados",
      undo: () => setOpportunityServicesAction(opportunityId, prev),
      onDone: () => setOpen(false),
    });
  }

  const sheet = (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSel(selected.map((s) => s.id));
      }}
      title="Servicios de interés"
      description="Qué le interesa al cliente. Al crear el presupuesto desde la oportunidad, entran como ítems con el precio del catálogo."
      trigger={
        <Button variant="ghost" size="sm">
          {selected.length ? <Pencil className="size-4" /> : <Plus className="size-4" />} {selected.length ? "Editar" : "Elegir"}
        </Button>
      }
    >
      {catalog.length ? (
        <fieldset className="mb-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          <legend className="sr-only">Catálogo de servicios</legend>
          {catalog.map((s) => {
            const on = sel.includes(s.id);
            return (
              <label
                key={s.id}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[14px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                  on ? "border-accent bg-accent-soft text-text" : "border-border text-text-muted hover:border-border-strong hover:text-text",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setSel((xs) => (on ? xs.filter((x) => x !== s.id) : [...xs, s.id]))}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="mb-4 rounded-[10px] border border-dashed border-border p-4 text-[14px] text-text-muted">
          El catálogo está vacío.{" "}
          <Link href="/presupuestos/servicios" className="text-accent hover:underline">
            Cargá tus servicios
          </Link>{" "}
          y volvé.
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        {catalog.length ? (
          <Button variant="primary" loading={pending} onClick={save}>
            Guardar
          </Button>
        ) : null}
      </div>
    </Sheet>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        {selected.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Servicios de interés">
            {selected.map((s) => (
              <li key={s.id}>
                <EntityChip color="#A78BFA">{s.name}</EntityChip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-text-faint">Sin servicios elegidos.</p>
        )}
        {sheet}
      </div>
      {selected.length && canQuote ? (
        <Button asChild size="sm" variant="secondary" className="self-start">
          <Link href={`/presupuestos/nuevo?cliente=${clientId}&oportunidad=${opportunityId}`}>
            <FileSignature className="size-4" /> Crear presupuesto con estos servicios
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
