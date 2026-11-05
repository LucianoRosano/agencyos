"use client";

import { relativeFromDate } from "@agencyos/core";
import { Button, Textarea } from "@agencyos/ui";
import { ArrowLeft, ArrowRight, Check, Link2, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addCommentAction,
  addLinkAction,
  createTagAction,
  deleteCommentAction,
  removeLinkAction,
  searchEntitiesAction,
  setTagsAction,
} from "@/app/actions/collab";
import { useAction } from "@/components/use-action";

type Tag = { id: string; name: string; color: string };

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] text-text"
      style={{ background: `color-mix(in srgb, ${tag.color} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: tag.color }} />#{tag.name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 grid size-6 place-items-center rounded-full text-text-faint hover:text-text"
          aria-label={`Quitar #${tag.name}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/** Etiquetas de una entidad: chips + selector con búsqueda y creación al vuelo. */
export function TagEditor({ type, id, all, selected, colors }: { type: string; id: string; all: Tag[]; selected: string[]; colors: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(selected);
  const [tags, setTags] = useState(all);
  const [pending, start] = useTransition();
  const router = useRouter();
  const inputId = useId();
  useEffect(() => setSel(selected), [selected]);

  function save(next: string[]) {
    setSel(next);
    start(async () => {
      const r = await setTagsAction(type, id, next);
      if (!r.ok) toast.error(r.error.message);
      router.refresh();
    });
  }
  function create() {
    const name = q.trim().replace(/^#/, "");
    if (!name) return;
    const color = colors[(tags.length + 1) % colors.length];
    start(async () => {
      const r = await createTagAction(name, color);
      if (!r.ok) return void toast.error(r.error.message);
      const t = r.data;
      setTags((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, { id: t.id, name: t.name, color: t.color }]));
      setQ("");
      if (!sel.includes(t.id)) {
        const next = [...sel, t.id];
        setSel(next);
        const s = await setTagsAction(type, id, next);
        if (!s.ok) toast.error(s.error.message);
      }
      router.refresh();
    });
  }
  const chosen = tags.filter((t) => sel.includes(t.id));
  const term = q.trim().replace(/^#/, "").toLowerCase();
  const filtered = tags.filter((t) => t.name.toLowerCase().includes(term));
  const exact = tags.some((t) => t.name.toLowerCase() === term);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {chosen.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => save(sel.filter((s) => s !== t.id))} />
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[12px] text-text-muted hover:text-text"
        >
          <Plus className="size-3" /> Etiqueta
        </button>
      </div>
      {open ? (
        <div className="rounded-lg border border-border bg-surface-2/50 p-2">
          <label htmlFor={inputId} className="sr-only">
            Buscar o crear etiqueta
          </label>
          <input
            id={inputId}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const first = filtered[0];
                if (term && !exact) create();
                else if (first) save(sel.includes(first.id) ? sel.filter((s) => s !== first.id) : [...sel, first.id]);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Buscar o crear…"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-text outline-none focus:border-accent md:text-sm"
          />
          <ul className="mt-1 max-h-56 overflow-y-auto">
            {filtered.map((t) => {
              const on = sel.includes(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save(on ? sel.filter((s) => s !== t.id) : [...sel, t.id])}
                    className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-text hover:bg-surface-2"
                    aria-pressed={on}
                  >
                    <span aria-hidden className="size-2 rounded-full" style={{ background: t.color }} />
                    <span className="flex-1 truncate">#{t.name}</span>
                    {on ? <Check className="size-4 text-accent" /> : null}
                  </button>
                </li>
              );
            })}
            {term && !exact ? (
              <li>
                <button
                  type="button"
                  disabled={pending}
                  onClick={create}
                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-accent-text hover:bg-surface-2"
                >
                  <Plus className="size-4" /> Crear #{term}
                </button>
              </li>
            ) : null}
            {!filtered.length && !term ? (
              <li className="px-2 py-3 text-[13px] text-text-faint">Todavía no hay etiquetas. Escribí un nombre para crear la primera.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type Conn = {
  linkId: string | null;
  type: string;
  id: string;
  title: string;
  href: string;
  kind: string;
  direction: "in" | "out" | "implicit";
  typeLabel: string;
  color: string;
};
type Hit = { type: string; id: string; title: string; subtitle: string | null };

/** "Conectado con": relaciones implícitas y enlaces manuales, con buscador para conectar cualquier elemento. */
export function ConnectionsEditor({ type, id, items }: { type: string; id: string; items: Conn[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const { pending, exec } = useAction();
  const inputId = useId();

  useEffect(() => {
    if (!open || q.trim().length < 2) return setHits([]);
    let alive = true;
    const t = setTimeout(async () => {
      const r = await searchEntitiesAction(q);
      if (alive) setHits(r.filter((h) => !(h.type === type && h.id === id)));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, type, id]);

  return (
    <div className="flex flex-col gap-2">
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((c) => (
            <li key={`${c.type}:${c.id}`} className="group flex items-center gap-1">
              <Link href={c.href} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 text-[14px] text-text hover:bg-surface-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                <span className="min-w-0 flex-1 truncate">{c.title || "(sin título)"}</span>
                <span className="font-mono text-[11px] text-text-faint">{c.typeLabel}</span>
                {c.direction === "in" ? <ArrowLeft className="size-3.5 text-text-faint" aria-label="Entrante" /> : null}
                {c.direction === "out" ? <ArrowRight className="size-3.5 text-text-faint" aria-label="Saliente" /> : null}
              </Link>
              {c.linkId && c.kind === "related" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    exec(() => removeLinkAction(c.linkId as string), { success: "Conexión quitada", undo: () => addLinkAction(type, id, c.type, c.id) })
                  }
                  className="grid size-10 shrink-0 place-items-center rounded-md text-text-faint hover:bg-surface-2 hover:text-text"
                  aria-label={`Desconectar ${c.title}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-text-faint">Sin conexiones. Conectá notas, clientes, sitios o lo que esté relacionado.</p>
      )}
      {open ? (
        <div className="rounded-lg border border-border bg-surface-2/50 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-text-faint" />
            <label htmlFor={inputId} className="sr-only">
              Buscar para conectar
            </label>
            <input
              id={inputId}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              placeholder="Buscar cliente, nota, proyecto…"
              className="h-10 w-full rounded-md border border-border bg-surface pr-3 pl-9 text-base text-text outline-none focus:border-accent md:text-sm"
            />
          </div>
          <ul className="mt-1 max-h-60 overflow-y-auto">
            {hits.map((h) => (
              <li key={`${h.type}:${h.id}`}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    exec(() => addLinkAction(type, id, h.type, h.id), {
                      success: "Conectado",
                      onDone: () => {
                        setQ("");
                        setOpen(false);
                      },
                    })
                  }
                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-text hover:bg-surface-2"
                >
                  <Link2 className="size-4 shrink-0 text-text-faint" />
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  {h.subtitle ? <span className="truncate font-mono text-[11px] text-text-faint">{h.subtitle}</span> : null}
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && !hits.length ? <li className="px-2 py-3 text-[13px] text-text-faint">Sin resultados.</li> : null}
          </ul>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Conectar
        </Button>
      )}
    </div>
  );
}

type CommentItem = { id: string; body: string; authorId: string | null; author: string; at: string };

/** Comentarios internos (nunca visibles para clientes). Ctrl+Enter envía. */
export function CommentThread({ type, id, me, isOwner, items }: { type: string; id: string; me: string; isOwner: boolean; items: CommentItem[] }) {
  const [body, setBody] = useState("");
  const { pending, exec } = useAction();
  const fieldId = useId();
  function send() {
    const text = body.trim();
    if (!text) return;
    exec(() => addCommentAction(type, id, text), { onDone: () => setBody("") });
  }
  return (
    <div className="flex flex-col gap-3">
      {items.length ? (
        <ol className="flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id} className="group rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
              <div className="mb-1 flex items-center gap-2 text-[12px] text-text-faint">
                <span className="font-medium text-text-muted">{c.author}</span>
                <span>·</span>
                <time dateTime={c.at}>{relativeFromDate(new Date(c.at))}</time>
                {c.authorId === me || isOwner ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirm("¿Borrar este comentario?") && exec(() => deleteCommentAction(c.id), { success: "Comentario borrado" })}
                    className="ml-auto grid size-8 place-items-center rounded-md hover:bg-surface-2 hover:text-text"
                    aria-label="Borrar comentario"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="text-[14px] whitespace-pre-wrap text-text">{c.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-text-faint">Sin comentarios. Son internos: nunca los ve un cliente.</p>
      )}
      <label htmlFor={fieldId} className="sr-only">
        Nuevo comentario
      </label>
      <Textarea
        id={fieldId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Escribí un comentario…"
        className="min-h-20 text-base md:text-sm"
      />
      <Button size="sm" variant="primary" className="self-end" loading={pending} disabled={!body.trim()} onClick={send}>
        Comentar
      </Button>
    </div>
  );
}
