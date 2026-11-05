import { builderMeta, getRule } from "@agencyos/modules/automations/queries";
import { ruleToInput } from "@agencyos/modules/automations/service";
import { PageHeader } from "@agencyos/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RuleBuilder } from "@/components/automations/rule-builder";
import { AUTO_ACCENT } from "@/components/automations/shared";
import { requireCtx } from "@/lib/session";
import { updateRuleAction } from "../../actions";

export const metadata = { title: "Editar regla" };

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await getRule(ctx, id);
  if (!data) notFound();
  const meta = await builderMeta(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href={`/automatizaciones/${id}`} className="hover:text-text">
            Automatizaciones · {data.rule.name}
          </Link>
        }
        title="Editar regla"
        description="Los cambios valen para los próximos eventos; lo ya ejecutado queda en el registro."
        accent={AUTO_ACCENT}
      />
      <RuleBuilder
        meta={meta}
        initial={ruleToInput(data.rule)}
        action={updateRuleAction.bind(null, id)}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
