import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/** Bloque de carga con la forma del contenido. El brillo arranca a los 150 ms y respeta prefers-reduced-motion. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md bg-surface-2", className)} />;
}

const keys = (n: number, p = "s") => Array.from({ length: n }, (_, i) => `${p}${i}`);

/**
 * Contenedor de toda pantalla de carga: anuncia "Cargando…" a lectores de pantalla y aparece recién a los 150 ms
 * (las navegaciones rápidas no titilan). Usa el mismo ancho máximo que la página real para que nada salte.
 */
export function LoadingShell({ label = "Cargando", className = "max-w-6xl", children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("loading-shell mx-auto flex w-full flex-col", className)}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** Encabezado de página (eyebrow + título + acciones) con la misma altura que PageHeader. */
export function HeaderSkeleton({ actions = 1, tabs = 0, description }: { actions?: number; tabs?: number; description?: boolean }) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-56 md:h-9 md:w-72" />
          {description ? <Skeleton className="h-3.5 w-full max-w-md" /> : null}
        </div>
        {actions ? (
          <div className="flex gap-2">
            {keys(actions, "a").map((k, i) => (
              <Skeleton key={k} className={cn("h-10", i === actions - 1 ? "w-36" : "w-24")} />
            ))}
          </div>
        ) : null}
      </div>
      {tabs ? (
        <div className="-mx-4 mb-6 flex gap-4 overflow-hidden border-b border-border px-4 pb-3 md:mx-0 md:px-0">
          {keys(tabs, "t").map((k) => (
            <Skeleton key={k} className="h-4 w-20 shrink-0" />
          ))}
        </div>
      ) : null}
    </>
  );
}

/** Lista en tarjeta (filas con ícono, título y metadato a la derecha). */
export function ListSkeleton({ rows = 6, toolbar = true }: { rows?: number; toolbar?: boolean }) {
  return (
    <>
      {toolbar ? <Skeleton className="mb-5 h-10 w-full md:max-w-sm" /> : null}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {keys(rows, "r").map((k) => (
          <div key={k} className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-3/5 max-w-sm" />
              <Skeleton className="h-3 w-2/5 max-w-[200px]" />
            </div>
            <Skeleton className="hidden h-3.5 w-16 sm:block" />
          </div>
        ))}
      </div>
    </>
  );
}

/** Grilla de tarjetas (proyectos, sitios, clientes en celular…). */
export function CardGridSkeleton({ count = 6, cols = 3, height = "h-40" }: { count?: number; cols?: 2 | 3 | 4; height?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", cols === 3 && "xl:grid-cols-3", cols === 4 && "lg:grid-cols-3 xl:grid-cols-4")}>
      {keys(count, "c").map((k) => (
        <div key={k} className={cn("flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-5", height)}>
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="mt-auto h-1.5 w-full rounded-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** Fila de KPIs (4 por fila en desktop, 2 en el celular). */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {keys(count, "k").map((k) => (
        <div key={k} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Bloque con etiqueta de sección y filas (como BlockCard). */
export function BlockSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-5", className)}>
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-4" />
        <Skeleton className="h-3 w-28" />
      </div>
      {keys(rows, "b").map((k) => (
        <div key={k} className="flex items-center gap-3">
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Ficha de entidad: encabezado, pestañas y dos columnas (contenido + panel lateral; en el celular, el panel va al final). */
export function DetailSkeleton({ tabs = 4 }: { tabs?: number }) {
  return (
    <>
      <Skeleton className="mb-4 h-3.5 w-32" />
      <HeaderSkeleton actions={2} tabs={tabs} />
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <BlockSkeleton rows={5} />
          <BlockSkeleton rows={3} />
        </div>
        <div className="flex flex-col gap-4">
          <BlockSkeleton rows={4} />
          <BlockSkeleton rows={2} />
        </div>
      </div>
    </>
  );
}

/** Kanban: columnas con tarjetas; en el celular se apilan como en la vista real. */
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {keys(columns, "col").map((k, i) => (
        <div key={k} className={cn("flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface/60 p-3", i > 0 && "hidden md:flex")}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-10" />
          </div>
          {keys(3 - (i % 2), `${k}c`).map((c) => (
            <Skeleton key={c} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Formulario en una columna (alta de entidades). */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-6">
      {keys(fields, "f").map((k) => (
        <div key={k} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="ml-auto h-10 w-32" />
    </div>
  );
}

/** Pantalla genérica (fallback para rutas sin skeleton propio). */
export function PageSkeleton() {
  return (
    <LoadingShell>
      <HeaderSkeleton />
      <div className="grid gap-4 md:grid-cols-3">
        <BlockSkeleton />
        <BlockSkeleton />
        <BlockSkeleton />
      </div>
      <BlockSkeleton rows={6} className="mt-4" />
    </LoadingShell>
  );
}
