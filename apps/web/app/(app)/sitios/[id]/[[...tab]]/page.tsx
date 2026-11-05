import { L, label } from "@agencyos/core";
import { getSite, siteFormOptions } from "@agencyos/modules/sites/queries";
import { Badge, Card, PageHeader, Progress, Tabs } from "@agencyos/ui";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pct, SITES_ACCENT } from "@/components/sites/shared";
import { EditSiteSheet } from "@/components/sites/site-form";
import { PublicationStatusSelect, SiteMenu } from "@/components/sites/site-header";
import {
  BriefTab,
  ContentTab,
  DocsTab,
  HostingTab,
  LaunchTab,
  MonitoringTab,
  RequirementsTab,
  ResourcesTab,
  RevisionsTab,
  StructureTab,
} from "@/components/sites/tabs";
import { requireCtx } from "@/lib/session";

const TABS = [
  { key: "briefing", label: "Briefing" },
  { key: "requerimientos", label: "Requerimientos" },
  { key: "estructura", label: "Estructura" },
  { key: "contenidos", label: "Contenidos" },
  { key: "recursos", label: "Recursos" },
  { key: "revisiones", label: "Revisiones" },
  { key: "dominio-y-hosting", label: "Dominio y hosting" },
  { key: "publicacion", label: "Publicación" },
  { key: "documentacion", label: "Documentación" },
  { key: "monitoreo", label: "Monitoreo" },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Sitio" };
  const ctx = await requireCtx();
  const s = await getSite(ctx, id);
  return { title: s?.s.name ?? "Sitio" };
}

const host = (u: string | null) => (u ? u.replace(/^https?:\/\//, "").replace(/\/$/, "") : null);

export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id, tab: tabParts } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === tabParts?.[0])?.key ?? "briefing";
  if (tabParts?.length && (tabParts.length > 1 || !TABS.some((t) => t.key === tabParts[0]))) notFound();
  const ctx = await requireCtx();
  const data = await getSite(ctx, id);
  if (!data) notFound();
  const { s } = data;
  const { clients, projects } = await siteFormOptions(ctx);
  const base = `/sitios/${id}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            Sitio · {label(L.siteKind, s.kind)}
            {data.clientName ? (
              <>
                ·{" "}
                <Link href={`/crm/clientes/${s.clientId}`} className="hover:text-text">
                  {data.clientName}
                </Link>
              </>
            ) : null}
            {s.archivedAt ? <Badge>Archivado</Badge> : null}
          </span>
        }
        title={s.name}
        accent={SITES_ACCENT}
        actions={
          <>
            <PublicationStatusSelect id={s.id} status={s.publicationStatus} />
            <EditSiteSheet
              id={s.id}
              clients={clients.map((c) => ({ value: c.id, label: c.name }))}
              projects={projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId, kind: p.kind }))}
              defaults={{
                name: s.name,
                clientId: s.clientId,
                projectId: s.projectId,
                kind: s.kind,
                stack: s.stack,
                prodUrl: s.prodUrl,
                stagingUrl: s.stagingUrl,
                notesMd: s.notesMd,
              }}
            />
            <SiteMenu id={s.id} name={s.name} archived={Boolean(s.archivedAt)} />
          </>
        }
      />

      <Card className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-[13px] md:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <p className="text-text-muted">Stack</p>
          <p className="truncate text-text">{label(L.siteStack, s.stack)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-text-muted">Proyecto</p>
          {s.projectId && data.projectName ? (
            <Link href={`/proyectos/${s.projectId}`} className="block truncate text-text hover:text-accent-text">
              {data.projectName}
            </Link>
          ) : (
            <p className="text-text-faint">—</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-text-muted">Producción</p>
          {s.prodUrl ? (
            <a href={s.prodUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1 text-accent-2 hover:underline">
              <span className="truncate font-mono text-[12px]">{host(s.prodUrl)}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            <p className="text-text-faint">—</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-text-muted">Staging</p>
          {s.stagingUrl ? (
            <a href={s.stagingUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1 text-accent-2 hover:underline">
              <span className="truncate font-mono text-[12px]">{host(s.stagingUrl)}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : (
            <p className="text-text-faint">—</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="flex justify-between text-text-muted">
            Contenidos <span className="font-mono">{data.slotsTotal ? `${pct(data.slotsDone, data.slotsTotal)}%` : "—"}</span>
          </p>
          <Progress value={pct(data.slotsDone, data.slotsTotal)} className="mt-2" label="Contenidos aprobados" />
        </div>
        <div className="min-w-0">
          <p className="flex justify-between text-text-muted">
            Checklist{" "}
            <span className="font-mono">
              {data.checksDone}/{data.checksTotal}
            </span>
          </p>
          <Progress value={pct(data.checksDone, data.checksTotal)} tone="success" className="mt-2" label="Checklist de lanzamiento" />
        </div>
      </Card>

      <Tabs
        active={tab}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: t.key === "briefing" ? base : `${base}/${t.key}`,
          count: t.key === "revisiones" && data.openItems ? data.openItems : undefined,
        }))}
      />

      {tab === "briefing" ? <BriefTab ctx={ctx} site={data} /> : null}
      {tab === "requerimientos" ? <RequirementsTab ctx={ctx} site={data} /> : null}
      {tab === "estructura" ? <StructureTab ctx={ctx} site={data} page={sp.pagina} editing={sp.editar === "1"} /> : null}
      {tab === "contenidos" ? <ContentTab ctx={ctx} site={data} status={sp.estado} /> : null}
      {tab === "recursos" ? <ResourcesTab ctx={ctx} site={data} /> : null}
      {tab === "revisiones" ? <RevisionsTab ctx={ctx} site={data} /> : null}
      {tab === "dominio-y-hosting" ? <HostingTab ctx={ctx} site={data} /> : null}
      {tab === "publicacion" ? <LaunchTab ctx={ctx} site={data} /> : null}
      {tab === "documentacion" ? <DocsTab ctx={ctx} site={data} /> : null}
      {tab === "monitoreo" ? <MonitoringTab ctx={ctx} site={data} /> : null}
    </div>
  );
}
