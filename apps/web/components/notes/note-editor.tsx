"use client";

import { Button, cn, Sheet, Skeleton } from "@agencyos/ui";
import { AlertCircle, Check, Columns2, Eye, History, Loader2, PenLine, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createLinkedNoteAction, notePreviewAction, noteVersionsAction, restoreVersionAction, saveNoteAction } from "@/app/(app)/notas/actions";
import { NotePreviewPane } from "./note-preview";
import "./notes.css";

const MarkdownEditor = dynamic(() => import("./markdown-editor"), {
  ssr: false,
  loading: () => (
    <div role="status" className="flex flex-col gap-3 pt-3" aria-busy="true" aria-label="Cargando editor">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  ),
});

type Status = "saved" | "dirty" | "saving" | "error";
type Mode = "edit" | "split" | "view";

export type NoteEditorProps = {
  note: { id: string; title: string; bodyMd: string; spaceId: string | null; folderPath: string | null; updatedAt: number; wordCount: number };
  initialPreview: { html: string; frontmatter: Record<string, unknown> };
};

const SAVE_DELAY = 1000;

export function NoteEditor({ note, initialPreview }: NoteEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("saved");
  const [preview, setPreview] = useState(initialPreview);
  const [words, setWords] = useState(note.wordCount);
  const [mode, setMode] = useState<Mode>("split");
  const [tab, setTab] = useState<"edit" | "view">("edit");
  const [replace, setReplace] = useState<{ text: string; nonce: number } | null>(null);
  const latest = useRef({ title: note.title, body: note.bodyMd });
  const saved = useRef({ title: note.title, body: note.bodyMd });
  const badTitle = useRef<string | null>(null);
  const linkSig = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    try {
      const m = localStorage.getItem("ag-note-mode");
      if (m === "edit" || m === "split" || m === "view") setMode(m);
    } catch {}
  }, []);
  const changeMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem("ag-note-mode", m);
    } catch {}
  };

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    const cur = latest.current;
    const patch: { title?: string; bodyMd?: string } = {};
    if (cur.body !== saved.current.body) patch.bodyMd = cur.body;
    const t = cur.title.trim();
    if (t && t !== saved.current.title && t !== badTitle.current) patch.title = t;
    if (patch.bodyMd === undefined && !patch.title) {
      setStatus((s) => (s === "error" ? s : "saved"));
      return;
    }
    setStatus("saving");
    const run = (async () => {
      let r = await saveNoteAction(note.id, patch);
      if (!r.ok && r.error.fields?.title) {
        badTitle.current = patch.title ?? null;
        setTitleError(r.error.fields.title);
        if (patch.bodyMd !== undefined) r = await saveNoteAction(note.id, { bodyMd: patch.bodyMd });
        else {
          setStatus("saved");
          return;
        }
      }
      if (!r.ok) {
        setStatus("error");
        toast.error(r.error.message);
        return;
      }
      const titleChanged = r.data.title !== saved.current.title;
      saved.current = { title: r.data.title, body: patch.bodyMd ?? saved.current.body };
      if (patch.title && r.data.title === patch.title) setTitleError(null);
      setPreview({ html: r.data.html, frontmatter: r.data.frontmatter });
      setWords(r.data.wordCount);
      if (titleChanged || (r.data.linkSig && linkSig.current !== null && r.data.linkSig !== linkSig.current)) router.refresh();
      if (r.data.linkSig) linkSig.current = r.data.linkSig;
      const pending = latest.current.body !== saved.current.body || (latest.current.title.trim() !== saved.current.title && latest.current.title.trim() !== badTitle.current && latest.current.title.trim() !== "");
      setStatus(pending ? "dirty" : "saved");
      if (pending) timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
  }, [note.id, router]);

  const schedule = useCallback(() => {
    setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  }, [flush]);

  // Guardar al salir de la página (navegación interna) y avisar si se cierra con cambios.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (latest.current.body !== saved.current.body || latest.current.title.trim() !== saved.current.title) {
        void flush();
        e.preventDefault();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("keydown", onKey);
      void flush();
    };
  }, [flush]);

  const onBody = useCallback(
    (v: string) => {
      latest.current = { ...latest.current, body: v };
      schedule();
    },
    [schedule],
  );

  async function createFromLink(t: string) {
    const r = await createLinkedNoteAction(t, { spaceId: note.spaceId, folderPath: note.folderPath });
    if (!r.ok) {
      toast.error(r.error.message);
      return;
    }
    await flush();
    const p = await notePreviewAction(note.id);
    if (p.ok) setPreview({ html: p.data.html, frontmatter: p.data.frontmatter });
    router.refresh();
    toast.success(`Nota «${r.data.title}» creada`, { action: { label: "Abrir", onClick: () => router.push(`/notas/${r.data.id}`) } });
  }

  const showEditor = cn(tab === "edit" ? "block" : "hidden", mode === "view" ? "md:hidden" : "md:block");
  const showPreview = cn(tab === "view" ? "block" : "hidden", mode === "edit" ? "md:hidden" : "md:block");

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <label htmlFor="note-title" className="sr-only">
          Título de la nota
        </label>
        <input
          id="note-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            latest.current = { ...latest.current, title: e.target.value };
            if (!e.target.value.trim()) setTitleError("El título es obligatorio");
            else if (titleError && e.target.value.trim() !== badTitle.current) setTitleError(null);
            schedule();
          }}
          onBlur={() => void flush()}
          maxLength={200}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "note-title-error" : undefined}
          className="w-full rounded-md bg-transparent text-[26px] font-semibold tracking-tight text-text outline-none placeholder:text-text-faint focus-visible:outline-none md:text-[32px]"
          placeholder="Título"
        />
        {titleError ? (
          <p id="note-title-error" role="alert" className="mt-1 text-[13px] text-danger">
            {titleError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <div role="tablist" aria-label="Vista" className="flex rounded-[var(--radius-control)] border border-border bg-bg-elevated p-0.5 md:hidden">
          {(["edit", "view"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k);
                if (k === "view") void flush();
              }}
              className={cn("flex h-10 items-center gap-1.5 rounded-[6px] px-4 text-sm", tab === k ? "bg-surface-2 text-text" : "text-text-muted")}
            >
              {k === "edit" ? <PenLine className="size-4" /> : <Eye className="size-4" />}
              {k === "edit" ? "Editar" : "Ver"}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Disposición" className="hidden rounded-[var(--radius-control)] border border-border bg-bg-elevated p-0.5 md:flex">
          {([
            ["edit", "Editor", <PenLine key="e" className="size-3.5" />],
            ["split", "Dividido", <Columns2 key="s" className="size-3.5" />],
            ["view", "Vista", <Eye key="v" className="size-3.5" />],
          ] as const).map(([k, l, icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mode === k}
              onClick={() => changeMode(k)}
              className={cn("flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[13px]", mode === k ? "bg-surface-2 text-text" : "text-text-muted hover:text-text")}
            >
              {icon}
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <SaveStatus status={status} words={words} onRetry={() => void flush()} />
          <VersionsSheet
            noteId={note.id}
            beforeOpen={flush}
            onRestored={(body) => {
              latest.current = { ...latest.current, body };
              saved.current = { ...saved.current, body };
              setReplace({ text: body, nonce: Date.now() });
              void notePreviewAction(note.id).then((p) => p.ok && setPreview({ html: p.data.html, frontmatter: p.data.frontmatter }));
              router.refresh();
            }}
          />
        </div>
      </div>

      <div className={cn("grid min-w-0 gap-6", mode === "split" ? "md:grid-cols-2" : "md:grid-cols-1")}>
        <section aria-label="Editor" className={cn("min-w-0", showEditor)}>
          <MarkdownEditor value={note.bodyMd} replace={replace} onChange={onBody} onBlur={() => void flush()} />
        </section>
        <section aria-label="Vista previa" className={cn("min-w-0 md:border-l md:border-border md:pl-6", mode !== "split" && "md:border-l-0 md:pl-0", showPreview)}>
          <NotePreviewPane html={preview.html} frontmatter={preview.frontmatter} onCreate={createFromLink} />
        </section>
      </div>
    </div>
  );
}

function SaveStatus({ status, words, onRetry }: { status: Status; words: number; onRetry: () => void }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[12px] text-text-muted" aria-live="polite">
      <span className="hidden sm:inline">{words.toLocaleString("es-AR")} palabras ·</span>
      {status === "saved" ? (
        <span className="flex items-center gap-1 text-success" data-testid="save-status">
          <Check className="size-3.5" /> Guardado
        </span>
      ) : status === "saving" ? (
        <span className="flex items-center gap-1" data-testid="save-status">
          <Loader2 className="size-3.5 animate-spin" /> Guardando…
        </span>
      ) : status === "dirty" ? (
        <span data-testid="save-status">Sin guardar</span>
      ) : (
        <button type="button" onClick={onRetry} className="flex h-8 items-center gap-1 rounded-md px-2 text-danger hover:bg-danger-soft" data-testid="save-status">
          <AlertCircle className="size-3.5" /> Error · Reintentar
        </button>
      )}
    </span>
  );
}

type Version = { id: string; title: string; bodyMd: string; createdAt: number };

function VersionsSheet({ noteId, beforeOpen, onRestored }: { noteId: string; beforeOpen: () => Promise<void>; onRestored: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [sel, setSel] = useState<Version | null>(null);
  const [busy, setBusy] = useState(false);
  const fmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Buenos_Aires" });
  return (
    <Sheet
      open={open}
      onOpenChange={async (o) => {
        setOpen(o);
        if (o) {
          setVersions(null);
          setSel(null);
          await beforeOpen();
          setVersions(await noteVersionsAction(noteId));
        }
      }}
      title="Historial de versiones"
      description="Se guarda una versión como mucho cada 5 minutos de edición."
      wide
      trigger={
        <Button variant="ghost" size="sm" className="h-10 md:h-8" aria-label="Historial de versiones">
          <History className="size-4" />
          <span className="hidden lg:inline">Historial</span>
        </Button>
      }
    >
      {versions === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : versions.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-text-muted">Todavía no hay versiones guardadas. Aparecen a medida que editás.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSel(v)}
                  aria-pressed={sel?.id === v.id}
                  className={cn("flex min-h-11 w-full flex-col items-start rounded-md px-3 py-1.5 text-left text-[13px]", sel?.id === v.id ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2")}
                >
                  <span className="font-mono">{fmt.format(v.createdAt)}</span>
                  <span className="truncate text-[12px] text-text-faint">{v.bodyMd.slice(0, 60) || "(vacía)"}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">
            {sel ? (
              <>
                <pre className="max-h-[42vh] overflow-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-[13px] whitespace-pre-wrap text-text">{sel.bodyMd || "(vacía)"}</pre>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      const r = await restoreVersionAction(sel.id);
                      setBusy(false);
                      if (!r.ok) {
                        toast.error(r.error.message);
                        return;
                      }
                      toast.success("Versión restaurada. La anterior quedó en el historial.");
                      onRestored(sel.bodyMd);
                      setOpen(false);
                    }}
                  >
                    <RotateCcw className="size-4" /> Restaurar esta versión
                  </Button>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-[14px] text-text-muted">Elegí una versión para verla.</p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
