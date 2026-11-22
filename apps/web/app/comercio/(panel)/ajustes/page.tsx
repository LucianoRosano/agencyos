import { listMembers, PRINT_FORMAT_LABEL, PRINT_FORMATS, SHOP_ROLE_LABEL, type ShopRole } from "@agencyos/modules/shop/service";
import { Badge, Card, PageHeader, SectionLabel } from "@agencyos/ui";
import { redirect } from "next/navigation";
import { updateSettingsAction } from "@/app/comercio/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextField } from "@/components/fields";
import { InviteMemberForm, MemberToggle } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const sc = await requireShopCtx();
  if (sc.role === "seller") redirect("/comercio");
  const { members, invitations } = await listMembers(sc);
  return (
    <>
      <PageHeader title="Ajustes" accent="#4F7A52" />
      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <SectionLabel className="mb-3">Usuarios</SectionLabel>
          <ul className="mb-5 divide-y divide-border" data-testid="member-list">
            {members.map(({ m, name, email }) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{name}</span>
                  <span className="block truncate text-[12px] text-text-muted">{email}</span>
                </span>
                <Badge>{SHOP_ROLE_LABEL[m.role as ShopRole]}</Badge>
                {!m.active ? <Badge tone="danger">Inactivo</Badge> : null}
                {m.userId !== sc.userId ? <MemberToggle id={m.id} active={m.active} name={name} /> : null}
              </li>
            ))}
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px] text-text-muted">
                <span className="flex-1">
                  {i.name} · {i.email}
                </span>
                <Badge tone="warning">Invitación pendiente</Badge>
              </li>
            ))}
          </ul>
          <SectionLabel className="mb-3">Invitar a alguien</SectionLabel>
          <InviteMemberForm owner={sc.role === "owner"} />
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-3">Comercio</SectionLabel>
          <ActionForm action={updateSettingsAction} successMessage="Ajustes guardados">
            {sc.role === "owner" ? <TextField label="Nombre del comercio" name="name" defaultValue={sc.shopName} /> : null}
            <CheckField label="Permitir vender sin stock (queda negativo)" name="allowNegativeStock" defaultChecked={Boolean(sc.settings.allowNegativeStock)} />
            <CheckField label="Recibir el resumen semanal por email" name="weeklyReport" defaultChecked={sc.settings.weeklyReport !== false} />
            <SectionLabel className="mt-2">Datos para comprobantes y remitos</SectionLabel>
            <TextField label="Dirección" name="address" defaultValue={sc.settings.address ?? ""} placeholder="Calle y número, ciudad" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Teléfono" name="phone" defaultValue={sc.settings.phone ?? ""} inputMode="tel" />
              <TextField label="CUIT" name="taxId" defaultValue={sc.settings.taxId ?? ""} inputMode="numeric" placeholder="20-12345678-3" />
            </div>
            <SelectField
              label="Formato de impresión"
              name="printFormat"
              defaultValue={sc.settings.printFormat ?? "a4"}
              options={PRINT_FORMATS.map((f) => ({ value: f, label: PRINT_FORMAT_LABEL[f] }))}
              hint="Ticket: para impresoras térmicas de mostrador. Siempre podés elegir el otro desde la venta."
            />
            <TextField
              label="Mensaje al pie"
              name="ticketFooter"
              defaultValue={sc.settings.ticketFooter ?? ""}
              placeholder="¡Gracias por tu compra!"
              hint="Se imprime al final del comprobante y del remito."
            />
            <div className="flex justify-end">
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
