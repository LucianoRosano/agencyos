import { relativeFromDate } from "@agencyos/core";
import { listRules, templates } from "@agencyos/modules/automations/queries";
import { Button, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { CalendarClock, ChevronRight, LayoutTemplate, Plus, Webhook, Workflow, Zap } from "lucide-react";
import Link from "next/link";
import { RuleToggle } from "@/components/automations/rule-ui";
import { AUTO_ACCENT, RuleStateBadge, RunStatusBadge } from "@/components/automations/shared";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Automatizaciones" };

export default async function AutomationsPage() {
  const ctx = await requireCtx();
  const [rules, tpls] = await Promise.all([listRules(ctx), Promise.resolve(templates())]);
  const used = new Set(rules.map((r) => r.rule.templateKey).filter(Boolean));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Sistema"
        title="Automatizaciones"
        description="Reglas: cuando pasa algo (o a cierta hora), si se cumplen las condiciones, se ejecutan las acciones. Lo que sale hacia un cliente pasa por Aprobaciones."
        accent={AUTO_ACCENT}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/automatizaciones/webhooks">
                <Webhook className="size-4" /> Webhooks
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/automatizaciones/nueva">
                <Plus className="size-4" /> Nueva regla
              </Link>
            </Button>
          </>
        }
      />

      {rules.length ? (
        <section aria-labelledby="reglas" className="mb-10">
          <SectionLabel icon={<Workflow />} className="mb-3">
            <span id="reglas">Reglas · {rules.length}</span>
          </SectionLabel>
          <ul className="flex flex-col gap-3">
            {rules.map(({ rule, trigger, runs, failed, lastStatus }) => (
              <li key={rule.id}>
                <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-border-strong md:flex-row md:items-center md:gap-5 md:p-5">
                  <Link href={`/automatizaciones/${rule.id}`} className="group flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 [&>svg]:size-[18px]"
                      style={{ color: AUTO_ACCENT }}
                      aria-hidden
                    >
                      {rule.triggerKind === "schedule" ? <CalendarClock /> : <Zap />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-text group-hover:underline">{rule.name}</span>
                        <RuleStateBadge active={rule.active} testMode={rule.testMode} />
                      </span>
                      <span className="mt-1 block truncate text-[13px] text-text-muted">{trigger}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-faint">
                        <span>
                          {rule.actions.length} {rule.actions.length === 1 ? "acción" : "acciones"}
                        </span>
                        <span>
                          {runs} {runs === 1 ? "ejecución" : "ejecuciones"}
                          {failed ? ` · ${failed} con error` : ""}
                        </span>
                        {rule.lastRunAt ? <span>última {relativeFromDate(rule.lastRunAt)}</span> : <span>sin ejecutar</span>}
                      </span>
                    </span>
                    <ChevronRight className="mt-2.5 size-4 shrink-0 text-text-faint md:hidden" aria-hidden />
                  </Link>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3 md:justify-end md:border-0 md:pt-0">
                    {lastStatus ? <RunStatusBadge status={lastStatus} /> : <span />}
                    <RuleToggle id={rule.id} name={rule.name} active={rule.active} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Card className="mb-10">
          <EmptyState
            icon={<Workflow />}
            title="Todavía no hay reglas"
            description="Empezá con una plantilla de abajo (se abre en el constructor para que la revises antes de guardarla) o armá una desde cero."
            action={
              <Button asChild variant="primary">
                <Link href="/automatizaciones/nueva">
                  <Plus className="size-4" /> Nueva regla
                </Link>
              </Button>
            }
          />
        </Card>
      )}

      <section aria-labelledby="plantillas">
        <SectionLabel icon={<LayoutTemplate />} className="mb-3">
          <span id="plantillas">Plantillas</span>
        </SectionLabel>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tpls.map((t) => (
            <li key={t.key}>
              <Link
                href={`/automatizaciones/nueva?plantilla=${t.key}`}
                className="flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[14px] font-medium text-text">{t.name}</span>
                  {used.has(t.key) ? <span className="shrink-0 font-mono text-[11px] text-text-faint">en uso</span> : null}
                </span>
                <span className="text-[13px] leading-relaxed text-text-muted">{t.description}</span>
                <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <span className="rounded-md border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-faint">
                    {t.trigger === "schedule" ? "programada" : "por evento"}
                  </span>
                  {t.actions.map((a, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: acciones repetibles sin id
                    <span key={i} className="rounded-md border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-faint">
                      {a.toLowerCase()}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
