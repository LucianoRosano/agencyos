import "server-only";
import type { Ctx } from "@agencyos/core";
import { getBrandKit, listFiles } from "@agencyos/modules/library/queries";
import { BlockCard, Button } from "@agencyos/ui";
import { FolderOpen, Library, Palette, Paperclip } from "lucide-react";
import Link from "next/link";
import { AttachmentsBlock } from "./attachments-block";
import { FileGrid } from "./file-grid";

/** Pestaña "Archivos" de la ficha de cliente: kit de marca, adjuntos y archivos de la biblioteca del cliente. */
export async function ClientFilesTab({ ctx, clientId }: { ctx: Ctx; clientId: string }) {
  const [kit, files] = await Promise.all([getBrandKit(ctx, clientId), listFiles(ctx, { clientId, limit: 12 })]);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <BlockCard
          icon={<Library />}
          title="En la biblioteca"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/biblioteca?cliente=${clientId}`}>
                <FolderOpen className="size-4" /> Ver todo
              </Link>
            </Button>
          }
        >
          {files.length ? (
            <FileGrid files={files} mode="grilla" />
          ) : (
            <p className="text-[14px] text-text-muted">Todavía no hay archivos de este cliente en la biblioteca.</p>
          )}
        </BlockCard>
        <BlockCard icon={<Paperclip />} title="Adjuntos del cliente">
          <AttachmentsBlock ctx={ctx} entityType="client" entityId={clientId} bare emptyText="Sin adjuntos: contratos, accesos documentados, briefs…" />
        </BlockCard>
      </div>
      <BlockCard
        icon={<Palette />}
        title="Kit de marca"
        className="self-start"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/biblioteca/marca/${clientId}`}>{kit?.kit ? "Editar" : "Armar"}</Link>
          </Button>
        }
      >
        {kit?.kit ? (
          <div className="flex flex-col gap-3">
            {kit.colors.length ? (
              <div
                className="flex h-9 overflow-hidden rounded-md border border-border"
                role="img"
                aria-label={`Paleta: ${kit.colors.map((c) => c.hex).join(", ")}`}
              >
                {kit.colors.map((c) => (
                  <span key={`${c.hex}-${c.name}`} className="flex-1" style={{ background: c.hex }} />
                ))}
              </div>
            ) : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-text-muted">Logos</dt>
              <dd className="font-mono text-text">{kit.logos.length}</dd>
              <dt className="text-text-muted">Tipografías</dt>
              <dd className="min-w-0 truncate text-text">{kit.fonts.map((f) => f.name).join(", ") || "—"}</dd>
              <dt className="text-text-muted">Manual</dt>
              <dd className="min-w-0 truncate text-text">{kit.guidelines?.name ?? "—"}</dd>
            </dl>
          </div>
        ) : (
          <p className="text-[14px] text-text-muted">Logos, paleta, tipografías y manual del cliente en un solo lugar.</p>
        )}
      </BlockCard>
    </div>
  );
}
