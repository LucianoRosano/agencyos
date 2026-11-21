import { assertCan, type Ctx, formatDate, L, label } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getStorage } from "../shared/storage";
import { EXTRACTABLE, extractText } from "./extract";

/**
 * Cerebro inteligente (ADR 0014): todo lo que escribís y subís queda indexado en fragmentos con búsqueda de texto
 * completo en español (PostgreSQL, sin servicios externos ni costo). Fuentes: notas, documentos de la Biblioteca
 * (PDF, Word, texto), decisiones de proyectos, conversaciones con clientes, proyectos y clientes.
 * `askBrain` responde con los pasajes más relevantes y su fuente; `relatedTo` encuentra lo relacionado.
 */

export const SOURCE_TYPES = ["note", "file", "decision", "interaction", "project", "client"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_LABEL: Record<SourceType, string> = {
  note: "Nota",
  file: "Documento",
  decision: "Decisión",
  interaction: "Conversación",
  project: "Proyecto",
  client: "Cliente",
};

const CHUNK = 1100;
const OVERLAP = 150;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// ---------- Fragmentar ----------

export function chunkText(text: string): string[] {
  const clean = text
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return [];
  if (clean.length <= CHUNK) return [clean];
  const paras = clean.split(/\n{2,}/);
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
  };
  for (const p of paras) {
    if (p.length > CHUNK) {
      push();
      cur = "";
      for (let i = 0; i < p.length; i += CHUNK - OVERLAP) out.push(p.slice(i, i + CHUNK).trim());
      continue;
    }
    if ((cur + "\n\n" + p).length > CHUNK) {
      push();
      // solapamiento: el final del fragmento anterior abre el siguiente (no se cortan ideas a la mitad)
      cur = `${cur.slice(-OVERLAP)}\n\n${p}`;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  push();
  return out.slice(0, 600);
}

// ---------- Fuentes ----------

type Doc = { title: string; text: string; href: string; meta: Record<string, unknown>; updatedAt: Date };

async function loadSource(workspaceId: string, type: SourceType, id: string): Promise<Doc | null> {
  const db = getDb();
  const ws = eq;
  switch (type) {
    case "note": {
      const [n] = await db
        .select()
        .from(schema.note)
        .where(and(ws(schema.note.id, id), ws(schema.note.workspaceId, workspaceId), isNull(schema.note.deletedAt)));
      return n
        ? { title: n.title, text: n.bodyMd, href: `/notas/${n.id}`, meta: { entityType: n.entityType, entityId: n.entityId }, updatedAt: n.updatedAt }
        : null;
    }
    case "file": {
      const [f] = await db
        .select()
        .from(schema.file)
        .where(and(ws(schema.file.id, id), ws(schema.file.workspaceId, workspaceId), isNull(schema.file.deletedAt)));
      if (!f) return null;
      let body = "";
      if (EXTRACTABLE.test(f.mime) && f.size <= MAX_FILE_BYTES && !f.url) {
        try {
          body = await extractText(await getStorage().get(f.storageKey), f.mime, f.name);
        } catch {
          body = "";
        }
      }
      return {
        title: f.name,
        text: [f.description ?? "", body].filter(Boolean).join("\n\n"),
        href: `/biblioteca/archivo/${f.id}`,
        meta: { projectId: f.projectId, clientId: f.clientId, mime: f.mime },
        updatedAt: f.updatedAt,
      };
    }
    case "decision": {
      const [d] = await db
        .select({ d: schema.decision, project: schema.project.name })
        .from(schema.decision)
        .innerJoin(schema.project, eq(schema.project.id, schema.decision.projectId))
        .where(and(ws(schema.decision.id, id), ws(schema.decision.workspaceId, workspaceId), isNull(schema.decision.deletedAt)));
      return d
        ? {
            title: `${d.d.title} (${d.project})`,
            text: [
              `Decisión del ${formatDate(d.d.decidedOn)} en el proyecto «${d.project}».`,
              d.d.title,
              d.d.rationaleMd ?? "",
              d.d.approvedBy ? `Aprobó: ${d.d.approvedBy}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            href: `/proyectos/${d.d.projectId}/decisiones`,
            meta: { projectId: d.d.projectId, date: d.d.decidedOn },
            updatedAt: d.d.updatedAt,
          }
        : null;
    }
    case "interaction": {
      const [i] = await db
        .select({ i: schema.interaction, client: schema.client.name })
        .from(schema.interaction)
        .innerJoin(schema.client, eq(schema.client.id, schema.interaction.clientId))
        .where(and(ws(schema.interaction.id, id), ws(schema.interaction.workspaceId, workspaceId), isNull(schema.interaction.deletedAt)));
      if (!i) return null;
      const date = i.i.occurredAt.toISOString().slice(0, 10);
      return {
        title: `${label(L.interactionKind, i.i.kind)} con ${i.client} · ${formatDate(date)}`,
        text: [i.i.summaryMd, i.i.nextStep ? `Próximo paso: ${i.i.nextStep}` : ""].filter(Boolean).join("\n\n"),
        href: `/crm/clientes/${i.i.clientId}/interacciones`,
        meta: { clientId: i.i.clientId, date },
        updatedAt: i.i.updatedAt,
      };
    }
    case "project": {
      const [p] = await db
        .select()
        .from(schema.project)
        .where(and(ws(schema.project.id, id), ws(schema.project.workspaceId, workspaceId), isNull(schema.project.deletedAt)));
      return p
        ? {
            title: p.name,
            text: [
              p.goal ? `Objetivo: ${p.goal}` : "",
              p.definitionOfDone ? `Terminado cuando: ${p.definitionOfDone}` : "",
              p.nextAction ? `Siguiente acción: ${p.nextAction}` : "",
              p.notesMd ?? "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            href: `/proyectos/${p.id}`,
            meta: { clientId: p.clientId },
            updatedAt: p.updatedAt,
          }
        : null;
    }
    case "client": {
      const [c] = await db
        .select()
        .from(schema.client)
        .where(and(ws(schema.client.id, id), ws(schema.client.workspaceId, workspaceId), isNull(schema.client.deletedAt)));
      return c
        ? {
            title: c.name,
            text: [c.industry ? `Rubro: ${c.industry}` : "", c.city ? `Ciudad: ${c.city}` : "", c.notesMd ?? ""].filter(Boolean).join("\n\n"),
            href: `/crm/clientes/${c.id}`,
            meta: {},
            updatedAt: c.updatedAt,
          }
        : null;
    }
  }
}

const TABLES = {
  note: schema.note,
  file: schema.file,
  decision: schema.decision,
  interaction: schema.interaction,
  project: schema.project,
  client: schema.client,
} as const;

/** Reindexa una fuente (o borra sus fragmentos si ya no existe). */
export async function indexSource(workspaceId: string, type: SourceType, id: string) {
  const doc = await loadSource(workspaceId, type, id);
  const db = getDb();
  await db.transaction(async (t) => {
    await t.delete(schema.knowledgeChunk).where(and(eq(schema.knowledgeChunk.sourceType, type), eq(schema.knowledgeChunk.sourceId, id)));
    if (!doc) {
      await t.delete(schema.knowledgeSource).where(and(eq(schema.knowledgeSource.sourceType, type), eq(schema.knowledgeSource.sourceId, id)));
      return;
    }
    const chunks = chunkText(doc.text);
    const rows = (chunks.length ? chunks : [""]).map((content, i) => ({
      workspaceId,
      sourceType: type,
      sourceId: id,
      chunk: i,
      title: doc.title.slice(0, 300),
      content,
      href: doc.href,
      meta: doc.meta,
      sourceUpdatedAt: doc.updatedAt,
    }));
    for (let i = 0; i < rows.length; i += 200) await t.insert(schema.knowledgeChunk).values(rows.slice(i, i + 200));
    await t
      .insert(schema.knowledgeSource)
      .values({ workspaceId, sourceType: type, sourceId: id, sourceUpdatedAt: doc.updatedAt, chunks: rows.length, indexedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.knowledgeSource.sourceType, schema.knowledgeSource.sourceId],
        set: { sourceUpdatedAt: doc.updatedAt, chunks: rows.length, indexedAt: new Date() },
      });
  });
  return doc ? "indexed" : "removed";
}

/**
 * Job (worker, cada minuto): indexa lo nuevo o cambiado y saca lo borrado. Hasta `limit` fuentes por tipo y
 * corrida, así una carga grande (miles de notas) se pone al día de a poco sin frenar nada.
 */
export async function indexPending(opts: { limit?: number; workspaceId?: string } = {}) {
  const db = getDb();
  const limit = opts.limit ?? 40;
  let done = 0;
  for (const type of SOURCE_TYPES) {
    const t = TABLES[type];
    const stale = await db
      .select({ id: t.id, workspaceId: t.workspaceId })
      .from(t)
      .leftJoin(schema.knowledgeSource, and(eq(schema.knowledgeSource.sourceType, type), eq(schema.knowledgeSource.sourceId, t.id)))
      .where(
        and(
          isNull(t.deletedAt),
          opts.workspaceId ? eq(t.workspaceId, opts.workspaceId) : undefined,
          sql`(${schema.knowledgeSource.sourceId} is null or ${t.updatedAt} > ${schema.knowledgeSource.sourceUpdatedAt})`,
        ),
      )
      .limit(limit);
    for (const s of stale) {
      await indexSource(s.workspaceId, type, s.id);
      done++;
    }
    // borrados (papelera): fuera del Cerebro
    const gone = await db
      .select({ id: schema.knowledgeSource.sourceId, workspaceId: schema.knowledgeSource.workspaceId })
      .from(schema.knowledgeSource)
      .leftJoin(t, eq(t.id, schema.knowledgeSource.sourceId))
      .where(
        and(
          eq(schema.knowledgeSource.sourceType, type),
          opts.workspaceId ? eq(schema.knowledgeSource.workspaceId, opts.workspaceId) : undefined,
          sql`(${t.id} is null or ${t.deletedAt} is not null)`,
        ),
      )
      .limit(limit);
    for (const g of gone) {
      await indexSource(g.workspaceId, type, g.id);
      done++;
    }
  }
  return done;
}

// ---------- Preguntar ----------

const STOP = new Set(
  "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bajo bien cada como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estaba estado estan estar este esto estos fue fueron ha hay hace hacer hasta la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o otra otro para pero poco por porque que quien se ser si sin sobre son su sus tambien te tenemos tener tengo ti tiene todo todos tu tus un una uno unos y ya yo qué cómo cuál cuándo dónde quién le dije dijimos sobre habia había".split(
    " ",
  ),
);

export const normText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Términos útiles de la pregunta (sin acentos, sin palabras vacías). */
export function queryTerms(q: string): string[] {
  const words = normText(q).match(/[a-z0-9ñ]{3,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, 12);
}

const stem = (w: string) => (w.length > 6 ? w.slice(0, w.length - 2) : w.length > 4 ? w.slice(0, w.length - 1) : w);

/** Mejores oraciones de un fragmento para los términos (sin depender de acentos ni mayúsculas). */
export function bestSentences(text: string, terms: string[], max = 2): string[] {
  const stems = terms.map(stem);
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  const scored = sentences.map((s, i) => {
    const n = normText(s);
    const score = stems.reduce((a, st) => a + (n.includes(st) ? 1 : 0), 0);
    return { s, i, score };
  });
  const top = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i);
  const pick = top.length ? top : scored.slice(0, 1);
  return pick.map((x) => (x.s.length > 320 ? `${x.s.slice(0, 317)}…` : x.s));
}

export type BrainHit = {
  sourceType: SourceType;
  sourceId: string;
  title: string;
  href: string;
  typeLabel: string;
  date: string | null;
  excerpts: string[];
  score: number;
};
export type BrainAnswer = { question: string; terms: string[]; lead: { text: string; hit: BrainHit } | null; hits: BrainHit[]; indexed: number };

const DECISION_INTENT = /decid|acord|quedamos|prometi|promet|definimos|elegimos|aprob/;

function tsOr(terms: string[]) {
  return terms.map((t) => `${t.replace(/[^a-z0-9ñ]/g, "")}:*`).join(" | ");
}

/** Pregunta en lenguaje natural → pasajes más relevantes agrupados por fuente, con la mejor oración como respuesta. */
export async function askBrain(ctx: Ctx, question: string, opts: { types?: SourceType[]; limit?: number } = {}): Promise<BrainAnswer> {
  assertCan(ctx, "read", "note");
  const q = question.trim().slice(0, 500);
  const terms = queryTerms(q);
  const db = getDb();
  const [{ n: indexed } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.knowledgeSource)
    .where(eq(schema.knowledgeSource.workspaceId, ctx.workspaceId));
  if (!terms.length) return { question: q, terms, lead: null, hits: [], indexed };
  const orQ = tsOr(terms);
  const intent = DECISION_INTENT.test(normText(q));
  const rows = await db
    .select({
      sourceType: schema.knowledgeChunk.sourceType,
      sourceId: schema.knowledgeChunk.sourceId,
      title: schema.knowledgeChunk.title,
      content: schema.knowledgeChunk.content,
      href: schema.knowledgeChunk.href,
      meta: schema.knowledgeChunk.meta,
      updatedAt: schema.knowledgeChunk.sourceUpdatedAt,
      rank: sql<number>`(ts_rank_cd(tsv, to_tsquery('spanish', ${orQ}), 32)
        * (case when tsv @@ websearch_to_tsquery('spanish', f_search_norm(${q})) then 2.0 else 1.0 end)
        * (case when ${intent} and source_type in ('decision','interaction') then 1.8 else 1.0 end)
        * (case when source_type = 'decision' then 1.2 else 1.0 end))::float`,
    })
    .from(schema.knowledgeChunk)
    .where(
      and(
        eq(schema.knowledgeChunk.workspaceId, ctx.workspaceId),
        opts.types?.length ? inArray(schema.knowledgeChunk.sourceType, opts.types) : undefined,
        sql`tsv @@ to_tsquery('spanish', ${orQ})`,
      ),
    )
    .orderBy(sql`8 desc`)
    .limit(40);
  const bySource = new Map<string, BrainHit>();
  for (const r of rows) {
    const key = `${r.sourceType}:${r.sourceId}`;
    const ex = bestSentences(r.content || r.title, terms);
    const cur = bySource.get(key);
    if (cur) {
      cur.score += r.rank * 0.3;
      for (const e of ex) if (cur.excerpts.length < 3 && !cur.excerpts.includes(e)) cur.excerpts.push(e);
      continue;
    }
    const type = r.sourceType as SourceType;
    const meta = (r.meta ?? {}) as { date?: string };
    bySource.set(key, {
      sourceType: type,
      sourceId: r.sourceId,
      title: r.title,
      href: r.href,
      typeLabel: SOURCE_LABEL[type] ?? type,
      date: meta.date ?? r.updatedAt.toISOString().slice(0, 10),
      excerpts: ex,
      score: r.rank,
    });
  }
  const hits = [...bySource.values()].sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 8);
  const first = hits[0];
  return { question: q, terms, lead: first?.excerpts[0] ? { text: first.excerpts[0], hit: first } : null, hits, indexed };
}

/** Lo relacionado con una fuente: sus términos más característicos contra el resto del Cerebro. */
export async function relatedTo(ctx: Ctx, type: SourceType, id: string, limit = 6): Promise<BrainHit[]> {
  assertCan(ctx, "read", "note");
  const db = getDb();
  const own = await db
    .select({ title: schema.knowledgeChunk.title, content: schema.knowledgeChunk.content })
    .from(schema.knowledgeChunk)
    .where(and(eq(schema.knowledgeChunk.workspaceId, ctx.workspaceId), eq(schema.knowledgeChunk.sourceType, type), eq(schema.knowledgeChunk.sourceId, id)))
    .limit(20);
  if (!own.length) return [];
  const freq = new Map<string, number>();
  const text = normText(`${own[0]?.title ?? ""} ${own[0]?.title ?? ""} ${own.map((o) => o.content).join(" ")}`);
  for (const w of text.match(/[a-z0-9ñ]{4,}/g) ?? []) if (!STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  // Términos característicos: frecuencia en la fuente × rareza en el resto del Cerebro (IDF). Así «envíos», que aparece
  // en todos lados, pesa menos que «Andreani».
  const candidates = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([w]) => w.replace(/[^a-z0-9ñ]/g, ""))
    .filter((w) => w.length >= 4);
  if (!candidates.length) return [];
  const dfRows = await db.execute<{ t: string; df: number; n: number }>(sql`
    select t, (select count(*)::int from knowledge_chunk c where c.workspace_id = ${ctx.workspaceId} and c.tsv @@ to_tsquery('spanish', t || ':*')) as df,
           (select count(*)::int from knowledge_chunk c where c.workspace_id = ${ctx.workspaceId}) as n
    from unnest(${`{${candidates.join(",")}}`}::text[]) as t`);
  const terms = dfRows.rows
    .map((r) => ({ t: r.t, score: (freq.get(r.t) ?? 1) * Math.log(1 + (r.n || 1) / (1 + r.df)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.t);
  if (!terms.length) return [];
  const orQ = tsOr(terms);
  const rows = await db
    .select({
      sourceType: schema.knowledgeChunk.sourceType,
      sourceId: schema.knowledgeChunk.sourceId,
      title: schema.knowledgeChunk.title,
      content: schema.knowledgeChunk.content,
      href: schema.knowledgeChunk.href,
      meta: schema.knowledgeChunk.meta,
      updatedAt: schema.knowledgeChunk.sourceUpdatedAt,
      rank: sql<number>`ts_rank_cd(tsv, to_tsquery('spanish', ${orQ}), 32)::float`,
    })
    .from(schema.knowledgeChunk)
    .where(
      and(
        eq(schema.knowledgeChunk.workspaceId, ctx.workspaceId),
        sql`not (source_type = ${type} and source_id = ${id})`,
        sql`tsv @@ to_tsquery('spanish', ${orQ})`,
      ),
    )
    .orderBy(sql`8 desc`)
    .limit(30);
  const seen = new Map<string, BrainHit>();
  for (const r of rows) {
    const key = `${r.sourceType}:${r.sourceId}`;
    if (seen.has(key)) continue;
    const t = r.sourceType as SourceType;
    seen.set(key, {
      sourceType: t,
      sourceId: r.sourceId,
      title: r.title,
      href: r.href,
      typeLabel: SOURCE_LABEL[t] ?? t,
      date: ((r.meta ?? {}) as { date?: string }).date ?? r.updatedAt.toISOString().slice(0, 10),
      excerpts: bestSentences(r.content || r.title, terms, 1),
      score: r.rank,
    });
  }
  return [...seen.values()].slice(0, limit);
}

/** Estado del índice por tipo (para la pantalla del Cerebro). */
export async function brainStats(ctx: Ctx) {
  assertCan(ctx, "read", "note");
  const rows = await getDb()
    .select({
      type: schema.knowledgeSource.sourceType,
      n: sql<number>`count(*)::int`,
      chunks: sql<number>`coalesce(sum(${schema.knowledgeSource.chunks}),0)::int`,
    })
    .from(schema.knowledgeSource)
    .where(eq(schema.knowledgeSource.workspaceId, ctx.workspaceId))
    .groupBy(schema.knowledgeSource.sourceType);
  return rows.map((r) => ({ type: r.type as SourceType, label: SOURCE_LABEL[r.type as SourceType] ?? r.type, sources: r.n, chunks: r.chunks }));
}
