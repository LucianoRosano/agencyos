import { Card, PageHeader } from "@agencyos/ui";
import { ShareForm } from "./share-form";

export const metadata = { title: "Compartir a la Bandeja" };

/**
 * Destino de "Compartir" del celular (Web Share Target, manifest.ts): lo que se comparte desde otra app
 * (un link, un texto, una foto de WhatsApp con texto) llega acá prellenado y se guarda en la Bandeja con un toque.
 */
export default async function SharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 1500) ?? "";
  };
  const title = one("title");
  const text = one("text");
  const url = one("url");
  // Muchas apps mandan el link dentro de `text`: no duplicarlo.
  const parts = [title, text, url && !text.includes(url) ? url : ""].filter(Boolean);
  const initial = [...new Set(parts)].join("\n").slice(0, 2000);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Bandeja" title="Compartir a AGENCYOS" description="Revisalo y guardalo: después lo ordenás desde la Bandeja." accent="#22D3EE" />
      <Card className="p-5">
        <ShareForm initial={initial} />
      </Card>
    </div>
  );
}
