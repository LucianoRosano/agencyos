/**
 * Motor de sincronización del modo sin conexión: primero sube la cola de cambios y después baja lo nuevo.
 * Un solo proceso a la vez entre pestañas (Web Locks). Avisa los cambios con el evento `ag:offline`.
 */
import type { OfflineSnapshot, PushResult } from "@agencyos/modules/offline/types";
import { getAll, getMeta, getOne, type Notice, putMany, type QueuedMutation, queueAll, queuePut, removeOne, setMeta, wipe } from "./store";

export const OFFLINE_PREF = "agencyos:offline";
const FULL_EVERY_MS = 24 * 60 * 60 * 1000;
const DONE_KEEP_MS = 14 * 24 * 60 * 60 * 1000;

export const offlineEnabled = () => {
  try {
    return localStorage.getItem(OFFLINE_PREF) !== "off";
  } catch {
    return false;
  }
};

const emit = () => window.dispatchEvent(new Event("ag:offline"));
const uuid = () => crypto.randomUUID();

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return fn();
  return locks.request("agencyos-sync", { ifAvailable: true }, async (lock) => (lock ? fn() : null));
}

async function addNotices(list: Omit<Notice, "id" | "at">[]) {
  if (!list.length) return;
  const meta = await getMeta();
  const now = new Date().toISOString();
  const notices = [...list.map((n) => ({ ...n, id: uuid(), at: now })), ...(meta.notices ?? [])].slice(0, 30);
  await setMeta({ notices });
}

export async function dismissNotice(id: string) {
  const meta = await getMeta();
  await setMeta({ notices: (meta.notices ?? []).filter((n) => n.id !== id) });
  emit();
}

/** Sube la cola. Devuelve false si no hay conexión o la sesión no es válida. */
async function push(): Promise<boolean> {
  const queue = await queueAll();
  for (let i = 0; i < queue.length; i += 100) {
    const batch = queue.slice(i, i + 100);
    const res = await fetch("/api/sync", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mutations: batch.map(({ seq: _s, at: _a, ...m }) => m) }),
    });
    if (res.status === 401) {
      await setMeta({ authError: true });
      return false;
    }
    if (!res.ok) return false;
    const { results } = (await res.json()) as { results: PushResult[] };
    const notices: Omit<Notice, "id" | "at">[] = [];
    for (const r of results) {
      if (r.status === "retry") continue;
      await removeOne("queue", r.id);
      if (r.status === "conflict" && r.message) notices.push({ tone: "warning", message: r.message });
      if (r.status === "rejected") notices.push({ tone: "danger", message: `No se pudo aplicar un cambio: ${r.message ?? "rechazado"}` });
    }
    await addNotices(notices);
  }
  return true;
}

/** Baja la copia: completa la primera vez y una vez por día; si no, solo lo cambiado. */
async function pull(force = false) {
  const meta = await getMeta();
  const full = force || !meta.since || !meta.lastFull || Date.now() - Date.parse(meta.lastFull) > FULL_EVERY_MS;
  const res = await fetch(`/api/sync${full ? "" : `?desde=${encodeURIComponent(meta.since ?? "")}`}`, { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    await setMeta({ authError: true });
    return false;
  }
  if (!res.ok) return false;
  const snap = (await res.json()) as OfflineSnapshot & { user: { id: string; workspaceId: string; name: string } };
  // Otra persona u otro espacio de trabajo en este dispositivo: nada de lo anterior se mezcla.
  if ((meta.userId && meta.userId !== snap.user.id) || (meta.workspaceId && meta.workspaceId !== snap.user.workspaceId)) {
    await wipe();
    return pull(true);
  }
  const clear = snap.full;
  await putMany("tasks", snap.tasks, { clear, remove: snap.removed.task });
  await putMany("notes", snap.notes, { clear, remove: snap.removed.note });
  await putMany("inbox", snap.inbox, { clear, remove: snap.removed.inbox });
  await putMany("projects", snap.projects, { clear, remove: snap.removed.project });
  await putMany("clients", snap.clients, { clear, remove: snap.removed.client });
  await putMany("spaces", snap.spaces, { clear: true });
  // Capturas hechas sin conexión que ya subieron: el servidor las devuelve con su id definitivo.
  const queued = new Set((await queueAll()).map((q) => q.id));
  const synced = (await getAll("inbox")).filter((i) => i.pending && !queued.has(i.id));
  if (synced.length) await putMany("inbox", [], { remove: synced.map((i) => i.id) });
  if (!clear) {
    const old = (await getAll("tasks")).filter((t) => (t.status === "done" || t.status === "cancelled") && Date.now() - Date.parse(t.updatedAt) > DONE_KEEP_MS);
    if (old.length) await putMany("tasks", [], { remove: old.map((t) => t.id) });
  }
  const now = new Date().toISOString();
  // margen de 5 s para cambios que se cruzan con la lectura
  const since = new Date(Date.parse(snap.serverTime) - 5000).toISOString();
  await setMeta({
    userId: snap.user.id,
    workspaceId: snap.user.workspaceId,
    userName: snap.user.name,
    since,
    lastSync: now,
    authError: false,
    ...(snap.full ? { lastFull: now } : {}),
  });
  return true;
}

let running: Promise<boolean> | null = null;

/** Subir la cola y bajar lo nuevo. Sin conexión no hace nada. */
export function syncNow(opts: { full?: boolean } = {}): Promise<boolean> {
  if (!navigator.onLine || !offlineEnabled()) return Promise.resolve(false);
  if (running) return running;
  running = (async () => {
    try {
      const r = await withLock(async () => (await push()) && (await pull(opts.full)));
      return Boolean(r);
    } catch {
      return false;
    } finally {
      running = null;
      emit();
    }
  })();
  return running;
}

// ---------- Cambios locales (se ven al instante y quedan en la cola) ----------

async function enqueue(m: Omit<QueuedMutation, "seq" | "at" | "id"> & { id?: string }) {
  const meta = await getMeta();
  const seq = (meta.seq ?? 0) + 1;
  await setMeta({ seq });
  await queuePut({ id: m.id ?? uuid(), seq, at: new Date().toISOString(), ...m });
  emit();
  if (navigator.onLine) void syncNow();
}

export async function createTaskLocal(data: { title: string; dueDate?: string | null; dueTime?: string | null; priority?: number }) {
  const id = uuid();
  const spaces = await getAll("spaces");
  await putMany("tasks", [
    {
      id,
      title: data.title,
      status: "todo",
      priority: data.priority ?? 3,
      dueDate: data.dueDate ?? null,
      dueTime: data.dueTime ?? null,
      projectId: null,
      spaceId: spaces[0]?.id ?? "",
      parentTaskId: null,
      estimateMinutes: null,
      description: null,
      updatedAt: new Date().toISOString(),
    },
  ]);
  const payload: Record<string, unknown> = { title: data.title };
  if (data.dueDate) payload.dueDate = data.dueDate;
  if (data.dueTime) payload.dueTime = data.dueTime;
  if (data.priority) payload.priority = data.priority;
  await enqueue({ type: "task.create", entityId: id, data: payload });
  return id;
}

export async function setTaskStatusLocal(id: string, status: "todo" | "done") {
  const t = await getOne("tasks", id);
  if (t) await putMany("tasks", [{ ...t, status, updatedAt: new Date().toISOString() }]);
  await enqueue({ type: "task.status", entityId: id, data: { status } });
}

export async function captureLocal(text: string) {
  const id = uuid();
  const now = new Date().toISOString();
  await putMany("inbox", [{ id, text, suggestedType: null, createdAt: now, updatedAt: now, pending: true }]);
  await enqueue({ id, type: "inbox.capture", data: { text } });
}

export async function createNoteLocal(title: string, bodyMd = "") {
  const id = uuid();
  await putMany("notes", [{ id, title, folderPath: null, pinned: false, bodyMd, truncated: false, updatedAt: new Date().toISOString() }]);
  await enqueue({ type: "note.create", entityId: id, data: { title, bodyMd } });
  return id;
}

/**
 * Guardar el cuerpo de una nota. Varias ediciones seguidas se juntan en un solo cambio que conserva la versión
 * de partida (`base`): así el servidor detecta si la nota cambió en otro dispositivo mientras tanto.
 */
export async function saveNoteLocal(id: string, bodyMd: string) {
  const n = await getOne("notes", id);
  if (!n || n.truncated) return;
  const queue = await queueAll();
  const pendingCreate = queue.find((q) => q.type === "note.create" && q.entityId === id);
  const pendingUpdate = queue.find((q) => q.type === "note.update" && q.entityId === id);
  await putMany("notes", [{ ...n, bodyMd }]);
  if (pendingCreate) {
    await queuePut({ ...pendingCreate, data: { ...pendingCreate.data, bodyMd } });
    emit();
  } else if (pendingUpdate) {
    await queuePut({ ...pendingUpdate, data: { ...pendingUpdate.data, bodyMd } });
    emit();
  } else await enqueue({ type: "note.update", entityId: id, base: n.updatedAt, data: { bodyMd } });
}

export async function pendingCount() {
  return (await queueAll()).length;
}

/** Arranque automático en la app: al abrir, al volver la conexión, al volver a la pestaña y cada 5 minutos. */
export function startAutoSync() {
  if (!offlineEnabled()) return () => undefined;
  const tick = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };
  tick();
  window.addEventListener("online", tick);
  document.addEventListener("visibilitychange", onVisible);
  const iv = window.setInterval(tick, 5 * 60 * 1000);
  return () => {
    window.removeEventListener("online", tick);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(iv);
  };
}

export { getAll, getMeta, wipe };
