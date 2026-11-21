import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { generateWeeklyReports, lastWeek, listReports, reportText } from "@agencyos/modules/shop/report";
import {
  acceptShopInvitationNewUser,
  adjustStock,
  cancelSale,
  createCustomer,
  createOrder,
  createProduct,
  createSale,
  createShop,
  inviteMember,
  listShops,
  openShopInvitation,
  resolveShop,
  type ShopCtx,
  setOrderStatus,
  setShopStatus,
  shopStats,
} from "@agencyos/modules/shop/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const tokenOf = (url: string) => url.split("/").pop() ?? "";

async function shopWithOwner(name = "Librería Uno") {
  const agency = await makeWorkspace();
  const email = `dueno-${Math.random().toString(36).slice(2)}@libreria.test`;
  const r = await createShop(agency, { name, ownerName: "Ana Dueña", ownerEmail: email });
  const opened = await openShopInvitation(tokenOf(r.url));
  expect(opened).toMatchObject({ shopName: name, role: "owner", hasAccount: false });
  const acc = await acceptShopInvitationNewUser(tokenOf(r.url), {
    name: "Ana Dueña",
    password: "ContraseñaMuyLarga-2026",
    password2: "ContraseñaMuyLarga-2026",
  });
  const [u] = await getDb().select().from(schema.user).where(eq(schema.user.email, acc.email));
  const sc = (await resolveShop({ id: u?.id ?? "", name: "Ana Dueña" })) as ShopCtx;
  return { agency, sc, shopId: r.shop.id };
}

describe("SaaS para comercios", () => {
  it("alta por la agencia → invitación del dueño → catálogo → venta → stock → pedido → anulación → estadísticas", async () => {
    const { agency, sc } = await shopWithOwner();
    expect(sc.role).toBe("owner");
    const cuaderno = await createProduct(sc, { name: "Cuaderno A4", sku: "CUA-A4", price: "3500", cost: "2000", stock: 10, minStock: 3 });
    const lapiz = await createProduct(sc, { name: "Lápiz negro", price: "500", stock: 2, minStock: 5 });
    await expect(createProduct(sc, { name: "Otro", sku: "CUA-A4", price: "1" })).rejects.toThrow(/código/);
    const cli = await createCustomer(sc, { name: "Juan Pérez", phone: "1155550000" });

    // venta: descuenta stock, numera y valida
    const v1 = await createSale(sc, {
      items: [
        { productId: cuaderno.id, qty: 3 },
        { productId: lapiz.id, qty: 2 },
      ],
      customerId: cli?.id,
      discount: "500",
      paymentMethod: "cash",
    });
    expect(v1).toMatchObject({ number: 1, subtotal: "11500.00", total: "11000.00" });
    await expect(createSale(sc, { items: [{ productId: lapiz.id, qty: 1 }], paymentMethod: "cash" })).rejects.toThrow(/stock suficiente/);
    await expect(createSale(sc, { items: [{ productId: cuaderno.id, qty: 1 }], discount: "99999", paymentMethod: "cash" })).rejects.toThrow(/descuento/);
    const stock = async (id: string) => (await getDb().select().from(schema.shopProduct).where(eq(schema.shopProduct.id, id)))[0]?.stock;
    expect(await stock(cuaderno.id)).toBe(7);
    expect(await stock(lapiz.id)).toBe(0);
    await adjustStock(sc, lapiz.id, { qty: 20, reason: "purchase", note: "Compra al mayorista" });
    expect(await stock(lapiz.id)).toBe(20);

    // pedido: no toca stock hasta entregarse; al entregar se registra la venta
    const o = await createOrder(sc, {
      items: [{ productId: cuaderno.id, qty: 2 }],
      customerId: cli?.id,
      channel: "whatsapp",
      deliveryDate: addDays(todayAR(), 1),
    });
    expect(o.total).toBe("7000.00");
    expect(await stock(cuaderno.id)).toBe(7);
    await setOrderStatus(sc, o.id, "preparing");
    await expect(setOrderStatus(sc, o.id, "delivered")).rejects.toThrow();
    const delivered = await setOrderStatus(sc, o.id, "delivered", { paymentMethod: "transfer" });
    expect(delivered?.saleId).toBeTruthy();
    expect(await stock(cuaderno.id)).toBe(5);

    // anular vuelve el stock
    await cancelSale(sc, v1.id);
    expect(await stock(cuaderno.id)).toBe(8);
    await expect(cancelSale(sc, v1.id)).rejects.toThrow(/anulada/);

    const st = await shopStats(sc);
    expect(st.today).toEqual({ total: "7000.00", count: 1 });
    expect(st.month.avgTicket).toBe("7000.00");
    expect(st.month.margin).toBe("3000.00");
    expect(st.top[0]).toMatchObject({ name: "Cuaderno A4", qty: 2 });
    expect(st.daily).toHaveLength(30);

    // panel de la agencia
    const shops = await listShops(agency);
    expect(shops[0]).toMatchObject({ members: 1, products: 2, salesCount: 1 });
    expect(shops[0]?.salesMonth).toBe("7000.00");
  });

  it("vendedor: vende con los precios del catálogo pero no administra; aislamiento entre comercios; suspensión", async () => {
    const { agency, sc, shopId } = await shopWithOwner("Kiosco Sol");
    const p = await createProduct(sc, { name: "Alfajor", price: "1200", stock: 50 });
    const inv = await inviteMember(sc, { name: "Beto Vendedor", email: "beto@kiosco.test", role: "seller" });
    await acceptShopInvitationNewUser(tokenOf(inv.url), { name: "Beto", password: "OtraContraseñaLarga-99", password2: "OtraContraseñaLarga-99" });
    const [beto] = await getDb().select().from(schema.user).where(eq(schema.user.email, "beto@kiosco.test"));
    const seller = (await resolveShop({ id: beto?.id ?? "", name: "Beto" })) as ShopCtx;
    expect(seller.role).toBe("seller");
    const v = await createSale(seller, { items: [{ productId: p.id, qty: 2, unitPrice: "1" }], paymentMethod: "debit" });
    expect(v.total).toBe("2400.00"); // el precio lo pone el catálogo
    await expect(createProduct(seller, { name: "X", price: "1" })).rejects.toThrow();
    await expect(cancelSale(seller, v.id)).rejects.toThrow();
    await expect(inviteMember(seller, { name: "Z", email: "z@z.test" })).rejects.toThrow();

    // otro comercio no ve ni vende productos ajenos
    const other = await shopWithOwner("Otro Comercio");
    await expect(createSale(other.sc, { items: [{ productId: p.id, qty: 1 }], paymentMethod: "cash" })).rejects.toThrow();
    expect((await shopStats(other.sc)).today.count).toBe(0);

    // suspender: nadie entra; otra agencia no puede tocarlo
    const foreign = await makeWorkspace("Otra agencia");
    await expect(setShopStatus(foreign, shopId, "suspended")).rejects.toThrow();
    await setShopStatus(agency, shopId, "suspended");
    expect(await resolveShop({ id: beto?.id ?? "", name: "Beto" })).toBeNull();
    // una invitación usada no sirve de nuevo
    expect(await openShopInvitation(tokenOf(inv.url))).toBeNull();
  });

  it("reporte semanal automático: uno por comercio y semana, con el texto del resumen", async () => {
    const { sc } = await shopWithOwner("Almacén Norte");
    await createProduct(sc, { name: "Yerba", price: "4000", stock: 1, minStock: 2 });
    const { start, end } = lastWeek();
    expect(await generateWeeklyReports()).toBeGreaterThanOrEqual(1);
    await generateWeeklyReports();
    const reps = await listReports(sc);
    expect(reps).toHaveLength(1);
    expect(reps[0]?.periodStart).toBe(start);
    const text = reportText(reps[0]?.data as never, start, end);
    expect(text).toMatch(/Almacén Norte/);
    expect(text).toMatch(/Stock bajo:\n- Yerba: quedan 1/);
  });
});
