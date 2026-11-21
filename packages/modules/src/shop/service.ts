import { createHash, randomBytes } from "node:crypto";
import {
  addDays,
  addMoney,
  assertCan,
  type Ctx,
  cmpMoney,
  conflict,
  forbidden,
  fromCents,
  mulMoney,
  notFound,
  subMoney,
  toCents,
  todayAR,
  validation,
  zMoney,
  zOptText,
  zRequired,
} from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { getDb, schema, type Tx } from "@agencyos/db";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { assertPasswordNotPwned, getAuth, hashNewPassword } from "../auth/server";
import { assertOwned } from "../shared/db";
import { emailConfigured, sendEmail } from "../shared/email";

/**
 * SaaS para comercios (ADR 0016): cada comercio es un inquilino aislado con sus usuarios (dueño, administrador,
 * vendedor), productos y stock, clientes, ventas (punto de venta), pedidos, estadísticas y reportes automáticos.
 * La agencia (workspace) crea y administra los comercios; nunca ve ni toca datos de un comercio desde otro.
 */

export const SHOP_ROLES = ["owner", "admin", "seller"] as const;
export type ShopRole = (typeof SHOP_ROLES)[number];
export const SHOP_ROLE_LABEL: Record<ShopRole, string> = { owner: "Dueño", admin: "Administrador", seller: "Vendedor" };
export const PAYMENT_METHODS = ["cash", "debit", "credit", "transfer", "mercadopago", "other"] as const;
export const PAYMENT_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Efectivo",
  debit: "Débito",
  credit: "Crédito",
  transfer: "Transferencia",
  mercadopago: "Mercado Pago",
  other: "Otro",
};
export const ORDER_STATUSES = ["new", "preparing", "ready", "delivered", "cancelled"] as const;
export const ORDER_LABEL: Record<(typeof ORDER_STATUSES)[number], string> = {
  new: "Nuevo",
  preparing: "En preparación",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
export const CHANNELS = ["local", "whatsapp", "web", "phone", "instagram", "other"] as const;
export const CHANNEL_LABEL: Record<(typeof CHANNELS)[number], string> = {
  local: "Local",
  whatsapp: "WhatsApp",
  web: "Web",
  phone: "Teléfono",
  instagram: "Instagram",
  other: "Otro",
};

export type ShopCtx = { shopId: string; userId: string; role: ShopRole; actorName: string; shopName: string; currency: string; settings: ShopSettings };
export type ShopSettings = { allowNegativeStock?: boolean; weeklyReport?: boolean; brandColor?: string };

const INVITE_DAYS = 7;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function assertRole(sc: ShopCtx, roles: ShopRole[], what = "Esto") {
  if (!roles.includes(sc.role)) throw forbidden(`${what} lo hace el dueño o un administrador del comercio.`);
}

async function touch(t: Tx, shopId: string) {
  await t.update(schema.shop).set({ lastActivityAt: new Date() }).where(eq(schema.shop.id, shopId));
}

// ---------- Sesión: a qué comercio entra el usuario ----------

export async function shopMemberships(userId: string) {
  return getDb()
    .select({ m: schema.shopMember, s: schema.shop })
    .from(schema.shopMember)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.shopMember.shopId))
    .where(and(eq(schema.shopMember.userId, userId), eq(schema.shopMember.active, true), eq(schema.shop.status, "active")))
    .orderBy(asc(schema.shop.name));
}

export async function resolveShop(user: { id: string; name: string }, preferredShopId?: string | null): Promise<ShopCtx | null> {
  const rows = await shopMemberships(user.id);
  const r = rows.find((x) => x.s.id === preferredShopId) ?? rows[0];
  if (!r) return null;
  return {
    shopId: r.s.id,
    userId: user.id,
    role: r.m.role as ShopRole,
    actorName: user.name,
    shopName: r.s.name,
    currency: r.s.currency,
    settings: (r.s.settings ?? {}) as ShopSettings,
  };
}

// ---------- Agencia: alta y administración de comercios ----------

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "comercio";

export const shopInput = z.object({
  name: zRequired(80, "El nombre del comercio"),
  clientId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  ownerName: zRequired(80, "El nombre del dueño"),
  ownerEmail: z.string().trim().toLowerCase().email("Email inválido"),
});

async function newInvitation(t: Tx, shopId: string, input: { email: string; name: string; role: ShopRole }, createdBy: string | null) {
  const token = randomBytes(32).toString("base64url");
  await t
    .update(schema.shopInvitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.shopInvitation.shopId, shopId), eq(schema.shopInvitation.email, input.email), isNull(schema.shopInvitation.acceptedAt)));
  const [row] = await t
    .insert(schema.shopInvitation)
    .values({
      shopId,
      email: input.email,
      name: input.name,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      createdBy,
    })
    .returning();
  return { row, url: `${appUrl()}/comercio/invitacion/${token}` };
}

async function emailInvite(email: string, shopName: string, url: string) {
  if (!emailConfigured()) return false;
  return sendEmail({
    to: email,
    subject: `${shopName} · Tu acceso al sistema de gestión`,
    text: `Te dieron acceso al sistema de gestión de ${shopName}.\n\nCreá tu contraseña con este enlace (vence en ${INVITE_DAYS} días):\n${url}\n\nLuciano Rosano`,
  });
}

export async function createShop(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  const input = shopInput.parse(raw);
  const r = await getDb().transaction(async (t) => {
    if (input.clientId) await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    let slug = slugify(input.name);
    for (let i = 2; (await t.select({ id: schema.shop.id }).from(schema.shop).where(eq(schema.shop.slug, slug))).length; i++)
      slug = `${slugify(input.name)}-${i}`;
    const [shop] = await t
      .insert(schema.shop)
      .values({
        workspaceId: ctx.workspaceId,
        clientId: input.clientId ?? null,
        name: input.name,
        slug,
        createdBy: ctx.userId,
        settings: { weeklyReport: true },
      })
      .returning();
    if (!shop) throw new Error("No se pudo crear el comercio");
    const inv = await newInvitation(t, shop.id, { email: input.ownerEmail, name: input.ownerName, role: "owner" }, ctx.userId);
    await recordEvent(t, ctx, {
      type: "comercio.creado",
      entityType: "client",
      entityId: input.clientId,
      summary: `Creó el comercio «${shop.name}» en el SaaS`,
    });
    await audit(t, ctx, { action: "comercio.creado", targetType: "shop", targetId: shop.id, after: { name: shop.name, owner: input.ownerEmail } });
    return { shop, url: inv.url };
  });
  return { ...r, emailed: await emailInvite(input.ownerEmail, r.shop.name, r.url) };
}

export async function setShopStatus(ctx: Ctx, id: string, status: "active" | "suspended") {
  assertCan(ctx, "manage", "settings");
  const s = z.enum(["active", "suspended"]).parse(status);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.shop)
      .set({ status: s })
      .where(and(eq(schema.shop.id, id), eq(schema.shop.workspaceId, ctx.workspaceId)))
      .returning();
    if (!row) throw notFound("El comercio");
    await audit(t, ctx, { action: `comercio.${s}`, targetType: "shop", targetId: id });
    return row;
  });
}

/** Nuevo enlace de acceso para el dueño (si perdió el anterior o venció). */
export async function reinviteShopOwner(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  const input = z.object({ name: zRequired(80, "El nombre"), email: z.string().trim().toLowerCase().email("Email inválido") }).parse(raw);
  const r = await getDb().transaction(async (t) => {
    const [s] = await t
      .select()
      .from(schema.shop)
      .where(and(eq(schema.shop.id, id), eq(schema.shop.workspaceId, ctx.workspaceId)));
    if (!s) throw notFound("El comercio");
    const inv = await newInvitation(t, id, { email: input.email, name: input.name, role: "owner" }, ctx.userId);
    return { shopName: s.name, url: inv.url };
  });
  return { url: r.url, emailed: await emailInvite(input.email, r.shopName, r.url) };
}

/** Panel de administración (agencia): todos los comercios con su actividad del mes. */
export async function listShops(ctx: Ctx) {
  assertCan(ctx, "manage", "settings");
  const month = `${todayAR().slice(0, 7)}-01`;
  return getDb()
    .select({
      s: schema.shop,
      clientName: schema.client.name,
      members: sql<number>`(select count(*)::int from shop_member m where m.shop_id = ${schema.shop.id} and m.active)`,
      products: sql<number>`(select count(*)::int from shop_product p where p.shop_id = ${schema.shop.id} and p.active)`,
      salesMonth: sql<string>`(select coalesce(sum(total),0)::text from shop_sale v where v.shop_id = ${schema.shop.id} and v.status = 'completed' and v.day >= ${month}::date)`,
      salesCount: sql<number>`(select count(*)::int from shop_sale v where v.shop_id = ${schema.shop.id} and v.status = 'completed' and v.day >= ${month}::date)`,
      pendingInvite: sql<boolean>`exists (select 1 from shop_invitation i where i.shop_id = ${schema.shop.id} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())`,
    })
    .from(schema.shop)
    .leftJoin(schema.client, eq(schema.client.id, schema.shop.clientId))
    .where(eq(schema.shop.workspaceId, ctx.workspaceId))
    .orderBy(asc(schema.shop.name));
}

// ---------- Usuarios del comercio ----------

export const memberInviteInput = z.object({
  name: zRequired(80, "El nombre"),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  role: z.enum(SHOP_ROLES).default("seller"),
});

export async function inviteMember(sc: ShopCtx, raw: unknown) {
  assertRole(sc, ["owner", "admin"], "Invitar usuarios");
  const input = memberInviteInput.parse(raw);
  if (input.role === "owner" && sc.role !== "owner") throw forbidden("Solo el dueño puede sumar otro dueño.");
  const r = await getDb().transaction(async (t) => {
    const [already] = await t
      .select({ id: schema.shopMember.id })
      .from(schema.shopMember)
      .innerJoin(schema.user, eq(schema.user.id, schema.shopMember.userId))
      .where(and(eq(schema.shopMember.shopId, sc.shopId), eq(schema.shopMember.active, true), sql`lower(${schema.user.email}) = ${input.email}`));
    if (already) throw validation("Esa persona ya tiene acceso.", { email: "Ya es usuario" });
    return newInvitation(t, sc.shopId, input, sc.userId);
  });
  return { url: r.url, emailed: await emailInvite(input.email, sc.shopName, r.url) };
}

async function findInvitation(token: string) {
  const [row] = await getDb()
    .select({ i: schema.shopInvitation, shopName: schema.shop.name, shopStatus: schema.shop.status })
    .from(schema.shopInvitation)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.shopInvitation.shopId))
    .where(eq(schema.shopInvitation.tokenHash, hashToken(token)));
  if (!row || row.i.acceptedAt || row.i.revokedAt || row.i.expiresAt < new Date() || row.shopStatus !== "active") return null;
  return row;
}

export async function openShopInvitation(token: string) {
  const r = await findInvitation(token);
  if (!r) return null;
  const actx = await getAuth().$context;
  const existing = await actx.internalAdapter.findUserByEmail(r.i.email);
  return { email: r.i.email, name: r.i.name, role: r.i.role as ShopRole, shopName: r.shopName, hasAccount: Boolean(existing) };
}

async function join(token: string, user: { id: string }) {
  return getDb().transaction(async (t) => {
    const [inv] = await t
      .select()
      .from(schema.shopInvitation)
      .where(and(eq(schema.shopInvitation.tokenHash, hashToken(token)), isNull(schema.shopInvitation.acceptedAt)))
      .for("update");
    if (!inv) throw conflict("La invitación ya se usó.");
    await t
      .insert(schema.shopMember)
      .values({ shopId: inv.shopId, userId: user.id, role: inv.role })
      .onConflictDoUpdate({ target: [schema.shopMember.shopId, schema.shopMember.userId], set: { role: inv.role, active: true } });
    await t.update(schema.shopInvitation).set({ acceptedAt: new Date() }).where(eq(schema.shopInvitation.id, inv.id));
    return { shopId: inv.shopId };
  });
}

export const acceptShopInput = z
  .object({
    name: z.string().trim().min(2, "Ingresá tu nombre").max(80),
    password: z.string().min(12, "Mínimo 12 caracteres").max(128, "Máximo 128 caracteres"),
    password2: z.string(),
  })
  .refine((v) => v.password === v.password2, { path: ["password2"], message: "Las contraseñas no coinciden" });

export async function acceptShopInvitationNewUser(token: string, raw: unknown) {
  const input = acceptShopInput.parse(raw);
  const found = await findInvitation(token);
  if (!found) throw notFound("La invitación");
  const email = found.i.email.toLowerCase();
  const actx = await getAuth().$context;
  if (await actx.internalAdapter.findUserByEmail(email)) throw conflict("Ya tenés una cuenta con ese email: iniciá sesión para aceptar.");
  await assertPasswordNotPwned(input.password);
  const hashed = await hashNewPassword(input.password);
  const created = await actx.internalAdapter.createUser({ email, name: input.name, emailVerified: true }, { method: "admin" });
  await actx.internalAdapter.linkAccount({ userId: created.id, providerId: "credential", accountId: created.id, password: hashed });
  try {
    const r = await join(token, created);
    return { ...r, email, password: input.password };
  } catch (e) {
    await getDb().delete(schema.user).where(eq(schema.user.id, created.id));
    throw e;
  }
}

export async function acceptShopInvitationAsUser(token: string, user: { id: string; email: string }) {
  const found = await findInvitation(token);
  if (!found) throw notFound("La invitación");
  if (found.i.email.toLowerCase() !== user.email.toLowerCase()) throw forbidden("Esta invitación es para otro email.");
  return join(token, user);
}

export async function listMembers(sc: ShopCtx) {
  const [members, invitations] = await Promise.all([
    getDb()
      .select({ m: schema.shopMember, name: schema.user.name, email: schema.user.email })
      .from(schema.shopMember)
      .innerJoin(schema.user, eq(schema.user.id, schema.shopMember.userId))
      .where(eq(schema.shopMember.shopId, sc.shopId))
      .orderBy(asc(schema.user.name)),
    getDb()
      .select()
      .from(schema.shopInvitation)
      .where(
        and(
          eq(schema.shopInvitation.shopId, sc.shopId),
          isNull(schema.shopInvitation.acceptedAt),
          isNull(schema.shopInvitation.revokedAt),
          sql`${schema.shopInvitation.expiresAt} > now()`,
        ),
      ),
  ]);
  return { members, invitations };
}

export async function setMemberActive(sc: ShopCtx, memberId: string, active: boolean) {
  assertRole(sc, ["owner", "admin"], "Activar o desactivar usuarios");
  return getDb().transaction(async (t) => {
    const [m] = await t
      .select()
      .from(schema.shopMember)
      .where(and(eq(schema.shopMember.id, memberId), eq(schema.shopMember.shopId, sc.shopId)));
    if (!m) throw notFound("El usuario");
    if (m.userId === sc.userId) throw validation("No podés desactivarte a vos mismo.");
    if (m.role === "owner" && sc.role !== "owner") throw forbidden("Solo el dueño puede desactivar a otro dueño.");
    const [row] = await t.update(schema.shopMember).set({ active }).where(eq(schema.shopMember.id, memberId)).returning();
    return row;
  });
}

export const settingsInput = z.object({
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(2).max(80).optional()),
  allowNegativeStock: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  weeklyReport: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
});

export async function updateShopSettings(sc: ShopCtx, raw: unknown) {
  assertRole(sc, ["owner", "admin"], "Cambiar los ajustes");
  const input = settingsInput.parse(raw);
  const [row] = await getDb()
    .update(schema.shop)
    .set({
      ...(input.name && sc.role === "owner" ? { name: input.name } : {}),
      settings: sql`${schema.shop.settings} || ${JSON.stringify({ allowNegativeStock: input.allowNegativeStock, weeklyReport: input.weeklyReport })}::jsonb`,
    })
    .where(eq(schema.shop.id, sc.shopId))
    .returning();
  return row;
}

// ---------- Productos y stock ----------

const optStr = (max: number) => z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(max).optional());
const nonNegMoney = zMoney.refine((v) => cmpMoney(v, "0") >= 0, "No puede ser negativo");

export const productInput = z.object({
  name: zRequired(160, "El nombre"),
  sku: optStr(60),
  barcode: optStr(60),
  category: optStr(60),
  price: nonNegMoney,
  cost: z.preprocess((v) => (v === "" || v === null ? undefined : v), nonNegMoney.optional()),
  stock: z.coerce.number().int().min(0).max(10_000_000).default(0),
  minStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export async function createProduct(sc: ShopCtx, raw: unknown) {
  assertRole(sc, ["owner", "admin"], "Cargar productos");
  const input = productInput.parse(raw);
  return getDb().transaction(async (t) => {
    if (input.sku) {
      const [dup] = await t
        .select({ id: schema.shopProduct.id })
        .from(schema.shopProduct)
        .where(and(eq(schema.shopProduct.shopId, sc.shopId), eq(schema.shopProduct.sku, input.sku)));
      if (dup) throw validation("Ya hay un producto con ese código", { sku: "Código repetido" });
    }
    const [p] = await t
      .insert(schema.shopProduct)
      .values({
        shopId: sc.shopId,
        createdBy: sc.userId,
        ...input,
        cost: input.cost ?? null,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        category: input.category ?? null,
      })
      .returning();
    if (!p) throw new Error("No se pudo crear el producto");
    if (input.stock > 0)
      await t
        .insert(schema.shopStockMove)
        .values({ shopId: sc.shopId, productId: p.id, qty: input.stock, reason: "initial", stockAfter: input.stock, createdBy: sc.userId });
    await touch(t, sc.shopId);
    return p;
  });
}

export async function updateProduct(sc: ShopCtx, id: string, raw: unknown) {
  assertRole(sc, ["owner", "admin"], "Editar productos");
  const input = productInput.omit({ stock: true }).parse(raw);
  const [p] = await getDb()
    .update(schema.shopProduct)
    .set({ ...input, cost: input.cost ?? null, sku: input.sku ?? null, barcode: input.barcode ?? null, category: input.category ?? null })
    .where(and(eq(schema.shopProduct.id, id), eq(schema.shopProduct.shopId, sc.shopId)))
    .returning();
  if (!p) throw notFound("El producto");
  return p;
}

export async function setProductActive(sc: ShopCtx, id: string, active: boolean) {
  assertRole(sc, ["owner", "admin"], "Dar de baja productos");
  const [p] = await getDb()
    .update(schema.shopProduct)
    .set({ active })
    .where(and(eq(schema.shopProduct.id, id), eq(schema.shopProduct.shopId, sc.shopId)))
    .returning();
  if (!p) throw notFound("El producto");
  return p;
}

export const stockInput = z.object({
  qty: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "Ingresá una cantidad distinta de 0"),
  reason: z.enum(["purchase", "adjust", "return"]).default("purchase"),
  note: zOptText(300),
});

/** Entrada (compra, devolución) o ajuste de stock: queda el movimiento con el stock resultante. */
export async function adjustStock(sc: ShopCtx, productId: string, raw: unknown) {
  assertRole(sc, ["owner", "admin"], "Ajustar stock");
  const input = stockInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [p] = await t
      .select()
      .from(schema.shopProduct)
      .where(and(eq(schema.shopProduct.id, productId), eq(schema.shopProduct.shopId, sc.shopId)))
      .for("update");
    if (!p) throw notFound("El producto");
    const after = p.stock + input.qty;
    if (after < 0 && !sc.settings.allowNegativeStock) throw validation(`El stock quedaría en ${after}.`, { qty: "Stock insuficiente" });
    await t.update(schema.shopProduct).set({ stock: after }).where(eq(schema.shopProduct.id, p.id));
    await t
      .insert(schema.shopStockMove)
      .values({ shopId: sc.shopId, productId: p.id, qty: input.qty, reason: input.reason, note: input.note ?? null, stockAfter: after, createdBy: sc.userId });
    await touch(t, sc.shopId);
    return { stock: after };
  });
}

export async function listProducts(sc: ShopCtx, f: { q?: string; low?: boolean; inactive?: boolean } = {}) {
  const q = f.q?.trim();
  return getDb()
    .select()
    .from(schema.shopProduct)
    .where(
      and(
        eq(schema.shopProduct.shopId, sc.shopId),
        f.inactive ? undefined : eq(schema.shopProduct.active, true),
        f.low ? sql`${schema.shopProduct.stock} <= ${schema.shopProduct.minStock}` : undefined,
        q
          ? or(
              sql`f_search_norm(${schema.shopProduct.name}) like '%' || f_search_norm(${q}) || '%'`,
              ilike(schema.shopProduct.sku, `${q}%`),
              eq(schema.shopProduct.barcode, q),
              sql`f_search_norm(coalesce(${schema.shopProduct.category}, '')) like '%' || f_search_norm(${q}) || '%'`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(schema.shopProduct.name))
    .limit(q ? 50 : 1000);
}

export async function productMoves(sc: ShopCtx, productId: string) {
  return getDb()
    .select()
    .from(schema.shopStockMove)
    .where(and(eq(schema.shopStockMove.shopId, sc.shopId), eq(schema.shopStockMove.productId, productId)))
    .orderBy(desc(schema.shopStockMove.at))
    .limit(100);
}

// ---------- Clientes del comercio ----------

export const customerInput = z.object({
  name: zRequired(120, "El nombre"),
  phone: optStr(40),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email("Email inválido").optional()),
  doc: optStr(20),
  notes: zOptText(2000),
});

export async function createCustomer(sc: ShopCtx, raw: unknown) {
  const input = customerInput.parse(raw);
  const [c] = await getDb()
    .insert(schema.shopCustomer)
    .values({
      shopId: sc.shopId,
      createdBy: sc.userId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      doc: input.doc ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return c;
}

export async function updateCustomer(sc: ShopCtx, id: string, raw: unknown) {
  const input = customerInput.parse(raw);
  const [c] = await getDb()
    .update(schema.shopCustomer)
    .set({ name: input.name, phone: input.phone ?? null, email: input.email ?? null, doc: input.doc ?? null, notes: input.notes ?? null })
    .where(and(eq(schema.shopCustomer.id, id), eq(schema.shopCustomer.shopId, sc.shopId)))
    .returning();
  if (!c) throw notFound("El cliente");
  return c;
}

export async function listCustomers(sc: ShopCtx, q?: string) {
  const term = q?.trim();
  return getDb()
    .select({
      c: schema.shopCustomer,
      spent: sql<string>`(select coalesce(sum(total),0)::text from shop_sale v where v.customer_id = ${schema.shopCustomer.id} and v.status = 'completed')`,
      purchases: sql<number>`(select count(*)::int from shop_sale v where v.customer_id = ${schema.shopCustomer.id} and v.status = 'completed')`,
      lastPurchase: sql<string | null>`(select max(day)::text from shop_sale v where v.customer_id = ${schema.shopCustomer.id} and v.status = 'completed')`,
    })
    .from(schema.shopCustomer)
    .where(
      and(
        eq(schema.shopCustomer.shopId, sc.shopId),
        term
          ? or(sql`f_search_norm(${schema.shopCustomer.name}) like '%' || f_search_norm(${term}) || '%'`, ilike(schema.shopCustomer.phone, `%${term}%`))
          : undefined,
      ),
    )
    .orderBy(asc(schema.shopCustomer.name))
    .limit(term ? 30 : 1000);
}

async function assertCustomer(t: Tx, sc: ShopCtx, id?: string) {
  if (!id) return;
  const [c] = await t
    .select({ id: schema.shopCustomer.id })
    .from(schema.shopCustomer)
    .where(and(eq(schema.shopCustomer.id, id), eq(schema.shopCustomer.shopId, sc.shopId)));
  if (!c) throw notFound("El cliente");
}

// ---------- Ventas (punto de venta) ----------

const itemsInput = z
  .array(
    z.object({
      productId: z.string().uuid(),
      qty: z.coerce.number().int().min(1).max(100_000),
      unitPrice: z.preprocess((v) => (v === "" ? undefined : v), nonNegMoney.optional()),
    }),
  )
  .min(1, "Agregá al menos un producto")
  .max(200);

export const saleInput = z.object({
  items: itemsInput,
  customerId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  discount: z.preprocess((v) => (v === "" || v === undefined ? "0" : v), nonNegMoney),
  paymentMethod: z.enum(PAYMENT_METHODS),
});

async function nextNumber(t: Tx, table: typeof schema.shopSale | typeof schema.shopOrder, shopId: string) {
  // El lock de la fila del comercio serializa la numeración entre cajas simultáneas.
  await t.select({ id: schema.shop.id }).from(schema.shop).where(eq(schema.shop.id, shopId)).for("update");
  const [{ n } = { n: 0 }] = await t
    .select({ n: sql<number>`coalesce(max(${table.number}), 0)::int` })
    .from(table)
    .where(eq(table.shopId, shopId));
  return n + 1;
}

async function pricedLines(t: Tx, sc: ShopCtx, items: z.infer<typeof itemsInput>, opts: { lock: boolean; allowPriceOverride: boolean }) {
  const ids = [...new Set(items.map((i) => i.productId))].sort();
  const q = t
    .select()
    .from(schema.shopProduct)
    .where(and(eq(schema.shopProduct.shopId, sc.shopId), inArray(schema.shopProduct.id, ids)))
    .orderBy(asc(schema.shopProduct.id));
  const products = await (opts.lock ? q.for("update") : q);
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((i) => {
    const p = byId.get(i.productId);
    if (!p || !p.active) throw validation("Un producto de la lista ya no está disponible.");
    const unitPrice = opts.allowPriceOverride && i.unitPrice !== undefined ? i.unitPrice : p.price;
    return { p, qty: i.qty, unitPrice, lineTotal: mulMoney(unitPrice, i.qty) };
  });
}

async function insertSale(t: Tx, sc: ShopCtx, input: z.infer<typeof saleInput>, orderId: string | null) {
  const lines = await pricedLines(t, sc, input.items, { lock: true, allowPriceOverride: sc.role !== "seller" });
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.p.id, (need.get(l.p.id) ?? 0) + l.qty);
  for (const [id, qty] of need) {
    const p = lines.find((l) => l.p.id === id)?.p;
    if (p && p.stock - qty < 0 && !sc.settings.allowNegativeStock) throw validation(`No hay stock suficiente de «${p.name}» (quedan ${p.stock}).`);
  }
  const subtotal = addMoney(...lines.map((l) => l.lineTotal));
  if (cmpMoney(input.discount, subtotal) > 0) throw validation("El descuento supera el total", { discount: "Supera el total" });
  const number = await nextNumber(t, schema.shopSale, sc.shopId);
  const [sale] = await t
    .insert(schema.shopSale)
    .values({
      shopId: sc.shopId,
      createdBy: sc.userId,
      number,
      customerId: input.customerId ?? null,
      orderId,
      subtotal,
      discount: input.discount,
      total: subMoney(subtotal, input.discount),
      paymentMethod: input.paymentMethod,
      day: todayAR(),
    })
    .returning();
  if (!sale) throw new Error("No se pudo registrar la venta");
  await t.insert(schema.shopSaleItem).values(
    lines.map((l) => ({
      shopId: sc.shopId,
      saleId: sale.id,
      productId: l.p.id,
      name: l.p.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      unitCost: l.p.cost,
      lineTotal: l.lineTotal,
    })),
  );
  for (const [id, qty] of need) {
    const [u] = await t
      .update(schema.shopProduct)
      .set({ stock: sql`${schema.shopProduct.stock} - ${qty}` })
      .where(eq(schema.shopProduct.id, id))
      .returning({ stock: schema.shopProduct.stock });
    await t
      .insert(schema.shopStockMove)
      .values({ shopId: sc.shopId, productId: id, qty: -qty, reason: "sale", refId: sale.id, stockAfter: u?.stock ?? 0, createdBy: sc.userId });
  }
  await touch(t, sc.shopId);
  return sale;
}

/** Venta en el mostrador: precios del catálogo (el vendedor no los cambia), stock descontado en la misma transacción. */
export async function createSale(sc: ShopCtx, raw: unknown) {
  const input = saleInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertCustomer(t, sc, input.customerId);
    return insertSale(t, sc, input, null);
  });
}

/** Anular una venta: vuelve el stock (con su movimiento) y deja de contar en las estadísticas. */
export async function cancelSale(sc: ShopCtx, id: string) {
  assertRole(sc, ["owner", "admin"], "Anular ventas");
  return getDb().transaction(async (t) => {
    const [s] = await t
      .select()
      .from(schema.shopSale)
      .where(and(eq(schema.shopSale.id, id), eq(schema.shopSale.shopId, sc.shopId)))
      .for("update");
    if (!s) throw notFound("La venta");
    if (s.status === "cancelled") throw conflict("La venta ya estaba anulada.");
    const items = await t.select().from(schema.shopSaleItem).where(eq(schema.shopSaleItem.saleId, id));
    for (const it of items) {
      const [u] = await t
        .update(schema.shopProduct)
        .set({ stock: sql`${schema.shopProduct.stock} + ${it.qty}` })
        .where(and(eq(schema.shopProduct.id, it.productId), eq(schema.shopProduct.shopId, sc.shopId)))
        .returning({ stock: schema.shopProduct.stock });
      await t
        .insert(schema.shopStockMove)
        .values({ shopId: sc.shopId, productId: it.productId, qty: it.qty, reason: "sale_cancel", refId: id, stockAfter: u?.stock ?? 0, createdBy: sc.userId });
    }
    const [row] = await t.update(schema.shopSale).set({ status: "cancelled" }).where(eq(schema.shopSale.id, id)).returning();
    return row;
  });
}

export async function listSales(sc: ShopCtx, f: { from?: string; to?: string; limit?: number } = {}) {
  return getDb()
    .select({
      s: schema.shopSale,
      customer: schema.shopCustomer.name,
      items: sql<number>`(select coalesce(sum(qty),0)::int from shop_sale_item i where i.sale_id = ${schema.shopSale.id})`,
    })
    .from(schema.shopSale)
    .leftJoin(schema.shopCustomer, eq(schema.shopCustomer.id, schema.shopSale.customerId))
    .where(
      and(
        eq(schema.shopSale.shopId, sc.shopId),
        f.from ? sql`${schema.shopSale.day} >= ${f.from}::date` : undefined,
        f.to ? sql`${schema.shopSale.day} <= ${f.to}::date` : undefined,
      ),
    )
    .orderBy(desc(schema.shopSale.number))
    .limit(f.limit ?? 300);
}

export async function getSale(sc: ShopCtx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [s] = await getDb()
    .select({ s: schema.shopSale, customer: schema.shopCustomer.name })
    .from(schema.shopSale)
    .leftJoin(schema.shopCustomer, eq(schema.shopCustomer.id, schema.shopSale.customerId))
    .where(and(eq(schema.shopSale.id, id), eq(schema.shopSale.shopId, sc.shopId)));
  if (!s) return null;
  const items = await getDb().select().from(schema.shopSaleItem).where(eq(schema.shopSaleItem.saleId, id));
  return { ...s, items };
}

// ---------- Pedidos ----------

export const orderInput = z.object({
  items: itemsInput,
  customerId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  channel: z.enum(CHANNELS).default("local"),
  deliveryDate: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
  notes: zOptText(2000),
});

export async function createOrder(sc: ShopCtx, raw: unknown) {
  const input = orderInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertCustomer(t, sc, input.customerId);
    const lines = await pricedLines(t, sc, input.items, { lock: false, allowPriceOverride: sc.role !== "seller" });
    const number = await nextNumber(t, schema.shopOrder, sc.shopId);
    const [o] = await t
      .insert(schema.shopOrder)
      .values({
        shopId: sc.shopId,
        createdBy: sc.userId,
        number,
        customerId: input.customerId ?? null,
        channel: input.channel,
        deliveryDate: input.deliveryDate ?? null,
        notes: input.notes ?? null,
        total: addMoney(...lines.map((l) => l.lineTotal)),
      })
      .returning();
    if (!o) throw new Error("No se pudo crear el pedido");
    await t
      .insert(schema.shopOrderItem)
      .values(
        lines.map((l) => ({ shopId: sc.shopId, orderId: o.id, productId: l.p.id, name: l.p.name, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
      );
    await touch(t, sc.shopId);
    return o;
  });
}

/** Avanzar un pedido. Al entregarlo se registra la venta (descuenta stock) con el medio de pago. */
export async function setOrderStatus(sc: ShopCtx, id: string, status: string, opts: { paymentMethod?: string } = {}) {
  const s = z.enum(ORDER_STATUSES).parse(status);
  return getDb().transaction(async (t) => {
    const [o] = await t
      .select()
      .from(schema.shopOrder)
      .where(and(eq(schema.shopOrder.id, id), eq(schema.shopOrder.shopId, sc.shopId)))
      .for("update");
    if (!o) throw notFound("El pedido");
    if (o.status === "delivered" || o.status === "cancelled") throw conflict("El pedido ya está cerrado.");
    let saleId: string | null = null;
    if (s === "delivered") {
      const pm = z.enum(PAYMENT_METHODS, { error: "Elegí el medio de pago" }).parse(opts.paymentMethod);
      const items = await t.select().from(schema.shopOrderItem).where(eq(schema.shopOrderItem.orderId, id));
      const sale = await insertSale(
        t,
        { ...sc, role: "admin" }, // respeta los precios acordados en el pedido
        {
          items: items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice })),
          customerId: o.customerId ?? undefined,
          discount: "0",
          paymentMethod: pm,
        },
        id,
      );
      saleId = sale.id;
    }
    const [row] = await t
      .update(schema.shopOrder)
      .set({ status: s, ...(saleId ? { saleId } : {}) })
      .where(eq(schema.shopOrder.id, id))
      .returning();
    return row;
  });
}

export async function listOrders(sc: ShopCtx, f: { open?: boolean } = {}) {
  return getDb()
    .select({
      o: schema.shopOrder,
      customer: schema.shopCustomer.name,
      phone: schema.shopCustomer.phone,
      items: sql<string>`(select string_agg(i.qty || ' × ' || i.name, ', ') from shop_order_item i where i.order_id = ${schema.shopOrder.id})`,
    })
    .from(schema.shopOrder)
    .leftJoin(schema.shopCustomer, eq(schema.shopCustomer.id, schema.shopOrder.customerId))
    .where(and(eq(schema.shopOrder.shopId, sc.shopId), f.open ? inArray(schema.shopOrder.status, ["new", "preparing", "ready"]) : undefined))
    .orderBy(sql`case ${schema.shopOrder.status} when 'new' then 0 when 'preparing' then 1 when 'ready' then 2 else 3 end`, desc(schema.shopOrder.number))
    .limit(300);
}

// ---------- Estadísticas ----------

export async function shopStats(sc: ShopCtx, today = todayAR()) {
  const db = getDb();
  const month = `${today.slice(0, 7)}-01`;
  const prevMonth = `${addDays(month, -1).slice(0, 7)}-01`;
  const d30 = addDays(today, -29);
  const sid = sc.shopId;
  const [[k], daily, top, customers, low, pending] = await Promise.all([
    db
      .execute<{ today_total: string; today_count: number; month_total: string; month_count: number; prev_total: string; month_margin: string | null }>(sql`
      select
        coalesce(sum(total) filter (where day = ${today}::date), 0)::text as today_total,
        count(*) filter (where day = ${today}::date)::int as today_count,
        coalesce(sum(total) filter (where day >= ${month}::date), 0)::text as month_total,
        count(*) filter (where day >= ${month}::date)::int as month_count,
        coalesce(sum(total) filter (where day >= ${prevMonth}::date and day < ${month}::date), 0)::text as prev_total,
        (select sum((i.unit_price - i.unit_cost) * i.qty)::text from shop_sale_item i join shop_sale v on v.id = i.sale_id
          where v.shop_id = ${sid} and v.status = 'completed' and v.day >= ${month}::date and i.unit_cost is not null) as month_margin
      from shop_sale where shop_id = ${sid} and status = 'completed' and day >= ${prevMonth}::date`)
      .then((r) => r.rows),
    db
      .execute<{ day: string; total: string; n: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(v.total), 0)::text as total, count(v.id)::int as n
      from generate_series(${d30}::date, ${today}::date, interval '1 day') d
      left join shop_sale v on v.day = d::date and v.shop_id = ${sid} and v.status = 'completed'
      group by d order by d`)
      .then((r) => r.rows),
    db
      .execute<{ name: string; qty: number; total: string }>(sql`
      select i.name, sum(i.qty)::int as qty, sum(i.line_total)::text as total from shop_sale_item i join shop_sale v on v.id = i.sale_id
      where v.shop_id = ${sid} and v.status = 'completed' and v.day >= ${d30}::date group by i.name order by sum(i.line_total) desc limit 5`)
      .then((r) => r.rows),
    db
      .execute<{ name: string; n: number; total: string }>(sql`
      select c.name, count(*)::int as n, sum(v.total)::text as total from shop_sale v join shop_customer c on c.id = v.customer_id
      where v.shop_id = ${sid} and v.status = 'completed' and v.day >= ${d30}::date group by c.name order by sum(v.total) desc limit 5`)
      .then((r) => r.rows),
    listProducts(sc, { low: true }),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.shopOrder)
      .where(and(eq(schema.shopOrder.shopId, sid), inArray(schema.shopOrder.status, ["new", "preparing", "ready"]))),
  ]);
  const monthCount = k?.month_count ?? 0;
  return {
    today: { total: k?.today_total ?? "0", count: k?.today_count ?? 0 },
    month: {
      total: k?.month_total ?? "0",
      count: monthCount,
      prev: k?.prev_total ?? "0",
      avgTicket: monthCount ? fromCents(toCents(k?.month_total ?? "0") / BigInt(monthCount)) : "0",
      margin: k?.month_margin ?? null,
    },
    daily,
    top,
    customers,
    low,
    pendingOrders: pending[0]?.n ?? 0,
  };
}

export async function getProduct(sc: ShopCtx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await getDb()
    .select()
    .from(schema.shopProduct)
    .where(and(eq(schema.shopProduct.id, id), eq(schema.shopProduct.shopId, sc.shopId)));
  return p ?? null;
}
