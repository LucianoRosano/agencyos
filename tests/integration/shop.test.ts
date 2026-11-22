import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { customerStatement, registerCustomerPayment } from "@agencyos/modules/shop/accounts";
import { cashClose } from "@agencyos/modules/shop/cash";
import { shopDocument } from "@agencyos/modules/shop/documents";
import {
  applyPriceRaise,
  applyProductImport,
  previewPriceRaise,
  previewProductImport,
  productCategories,
  revertPriceRaise,
} from "@agencyos/modules/shop/import";
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
  listCustomers,
  listShops,
  openShopInvitation,
  resolveShop,
  type ShopCtx,
  setOrderStatus,
  setShopStatus,
  shopStats,
  updateShopSettings,
} from "@agencyos/modules/shop/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { renderCashCloseHtml, renderShopDocHtml, renderShopTicketHtml } from "../../packages/pdf/src/shop-doc"; // @agencyos/pdf no es dependencia de la raíz
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

  it("comprobante de venta y remito (con y sin precios) con los datos del comercio; nunca de otro comercio", async () => {
    const { sc } = await shopWithOwner("Almacén Doc");
    await updateShopSettings(sc, {
      allowNegativeStock: "",
      weeklyReport: "on",
      address: "Mitre 100, Rosario",
      phone: "341 000",
      taxId: "20-12345678-3",
      ticketFooter: "Volvé pronto",
    });
    await expect(updateShopSettings(sc, { taxId: "abc" })).rejects.toThrow();
    const settings = (await resolveShop({ id: sc.userId, name: sc.actorName })) as ShopCtx;
    const p = await createProduct(settings, { name: "Yerba <1 kg>", price: "4500", stock: 10 });
    const cli = await createCustomer(settings, { name: "Ana Pérez", doc: "30111222" });
    const v = await createSale(settings, { items: [{ productId: p.id, qty: 2 }], customerId: cli?.id, paymentMethod: "cash" });
    const sale = await shopDocument(settings, "sale", v.id);
    expect(sale).toMatchObject({ kind: "sale", number: v.number, total: "9000.00", paymentLabel: "Efectivo", showPrices: true });
    const html = renderShopDocHtml(sale as NonNullable<typeof sale>);
    expect(html).toContain("Comprobante de venta");
    expect(html).toContain(`0001-${String(v.number).padStart(8, "0")}`);
    expect(html).toContain("Mitre 100, Rosario");
    expect(html).toContain("CUIT 20-12345678-3");
    expect(html).toContain("Yerba &lt;1 kg&gt;");
    expect(html).toContain("Volvé pronto");
    expect(html).toContain("no válido como factura");

    const o = await createOrder(settings, { items: [{ productId: p.id, qty: 3 }], channel: "whatsapp", notes: "Timbre 2B" });
    const remito = renderShopDocHtml((await shopDocument(settings, "remito", o.id)) as NonNullable<Awaited<ReturnType<typeof shopDocument>>>);
    expect(remito).toContain("Remito");
    expect(remito).toContain("Recibí conforme");
    expect(remito).toContain("Timbre 2B");
    expect(remito).not.toContain("data-total");
    const valued = renderShopDocHtml((await shopDocument(settings, "remito-valorizado", o.id)) as NonNullable<Awaited<ReturnType<typeof shopDocument>>>);
    expect(valued).toContain("data-total");

    // Ticket térmico y formato preferido en los ajustes
    const ticket = renderShopTicketHtml(sale as NonNullable<typeof sale>, 58);
    expect(ticket).toContain("--fs:8pt");
    expect(ticket).toContain("TOTAL");
    expect(ticket).toContain("Yerba &lt;1 kg&gt;");
    expect(ticket).toContain("Documento no válido como factura");
    await updateShopSettings(settings, { weeklyReport: "on", printFormat: "ticket80" });
    expect(((await resolveShop({ id: sc.userId, name: sc.actorName })) as ShopCtx).settings.printFormat).toBe("ticket80");
    await expect(updateShopSettings(settings, { printFormat: "a3" })).rejects.toThrow();

    const other = await shopWithOwner("Otro comercio");
    expect(await shopDocument(other.sc, "sale", v.id)).toBeNull();
    expect(await shopDocument(other.sc, "remito", o.id)).toBeNull();
  });

  it("cierre de caja del día: por medio de pago, efectivo, anuladas, vendedores y productos; solo del comercio", async () => {
    const { sc } = await shopWithOwner("Kiosco Caja");
    const p = await createProduct(sc, { name: "Alfajor", price: "1000", stock: 50 });
    const q = await createProduct(sc, { name: "Gaseosa", price: "2500", stock: 50 });
    await createSale(sc, { items: [{ productId: p.id, qty: 3 }], paymentMethod: "cash" });
    await createSale(sc, {
      items: [
        { productId: q.id, qty: 2 },
        { productId: p.id, qty: 1 },
      ],
      discount: "500",
      paymentMethod: "mercadopago",
    });
    const anulada = await createSale(sc, { items: [{ productId: q.id, qty: 1 }], paymentMethod: "cash" });
    await cancelSale(sc, anulada.id);

    const c = await cashClose(sc);
    expect(c.isToday).toBe(true);
    expect(c.count).toBe(2);
    expect(c.total).toBe("8500.00");
    expect(c.cash).toBe("3000.00");
    expect(c.nonCash).toBe("5500.00");
    expect(c.discount).toBe("500.00");
    expect(c.cancelled).toEqual({ count: 1, total: "2500.00" });
    expect(c.units).toBe(6);
    expect(c.payments.map((x) => [x.label, x.count])).toEqual([
      ["Efectivo", 1],
      ["Mercado Pago", 1],
    ]);
    expect(c.items[0]).toMatchObject({ name: "Gaseosa", qty: 2 });
    expect(c.sellers).toHaveLength(1);
    expect(c.nextDay).toBeNull();

    // Un día sin ventas, fechas futuras o inválidas → hoy
    const ayer = await cashClose(sc, addDays(todayAR(), -1));
    expect(ayer.count).toBe(0);
    expect(ayer.nextDay).toBe(todayAR());
    expect((await cashClose(sc, "2999-01-01")).day).toBe(todayAR());
    expect((await cashClose(sc, "x")).day).toBe(todayAR());

    const doc = {
      shopName: "Kiosco <Caja>",
      currency: "ARS",
      dayLabel: "21/11/2026",
      printedAt: "21/11/2026 20:00",
      ...c,
    };
    for (const f of ["a4", 80] as const) {
      const html = renderCashCloseHtml(doc, f);
      expect(html).toContain("Cierre de caja");
      expect(html).toContain("Kiosco &lt;Caja&gt;");
      expect(html).toContain("Mercado Pago");
      expect(html).toMatch(/\$\s?8\.500/);
    }

    const other = await shopWithOwner("Otro kiosco");
    expect((await cashClose(other.sc)).count).toBe(0);
  });

  it("importar productos por CSV: crea nuevos con stock inicial, actualiza precios de existentes, valida y no mezcla comercios", async () => {
    const { sc } = await shopWithOwner("Ferretería CSV");
    const old = await createProduct(sc, { name: "Martillo", sku: "MAR-1", price: "8000", cost: "5000", stock: 4 });
    const csv = [
      "Producto;Código;Categoría;Precio;Costo;Stock",
      "Martillo carpintero;MAR-1;Herramientas;$ 9.500,00;5.800;99",
      "Tornillos x100;TOR-100;Fijaciones;1.250,50;;30",
      "Clavos;;Fijaciones;abc;;",
      ";SIN-NOMBRE;;100;;",
      "Tornillos x100 bis;TOR-100;;10;;",
      "Destornillador;;Herramientas;3500;;0",
    ].join("\n");
    const pv = await previewProductImport(sc, csv);
    expect(pv).toMatchObject({ create: 2, update: 1, same: 0, errors: 3 });
    expect(pv.rows.find((r) => r.line === 2)).toMatchObject({ status: "update", summary: "Martillo" });
    expect(pv.rows.find((r) => r.line === 2)?.message).toMatch(/precio \$\s?8\.000 → \$\s?9\.500/);
    expect(pv.rows.find((r) => r.line === 4)?.message).toMatch(/Precio inválido/);
    expect(pv.rows.find((r) => r.line === 6)?.message).toBe("Repetido en el archivo");

    const done = await applyProductImport(sc, csv);
    expect(done.create).toBe(2);
    const all = await getDb().select().from(schema.shopProduct).where(eq(schema.shopProduct.shopId, sc.shopId));
    const martillo = all.find((p) => p.id === old.id);
    expect(martillo).toMatchObject({ price: "9500.00", cost: "5800.00", stock: 4, name: "Martillo" });
    expect(all.find((p) => p.sku === "TOR-100")).toMatchObject({ price: "1250.50", stock: 30, category: "Fijaciones" });
    const moves = await getDb().select().from(schema.shopStockMove).where(eq(schema.shopStockMove.shopId, sc.shopId));
    expect(
      moves
        .filter((m) => m.reason === "initial")
        .map((m) => m.qty)
        .sort(),
    ).toEqual([30, 4]);

    // Reimportar lo mismo: sin cambios
    const again = await previewProductImport(sc, csv);
    expect(again).toMatchObject({ create: 0, update: 0, same: 3 });
    await expect(previewProductImport(sc, "Nombre;Stock\nA;1")).rejects.toThrow(/Precio/);

    // Otro comercio no ve ni actualiza estos productos
    const other = await shopWithOwner("Otra ferretería");
    expect((await previewProductImport(other.sc, csv)).create).toBe(3);
  });

  it("aumento de precios por porcentaje: por categoría, con redondeo, deshacer sin pisar cambios posteriores", async () => {
    const { sc } = await shopWithOwner("Almacén Aumento");
    const yerba = await createProduct(sc, { name: "Yerba", category: "Almacén", price: "4530", stock: 1 });
    const azucar = await createProduct(sc, { name: "Azúcar", category: "almacen", price: "1000", stock: 1 });
    const lavandina = await createProduct(sc, { name: "Lavandina", category: "Limpieza", price: "900", stock: 1 });
    expect(await productCategories(sc)).toEqual(expect.arrayContaining(["Almacén", "Limpieza"]));

    const pv = await previewPriceRaise(sc, { percent: "12,5", category: "Almacén", roundTo: "10" });
    expect(pv.count).toBe(2); // la categoría se compara sin tildes ni mayúsculas
    expect(pv.sample.find((c) => c.id === yerba.id)).toMatchObject({ from: "4530.00", to: "5100.00" });
    const done = await applyPriceRaise(sc, { percent: "12,5", category: "Almacén", roundTo: "10" });
    expect(done.count).toBe(2);
    const price = async (id: string) => (await getDb().select().from(schema.shopProduct).where(eq(schema.shopProduct.id, id)))[0]?.price;
    expect(await price(azucar.id)).toBe("1130.00");
    expect(await price(lavandina.id)).toBe("900.00");

    // Si alguien cambió un precio después, deshacer no lo pisa
    await getDb().update(schema.shopProduct).set({ price: "9999.00" }).where(eq(schema.shopProduct.id, azucar.id));
    expect((await revertPriceRaise(sc, done.changes)).count).toBe(1);
    expect(await price(yerba.id)).toBe("4530.00");
    expect(await price(azucar.id)).toBe("9999.00");

    await expect(previewPriceRaise(sc, { percent: "0" })).rejects.toThrow();
    await expect(previewPriceRaise(sc, { percent: "abc" })).rejects.toThrow();
    // Bajar precios también se puede
    expect((await previewPriceRaise(sc, { percent: "-10", roundTo: "1" })).sample.find((c) => c.id === lavandina.id)?.to).toBe("810.00");
    // Otro comercio no puede deshacer ni tocar estos productos
    const other = await shopWithOwner("Otro almacén");
    expect((await revertPriceRaise(other.sc, [{ id: yerba.id, from: "1.00", to: "4530.00" }])).count).toBe(0);
  });

  it("cuenta corriente (fiado): venta a cuenta exige cliente, pagos parciales, no se paga de más y la caja lo refleja", async () => {
    const { sc } = await shopWithOwner("Almacén Fiado");
    const p = await createProduct(sc, { name: "Pan", price: "1000", stock: 100 });
    const ana = await createCustomer(sc, { name: "Ana Fiado" });
    await expect(createSale(sc, { items: [{ productId: p.id, qty: 1 }], paymentMethod: "account" })).rejects.toThrow(/elegí el cliente/);
    const v1 = await createSale(sc, { items: [{ productId: p.id, qty: 3 }], customerId: ana?.id, paymentMethod: "account" });
    await createSale(sc, { items: [{ productId: p.id, qty: 2 }], customerId: ana?.id, paymentMethod: "account" });
    await createSale(sc, { items: [{ productId: p.id, qty: 1 }], paymentMethod: "cash" });
    const id = ana?.id ?? "";

    const pay = await registerCustomerPayment(sc, id, { amount: "1500", method: "cash", note: "a cuenta" });
    expect(pay.owed).toBe("3500.00");
    await registerCustomerPayment(sc, id, { amount: "500", method: "transfer" });
    await expect(registerCustomerPayment(sc, id, { amount: "5000", method: "cash" })).rejects.toThrow(/supera/);
    await expect(registerCustomerPayment(sc, id, { amount: "10", method: "account" })).rejects.toThrow();

    // Anular una venta a cuenta baja la deuda
    await cancelSale(sc, v1.id);
    const st = await customerStatement(sc, id);
    expect(st?.owed).toBe("0.00");
    expect(st?.rows.map((r) => r.kind)).toEqual(["sale", "payment", "payment"]);
    expect(st?.rows[1]?.detail).toBe("Efectivo · a cuenta");
    const listed = (await listCustomers(sc)).find((r) => r.c.id === id);
    expect(listed?.owed).toBe("0.00");

    const c = await cashClose(sc);
    expect(c.onAccount).toBe("2000.00"); // la de 3.000 se anuló
    expect(c.cash).toBe("2500.00"); // 1.000 de venta + 1.500 de cobro
    expect(c.nonCash).toBe("500.00"); // cobro por transferencia
    expect(c.collected).toBe("2000.00");
    expect(c.payments.find((x) => x.method === "account")?.label).toBe("Fiado (cuenta corriente)");

    const other = await shopWithOwner("Otro almacén fiado");
    expect(await customerStatement(other.sc, id)).toBeNull();
    await expect(registerCustomerPayment(other.sc, id, { amount: "1", method: "cash" })).rejects.toThrow();
  });
});
