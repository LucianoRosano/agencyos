import { formatDate, todayAR } from "@agencyos/core";
import { assetFormOptions, listDomains } from "@agencyos/modules/assets/queries";
import { Card, EmptyState, EntityChip } from "@agencyos/ui";
import { Globe, KeyRound, RefreshCw } from "lucide-react";
import { DomainMenu, NewDomainButton } from "@/components/assets/asset-forms";
import { AssetsHeader } from "@/components/assets/header";
import { DueText } from "@/components/assets/shared";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Dominios · Activos técnicos" };

export default async function DominiosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [rows, options] = await Promise.all([listDomains(ctx), assetFormOptions(ctx)]);
  const today = todayAR();
  return (
    <div className="mx-auto max-w-6xl">
      <AssetsHeader
        active="dominios"
        title="Dominios"
        description="Registrador, titular, vencimiento y DNS de cada dominio. Te avisamos antes de que venza."
        actions={<NewDomainButton options={options} />}
        counts={{ dominios: rows.length }}
      />
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map(({ d, clientName, siteName, credentialLabel, rdapAt }) => (
            <li key={d.id} data-domain={d.name}>
              <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Globe className="size-4 shrink-0 text-text-muted" aria-hidden />
                    <h3 className="truncate font-mono text-[15px] text-text">{d.name}</h3>
                    {clientName ? <EntityChip color="#22D3EE">{clientName}</EntityChip> : null}
                    {siteName ? <EntityChip color="#F472B6">{siteName}</EntityChip> : null}
                  </div>
                  <p className="mt-1 truncate text-[13px] text-text-muted">
                    {[d.registrar, d.holder ? `titular ${d.holder}` : null, d.dnsRef ? `DNS ${d.dnsRef}` : null].filter(Boolean).join(" · ") ||
                      "Sin registrador cargado"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:w-72 md:justify-end">
                  <div className="md:text-right">
                    <DueText expiresOn={d.expiresOn} today={today} notify={d.notifyDaysBefore} />
                    <p className="font-mono text-[11px] text-text-faint">
                      {d.autoRenew ? (
                        <span className="inline-flex items-center gap-1">
                          <RefreshCw className="size-3" aria-hidden /> renovación automática
                        </span>
                      ) : (
                        `aviso ${d.notifyDaysBefore} d antes`
                      )}
                      {rdapAt ? ` · fecha de RDAP (${formatDate(rdapAt)})` : ""}
                    </p>
                  </div>
                  {credentialLabel ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-text-muted" title="Referencia a Bitwarden">
                      <KeyRound className="size-3.5" aria-hidden /> {credentialLabel}
                    </span>
                  ) : null}
                </div>
                <div className="flex justify-end">
                  <DomainMenu
                    openInitially={sp.ver === d.id}
                    options={options}
                    d={{
                      id: d.id,
                      name: d.name,
                      clientId: d.clientId,
                      siteId: d.siteId,
                      registrar: d.registrar,
                      holder: d.holder,
                      expiresOn: d.expiresOn,
                      autoRenew: d.autoRenew,
                      dnsRef: d.dnsRef,
                      credentialRefId: d.credentialRefId,
                      notifyDaysBefore: d.notifyDaysBefore,
                    }}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<Globe />}
            title="Todavía no cargaste dominios"
            description="Cargá cada dominio con su registrador y titular. Si no sabés cuándo vence, dejalo vacío: el chequeo diario lo busca en RDAP."
            action={<NewDomainButton options={options} label="Agregar el primero" />}
          />
        </Card>
      )}
    </div>
  );
}
