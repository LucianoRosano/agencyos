"use client";

import { addMoney, formatMoney, mulMoney, subMoney } from "@agencyos/core";
import { Button, Card, cn, EmptyState, Input, Select } from "@agencyos/ui";
import { Minus, Plus, Search, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createOrderAction, createSaleAction, searchCustomersAction, searchProductsAction } from "@/app/comercio/actions";
import { toast } from "@/lib/toast";

type Product = { id: string; name: string; sku: string | null; price: string; stock: number; barcode: string | null };
type Line = Product & { qty: number };
type Customer = { id: string; name: string; phone: string | null };

const PAYMENTS: [string, string][] = [
  ["cash", "Efectivo"],
  ["debit", "Débito"],
  ["credit", "Crédito"],
  ["transfer", "Transferencia"],
  ["mercadopago", "Mercado Pago"],
  ["other", "Otro"],
  ["account", "Cuenta corriente (fiado)"],
];
const CHANNELS: [string, string][] = [
  ["local", "Local"],
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["phone", "Teléfono"],
  ["web", "Web"],
  ["other", "Otro"],
];

/**
 * Punto de venta: buscar por nombre, código o código de barras (un lector USB escribe y da Enter), carrito,
 * cliente opcional, descuento y medio de pago. En modo «pedido» guarda un pedido (no descuenta stock).
 */
export function Pos({ mode = "sale", currency = "ARS", canDiscount }: { mode?: "sale" | "order"; currency?: string; canDiscount: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cq, setCq] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState("cash");
  const [channel, setChannel] = useState("local");
  const [delivery, setDelivery] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = q.trim();
    if (!t) return setResults([]);
    const id = window.setTimeout(async () => {
      const r = await searchProductsAction(t);
      if (r.ok) setResults(r.data);
    }, 180);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => {
    const t = cq.trim();
    if (!t) return setCustomers([]);
    const id = window.setTimeout(async () => {
      const r = await searchCustomersAction(t);
      if (r.ok) setCustomers(r.data);
    }, 200);
    return () => window.clearTimeout(id);
  }, [cq]);

  const add = (p: Product) => {
    setLines((ls) => {
      const hit = ls.find((l) => l.id === p.id);
      return hit ? ls.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { ...p, qty: 1 }];
    });
    setQ("");
    setResults([]);
    search.current?.focus();
  };
  const setQty = (id: string, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.id !== id) : ls.map((l) => (l.id === id ? { ...l, qty } : l))));

  const subtotal = lines.length ? addMoney(...lines.map((l) => mulMoney(l.price, l.qty))) : "0";
  const disc = /^\d+([.,]\d{1,2})?$/.test(discount.trim()) ? discount.trim().replace(",", ".") : "0";
  const total = mode === "sale" ? subMoney(subtotal, disc) : subtotal;

  function submit() {
    if (!lines.length) return;
    start(async () => {
      const items = lines.map((l) => ({ productId: l.id, qty: l.qty }));
      const r =
        mode === "sale"
          ? await createSaleAction({ items, customerId: customer?.id, discount: disc, paymentMethod: payment })
          : await createOrderAction({ items, customerId: customer?.id, channel, deliveryDate: delivery || undefined });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      const saved = r.data as { id: string; number: number };
      toast.success(mode === "sale" ? `Venta n.º ${saved.number} registrada` : `Pedido n.º ${saved.number} guardado`, {
        action: {
          label: mode === "sale" ? "Comprobante" : "Remito",
          onClick: () =>
            window.open(mode === "sale" ? `/comercio/ventas/${saved.id}/comprobante` : `/comercio/pedidos/${saved.id}/remito`, "_blank", "noopener"),
        },
      });
      setLines([]);
      setCustomer(null);
      setDiscount("");
      router.refresh();
      search.current?.focus();
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const exact = results.find((r) => r.barcode === q.trim() || r.sku === q.trim()) ?? (results.length === 1 ? results[0] : undefined);
            if (exact) add(exact);
          }}
        >
          <label htmlFor="pos-q" className="sr-only">
            Buscar producto
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
            <Input
              id="pos-q"
              ref={search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, código o escanear"
              autoComplete="off"
              autoFocus
              className="h-12 pl-9 text-base"
            />
          </div>
        </form>
        {results.length ? (
          <Card className="p-1">
            <ul aria-label="Resultados">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{p.name}</span>
                      <span className={cn("block font-mono text-[12px]", p.stock <= 0 ? "text-danger" : "text-text-muted")}>
                        {p.sku ? `${p.sku} · ` : ""}stock {p.stock}
                      </span>
                    </span>
                    <span className="font-mono text-[14px]">{formatMoney(p.price, currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card className="p-4">
          {lines.length ? (
            <ul className="flex flex-col divide-y divide-border" aria-label="Carrito">
              {lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <span className="block text-[15px] sm:truncate">{l.name}</span>
                    <span className="font-mono text-[12px] whitespace-nowrap text-text-muted">{formatMoney(l.price, currency)} c/u</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Uno menos de ${l.name}`} onClick={() => setQty(l.id, l.qty - 1)}>
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center font-mono" aria-label={`Cantidad de ${l.name}`}>
                      {l.qty}
                    </span>
                    <Button variant="ghost" size="icon" aria-label={`Uno más de ${l.name}`} onClick={() => setQty(l.id, l.qty + 1)}>
                      <Plus className="size-4" />
                    </Button>
                  </span>
                  <span className="ml-auto w-28 text-right font-mono text-[14px] whitespace-nowrap">{formatMoney(mulMoney(l.price, l.qty), currency)}</span>
                  <Button variant="ghost" size="icon" aria-label={`Quitar ${l.name}`} onClick={() => setQty(l.id, 0)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<ShoppingCart />} title="El carrito está vacío" description="Buscá un producto o pasá el lector de código de barras." />
          )}
        </Card>
      </div>

      <Card className="flex h-fit flex-col gap-4 p-5" aria-label="Cobro">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pos-customer" className="text-[13px] font-medium text-text-muted">
            Cliente (opcional)
          </label>
          {customer ? (
            <span className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3">
              <UserRound className="size-4 text-text-muted" aria-hidden />
              <span className="flex-1 truncate text-[14px]">{customer.name}</span>
              <button type="button" className="text-[13px] text-accent-text underline" onClick={() => setCustomer(null)}>
                Cambiar
              </button>
            </span>
          ) : (
            <>
              <Input
                id="pos-customer"
                value={cq}
                onChange={(e) => setCq(e.target.value)}
                placeholder="Buscar por nombre o teléfono"
                className="text-base md:text-sm"
              />
              {customers.length ? (
                <ul className="flex flex-col">
                  {customers.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="min-h-11 w-full rounded-md px-2 text-left text-[14px] hover:bg-surface-2"
                        onClick={() => {
                          setCustomer(c);
                          setCq("");
                          setCustomers([]);
                        }}
                      >
                        {c.name}
                        {c.phone ? <span className="text-text-muted"> · {c.phone}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
        {mode === "sale" ? (
          <>
            {canDiscount ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pos-discount" className="text-[13px] font-medium text-text-muted">
                  Descuento
                </label>
                <Input
                  id="pos-discount"
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="text-base md:text-sm"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pos-payment" className="text-[13px] font-medium text-text-muted">
                Medio de pago
              </label>
              <Select id="pos-payment" value={payment} onChange={(e) => setPayment(e.target.value)}>
                {PAYMENTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pos-channel" className="text-[13px] font-medium text-text-muted">
                Canal
              </label>
              <Select id="pos-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pos-delivery" className="text-[13px] font-medium text-text-muted">
                Para el día
              </label>
              <Input id="pos-delivery" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="text-base md:text-sm" />
            </div>
          </>
        )}
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 border-t border-border pt-3 text-[14px]">
          <dt className="text-text-muted">Subtotal</dt>
          <dd className="text-right font-mono">{formatMoney(subtotal, currency)}</dd>
          {mode === "sale" && disc !== "0" ? (
            <>
              <dt className="text-text-muted">Descuento</dt>
              <dd className="text-right font-mono">− {formatMoney(disc, currency)}</dd>
            </>
          ) : null}
          <dt className="text-[16px] font-medium">Total</dt>
          <dd className="text-right font-mono text-[22px] font-semibold" data-testid="pos-total">
            {formatMoney(total, currency)}
          </dd>
        </dl>
        <Button variant="primary" className="h-12 text-base" disabled={!lines.length} loading={pending} onClick={submit}>
          {mode === "sale" ? "Cobrar" : "Guardar pedido"}
        </Button>
      </Card>
    </div>
  );
}
