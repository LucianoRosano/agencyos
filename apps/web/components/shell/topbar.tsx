"use client";

import { Button, Menu, MenuItem, MenuLabel, MenuSeparator } from "@agencyos/ui";
import { Bell, ChevronDown, Crosshair, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentType, useCallback, useEffect, useState } from "react";
import { setSpaceAction } from "@/app/actions/shell";
import { ROUTE_TITLES } from "./nav-config";
import { openCapture } from "./palette-trigger";
import type { ShellData } from "./sidebar";

export function Topbar({ data }: { data: ShellData }) {
  const path = usePathname();
  const router = useRouter();
  const title = ROUTE_TITLES.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] ?? "AGENCYOS";
  const selected = data.spaces.find((s) => s.id === data.selectedSpace);
  return (
    <header className="sticky top-0 z-30 hidden h-[72px] items-center gap-3 border-b border-border bg-bg/85 px-8 backdrop-blur-md md:flex">
      <nav aria-label="Migas" className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-text-muted">
        <Link href={ROUTE_TITLES.find(([, t]) => t === title)?.[0] ?? "/hoy"} className="truncate hover:text-text">
          {title}
        </Link>
      </nav>
      <BellLink count={data.counts.notifications ?? 0} panel />
      {data.limited ? null : (
        <>
          <Menu
            trigger={
              <button
                type="button"
                className="flex h-10 items-center gap-2.5 rounded-[9px] border border-border bg-surface px-3.5 text-[14px] text-text hover:border-border-strong"
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: selected ? selected.color : "conic-gradient(#7A4E7E, #A9471F, #B7791F, #7A4E7E)" }}
                />
                {selected ? selected.name : "Todos los espacios"}
                <ChevronDown className="size-4 text-text-muted" />
              </button>
            }
          >
            <MenuLabel>Filtrar por espacio</MenuLabel>
            <MenuItem
              onSelect={async () => {
                await setSpaceAction("all");
                router.refresh();
              }}
            >
              Todos los espacios
            </MenuItem>
            {data.spaces.map((s) => (
              <MenuItem
                key={s.id}
                icon={<span className="size-2.5 rounded-full" style={{ background: s.color }} />}
                onSelect={async () => {
                  await setSpaceAction(s.id);
                  router.refresh();
                }}
              >
                {s.name}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => router.push("/espacios")}>Administrar espacios</MenuItem>
          </Menu>
          <Button asChild variant="secondary" className="h-10" title="Una tarea a la vez, sin distracciones">
            <Link href="/foco">
              <Crosshair className="size-4" /> Modo foco
            </Link>
          </Button>
          <Button variant="primary" className="h-10" onClick={openCapture} aria-keyshortcuts="c" title="Capturar una idea, tarea o nota en la Bandeja (C)">
            <Plus className="size-4" /> Capturar
            <kbd className="ml-1 rounded border border-white/40 px-1.5 font-mono text-[11px]">C</kbd>
          </Button>
        </>
      )}
    </header>
  );
}

/** Número en el ícono de la app instalada (PWA, Badging API): notificaciones sin leer. */
function useAppBadge(count: number) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    (count > 0 ? nav.setAppBadge(count) : (nav.clearAppBadge?.() ?? Promise.resolve())).catch(() => {});
  }, [count]);
}

export function BellLink({ count: initial, className, panel = false }: { count: number; className?: string; panel?: boolean }) {
  // El número se actualiza en vivo (components/shell/live-notifications.tsx emite «ag:unread»).
  const [live, setLive] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: al llegar un número nuevo del servidor, manda ese
  useEffect(() => setLive(null), [initial]);
  useEffect(() => {
    const on = (e: Event) => setLive(Number((e as CustomEvent).detail ?? 0));
    window.addEventListener("ag:unread", on);
    return () => window.removeEventListener("ag:unread", on);
  }, []);
  const count = live ?? initial;
  useAppBadge(count);
  // Desktop: la campana abre la vista rápida (se descarga al primer uso); celular o Ctrl/⌘+clic: va al centro.
  const [Panel, setPanel] = useState<ComponentType<{ onClose: () => void }> | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span className="relative" data-bell>
      <Link
        href="/notificaciones"
        aria-label={count ? `Notificaciones: ${count} sin leer` : "Notificaciones"}
        aria-expanded={panel ? open : undefined}
        onClick={(e) => {
          if (!panel || e.metaKey || e.ctrlKey || e.shiftKey || !window.matchMedia("(min-width: 768px)").matches) return;
          e.preventDefault();
          if (open) return setOpen(false);
          void import("@/components/notifications/bell-panel").then((m) => {
            setPanel(() => m.BellPanel);
            setOpen(true);
          });
        }}
        className={`relative grid size-10 place-items-center rounded-[9px] border border-border bg-surface text-text-muted hover:text-text ${className ?? ""}`}
      >
        <Bell className="size-[18px]" />
        {count ? (
          <span
            key={count}
            className="tab-pop absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#9A3F1B] px-1 font-mono text-[10px] font-semibold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Link>
      {open && Panel ? <Panel onClose={close} /> : null}
    </span>
  );
}
