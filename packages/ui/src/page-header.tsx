import type { ReactNode } from "react";
import { cn } from "./lib/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  accent,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <header className={cn("relative mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      {accent ? <span aria-hidden className="absolute -top-4 left-0 h-0.5 w-12 rounded-full md:-top-6" style={{ background: accent }} /> : null}
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 font-mono text-[12px] uppercase tracking-[0.18em] text-text-muted">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-semibold tracking-tight text-text md:text-[32px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[14px] text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <nav className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0" aria-label="Secciones">
      {items.map((it) => (
        <a
          key={it.key}
          href={it.href}
          aria-current={active === it.key ? "page" : undefined}
          className={cn(
            "relative flex h-10 shrink-0 items-center gap-2 px-3 text-sm transition-colors",
            active === it.key ? "text-text after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[image:var(--gradient)]" : "text-text-muted hover:text-text",
          )}
        >
          {it.label}
          {it.count !== undefined ? <span className="font-mono text-[11px] text-text-faint">{it.count}</span> : null}
        </a>
      ))}
    </nav>
  );
}
