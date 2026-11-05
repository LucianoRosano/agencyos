import { getBrandKit } from "@agencyos/modules/library/queries";
import { Button, PageHeader } from "@agencyos/ui";
import { ChevronLeft, FolderOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandKitEditor } from "@/components/library/brand-kit-editor";
import { LIBRARY_ACCENT } from "@/components/library/file-visual";
import { requireCtx } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Kit de marca" };

export default async function BrandKitPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!UUID.test(clientId)) notFound();
  const ctx = await requireCtx();
  const data = await getBrandKit(ctx, clientId);
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/crm/clientes/${clientId}`}
        className="-ml-1 mb-6 flex h-10 w-fit items-center gap-1 rounded-md px-1 font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted hover:text-text md:mb-9 md:h-8"
      >
        <ChevronLeft className="size-4" /> {data.client.name}
      </Link>
      <PageHeader
        eyebrow="Kit de marca"
        title={data.client.name}
        description="Logos, paleta, tipografías y manual. Lo usan los sitios y los PDFs del cliente."
        accent={LIBRARY_ACCENT}
        actions={
          <Button asChild variant="ghost">
            <Link href={`/biblioteca?cliente=${clientId}`}>
              <FolderOpen className="size-4" /> Archivos del cliente
            </Link>
          </Button>
        }
      />
      <BrandKitEditor
        key={data.kit?.updatedAt.getTime() ?? 0}
        clientId={clientId}
        initial={{ colors: data.colors, fonts: data.fonts, logos: data.logos, guidelines: data.guidelines, notesMd: data.notesMd }}
      />
    </div>
  );
}
