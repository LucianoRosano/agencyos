import { buttonClass } from "@agencyos/ui";
import Link from "next/link";

/**
 * "Cargar más" de las listas paginadas por cursor (modules/shared/pagination). Sin JS: navega a `?hasta=<cursor>`, que
 * muestra todo lo anterior + la página siguiente, sin mover el scroll. `capped`: se llegó al tope de filas acumuladas.
 */
export function LoadMore({
  basePath,
  params,
  nextCursor,
  capped,
  shown,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  nextCursor: string | null;
  capped?: boolean;
  shown: number;
}) {
  if (capped)
    return (
      <p className="mt-4 text-center text-[13px] text-text-muted">
        Se muestran los primeros {shown.toLocaleString("es-AR")}. Usá la búsqueda o los filtros para encontrar el resto.
      </p>
    );
  if (!nextCursor) return null;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "hasta") qs.set(k, v);
  qs.set("hasta", nextCursor);
  return (
    <div className="mt-4 flex justify-center">
      <Link href={`${basePath}?${qs}`} scroll={false} className={buttonClass("secondary", "md", "min-h-11 px-5")} data-testid="cargar-mas">
        Cargar más
      </Link>
    </div>
  );
}
