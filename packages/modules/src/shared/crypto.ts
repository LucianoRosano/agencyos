import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cifrado de sobre (envelope) para secretos de integración (docs/08 §4):
 * una clave de datos aleatoria por secreto (AES-256-GCM), cifrada con la clave maestra APP_ENCRYPTION_KEY (32 bytes hex).
 * Formato: v1 | iv_k(12) | tag_k(16) | dek_enc(32) | iv_d(12) | tag_d(16) | datos
 */
const VERSION = 1;

function masterKey(): Buffer {
  const hex = process.env.APP_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("APP_ENCRYPTION_KEY debe tener 64 caracteres hex (32 bytes)");
  return Buffer.from(hex, "hex");
}

function gcm(key: Buffer, data: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(data), c.final()]);
  return { iv, tag: c.getAuthTag(), enc };
}

export function encryptSecret(plain: string): Buffer {
  const dek = randomBytes(32);
  const k = gcm(masterKey(), dek);
  const d = gcm(dek, Buffer.from(plain, "utf8"));
  return Buffer.concat([Buffer.from([VERSION]), k.iv, k.tag, k.enc, d.iv, d.tag, d.enc]);
}

export function decryptSecret(blob: Buffer): string {
  if (blob[0] !== VERSION) throw new Error("Formato de secreto desconocido");
  let o = 1;
  const take = (n: number) => {
    const b = blob.subarray(o, o + n);
    o += n;
    return b;
  };
  const ivK = take(12);
  const tagK = take(16);
  const dekEnc = take(32);
  const ivD = take(12);
  const tagD = take(16);
  const data = blob.subarray(o);
  const dk = createDecipheriv("aes-256-gcm", masterKey(), ivK);
  dk.setAuthTag(tagK);
  const dek = Buffer.concat([dk.update(dekEnc), dk.final()]);
  const dd = createDecipheriv("aes-256-gcm", dek, ivD);
  dd.setAuthTag(tagD);
  return Buffer.concat([dd.update(data), dd.final()]).toString("utf8");
}

/** Muestra un secreto de forma segura: "••••abcd". */
export const maskSecret = (s: string) => (s.length <= 4 ? "••••" : `••••${s.slice(-4)}`);

/** Firma HMAC-SHA256 (webhooks, URLs firmadas). */
export function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/** URL firmada de vencimiento corto (descargas de archivos, docs/08 §5). */
export function signPath(path: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmac(process.env.AUTH_SECRET ?? "dev", `${path}:${exp}`);
  return `${path}${path.includes("?") ? "&" : "?"}exp=${exp}&sig=${sig}`;
}

export function verifySignedPath(path: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqualHex(hmac(process.env.AUTH_SECRET ?? "dev", `${path}:${exp}`), sig);
}
