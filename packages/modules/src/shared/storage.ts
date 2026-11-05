import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Almacenamiento de archivos detrás de una interfaz (disco local en la v1; S3/R2 después). */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Clave de almacenamiento inválida");
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root))) throw new Error("Clave fuera del almacenamiento");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data, { mode: 0o640 });
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
  async exists(key: string) {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

let instance: StorageAdapter | null = null;
/** Directorio: FILES_DIR (producción: /data/files, volumen de Docker fuera del webroot). */
export function getStorage(): StorageAdapter {
  if (!instance) instance = new LocalDiskStorage(process.env.FILES_DIR ?? path.resolve(process.cwd(), ".data/files"));
  return instance;
}

/** Clave nueva: <workspace>/<aaaa>/<mm>/<aleatorio>. */
export function newStorageKey(workspaceId: string, ext = "bin") {
  const d = new Date();
  const safeExt =
    ext
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 8)
      .toLowerCase() || "bin";
  return `${workspaceId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomBytes(16).toString("hex")}.${safeExt}`;
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
