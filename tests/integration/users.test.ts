import { createHash } from "node:crypto";
import type { Ctx } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createProject } from "@agencyos/modules/projects/service";
import {
  acceptInvitationAsUser,
  acceptInvitationNewUser,
  changeRole,
  createInvitation,
  deactivateUser,
  listInvitations,
  listUsers,
  magicLinkAllowed,
  openInvitation,
  renewInvitation,
  revokeInvitation,
} from "@agencyos/modules/users/service";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWorkspace } from "./helpers";

const tokenOf = (url: string) => url.split("/invitacion/")[1] ?? "";
const PASS = { name: "Ana Colaboradora", password: "UnaClaveLarga2026!", password2: "UnaClaveLarga2026!" };
const uniq = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}@test.local`;

describe("usuarios e invitaciones", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.AUTH_HIBP = "off";
  });

  it("contraseña filtrada (Have I Been Pwned): la invitación no crea la cuenta; si el servicio no responde, tampoco", async () => {
    const ctx = await makeWorkspace();
    const p = await createProject(ctx, { name: "Sitio HIBP" });
    const email = uniq("hibp");
    const { url } = await createInvitation(ctx, { email, role: "member", projectIds: [p.id] });
    const token = tokenOf(url);
    process.env.AUTH_HIBP = "on";
    const sha = createHash("sha1").update(PASS.password).digest("hex").toUpperCase();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string | URL) => {
        calls.push(String(u));
        return new Response(`${sha.slice(5)}:42\r\nABCDEF0123456789ABCDEF0123456789ABC:1`, { status: 200, headers: { "Content-Type": "text/plain" } });
      }),
    );
    await expect(acceptInvitationNewUser(token, PASS)).rejects.toThrow(/filtraciones/);
    // k-anonimato: solo viaja el prefijo de 5 caracteres del SHA-1
    expect(calls[0]).toMatch(new RegExp(`/range/${sha.slice(0, 5)}$`));
    expect(calls.join(" ")).not.toContain(sha.slice(5));
    // servicio caído: falla cerrado
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 503 })),
    );
    await expect(acceptInvitationNewUser(token, PASS)).rejects.toThrow(/No pudimos verificar/);
    // no se creó la cuenta y la invitación sigue vigente
    expect((await openInvitation(token))?.hasAccount).toBe(false);
    // contraseña no filtrada: pasa
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ABCDEF0123456789ABCDEF0123456789ABC:1", { status: 200 })),
    );
    expect((await acceptInvitationNewUser(token, PASS)).role).toBe("member");
  });

  it("invita un colaborador: token hasheado, un solo uso, crea cuenta, membership y proyectos asignados", async () => {
    const ctx = await makeWorkspace();
    const p = await createProject(ctx, { name: "Sitio Ana" });
    const email = uniq("ana");
    const { invitation, url, emailed } = await createInvitation(ctx, { email, role: "member", projectIds: [p.id] });
    expect(emailed).toBe(false);
    const token = tokenOf(url);
    expect(token.length).toBeGreaterThan(30);
    expect(invitation.tokenHash).not.toContain(token);
    expect(invitation.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect((await openInvitation(token))?.hasAccount).toBe(false);

    const r = await acceptInvitationNewUser(token, PASS);
    expect(r.role).toBe("member");
    const [m] = await getDb().select().from(schema.membership).where(eq(schema.membership.id, r.membershipId));
    expect(m?.role).toBe("member");
    const pm = await getDb()
      .select()
      .from(schema.projectMember)
      .where(eq(schema.projectMember.userId, m?.userId ?? ""));
    expect(pm.map((x) => x.projectId)).toEqual([p.id]);
    // un solo uso
    expect(await openInvitation(token)).toBeNull();
    await expect(acceptInvitationNewUser(token, PASS)).rejects.toThrow();
    const ev = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, ctx.workspaceId), eq(schema.domainEvent.type, "usuario.unido")));
    expect(ev.length).toBe(1);
  });

  it("valida: rol client exige cliente; member exige proyectos; contraseña de 12+; ids de otro workspace", async () => {
    const ctx = await makeWorkspace();
    const other = await makeWorkspace("B");
    const foreign = await createProject(other, { name: "Ajeno" });
    await expect(createInvitation(ctx, { email: uniq("x"), role: "client" })).rejects.toThrow();
    await expect(createInvitation(ctx, { email: uniq("x"), role: "member", projectIds: [] })).rejects.toThrow();
    await expect(createInvitation(ctx, { email: uniq("x"), role: "member", projectIds: [foreign.id] })).rejects.toThrow(/proyecto/i);
    await expect(createInvitation(ctx, { email: uniq("x"), role: "owner" })).rejects.toThrow();
    const { url } = await createInvitation(ctx, { email: uniq("corta"), role: "admin" });
    await expect(acceptInvitationNewUser(tokenOf(url), { name: "Corta", password: "corta", password2: "corta" })).rejects.toThrow(/12/);
  });

  it("vencida, revocada o renovada: el enlace anterior deja de servir", async () => {
    const ctx = await makeWorkspace();
    const { invitation, url } = await createInvitation(ctx, { email: uniq("v"), role: "admin" });
    const renewed = await renewInvitation(ctx, invitation.id);
    expect(await openInvitation(tokenOf(url))).toBeNull();
    expect(await openInvitation(tokenOf(renewed.url))).not.toBeNull();
    await revokeInvitation(ctx, invitation.id);
    expect(await openInvitation(tokenOf(renewed.url))).toBeNull();
    expect(await listInvitations(ctx)).toHaveLength(0);

    const second = await createInvitation(ctx, { email: uniq("w"), role: "admin" });
    await getDb()
      .update(schema.invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.invitation.id, second.invitation.id));
    expect(await openInvitation(tokenOf(second.url))).toBeNull();
    // reenviar por email sin Brevo: error claro (no se finge el envío)
    await expect(renewInvitation(ctx, second.invitation.id, { send: true })).rejects.toThrow(/Brevo/);
  });

  it("usuario existente: solo acepta con la sesión del mismo email", async () => {
    const ctx = await makeWorkspace();
    const email = uniq("exist");
    const userId = `u_${Math.random().toString(36).slice(2)}`;
    await getDb().insert(schema.user).values({ id: userId, name: "Existente", email, emailVerified: true });
    const { url } = await createInvitation(ctx, { email, role: "admin" });
    await expect(acceptInvitationAsUser(tokenOf(url), { id: "otro", name: "Otro", email: "otro@test.local" })).rejects.toThrow(/otro email/);
    const r = await acceptInvitationAsUser(tokenOf(url), { id: userId, name: "Existente", email: email.toUpperCase() });
    expect(r.role).toBe("admin");
  });

  it("solo owner/admin administran; member y client no pueden invitar", async () => {
    const ctx = await makeWorkspace();
    const member: Ctx = { ...ctx, role: "member" };
    const client: Ctx = { ...ctx, role: "client" };
    await expect(createInvitation(member, { email: uniq("m"), role: "admin" })).rejects.toThrow(/permiso/);
    await expect(createInvitation(client, { email: uniq("c"), role: "admin" })).rejects.toThrow(/permiso/);
    await expect(listUsers(member)).rejects.toThrow(/permiso/);
  });

  it("cambiar rol, desactivar (revoca sesiones) y el dueño es intocable", async () => {
    const ctx = await makeWorkspace();
    const cli = await createClient(ctx, { name: "Panadería Sol" });
    const p = await createProject(ctx, { name: "Web Sol", clientId: cli.id });
    const { url } = await createInvitation(ctx, { email: uniq("rol"), role: "member", projectIds: [p.id] });
    const r = await acceptInvitationNewUser(tokenOf(url), PASS);
    const users = await listUsers(ctx);
    const target = users.find((u) => u.membershipId === r.membershipId);
    expect(target?.projects.map((x) => x.name)).toEqual(["Web Sol"]);
    const owner = users.find((u) => u.role === "owner");
    expect(owner).toBeDefined();
    await expect(deactivateUser(ctx, owner?.membershipId ?? "")).rejects.toThrow(/dueño/);
    await expect(changeRole(ctx, owner?.membershipId ?? "", { role: "member" })).rejects.toThrow(/dueño/);

    await changeRole(ctx, r.membershipId, { role: "client", clientId: cli.id });
    const after = (await listUsers(ctx)).find((u) => u.membershipId === r.membershipId);
    expect(after?.role).toBe("client");
    expect(after?.clientName).toBe("Panadería Sol");
    expect(after?.projects).toEqual([]);
    expect(await magicLinkAllowed(r.email)).toBe(true);

    const userId = target?.userId ?? "";
    await getDb()
      .insert(schema.session)
      .values({ id: `s_${userId}`, token: `t_${userId}`, userId, expiresAt: new Date(Date.now() + 86_400_000) });
    await deactivateUser(ctx, r.membershipId);
    expect(await getDb().select().from(schema.session).where(eq(schema.session.userId, userId))).toHaveLength(0);
    expect((await listUsers(ctx)).find((u) => u.membershipId === r.membershipId)?.status).toBe("disabled");
    expect(await magicLinkAllowed(r.email)).toBe(false);
  });

  it("magic link: nunca para dueño, admin ni colaborador", async () => {
    const ctx = await makeWorkspace();
    const [u] = await getDb()
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, ctx.userId ?? ""));
    expect(await magicLinkAllowed(u?.email ?? "")).toBe(false);
    expect(await magicLinkAllowed("nadie@test.local")).toBe(false);
  });

  it("aislamiento A/B: B no ve ni revoca invitaciones ni usuarios de A", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const { invitation } = await createInvitation(a, { email: uniq("ab"), role: "admin" });
    expect(await listInvitations(b)).toHaveLength(0);
    await expect(revokeInvitation(b, invitation.id)).rejects.toThrow();
    await expect(renewInvitation(b, invitation.id)).rejects.toThrow();
    const aUsers = await listUsers(a);
    await expect(deactivateUser(b, aUsers[0]?.membershipId ?? "")).rejects.toThrow();
    expect((await listUsers(b)).every((u) => u.userId !== a.userId)).toBe(true);
  });
});
