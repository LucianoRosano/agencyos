import { listMembers, SHOP_ROLE_LABEL, type ShopRole } from "@agencyos/modules/shop/service";
import { Badge, Card, PageHeader, SectionLabel } from "@agencyos/ui";
import { redirect } from "next/navigation";
import { updateSettingsAction } from "@/app/comercio/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, TextField } from "@/components/fields";
import { InviteMemberForm, MemberToggle } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const sc = await requireShopCtx();
  if (sc.role === "seller") redirect("/comercio");
  const { members, invitations } = await listMembers(sc);
  return (
    <>
      <PageHeader title="Ajustes" accent="#34D399" />
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
            <div className="flex justify-end">
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
