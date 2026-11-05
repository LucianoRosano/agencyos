import { builderMeta } from "@agencyos/modules/automations/queries";
import { findTemplate } from "@agencyos/modules/automations/templates";
import type { RuleInput } from "@agencyos/modules/automations/validators";
import { PageHeader } from "@agencyos/ui";
import Link from "next/link";
import { RuleBuilder } from "@/components/automations/rule-builder";
import { AUTO_ACCENT } from "@/components/automations/shared";
import { requireCtx } from "@/lib/session";
import { createRuleAction } from "../actions";

export const metadata = { title: "Nueva regla" };

const BLANK: RuleInput = { name: "", triggerKind: "event", conditions: { match: "all", items: [] }, actions: [] };

export default async function NewRulePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const meta = await builderMeta(ctx);
  const tpl = findTemplate(sp.plantilla);
  const initial: RuleInput = tpl ? { ...tpl.rule, templateKey: tpl.key } : BLANK;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href="/automatizaciones" className="hover:text-text">
            Automatizaciones
          </Link>
        }
        title={tpl ? tpl.name : "Nueva regla"}
        description={tpl ? `${tpl.description} Revisala y guardala: queda activa.` : "Cuándo corre, qué se tiene que cumplir y qué hace, en ese orden."}
        accent={AUTO_ACCENT}
      />
      <RuleBuilder meta={meta} initial={initial} action={createRuleAction} submitLabel="Guardar regla" redirectTo={(id) => `/automatizaciones/${id}`} />
    </div>
  );
}
