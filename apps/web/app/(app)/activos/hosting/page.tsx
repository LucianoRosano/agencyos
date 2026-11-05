import { todayAR } from "@agencyos/core";
import { assetFormOptions, listHostings } from "@agencyos/modules/assets/queries";
import { Card, EmptyState, EntityChip } from "@agencyos/ui";
import { KeyRound, Server } from "lucide-react";
import { HostingMenu, NewHostingButton } from "@/components/assets/asset-forms";
import { AssetsHeader } from "@/components/assets/header";
import { DueText } from "@/components/assets/shared";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Hosting · Activos técnicos" };

export default async function HostingPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [rows, options] = await Promise.all([listHostings(ctx), assetFormOptions(ctx)]);
  const today = todayAR();
  return (
    <div className="mx-auto max-w-6xl">
      <AssetsHeader
        active="hosting"
        title="Hosting"
        description="Proveedor, plan, ubicación y vencimiento de cada hosting y VPS."
        actions={<NewHostingButton options={options} />}
        counts={{ hosting: rows.length }}
      />
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map(({ h, clientName, credentialLabel }) => (
            <li key={h.id}>
              <Card className="relative flex flex-col gap-3 p-4 pr-14 md:flex-row md:items-center md:gap-5 md:pr-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex min-w-0 max-w-full items-center gap-2">
                      <Server className="size-4 shrink-0 text-text-muted" aria-hidden />
                      <h3 className="truncate text-[15px] font-medium text-text">
                        {h.provider}
                        {h.plan ? <span className="font-normal text-text-muted"> · {h.plan}</span> : null}
                      </h3>
                    </span>
                    {clientName ? <EntityChip color="#22D3EE">{clientName}</EntityChip> : null}
                  </div>
                  <p className="mt-1 truncate text-[13px] text-text-muted">{h.location ?? "Sin ubicación cargada"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:w-72 md:justify-end">
                  <div className="md:text-right">
                    <DueText expiresOn={h.expiresOn} today={today} notify={h.notifyDaysBefore} />
                    <p className="font-mono text-[11px] text-text-faint">aviso {h.notifyDaysBefore} d antes</p>
                  </div>
                  {credentialLabel ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-text-muted" title="Referencia a Bitwarden">
                      <KeyRound className="size-3.5" aria-hidden /> {credentialLabel}
                    </span>
                  ) : null}
                </div>
                <div className="absolute top-1.5 right-1.5 md:static">
                  <HostingMenu
                    openInitially={sp.ver === h.id}
                    options={options}
                    d={{
                      id: h.id,
                      provider: h.provider,
                      plan: h.plan,
                      clientId: h.clientId,
                      expiresOn: h.expiresOn,
                      location: h.location,
                      credentialRefId: h.credentialRefId,
                      notifyDaysBefore: h.notifyDaysBefore,
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
            icon={<Server />}
            title="Todavía no cargaste hostings"
            description="Cargá el hosting de cada cliente y tu VPS con su vencimiento. Las credenciales van como referencia a Bitwarden."
            action={<NewHostingButton options={options} label="Agregar el primero" />}
          />
        </Card>
      )}
    </div>
  );
}
