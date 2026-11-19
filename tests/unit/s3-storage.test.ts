import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { LocalDiskStorage, S3Storage, storageFromEnv } from "@agencyos/modules/shared/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Servidor S3 falso mínimo (path-style): PUT/GET/HEAD/DELETE de objetos en memoria. Registra los pedidos. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const requests: { method: string; path: string; auth: string | undefined }[] = [];
  const body = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });
  const server: Server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    requests.push({ method: req.method ?? "", path, auth: req.headers.authorization });
    if (!req.headers.authorization?.startsWith("AWS4-HMAC-SHA256 Credential=AKTEST/")) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "PUT") {
      objects.set(path, await body(req));
      res.writeHead(200, { ETag: '"x"' }).end();
    } else if (req.method === "GET" || req.method === "HEAD") {
      const o = objects.get(path);
      if (!o) {
        res.writeHead(404, { "Content-Type": "application/xml" });
        res.end(req.method === "GET" ? "<Error><Code>NoSuchKey</Code><Message>no</Message></Error>" : undefined);
        return;
      }
      res.writeHead(200, { "Content-Length": String(o.length), "Content-Type": "application/octet-stream" });
      res.end(req.method === "GET" ? o : undefined);
    } else if (req.method === "DELETE") {
      objects.delete(path);
      res.writeHead(204).end();
    } else res.writeHead(405).end();
  });
  return { server, objects, requests };
}

describe("S3Storage (S3-compatible: R2, B2, MinIO)", () => {
  const fake = fakeS3();
  let endpoint = "";
  beforeAll(async () => {
    await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
    endpoint = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => fake.server.close(() => r())));

  it("put/get/exists/delete con firma SigV4, bucket por ruta y prefijo", async () => {
    const s = new S3Storage({ endpoint, bucket: "agencyos", region: "auto", accessKeyId: "AKTEST", secretAccessKey: "secreto", prefix: "prod/" });
    const key = "ws1/2026/11/abc.pdf";
    const data = Buffer.from("%PDF-1.7 contenido binario \u0000ÿ");
    await s.put(key, data);
    expect(fake.objects.get(`/agencyos/prod/${key}`)?.equals(data)).toBe(true);
    expect((await s.get(key)).equals(data)).toBe(true);
    expect(await s.exists(key)).toBe(true);
    await s.delete(key);
    expect(await s.exists(key)).toBe(false);
    await expect(s.get(key)).rejects.toThrow();
    expect(fake.requests.every((r) => r.auth?.includes("SignedHeaders="))).toBe(true);
  });

  it("rechaza claves inválidas antes de llamar al proveedor", async () => {
    const s = new S3Storage({ endpoint, bucket: "b", region: "auto", accessKeyId: "AKTEST", secretAccessKey: "x" });
    const before = fake.requests.length;
    await expect(s.put("../etc/passwd", Buffer.from("x"))).rejects.toThrow(/inválida/);
    await expect(s.get("/abs")).rejects.toThrow(/inválida/);
    expect(fake.requests.length).toBe(before);
  });

  it("storageFromEnv: disco por defecto, S3 con STORAGE_DRIVER=s3 y error claro si falta configuración", () => {
    expect(storageFromEnv({ FILES_DIR: "/tmp/x" })).toBeInstanceOf(LocalDiskStorage);
    expect(storageFromEnv({ STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s", S3_ENDPOINT: endpoint })).toBeInstanceOf(
      S3Storage,
    );
    expect(() => storageFromEnv({ STORAGE_DRIVER: "s3", S3_BUCKET: "b" })).toThrow(/S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/);
  });
});
