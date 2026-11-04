import { cn } from "./lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md bg-surface-2", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-8" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-72" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
