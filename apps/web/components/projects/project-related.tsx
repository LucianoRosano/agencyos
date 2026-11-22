import "server-only";
import { type Ctx, formatDate, formatDateTime, formatMoney, L, label } from "@agencyos/core";
import { getProjectNote, listProjectFiles, listProjectNotes, projectClientCard, projectFinance } from "@agencyos/modules/projects/related";
import { Badge, BlockCard, Card, EmptyState, SectionLabel } from "@agencyos/ui";
import { ArrowLeft, Building2, Download, FileText, FolderOpen, NotebookPen, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileThumb, formatBytes } from "@/components/library/file-visual";
import { MarkdownView } from "@/components/markdown";
import { renderMarkdown } from "@/lib/markdown";
import { ProjectNoteEditor } from "./project-note-ui";

/**
 * Pestañas de la ficha del proyecto con lo que cuelga de él fuera del módulo Proyectos (projects/related):
 * notas, archivos, finanzas y cliente. Para un colaborador son la única vía (siempre dentro de sus proyectos).
 */

type P = { ctx: Ctx; projectId: string; full: boolean };

export async function ProjectNotesTab({ ctx, projectId, full, noteId }: P & { noteId?: string }) {
  if (noteId) return <ProjectNoteDetail ctx={ctx} projectId={projectId} noteId={noteId} full={full} />;
  const notes = await listProjectNotes(ctx, projectId);
  if (!notes.length)
    return (
      <Card className="p-2">
        <EmptyState
          icon={<NotebookPen />}
          title="Sin notas vinculadas"
          description={
            full
              ? "Las notas del Cerebro vinculadas a este proyecto (o que lo mencionan con #) aparecen acá."
              : "Cuando haya notas vinculadas a este proyecto las vas a ver acá."
          }
          action={
            full ? (
              <Link href="/notas/nueva" className="text-[14px] text-accent-text hover:underline">
                Crear una nota
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
      {notes.map((n) => (
        <li key={n.id}>
          <Link
            href={full ? `/notas/${n.id}` : `/proyectos/${projectId}/notas/${n.id}`}
            className="lift flex min-h-11 flex-col gap-1.5 rounded-[12px] border border-border bg-surface p-4 hover:border-border-strong"
          >
            <span className="flex items-center gap-2 text-[15px] font-medium text-text">
              <FileText className="size-4 shrink-0 text-text-muted" />
              <span className="truncate">{n.title}</span>
            </span>
            {n.excerpt.trim() ? <span className="line-clamp-2 text-[13px] text-text-muted">{n.excerpt}</span> : null}
            <span className="font-mono text-[11px] text-text-faint">
              {formatDateTime(n.updatedAt)} · {n.wordCount} palabras{n.owned ? "" : " · vinculada"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function ProjectNoteDetail({ ctx, projectId, noteId, full }: P & { noteId: string }) {
  const n = await getProjectNote(ctx, projectId, noteId);
  if (!n) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/proyectos/${projectId}/notas`} className="inline-flex min-h-11 items-center gap-1.5 self-start text-[14px] text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Notas del proyecto
      </Link>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[18px] font-semibold text-text">{n.title}</h2>
          <span className="font-mono text-[11px] text-text-faint">Editada {formatDateTime(n.updatedAt)}</span>
        </div>
        <ProjectNoteEditor
          projectId={projectId}
          noteId={n.id}
          bodyMd={n.bodyMd}
          html={renderMarkdown(n.bodyMd, () => null)}
          fullHref={full ? `/notas/${n.id}` : null}
        />
      </Card>
    </div>
  );
}

export async function ProjectFilesTab({ ctx, projectId, full }: P) {
  const files = await listProjectFiles(ctx, projectId);
  if (!files.length)
    return (
      <Card className="p-2">
        <EmptyState
          icon={<FolderOpen />}
          title="Sin archivos"
          description="Los archivos de la Biblioteca vinculados al proyecto, a sus tareas o a su sitio aparecen acá."
          action={
            full ? (
              <Link href={`/biblioteca?proyecto=${projectId}`} className="text-[14px] text-accent-text hover:underline">
                Ir a la Biblioteca
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="project-files">
      {files.map((f) => (
        <li key={f.id} className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-border bg-surface">
          <FileThumb thumbUrl={f.thumbUrl} kind={f.kind} name={f.name} className="aspect-[4/3] w-full border-b border-border" />
          <div className="flex min-w-0 items-center gap-2 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-text" title={f.name}>
                {f.name}
              </p>
              <p className="font-mono text-[11px] text-text-faint">
                {formatBytes(f.size)} · {formatDate(f.createdAt)}
              </p>
            </div>
            <a
              href={f.downloadUrl}
              className="grid size-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
              aria-label={`Descargar ${f.name}`}
            >
              <Download className="size-4" />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

const TX_TONE: Record<string, "success" | "danger"> = { income: "success", expense: "danger" };

export async function ProjectFinanceTab({ ctx, projectId, full }: P) {
  const f = await projectFinance(ctx, projectId);
  if (!f.receivables.length && !f.transactions.length)
    return (
      <Card className="p-2">
        <EmptyState
          icon={<Wallet />}
          title="Sin movimientos"
          description="Los cobros y movimientos vinculados a este proyecto aparecen acá."
          action={
            full ? (
              <Link href="/finanzas/por-cobrar" className="text-[14px] text-accent-text hover:underline">
                Ir a Finanzas
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <BlockCard icon={<Wallet />} title="Cobros">
          {f.receivables.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {f.receivables.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 flex-1 truncate text-[14px] text-text">{r.concept}</span>
                  <span className="flex items-center gap-3">
                    <Badge tone={r.status === "paid" ? "success" : r.status === "overdue" ? "danger" : r.status === "void" ? "neutral" : "warning"}>
                      {label(L.receivableStatus, r.status)}
                    </Badge>
                    <span className="font-mono text-[12px] text-text-faint">{r.dueDate ? formatDate(r.dueDate) : "sin vencimiento"}</span>
                    <span className="ml-auto font-mono text-[14px] text-text sm:ml-0">{formatMoney(r.amount, r.currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-text-faint">Sin cobros vinculados.</p>
          )}
        </BlockCard>
        <BlockCard icon={<Wallet />} title="Movimientos">
          {f.transactions.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {f.transactions.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-[12px] text-text-faint">{formatDate(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-text">{t.description ?? label(L.txKind, t.kind)}</span>
                  <Badge tone={TX_TONE[t.kind] ?? "neutral"}>{label(L.txKind, t.kind)}</Badge>
                  <span className="font-mono text-[14px] text-text">{formatMoney(t.amount, t.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-text-faint">Sin movimientos vinculados.</p>
          )}
        </BlockCard>
      </div>
      <Card className="h-fit p-5">
        <SectionLabel className="mb-3">Resumen</SectionLabel>
        <dl className="flex flex-col gap-3 text-[14px]">
          {f.totals.map((t) => (
            <div key={t.currency} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-text-muted">Cobrado ({t.currency})</dt>
              <dd className="text-right font-mono">{formatMoney(t.income, t.currency)}</dd>
              <dt className="text-text-muted">Pendiente</dt>
              <dd className="text-right font-mono">{formatMoney(t.pending, t.currency)}</dd>
              <dt className="text-text-muted">Gastos</dt>
              <dd className="text-right font-mono">{formatMoney(t.expense, t.currency)}</dd>
            </div>
          ))}
        </dl>
        {!full ? <p className="mt-4 text-[12px] text-text-faint">Solo lectura.</p> : null}
      </Card>
    </div>
  );
}

export async function ProjectClientTab({ ctx, projectId }: Omit<P, "full">) {
  const data = await projectClientCard(ctx, projectId);
  if (!data)
    return (
      <Card className="p-2">
        <EmptyState icon={<Building2 />} title="Sin cliente" description="Este proyecto no tiene un cliente vinculado." />
      </Card>
    );
  const { client: c, contacts, interactions } = data;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="p-5">
          <SectionLabel className="mb-3">Cliente</SectionLabel>
          <p className="text-[18px] font-semibold text-text">{c.name}</p>
          {c.tradeName ? <p className="text-[14px] text-text-muted">{c.tradeName}</p> : null}
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-text-muted">Estado</dt>
            <dd>{label(L.clientStatus, c.status)}</dd>
            {c.industry ? (
              <>
                <dt className="text-text-muted">Rubro</dt>
                <dd>{c.industry}</dd>
              </>
            ) : null}
            {c.city || c.province ? (
              <>
                <dt className="text-text-muted">Ubicación</dt>
                <dd>{[c.city, c.province].filter(Boolean).join(", ")}</dd>
              </>
            ) : null}
            {c.website ? (
              <>
                <dt className="text-text-muted">Web</dt>
                <dd className="min-w-0 truncate">{c.website}</dd>
              </>
            ) : null}
          </dl>
          {c.notesMd ? <MarkdownView html={renderMarkdown(c.notesMd)} className="mt-4 text-[14px]" /> : null}
        </Card>
        <BlockCard icon={<NotebookPen />} title="Últimas interacciones">
          {interactions.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {interactions.map((i) => (
                <li key={i.id} className="py-2.5">
                  <p className="font-mono text-[11px] text-text-faint">
                    {label(L.interactionKind, i.kind)} · {formatDateTime(i.occurredAt)}
                  </p>
                  <MarkdownView html={renderMarkdown(i.summaryMd)} className="text-[14px]" />
                  {i.nextStep ? <p className="mt-1 text-[13px] text-text-muted">Próximo paso: {i.nextStep}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-text-faint">Sin interacciones registradas.</p>
          )}
        </BlockCard>
      </div>
      <BlockCard icon={<Users />} title="Contactos" className="h-fit">
        {contacts.length ? (
          <ul className="flex flex-col gap-3">
            {contacts.map((p) => (
              <li key={p.id} className="text-[14px]">
                <p className="text-text">
                  {p.name}
                  {p.isPrimary ? <span className="ml-2 font-mono text-[11px] text-text-faint">principal</span> : null}
                </p>
                {p.role ? <p className="text-[13px] text-text-muted">{p.role}</p> : null}
                {p.email ? (
                  <a href={`mailto:${p.email}`} className="block min-h-6 truncate text-[13px] text-accent-text hover:underline">
                    {p.email}
                  </a>
                ) : null}
                {p.phone || p.whatsapp ? <p className="font-mono text-[12px] text-text-muted">{p.phone ?? p.whatsapp}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-text-faint">Sin contactos.</p>
        )}
        <p className="mt-4 text-[12px] text-text-faint">Solo lectura.</p>
      </BlockCard>
    </div>
  );
}
