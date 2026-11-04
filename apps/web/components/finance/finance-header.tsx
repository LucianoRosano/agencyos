import { Button, cn, EmptyState, PageHeader, Tabs } from "@agencyos/ui";
import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FIN_ACCENT } from "./shared";

export const FIN_TABS = [
  { key: "resumen", label: "Resumen", href: "/finanzas" },
  { key: "movimientos", label: "Movimientos", href: "/finanzas/movimientos" },
  { key: "por-cobrar", label: "Por cobrar", href: "/finanzas/por-cobrar" },
  { key: "por-pagar", label: "Por pagar", href: "/finanzas/por-pagar" },
  {
    key: "suscripciones",
    label: "Suscripciones",
    href: "/finanzas/suscripciones",
  },
  { key: "cuentas", label: "Cuentas", href: "/finanzas/cuentas" },
  { key: "reportes", label: "Reportes", href: "/finanzas/reportes" },
] as const;
export type FinTab = (typeof FIN_TABS)[number]["key"];

/**
 * Encabezado común de Finanzas: selector de libro (persistido en `?libro=`), "Registrar" siempre visible y pestañas.
 */
export function FinanceHeader({
  active,
  title,
  description,
  ledgers,
  ledgerId,
  actions,
  extraQuery = {},
}: {
  active: FinTab;
  title: string;
  description?: ReactNode;
  ledgers: { id: string; name: string }[];
  ledgerId?: string;
  actions?: ReactNode;
  extraQuery?: Record<string, string | undefined>;
}) {
  const base = FIN_TABS.find((t) => t.key === active)?.href ?? "/finanzas";
  const link = (path: string, libro?: string, extra: Record<string, string | undefined> = {}) => {
    const p = new URLSearchParams();
    if (libro) p.set("libro", libro);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
  const choices = [{ id: "", name: "Todo" }, ...ledgers];
  const registrar = link("/finanzas/movimientos", ledgerId, { nuevo: "1" });
  return (
    <>
      <PageHeader
        eyebrow={`Finanzas · ${ledgers.find((l) => l.id === ledgerId)?.name ?? "Vista combinada"}`}
        title={title}
        description={description}
        accent={FIN_ACCENT}
        actions={
          <>
            <nav aria-label="Libro" className="flex h-10 items-center rounded-[var(--radius-control)] border border-border bg-bg-elevated p-1">
              {choices.map((c) => {
                const on = (ledgerId ?? "") === c.id;
                return (
                  <a
                    key={c.id || "all"}
                    href={link(base, c.id || undefined, extraQuery)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex h-8 min-w-11 items-center justify-center rounded-md px-3 text-[13px] transition-colors",
                      on ? "bg-surface-2 font-medium text-text shadow-[inset_0_0_0_1px_var(--border)]" : "text-text-muted hover:text-text",
                    )}
                  >
                    {c.name}
                  </a>
                );
              })}
            </nav>
            {actions}
            <Button asChild variant="primary" className="hidden md:inline-flex">
              <Link href={registrar}>
                <Plus className="size-4" /> Registrar
              </Link>
            </Button>
          </>
        }
      />
      <Tabs
        active={active}
        items={FIN_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: link(t.href, ledgerId),
        }))}
      />
      {/* Celular: "Registrar" flotante, siempre visible sobre la navegación inferior. */}
      <Link
        href={registrar}
        className="fixed right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-12 items-center gap-2 rounded-full border border-success/40 bg-surface px-5 text-[15px] font-medium text-text shadow-[0_8px_30px_-8px_rgba(52,211,153,.55)] md:hidden"
      >
        <Plus className="size-5 text-success" /> Registrar
      </Link>
    </>
  );
}

export function NoFinanceAccess() {
  return (
    <EmptyState
      icon={<Lock />}
      title="No tenés acceso a Finanzas"
      description="Las finanzas son visibles solo para el dueño y los administradores del espacio de trabajo."
      action={
        <Button asChild>
          <Link href="/hoy">Volver a Hoy</Link>
        </Button>
      }
    />
  );
}
