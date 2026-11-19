"use client";

import { Kbd, SectionLabel, Sheet } from "@agencyos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { navFor } from "./nav-config";
import { openCapture, openPalette } from "./palette-trigger";

const GENERAL: [string[], string][] = [
  [["Ctrl", "K"], "Paleta de comandos: buscar, crear e ir a cualquier lado"],
  [["C"], "Capturar en la Bandeja"],
  [["Ctrl", "Enter"], "Guardar el formulario abierto"],
  [["Esc"], "Cerrar la ventana o la hoja abierta"],
  [["?"], "Ver esta ayuda"],
];
const IN_SCREEN: [string[], string][] = [
  [["/"], "Cerebro: buscar y volar al nodo"],
  [["Esc"], "Cerebro: limpiar la búsqueda"],
];

/** Atajos globales (docs/06 §6). Se ignoran mientras se escribe en un campo. «G luego X» sale de la navegación (nav-config). */
export function Shortcuts({ limited, enabledModules, role }: { limited?: boolean; enabledModules: string[]; role: string }) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const goto = useMemo(() => navFor(enabledModules, role).filter((n) => n.go), [enabledModules, role]);
  useEffect(() => {
    let g = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (g) {
        g = false;
        const to = goto.find((n) => n.go?.toLowerCase() === k);
        if (to) {
          e.preventDefault();
          router.push(to.href);
        }
        return;
      }
      if (k === "g") {
        g = true;
        clearTimeout(timer);
        timer = setTimeout(() => (g = false), 1200);
      } else if (k === "c" && !limited) {
        e.preventDefault();
        openCapture();
      } else if (e.key === "?") {
        setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, limited, goto]);

  const general = GENERAL.filter(([k]) => !(limited && k[0] === "C" && k.length === 1));
  return (
    <Sheet open={help} onOpenChange={setHelp} title="Atajos de teclado" description="Funcionan en cualquier pantalla, salvo mientras escribís en un campo.">
      <div className="flex flex-col gap-6 text-[14px]">
        <ShortcutList title="Generales" rows={general} />
        <ShortcutList title="Ir a… (G y después la letra)" rows={goto.map((n) => [["G", n.go ?? ""], n.label])} columns />
        <ShortcutList title="En pantallas puntuales" rows={IN_SCREEN} />
        <button
          type="button"
          onClick={() => (setHelp(false), openPalette())}
          className="self-start text-[13px] text-text-muted underline-offset-2 hover:text-text hover:underline"
        >
          ¿Buscás una acción? Abrí la paleta de comandos →
        </button>
      </div>
    </Sheet>
  );
}

function ShortcutList({ title, rows, columns }: { title: string; rows: [string[], string][]; columns?: boolean }) {
  return (
    <section>
      <SectionLabel className="mb-3">{title}</SectionLabel>
      <dl className={columns ? "grid gap-x-6 gap-y-2 sm:grid-cols-2" : "flex flex-col gap-2"}>
        {rows.map(([keys, desc]) => (
          <div key={desc} className="flex min-h-8 items-center justify-between gap-4">
            <dt className="text-text-muted">{desc}</dt>
            <dd className="flex shrink-0 items-center gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
