/**
 * Copia local para usar AGENCYOS sin conexión (IndexedDB, sin dependencias). Una base por dispositivo y navegador;
 * se borra al cerrar sesión o al cambiar de usuario/espacio de trabajo.
 */
import type { OClient, OInbox, ONote, OProject, OSpace, OTask } from "@agencyos/modules/offline/types";

export const DB_NAME = "agencyos-offline";
const VERSION = 1;
export const STORES = ["meta", "tasks", "notes", "inbox", "projects", "clients", "spaces", "queue"] as const;
export type StoreName = (typeof STORES)[number];

export type QueuedMutation = {
  id: string;
  seq: number;
  type: string;
  entityId?: string;
  base?: string;
  data: Record<string, unknown>;
  at: string;
};
export type Notice = { id: string; at: string; tone: "warning" | "danger"; message: string };
export type Meta = {
  userId?: string;
  workspaceId?: string;
  userName?: string;
  since?: string;
  lastFull?: string;
  lastSync?: string;
  authError?: boolean;
  notices?: Notice[];
  seq?: number;
};
export type Rows = { tasks: OTask; notes: ONote; inbox: OInbox & { pending?: boolean }; projects: OProject; clients: OClient; spaces: OSpace };

let dbp: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === "meta" ? undefined : "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // otra pestaña con una versión nueva: cerrar y reabrir
      db.onversionchange = () => {
        db.close();
        dbp = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbp = null;
      reject(req.error);
    };
  });
  return dbp;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function getAll<K extends keyof Rows>(store: K): Promise<Rows[K][]> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).getAll()) as Promise<Rows[K][]>;
}

export async function getOne<K extends keyof Rows>(store: K, id: string): Promise<Rows[K] | undefined> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).get(id)) as Promise<Rows[K] | undefined>;
}

export async function putMany<K extends keyof Rows>(store: K, rows: Rows[K][], opts: { clear?: boolean; remove?: string[] } = {}) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  if (opts.clear) os.clear();
  for (const r of rows) os.put(r);
  for (const id of opts.remove ?? []) os.delete(id);
  await done(tx);
}

export async function removeOne(store: StoreName, id: string) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await done(tx);
}

export async function getMeta(): Promise<Meta> {
  const db = await openDb();
  return ((await result(db.transaction("meta").objectStore("meta").get("meta"))) as Meta | undefined) ?? {};
}

export async function setMeta(patch: Partial<Meta>) {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  const os = tx.objectStore("meta");
  const cur = ((await result(os.get("meta"))) as Meta | undefined) ?? {};
  os.put({ ...cur, ...patch }, "meta");
  await done(tx);
}

export async function queueAll(): Promise<QueuedMutation[]> {
  const db = await openDb();
  const rows = (await result(db.transaction("queue").objectStore("queue").getAll())) as QueuedMutation[];
  return rows.sort((a, b) => a.seq - b.seq);
}

export async function queuePut(m: QueuedMutation) {
  const db = await openDb();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").put(m);
  await done(tx);
}

/** Borra todo lo guardado en este dispositivo (cerrar sesión, cambio de usuario o «Borrar la copia»). */
export async function wipe() {
  const db = await openDb();
  const tx = db.transaction([...STORES], "readwrite");
  for (const s of STORES) tx.objectStore(s).clear();
  await done(tx);
}

export const offlineSupported = () => typeof indexedDB !== "undefined";
