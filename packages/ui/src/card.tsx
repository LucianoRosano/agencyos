import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface", className)} {...props} />;
}

/** Encabezado de bloque al estilo de las vistas de referencia: ícono + etiqueta mono en mayúsculas espaciadas. */
export function SectionLabel({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.18em] text-text-muted", className)}>
      {icon ? <span className="text-text-muted [&>svg]:size-4">{icon}</span> : null}
      <span>{children}</span>
    </div>
  );
}

export function BlockCard({
  icon,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col p-4 md:p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionLabel icon={icon}>{title}</SectionLabel>
        {action}
      </div>
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </Card>
  );
}
