import { relativeFromDate } from "@agencyos/core";
import { listEndpoints } from "@agencyos/modules/automations/queries";
import { Badge, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { ArrowDownToLine, ArrowUpFromLine, Webhook } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { AUTO_ACCENT } from "@/components/automations/shared";
import { EndpointMenu, NewEndpointSheet } from "@/components/automations/webhooks-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Webhooks" };

async function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

type Ep = Awaited<ReturnType<typeof listEndpoints>>[number];

function EndpointList({ rows, base, empty }: { rows: Ep[]; base: string; empty: string }) {
  if (!rows.length) return <p className="py-2 text-[14px] text-text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-medium text-text">{e.name}</span>
              {e.active ? null : <Badge tone="neutral">Pausado</Badge>}
            </p>
            <p className="mt-1 break-all font-mono text-[12px] text-text-muted">{e.direction === "in" ? `${base}/api/webhooks/in/${e.id}` : e.url}</p>
            <p className="mt-1 font-mono text-[11px] text-text-faint">
              {e.deliveries
                ? `${e.deliveries} ${e.deliveries === 1 ? "entrega" : "entregas"} · última ${relativeFromDate(e.lastAt)}${e.lastCode ? ` · ${e.lastCode}` : " · sin respuesta"}`
                : "Sin entregas todavía"}
            </p>
          </div>
          <EndpointMenu id={e.id} name={e.name} active={e.active} direction={e.direction} baseUrl={base} />
        </li>
      ))}
    </ul>
  );
}

export default async function WebhooksPage() {
  const ctx = await requireCtx();
  const [rows, base] = await Promise.all([listEndpoints(ctx), baseUrl()]);
  const incoming = rows.filter((r) => r.direction === "in");
  const outgoing = rows.filter((r) => r.direction === "out");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href="/automatizaciones" className="hover:text-text">
            Automatizaciones
          </Link>
        }
        title="Webhooks"
        description="Firmados con HMAC-SHA256 y marca de tiempo (anti-replay de 5 minutos). Los secretos se guardan cifrados y se muestran una sola vez."
        accent={AUTO_ACCENT}
        actions={rows.length ? <NewEndpointSheet baseUrl={base} /> : undefined}
      />
      {rows.length ? (
        <div className="flex flex-col gap-5">
          <Card className="p-4 md:p-5">
            <SectionLabel icon={<ArrowDownToLine />} className="mb-2">
              Entrantes · {incoming.length}
            </SectionLabel>
            <p className="mb-2 text-[13px] text-text-muted">Cada entrega válida genera el evento «Webhook entrante recibido», que puede disparar reglas.</p>
            <EndpointList rows={incoming} base={base} empty="Ninguno. Creá uno para que un formulario, n8n u otro sistema dispare reglas." />
          </Card>
          <Card className="p-4 md:p-5">
            <SectionLabel icon={<ArrowUpFromLine />} className="mb-2">
              Salientes · {outgoing.length}
            </SectionLabel>
            <p className="mb-2 text-[13px] text-text-muted">Se usan desde la acción «Webhook saliente» de una regla. Cada envío queda registrado.</p>
            <EndpointList rows={outgoing} base={base} empty="Ninguno. Creá uno para avisarle a n8n, Zapier o tu propio servidor." />
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Webhook />}
            title="Sin webhooks"
            description="Entrante: un formulario o n8n le avisa a AGENCYOS y dispara reglas. Saliente: una regla le avisa a otro sistema con un POST firmado."
            action={<NewEndpointSheet baseUrl={base} />}
          />
        </Card>
      )}
    </div>
  );
}
