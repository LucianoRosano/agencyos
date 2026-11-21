import "server-only";
import type { Ctx } from "@agencyos/core";
import { relatedTo, type SourceType } from "@agencyos/modules/brain/knowledge";
import { Badge, Card, SectionLabel } from "@agencyos/ui";
import { Sparkles } from "lucide-react";
import Link from "next/link";

/** «Relacionado en el Cerebro»: otras notas, documentos, decisiones y conversaciones sobre lo mismo. */
export async function RelatedBlock({ ctx, type, id }: { ctx: Ctx; type: SourceType; id: string }) {
  const hits = await relatedTo(ctx, type, id, 5).catch(() => []);
  if (!hits.length) return null;
  return (
    <Card className="p-4" data-testid="brain-related">
      <SectionLabel icon={<Sparkles />} className="mb-3">
        Relacionado en el Cerebro
      </SectionLabel>
      <ul className="flex flex-col gap-3">
        {hits.map((h) => (
          <li key={`${h.sourceType}:${h.sourceId}`} className="flex flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <Badge>{h.typeLabel}</Badge>
              <Link href={h.href} className="min-w-0 truncate text-[14px] text-text hover:underline">
                {h.title}
              </Link>
            </span>
            {h.excerpts[0] ? <span className="line-clamp-2 text-[13px] text-text-muted">{h.excerpts[0]}</span> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
