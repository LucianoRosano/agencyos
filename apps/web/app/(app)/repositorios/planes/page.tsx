import { formatDate } from "@agencyos/core";
import { githubStatus, listPlans } from "@agencyos/modules/repos/queries";
import { Badge, EmptyState, PageHeader } from "@agencyos/ui";
import { Bot, ChevronRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { PlanStatusBadge, REPOS_ACCENT } from "@/components/repos/shared";
import { requireCtx } from "@/lib/session";
import { ReposNav } from "../nav";

export const metadata = { title: "Planes de repositorios" };

export default async function PlansPage() {
  const ctx = await requireCtx();
  const [plans, status] = await Promise.all([listPlans(ctx), githubStatus(ctx)]);
  const pending = plans.filter((p) => p.status === "pending_approval").length;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Repositorios"
        title="Planes"
        description="Propuestas de organización. Nada se ejecuta en GitHub sin tu aprobación; cada acción queda registrada."
        accent={REPOS_ACCENT}
      />
      <ReposNav active="planes" pending={pending} />
      {plans.length ? (
        <ul className="flex flex-col gap-2.5">
          {plans.map((p) => (
            <li key={p.id}>
              <Link
                href={`/repositorios/planes/${p.id}`}
                className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 hover:bg-surface-2/50 active:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[15px] font-medium text-text">{p.name}</p>
                    {p.createdByType === "agent" ? (
                      <Badge tone="accent">
                        <Bot className="size-3.5" /> Claude
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-text-faint">
                    {formatDate(p.createdAt)} · {p.actions} {p.actions === 1 ? "acción" : "acciones"}
                    {p.failed ? ` · ${p.failed} fallidas` : ""}
                  </p>
                </div>
                <PlanStatusBadge status={p.status} />
                <ChevronRight className="size-4 shrink-0 text-text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<ClipboardList />}
          title="Todavía no hay planes"
          description={
            status.installations.length
              ? "En Repositorios, «Generar plan» propone las correcciones de los desvíos del estándar."
              : "Primero conectá GitHub en Repositorios."
          }
          action={
            <Link href="/repositorios" className="text-[14px] text-accent-text hover:underline">
              Ir a Repositorios
            </Link>
          }
        />
      )}
    </div>
  );
}
