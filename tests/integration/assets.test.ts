import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { normalizeDomain } from "@agencyos/modules/assets/domain-name";
import { getProduct, listCredentials, listDomains, listProducts } from "@agencyos/modules/assets/queries";
import {
  addVersion,
  convertReminder,
  createCertificate,
  createCredential,
  createDomain,
  createHosting,
  createInstallation,
  createProduct,
  updateDomain,
  updateInstallation,
} from "@agencyos/modules/assets/service";
import { getCalendarItems } from "@agencyos/modules/calendar/queries";
import { createClient } from "@agencyos/modules/crm/service";
import { getToday } from "@agencyos/modules/today/queries";
import { createReminder } from "@agencyos/modules/today/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

describe("activos técnicos", () => {
  it("normaliza y valida dominios", () => {
    expect(normalizeDomain("https://www.LibreriaUno.com.ar/tienda?x=1")).toBe("libreriauno.com.ar");
    expect(normalizeDomain("peñarol.com")).toBe("xn--pearol-xwa.com");
    expect(normalizeDomain("no es un dominio")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("-mal.com")).toBeNull();
  });

  it("CRUD de dominio con validaciones, duplicados y papelera", async () => {
    const ctx = await makeWorkspace();
    await expect(createDomain(ctx, { name: "esto no" })).rejects.toThrow();
    await expect(createDomain(ctx, { name: "ok.com.ar", expiresOn: "2027-02-31" })).rejects.toThrow();
    const d = await createDomain(ctx, { name: "www.Bellezatecnia.com.ar", expiresOn: "2027-03-01", registrar: "NIC Argentina", autoRenew: "on" });
    expect(d.name).toBe("bellezatecnia.com.ar");
    expect(d.autoRenew).toBe(true);
    expect(d.notifyDaysBefore).toBe(30);
    await expect(createDomain(ctx, { name: "bellezatecnia.com.ar" })).rejects.toThrow(/ya está cargado/);
    const u = await updateDomain(ctx, d.id, { name: d.name, expiresOn: "", notifyDaysBefore: "15" });
    expect(u.expiresOn).toBeNull();
    expect(u.registrar).toBeNull();
    expect(u.notifyDaysBefore).toBe(15);
    await moveToTrash(ctx, "domain", d.id);
    expect((await listDomains(ctx)).length).toBe(0);
    await expect(createDomain(ctx, { name: "bellezatecnia.com.ar" })).rejects.toThrow();
    await restoreFromTrash(ctx, "domain", d.id);
    expect((await listDomains(ctx)).length).toBe(1);
  });

  it("credenciales: solo referencias, nunca contraseñas", async () => {
    const ctx = await makeWorkspace();
    await expect(createCredential(ctx, { label: "Hostinger", itemPath: "password: hunter2" })).rejects.toThrow();
    const c = await createCredential(ctx, { label: "Hostinger Librería Uno", itemPath: "Bitwarden → Librería Uno → Hostinger" });
    expect(c.vault).toBe("bitwarden");
    const h = await createHosting(ctx, { provider: "Hostinger", plan: "Business", credentialRefId: c.id });
    expect(h.credentialRefId).toBe(c.id);
    expect((await listCredentials(ctx))[0]?.uses).toBe(1);
  });

  it("los vencimientos aparecen en Hoy (ponerse al día y próximos 7 días) y en el Calendario", async () => {
    const ctx = await makeWorkspace();
    const today = todayAR();
    const d = await createDomain(ctx, { name: "vence-pronto.com.ar", expiresOn: addDays(today, 5) });
    const far = await createDomain(ctx, { name: "vence-lejos.com.ar", expiresOn: addDays(today, 80) });
    const c = await createCertificate(ctx, { kind: "arca", subject: "Certificado de producción ARCA", expiresOn: addDays(today, 20), notifyDaysBefore: "30" });
    const h = await createHosting(ctx, { provider: "Hostinger", expiresOn: addDays(today, 40), notifyDaysBefore: "10" });
    const data = await getToday(ctx, { userId: ctx.userId as string });
    const keys = data.catchUp.map((i) => i.key);
    expect(keys).toContain(`asset-domain-${d.id}`);
    expect(keys).toContain(`asset-certificate-${c.id}`);
    expect(keys).not.toContain(`asset-domain-${far.id}`);
    expect(keys).not.toContain(`asset-hosting-${h.id}`);
    expect(data.catchUp.find((i) => i.key === `asset-domain-${d.id}`)?.severity).toBe("critical");
    expect(data.agenda.some((a) => a.key === `as-domain-${d.id}`)).toBe(true);
    const cal = await getCalendarItems(ctx, { from: today, to: addDays(today, 90) });
    expect(cal.filter((i) => i.source === "asset").length).toBe(4);
    const onlyTasks = await getCalendarItems(ctx, { from: today, to: addDays(today, 90), sources: ["task"] });
    expect(onlyTasks.some((i) => i.source === "asset")).toBe(false);
  });

  it("una versión nueva crea una tarea por instalación activa con versión anterior", async () => {
    const ctx = await makeWorkspace();
    const uno = await createClient(ctx, { name: "Librería Uno" });
    const sofia = await createClient(ctx, { name: "Sofía" });
    const adeh = await createClient(ctx, { name: "ADEH" });
    const p = await createProduct(ctx, { name: "LibreríaOS Fiscal", kind: "wp_plugin" });
    await expect(addVersion(ctx, p.id, { version: "uno" })).rejects.toThrow();
    const v1 = await addVersion(ctx, p.id, { version: "1.0.0", changelogMd: "Primera" });
    expect(v1.tasks).toHaveLength(0);
    await expect(addVersion(ctx, p.id, { version: "1.0.0" })).rejects.toThrow(/ya está registrada/);
    await expect(createInstallation(ctx, p.id, {})).rejects.toThrow();
    const i1 = await createInstallation(ctx, p.id, { clientId: uno.id, versionId: v1.version.id });
    await createInstallation(ctx, p.id, { clientId: sofia.id, versionId: v1.version.id, status: "paused" });
    await createInstallation(ctx, p.id, { clientId: adeh.id });
    const v2 = await addVersion(ctx, p.id, { version: "v1.1.0", changelogMd: "- Factura C" });
    expect(v2.version.version).toBe("1.1.0");
    expect(v2.tasks.map((t) => t.title)).toEqual(["Actualizar LibreríaOS Fiscal a v1.1.0 en Librería Uno"]);
    const [task] = await getDb()
      .select()
      .from(schema.task)
      .where(eq(schema.task.id, v2.tasks[0]?.id as string));
    const agency = ctx.spaces.find((s) => s.kind === "agency");
    expect(task?.spaceId).toBe(agency?.id);
    expect(task?.descriptionMd).toContain("Factura C");
    const detail = await getProduct(ctx, p.id);
    expect(detail?.latest).toBe("1.1.0");
    expect(detail?.installations.find((x) => x.i.id === i1.id)?.outdated).toBe(true);
    await updateInstallation(ctx, i1.id, { clientId: uno.id, versionId: v2.version.id });
    expect((await listProducts(ctx))[0]?.outdated).toBe(0);
    // Un versión anterior (hotfix 1.0.1) no pide "actualizar" a quien ya tiene 1.1.0.
    const hot = await addVersion(ctx, p.id, { version: "1.0.1" });
    expect(hot.tasks).toHaveLength(0);
  });

  it("la versión de una instalación debe ser del mismo producto", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Cliente" });
    const a = await createProduct(ctx, { name: "A" });
    const b = await createProduct(ctx, { name: "B" });
    const vb = await addVersion(ctx, b.id, { version: "2.0.0" });
    await expect(createInstallation(ctx, a.id, { clientId: c.id, versionId: vb.version.id })).rejects.toThrow(/no es de este producto/);
  });

  it("convierte un vencimiento suelto en certificado ARCA", async () => {
    const ctx = await makeWorkspace();
    const r = await createReminder(ctx, { title: "Certificado de producción de ARCA", kind: "certificate", dueDate: "2028-10-27", notifyDaysBefore: 60 });
    const out = await convertReminder(ctx, r.id, { target: "certificate", name: "ARCA producción · Librería Uno", certKind: "arca" });
    expect(out.type).toBe("certificate");
    const [cert] = await getDb().select().from(schema.certificate).where(eq(schema.certificate.id, out.id));
    expect(cert?.kind).toBe("arca");
    expect(cert?.expiresOn).toBe("2028-10-27");
    expect(cert?.notifyDaysBefore).toBe(60);
    const [rem] = await getDb().select().from(schema.reminder).where(eq(schema.reminder.id, r.id));
    expect(rem?.deletedAt).not.toBeNull();
    await expect(convertReminder(ctx, r.id, { target: "domain", name: "x.com" })).rejects.toThrow();
  });

  it("aislamiento A/B: ids de otro workspace se rechazan y no se listan", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const cb = await createClient(b, { name: "Cliente de B" });
    const credB = await createCredential(b, { label: "B", itemPath: "Bitwarden → B" });
    await expect(createDomain(a, { name: "a.com.ar", clientId: cb.id })).rejects.toThrow(/cliente/i);
    await expect(createHosting(a, { provider: "X", credentialRefId: credB.id })).rejects.toThrow(/credencial/i);
    const pb = await createProduct(b, { name: "Producto B" });
    await expect(addVersion(a, pb.id, { version: "1.0.0" })).rejects.toThrow();
    await expect(createInstallation(a, pb.id, { clientId: cb.id })).rejects.toThrow();
    const db = await createDomain(b, { name: "de-b.com.ar" });
    // El mismo nombre en otro workspace es válido (único por workspace).
    await createDomain(a, { name: "de-b.com.ar" });
    await expect(updateDomain(a, db.id, { name: "de-b.com.ar" })).rejects.toThrow();
    expect((await listProducts(a)).length).toBe(0);
    expect((await listCredentials(a)).length).toBe(0);
    await expect(moveToTrash(a, "domain", db.id)).rejects.toThrow();
  });

  it("permisos: un token MCP de solo lectura no escribe activos", async () => {
    const ctx = await makeWorkspace();
    const bot = agentCtx(ctx, ["read:all", "write:tasks"]);
    await expect(createDomain(bot, { name: "bot.com.ar" })).rejects.toThrow(/permiso|alcance/);
    expect(await listDomains(bot)).toEqual([]);
    await expect(listCredentials(bot)).rejects.toThrow(/permiso|alcance/);
    const rows = await getDb()
      .select()
      .from(schema.domain)
      .where(and(eq(schema.domain.workspaceId, ctx.workspaceId)));
    expect(rows).toHaveLength(0);
  });
});
