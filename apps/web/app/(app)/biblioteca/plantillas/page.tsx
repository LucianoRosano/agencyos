import { L, label, relativeFromDate } from "@agencyos/core";
import { listTemplates } from "@agencyos/modules/library/queries";
import { Badge, Button, Card, EmptyState, PageHeader, Tabs } from "@agencyos/ui";
import { ChevronLeft, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { LIBRARY_ACCENT } from "@/components/library/file-visual";
import { TemplateMenu, TemplateSheet, UseTemplateSheet } from "@/components/library/template-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Plantillas · Biblioteca" };

const KINDS = Object.keys(L.templateKind);

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const kind = KINDS.includes(sp.tipo ?? "") ? sp.tipo : undefined;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const rows = await listTemplates(ctx, { kind, q });
  const hrefFor = (k?: string) => `/biblioteca/plantillas${k ? `?tipo=${k}` : ""}`;
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/biblioteca"
        className="-ml-1 mb-3 flex h-10 w-fit items-center gap-1 rounded-md px-1 font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted hover:text-text md:h-8"
      >
        <ChevronLeft className="size-4" /> Biblioteca
      </Link>
      <PageHeader
        eyebrow="Biblioteca"
        title="Plantillas"
        description="Documentos, snippets, prompts y checklists en Markdown con variables {{así}}. Se completan y se copian."
        accent={LIBRARY_ACCENT}
        actions={<TemplateSheet defaultKind={kind} />}
      />
      <Tabs
        active={kind ?? "todas"}
        items={[{ key: "todas", label: "Todas", href: hrefFor() }, ...KINDS.map((k) => ({ key: k, label: label(L.templateKind, k), href: hrefFor(k) }))]}
      />
      <form action="/biblioteca/plantillas" className="mb-5">
        {kind ? <input type="hidden" name="tipo" value={kind} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar plantillas…"
          aria-label="Buscar plantillas"
          className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm"
        />
      </form>
      {rows.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <li key={t.id}>
              <Card className="flex h-full flex-col p-4" data-template={t.name}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-medium text-text">{t.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge>{label(L.templateKind, t.kind)}</Badge>
                      <span className="font-mono text-[12px] text-text-faint">editada {relativeFromDate(t.updatedAt)}</span>
                    </div>
                  </div>
                  <TemplateMenu tpl={{ id: t.id, name: t.name, kind: t.kind, bodyMd: t.bodyMd }} />
                </div>
                <p className="mb-3 line-clamp-4 flex-1 font-mono text-[12px] leading-relaxed whitespace-pre-line break-words text-text-muted">{t.bodyMd}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-[12px] text-text-faint">
                    {t.vars.length ? t.vars.map((v) => `{{${v}}}`).join(" ") : "sin variables"}
                  </span>
                  <UseTemplateSheet tpl={{ id: t.id, name: t.name, kind: t.kind, bodyMd: t.bodyMd }} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<LayoutTemplate />}
          title={q || kind ? "No hay plantillas con este filtro" : "Todavía no hay plantillas"}
          description="Guardá textos que repetís: mails al cliente, prompts para Claude, checklists de entrega. Con {{variables}} se completan en segundos."
          action={
            q || kind ? (
              <Button asChild>
                <Link href="/biblioteca/plantillas">Ver todas</Link>
              </Button>
            ) : (
              <TemplateSheet />
            )
          }
        />
      )}
    </div>
  );
}
