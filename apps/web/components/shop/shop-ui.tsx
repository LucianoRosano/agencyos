"use client";

import { Button, cn, Select, Sheet } from "@agencyos/ui";
import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  adjustStockAction,
  cancelSaleAction,
  createCustomerAction,
  createProductAction,
  inviteMemberAction,
  setMemberActiveAction,
  setOrderStatusAction,
  setProductActiveAction,
  switchShopAction,
  updateProductAction,
} from "@/app/comercio/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { getAuthClient } from "@/lib/auth-client-lazy";
import { toast } from "@/lib/toast";

const NAV: { href: string; label: string; admin?: boolean }[] = [
  { href: "/comercio", label: "Inicio" },
  { href: "/comercio/vender", label: "Vender" },
  { href: "/comercio/ventas", label: "Ventas" },
  { href: "/comercio/caja", label: "Caja" },
  { href: "/comercio/pedidos", label: "Pedidos" },
  { href: "/comercio/productos", label: "Productos" },
  { href: "/comercio/clientes", label: "Clientes" },
  { href: "/comercio/reportes", label: "Reportes" },
  { href: "/comercio/ajustes", label: "Ajustes", admin: true },
];

export function ShopNav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const items = NAV.filter((n) => admin || !n.admin);
  const active = [...items].reverse().find((n) => (n.href === "/comercio" ? path === "/comercio" : path.startsWith(n.href)))?.href;
  return (
    <nav aria-label="Secciones del comercio" className="no-scrollbar flex gap-1 overflow-x-auto">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active === n.href ? "page" : undefined}
          className={cn(
            "inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-[14px]",
            active === n.href ? "bg-accent-soft text-text" : "text-text-muted hover:text-text",
          )}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function ShopSwitcher({ shops, current }: { shops: { id: string; name: string }[]; current: string }) {
  const { exec } = useAction();
  if (shops.length < 2) return null;
  return (
    <Select aria-label="Cambiar de comercio" value={current} onChange={(e) => exec(() => switchShopAction(e.target.value))} className="h-10 w-auto max-w-48">
      {shops.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

export function ShopSignOut() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cerrar sesión"
      onClick={async () => {
        await (await getAuthClient()).signOut();
        window.location.href = "/login";
      }}
    >
      <LogOut className="size-4" />
    </Button>
  );
}

// ---------- Productos ----------

type ProductDefaults = Partial<Record<"name" | "sku" | "barcode" | "category" | "price" | "cost" | "minStock", string | number | null>>;

function ProductFields({ d = {}, withStock }: { d?: ProductDefaults; withStock?: boolean }) {
  const v = (k: keyof ProductDefaults) => (d[k] === null || d[k] === undefined ? "" : String(d[k]));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Nombre" name="name" required defaultValue={v("name")} className="md:col-span-2" maxLength={160} />
      <TextField label="Precio de venta" name="price" required inputMode="decimal" defaultValue={v("price")} placeholder="3.500" />
      <TextField label="Costo (opcional)" name="cost" inputMode="decimal" defaultValue={v("cost")} hint="Para calcular la ganancia." />
      <TextField label="Código (SKU)" name="sku" defaultValue={v("sku")} />
      <TextField label="Código de barras" name="barcode" defaultValue={v("barcode")} />
      <TextField label="Categoría" name="category" defaultValue={v("category")} />
      <TextField
        label="Stock mínimo"
        name="minStock"
        type="number"
        min={0}
        inputMode="numeric"
        defaultValue={v("minStock") || "0"}
        hint="Avisa cuando queda menos."
      />
      {withStock ? <TextField label="Stock inicial" name="stock" type="number" min={0} inputMode="numeric" defaultValue="0" /> : null}
    </div>
  );
}

export function NewProductSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo producto"
      wide
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Nuevo producto
        </Button>
      }
    >
      <ActionForm action={createProductAction} successMessage="Producto cargado" onSuccess={() => setOpen(false)}>
        <ProductFields withStock />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function EditProductForm({ id, d }: { id: string; d: ProductDefaults }) {
  return (
    <ActionForm action={updateProductAction.bind(null, id)} successMessage="Producto guardado">
      <ProductFields d={d} />
      <div className="flex justify-end">
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function StockForm({ id }: { id: string }) {
  return (
    <ActionForm action={adjustStockAction.bind(null, id)} successMessage="Stock actualizado" resetOnSuccess>
      <div className="grid gap-4 md:grid-cols-3">
        <TextField label="Cantidad (+ entra / − sale)" name="qty" type="number" inputMode="numeric" required placeholder="24" />
        <SelectField
          label="Motivo"
          name="reason"
          defaultValue="purchase"
          options={[
            { value: "purchase", label: "Compra / reposición" },
            { value: "return", label: "Devolución" },
            { value: "adjust", label: "Ajuste (conteo, rotura)" },
          ]}
        />
        <TextField label="Nota" name="note" placeholder="Proveedor, factura…" />
      </div>
      <div className="flex justify-end">
        <SubmitButton>Registrar movimiento</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProductActiveButton({ id, active }: { id: string; active: boolean }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() =>
        exec(() => setProductActiveAction(id, !active), {
          success: active ? "Producto dado de baja" : "Producto reactivado",
          undo: () => setProductActiveAction(id, active),
        })
      }
    >
      {active ? "Dar de baja" : "Reactivar"}
    </Button>
  );
}

// ---------- Ventas y pedidos ----------

export function CancelSaleButton({ id, number }: { id: string; number: number }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="danger"
      loading={pending}
      onClick={() => {
        if (confirm(`¿Anular la venta n.º ${number}? El stock vuelve y deja de contar en las estadísticas.`))
          exec(() => cancelSaleAction(id), { success: "Venta anulada" });
      }}
    >
      Anular venta
    </Button>
  );
}

const NEXT: Record<string, [string, string] | undefined> = {
  new: ["preparing", "Empezar a preparar"],
  preparing: ["ready", "Marcar listo"],
};

export function OrderActions({ id, status }: { id: string; status: string }) {
  const { exec, pending } = useAction();
  const [pm, setPm] = useState("cash");
  const next = NEXT[status];
  return (
    <span className="flex flex-wrap items-center gap-2">
      {next ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-10"
          loading={pending}
          onClick={() => exec(() => setOrderStatusAction(id, next[0]), { success: "Pedido actualizado" })}
        >
          {next[1]}
        </Button>
      ) : null}
      {status === "ready" || status === "preparing" || status === "new" ? (
        <>
          <Select aria-label="Medio de pago al entregar" value={pm} onChange={(e) => setPm(e.target.value)} className="h-10 w-auto">
            <option value="cash">Efectivo</option>
            <option value="debit">Débito</option>
            <option value="credit">Crédito</option>
            <option value="transfer">Transferencia</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="other">Otro</option>
          </Select>
          <Button
            size="sm"
            variant="primary"
            className="h-10"
            loading={pending}
            onClick={() => exec(() => setOrderStatusAction(id, "delivered", pm), { success: "Entregado: venta registrada" })}
          >
            Entregar y cobrar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-10"
            onClick={() => {
              if (confirm("¿Cancelar el pedido?")) exec(() => setOrderStatusAction(id, "cancelled"), { success: "Pedido cancelado" });
            }}
          >
            Cancelar
          </Button>
        </>
      ) : null}
    </span>
  );
}

// ---------- Clientes y usuarios ----------

export function NewCustomerSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo cliente"
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Nuevo cliente
        </Button>
      }
    >
      <ActionForm action={createCustomerAction} successMessage="Cliente guardado" onSuccess={() => setOpen(false)}>
        <TextField label="Nombre" name="name" required />
        <TextField label="Teléfono / WhatsApp" name="phone" inputMode="tel" />
        <TextField label="Email" name="email" type="email" />
        <TextField label="DNI / CUIT" name="doc" />
        <TextAreaField label="Notas" name="notes" rows={3} />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function InviteMemberForm({ owner }: { owner: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <ActionForm
        action={inviteMemberAction}
        successMessage={(d) => ((d as { emailed: boolean }).emailed ? "Invitación enviada por email" : "Invitación creada: copiá el enlace")}
        onSuccess={(d) => setLink((d as { url: string }).url)}
        resetOnSuccess
      >
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Nombre" name="name" required />
          <TextField label="Email" name="email" type="email" required />
          <SelectField
            label="Rol"
            name="role"
            defaultValue="seller"
            options={[
              { value: "seller", label: "Vendedor" },
              { value: "admin", label: "Administrador" },
              ...(owner ? [{ value: "owner", label: "Dueño" }] : []),
            ]}
          />
        </div>
        <div className="flex justify-end">
          <SubmitButton>Invitar</SubmitButton>
        </div>
      </ActionForm>
      {link ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3">
          <span className="text-[13px] text-text-muted">Enlace para crear su contraseña (vence en 7 días):</span>
          <code className="font-mono text-[12px] break-all" data-testid="invite-link">
            {link}
          </code>
          <Button
            size="sm"
            variant="secondary"
            className="h-10 self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast.success("Enlace copiado");
            }}
          >
            Copiar enlace
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function MemberToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-10"
      loading={pending}
      onClick={() => exec(() => setMemberActiveAction(id, !active), { success: `${active ? "Desactivaste" : "Reactivaste"} a ${name}` })}
    >
      {active ? "Desactivar" : "Reactivar"}
    </Button>
  );
}
