"use client";

import { Button, Checkbox, Sheet } from "@agencyos/ui";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { saveLayoutAction } from "@/app/(app)/hoy/actions";
import { useAction } from "@/components/use-action";

const NAMES: Record<string, string> = {
  foco: "Foco de hoy",
  ponerse: "Ponerse al día",
  proximos: "Próximos 7 días",
  dinero: "Dinero del mes",
  facultad: "Facultad",
  notas: "Notas recientes",
  proyectos: "Proyectos activos",
};
type Block = "foco" | "ponerse" | "proximos" | "dinero" | "facultad" | "notas" | "proyectos";

export function CustomizeToday({ layout }: { layout: { order: Block[]; hidden: Block[] } }) {
  const [order, setOrder] = useState(layout.order);
  const [hidden, setHidden] = useState(new Set(layout.hidden));
  const [open, setOpen] = useState(false);
  const { exec, pending } = useAction();
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + d;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j] as Block, n[i] as Block];
      return n;
    });
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Personalizar Hoy"
      description="Ocultá o reordená los bloques."
      trigger={
        <Button variant="ghost" size="sm" aria-label="Personalizar Hoy">
          <SlidersHorizontal className="size-4" /> <span className="hidden md:inline">Personalizar</span>
        </Button>
      }
    >
      <ul className="flex flex-col gap-1">
        {order.map((b, i) => (
          <li key={b} className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3">
            <Checkbox
              checked={!hidden.has(b)}
              onChange={() =>
                setHidden((h) => {
                  const n = new Set(h);
                  if (n.has(b)) n.delete(b);
                  else n.add(b);
                  return n;
                })
              }
              aria-label={`Mostrar ${NAMES[b]}`}
              className="size-5"
            />
            <span className="flex-1 text-[14px]">{NAMES[b]}</span>
            <button
              type="button"
              className="grid size-9 place-items-center text-text-muted disabled:opacity-30"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Subir ${NAMES[b]}`}
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              className="grid size-9 place-items-center text-text-muted disabled:opacity-30"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              aria-label={`Bajar ${NAMES[b]}`}
            >
              <ArrowDown className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          loading={pending}
          onClick={() => exec(() => saveLayoutAction({ order, hidden: [...hidden] }), { success: "Hoy actualizado", onDone: () => setOpen(false) })}
        >
          Guardar
        </Button>
      </div>
    </Sheet>
  );
}
