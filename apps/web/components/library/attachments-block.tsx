import "server-only";
import type { Ctx } from "@agencyos/core";
import { attachmentsOf } from "@agencyos/modules/library/queries";
import { Card, SectionLabel } from "@agencyos/ui";
import { Paperclip } from "lucide-react";
import { Attachments } from "./attachments";

/** Bloque "Archivos" con la lista ya cargada en el servidor (fichas de tarea, cliente, nota). */
export async function AttachmentsBlock({
  ctx,
  entityType,
  entityId,
  title = "Archivos",
  emptyText,
  className,
  bare,
}: {
  ctx: Ctx;
  entityType: string;
  entityId: string;
  title?: string;
  emptyText?: string;
  className?: string;
  bare?: boolean;
}) {
  const initial = await attachmentsOf(ctx, entityType, entityId);
  const body = <Attachments entityType={entityType} entityId={entityId} initial={initial} emptyText={emptyText} />;
  if (bare) return body;
  return (
    <Card className={className ?? "p-5"}>
      <SectionLabel icon={<Paperclip />} className="mb-3">
        {title}
        {initial.length ? <span className="ml-1 text-text-faint">· {initial.length}</span> : null}
      </SectionLabel>
      {body}
    </Card>
  );
}
