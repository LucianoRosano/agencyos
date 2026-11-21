import { getSkill } from "@agencyos/modules/devos/service";
import { Card, SectionLabel } from "@agencyos/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditSkillForm, SkillToggle } from "@/components/control/control-ui";
import { requireCtx } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const s = await getSkill(ctx, (await params).id);
  return { title: s?.name ?? "Skill" };
}

export default async function SkillPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = (await params).id;
  const s = /^[0-9a-f-]{36}$/i.test(id) ? await getSkill(ctx, id) : null;
  if (!s) notFound();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/control/skills" className="font-mono text-[12px] uppercase tracking-[0.04em] text-text-muted hover:text-text">
            Skills
          </Link>
          <h1 className="text-[26px] font-semibold">{s.name}</h1>
          <p className="font-mono text-[12px] text-text-muted">
            {s.slug} · versión {s.version} · {s.active ? "activa" : "inactiva"}
          </p>
        </div>
        <SkillToggle id={s.id} active={s.active} name={s.name} />
      </header>
      <Card className="p-5">
        <SectionLabel className="mb-3">Editar</SectionLabel>
        <EditSkillForm
          id={s.id}
          d={{ name: s.name, description: s.description, instructionsMd: s.instructionsMd, tools: s.tools.join(", "), tags: s.tags.join(", ") }}
        />
      </Card>
    </div>
  );
}
