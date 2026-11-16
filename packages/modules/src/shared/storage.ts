import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** Almacenamiento de archivos detrás de una interfaz: disco local (default) o S3-compatible (STORAGE_DRIVER=s3). */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    assertStorageKey(key);
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

/** Valida claves de almacenamiento (mismo formato para disco y S3). */
export function assertStorageKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("Clave de almacenamiento inválida");
}

export type S3Config = {
  endpoint?: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Prefijo dentro del bucket (p. ej. "agencyos/prod"). */
  prefix?: string;
  /** Direccionamiento por ruta (MinIO y la mayoría de los compatibles). Default: true si hay endpoint. */
  forcePathStyle?: boolean;
};

/**
 * Almacenamiento S3-compatible (AWS S3, Cloudflare R2, Backblaze B2, MinIO) — docs/DEPLOYMENT.md §Almacenamiento.
 * El SDK se carga de forma diferida (solo servidor, solo si STORAGE_DRIVER=s3). Las descargas siguen pasando por la
 * ruta autenticada de la app (sesión + URL firmada + headers de seguridad): el bucket es privado y no se exponen URLs
 * del proveedor (ADR 0011).
 */
export class S3Storage implements StorageAdapter {
  // biome-ignore lint/suspicious/noExplicitAny: el tipo del cliente se carga de forma diferida.
  private client: Promise<{ c: any; m: typeof import("@aws-sdk/client-s3") }> | null = null;
  constructor(private readonly cfg: S3Config) {}

  private sdk() {
    if (!this.client) {
      this.client = import("@aws-sdk/client-s3").then((m) => ({
        m,
        c: new m.S3Client({
          region: this.cfg.region,
          endpoint: this.cfg.endpoint,
          forcePathStyle: this.cfg.forcePathStyle ?? Boolean(this.cfg.endpoint),
          credentials: { accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey },
          // Compatibilidad con R2/B2/MinIO: checksums solo cuando la operación los exige.
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
          maxAttempts: 3,
        }),
      }));
    }
    return this.client;
  }
  private k(key: string) {
    assertStorageKey(key);
    return this.cfg.prefix ? `${this.cfg.prefix.replace(/\/+$/, "")}/${key}` : key;
  }
  async put(key: string, data: Buffer) {
    const { c, m } = await this.sdk();
    await c.send(new m.PutObjectCommand({ Bucket: this.cfg.bucket, Key: this.k(key), Body: data, ContentLength: data.length }));
  }
  async get(key: string) {
    const { c, m } = await this.sdk();
    const r = await c.send(new m.GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.k(key) }));
    if (!r.Body) throw new Error("Objeto vacío");
    return Buffer.from(await r.Body.transformToByteArray());
  }
  async delete(key: string) {
    const { c, m } = await this.sdk();
    await c.send(new m.DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.k(key) }));
  }
  async exists(key: string) {
    const { c, m } = await this.sdk();
    try {
      await c.send(new m.HeadObjectCommand({ Bucket: this.cfg.bucket, Key: this.k(key) }));
      return true;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (e as { name?: string }).name === "NotFound") return false;
      throw e;
    }
  }
}

/** Driver según el entorno: STORAGE_DRIVER=s3 (+ S3_*) o disco (FILES_DIR, default). */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): StorageAdapter {
  if (env.STORAGE_DRIVER === "s3") {
    const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((k) => !env[k]);
    if (missing.length) throw new Error(`STORAGE_DRIVER=s3 requiere ${missing.join(", ")}`);
    return new S3Storage({
      endpoint: env.S3_ENDPOINT || undefined,
      bucket: env.S3_BUCKET as string,
      region: env.S3_REGION || "auto",
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      prefix: env.S3_PREFIX || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE !== "false" : undefined,
    });
  }
  return new LocalDiskStorage(env.FILES_DIR ?? path.resolve(process.cwd(), ".data/files"));
}

export function storageDriver(): "s3" | "disk" {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "disk";
}

let instance: StorageAdapter | null = null;
/** Disco: FILES_DIR (producción: /data/files, volumen de Docker fuera del webroot). S3: STORAGE_DRIVER=s3. */
export function getStorage(): StorageAdapter {
  if (!instance) instance = storageFromEnv();
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
