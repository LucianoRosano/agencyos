import { diffDays, L, label, todayAR, toISODateAR } from "@agencyos/core";
import { listTrash } from "@agencyos/modules/trash/service";
import { Card, EmptyState, PageHeader } from "@agencyos/ui";
import { Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/session";
import { TrashActions } from "./trash-actions";

export const metadata = { title: "Papelera" };

export default async function TrashPage() {
  const ctx = await requireCtx();
  const items = await listTrash(ctx);
  const today = todayAR();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Sistema" title="Papelera" description="Lo eliminado se guarda 30 días y después se purga automáticamente." accent="#F43F5E" />
      {items.length ? (
        <Card className="divide-y divide-border">
          {items.map((it) => (
            <div key={`${it.type}-${it.id}`} className="flex flex-col gap-2 p-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">{it.title || "(sin título)"}</p>
                <p className="text-[12px] text-text-muted">
                  {label(L.entityType, it.type)} · se purga en {Math.max(0, 30 - diffDays(today, toISODateAR(it.deletedAt)))} días
                </p>
              </div>
              <TrashActions type={it.type} id={it.id} title={it.title} />
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState icon={<Trash2 />} title="La papelera está vacía" description="Cuando elimines algo, vas a poder restaurarlo desde acá durante 30 días." />
      )}
    </div>
  );
}
