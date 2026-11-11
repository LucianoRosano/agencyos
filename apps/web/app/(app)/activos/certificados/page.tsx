import { todayAR } from "@agencyos/core";
import { assetFormOptions, listCertificates } from "@agencyos/modules/assets/queries";
import { Badge, Card, EmptyState, EntityChip, Tabs } from "@agencyos/ui";
import { ShieldCheck } from "lucide-react";
import { CertificateMenu, NewCertificateButton } from "@/components/assets/asset-forms";
import { AssetsHeader } from "@/components/assets/header";
import { CERT_KIND, DueText } from "@/components/assets/shared";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Certificados · Activos técnicos" };

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "ssl", label: "SSL" },
  { key: "arca", label: "ARCA" },
  { key: "other", label: "Otros" },
];

export default async function CertificadosPage({ searchParams }: { searchParams: Promise<{ ver?: string; tipo?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [all, options] = await Promise.all([listCertificates(ctx), assetFormOptions(ctx)]);
  const tipo = FILTERS.some((f) => f.key === sp.tipo) ? (sp.tipo as string) : "todos";
  const rows = tipo === "todos" ? all : all.filter((r) => r.c.kind === tipo);
  const today = todayAR();
  return (
    <div className="mx-auto max-w-6xl">
      <AssetsHeader
        active="certificados"
        title="Certificados"
        description="SSL de los sitios (se leen solos del certificado TLS cada día), certificados de ARCA y otros."
        actions={<NewCertificateButton options={options} />}
        counts={{ certificados: all.length }}
      />
      {all.length ? (
        <>
          <div className="-mt-3">
            <Tabs
              active={tipo}
              items={FILTERS.map((f) => ({
                key: f.key,
                label: f.label,
                href: f.key === "todos" ? "/activos/certificados" : `/activos/certificados?tipo=${f.key}`,
                count: f.key === "todos" ? all.length : all.filter((r) => r.c.kind === f.key).length,
              }))}
            />
          </div>
          {rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map(({ c, clientName, siteName }) => (
                <li key={c.id}>
                  <Card className="relative flex flex-col gap-3 p-4 pr-14 md:flex-row md:items-center md:gap-5 md:pr-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={c.kind === "arca" ? "warning" : c.kind === "ssl" ? "success" : "neutral"}>{CERT_KIND[c.kind] ?? c.kind}</Badge>
                        <h3 className="min-w-0 truncate text-[15px] font-medium text-text">{c.subject}</h3>
                        {clientName ? <EntityChip color="#22D3EE">{clientName}</EntityChip> : null}
                        {siteName ? <EntityChip color="#F472B6">{siteName}</EntityChip> : null}
                      </div>
                      {c.notes ? <p className="mt-1 line-clamp-2 text-[13px] text-text-muted">{c.notes}</p> : null}
                    </div>
                    <div className="md:w-56 md:text-right">
                      <DueText expiresOn={c.expiresOn} today={today} notify={c.notifyDaysBefore} />
                      <p className="font-mono text-[11px] text-text-faint">aviso {c.notifyDaysBefore} d antes</p>
                    </div>
                    <div className="absolute top-1.5 right-1.5 md:static">
                      <CertificateMenu
                        openInitially={sp.ver === c.id}
                        options={options}
                        d={{
                          id: c.id,
                          kind: c.kind,
                          subject: c.subject,
                          expiresOn: c.expiresOn,
                          siteId: c.siteId,
                          clientId: c.clientId,
                          notes: c.notes,
                          notifyDaysBefore: c.notifyDaysBefore,
                        }}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <EmptyState compact icon={<ShieldCheck />} title={`Sin certificados ${FILTERS.find((f) => f.key === tipo)?.label ?? ""}`} />
            </Card>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<ShieldCheck />}
            title="Todavía no hay certificados"
            description="Los SSL aparecen solos cuando activás el monitoreo de un sitio. Cargá acá el certificado de ARCA de cada cliente para que no se te pase."
            action={<NewCertificateButton options={options} label="Agregar uno" />}
          />
        </Card>
      )}
    </div>
  );
}
