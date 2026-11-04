import { Tabs } from "@agencyos/ui";

/** Sub-navegación del CRM como pestañas del encabezado (docs/06 §1). */
export function CrmNav({
  active,
  counts,
}: {
  active: "clientes" | "contactos" | "oportunidades";
  counts?: Partial<Record<"clientes" | "contactos" | "oportunidades", number>>;
}) {
  return (
    <Tabs
      active={active}
      items={[
        { key: "clientes", label: "Clientes", href: "/crm/clientes", count: counts?.clientes },
        { key: "contactos", label: "Contactos", href: "/crm/contactos", count: counts?.contactos },
        { key: "oportunidades", label: "Oportunidades", href: "/crm/oportunidades", count: counts?.oportunidades },
      ]}
    />
  );
}

/** Chips de filtro (enlaces) con conteo. */
export function FilterChips({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Filtros" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
      {items.map((it) => (
        <a
          key={it.key}
          href={it.href}
          aria-current={active === it.key ? "true" : undefined}
          className={
            active === it.key
              ? "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3.5 text-[13px] text-text"
              : "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[13px] text-text-muted hover:text-text"
          }
        >
          {it.label}
          {it.count !== undefined ? <span className="font-mono text-[11px] text-text-faint">{it.count}</span> : null}
        </a>
      ))}
    </nav>
  );
}

export function SearchBox({
  action,
  q,
  placeholder,
  hidden,
}: {
  action: string;
  q?: string;
  placeholder: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form className="mb-5" action={action}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base text-text placeholder:text-text-faint md:max-w-sm md:text-sm"
      />
    </form>
  );
}
