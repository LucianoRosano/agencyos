import { L, label } from "@agencyos/core";
import { listSpacesWithCounts, SPACE_COLORS } from "@agencyos/modules/spaces/service";
import { Card, PageHeader, SectionLabel } from "@agencyos/ui";
import Link from "next/link";
import { requireCtx } from "@/lib/session";
import { SpaceForm, SpaceRowActions } from "./spaces-ui";

export const metadata = { title: "Espacios" };

export default async function SpacesPage() {
  const ctx = await requireCtx();
  const spaces = await listSpacesWithCounts(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Organización"
        title="Espacios"
        description="Todo pertenece a un espacio. El selector de la barra superior filtra Hoy, proyectos y tareas."
        accent="#22D3EE"
      />
      <Card className="mb-5 divide-y divide-border">
        {spaces.map((s, i) => (
          <div key={s.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <Link href={`/espacios/${s.id}`} className="flex flex-1 items-center gap-3">
              <span className="size-3 rounded-full" style={{ background: s.color }} />
              <span className="text-[15px]">{s.name}</span>
              <span className="text-[12px] text-text-faint">
                {label(L.spaceKind, s.kind)} · {s.projects} proyectos
              </span>
            </Link>
            <SpaceRowActions
              id={s.id}
              name={s.name}
              color={s.color}
              colors={SPACE_COLORS}
              first={i === 0}
              last={i === spaces.length - 1}
              custom={s.kind === "custom"}
            />
          </div>
        ))}
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-3">Nuevo espacio</SectionLabel>
        <SpaceForm colors={SPACE_COLORS} />
      </Card>
    </div>
  );
}
