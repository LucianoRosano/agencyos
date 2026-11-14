import { formatDate, formatMoney, L, label } from "@agencyos/core";
import { portalQuotes } from "@agencyos/modules/portal/service";
import { Badge, Card, EmptyState, PageHeader } from "@agencyos/ui";
import { FileSignature } from "lucide-react";
import Link from "next/link";
import { requirePortalCtx } from "@/lib/session";

export const metadata = { title: "Presupuestos" };

const TONE = { sent: "accent", viewed: "accent", accepted: "success", rejected: "danger", expired: "warning" } as const;

export default async function PortalQuotesPage() {
  const pc = await requirePortalCtx();
  const quotes = pc.clientId ? await portalQuotes(pc) : [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Portal"
        title="Presupuestos"
        description="Los presupuestos que te mandó Luciano. Podés verlos, descargarlos y responder."
        accent="#22D3EE"
      />
      <Card className="p-2">
        {quotes.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/portal/presupuestos/${q.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-md px-3 py-3 hover:bg-surface-2"
                  data-testid="portal-quote"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{q.title}</span>
                    <span className="block truncate font-mono text-[12px] text-text-muted">
                      {q.number}
                      {q.validUntil ? ` · válido hasta ${formatDate(q.validUntil)}` : ""}
                    </span>
                  </span>
                  {q.total && q.currency ? <span className="hidden font-mono text-[14px] sm:inline">{formatMoney(q.total, q.currency)}</span> : null}
                  <Badge tone={TONE[q.status as keyof typeof TONE] ?? "neutral"}>
                    {q.status === "sent" || q.status === "viewed" ? "Para responder" : label(L.quoteStatus, q.status)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<FileSignature />} title="Todavía no hay presupuestos" description="Cuando Luciano te mande un presupuesto lo vas a ver acá." />
        )}
      </Card>
    </div>
  );
}
