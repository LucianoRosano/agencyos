import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pk, tz } from "./_common";

/**
 * SaaS para comercios (ADR 0016). Cada comercio (`shop`) es un inquilino aislado: todas sus tablas llevan `shop_id`
 * y los casos de uso filtran siempre por el comercio de la sesión. La agencia que lo administra es `workspace_id`
 * (y opcionalmente el cliente del CRM). Dinero en numeric(14,2) como en el resto del sistema.
 */
const money = (n: string) => numeric(n, { precision: 14, scale: 2 });

const shopBase = () => ({
  id: pk(),
  shopId: uuid("shop_id").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdBy: text("created_by"),
});

export const shop = pgTable(
  "shop",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    currency: text("currency").notNull().default("ARS"),
    status: text("status").notNull().default("active"),
    plan: text("plan").notNull().default("base"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    lastActivityAt: tz("last_activity_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBy: text("created_by"),
  },
  (t) => [uniqueIndex("shop_slug").on(t.slug), index("shop_ws").on(t.workspaceId), check("shop_status", sql`${t.status} in ('active','suspended')`)],
);

export const shopMember = pgTable(
  "shop_member",
  {
    id: pk(),
    shopId: uuid("shop_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("seller"),
    active: boolean("active").notNull().default(true),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shop_member_unique").on(t.shopId, t.userId),
    index("shop_member_user").on(t.userId),
    check("shop_member_role", sql`${t.role} in ('owner','admin','seller')`),
  ],
);

export const shopInvitation = pgTable(
  "shop_invitation",
  {
    id: pk(),
    shopId: uuid("shop_id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("seller"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: tz("expires_at").notNull(),
    acceptedAt: tz("accepted_at"),
    revokedAt: tz("revoked_at"),
    createdBy: text("created_by"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shop_invitation_token").on(t.tokenHash), index("shop_invitation_shop").on(t.shopId)],
);

export const shopProduct = pgTable(
  "shop_product",
  {
    ...shopBase(),
    sku: text("sku"),
    barcode: text("barcode"),
    name: text("name").notNull(),
    category: text("category"),
    price: money("price").notNull(),
    cost: money("cost"),
    stock: integer("stock").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    index("shop_product_shop").on(t.shopId, t.active, t.name),
    uniqueIndex("shop_product_sku").on(t.shopId, t.sku).where(sql`${t.sku} is not null`),
    index("shop_product_barcode").on(t.shopId, t.barcode),
  ],
);

export const shopStockMove = pgTable(
  "shop_stock_move",
  {
    id: pk(),
    shopId: uuid("shop_id").notNull(),
    productId: uuid("product_id").notNull(),
    qty: integer("qty").notNull(),
    reason: text("reason").notNull(),
    refId: uuid("ref_id"),
    note: text("note"),
    stockAfter: integer("stock_after").notNull(),
    createdBy: text("created_by"),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [
    index("shop_stock_move_product").on(t.productId, t.at),
    check("shop_stock_reason", sql`${t.reason} in ('sale','sale_cancel','purchase','adjust','return','initial')`),
  ],
);

export const shopCustomer = pgTable(
  "shop_customer",
  {
    ...shopBase(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    doc: text("doc"),
    notes: text("notes"),
  },
  (t) => [index("shop_customer_shop").on(t.shopId, t.name)],
);

export const shopSale = pgTable(
  "shop_sale",
  {
    ...shopBase(),
    number: integer("number").notNull(),
    customerId: uuid("customer_id"),
    orderId: uuid("order_id"),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").notNull().default("0"),
    total: money("total").notNull(),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("completed"),
    soldAt: tz("sold_at").notNull().defaultNow(),
    day: date("day").notNull(),
  },
  (t) => [
    uniqueIndex("shop_sale_number").on(t.shopId, t.number),
    index("shop_sale_day").on(t.shopId, t.day),
    check("shop_sale_status", sql`${t.status} in ('completed','cancelled')`),
    check("shop_sale_payment", sql`${t.paymentMethod} in ('cash','debit','credit','transfer','mercadopago','other')`),
  ],
);

export const shopSaleItem = pgTable(
  "shop_sale_item",
  {
    id: pk(),
    shopId: uuid("shop_id").notNull(),
    saleId: uuid("sale_id").notNull(),
    productId: uuid("product_id").notNull(),
    name: text("name").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: money("unit_price").notNull(),
    unitCost: money("unit_cost"),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [index("shop_sale_item_sale").on(t.saleId), index("shop_sale_item_product").on(t.shopId, t.productId)],
);

export const shopOrder = pgTable(
  "shop_order",
  {
    ...shopBase(),
    number: integer("number").notNull(),
    customerId: uuid("customer_id"),
    status: text("status").notNull().default("new"),
    channel: text("channel").notNull().default("local"),
    deliveryDate: date("delivery_date"),
    notes: text("notes"),
    total: money("total").notNull(),
    saleId: uuid("sale_id"),
  },
  (t) => [
    uniqueIndex("shop_order_number").on(t.shopId, t.number),
    index("shop_order_status").on(t.shopId, t.status),
    check("shop_order_status_chk", sql`${t.status} in ('new','preparing','ready','delivered','cancelled')`),
    check("shop_order_channel", sql`${t.channel} in ('local','whatsapp','web','phone','instagram','other')`),
  ],
);

export const shopOrderItem = pgTable(
  "shop_order_item",
  {
    id: pk(),
    shopId: uuid("shop_id").notNull(),
    orderId: uuid("order_id").notNull(),
    productId: uuid("product_id").notNull(),
    name: text("name").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: money("unit_price").notNull(),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [index("shop_order_item_order").on(t.orderId)],
);

/** Reportes automáticos (semanales) guardados: se ven en el panel y se mandan por email si hay Brevo. */
export const shopReport = pgTable(
  "shop_report",
  {
    id: pk(),
    shopId: uuid("shop_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    emailedAt: tz("emailed_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shop_report_period").on(t.shopId, t.periodStart)],
);
