"use server";

import { ok, type Result, toResultError } from "@agencyos/core";
import * as shop from "@agencyos/modules/shop/service";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_SHOP_COOKIE, getSession, requireShopCtx } from "@/lib/session";

type S = Result<unknown> | null;
type Sc = Awaited<ReturnType<typeof requireShopCtx>>;

/** Como run() pero con la sesión del comercio. */
async function runShop<T>(fn: (sc: Sc) => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<Result<T>> {
  try {
    const sc = await requireShopCtx();
    const data = await fn(sc);
    if (opts.revalidate !== false) revalidatePath("/comercio", "layout");
    return ok(data);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return toResultError(e);
  }
}
const obj = (fd: FormData) => Object.fromEntries(fd);

export const searchProductsAction = async (q: string) =>
  runShop(
    async (sc) =>
      (await shop.listProducts(sc, { q }))
        .slice(0, 20)
        .map((p) => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock, barcode: p.barcode })),
    { revalidate: false },
  );
export const searchCustomersAction = async (q: string) =>
  runShop(async (sc) => (await shop.listCustomers(sc, q)).slice(0, 10).map(({ c }) => ({ id: c.id, name: c.name, phone: c.phone })), { revalidate: false });

export const createSaleAction = async (input: unknown) => runShop((sc) => shop.createSale(sc, input));
export const cancelSaleAction = async (id: string) => runShop((sc) => shop.cancelSale(sc, id));
export const createOrderAction = async (input: unknown) => runShop((sc) => shop.createOrder(sc, input));
export const setOrderStatusAction = async (id: string, status: string, paymentMethod?: string) =>
  runShop((sc) => shop.setOrderStatus(sc, id, status, { paymentMethod }));

export const createProductAction = async (_: S, fd: FormData) => runShop((sc) => shop.createProduct(sc, obj(fd)));
export const updateProductAction = async (id: string, _: S, fd: FormData) => runShop((sc) => shop.updateProduct(sc, id, obj(fd)));
export const setProductActiveAction = async (id: string, active: boolean) => runShop((sc) => shop.setProductActive(sc, id, active));
export const adjustStockAction = async (id: string, _: S, fd: FormData) => runShop((sc) => shop.adjustStock(sc, id, obj(fd)));

export const createCustomerAction = async (_: S, fd: FormData) => runShop((sc) => shop.createCustomer(sc, obj(fd)));
export const inviteMemberAction = async (_: S, fd: FormData) => runShop((sc) => shop.inviteMember(sc, obj(fd)));
export const setMemberActiveAction = async (id: string, active: boolean) => runShop((sc) => shop.setMemberActive(sc, id, active));
export const updateSettingsAction = async (_: S, fd: FormData) => runShop((sc) => shop.updateShopSettings(sc, obj(fd)));

export const switchShopAction = async (shopId: string) => {
  const s = await getSession();
  if (!s) return { ok: false as const, error: { code: "UNAUTHENTICATED" as const, message: "Iniciá sesión" } };
  const rows = await shop.shopMemberships(s.user.id);
  if (!rows.some((r) => r.s.id === shopId)) return { ok: false as const, error: { code: "FORBIDDEN" as const, message: "Sin acceso a ese comercio" } };
  (await cookies()).set(ACTIVE_SHOP_COOKIE, shopId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 31536000,
  });
  revalidatePath("/comercio", "layout");
  return ok(null);
};

// Invitación (sin sesión del comercio todavía)
export const acceptShopInvitationAction = async (token: string, _: S, fd: FormData) => {
  try {
    const r = await shop.acceptShopInvitationNewUser(token, obj(fd));
    return ok({ email: r.email, password: r.password });
  } catch (e) {
    return toResultError(e);
  }
};
export const acceptShopInvitationAsUserAction = async (token: string) => {
  try {
    const s = await getSession();
    if (!s) throw new Error("Iniciá sesión");
    return ok(await shop.acceptShopInvitationAsUser(token, { id: s.user.id, email: s.user.email }));
  } catch (e) {
    return toResultError(e);
  }
};
