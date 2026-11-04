"use client";

import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@agencyos/ui";
import { Brain, BriefcaseBusiness, FileText, FolderKanban, Plus, Sun, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setSpaceAction } from "@/app/actions/shell";
import { Logo } from "@/components/logo";
import { navFor } from "./nav-config";
import { BottomLink } from "./nav-link";
import { openCapture, SearchIconButton } from "./palette-trigger";
import { initials, type ShellData } from "./sidebar";
import { BellLink } from "./topbar";

export function MobileHeader({ data }: { data: ShellData }) {
  const router = useRouter();
  const items = navFor(data.enabledModules);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 backdrop-blur-md md:hidden">
      <Link href="/hoy" aria-label="AGENCYOS · Hoy">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        <BellLink count={data.counts.notifications ?? 0} className="size-11 rounded-xl" />
        <SearchIconButton />
        <Menu
          trigger={
            <button
              type="button"
              aria-label="Más: módulos y configuración"
              className="grid size-11 place-items-center rounded-full border border-border bg-surface-2 font-mono text-[13px] font-semibold"
            >
              {initials(data.user.name)}
            </button>
          }
        >
          <MenuLabel>Módulos</MenuLabel>
          {items.map((it) => (
            <MenuItem key={it.key} icon={it.icon} onSelect={() => router.push(it.href)}>
              {it.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuLabel>Espacio</MenuLabel>
          <MenuItem
            onSelect={async () => {
              await setSpaceAction("all");
              router.refresh();
            }}
          >
            {!data.selectedSpace ? "● " : ""}Todos los espacios
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
              {data.selectedSpace === s.id ? "● " : ""}
              {s.name}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => router.push("/foco")}>Modo foco</MenuItem>
          <MenuItem onSelect={() => router.push("/configuracion")}>Configuración</MenuItem>
        </Menu>
      </div>
    </header>
  );
}

export function BottomNav({ data }: { data: ShellData }) {
  const hasNotes = data.enabledModules.includes("notes");
  const hasBrain = data.enabledModules.includes("brain");
  return (
    <nav
      aria-label="Navegación inferior"
      className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-border bg-bg/92 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <BottomLink href="/hoy" icon={<Sun />} label="Hoy" />
      <BottomLink href="/proyectos" icon={<FolderKanban />} label="Proyectos" />
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={openCapture}
          aria-label="Capturar"
          className="-mt-7 mb-2 grid size-16 place-items-center rounded-[20px] bg-[image:var(--gradient)] text-white shadow-[0_8px_30px_-6px_var(--accent)] ring-4 ring-bg active:scale-95"
        >
          <Plus className="size-7" strokeWidth={2} />
        </button>
      </div>
      {hasNotes ? (
        <BottomLink href="/notas" icon={<FileText />} label="Notas" />
      ) : (
        <BottomLink href="/crm/clientes" match="/crm" icon={<BriefcaseBusiness />} label="CRM" />
      )}
      {hasBrain ? <BottomLink href="/cerebro" icon={<Brain />} label="Cerebro" /> : <BottomLink href="/finanzas" icon={<Wallet />} label="Finanzas" />}
    </nav>
  );
}
