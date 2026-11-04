"use client";

import { cn } from "@agencyos/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, icon, label, count, match }: { href: string; icon: ReactNode; label: string; count?: number; match?: string }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${match ?? href}/`) || (match ? path.startsWith(match) : false);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-[9px] px-3 text-[15px] transition-colors",
        active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface hover:text-text",
      )}
    >
      {active ? <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-[image:var(--gradient)]" /> : null}
      <span className={cn("[&>svg]:size-[18px] [&>svg]:stroke-[1.75]", active ? "text-accent" : "")}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count ? <span className="font-mono text-[12px] text-text-faint">{count}</span> : null}
    </Link>
  );
}

export function BottomLink({ href, icon, label, match }: { href: string; icon: ReactNode; label: string; match?: string }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${match ?? href}/`) || (match ? path.startsWith(match) : false);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px]", active ? "text-text" : "text-text-muted")}>
      <span className={cn("[&>svg]:size-[22px] [&>svg]:stroke-[1.75]", active ? "text-accent" : "")}>{icon}</span>
      {label}
    </Link>
  );
}
