import { L, label, relativeFromDate } from "@agencyos/core";
import type { listSites } from "@agencyos/modules/sites/queries";
import { Badge, Dot, Progress } from "@agencyos/ui";
import { ExternalLink, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { PUB_TONE, pct, SITES_ACCENT } from "./shared";

type Row = Awaited<ReturnType<typeof listSites>>[number];

/** Grilla de tarjetas de sitios (lista de Sitios y pestaña Sitios del cliente). */
export function SiteGrid({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(({ s, clientName, slotsDone, slotsTotal, checksDone, checksTotal, openItems }) => (
        <li key={s.id}>
          <Link
            href={`/sitios/${s.id}`}
            className="group flex h-full min-h-44 flex-col rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong md:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 text-[16px] font-medium text-text">{s.name}</h2>
              <Badge tone={PUB_TONE[s.publicationStatus]}>{label(L.publicationStatus, s.publicationStatus)}</Badge>
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-text-muted">
              <Dot color={clientName ? "#22D3EE" : SITES_ACCENT} />
              <span className="truncate">
                {clientName ?? "Sin cliente"} · {label(L.siteKind, s.kind)}
              </span>
            </p>
            {s.prodUrl || s.stagingUrl ? (
              <p className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[12px] text-text-faint">
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate">{(s.prodUrl ?? s.stagingUrl ?? "").replace(/^https?:\/\//, "")}</span>
              </p>
            ) : null}
            <dl className="mt-4 flex flex-1 flex-col justify-end gap-3 text-[12px]">
              <div>
                <dt className="mb-1 flex justify-between text-text-muted">
                  <span>Contenidos</span>
                  <span className="font-mono">{slotsTotal ? `${slotsDone}/${slotsTotal}` : "sin estructura"}</span>
                </dt>
                <dd>
                  <Progress value={pct(slotsDone, slotsTotal)} label={`Contenidos aprobados de ${s.name}`} />
                </dd>
              </div>
              <div>
                <dt className="mb-1 flex justify-between text-text-muted">
                  <span>Checklist de lanzamiento</span>
                  <span className="font-mono">
                    {checksDone}/{checksTotal}
                  </span>
                </dt>
                <dd>
                  <Progress value={pct(checksDone, checksTotal)} tone="success" label={`Checklist de ${s.name}`} />
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-between font-mono text-[12px] text-text-faint">
              <span className="flex items-center gap-1.5">
                {openItems ? (
                  <>
                    <MessageSquareWarning className="size-3.5 text-warning" /> {openItems} {openItems === 1 ? "cambio pedido" : "cambios pedidos"}
                  </>
                ) : (
                  label(L.siteStack, s.stack)
                )}
              </span>
              <span>{relativeFromDate(s.updatedAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
