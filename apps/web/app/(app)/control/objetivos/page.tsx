import { GOAL_LABEL, listGoals, listSkills } from "@agencyos/modules/devos/service";
import { Badge, Card, EmptyState, Progress } from "@agencyos/ui";
import { Target } from "lucide-react";
import Link from "next/link";
import { ControlHeader } from "@/components/control/control-header";
import { NewGoalSheet } from "@/components/control/control-ui";
import { clientOpts, projectOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Objetivos · Centro de control" };

const TONE: Record<string, "warning" | "info" | "success" | "neutral" | "danger"> = {
  planned: "warning",
  blocked: "warning",
  review: "warning",
  running: "info",
  approved: "info",
  done: "success",
  failed: "danger",
};

export default async function GoalsPage() {
  const ctx = await requireCtx();
  const [goals, projects, clients, skills] = await Promise.all([listGoals(ctx), projectOpts(ctx), clientOpts(ctx), listSkills(ctx, { activeOnly: true })]);
  return (
    <>
      <ControlHeader
        active="objetivos"
        title="Objetivos"
        description="Le das un objetivo al agente: arma el plan, vos lo aprobás, ejecuta paso a paso (código, pruebas, correcciones) y te deja el resultado para revisar."
        actions={<NewGoalSheet projects={projects} clients={clients} skills={skills.map((s) => ({ value: s.id, label: s.name }))} />}
      />
      {goals.length ? (
        <ul className="flex flex-col gap-2" data-testid="goal-list">
          {goals.map(({ g, projectName, steps, stepsDone }) => (
            <li key={g.id}>
              <Link href={`/control/objetivos/${g.id}`} className="group block">
                <Card className="flex flex-col gap-2 p-4 group-hover:border-border-strong md:flex-row md:items-center md:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{g.title}</span>
                    <span className="block truncate text-[13px] text-text-muted">{[projectName, g.repo].filter(Boolean).join(" · ") || "Sin proyecto"}</span>
                  </span>
                  {steps ? (
                    <span className="flex items-center gap-2 md:w-48">
                      <Progress value={(stepsDone / steps) * 100} label={`${stepsDone} de ${steps} pasos`} className="flex-1" />
                      <span className="font-mono text-[12px] text-text-muted">
                        {stepsDone}/{steps}
                      </span>
                    </span>
                  ) : null}
                  <Badge tone={TONE[g.status] ?? "neutral"}>{GOAL_LABEL[g.status as keyof typeof GOAL_LABEL]}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={<Target />}
            title="Todavía no hay objetivos"
            description="Creá uno con «Nuevo objetivo». Después, en Claude Code (en tu PC) decí: «Tomá el objetivo de AGENCYOS y proponé el plan»."
          />
        </Card>
      )}
    </>
  );
}
