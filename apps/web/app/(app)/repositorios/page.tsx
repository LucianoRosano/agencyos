import { relativeFromDate } from "@agencyos/core";
import { githubStatus, listRepos, scopeCounts } from "@agencyos/modules/repos/queries";
import { Badge, Button, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { Archive, ChevronRight, GitBranch, Lock, PlugZap } from "lucide-react";
import Link from "next/link";
import { FilterChips, SearchBox } from "@/components/crm/crm-nav";
import { ConnectFakeButton, GeneratePlanButton, SyncButton } from "@/components/repos/repo-ui";
import { HealthRing, REPOS_ACCENT, SCOPE_LABEL } from "@/components/repos/shared";
import { requireCtx } from "@/lib/session";
import { ReposNav } from "./nav";

export const metadata = { title: "Repositorios" };

const SCOPES = ["todos", "prod", "cli", "int", "tpl", "per", "edu", "sin"] as const;

export default async function ReposPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const status = await githubStatus(ctx);
  const connected = status.installations.length > 0;

  if (!connected) return <NotConnected status={status} />;

  const scope = SCOPES.find((s) => s === sp.alcance && s !== "todos");
  const [rows, counts] = await Promise.all([listRepos(ctx, { scope, q: sp.q, band: sp.salud }), scopeCounts(ctx)]);
  const total = counts.reduce((a, c) => a + c.n, 0);
  const red = counts.reduce((a, c) => a + c.red, 0);
  const href = (k: string) => `/repositorios?${new URLSearchParams({ alcance: k, ...(sp.q ? { q: sp.q } : {}) })}`;
  const lastSync = status.installations.map((i) => i.lastSyncedAt).sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Repositorios · {status.installations.map((i) => i.accountLogin).join(", ")}
            {status.mode === "fake" ? <Badge tone="warning">GitHub simulado</Badge> : null}
          </span>
        }
        title="Repositorios"
        description={`Estándar verificado y puntaje de salud. Última sincronización: ${lastSync ? relativeFromDate(lastSync) : "nunca"}.`}
        accent={REPOS_ACCENT}
        actions={
          <>
            <SyncButton />
            {red > 0 ? <GeneratePlanButton /> : null}
          </>
        }
      />
      <ReposNav active="repos" />
      <FilterChips
        active={scope ?? "todos"}
        items={SCOPES.map((k) => ({
          key: k,
          label: k === "todos" ? "Todos" : k === "sin" ? "Sin alcance" : `${k} · ${SCOPE_LABEL[k]}`,
          href: href(k),
          count: k === "todos" ? total : (counts.find((c) => (k === "sin" ? c.scope === null : c.scope === k))?.n ?? 0),
        })).filter((x) => x.key === "todos" || x.count > 0 || x.key === scope)}
      />
      <SearchBox action="/repositorios" q={sp.q} placeholder="Buscar por nombre o descripción…" hidden={{ alcance: sp.alcance }} />
      {red > 0 && !sp.q && !scope ? (
        <p className="mb-4 text-[13px] text-text-muted">
          <span className="font-mono text-danger">{red}</span> {red === 1 ? "repositorio fuera de estándar" : "repositorios fuera de estándar"} (salud &lt; 70).
          «Generar plan» propone las correcciones; nada se ejecuta sin tu aprobación.
        </p>
      ) : null}

      {rows.length ? (
        <>
          <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                  <th className="w-16 px-4 py-3 font-normal">Salud</th>
                  <th className="px-3 py-3 font-normal">Repositorio</th>
                  <th className="px-3 py-3 font-normal">Alcance</th>
                  <th className="px-3 py-3 font-normal">Cliente · proyecto</th>
                  <th className="px-4 py-3 text-right font-normal">Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, clientName, projectName }) => (
                  <tr key={r.id} data-repo={r.name} className="group border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <HealthRing score={r.healthScore} />
                    </td>
                    <td className="max-w-[360px] px-3 py-2.5">
                      <Link href={`/repositorios/${r.id}`} className="flex items-center gap-1.5 font-medium text-text group-hover:underline">
                        <span className="truncate font-mono text-[13px]">{r.name}</span>
                        {r.private ? <Lock className="size-3.5 shrink-0 text-text-faint" aria-label="Privado" /> : null}
                        {r.archived ? <Archive className="size-3.5 shrink-0 text-text-faint" aria-label="Archivado" /> : null}
                      </Link>
                      <span className="block truncate text-[12px] text-text-muted">{r.description ?? "Sin descripción"}</span>
                    </td>
                    <td className="px-3 py-2.5">{r.scope ? <Badge>{r.scope}</Badge> : <span className="text-text-faint">—</span>}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-text-muted">{[clientName, projectName].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] whitespace-nowrap text-text-faint">{relativeFromDate(r.pushedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2.5 md:hidden">
            {rows.map(({ r, clientName }) => (
              <li key={r.id} data-repo-card={r.name}>
                <Link
                  href={`/repositorios/${r.id}`}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 active:bg-surface-2"
                >
                  <HealthRing score={r.healthScore} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-mono text-[14px] text-text">{r.name}</p>
                      {r.scope ? <Badge className="shrink-0">{r.scope}</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-text-muted">{r.description ?? "Sin descripción"}</p>
                    <p className="mt-1 font-mono text-[11px] text-text-faint">
                      {clientName ? `${clientName} · ` : ""}
                      {relativeFromDate(r.pushedAt)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          icon={<GitBranch />}
          title={sp.q ? `Sin resultados para «${sp.q}»` : total ? "No hay repositorios con ese filtro" : "Todavía no hay repositorios sincronizados"}
          description={total ? "Probá con otro filtro." : "Sincronizá para traer los repositorios de la instalación de GitHub."}
          action={total ? undefined : <SyncButton variant="primary" />}
        />
      )}
    </div>
  );
}

function NotConnected({ status }: { status: Awaited<ReturnType<typeof githubStatus>> }) {
  const steps = [
    "Crear la GitHub App «AGENCYOS» con permisos mínimos (un clic: GitHub completa todo con el manifest).",
    "Copiar las credenciales que se muestran UNA vez al .env del servidor y reiniciar.",
    "Instalarla en tu cuenta personal eligiendo los repositorios.",
    "Sincronizar: AGENCYOS verifica el estándar y calcula la salud de cada repositorio.",
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Repositorios" title="Repositorios" description="Claude te organiza el GitHub: estándar verificable, planes con aprobación y registro." accent={REPOS_ACCENT} />
      <Card className="p-5 md:p-6">
        <SectionLabel icon={<GitBranch />} className="mb-4">
          Conectar GitHub
        </SectionLabel>
        <ol className="mb-5 flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3 text-[14px] text-text">
              <span className="font-mono text-[13px] text-text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        {status.mode === "fake" ? (
          <div className="flex flex-wrap items-center gap-3">
            <ConnectFakeButton />
            <span className="text-[13px] text-text-muted">Modo de prueba: GitHub simulado con datos de fixtures (solo tests).</span>
          </div>
        ) : status.appConfigured ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-text-muted">La App está configurada. Falta instalarla en tu cuenta.</p>
            <div>
              <Button asChild variant="primary">
                <a href="/api/github/install">
                  <PlugZap className="size-4" /> Instalar la App en GitHub
                </a>
              </Button>
            </div>
          </div>
        ) : status.https ? (
          <div>
            <Button asChild variant="primary">
              <a href="/api/github/manifest">
                <PlugZap className="size-4" /> Crear la GitHub App
              </a>
            </Button>
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Lock />}
            title="Hace falta el dominio con https"
            description={`GitHub tiene que poder enviar los webhooks a ${status.appUrl || "la URL pública de AGENCYOS"}/api/webhooks/github. Con la app en ${status.appUrl || "localhost"} (sin https) no se puede crear la App: se hace al publicar AGENCYOS con su dominio (docs/runbooks/github-app.md).`}
          />
        )}
      </Card>
    </div>
  );
}
