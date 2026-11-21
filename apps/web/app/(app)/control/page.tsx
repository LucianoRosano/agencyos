import { relativeFromDate } from "@agencyos/core";
import { controlOverview, GOAL_LABEL, listGoals } from "@agencyos/modules/devos/service";
import { Badge, Card, EmptyState, Progress, SectionLabel } from "@agencyos/ui";
import { BookOpen, Bot, Brain, BriefcaseBusiness, CircleCheck, FolderKanban, GitBranch, Plug, Target, Workflow } from "lucide-react";
import Link from "next/link";
import { ControlHeader } from "@/components/control/control-header";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Centro de control" };

function Tile({
  href,
  icon,
  title,
  value,
  detail,
  warn,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  value: string | number;
  detail: string;
  warn?: boolean;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="flex h-full flex-col gap-1.5 p-4 transition-colors group-hover:border-border-strong">
        <span className="flex items-center gap-2 text-[13px] text-text-muted [&_svg]:size-4">
          {icon}
          {title}
        </span>
        <span className="font-mono text-[26px] tabular-nums text-text">{value}</span>
        <span className={warn ? "text-[12px] text-warning" : "text-[12px] text-text-muted"}>{detail}</span>
      </Card>
    </Link>
  );
}

export default async function ControlPage() {
  const ctx = await requireCtx();
  const [o, goals] = await Promise.all([
    controlOverview(ctx),
    listGoals(ctx, { status: ["planned", "blocked", "review", "running", "approved", "draft"], limit: 6 }),
  ]);
  return (
    <>
      <ControlHeader
        active="resumen"
        title="Centro de control"
        description="Proyectos, agentes, skills, tareas, documentación, clientes, automatizaciones y herramientas en un solo lugar."
      />
      <section aria-label="Estado del sistema" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Tile
          href="/control/objetivos"
          icon={<Target />}
          title="Objetivos"
          value={o.goals.active}
          detail={o.goals.waiting ? `${o.goals.waiting} esperan tu decisión` : `${o.goals.done30} cumplidos en 30 días`}
          warn={o.goals.waiting > 0}
        />
        <Tile href="/control/skills" icon={<BookOpen />} title="Skills activas" value={o.skills} detail="Procedimientos del agente" />
        <Tile
          href="/tareas"
          icon={<CircleCheck />}
          title="Tareas abiertas"
          value={o.tasks.open}
          detail={o.tasks.overdue ? `${o.tasks.overdue} vencidas · ${o.tasks.agent} del agente` : `${o.tasks.agent} del agente`}
          warn={o.tasks.overdue > 0}
        />
        <Tile
          href="/proyectos"
          icon={<FolderKanban />}
          title="Proyectos en curso"
          value={o.projects.active}
          detail={o.projects.blocked ? `${o.projects.blocked} bloqueados` : "Ninguno bloqueado"}
          warn={o.projects.blocked > 0}
        />
        <Tile href="/crm/clientes" icon={<BriefcaseBusiness />} title="Clientes activos" value={o.clients} detail="CRM" />
        <Tile
          href="/cerebro/preguntar"
          icon={<Brain />}
          title="Documentación"
          value={o.brain.sources}
          detail={`${o.brain.docs} documentos leídos por el Cerebro`}
        />
        <Tile
          href="/automatizaciones"
          icon={<Workflow />}
          title="Automatizaciones"
          value={o.automations.active}
          detail={o.automations.failed7d ? `${o.automations.failed7d} ejecuciones fallidas en 7 días` : `${o.automations.runs7d} ejecuciones en 7 días`}
          warn={o.automations.failed7d > 0}
        />
        <Tile
          href="/repositorios"
          icon={<GitBranch />}
          title="Repositorios"
          value={o.repos.n}
          detail={o.repos.low ? `${o.repos.low} con salud baja` : "Salud al día"}
          warn={o.repos.low > 0}
        />
        <Tile
          href="/configuracion/integraciones"
          icon={<Plug />}
          title="Claude Code (MCP)"
          value={o.mcp.tokens ? "Conectado" : "—"}
          detail={o.mcp.lastUsed ? `último uso ${relativeFromDate(o.mcp.lastUsed)}` : "Creá un token para conectarlo"}
        />
        <Tile
          href="/ia"
          icon={<Bot />}
          title="Agentes internos"
          value={o.aiEnabled ? "Activos" : "Apagados"}
          detail={o.aiEnabled ? "Con tu API key" : "Opcional: usan la API (paga)"}
        />
      </section>

      <section className="mt-6" aria-labelledby="obj-recientes">
        <SectionLabel className="mb-3">
          <span id="obj-recientes">Objetivos en movimiento</span>
        </SectionLabel>
        {goals.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {goals.map(({ g, projectName, steps, stepsDone }) => (
              <li key={g.id}>
                <Link href={`/control/objetivos/${g.id}`} className="group block h-full">
                  <Card className="flex h-full flex-col gap-2 p-4 group-hover:border-border-strong">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[15px] font-medium">{g.title}</span>
                      <Badge tone={["planned", "blocked", "review"].includes(g.status) ? "warning" : g.status === "running" ? "info" : "neutral"}>
                        {GOAL_LABEL[g.status as keyof typeof GOAL_LABEL]}
                      </Badge>
                    </span>
                    {projectName ? <span className="text-[13px] text-text-muted">{projectName}</span> : null}
                    {steps ? <Progress value={(stepsDone / steps) * 100} label={`${stepsDone} de ${steps} pasos`} className="mt-auto" /> : null}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="p-2">
            <EmptyState
              icon={<Target />}
              title="Sin objetivos todavía"
              description="Un objetivo es algo que querés lograr («arreglar el checkout», «publicar la tienda»). El agente arma el plan, vos lo aprobás y supervisás cada paso."
              action={
                <Link href="/control/objetivos" className="text-[14px] text-accent-text underline underline-offset-2">
                  Crear el primero
                </Link>
              }
            />
          </Card>
        )}
      </section>
    </>
  );
}
