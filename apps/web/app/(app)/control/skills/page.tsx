import { listSkills } from "@agencyos/modules/devos/service";
import { SKILL_TEMPLATES } from "@agencyos/modules/devos/templates";
import { Badge, Button, Card, EmptyState, SectionLabel } from "@agencyos/ui";
import { BookOpen, Download, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { ControlHeader } from "@/components/control/control-header";
import { AddTemplateButton, NewSkillSheet } from "@/components/control/control-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Skills · Centro de control" };

export default async function SkillsPage() {
  const ctx = await requireCtx();
  const skills = await listSkills(ctx);
  const have = new Set(skills.map((s) => s.name));
  const templates = SKILL_TEMPLATES.filter((t) => !have.has(t.name));
  return (
    <>
      <ControlHeader
        active="skills"
        title="Skills"
        description="Procedimientos que el agente sigue paso a paso (con los puntos que necesitan tu OK). También se exportan para usarlos directo en Claude Code."
        actions={
          <>
            {skills.length ? (
              <Button asChild variant="ghost">
                <a href="/api/control/skills" download>
                  <Download className="size-4" /> Exportar para Claude Code
                </a>
              </Button>
            ) : null}
            <NewSkillSheet />
          </>
        }
      />
      {skills.length ? (
        <ul className="mb-6 grid gap-3 md:grid-cols-2" data-testid="skill-list">
          {skills.map((s) => (
            <li key={s.id}>
              <Link href={`/control/skills/${s.id}`} className="group block h-full">
                <Card className="flex h-full flex-col gap-2 p-4 group-hover:border-border-strong">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-medium">{s.name}</span>
                    {s.active ? <span className="font-mono text-[12px] text-text-muted">v{s.version}</span> : <Badge>Inactiva</Badge>}
                  </span>
                  <span className="text-[13px] text-text-muted">{s.description}</span>
                  {s.tags.length ? (
                    <span className="mt-auto flex flex-wrap gap-1">
                      {s.tags.map((t) => (
                        <span key={t} className="rounded-md border border-border px-1.5 font-mono text-[11px] text-text-muted">
                          {t}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="mb-6 p-2">
          <EmptyState
            icon={<BookOpen />}
            title="Todavía no hay skills"
            description="Creá una o agregá una plantilla de abajo y adaptala a tu forma de trabajar."
          />
        </Card>
      )}
      {templates.length ? (
        <section aria-labelledby="skill-templates">
          <SectionLabel icon={<LayoutTemplate />} className="mb-3">
            <span id="skill-templates">Plantillas para la agencia</span>
          </SectionLabel>
          <ul className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <li key={t.key}>
                <Card className="flex h-full flex-col gap-2 p-4">
                  <span className="text-[15px] font-medium">{t.name}</span>
                  <span className="flex-1 text-[13px] text-text-muted">{t.description}</span>
                  <span>
                    <AddTemplateButton k={t.key} name={t.name} />
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
