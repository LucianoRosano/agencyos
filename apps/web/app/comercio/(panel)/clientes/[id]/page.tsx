import { cmpMoney, formatDateTime, formatMoney } from "@agencyos/core";
import { customerStatement } from "@agencyos/modules/shop/accounts";
import { COLLECT_METHODS, PAYMENT_LABEL } from "@agencyos/modules/shop/service";
import { Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { registerCustomerPaymentAction } from "@/app/comercio/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Cliente" };

/** Ficha del cliente del comercio: cuenta corriente (fiado), pagos y saldo. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const sc = await requireShopCtx();
  const st = await customerStatement(sc, (await params).id);
  if (!st) notFound();
  const { customer: c, rows, owed } = st;
  const m = (v: string) => formatMoney(v, sc.currency);
  const debt = cmpMoney(owed, "0") > 0;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/comercio/clientes" className="hover:text-text">
            Clientes
          </Link>
        }
        title={c.name}
        description={[c.phone, c.email, c.doc ? `DNI/CUIT ${c.doc}` : null].filter(Boolean).join(" · ") || undefined}
      />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5">
          <SectionLabel className="mb-3">Cuenta corriente</SectionLabel>
          {rows.length ? (
            <ul className="divide-y divide-border text-[14px]" data-testid="statement">
              {rows.map((r) => (
                <li key={`${r.kind}-${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5">
                  <span className="min-w-0 truncate">
                    {r.kind === "sale" ? (
                      <Link href={`/comercio/ventas/${r.id}`} className="underline-offset-2 hover:underline">
                        {r.ref}
                      </Link>
                    ) : (
                      <span>
                        {r.ref}
                        {r.detail ? <span className="text-text-muted"> · {r.detail}</span> : null}
                      </span>
                    )}
                  </span>
                  <span className={`text-right font-mono ${r.kind === "payment" ? "text-success" : ""}`}>
                    {r.kind === "sale" ? `+ ${m(r.debit)}` : `− ${m(r.credit)}`}
                  </span>
                  <span className="text-[12px] text-text-muted">{formatDateTime(r.at)}</span>
                  <span className="text-right text-[12px] text-text-muted">saldo {m(r.balance)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={<BookOpen />}
              title="Sin movimientos a cuenta"
              description="Al vender elegí «Cuenta corriente (fiado)» como medio de pago y queda anotado acá."
            />
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <p className="text-[13px] text-text-muted">{debt ? "Debe" : cmpMoney(owed, "0") < 0 ? "Saldo a favor" : "Está al día"}</p>
            <p className={`mt-1 font-serif text-[30px] leading-tight font-semibold tabular-nums ${debt ? "text-accent-text" : "text-text"}`} data-testid="owed">
              {m(owed.replace(/^-/, ""))}
            </p>
          </Card>
          {debt ? (
            <Card className="p-5">
              <SectionLabel className="mb-3">Registrar pago</SectionLabel>
              <ActionForm action={registerCustomerPaymentAction} successMessage="Pago registrado" resetOnSuccess>
                <input type="hidden" name="customerId" value={c.id} />
                <TextField
                  label="Monto"
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={owed.replace(/\.00$/, "").replace(".", ",")}
                  hint="Puede ser un pago parcial."
                />
                <SelectField
                  label="Medio de pago"
                  name="method"
                  defaultValue="cash"
                  options={COLLECT_METHODS.map((k) => ({ value: k, label: PAYMENT_LABEL[k] }))}
                />
                <TextField label="Nota (opcional)" name="note" maxLength={300} />
                <div className="flex justify-end">
                  <SubmitButton>Registrar pago</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
