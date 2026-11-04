import { ENTITY_COLORS } from "@agencyos/core";
import { ArrowLeft, ArrowLeftRight, ArrowRight } from "lucide-react";
import Link from "next/link";

type Group = {
  type: string;
  label: string;
  items: { type: string; id: string; title: string; href: string; direction: "in" | "out" | "both"; kinds: string[] }[];
};

const KIND: Record<string, string> = { wikilink: "enlace", mention: "mención", belongs: "pertenece", related: "relacionado", tag: "etiqueta" };
const DIR = {
  in: { icon: <ArrowLeft className="size-3.5" />, label: "Entrante: esta la enlaza" },
  out: { icon: <ArrowRight className="size-3.5" />, label: "Saliente: enlazada desde acá" },
  both: { icon: <ArrowLeftRight className="size-3.5" />, label: "En ambos sentidos" },
};

/** "Conectado con" (N5): enlaces entrantes y salientes agrupados por tipo. */
export function Connections({ groups, empty = "Sin conexiones todavía. Escribí [[Otra nota]], @cliente o #proyecto." }: { groups: Group[]; empty?: string }) {
  if (!groups.length) return <p className="text-[13px] text-text-faint">{empty}</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="connections">
      {groups.map((g) => (
        <section key={g.type}>
          <h3 className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">
            {g.label} · {g.items.length}
          </h3>
          <ul className="flex flex-col">
            {g.items.map((it) => (
              <li key={`${it.type}:${it.id}`}>
                <Link href={it.href} className="group flex min-h-10 items-center gap-2.5 rounded-md px-1.5 text-[14px] text-text hover:bg-surface-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: ENTITY_COLORS[it.type] ?? "#8A93A6", boxShadow: `0 0 8px ${ENTITY_COLORS[it.type] ?? "#8A93A6"}` }}
                  />
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  <span className="font-mono text-[11px] text-text-faint">{it.kinds.map((k) => KIND[k] ?? k).join(" · ")}</span>
                  <span className="text-text-faint" title={DIR[it.direction].label}>
                    {DIR[it.direction].icon}
                    <span className="sr-only">{DIR[it.direction].label}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
