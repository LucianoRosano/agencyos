import type { Ctx } from "@agencyos/core";
import { relativeFromDate } from "@agencyos/core";
import { githubStatus, listRepos, listTemplates } from "@agencyos/modules/repos/queries";
import { Badge, Card, EmptyState } from "@agencyos/ui";
import { ChevronRight, GitBranch } from "lucide-react";
import Link from "next/link";
import { CreateRepoSheet } from "./repo-ui";
import { HealthRing } from "./shared";

const TYPES = ["wp-plugin", "wp-tema", "wp-sitio", "php-panel", "app-web", "herramienta", "docs", "plantilla"];
const STACKS = ["wordpress", "woocommerce", "php", "python", "nextjs", "typescript"];

/** Pestaña "Repositorios" de la ficha de proyecto: vinculados + "Crear repositorio" (docs/15 §6). */
export async function ProjectRepos({ ctx, projectId, projectName, hasClient }: { ctx: Ctx; projectId: string; projectName: string; hasClient: boolean }) {
  const [rows, status, templates] = await Promise.all([listRepos(ctx, { projectId }), githubStatus(ctx), listTemplates(ctx)]);
  const canCreate = status.installations.length > 0 && templates.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-text-muted">Repositorios de GitHub vinculados a este proyecto.</p>
        {canCreate ? (
          <CreateRepoSheet
            projectId={projectId}
            projectName={projectName}
            hasClient={hasClient}
            templates={templates.map((t) => ({ value: t.id, label: t.fullName }))}
            types={TYPES.map((t) => ({ value: t, label: t }))}
            stacks={STACKS.map((t) => ({ value: t, label: t }))}
          />
        ) : null}
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2.5">
          {rows.map(({ r }) => (
            <li key={r.id}>
              <Link
                href={`/repositorios/${r.id}`}
                className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 hover:bg-surface-2/50"
              >
                <HealthRing score={r.healthScore} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[14px] text-text">{r.name}</p>
                  <p className="truncate text-[13px] text-text-muted">{r.description ?? "Sin descripción"}</p>
                </div>
                {r.scope ? <Badge>{r.scope}</Badge> : null}
                <span className="hidden font-mono text-[12px] text-text-faint md:inline">{relativeFromDate(r.pushedAt)}</span>
                <ChevronRight className="size-4 shrink-0 text-text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            compact
            icon={<GitBranch />}
            title="Sin repositorios vinculados"
            description={
              !status.installations.length
                ? "Conectá GitHub en Repositorios para vincular o crear repositorios."
                : canCreate
                  ? "Creá uno desde una plantilla tpl-* o vinculá uno existente desde su pestaña Vínculos."
                  : "Vinculá uno existente desde su pestaña Vínculos. Para crear repositorios hace falta una plantilla tpl-* sincronizada."
            }
            action={
              !status.installations.length ? (
                <Link href="/repositorios" className="text-[14px] text-accent-text hover:underline">
                  Ir a Repositorios
                </Link>
              ) : undefined
            }
          />
        </Card>
      )}
    </div>
  );
}
