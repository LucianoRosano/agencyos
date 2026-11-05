import { formatDate, formatDateTime } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { assetFormOptions, getProduct } from "@agencyos/modules/assets/queries";
import { Badge, Card, EmptyState, EntityChip, PageHeader, SectionLabel } from "@agencyos/ui";
import { Activity, GitBranch, History, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { AddVersionButton, InstallationMenu, NewInstallationButton, ProductMenu, VersionMenu } from "@/components/assets/product-ui";
import { ASSETS_ACCENT, INSTALLATION_STATUS, PRODUCT_KIND } from "@/components/assets/shared";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import { requireCtx } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const p = await getProduct(ctx, (await params).id).catch(() => null);
  return { title: p ? `${p.p.name} · Productos propios` : "Producto propio" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getProduct(ctx, id);
  if (!data) notFound();
  const [options, activity] = await Promise.all([assetFormOptions(ctx), listActivity(ctx, { entityType: "own_product", entityId: id, limit: 20 })]);
  const { p } = data;
  const latest = data.versions[0] ? { id: data.versions[0].id, version: data.versions[0].version } : null;
  const installOptions = {
    clients: options.clients,
    sites: options.sites,
    versions: data.versions.map((v) => ({ value: v.id, label: `v${v.version}` })),
  };
  const active = data.installations.filter((x) => x.i.status === "active");
  const outdated = active.filter((x) => x.outdated).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/activos/productos" className="hover:text-text">
              Productos propios
            </Link>
            · {PRODUCT_KIND[p.kind] ?? p.kind}
          </span>
        }
        title={p.name}
        description={p.description ?? undefined}
        accent={ASSETS_ACCENT}
        actions={
          <>
            <AddVersionButton productId={p.id} productName={p.name} latest={data.latest} />
            <ProductMenu
              d={{ id: p.id, name: p.name, kind: p.kind, description: p.description, repositoryId: p.repositoryId }}
              repositories={options.repositories}
            />
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "Última versión", v: data.latest ? `v${data.latest}` : "—" },
          { k: "Instalaciones activas", v: String(active.length) },
          { k: "Desactualizadas", v: String(outdated), warn: outdated > 0 },
          { k: "Repositorio", v: data.repoName ?? "—", mono: true },
        ].map((x) => (
          <Card key={x.k} className="p-4">
            <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{x.k}</dt>
            <dd
              className={`mt-1 truncate text-[20px] font-semibold tabular-nums ${x.warn ? "text-warning" : "text-text"} ${x.mono ? "font-mono text-[14px] font-normal" : ""}`}
            >
              {x.mono && data.repoName ? (
                <span className="inline-flex items-center gap-1.5">
                  <GitBranch className="size-3.5" aria-hidden /> {x.v}
                </span>
              ) : (
                x.v
              )}
            </dd>
          </Card>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel icon={<MonitorSmartphone />}>Instalaciones</SectionLabel>
            {data.installations.length ? <NewInstallationButton productId={p.id} options={installOptions} /> : null}
          </div>
          {data.installations.length ? (
            <ul className="flex flex-col">
              {data.installations.map(({ i, clientName, siteName, version, outdated: old }) => {
                const name = clientName ?? siteName ?? "Instalación";
                return (
                  <li key={i.id} className="flex items-start gap-3 border-b border-border py-3.5 last:border-0" data-installation={name}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] text-text">{name}</span>
                        {siteName && clientName ? <EntityChip color="#F472B6">{siteName}</EntityChip> : null}
                        <Badge tone={!version ? "neutral" : old ? "warning" : "success"}>{version ? `v${version}` : "versión sin registrar"}</Badge>
                        {old && data.latest ? <span className="text-[12px] text-warning">→ v{data.latest} disponible</span> : null}
                        {i.status !== "active" ? <Badge>{INSTALLATION_STATUS[i.status] ?? i.status}</Badge> : null}
                      </div>
                      {i.configRefMd ? <p className="mt-1 line-clamp-2 font-mono text-[12px] text-text-muted">{i.configRefMd}</p> : null}
                      {i.installedAt ? <p className="mt-0.5 font-mono text-[11px] text-text-faint">instalada el {formatDate(i.installedAt)}</p> : null}
                    </div>
                    <InstallationMenu
                      name={name}
                      options={installOptions}
                      latest={latest}
                      d={{
                        id: i.id,
                        versionId: i.versionId,
                        siteId: i.siteId,
                        clientId: i.clientId,
                        configRefMd: i.configRefMd,
                        installedAt: i.installedAt,
                        status: i.status,
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={<MonitorSmartphone />}
              title="Sin instalaciones"
              description="Registrá en qué cliente o sitio está instalado y con qué versión."
              action={<NewInstallationButton productId={p.id} options={installOptions} variant="primary" />}
            />
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-4 md:p-5">
            <SectionLabel icon={<History />} className="mb-4">
              Versiones
            </SectionLabel>
            {data.versions.length ? (
              <ol className="flex flex-col gap-4">
                {data.versions.map((v, idx) => (
                  <li key={v.id} className="border-l-2 pl-3" style={{ borderColor: idx === 0 ? ASSETS_ACCENT : "var(--border)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-[15px] text-text">
                          v{v.version} {idx === 0 ? <span className="ml-1 text-[11px] uppercase tracking-[0.14em] text-text-faint">última</span> : null}
                        </p>
                        <p className="font-mono text-[11px] text-text-faint" title={formatDateTime(v.releasedAt)}>
                          {formatDate(v.releasedAt)}
                        </p>
                      </div>
                      <VersionMenu id={v.id} version={v.version} />
                    </div>
                    {v.changelogMd ? <MarkdownView html={renderMarkdown(v.changelogMd)} className="mt-1 text-[13px]" /> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                compact
                icon={<History />}
                title="Sin versiones"
                description="Registrá la versión actual para saber qué instalación quedó atrás."
                action={<AddVersionButton productId={p.id} productName={p.name} latest={null} variant="secondary" />}
              />
            )}
          </Card>
          <Card className="p-4 md:p-5">
            <SectionLabel icon={<Activity />} className="mb-4">
              Actividad
            </SectionLabel>
            <ActivityList rows={activity} />
          </Card>
        </div>
      </div>
    </div>
  );
}
