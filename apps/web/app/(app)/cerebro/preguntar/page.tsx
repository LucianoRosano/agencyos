import { can, formatDate } from "@agencyos/core";
import { askBrain, type BrainHit, brainStats, normText } from "@agencyos/modules/brain/knowledge";
import { Badge, Button, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { BookOpen, FileUp, MessageCircleQuestion, Search, Waypoints } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/session";
import { IndexNowButton } from "./index-button";

export const metadata = { title: "Preguntar al Cerebro" };

const TONE: Record<string, "accent" | "info" | "success" | "warning" | "neutral"> = {
  decision: "success",
  interaction: "info",
  note: "accent",
  file: "warning",
  project: "neutral",
  client: "neutral",
};

const NAMES: Record<string, [string, string]> = {
  note: ["nota", "notas"],
  file: ["documento", "documentos"],
  decision: ["decisión", "decisiones"],
  interaction: ["conversación", "conversaciones"],
  project: ["proyecto", "proyectos"],
  client: ["cliente", "clientes"],
};

/** Resalta las palabras de la pregunta (sin depender de acentos ni mayúsculas). */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const stems = terms.map((t) => (t.length > 5 ? t.slice(0, t.length - 2) : t));
  return (
    <>
      {text.split(/(\s+)/).map((w, i) => {
        const n = normText(w).replace(/[^a-z0-9ñ]/g, "");
        // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos de un texto fijo
        return n.length > 2 && stems.some((s) => n.startsWith(s)) ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-text">
            {w}
          </mark>
        ) : (
          w
        );
      })}
    </>
  );
}

function Hit({ h, terms }: { h: BrainHit; terms: string[] }) {
  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="brain-hit">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[h.sourceType] ?? "neutral"}>{h.typeLabel}</Badge>
        <Link href={h.href} className="min-w-0 flex-1 truncate text-[15px] font-medium text-text hover:underline">
          {h.title}
        </Link>
        {h.date ? <span className="font-mono text-[12px] text-text-muted">{formatDate(h.date)}</span> : null}
      </div>
      <ul className="flex flex-col gap-1.5">
        {h.excerpts.map((e) => (
          <li key={e} className="border-l-2 border-border pl-3 text-[14px] leading-relaxed text-text-muted">
            <Highlight text={e} terms={terms} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function AskBrainPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "note")) redirect("/hoy");
  const q = ((await searchParams).q ?? "").trim().slice(0, 500);
  const [stats, answer] = await Promise.all([brainStats(ctx), q ? askBrain(ctx, q) : Promise.resolve(null)]);
  const total = stats.reduce((a, s) => a + s.sources, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href="/cerebro" className="hover:text-text">
            Cerebro
          </Link>
        }
        title="Preguntar"
        description="Buscá en todo lo que escribiste y subiste: notas, documentos, decisiones de proyectos y conversaciones con clientes."
        accent="#7C5CFF"
        actions={
          <Button asChild variant="ghost">
            <Link href="/cerebro">
              <Waypoints className="size-4" /> Ver el grafo
            </Link>
          </Button>
        }
      />
      <form action="/cerebro/preguntar" className="mb-5 flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="brain-q" className="sr-only">
          Tu pregunta
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            id="brain-q"
            name="q"
            defaultValue={q}
            autoFocus={!q}
            maxLength={500}
            placeholder="¿Qué decidimos sobre los envíos? ¿Qué le prometí a…?"
            className="h-11 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated pr-3 pl-9 text-base text-text placeholder:text-text-faint focus:border-accent focus:outline-none md:text-sm"
          />
        </div>
        <Button type="submit" variant="primary" className="h-11">
          <MessageCircleQuestion className="size-4" /> Preguntar
        </Button>
      </form>

      {answer ? (
        answer.hits.length ? (
          <div className="flex flex-col gap-4">
            {answer.lead ? (
              <Card className="border-accent/40 p-5" data-testid="brain-lead">
                <SectionLabel className="mb-2">Lo más relevante</SectionLabel>
                <p className="text-[16px] leading-relaxed text-text">
                  <Highlight text={answer.lead.text} terms={answer.terms} />
                </p>
                <p className="mt-2 text-[13px] text-text-muted">
                  {answer.lead.hit.typeLabel} ·{" "}
                  <Link href={answer.lead.hit.href} className="text-accent-text underline underline-offset-2">
                    {answer.lead.hit.title}
                  </Link>
                  {answer.lead.hit.date ? ` · ${formatDate(answer.lead.hit.date)}` : ""}
                </p>
              </Card>
            ) : null}
            <SectionLabel>Fuentes ({answer.hits.length})</SectionLabel>
            {answer.hits.map((h) => (
              <Hit key={`${h.sourceType}:${h.sourceId}`} h={h} terms={answer.terms} />
            ))}
          </div>
        ) : (
          <Card className="p-2">
            <EmptyState
              icon={<Search />}
              title="No encontré nada sobre eso"
              description={
                total
                  ? "Probá con otras palabras (el nombre del cliente, del proyecto o un término puntual)."
                  : "El Cerebro todavía no tiene nada indexado: escribí notas, registrá decisiones y subí documentos."
              }
            />
          </Card>
        )
      ) : null}

      <Card className="mt-6 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionLabel icon={<BookOpen />}>Lo que sabe el Cerebro</SectionLabel>
          <IndexNowButton />
        </div>
        {stats.length ? (
          <p className="text-[14px] text-text-muted" data-testid="brain-stats">
            {stats.map((s) => `${s.sources} ${(NAMES[s.type] ?? [s.label, s.label])[s.sources === 1 ? 0 : 1]}`).join(" · ")}. Se actualiza solo cada minuto.
          </p>
        ) : (
          <p className="text-[14px] text-text-muted">Todavía no indexó nada: se pone al día solo en un minuto, o tocá «Indexar ahora».</p>
        )}
        <p className="mt-3 text-[14px] text-text-muted">
          Los PDF, Word (.docx) y archivos de texto que subís a la{" "}
          <Link href="/biblioteca" className="text-accent-text underline underline-offset-2">
            Biblioteca
          </Link>{" "}
          se leen y se suman a las respuestas.
        </p>
        <Button asChild variant="secondary" className="mt-3">
          <Link href="/biblioteca">
            <FileUp className="size-4" /> Subir documentos
          </Link>
        </Button>
      </Card>
    </div>
  );
}
