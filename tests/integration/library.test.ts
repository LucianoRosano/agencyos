import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { getDb, schema } from "@agencyos/db";
import { cleanupOrphanFiles } from "@agencyos/modules/library/jobs";
import { attachmentsOf, canonicalFilePath, getFile, listFiles, signedFileUrl, storageUsage, verifyFileUrl } from "@agencyos/modules/library/queries";
import * as lib from "@agencyos/modules/library/service";
import { getStorage } from "@agencyos/modules/shared/storage";
import { createTask } from "@agencyos/modules/tasks/service";
import { moveToTrash, purgeOne } from "@agencyos/modules/trash/service";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const dir = mkdtempSync(path.join(tmpdir(), "agencyos-files-"));
process.env.FILES_DIR = dir;

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
/** PNG RGB sólido mínimo (para no depender de fixtures). */
export function makePng(w: number, h: number, rgb: [number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

let A: Awaited<ReturnType<typeof makeWorkspace>>;
let B: Awaited<ReturnType<typeof makeWorkspace>>;

beforeAll(async () => {
  A = await makeWorkspace("Biblioteca A");
  B = await makeWorkspace("Biblioteca B");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("biblioteca: subida", () => {
  it("guarda en storage y en la base, con miniatura WebP, dimensiones, hash y versión 1", async () => {
    const png = makePng(64, 32, [255, 80, 0]);
    const { file, duplicate } = await lib.uploadFile(A, "../Logo Cliente.PNG", png);
    expect(duplicate).toBe(false);
    expect(file.name).toBe("Logo Cliente.png");
    expect(file.mime).toBe("image/png");
    expect(file.kind).toBe("image");
    expect(file.width).toBe(64);
    expect(file.height).toBe(32);
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.storageKey.startsWith(`${A.workspaceId}/`)).toBe(true);
    expect(await getStorage().get(file.storageKey)).toEqual(png);
    expect(file.thumbKey).toBeTruthy();
    const thumb = await getStorage().get(file.thumbKey as string);
    expect(thumb.toString("latin1", 8, 12)).toBe("WEBP");
    const versions = await getDb().select().from(schema.fileVersion).where(eq(schema.fileVersion.fileId, file.id));
    expect(versions).toHaveLength(1);
    const ev = await getDb().select().from(schema.domainEvent).where(eq(schema.domainEvent.entityId, file.id));
    expect(ev.map((e) => e.type)).toContain("recurso.subido");
  });

  it("deduplica por SHA-256 (opcional)", async () => {
    const png = makePng(8, 8, [1, 2, 3]);
    const a = await lib.uploadFile(A, "uno.png", png);
    const b = await lib.uploadFile(A, "dos.png", png);
    expect(b.duplicate).toBe(true);
    expect(b.file.id).toBe(a.file.id);
    const c = await lib.uploadFile(A, "tres.png", png, { dedupe: "0" });
    expect(c.duplicate).toBe(false);
    expect(c.file.id).not.toBe(a.file.id);
  });

  it("rechaza un ejecutable renombrado y extensiones no permitidas", async () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 0)]);
    await expect(lib.uploadFile(A, "foto.png", exe)).rejects.toThrow(/no es un \.png real/);
    await expect(lib.uploadFile(A, "setup.exe", exe)).rejects.toThrow(/no permitido/);
  });

  it("sanitiza SVG al guardar", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" fill="#f00"/></svg>');
    const { file } = await lib.uploadFile(A, "icono.svg", svg);
    const stored = (await getStorage().get(file.storageKey)).toString("utf8");
    expect(stored).not.toMatch(/script|onload/);
    expect(stored).toContain("<rect");
    expect(file.thumbKey).toBeTruthy();
  });

  it("respeta la cuota del workspace antes de guardar", async () => {
    const C = await makeWorkspace("Biblioteca cuota");
    await getDb()
      .update(schema.workspace)
      .set({ settings: { storageQuotaMb: 1 } as never })
      .where(eq(schema.workspace.id, C.workspaceId));
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(700 * 1024, 0x41)]);
    await lib.uploadFile(C, "a.pdf", big);
    const big2 = Buffer.concat([Buffer.from("%PDF-1.5\n"), Buffer.alloc(700 * 1024, 0x42)]);
    await expect(lib.uploadFile(C, "b.pdf", big2)).rejects.toThrow(/espacio disponible/);
    const u = await storageUsage(C);
    expect(u.limit).toBe(1024 * 1024);
    expect(u.used).toBeGreaterThan(700 * 1024);
    expect(await listFiles(C)).toHaveLength(1);
  });

  it("valida que cliente/carpeta/adjunto pertenezcan al workspace", async () => {
    const [clientB] = await getDb().insert(schema.client).values({ workspaceId: B.workspaceId, name: "Cliente de B" }).returning();
    await expect(lib.uploadFile(A, "x.pdf", PDF, { clientId: clientB?.id })).rejects.toThrow(/cliente/i);
    const folderB = await lib.createFolder(B, { name: "Carpeta B" });
    await expect(lib.uploadFile(A, "x.pdf", PDF, { folderId: folderB.id })).rejects.toThrow(/carpeta/i);
  });
});

describe("biblioteca: versiones", () => {
  it("nueva versión conserva el historial y se puede restaurar una anterior", async () => {
    const v1 = makePng(10, 10, [0, 0, 255]);
    const v2 = makePng(20, 10, [0, 255, 0]);
    const { file } = await lib.uploadFile(A, "banner.png", v1);
    await expect(lib.uploadVersion(A, file.id, "banner.png", v1)).rejects.toThrow(/idéntica/);
    await expect(lib.uploadVersion(A, file.id, "banner.pdf", PDF)).rejects.toThrow(/mismo tipo/);
    const updated = await lib.uploadVersion(A, file.id, "banner-nuevo.png", v2);
    expect(updated?.currentVersion).toBe(2);
    expect(updated?.width).toBe(20);
    const data = await getFile(A, file.id);
    expect(data?.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(await getStorage().get(data?.versions[1]?.storageKey as string)).toEqual(v1);
    const restored = await lib.restoreVersion(A, file.id, 1);
    expect(restored?.currentVersion).toBe(3);
    expect(restored?.sha256).toBe(file.sha256);
    expect(restored?.width).toBe(10);
    // otro workspace no puede versionar
    await expect(lib.uploadVersion(B, file.id, "banner.png", makePng(5, 5, [9, 9, 9]))).rejects.toThrow(/no existe/);
  });
});

describe("biblioteca: adjuntos y aislamiento", () => {
  it("adjunta a una tarea (subiendo o eligiendo) y se puede quitar", async () => {
    const task = await createTask(A, { title: "Tarea con adjuntos" });
    const up = await lib.uploadFile(A, "brief.pdf", PDF, { attachType: "task", attachId: task.id });
    let items = await attachmentsOf(A, "task", task.id);
    expect(items.map((i) => i.fileId)).toEqual([up.file.id]);
    const { file: img } = await lib.uploadFile(A, "ref.png", makePng(4, 4, [5, 5, 5]));
    await lib.attachFile(A, { fileId: img.id, entityType: "task", entityId: task.id });
    await lib.attachFile(A, { fileId: img.id, entityType: "task", entityId: task.id }); // idempotente
    items = await attachmentsOf(A, "task", task.id);
    expect(items).toHaveLength(2);
    const detail = await getFile(A, img.id);
    expect(detail?.attachments[0]).toMatchObject({ entityType: "task", title: "Tarea con adjuntos", href: `/tareas/${task.id}` });
    await lib.detachFile(A, items.find((i) => i.fileId === img.id)?.attachmentId as string);
    expect(await attachmentsOf(A, "task", task.id)).toHaveLength(1);
  });

  it("no se puede adjuntar ni descargar un archivo de otro workspace", async () => {
    const { file } = await lib.uploadFile(A, "secreto.pdf", Buffer.from("%PDF-1.4\nsecreto A\n"));
    const taskB = await createTask(B, { title: "Tarea de B" });
    await expect(lib.attachFile(B, { fileId: file.id, entityType: "task", entityId: taskB.id })).rejects.toThrow(/archivo/i);
    const taskA = await createTask(A, { title: "Tarea de A" });
    await expect(lib.attachFile(B, { fileId: file.id, entityType: "task", entityId: taskA.id })).rejects.toThrow(/no existe/);
    await expect(lib.attachFile(A, { fileId: file.id, entityType: "workspace", entityId: taskA.id })).rejects.toThrow(/No se pueden adjuntar/);
    expect(await lib.resolveDownload(B, file.id)).toBeNull();
    expect(await lib.resolveDownload(A, file.id)).toMatchObject({ key: file.storageKey, mime: "application/pdf" });
    expect(await getFile(B, file.id)).toBeNull();
    expect((await listFiles(B)).find((r) => r.f.id === file.id)).toBeUndefined();
  });

  it("los comprobantes de Finanzas exigen permiso de finanzas", async () => {
    const member = { ...A, role: "member" as const };
    const fakeTx = "00000000-0000-7000-8000-000000000000";
    const { file } = await lib.uploadFile(A, "comprobante.pdf", Buffer.from("%PDF-1.4\ncomprobante\n"));
    await expect(lib.attachFile(member, { fileId: file.id, entityType: "transaction", entityId: fakeTx })).rejects.toThrow(/permiso/);
  });
});

describe("biblioteca: URL firmada", () => {
  it("verifica firma, parámetros y vencimiento", () => {
    const id = "0190a0a0-0000-7000-8000-000000000001";
    const url = new URL(signedFileUrl(id, { v: 2, dl: true }), "http://x");
    expect(url.pathname).toBe(`/api/files/${id}`);
    expect(verifyFileUrl(id, url.searchParams)).toMatchObject({ ok: true, opts: { v: 2, dl: true } });
    // cambiar la versión invalida la firma
    const tampered = new URLSearchParams(url.searchParams);
    tampered.set("v", "1");
    expect(verifyFileUrl(id, tampered).ok).toBe(false);
    // otro id
    expect(verifyFileUrl("0190a0a0-0000-7000-8000-000000000002", url.searchParams).ok).toBe(false);
    // vencida
    const expired = new URL(signedFileUrl(id, {}).replace(/exp=\d+/, "exp=1000"), "http://x");
    expect(verifyFileUrl(id, expired.searchParams).ok).toBe(false);
    const past = new URL(`http://x${canonicalFilePath(id)}`);
    expect(verifyFileUrl(id, past.searchParams).ok).toBe(false);
  });
});

describe("biblioteca: carpetas, kit de marca, plantillas y purga", () => {
  it("carpetas heredan cliente del padre", async () => {
    const [client] = await getDb().insert(schema.client).values({ workspaceId: A.workspaceId, name: "Panadería" }).returning();
    const root = await lib.createFolder(A, { name: "Fotos", clientId: client?.id });
    const sub = await lib.createFolder(A, { name: "2026", parentId: root.id });
    expect(sub.clientId).toBe(client?.id);
    const { file } = await lib.uploadFile(A, "local.png", makePng(6, 6, [7, 7, 7]), { folderId: sub.id });
    expect(file.clientId).toBe(client?.id);
    const renamed = await lib.renameFolder(A, sub.id, { name: "Año 2026" });
    expect(renamed.name).toBe("Año 2026");
    await expect(lib.renameFolder(B, sub.id, { name: "x" })).rejects.toThrow(/no existe/);
  });

  it("kit de marca: paleta, tipografías, logos de la biblioteca y manual", async () => {
    const [client] = await getDb().insert(schema.client).values({ workspaceId: A.workspaceId, name: "Kiosco" }).returning();
    const { file: logo } = await lib.uploadFile(A, "kiosco.png", makePng(12, 12, [200, 10, 10]));
    const { file: manual } = await lib.uploadFile(A, "manual.pdf", Buffer.from("%PDF-1.4\nmanual\n"));
    const kit = await lib.saveBrandKit(A, client?.id as string, {
      colors: JSON.stringify([{ name: "Rojo", hex: "#c80a0a" }]),
      fonts: JSON.stringify([{ name: "Geist", usage: "Títulos" }]),
      logoFileIds: JSON.stringify([logo.id]),
      guidelinesFileId: manual.id,
      notesMd: "Nunca sobre fondo verde.",
    });
    expect(kit?.colors).toEqual([{ name: "Rojo", hex: "#C80A0A" }]);
    const [after] = await getDb().select().from(schema.file).where(eq(schema.file.id, logo.id));
    expect(after?.kind).toBe("logo");
    expect(after?.clientId).toBe(client?.id);
    await expect(lib.saveBrandKit(A, client?.id as string, { colors: JSON.stringify([{ name: "x", hex: "rojo" }]) })).rejects.toThrow();
    await expect(lib.saveBrandKit(A, client?.id as string, { logoFileIds: JSON.stringify([manual.id]) })).rejects.toThrow(/imágenes/);
    // un logo de otro workspace no se acepta
    const { file: logoB } = await lib.uploadFile(B, "b.png", makePng(3, 3, [1, 1, 1]));
    await expect(lib.saveBrandKit(A, client?.id as string, { logoFileIds: JSON.stringify([logoB.id]) })).rejects.toThrow(/no existe/);
    await expect(lib.saveBrandKit(B, client?.id as string, {})).rejects.toThrow(/cliente/i);
  });

  it("plantillas con variables", async () => {
    const tpl = await lib.createTemplate(A, { name: "Bienvenida", kind: "snippet", bodyMd: "Hola {{nombre}}, tu sitio {{ sitio }} está listo. {{nombre}}" });
    expect(tpl.vars).toEqual(["nombre", "sitio"]);
    expect(lib.fillTemplate(tpl.bodyMd, { nombre: "Ana", sitio: "" })).toBe("Hola Ana, tu sitio {{ sitio }} está listo. Ana");
    const upd = await lib.updateTemplate(A, tpl.id, { name: "Bienvenida", kind: "prompt", bodyMd: "{{cliente}}" });
    expect(upd.vars).toEqual(["cliente"]);
    await expect(lib.updateTemplate(B, tpl.id, { name: "x", bodyMd: "y" })).rejects.toThrow(/no existe/);
  });

  it("al purgar de la papelera se borra del storage", async () => {
    const { file } = await lib.uploadFile(A, "borrar.png", makePng(9, 9, [9, 1, 9]));
    await lib.uploadVersion(A, file.id, "borrar.png", makePng(9, 9, [9, 2, 9]));
    const data = await getFile(A, file.id);
    const keys = data?.versions.map((v) => v.storageKey) ?? [];
    expect(keys).toHaveLength(2);
    await moveToTrash(A, "file", file.id);
    expect(await lib.resolveDownload(A, file.id)).toBeNull();
    await purgeOne(A, "file", file.id);
    for (const k of keys) {
      expect(await getStorage().exists(k)).toBe(false);
      expect(await getStorage().exists(lib.thumbKeyFor(k))).toBe(false);
    }
    expect(await getDb().select().from(schema.fileVersion).where(eq(schema.fileVersion.fileId, file.id))).toHaveLength(0);
    expect((await cleanupOrphanFiles()).versions).toBe(0);
  });
});
