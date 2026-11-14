"use client";

import { Sheet } from "@agencyos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { openCapture } from "./palette-trigger";

const GOTO: Record<string, string> = {
  h: "/hoy",
  p: "/proyectos",
  t: "/tareas",
  c: "/crm/clientes",
  f: "/finanzas",
  n: "/notas",
  b: "/cerebro",
  i: "/bandeja",
};

/** Atajos globales (docs/06 §6). Se ignoran mientras se escribe en un campo. */
export function Shortcuts({ limited }: { limited?: boolean }) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
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
        const to = GOTO[k];
        if (to) {
          e.preventDefault();
          router.push(to);
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
  }, [router]);
  return (
    <Sheet open={help} onOpenChange={setHelp} title="Atajos de teclado">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[14px]">
        {[
          ["Ctrl / ⌘ K", "Paleta de comandos y búsqueda"],
          ["C", "Capturar en la Bandeja"],
          ["G luego H", "Ir a Hoy"],
          ["G luego P / T", "Ir a Proyectos / Tareas"],
          ["G luego C / F", "Ir a Clientes / Finanzas"],
          ["G luego N / B / I", "Ir a Notas / Cerebro / Bandeja"],
          ["Ctrl + Enter", "Guardar el formulario"],
          ["?", "Ver esta ayuda"],
        ].map(([k, d]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[12px]">{k}</kbd>
            </dt>
            <dd className="text-text-muted">{d}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
