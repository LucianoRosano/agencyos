import { formatDate, formatMoney, L, label } from "@agencyos/core";
import { listRetainers } from "@agencyos/modules/retainers/service";
import { Badge, BlockCard } from "@agencyos/ui";
import { Repeat2 } from "lucide-react";
import Link from "next/link";
import { clientOpts, projectOpts } from "@/lib/options";
import type { AppCtx } from "@/lib/session";
import { LazyNewRetainerButton as NewRetainerButton } from "./retainer-lazy";

/** Abonos del cliente (pestaña Dinero de la ficha): qué paga por mes y cuándo se genera el próximo cobro. */
export async function ClientRetainers({ ctx, clientId }: { ctx: AppCtx; clientId: string }) {
  const [rows, clients, projects] = await Promise.all([listRetainers(ctx, { clientId }), clientOpts(ctx), projectOpts(ctx)]);
  return (
    <BlockCard
      icon={<Repeat2 />}
      title="Abonos mensuales"
      action={<NewRetainerButton clients={clients} projects={projects} defaultClientId={clientId} label="Nuevo" />}
    >
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map(({ r, projectName }) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <Link href="/finanzas/abonos" className="block truncate text-[14px] text-text hover:underline">
                  {r.concept}
                </Link>
                <p className="text-[12px] text-text-muted">
                  {projectName ? `${projectName} · ` : ""}día {r.billingDay}
                  {r.status === "active" ? ` · próximo cobro ${formatDate(r.nextIssueDate)}` : ""}
                </p>
              </div>
              {r.status !== "active" ? <Badge tone="neutral">{label(L.retainerStatus, r.status)}</Badge> : null}
              <span className="font-mono text-[14px] tabular-nums text-text">{formatMoney(r.amount, r.currency)}/mes</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-text-muted">
          Sin abonos. Si este cliente te paga algo todos los meses (mantenimiento, hosting, SEO), cargalo y el cobro se genera solo.
        </p>
      )}
    </BlockCard>
  );
}
