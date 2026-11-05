import { formatMoney } from "@agencyos/core";
import { getWeeklyReviewData } from "@agencyos/modules/review/service";
import { PageHeader } from "@agencyos/ui";
import { requireCtx } from "@/lib/session";
import { ReviewWizard } from "./wizard";

export const metadata = { title: "Revisión semanal" };

export default async function WeeklyReviewPage() {
  const ctx = await requireCtx();
  const d = await getWeeklyReviewData(ctx);
  const money = [
    ...d.money.income.map((x) => `Ingresos ${formatMoney(x.total, x.currency)}`),
    ...d.money.expense.map((x) => `Gastos ${formatMoney(x.total, x.currency)}`),
    ...d.money.receivable.map((x) => `Por cobrar ${formatMoney(x.total, x.currency)}`),
    ...d.money.payable.map((x) => `Por pagar ${formatMoney(x.total, x.currency)}`),
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={`Semana ${d.weekNumber}`}
        title="Revisión semanal"
        description="Cinco pasos para cerrar la semana con la cabeza liviana. Genera una nota que queda en el Cerebro."
        accent="#7C5CFF"
      />
      <ReviewWizard
        inbox={d.inbox}
        noNextAction={d.noNextAction.map((x) => ({ id: x.entityId, title: x.title }))}
        stalled={d.stalled.map((x) => ({ id: x.entityId, title: x.title }))}
        catchUp={d.catchUp.map((x) => ({ key: x.key, title: x.title, subtitle: x.subtitle, href: x.href }))}
        money={money}
        doneNoteId={d.existing?.noteId ?? null}
      />
    </div>
  );
}
