import { Settings } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { NAV_GROUP_LABEL, type NavGroup, navFor } from "./nav-config";
import { NavLink } from "./nav-link";
import { OpenPaletteButton } from "./palette-trigger";
import { ThemeToggle } from "./theme-toggle";

export type ShellData = {
  user: { name: string; email: string };
  role: string;
  enabledModules: string[];
  counts: Record<string, number>;
  spaces: { id: string; name: string; color: string; projects: number }[];
  selectedSpace?: string;
  theme: string;
};

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Sidebar({ data }: { data: ShellData }) {
  const items = navFor(data.enabledModules);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 flex-col border-r border-border bg-bg md:flex">
      <div className="px-5 pt-6 pb-5">
        <Link href="/hoy" aria-label="AGENCYOS · Hoy">
          <Logo />
        </Link>
      </div>
      <div className="px-4">
        <OpenPaletteButton />
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Principal">
        {([undefined, "agencia", "conocimiento", "sistema"] as (NavGroup | undefined)[]).map((g) => {
          const groupItems = items.filter((it) => it.group === g);
          if (!groupItems.length) return null;
          return (
            <div key={g ?? "principal"}>
              {g ? <p className="mt-6 mb-2 px-3 font-mono text-[11px] uppercase tracking-[0.2em] text-text-faint">{NAV_GROUP_LABEL[g]}</p> : null}
              <ul className="flex flex-col gap-0.5">
                {groupItems.map((it) => (
                  <li key={it.key}>
                    <NavLink href={it.href} icon={it.icon} label={it.label} count={it.countKey ? data.counts[it.countKey] : undefined} match={it.match} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="mt-7 mb-2 px-3 font-mono text-[11px] uppercase tracking-[0.2em] text-text-faint">Espacios</p>
        <ul className="flex flex-col gap-0.5">
          {data.spaces.map((s) => (
            <li key={s.id}>
              <Link
                href={`/espacios/${s.id}`}
                className="flex h-10 items-center gap-3 rounded-[9px] px-3 text-[15px] text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.name}</span>
                {s.projects ? <span className="font-mono text-[12px] text-text-faint">{s.projects}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex items-center gap-3 border-t border-border px-4 py-4">
        <Link href="/configuracion" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-surface" aria-label="Configuración y perfil">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface-2 font-mono text-[13px] font-semibold text-text">
            {initials(data.user.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] text-text">{data.user.name.split(" ")[0]}</span>
            <span className="block text-[13px] text-text-muted">{data.role === "owner" ? "Dueño" : data.role}</span>
          </span>
        </Link>
        <Link
          href="/configuracion"
          className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text"
          aria-label="Configuración"
        >
          <Settings className="size-[18px]" />
        </Link>
        <ThemeToggle current={data.theme} />
      </div>
    </aside>
  );
}
