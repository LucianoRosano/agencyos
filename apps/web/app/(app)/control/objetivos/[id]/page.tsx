import { formatDateTime, relativeFromDate } from "@agencyos/core";
import { GOAL_LABEL, getGoal, KIND_LABEL, STEP_LABEL } from "@agencyos/modules/devos/service";
import { Badge, Card, cn, SectionLabel } from "@agencyos/ui";
import { CheckCircle2, Circle, CircleAlert, CircleDashed, History, ListChecks, Loader2, Terminal } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTROL_ACCENT } from "@/components/control/control-header";
import { CancelGoalButton, CopyButton, PlanDecision, ReviewDecision, StepDecision, WritePlanSheet } from "@/components/control/control-ui";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import { requireCtx } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const d = await getGoal(ctx, (await params).id);
  return { title: d?.g.title ?? "Objetivo" };
}

const STEP_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="size-4 text-text-muted" />,
  running: <Loader2 className="size-4 text-info" />,
  done: <CheckCircle2 className="size-4 text-success" />,
  failed: <CircleAlert className="size-4 text-danger" />,
  skipped: <CircleDashed className="size-4 text-text-muted" />,
  waiting_approval: <CircleAlert className="size-4 text-warning" />,
};

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const d = await getGoal(ctx, (await params).id);
  if (!d) notFound();
  const { g, steps, events, skills } = d;
  const [desc, acceptance, summary] = await Promise.all([
    g.descriptionMd ? renderMarkdown(g.descriptionMd) : null,
    g.acceptanceMd ? renderMarkdown(g.acceptanceMd) : null,
    g.summaryMd ? renderMarkdown(g.summaryMd) : null,
  ]);
  const prompt = `Usá el MCP de AGENCYOS: tomá el objetivo ${g.id} con tomar_objetivo y seguí sus reglas.${
    g.status === "draft" ? " Primero proponé el plan con proponer_plan." : ""
  }`;
  const closed = ["done", "cancelled"].includes(g.status);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2 border-l-2 pl-4" style={{ borderColor: CONTROL_ACCENT }}>
        <Link href="/control/objetivos" className="font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted hover:text-text">
          Objetivos
        </Link>
        <h1 className="text-[26px] leading-tight font-semibold">{g.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
          <Badge
            tone={["planned", "blocked", "review"].includes(g.status) ? "warning" : g.status === "done" ? "success" : g.status === "failed" ? "danger" : "info"}
          >
            {GOAL_LABEL[g.status as keyof typeof GOAL_LABEL]}
          </Badge>
          {d.projectName ? (
            <Link href={`/proyectos/${g.projectId}`} className="hover:text-text">
              {d.projectName}
            </Link>
          ) : null}
          {d.clientName ? <span>· {d.clientName}</span> : null}
          {g.repo ? <span className="font-mono">· {g.repo}</span> : null}
          {g.executor ? <span>· ejecuta {g.executor}</span> : null}
        </p>
      </header>

      {g.status === "planned" ? (
        <Card className="border-warning/40 p-5">
          <SectionLabel className="mb-2">Plan para aprobar</SectionLabel>
          <p className="mb-3 text-[14px] text-text-muted">Revisá los pasos de abajo. Hasta que no lo apruebes, el agente no ejecuta nada.</p>
          <PlanDecision goalId={g.id} hasProject={Boolean(g.projectId)} />
        </Card>
      ) : null}
      {g.status === "review" || g.status === "failed" ? (
        <Card className="border-warning/40 p-5">
          <SectionLabel className="mb-2">{g.status === "failed" ? "El agente no pudo completarlo" : "Listo para revisar"}</SectionLabel>
          {summary ? <MarkdownView html={summary} className="mb-3" /> : null}
          <ReviewDecision goalId={g.id} />
        </Card>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionLabel icon={<ListChecks />}>Plan</SectionLabel>
              {!closed && ["draft", "planned", "running", "blocked"].includes(g.status) ? <WritePlanSheet goalId={g.id} hasPlan={steps.length > 0} /> : null}
            </div>
            {steps.length ? (
              <ol className="flex flex-col divide-y divide-border" data-testid="goal-steps">
                {steps.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1.5 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span aria-hidden>{STEP_ICON[s.status]}</span>
                      <span className="font-mono text-[12px] text-text-muted">{s.idx}.</span>
                      <span className={cn("min-w-0 flex-1 text-[15px]", s.status === "skipped" && "text-text-muted line-through")}>{s.title}</span>
                      <Badge>{KIND_LABEL[s.kind as keyof typeof KIND_LABEL]}</Badge>
                      <span className="text-[12px] text-text-muted">{STEP_LABEL[s.status as keyof typeof STEP_LABEL]}</span>
                    </span>
                    {s.requiresApproval ? (
                      <span className="pl-6 text-[12px] text-text-muted">{s.approvedAt ? "Aprobado por vos" : "Necesita tu OK antes de hacerse"}</span>
                    ) : null}
                    {s.attempts ? <span className="pl-6 text-[12px] text-warning">{s.attempts} intento(s) fallido(s) corregido(s)</span> : null}
                    {s.resultMd ? <p className="pl-6 text-[13px] whitespace-pre-wrap text-text-muted">{s.resultMd}</p> : null}
                    {s.status === "waiting_approval" ? (
                      <span className="pl-6">
                        <StepDecision goalId={g.id} idx={s.idx} title={s.title} />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[14px] text-text-muted">Todavía no hay plan. Pedíselo al agente (abajo) o escribilo vos.</p>
            )}
          </Card>
          {desc || acceptance ? (
            <Card className="flex flex-col gap-4 p-5">
              {desc ? (
                <div>
                  <SectionLabel className="mb-2">Descripción</SectionLabel>
                  <MarkdownView html={desc} />
                </div>
              ) : null}
              {acceptance ? (
                <div>
                  <SectionLabel className="mb-2">Criterios de aceptación</SectionLabel>
                  <MarkdownView html={acceptance} />
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {!closed ? (
            <Card className="p-5">
              <SectionLabel icon={<Terminal />} className="mb-2">
                Ejecutarlo con Claude Code
              </SectionLabel>
              <p className="mb-3 text-[13px] text-text-muted">
                En tu PC, con Claude Code conectado a AGENCYOS por MCP (Configuración → Integraciones), pegá esto. Usa tu suscripción: no tiene costo extra.
              </p>
              <code className="mb-3 block rounded-md border border-border bg-bg-elevated p-3 font-mono text-[12px] break-all">{prompt}</code>
              <CopyButton text={prompt} label="Copiar instrucción" />
            </Card>
          ) : null}
          {skills.length ? (
            <Card className="p-5">
              <SectionLabel className="mb-2">Skills</SectionLabel>
              <ul className="flex flex-col gap-1.5 text-[14px]">
                {skills.map((s) => (
                  <li key={s.id}>
                    <Link href={`/control/skills/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card className="p-5">
            <SectionLabel icon={<History />} className="mb-3">
              Bitácora
            </SectionLabel>
            <ol className="flex flex-col gap-3" data-testid="goal-log">
              {events.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                  <span
                    className={cn(
                      "text-[13px]",
                      e.kind === "error" ? "text-danger" : e.kind === "approval_request" || e.kind === "question" ? "text-warning" : "text-text",
                    )}
                  >
                    {e.message}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted" title={formatDateTime(e.at)}>
                    {e.actorName ?? (e.actorType === "agent" ? "Agente" : "Sistema")} · {relativeFromDate(e.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          {!closed ? <CancelGoalButton goalId={g.id} /> : null}
        </div>
      </div>
    </div>
  );
}
