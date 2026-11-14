import type { Metadata } from "next";
import Link from "next/link";
import { requirePortalCtx } from "@/lib/session";
import { PortalNav, PortalSignOut } from "./portal-ui";

export const metadata: Metadata = { title: { default: "Portal", template: "%s · Luciano Rosano" }, robots: { index: false, follow: false } };

/** Portal de clientes (M15): misma identidad visual, marca Luciano Rosano. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const pc = await requirePortalCtx();
  return (
    <div className="bg-grid flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-3" aria-label="Inicio del portal">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border-strong font-semibold">LR</span>
            <span className="hidden min-w-0 sm:block">
              <span className="block text-[15px] font-medium leading-tight">Luciano Rosano</span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-text-faint">Portal de clientes</span>
            </span>
          </Link>
          <PortalNav />
          <span className="ml-auto hidden truncate text-[13px] text-text-muted md:block">{pc.user.name}</span>
          <PortalSignOut />
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-16 md:px-6 md:pt-10">
        {children}
      </main>
      <footer className="border-t border-border py-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-text-faint">
        Luciano Rosano · Desarrollo web
      </footer>
    </div>
  );
}
