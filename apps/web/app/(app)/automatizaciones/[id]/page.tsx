import { formatDateTime, relativeFromDate } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { builderMeta, getRule, listRuns } from "@agencyos/modules/automations/queries";
import { Badge, BlockCard, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { Activity, Braces, CalendarClock, FlaskConical, History, ListOrdered, Zap } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { EditLink, ResultList, RuleMenu, RuleToggle, TestPanel } from "@/components/automations/rule-ui";
import { AUTO_ACCENT, AUTO_TEXT, RuleStateBadge, RunStatusBadge } from "@/components/automations/shared";
import { requireCtx } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const r = await getRule(ctx, (await params).id);
  return { title: r?.rule.name ?? "Automatización" };
}

const OPS: Record<string, string> = { eq: "es", neq: "no es", contains: "contiene", gt: "es mayor que", lt: "es menor que", exists: "tiene valor" };

type RunResult = { index: number; type: string; ok: boolean; summary: string; detail?: string; pendingApproval?: boolean };
type RunOut = { results?: RunResult[]; reason?: string; conditions?: { field: string; op: string; value?: string; passed: boolean }[] };
type RunIn = { evento?: { tipo?: string } };

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await getRule(ctx, id);
  if (!data) notFound();
  const { rule } = data;
  const [meta, runs, activity] = await Promise.all([builderMeta(ctx), listRuns(ctx, id, 50), listActivity(ctx, { entityType: "automation_rule", entityId: id, limit: 20 })]);

  // etiquetas legibles de campos, valores y eventos
  const fieldLabel = new Map<string, { label: string; options?: { value: string; label: string }[] }>();
  for (const def of Object.values(meta.entityFields)) for (const f of def.fields) fieldLabel.set(f.path, { label: `${def.label} · ${f.label}`, options: f.options });
  for (const e of meta.events) for (const f of e.payload ?? []) fieldLabel.set(f.path, { label: f.label, options: f.options });
  for (const f of meta.commonFields) fieldLabel.set(f.path, { label: f.label });
  const eventLabel = (t?: string | null) => meta.events.find((e) => e.type === t)?.label ?? (t === "automatizacion.programada" ? "Programación" : (t ?? "—"));
  const actionLabel = (t: string) => meta.actions.find((a) => a.key === t)?.label ?? t;
  const conds = rule.conditions.items;
  const actions = rule.actions as { type: string; params: Record<string, unknown> }[];
  const endpointName = (eid: unknown) => meta.endpoints.find((e) => e.id === eid)?.name ?? "webhook eliminado";
  const statusName = (target: unknown, s: unknown) =>
    (target === "project" ? meta.projectStatuses : meta.taskStatuses).find((x) => x.value === s)?.label.toLowerCase() ?? String(s);

  function actionDetail(a: { type: string; params: Record<string, unknown> }): string {
    const p = a.params;
    switch (a.type) {
      case "create_task":
        return `«${p.title}»${p.project === "event" ? " en el proyecto del evento" : ""}${p.dueInDays !== undefined ? ` · vence en ${p.dueInDays} días` : ""}`;
      case "notify":
        return `«${p.title}»`;
      case "send_email":
        return `${p.to === "client" ? (p.automatic ? "Al cliente, automático" : "Al cliente, con aprobación") : "A vos"} · «${p.subject}»`;
      case "set_status":
        return `${p.target === "project" ? "Proyecto" : "Tarea"} del evento → ${statusName(p.target, p.status)}`;
      case "webhook":
        return `POST firmado a «${endpointName(p.endpointId)}»`;
      case "wait":
        return `${p.days} ${Number(p.days) === 1 ? "día" : "días"}`;
      default:
        return "";
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={
          <Link href="/automatizaciones" className="hover:text-text">
            Automatizaciones
          </Link>
        }
        title={rule.name}
        description={data.trigger}
        accent={AUTO_ACCENT}
        actions={
          <>
            <RuleStateBadge active={rule.active} testMode={rule.testMode} />
            <RuleToggle id={rule.id} name={rule.name} active={rule.active} />
            <EditLink id={rule.id} />
            <RuleMenu id={rule.id} name={rule.name} testMode={rule.testMode} />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-4 md:p-5">
            <SectionLabel icon={<Zap />} className="mb-3">
              <span className={AUTO_TEXT}>01</span> · Cuándo
            </SectionLabel>
            <p className="text-[15px] text-text">{rule.triggerKind === "schedule" ? data.trigger : eventLabel(rule.eventType)}</p>
            {data.next.length ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-[12px] text-text-faint">
                <CalendarClock className="size-3.5" aria-hidden /> Próximas: {data.next.map((d) => formatDateTime(d)).join(" · ")}
              </p>
            ) : null}

            <SectionLabel icon={<Braces />} className="mt-6 mb-3">
              <span className={AUTO_TEXT}>02</span> · Si se cumple
            </SectionLabel>
            {conds.length ? (
              <ul className="flex flex-col gap-1.5 text-[14px]">
                {conds.map((c, i) => {
                  const f = fieldLabel.get(c.field);
                  const v = f?.options?.find((o) => o.value === c.value)?.label ?? c.value;
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: condiciones sin id
                    <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                      {i > 0 ? <span className="font-mono text-[11px] uppercase text-text-faint">{rule.conditions.match === "all" ? "y" : "o"}</span> : null}
                      <span className="text-text">{f?.label ?? c.field}</span>
                      <span className="text-text-muted">{OPS[c.op] ?? c.op}</span>
                      {c.op !== "exists" ? <span className="font-medium text-text">{v}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[14px] text-text-muted">Sin condiciones: corre cada vez que se dispara.</p>
            )}

            <SectionLabel icon={<ListOrdered />} className="mt-6 mb-3">
              <span className={AUTO_TEXT}>03</span> · Entonces
            </SectionLabel>
            <ol className="flex flex-col gap-2">
              {actions.map((a, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: el orden es la identidad
                <li key={i} className="flex items-start gap-3">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-md bg-[#2DD4BF]/15 font-mono text-[11px] ${AUTO_TEXT}`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 text-[14px]">
                    <span className="font-medium text-text">{actionLabel(a.type)}</span>{" "}
                    <span className="break-words text-text-muted">{actionDetail(a)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <BlockCard icon={<History />} title={`Ejecuciones${runs.length ? ` · ${runs.length}` : ""}`}>
            {runs.length ? (
              <ul className="-mx-1 flex flex-col divide-y divide-border" data-testid="runs">
                {runs.map((r) => {
                  const out = (r.output ?? {}) as RunOut;
                  const inp = (r.input ?? {}) as RunIn;
                  return (
                    <li key={r.id}>
                      <details className="group px-1 py-2.5">
                        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                          <RunStatusBadge status={r.status} />
                          {r.dryRun ? <Badge tone="neutral">Prueba</Badge> : null}
                          <span className="min-w-0 flex-1 truncate text-[14px] text-text">{eventLabel(inp.evento?.tipo)}</span>
                          <span className="font-mono text-[11px] text-text-faint" title={formatDateTime(r.startedAt)}>
                            {relativeFromDate(r.startedAt)}
                            {r.attempt > 1 ? ` · intento ${r.attempt}` : ""}
                          </span>
                        </summary>
                        <div className="mt-2 flex flex-col gap-2 pl-1">
                          {r.status === "waiting" && r.resumeAt ? (
                            <p className="text-[13px] text-text-muted">Sigue el {formatDateTime(r.resumeAt)}.</p>
                          ) : null}
                          {out.reason ? <p className="text-[13px] text-text-muted">{out.reason}</p> : null}
                          {r.error && !out.results?.some((x) => !x.ok) ? <p className="text-[13px] text-danger">{r.error}</p> : null}
                          <ResultList results={out.results ?? []} />
                          {!out.reason && !(out.results ?? []).length && !r.error ? <p className="text-[13px] text-text-faint">En curso…</p> : null}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={<History />}
                title="Todavía no se ejecutó"
                description={
                  rule.triggerKind === "event"
                    ? `Corre la próxima vez que pase «${eventLabel(rule.eventType)}». Podés probarla con el último evento real.`
                    : "Corre en el próximo horario programado. Podés probarla ahora."
                }
              />
            )}
          </BlockCard>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <BlockCard icon={<FlaskConical />} title="Probar">
            <TestPanel id={rule.id} active={rule.active} testMode={rule.testMode} isEvent={rule.triggerKind === "event"} />
          </BlockCard>
          <BlockCard icon={<Activity />} title="Historial">
            <ActivityList rows={activity} empty="Sin cambios registrados." />
          </BlockCard>
        </div>
      </div>
    </div>
  );
}
