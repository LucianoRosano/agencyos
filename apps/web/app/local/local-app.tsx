"use client";

import { formatDate, formatDayMonth, L, label, parseNaturalDate, relativeFromDate, todayAR } from "@agencyos/core";
import type { OClient, ONote, OProject, OTask } from "@agencyos/modules/offline/types";
import { Badge, Button, Card, cn, EmptyState, Input, Progress, Textarea } from "@agencyos/ui";
import {
  ArrowLeft,
  CheckSquare,
  CloudOff,
  FileText,
  FolderKanban,
  Inbox,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  captureLocal,
  createNoteLocal,
  createTaskLocal,
  dismissNotice,
  getAll,
  getMeta,
  pendingCount,
  saveNoteLocal,
  setTaskStatusLocal,
  syncNow,
} from "@/lib/offline/engine";
import type { Meta, Rows } from "@/lib/offline/store";

type Tab = "hoy" | "tareas" | "bandeja" | "notas" | "proyectos" | "clientes";
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "hoy", label: "Hoy", icon: <Sun className="size-4" /> },
  { key: "tareas", label: "Tareas", icon: <CheckSquare className="size-4" /> },
  { key: "bandeja", label: "Bandeja", icon: <Inbox className="size-4" /> },
  { key: "notas", label: "Notas", icon: <FileText className="size-4" /> },
  { key: "proyectos", label: "Proyectos", icon: <FolderKanban className="size-4" /> },
  { key: "clientes", label: "Clientes", icon: <Users className="size-4" /> },
];

type Data = {
  tasks: OTask[];
  notes: ONote[];
  inbox: Rows["inbox"][];
  projects: OProject[];
  clients: OClient[];
  meta: Meta;
  pending: number;
};
const EMPTY: Data = { tasks: [], notes: [], inbox: [], projects: [], clients: [], meta: {}, pending: 0 };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function LocalApp() {
  const [tab, setTab] = useState<Tab>("hoy");
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const online = useOnline();

  const load = useCallback(async () => {
    if (typeof indexedDB === "undefined") return setReady(true);
    const [tasks, notes, inbox, projects, clients, meta, pending] = await Promise.all([
      getAll("tasks"),
      getAll("notes"),
      getAll("inbox"),
      getAll("projects"),
      getAll("clients"),
      getMeta(),
      pendingCount(),
    ]);
    setData({ tasks, notes, inbox, projects, clients, meta, pending });
    setReady(true);
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("ver");
    if (t && TABS.some((x) => x.key === t)) setTab(t as Tab);
    void load();
    window.addEventListener("ag:offline", load);
    return () => window.removeEventListener("ag:offline", load);
  }, [load]);

  const sync = useCallback(async () => {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
    await load();
  }, [load]);

  useEffect(() => {
    if (online) void sync();
  }, [online, sync]);

  const hasCopy = Boolean(data.meta.lastSync);
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pt-4 pb-28 md:px-6 md:pt-8">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <p className="font-mono text-[13px] font-semibold tracking-[0.04em]">
          AGENCY<span className="bg-[image:var(--gradient)] bg-clip-text text-transparent">OS</span>
        </p>
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px]",
            online ? "border-success/40 text-success" : "border-warning/40 text-warning",
          )}
          role="status"
        >
          {online ? <Wifi className="size-3.5" aria-hidden /> : <CloudOff className="size-3.5" aria-hidden />}
          {online ? "Con conexión" : "Sin conexión"}
        </span>
        <span className="text-[12px] text-text-muted" data-testid="local-status">
          {data.pending ? `${data.pending} cambio${data.pending === 1 ? "" : "s"} por subir · ` : ""}
          {data.meta.lastSync ? `copia de ${relativeFromDate(new Date(data.meta.lastSync))}` : "sin copia guardada"}
        </span>
        <span className="ml-auto flex gap-2">
          {online ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void sync()} loading={syncing} className="h-10">
                <RefreshCw className="size-4" /> Sincronizar
              </Button>
              <Button asChild variant="secondary" size="sm" className="h-10">
                <a href="/hoy">
                  <ArrowLeft className="size-4" /> App completa
                </a>
              </Button>
            </>
          ) : null}
        </span>
      </header>

      {data.meta.authError ? (
        <Card className="mb-4 border-warning/40 p-4 text-[14px]">
          Tu sesión venció. Tus cambios siguen guardados en este dispositivo:{" "}
          <a href="/login" className="text-accent-text underline underline-offset-2">
            iniciá sesión
          </a>{" "}
          cuando tengas conexión y se suben solos.
        </Card>
      ) : null}
      {(data.meta.notices ?? []).map((n) => (
        <Card key={n.id} className={cn("mb-3 flex items-start gap-3 p-3 text-[14px]", n.tone === "danger" ? "border-danger/40" : "border-warning/40")}>
          <p className="flex-1">{n.message}</p>
          <button
            type="button"
            aria-label="Descartar aviso"
            onClick={() => void dismissNotice(n.id)}
            className="grid size-9 place-items-center text-text-muted"
          >
            <X className="size-4" />
          </button>
        </Card>
      ))}

      <nav aria-label="Secciones sin conexión" className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px]",
              tab === t.key ? "border-accent bg-accent-soft text-text" : "border-border text-text-muted",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <main id="contenido" className="flex-1">
        {!ready ? null : !hasCopy && !data.tasks.length ? (
          <Card className="p-2">
            <EmptyState
              icon={<CloudOff />}
              title="Todavía no hay una copia en este dispositivo"
              description="Abrí AGENCYOS una vez con conexión (con la sesión iniciada) y queda lista para usar sin internet."
            />
          </Card>
        ) : tab === "hoy" ? (
          <TodayView data={data} />
        ) : tab === "tareas" ? (
          <TasksView data={data} />
        ) : tab === "bandeja" ? (
          <InboxView data={data} />
        ) : tab === "notas" ? (
          <NotesView data={data} />
        ) : tab === "proyectos" ? (
          <ProjectsView data={data} />
        ) : (
          <ClientsView data={data} />
        )}
      </main>
    </div>
  );
}

// ---------- Tareas ----------

function NewTask({ defaultToday }: { defaultToday?: boolean }) {
  const [text, setText] = useState("");
  const nd = text.trim() ? parseNaturalDate(text) : null;
  return (
    <form
      className="mb-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        const r = parseNaturalDate(t);
        void createTaskLocal({ title: r.rest || t, dueDate: r.date ?? (defaultToday ? todayAR() : null), dueTime: r.time });
        setText("");
      }}
    >
      <label htmlFor="local-new-task" className="sr-only">
        Nueva tarea
      </label>
      <Input
        id="local-new-task"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={defaultToday ? "Nueva tarea para hoy (o «mañana 10hs»)" : "Nueva tarea («el viernes», «15/12»…)"}
        className="flex-1 text-base md:text-sm"
        aria-describedby="local-new-task-hint"
      />
      <Button type="submit" variant="primary" className="h-11 md:h-10">
        <Plus className="size-4" /> Agregar
      </Button>
      <span id="local-new-task-hint" className="sr-only">
        {nd?.date ? `Fecha detectada: ${formatDate(nd.date)}` : ""}
      </span>
    </form>
  );
}

function TaskItem({ t, project }: { t: OTask; project?: string }) {
  // Cambia al instante; la copia local y la cola se actualizan atrás.
  const [done, setDone] = useState(t.status === "done");
  useEffect(() => setDone(t.status === "done"), [t.status]);
  const overdue = !done && t.dueDate && t.dueDate < todayAR();
  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-border py-2 last:border-0">
      <input
        type="checkbox"
        checked={done}
        onChange={() => {
          setDone(!done);
          void setTaskStatusLocal(t.id, done ? "todo" : "done");
        }}
        aria-label={done ? `Reabrir «${t.title}»` : `Completar «${t.title}»`}
        className="size-5 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[15px]", done && "text-text-muted line-through")}>{t.title}</span>
        {project ? <span className="block truncate text-[12px] text-text-muted">{project}</span> : null}
      </span>
      {t.dueDate ? (
        <span className={cn("shrink-0 font-mono text-[12px]", overdue ? "text-danger" : "text-text-muted")}>
          {formatDayMonth(t.dueDate)}
          {t.dueTime ? ` ${t.dueTime.slice(0, 5)}` : ""}
        </span>
      ) : null}
    </li>
  );
}

function TaskList({ title, tasks, projects }: { title: string; tasks: OTask[]; projects: Map<string, string> }) {
  if (!tasks.length) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">
        {title} · {tasks.length}
      </h2>
      <Card className="px-4">
        <ul>
          {tasks.map((t) => (
            <TaskItem key={t.id} t={t} project={t.projectId ? projects.get(t.projectId) : undefined} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

const byDue = (a: OTask, b: OTask) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.priority - b.priority;

function TodayView({ data }: { data: Data }) {
  const today = todayAR();
  const projects = useMemo(() => new Map(data.projects.map((p) => [p.id, p.name])), [data.projects]);
  const top = data.tasks.filter((t) => !t.parentTaskId);
  const overdue = top.filter((t) => t.status !== "done" && t.status !== "cancelled" && t.dueDate && t.dueDate < today).sort(byDue);
  const forToday = top.filter((t) => t.dueDate === today && t.status !== "cancelled").sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
  return (
    <>
      <NewTask defaultToday />
      {!overdue.length && !forToday.length ? (
        <Card className="p-2">
          <EmptyState compact icon={<Sun />} title="Nada para hoy" description="Agregá una tarea arriba o revisá las próximas en Tareas." />
        </Card>
      ) : null}
      <TaskList title="Vencidas" tasks={overdue} projects={projects} />
      <TaskList title="Hoy" tasks={forToday} projects={projects} />
    </>
  );
}

function TasksView({ data }: { data: Data }) {
  const today = todayAR();
  const projects = useMemo(() => new Map(data.projects.map((p) => [p.id, p.name])), [data.projects]);
  const open = data.tasks.filter((t) => !t.parentTaskId && (t.status === "todo" || t.status === "doing" || t.status === "waiting")).sort(byDue);
  const done = data.tasks
    .filter((t) => !t.parentTaskId && t.status === "done")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
  return (
    <>
      <NewTask />
      <TaskList title="Vencidas" tasks={open.filter((t) => t.dueDate && t.dueDate < today)} projects={projects} />
      <TaskList title="Hoy" tasks={open.filter((t) => t.dueDate === today)} projects={projects} />
      <TaskList title="Próximas" tasks={open.filter((t) => t.dueDate && t.dueDate > today)} projects={projects} />
      <TaskList title="Sin fecha" tasks={open.filter((t) => !t.dueDate)} projects={projects} />
      <TaskList title="Completadas" tasks={done} projects={projects} />
      {!open.length && !done.length ? (
        <Card className="p-2">
          <EmptyState compact icon={<CheckSquare />} title="Sin tareas en la copia" />
        </Card>
      ) : null}
    </>
  );
}

// ---------- Bandeja ----------

function InboxView({ data }: { data: Data }) {
  const [text, setText] = useState("");
  const items = [...data.inbox].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <form
        className="mb-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void captureLocal(text.trim());
          setText("");
        }}
      >
        <label htmlFor="local-capture" className="text-[13px] font-medium text-text-muted">
          Capturar
        </label>
        <Textarea
          id="local-capture"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Una tarea, una idea, un gasto, un link…"
          className="min-h-24 text-base md:text-sm"
        />
        <Button type="submit" variant="primary" className="h-11 self-end md:h-10">
          Guardar en la Bandeja
        </Button>
      </form>
      {items.length ? (
        <Card className="px-4">
          <ul>
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 border-b border-border py-3 last:border-0">
                <span className="flex-1 whitespace-pre-wrap text-[15px]">{i.text}</span>
                {i.pending ? (
                  <Badge tone="warning">por subir</Badge>
                ) : (
                  <span className="font-mono text-[12px] text-text-muted">{formatDayMonth(i.createdAt.slice(0, 10))}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-2">
          <EmptyState compact icon={<Inbox />} title="Bandeja vacía" />
        </Card>
      )}
      <p className="mt-3 text-[13px] text-text-muted">Lo procesás (tarea, nota, gasto…) desde la app completa cuando tengas conexión.</p>
    </>
  );
}

// ---------- Notas ----------

function NotesView({ data }: { data: Data }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const note = open ? data.notes.find((n) => n.id === open) : undefined;
  if (note) return <NoteEditor note={note} onBack={() => setOpen(null)} />;
  const list = data.notes
    .filter((n) => !q.trim() || norm(`${n.title} ${n.bodyMd}`).includes(norm(q.trim())))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className="mb-3 flex gap-2">
        <label htmlFor="local-note-q" className="sr-only">
          Buscar en las notas
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <Input id="local-note-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en las notas" className="pl-9 text-base md:text-sm" />
        </div>
      </div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const t = newTitle.trim();
          if (!t) return;
          const id = await createNoteLocal(t);
          setNewTitle("");
          setOpen(id);
        }}
      >
        <label htmlFor="local-note-new" className="sr-only">
          Título de la nota nueva
        </label>
        <Input
          id="local-note-new"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Título de una nota nueva"
          className="flex-1 text-base md:text-sm"
        />
        <Button type="submit" variant="secondary" className="h-11 md:h-10">
          <Plus className="size-4" /> Nota
        </Button>
      </form>
      {list.length ? (
        <Card className="px-2">
          <ul>
            {list.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <button type="button" onClick={() => setOpen(n.id)} className="flex min-h-12 w-full flex-col items-start px-2 py-2.5 text-left">
                  <span className="text-[15px] text-text">{n.title}</span>
                  <span className="line-clamp-1 text-[13px] text-text-muted">
                    {n.bodyMd
                      .replace(/^---[\s\S]*?---/, "")
                      .replace(/[#*_>`[\]]+|^\s*-\s/gm, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 140) || "Vacía"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-2">
          <EmptyState compact icon={<FileText />} title={q ? "Sin resultados" : "Sin notas en la copia"} />
        </Card>
      )}
    </>
  );
}

function NoteEditor({ note, onBack }: { note: ONote; onBack: () => void }) {
  const [body, setBody] = useState(note.bodyMd);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(body);
  latest.current = body;
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    void saveNoteLocal(note.id, latest.current).then(() => setSaved(true));
  }, [note.id]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="h-11 md:h-10"
          onClick={() => {
            if (!saved) flush();
            onBack();
          }}
        >
          <ArrowLeft className="size-4" /> Notas
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-medium">{note.title}</h2>
        <span className="text-[12px] text-text-muted" role="status">
          {saved ? "Guardado en el dispositivo" : "Escribiendo…"}
        </span>
      </div>
      {note.truncated ? (
        <Card className="p-4 text-[14px] text-text-muted">Esta nota es muy larga para editarla sin conexión: abrila en la app completa.</Card>
      ) : null}
      <label htmlFor="local-note-body" className="sr-only">
        Texto de la nota
      </label>
      <Textarea
        id="local-note-body"
        value={body}
        readOnly={note.truncated}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, 800);
        }}
        onBlur={() => {
          if (!saved) flush();
        }}
        className="min-h-[60dvh] font-mono text-base leading-relaxed md:text-sm"
      />
    </div>
  );
}

// ---------- Proyectos y clientes (consulta) ----------

function ProjectsView({ data }: { data: Data }) {
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const list = data.projects
    .filter((p) => p.status !== "done")
    .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || a.name.localeCompare(b.name));
  if (!list.length)
    return (
      <Card className="p-2">
        <EmptyState compact icon={<FolderKanban />} title="Sin proyectos activos en la copia" />
      </Card>
    );
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {list.map((p) => (
        <li key={p.id}>
          <Card className="flex h-full flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[15px] font-medium">{p.name}</p>
              <Badge>{label(L.projectStatus, p.status)}</Badge>
            </div>
            {p.clientId && clients.get(p.clientId) ? <p className="text-[13px] text-text-muted">{clients.get(p.clientId)}</p> : null}
            {p.nextAction ? <p className="text-[14px]">Siguiente: {p.nextAction}</p> : null}
            <Progress value={p.progress} label={`Avance de ${p.name}`} className="mt-auto" />
            {p.targetDate ? <p className="text-[12px] text-text-muted">Objetivo: {formatDate(p.targetDate)}</p> : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ClientsView({ data }: { data: Data }) {
  const [q, setQ] = useState("");
  const list = data.clients
    .filter((c) => c.status !== "archived" && (!q.trim() || norm(`${c.name} ${c.contactName ?? ""} ${c.city ?? ""}`).includes(norm(q.trim()))))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <label htmlFor="local-client-q" className="sr-only">
        Buscar clientes
      </label>
      <Input id="local-client-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar clientes" className="mb-3 text-base md:text-sm" />
      {list.length ? (
        <Card className="px-4">
          <ul>
            {list.map((c) => {
              const wa = c.phone ? c.phone.replace(/\D/g, "") : "";
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 last:border-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{c.name}</span>
                    <span className="block truncate text-[12px] text-text-muted">
                      {[c.contactName, c.city, label(L.clientStatus, c.status)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    {c.phone ? (
                      <>
                        <a
                          href={`tel:${c.phone}`}
                          aria-label={`Llamar a ${c.name}`}
                          className="grid size-11 place-items-center rounded-lg text-text-muted hover:text-text"
                        >
                          <Phone className="size-4" />
                        </a>
                        <a
                          href={`https://wa.me/${wa.startsWith("54") ? wa : `54${wa}`}`}
                          aria-label={`WhatsApp a ${c.name}`}
                          className="grid size-11 place-items-center rounded-lg text-text-muted hover:text-text"
                        >
                          <MessageCircle className="size-4" />
                        </a>
                      </>
                    ) : null}
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        aria-label={`Escribir a ${c.name}`}
                        className="grid size-11 place-items-center rounded-lg text-text-muted hover:text-text"
                      >
                        <Mail className="size-4" />
                      </a>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card className="p-2">
          <EmptyState compact icon={<Users />} title={q ? "Sin resultados" : "Sin clientes en la copia"} />
        </Card>
      )}
    </>
  );
}
