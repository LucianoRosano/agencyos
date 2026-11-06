import { can, formatDateTime } from "@agencyos/core";
import { getPlan } from "@agencyos/modules/repos/queries";
import { Badge, Card, PageHeader, SectionLabel } from "@agencyos/ui";
import { Bot, ExternalLink, ScrollText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovePlanSheet, RejectPlanButton } from "@/components/repos/repo-ui";
import { ACTION_STATUS, DiffView, PlanStatusBadge, REPOS_ACCENT, RISK } from "@/components/repos/shared";
import { requireCtx } from "@/lib/session";

const ACTION_LABEL: Record<string, string> = {
  create_repo: "Crear repositorio",
  rename: "Renombrar",
  set_topics: "Topics",
  set_description: "Descripción",
  add_file: "Archivo vía PR",
  enable_security: "Activar seguridad",
  protect_branch: "Proteger rama",
  archive: "Archivar",
};

const AUDIT_LABEL: Record<string, string> = {
  "repo_plan.create": "Plan creado",
  "repo_plan.approve": "Plan aprobado (con reautenticación)",
  "repo_plan.reject": "Plan rechazado",
  "repo_plan.executed": "Ejecución terminada",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const p = await getPlan(ctx, (await params).id);
  return { title: p?.plan.name ?? "Plan" };
}

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await getPlan(ctx, id);
  if (!data) notFound();
  const { plan, actions } = data;
  const canDecide = plan.status === "pending_approval" && can(ctx, "manage", "settings");
  const actionName = new Map(
    actions.map((x) => [x.a.id, `${ACTION_LABEL[x.a.kind] ?? x.a.kind} · ${x.repoName ?? (x.a.params as { name?: string }).name ?? ""}`]),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/repositorios/planes" className="hover:text-text">
              Planes
            </Link>
            · <PlanStatusBadge status={plan.status} />
            {plan.createdByType === "agent" ? (
              <Badge tone="accent">
                <Bot className="size-3.5" /> Propuesto por Claude
              </Badge>
            ) : null}
          </span>
        }
        title={plan.name}
        description={plan.summaryMd ?? undefined}
        accent={REPOS_ACCENT}
        actions={
          canDecide ? (
            <>
              <RejectPlanButton planId={plan.id} />
              <ApprovePlanSheet
                planId={plan.id}
                actions={actions.map((x) => ({
                  id: x.a.id,
                  label: `${actionName.get(x.a.id)} — ${(x.a.params as { summary?: string }).summary ?? ""}`,
                  risk: x.a.risk,
                }))}
              />
            </>
          ) : null
        }
      />
      {plan.status === "approved" || plan.status === "executing" ? (
        <p className="mb-4 rounded-[10px] border border-border bg-surface px-4 py-3 text-[14px] text-text-muted">
          Aprobado {plan.approvedAt ? formatDateTime(plan.approvedAt) : ""}
          {data.approverName ? ` por ${data.approverName}` : ""}. El worker lo ejecuta en el próximo minuto.
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {actions.map(({ a, repoName }, i) => {
          const p = a.params as { summary?: string; diff?: string[]; name?: string };
          const res = (a.result ?? null) as null | { error?: string; url?: string; pr?: number };
          const st = ACTION_STATUS[a.status] ?? { label: a.status, tone: "neutral" as const };
          const risk = RISK[a.risk] ?? { label: a.risk, tone: "neutral" as const };
          return (
            <li key={a.id} data-action={a.kind} data-status={a.status}>
              <Card className="p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[15px] font-medium text-text">{ACTION_LABEL[a.kind] ?? a.kind}</span>
                  {a.repositoryId ? (
                    <Link href={`/repositorios/${a.repositoryId}`} className="min-w-0 truncate font-mono text-[13px] text-text-muted hover:text-text">
                      {repoName}
                    </Link>
                  ) : (
                    <span className="font-mono text-[13px] text-text-muted">{p.name}</span>
                  )}
                  <span className="ml-auto flex gap-1.5">
                    <Badge tone={risk.tone}>{risk.label}</Badge>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </span>
                </div>
                {p.summary ? <p className="mt-2 text-[14px] text-text-muted">{p.summary}</p> : null}
                {p.diff?.length ? <DiffView lines={p.diff} /> : null}
                {res?.error ? <p className="mt-2 text-[13px] text-danger">Error: {res.error}</p> : null}
                {res?.url ? (
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-accent-text hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> {res.pr ? `PR #${res.pr}` : "Abrir en GitHub"}
                  </a>
                ) : null}
                {a.executedAt ? <p className="mt-1 font-mono text-[11px] text-text-faint">ejecutada {formatDateTime(a.executedAt)}</p> : null}
              </Card>
            </li>
          );
        })}
      </ol>

      <Card className="mt-6 p-5" data-audit>
        <SectionLabel icon={<ScrollText />} className="mb-3">
          Registro de auditoría
        </SectionLabel>
        {data.audit.length ? (
          <ol className="flex flex-col gap-2">
            {data.audit.map((e) => {
              const after = (e.after ?? {}) as { status?: string; error?: string };
              return (
                <li key={e.id} className="flex flex-col gap-0.5 border-b border-border pb-2 text-[13px] last:border-0 md:flex-row md:items-baseline md:gap-3">
                  <span className="font-mono text-[11px] whitespace-nowrap text-text-faint">{formatDateTime(e.at)}</span>
                  <span className="min-w-0 flex-1 break-words text-text">
                    {AUDIT_LABEL[e.action] ??
                      `${e.action.replace("github.", "GitHub · ")} — ${actionName.get(e.targetId ?? "") ?? ""}${after.status ? ` · ${after.status === "done" ? "ok" : "falló"}` : ""}`}
                    {after.error ? <span className="block text-danger">{after.error}</span> : null}
                  </span>
                  <span className="font-mono text-[11px] text-text-faint">
                    {e.actorType === "system" ? "worker" : e.actorType === "agent" ? "Claude" : "Luciano"}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-[14px] text-text-muted">Sin registros.</p>
        )}
      </Card>
    </div>
  );
}
