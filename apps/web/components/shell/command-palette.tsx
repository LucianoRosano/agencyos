"use client";

import { L, label } from "@agencyos/core";
import { Command } from "cmdk";
import { CornerDownLeft, FilePlus2, FolderPlus, Inbox, ListPlus, Plus, Search, UserPlus, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { quickTaskAction, searchAction } from "@/app/actions/shell";
import { ENTITY_DOT } from "@/lib/entity-colors";
import { navFor } from "./nav-config";
import { openCapture } from "./palette-trigger";

type Hit = Awaited<ReturnType<typeof searchAction>>[number];

export function CommandPalette({ enabledModules }: { enabledModules: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [, start] = useTransition();
  const router = useRouter();
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ag:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ag:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(() => {
      start(async () => {
        const r = await searchAction(q);
        if (id === seq.current) setHits(r);
      });
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const has = (m: string) => enabledModules.includes(m);
  const creates = [
    { label: "Nueva tarea", href: "/tareas?nueva=1", icon: <ListPlus />, show: has("projects") },
    { label: "Nuevo proyecto (asistente)", href: "/proyectos/nuevo", icon: <FolderPlus />, show: has("projects") },
    { label: "Nuevo cliente", href: "/crm/clientes/nuevo", icon: <UserPlus />, show: has("crm") },
    { label: "Nuevo presupuesto", href: "/presupuestos/nuevo", icon: <FilePlus2 />, show: has("quotes") },
    { label: "Nueva nota", href: "/notas/nueva", icon: <FilePlus2 />, show: has("notes") },
    { label: "Registrar movimiento", href: "/finanzas/movimientos?nuevo=1", icon: <Wallet />, show: has("finance") },
  ].filter((c) => c.show);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <Command
        label="Paleta de comandos"
        shouldFilter={false}
        className="absolute inset-x-0 top-0 flex h-dvh flex-col overflow-hidden border-border bg-surface md:inset-x-auto md:top-[12vh] md:left-1/2 md:h-auto md:max-h-[70vh] md:w-full md:max-w-2xl md:-translate-x-1/2 md:rounded-[var(--radius-card)] md:border md:shadow-[var(--shadow-pop)]"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 pt-[max(0px,env(safe-area-inset-top))]">
          <Search className="size-5 text-text-muted" />
          <Command.Input
            autoFocus
            value={q}
            onValueChange={setQ}
            placeholder="Buscar clientes, proyectos, tareas, notas… o crear"
            className="h-14 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-faint"
          />
          <button type="button" className="text-[13px] text-text-muted md:hidden" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </div>
        <Command.List className="flex-1 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-text-faint">
          {q.trim() ? (
            <Command.Group heading="Acciones">
              <Item
                icon={<Inbox />}
                onSelect={() => {
                  setOpen(false);
                  openCapture();
                  setTimeout(() => window.dispatchEvent(new CustomEvent("ag:capture-text", { detail: q })), 50);
                }}
              >
                Capturar «{q}» en la Bandeja
              </Item>
              {has("projects") ? (
                <Item
                  icon={<Plus />}
                  onSelect={async () => {
                    const r = await quickTaskAction(q);
                    if (r.ok) {
                      toast.success("Tarea creada para hoy");
                      setOpen(false);
                      setQ("");
                      router.refresh();
                    } else toast.error(r.error.message);
                  }}
                >
                  Crear tarea para hoy: «{q}»
                </Item>
              ) : null}
            </Command.Group>
          ) : null}
          {hits.length ? (
            <Command.Group heading="Resultados">
              {hits.map((h) => (
                <Item key={`${h.type}-${h.id}`} onSelect={() => go(h.href)} icon={<span className="size-2.5 rounded-full" style={{ background: ENTITY_DOT[h.type] ?? "var(--text-muted)" }} />}>
                  <span className="truncate">{h.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-text-faint">{label(L.entityType, h.type).toLowerCase()}</span>
                </Item>
              ))}
            </Command.Group>
          ) : q.trim() ? (
            <p className="px-3 py-6 text-center text-[13px] text-text-muted">Sin resultados para «{q}».</p>
          ) : null}
          {!q.trim() ? (
            <>
              <Command.Group heading="Crear">
                {creates.map((c) => (
                  <Item key={c.href} icon={c.icon} onSelect={() => go(c.href)}>
                    {c.label}
                  </Item>
                ))}
                <Item icon={<Inbox />} onSelect={() => { setOpen(false); openCapture(); }}>
                  Capturar en la Bandeja <Kbd>C</Kbd>
                </Item>
              </Command.Group>
              <Command.Group heading="Ir a">
                {navFor(enabledModules).map((n) => (
                  <Item key={n.key} icon={n.icon} onSelect={() => go(n.href)}>
                    {n.label}
                  </Item>
                ))}
                <Item onSelect={() => go("/configuracion")}>Configuración</Item>
                <Item onSelect={() => go("/papelera")}>Papelera</Item>
              </Command.Group>
            </>
          ) : null}
        </Command.List>
        <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 font-mono text-[11px] text-text-faint md:flex">
          <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> abrir</span>
          <span>↑↓ moverse</span>
          <span>esc cerrar</span>
        </div>
      </Command>
    </div>
  );
}

function Item({ children, onSelect, icon }: { children: React.ReactNode; onSelect: () => void; icon?: React.ReactNode }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[14px] text-text data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-text-muted"
    >
      {icon ? <span className="grid w-4 place-items-center">{icon}</span> : null}
      {children}
    </Command.Item>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-[11px] text-text-faint">{children}</kbd>;
