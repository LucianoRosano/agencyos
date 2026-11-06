import { formatDateTime, relativeFromDate } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { getRepo, linkOptions, listPlans } from "@agencyos/modules/repos/queries";
import { Badge, Card, EmptyState, PageHeader, SectionLabel, Tabs } from "@agencyos/ui";
import { ExternalLink, GitCommitHorizontal, GitPullRequest, Link2, ListChecks, Tag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { ConfirmSuggestion, GeneratePlanButton, LinksForm } from "@/components/repos/repo-ui";
import { CheckIcon, HealthRing, PlanStatusBadge, REPOS_ACCENT, SCOPE_LABEL } from "@/components/repos/shared";
import { requireCtx } from "@/lib/session";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "estandar", label: "Estándar" },
  { key: "actividad", label: "Actividad" },
  { key: "vinculos", label: "Vínculos" },
];

const CHECKS: { key: string; label: string; weight: number }[] = [
  { key: "nombre", label: "Nombre", weight: 10 },
  { key: "descripcion", label: "Descripción", weight: 5 },
  { key: "topics", label: "Topics", weight: 10 },
  { key: "readme", label: "README", weight: 15 },
  { key: "claude_md", label: "CLAUDE.md", weight: 10 },
  { key: "gitignore", label: ".gitignore", weight: 5 },
  { key: "secretos", label: "Secretos (gitleaks)", weight: 20 },
  { key: "ci", label: "CI", weight: 10 },
  { key: "rama_protegida", label: "Rama protegida", weight: 5 },
  { key: "seguridad", label: "Alertas de seguridad", weight: 5 },
  { key: "coherencia_estado", label: "Coherencia de estado", weight: 5 },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const r = await getRepo(ctx, (await params).id);
  return { title: r?.r.name ?? "Repositorio" };
}

export default async function RepoPage({ params }: { params: Promise<{ id: string; tab?: string[] }> }) {
  const { id, tab: tabParts } = await params;
  const tab = TABS.find((t) => t.key === tabParts?.[0])?.key ?? "resumen";
  const ctx = await requireCtx();
  const data = await getRepo(ctx, id);
  if (!data) notFound();
  const { r } = data;
  const byKey = new Map(data.checks.map((c) => [c.checkKey, c]));
  const failing = CHECKS.filter((c) => ["fail", "warn"].includes(byKey.get(c.key)?.status ?? ""));
  const msg = (k: string) => (byKey.get(k)?.details as { message?: string } | undefined)?.message ?? "Sin verificar todavía";
  const plans = tab === "resumen" ? await listPlans(ctx, { repositoryId: id }) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Repositorio{r.scope ? ` · ${r.scope} · ${SCOPE_LABEL[r.scope] ?? ""}` : ""}
            {r.archived ? <Badge>Archivado</Badge> : null}
          </span>
        }
        title={<span className="font-mono text-[22px] break-all md:text-[28px]">{r.name}</span>}
        description={r.description ?? "Sin descripción"}
        accent={REPOS_ACCENT}
        actions={
          <>
            <a
              href={`https://github.com/${r.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <ExternalLink className="size-4" /> Abrir en GitHub
            </a>
            {failing.length && !r.archived ? <GeneratePlanButton repositoryIds={[r.id]} /> : null}
          </>
        }
      />
      <Tabs
        active={tab}
        items={TABS.map((t) => ({
          ...t,
          href: `/repositorios/${id}${t.key === "resumen" ? "" : `/${t.key}`}`,
          count: t.key === "estandar" ? failing.length || undefined : undefined,
        }))}
      />

      {tab === "resumen" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <Card className="flex items-center gap-5 p-5">
              <HealthRing score={r.healthScore} size={72} />
              <div className="min-w-0">
                <SectionLabel>Salud</SectionLabel>
                <p className="mt-1 text-[15px] text-text">
                  {r.healthScore === null
                    ? "Sin calcular"
                    : r.healthScore >= 90
                      ? "Cumple el estándar"
                      : r.healthScore >= 70
                        ? "Casi: quedan detalles"
                        : "Fuera de estándar"}
                </p>
                <p className="text-[13px] text-text-muted">
                  {failing.length ? `${failing.length} checks con desvíos · ` : ""}verificado {relativeFromDate(r.lastSyncedAt)}
                </p>
              </div>
            </Card>
            {failing.length ? (
              <Card className="p-5">
                <SectionLabel className="mb-3">Desvíos</SectionLabel>
                <ul className="flex flex-col gap-2.5">
                  {failing.map((c) => (
                    <li key={c.key} className="flex items-start gap-3 text-[14px]">
                      <CheckIcon status={byKey.get(c.key)?.status ?? "na"} />
                      <span className="min-w-0">
                        <span className="text-text">{c.label}</span>
                        <span className="block text-[13px] text-text-muted">{msg(c.key)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <Card className="p-5">
              <SectionLabel className="mb-3">Planes</SectionLabel>
              {plans.length ? (
                <ul className="flex flex-col divide-y divide-border">
                  {plans.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <Link href={`/repositorios/planes/${p.id}`} className="flex min-h-11 items-center gap-3 py-2 hover:text-text">
                        <span className="min-w-0 flex-1 truncate text-[14px] text-text">{p.name}</span>
                        <PlanStatusBadge status={p.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-text-muted">Sin planes para este repositorio.</p>
              )}
            </Card>
          </div>
          <Card className="h-fit p-5">
            <SectionLabel className="mb-4">Propiedades</SectionLabel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
              <dt className="text-text-muted">Nombre</dt>
              <dd className="font-mono text-[13px] break-all">{r.fullName}</dd>
              <dt className="text-text-muted">Visibilidad</dt>
              <dd>{r.private ? "Privado" : <Badge tone="warning">Público</Badge>}</dd>
              <dt className="text-text-muted">Rama</dt>
              <dd className="font-mono text-[13px]">{r.defaultBranch}</dd>
              <dt className="text-text-muted">Lenguaje</dt>
              <dd>{r.language ?? "—"}</dd>
              <dt className="text-text-muted">Último push</dt>
              <dd title={formatDateTime(r.pushedAt)}>{relativeFromDate(r.pushedAt)}</dd>
              <dt className="text-text-muted">Cliente</dt>
              <dd>{r.clientId ? <Link href={`/crm/clientes/${r.clientId}`}>{data.clientName}</Link> : "—"}</dd>
              <dt className="text-text-muted">Proyecto</dt>
              <dd>{r.projectId ? <Link href={`/proyectos/${r.projectId}`}>{data.projectName}</Link> : "—"}</dd>
              <dt className="text-text-muted">Producto</dt>
              <dd>{data.productName ?? "—"}</dd>
              <dt className="text-text-muted">Sitio</dt>
              <dd>{data.site ? <Link href={`/sitios/${data.site.id}`}>{data.site.name}</Link> : "—"}</dd>
            </dl>
            {r.topics.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {r.topics.map((t) => (
                  <Badge key={t} className="font-mono">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "estandar" ? (
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {CHECKS.map((c) => {
                const row = byKey.get(c.key);
                return (
                  <li key={c.key} data-check={c.key} data-status={row?.status ?? "none"} className="flex items-start gap-3 px-4 py-3.5 md:px-5">
                    <CheckIcon status={row?.status ?? "na"} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[14px] text-text">
                        {c.label}
                        <span className="font-mono text-[11px] text-text-faint">peso {c.weight}</span>
                      </p>
                      <p className="text-[13px] break-words text-text-muted">{msg(c.key)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="text-[13px] text-text-muted">
            Cumple = peso completo · advertencia = la mitad · no aplica = el peso se redistribuye. Si gitleaks encuentra secretos, el máximo es 40.
          </p>
          {failing.length && !r.archived ? (
            <div>
              <GeneratePlanButton repositoryIds={[r.id]} />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "actividad" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Card className="p-5">
            <SectionLabel className="mb-3">Actividad</SectionLabel>
            <ActivityList rows={await listActivity(ctx, { entityType: "repository", entityId: id, limit: 100 })} />
          </Card>
          <Card className="h-fit p-5">
            <SectionLabel className="mb-3">Eventos de GitHub</SectionLabel>
            {data.events.length ? (
              <ul className="flex flex-col gap-2.5">
                {data.events.map((e) => {
                  const x = e.payloadExcerpt as {
                    action?: string;
                    ref?: string;
                    number?: number;
                    title?: string;
                    tag?: string;
                    url?: string;
                    commits?: number;
                  };
                  const icon = e.kind === "pr" ? <GitPullRequest /> : e.kind === "release" ? <Tag /> : <GitCommitHorizontal />;
                  const text =
                    e.kind === "pr"
                      ? `PR #${x.number} ${x.action}: ${x.title ?? ""}`
                      : e.kind === "release"
                        ? `Release ${x.tag ?? ""}`
                        : e.kind === "push"
                          ? `Push a ${String(x.ref ?? "").replace("refs/heads/", "")} (${x.commits ?? 0})`
                          : `${e.kind} ${x.action ?? ""}`;
                  return (
                    <li key={e.id} className="flex items-start gap-2.5 text-[13px]">
                      <span className="mt-0.5 text-text-faint [&>svg]:size-4">{icon}</span>
                      <span className="min-w-0 flex-1 break-words">
                        {x.url ? (
                          <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-text hover:underline">
                            {text}
                          </a>
                        ) : (
                          <span className="text-text">{text}</span>
                        )}
                        <span className="block font-mono text-[11px] text-text-faint">{relativeFromDate(e.at)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact icon={<GitCommitHorizontal />} title="Sin eventos todavía" description="Llegan por webhook: push, PR y releases." />
            )}
          </Card>
        </div>
      ) : null}

      {tab === "vinculos" ? <Links ctx={ctx} data={data} /> : null}
    </div>
  );
}

async function Links({ ctx, data }: { ctx: Awaited<ReturnType<typeof requireCtx>>; data: NonNullable<Awaited<ReturnType<typeof getRepo>>> }) {
  const { r } = data;
  const o = await linkOptions(ctx, { id: r.id, name: r.name, topics: r.topics });
  const current = { scope: r.scope ?? "", clientId: r.clientId ?? "", projectId: r.projectId ?? "", productId: r.productId ?? "", siteId: data.site?.id ?? "" };
  const s = o.suggestion;
  const sugg = [
    s.client && !r.clientId
      ? { field: "clientId" as const, id: s.client.id, label: o.clients.find((c) => c.id === s.client?.id)?.name ?? "", what: "Cliente" }
      : null,
    s.project && !r.projectId
      ? { field: "projectId" as const, id: s.project.id, label: o.projects.find((p) => p.id === s.project?.id)?.name ?? "", what: "Proyecto" }
      : null,
    s.product && !r.productId
      ? { field: "productId" as const, id: s.product.id, label: o.products.find((p) => p.id === s.product?.id)?.name ?? "", what: "Producto" }
      : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="p-5">
        <SectionLabel className="mb-4">Vínculos</SectionLabel>
        <LinksForm
          repoId={r.id}
          defaults={current}
          options={{
            scopes: Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label: `${value} · ${label}` })),
            clients: o.clients.map((c) => ({ value: c.id, label: c.name })),
            projects: o.projects.map((p) => ({ value: p.id, label: p.name })),
            products: o.products.map((p) => ({ value: p.id, label: p.name })),
            sites: o.sites.map((x) => ({ value: x.id, label: x.name })),
          }}
        />
      </Card>
      <Card className="h-fit p-5">
        <SectionLabel icon={<Link2 />} className="mb-3">
          Sugerencias
        </SectionLabel>
        {sugg.length ? (
          <ul className="flex flex-col gap-3">
            {sugg.map((x) => (
              <li key={x.field} className="flex items-center gap-3 text-[14px]">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-text-muted">{x.what} (por nombre y topics)</span>
                  <span className="text-text">{x.label}</span>
                </span>
                <ConfirmSuggestion repoId={r.id} current={current} field={x.field} value={x.id} label={x.label} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<ListChecks />}
            title="Sin sugerencias pendientes"
            description="La convención de nombres y los topics se usan para inferir cliente, proyecto y producto. Lo seguro se vincula solo al sincronizar."
          />
        )}
      </Card>
    </div>
  );
}
