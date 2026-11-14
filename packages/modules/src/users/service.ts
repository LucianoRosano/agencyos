import { createHash, randomBytes } from "node:crypto";
import { assertCan, type Ctx, conflict, forbidden, L, label, notFound, type Role, validation, zOptUuid } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { getDb, schema, type Tx } from "@agencyos/db";
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "../auth/server";
import { assertOwned, scoped } from "../shared/db";
import { emailConfigured, sendEmail } from "../shared/email";

/**
 * Usuarios e invitaciones (M14 "Usuarios", M15). Las cuentas solo se crean aceptando una invitación
 * (emailAndPassword.disableSignUp sigue en true). El token viaja una sola vez en el enlace; se guarda su hash.
 */

export const INVITE_ROLES = ["admin", "member", "client"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export const INVITATION_DAYS = 7;
/** Clave de user_preference donde se guarda el cliente del CRM de un usuario `client` (membership no tiene columna). */
export const portalPrefKey = (workspaceId: string) => `portal_client:${workspaceId}`;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const invitationUrl = (token: string) => `${appUrl()}/invitacion/${token}`;

const zIds = z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.string().uuid("Proyecto inválido")).max(200));

export const inviteInput = z
  .object({
    email: z.string().trim().toLowerCase().email("Email inválido").max(200),
    role: z.enum(INVITE_ROLES, { error: "Elegí el rol" }),
    clientId: zOptUuid,
    projectIds: zIds,
  })
  .superRefine((v, c) => {
    if (v.role === "client" && !v.clientId) c.addIssue({ code: "custom", path: ["clientId"], message: "Elegí el cliente del CRM" });
    if (v.role === "member" && !v.projectIds.length) c.addIssue({ code: "custom", path: ["projectIds"], message: "Elegí al menos un proyecto" });
  });

function assertAdmin(ctx: Ctx) {
  assertCan(ctx, "manage", "settings");
  if (ctx.actor.type !== "user") throw forbidden("Solo una persona puede administrar usuarios.");
}

async function assertProjects(t: Tx, ctx: Ctx, ids: string[]) {
  for (const id of ids) await assertOwned(t, ctx, schema.project, id, "El proyecto");
}

function inviteEmail(role: InviteRole, url: string, workspaceName: string) {
  const who = role === "client" ? "el portal de clientes de Luciano Rosano" : `AGENCYOS (${workspaceName})`;
  return {
    subject: role === "client" ? "Luciano Rosano · Tu acceso al portal" : "AGENCYOS · Invitación",
    text: `Te invitaron a ${who} como ${label(L.role, role).toLowerCase()}.\n\nAbrí este enlace para crear tu cuenta (vence en ${INVITATION_DAYS} días y sirve una sola vez):\n${url}\n\nSi no esperabas este mail, ignoralo.`,
  };
}

async function workspaceName(workspaceId: string) {
  const [w] = await getDb().select({ name: schema.workspace.name }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  return w?.name ?? "AGENCYOS";
}

/** Crea una invitación. Devuelve el enlace en claro UNA sola vez (para copiarlo si no hay Brevo). */
export async function createInvitation(ctx: Ctx, raw: unknown) {
  assertAdmin(ctx);
  const input = inviteInput.parse(raw);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);
  const invitation = await getDb().transaction(async (t) => {
    if (input.role === "client") await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    const projectIds = input.role === "member" ? [...new Set(input.projectIds)] : [];
    await assertProjects(t, ctx, projectIds);
    const [active] = await t
      .select({ id: schema.membership.id })
      .from(schema.membership)
      .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
      .where(
        and(eq(schema.membership.workspaceId, ctx.workspaceId), eq(schema.membership.status, "active"), sql`lower(${schema.user.email}) = ${input.email}`),
      );
    if (active) throw validation("Esa persona ya tiene acceso. Cambiá su rol desde la lista.", { email: "Ya es usuario" });
    // Una sola invitación pendiente por email: la anterior queda revocada.
    await t
      .update(schema.invitation)
      .set({ deletedAt: new Date() })
      .where(and(scoped(schema.invitation, ctx), eq(schema.invitation.email, input.email), isNull(schema.invitation.acceptedAt)));
    const [row] = await t
      .insert(schema.invitation)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt,
        clientId: input.role === "client" ? (input.clientId ?? null) : null,
        projectIds,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la invitación");
    await recordEvent(t, ctx, {
      type: "usuario.invitado",
      entityType: "invitation",
      entityId: row.id,
      summary: `Invitó a ${input.email} como ${label(L.role, input.role).toLowerCase()}`,
      payload: { role: input.role },
    });
    await audit(t, ctx, { action: "usuario.invitado", targetType: "invitation", targetId: row.id, after: { email: input.email, role: input.role } });
    return row;
  });
  const url = invitationUrl(token);
  const emailed = emailConfigured() ? await sendEmail({ to: input.email, ...inviteEmail(input.role, url, await workspaceName(ctx.workspaceId)) }) : false;
  return { invitation, url, emailed };
}

/** Genera un enlace nuevo (el anterior deja de servir) y, si se pide y hay Brevo, lo manda por email. */
export async function renewInvitation(ctx: Ctx, id: string, opts: { send?: boolean } = {}) {
  assertAdmin(ctx);
  if (opts.send && !emailConfigured()) throw validation("Brevo no está configurado: copiá el enlace y mandalo vos.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000);
  const row = await getDb().transaction(async (t) => {
    const [r] = await t
      .update(schema.invitation)
      .set({ tokenHash: hashToken(token), expiresAt })
      .where(and(eq(schema.invitation.id, id), scoped(schema.invitation, ctx), isNull(schema.invitation.acceptedAt)))
      .returning();
    if (!r) throw notFound("La invitación");
    await audit(t, ctx, { action: opts.send ? "usuario.invitacion_reenviada" : "usuario.invitacion_renovada", targetType: "invitation", targetId: r.id });
    return r;
  });
  const url = invitationUrl(token);
  const emailed = opts.send ? await sendEmail({ to: row.email, ...inviteEmail(row.role as InviteRole, url, await workspaceName(ctx.workspaceId)) }) : false;
  if (opts.send && !emailed) throw validation("No se pudo enviar el email. Copiá el enlace y mandalo vos.");
  return { url, emailed, expiresAt };
}

export async function revokeInvitation(ctx: Ctx, id: string) {
  assertAdmin(ctx);
  return getDb().transaction(async (t) => {
    const [r] = await t
      .update(schema.invitation)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.invitation.id, id), scoped(schema.invitation, ctx), isNull(schema.invitation.acceptedAt)))
      .returning();
    if (!r) throw notFound("La invitación");
    await audit(t, ctx, { action: "usuario.invitacion_revocada", targetType: "invitation", targetId: r.id, before: { email: r.email } });
    return r;
  });
}

export async function listInvitations(ctx: Ctx) {
  assertAdmin(ctx);
  const rows = await getDb()
    .select({ i: schema.invitation, clientName: schema.client.name })
    .from(schema.invitation)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.invitation.clientId), eq(schema.client.workspaceId, schema.invitation.workspaceId)))
    .where(and(scoped(schema.invitation, ctx), isNull(schema.invitation.acceptedAt)))
    .orderBy(desc(schema.invitation.createdAt));
  const now = Date.now();
  return rows.map(({ i, clientName }) => ({
    id: i.id,
    email: i.email,
    role: i.role as InviteRole,
    clientName,
    projectCount: i.projectIds.length,
    expiresAt: i.expiresAt,
    expired: i.expiresAt.getTime() < now,
    createdAt: i.createdAt,
  }));
}

// --- Aceptar ---

async function findInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
  const [row] = await getDb()
    .select({ i: schema.invitation, workspaceName: schema.workspace.name })
    .from(schema.invitation)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.invitation.workspaceId))
    .where(
      and(
        eq(schema.invitation.tokenHash, hashToken(token)),
        isNull(schema.invitation.deletedAt),
        isNull(schema.invitation.acceptedAt),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

/** Vista pública de una invitación vigente (para /invitacion/[token]). */
export async function openInvitation(token: string) {
  const row = await findInvitation(token);
  if (!row) return null;
  const actx = await getAuth().$context;
  const existing = await actx.internalAdapter.findUserByEmail(row.i.email);
  return {
    email: row.i.email,
    role: row.i.role as InviteRole,
    workspaceName: row.workspaceName,
    hasAccount: Boolean(existing?.user),
    expiresAt: row.i.expiresAt,
  };
}

/** Une al usuario al workspace con el rol de la invitación. La invitación se consume de forma atómica (un solo uso). */
async function joinWorkspace(token: string, user: { id: string; name: string }) {
  const found = await findInvitation(token);
  if (!found) throw notFound("La invitación");
  const inv = found.i;
  return getDb().transaction(async (t) => {
    const [claimed] = await t
      .update(schema.invitation)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.invitation.id, inv.id),
          isNull(schema.invitation.acceptedAt),
          isNull(schema.invitation.deletedAt),
          gt(schema.invitation.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!claimed) throw conflict("Esta invitación ya se usó o venció.");
    const [prev] = await t
      .select()
      .from(schema.membership)
      .where(and(eq(schema.membership.workspaceId, inv.workspaceId), eq(schema.membership.userId, user.id)));
    if (prev?.role === "owner") throw conflict("Ya sos el dueño de este espacio de trabajo.");
    const [m] = prev
      ? await t.update(schema.membership).set({ role: inv.role, status: "active" }).where(eq(schema.membership.id, prev.id)).returning()
      : await t.insert(schema.membership).values({ workspaceId: inv.workspaceId, userId: user.id, role: inv.role, status: "active" }).returning();
    if (!m) throw new Error("No se pudo crear el acceso");
    const ctx: Ctx = { workspaceId: inv.workspaceId, userId: user.id, role: inv.role as Role, actor: { type: "user", id: user.id, name: user.name } };
    await applyRoleScope(t, ctx.workspaceId, user.id, inv.role as InviteRole, { clientId: inv.clientId, projectIds: inv.projectIds });
    await recordEvent(t, ctx, {
      type: "usuario.unido",
      entityType: "membership",
      entityId: m.id,
      summary: `${user.name} aceptó la invitación como ${label(L.role, inv.role).toLowerCase()}`,
      payload: { role: inv.role },
    });
    await audit(t, ctx, { action: "usuario.unido", targetType: "membership", targetId: m.id, after: { role: inv.role } });
    return { role: inv.role as InviteRole, membershipId: m.id, workspaceId: inv.workspaceId };
  });
}

/** Proyectos asignados (member) o cliente del portal (client), según el rol. */
async function applyRoleScope(t: Tx, workspaceId: string, userId: string, role: Role, scope: { clientId?: string | null; projectIds?: string[] }) {
  await t.delete(schema.projectMember).where(and(eq(schema.projectMember.workspaceId, workspaceId), eq(schema.projectMember.userId, userId)));
  await t.delete(schema.userPreference).where(and(eq(schema.userPreference.userId, userId), eq(schema.userPreference.key, portalPrefKey(workspaceId))));
  if (role === "member" && scope.projectIds?.length) {
    // Solo proyectos vigentes del workspace (pudieron borrarse entre la invitación y la aceptación).
    const valid = await t
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(and(eq(schema.project.workspaceId, workspaceId), isNull(schema.project.deletedAt), inArray(schema.project.id, scope.projectIds)));
    if (valid.length)
      await t
        .insert(schema.projectMember)
        .values(valid.map((p) => ({ workspaceId, projectId: p.id, userId })))
        .onConflictDoNothing();
  }
  if (role === "client" && scope.clientId) {
    await t.insert(schema.userPreference).values({ userId, key: portalPrefKey(workspaceId), value: { workspaceId, clientId: scope.clientId } });
  }
}

export const acceptNewUserInput = z
  .object({
    name: z.string().trim().min(2, "Ingresá tu nombre").max(80),
    password: z.string().min(12, "Mínimo 12 caracteres").max(128, "Máximo 128 caracteres"),
    password2: z.string(),
  })
  .refine((v) => v.password === v.password2, { path: ["password2"], message: "Las contraseñas no coinciden" });

/** Invitado sin cuenta: crea el usuario (como en /setup, con el internalAdapter) y lo une al workspace. */
export async function acceptInvitationNewUser(token: string, raw: unknown) {
  const input = acceptNewUserInput.parse(raw);
  const found = await findInvitation(token);
  if (!found) throw notFound("La invitación");
  const email = found.i.email.toLowerCase();
  const auth = getAuth();
  const actx = await auth.$context;
  if (await actx.internalAdapter.findUserByEmail(email)) throw conflict("Ya tenés una cuenta con ese email: iniciá sesión para aceptar.");
  const hashed = await actx.password.hash(input.password);
  const created = await actx.internalAdapter.createUser({ email, name: input.name, emailVerified: true }, { method: "admin" });
  await actx.internalAdapter.linkAccount({ userId: created.id, providerId: "credential", accountId: created.id, password: hashed });
  try {
    const r = await joinWorkspace(token, { id: created.id, name: input.name });
    return { ...r, email, password: input.password };
  } catch (e) {
    // Carrera (dos aceptaciones simultáneas): no dejamos una cuenta huérfana.
    await getDb().delete(schema.user).where(eq(schema.user.id, created.id));
    throw e;
  }
}

/** Invitado con cuenta y sesión iniciada: el email de la sesión tiene que coincidir con el de la invitación. */
export async function acceptInvitationAsUser(token: string, user: { id: string; name: string; email: string }) {
  const found = await findInvitation(token);
  if (!found) throw notFound("La invitación");
  if (found.i.email.toLowerCase() !== user.email.toLowerCase())
    throw forbidden("Esta invitación es para otro email. Cerrá sesión e ingresá con la cuenta invitada.");
  return joinWorkspace(token, user);
}

// --- Usuarios ---

export async function listUsers(ctx: Ctx) {
  assertAdmin(ctx);
  const db = getDb();
  const rows = await db
    .select({
      m: schema.membership,
      name: schema.user.name,
      email: schema.user.email,
      twoFactor: schema.user.twoFactorEnabled,
      lastAccess: sql<Date | null>`(select max(s.updated_at) from session s where s.user_id = ${schema.user.id})`,
    })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(eq(schema.membership.workspaceId, ctx.workspaceId))
    .orderBy(asc(schema.membership.createdAt));
  const userIds = rows.map((r) => r.m.userId);
  const [projects, prefs] = userIds.length
    ? await Promise.all([
        db
          .select({ userId: schema.projectMember.userId, id: schema.project.id, name: schema.project.name })
          .from(schema.projectMember)
          .innerJoin(schema.project, eq(schema.project.id, schema.projectMember.projectId))
          .where(and(eq(schema.projectMember.workspaceId, ctx.workspaceId), isNull(schema.project.deletedAt), inArray(schema.projectMember.userId, userIds))),
        db
          .select({ userId: schema.userPreference.userId, value: schema.userPreference.value })
          .from(schema.userPreference)
          .where(and(eq(schema.userPreference.key, portalPrefKey(ctx.workspaceId)), inArray(schema.userPreference.userId, userIds))),
      ])
    : [[], []];
  const clientIds = prefs.map((p) => (p.value as { clientId?: string }).clientId).filter((x): x is string => Boolean(x));
  const clients = clientIds.length
    ? await db
        .select({ id: schema.client.id, name: schema.client.name })
        .from(schema.client)
        .where(and(eq(schema.client.workspaceId, ctx.workspaceId), inArray(schema.client.id, clientIds)))
    : [];
  return rows.map((r) => {
    const clientId = (prefs.find((p) => p.userId === r.m.userId)?.value as { clientId?: string } | undefined)?.clientId ?? null;
    return {
      membershipId: r.m.id,
      userId: r.m.userId,
      name: r.name,
      email: r.email,
      role: r.m.role as Role,
      status: r.m.status,
      twoFactor: Boolean(r.twoFactor),
      lastAccess: r.lastAccess ? new Date(r.lastAccess) : null,
      projects: projects.filter((p) => p.userId === r.m.userId).map((p) => ({ id: p.id, name: p.name })),
      clientId,
      clientName: clients.find((c) => c.id === clientId)?.name ?? null,
      isMe: r.m.userId === ctx.userId,
    };
  });
}
export type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

async function loadTarget(t: Tx, ctx: Ctx, membershipId: string) {
  const [m] = await t
    .select({ m: schema.membership, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.id, membershipId), eq(schema.membership.workspaceId, ctx.workspaceId)))
    .for("update");
  if (!m) throw notFound("El usuario");
  if (m.m.role === "owner") throw forbidden("El dueño no se puede desactivar ni cambiar de rol.");
  if (m.m.userId === ctx.userId) throw forbidden("No podés cambiar tu propio acceso.");
  return m;
}

export const roleInput = z.object({ role: z.enum(INVITE_ROLES, { error: "Elegí el rol" }), clientId: zOptUuid, projectIds: zIds }).superRefine((v, c) => {
  if (v.role === "client" && !v.clientId) c.addIssue({ code: "custom", path: ["clientId"], message: "Elegí el cliente del CRM" });
});

/** Cambia rol y alcance (proyectos del colaborador / cliente del portal). Las sesiones abiertas toman el cambio en la próxima carga. */
export async function changeRole(ctx: Ctx, membershipId: string, raw: unknown) {
  assertAdmin(ctx);
  const input = roleInput.parse(raw);
  return getDb().transaction(async (t) => {
    const target = await loadTarget(t, ctx, membershipId);
    if (input.role === "client") await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    await assertProjects(t, ctx, input.projectIds);
    const [row] = await t.update(schema.membership).set({ role: input.role }).where(eq(schema.membership.id, membershipId)).returning();
    await applyRoleScope(t, ctx.workspaceId, target.m.userId, input.role, { clientId: input.clientId ?? null, projectIds: input.projectIds });
    await recordEvent(t, ctx, {
      type: "usuario.rol_cambiado",
      entityType: "membership",
      entityId: membershipId,
      summary: `Cambió el rol de ${target.name} a ${label(L.role, input.role).toLowerCase()}`,
      payload: { from: target.m.role, to: input.role },
    });
    await audit(t, ctx, { action: "usuario.rol_cambiado", targetType: "membership", targetId: membershipId, before: { role: target.m.role }, after: input });
    return row;
  });
}

/** Desactiva: bloquea el acceso y revoca todas sus sesiones. No borra datos. */
export async function deactivateUser(ctx: Ctx, membershipId: string) {
  assertAdmin(ctx);
  return getDb().transaction(async (t) => {
    const target = await loadTarget(t, ctx, membershipId);
    const [row] = await t.update(schema.membership).set({ status: "disabled" }).where(eq(schema.membership.id, membershipId)).returning();
    // Solo sus sesiones; si tiene acceso activo a otro workspace se lo deja (hoy hay un workspace por instalación).
    const others = await t
      .select({ id: schema.membership.id })
      .from(schema.membership)
      .where(and(eq(schema.membership.userId, target.m.userId), eq(schema.membership.status, "active"), ne(schema.membership.id, membershipId)));
    if (!others.length) await t.delete(schema.session).where(eq(schema.session.userId, target.m.userId));
    await recordEvent(t, ctx, {
      type: "usuario.desactivado",
      entityType: "membership",
      entityId: membershipId,
      summary: `Desactivó el acceso de ${target.name}`,
    });
    await audit(t, ctx, { action: "usuario.desactivado", targetType: "membership", targetId: membershipId, before: { status: target.m.status } });
    return row;
  });
}

export async function reactivateUser(ctx: Ctx, membershipId: string) {
  assertAdmin(ctx);
  return getDb().transaction(async (t) => {
    const target = await loadTarget(t, ctx, membershipId);
    const [row] = await t.update(schema.membership).set({ status: "active" }).where(eq(schema.membership.id, membershipId)).returning();
    await recordEvent(t, ctx, {
      type: "usuario.reactivado",
      entityType: "membership",
      entityId: membershipId,
      summary: `Reactivó el acceso de ${target.name}`,
    });
    await audit(t, ctx, { action: "usuario.reactivado", targetType: "membership", targetId: membershipId });
    return row;
  });
}

/** Opciones de los formularios: clientes y proyectos activos del workspace. */
export async function userFormOptions(ctx: Ctx) {
  assertAdmin(ctx);
  const db = getDb();
  const [clients, projects] = await Promise.all([
    db
      .select({ id: schema.client.id, name: schema.client.name })
      .from(schema.client)
      .where(and(scoped(schema.client, ctx), sql`${schema.client.status} <> 'archived'`))
      .orderBy(asc(schema.client.name)),
    db
      .select({ id: schema.project.id, name: schema.project.name, clientName: schema.client.name })
      .from(schema.project)
      .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
      .where(and(scoped(schema.project, ctx), sql`${schema.project.status} not in ('done','archived')`))
      .orderBy(asc(schema.project.name)),
  ]);
  return { clients, projects, emailConfigured: emailConfigured() };
}

/**
 * Magic link (M15): solo para usuarios cuyo único acceso activo es de cliente. Dueño, admin y colaboradores
 * entran con contraseña + 2FA (el enlace por email no debe saltear el segundo factor).
 */
export async function magicLinkAllowed(email: string): Promise<boolean> {
  const rows = await getDb()
    .select({ role: schema.membership.role })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(sql`lower(${schema.user.email}) = ${email.trim().toLowerCase()}`, eq(schema.membership.status, "active")));
  return rows.length > 0 && rows.every((r) => r.role === "client");
}
