"use client";

import { Button, Menu, MenuItem, MenuLabel, MenuSeparator } from "@agencyos/ui";
import { Bell, ChevronDown, Crosshair, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
      <BellLink count={data.counts.notifications ?? 0} />
      <Menu
        trigger={
          <button type="button" className="flex h-10 items-center gap-2.5 rounded-[9px] border border-border bg-surface px-3.5 text-[14px] text-text hover:border-border-strong">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: selected ? selected.color : "conic-gradient(#22D3EE, #7C5CFF, #FBBF24, #22D3EE)" }} />
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
      <Button asChild variant="secondary" className="h-10">
        <Link href="/foco">
          <Crosshair className="size-4" /> Modo foco
        </Link>
      </Button>
      <Button variant="primary" className="h-10" onClick={openCapture}>
        <Plus className="size-4" /> Capturar
        <kbd className="ml-1 rounded border border-white/40 px-1.5 font-mono text-[11px]">C</kbd>
      </Button>
    </header>
  );
}

export function BellLink({ count, className }: { count: number; className?: string }) {
  return (
    <Link href="/notificaciones" aria-label={count ? `Notificaciones: ${count} sin leer` : "Notificaciones"} className={`relative grid size-10 place-items-center rounded-[9px] border border-border bg-surface text-text-muted hover:text-text ${className ?? ""}`}>
      <Bell className="size-[18px]" />
      {count ? <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] text-white">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
