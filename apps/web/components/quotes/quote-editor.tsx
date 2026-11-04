"use client";

import { addDays, formatMoney, L } from "@agencyos/core";
import { Button, Card, cn, Field, Input, SectionLabel, Select, Textarea } from "@agencyos/ui";
import { ArrowDown, ArrowUp, Eye, PenLine, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createQuoteAction, previewQuoteAction, updateQuoteAction } from "@/app/(app)/presupuestos/actions";
import { QuotePreviewFrame } from "./quote-preview-frame";
import { draftToPayload, type EditorOptions, type ItemDraft, type MilestoneDraft, type PreviewState, type QuoteDraft } from "./types";

let seq = 0;
const newKey = () => `k${++seq}-${Date.now().toString(36)}`;

const PRESETS: Record<string, { label: string; percent: string; offsetDays: string }[]> = {
  "50/50": [
    { label: "Anticipo", percent: "50", offsetDays: "0" },
    { label: "Saldo a la entrega", percent: "50", offsetDays: "30" },
  ],
  "40/30/30": [
    { label: "Anticipo", percent: "40", offsetDays: "0" },
    { label: "Avance", percent: "30", offsetDays: "15" },
    { label: "Saldo a la entrega", percent: "30", offsetDays: "30" },
  ],
};

const emptyItem = (): ItemDraft => ({
  key: newKey(),
  serviceId: "",
  description: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
  discountType: "none",
  discountValue: "",
});

function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-control)] border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex h-9 cursor-pointer items-center rounded-[7px] px-3 text-[13px] transition-colors",
            value === o.value ? "bg-surface-3 text-text" : "text-text-muted hover:text-text",
          )}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function FieldErr({ msg }: { msg?: string }) {
  return msg ? (
    <p className="text-[13px] text-danger" role="alert">
      {msg}
    </p>
  ) : null;
}

export function QuoteEditor({
  quoteId,
  number,
  version,
  initial,
  options,
  initialPreview,
}: {
  quoteId?: string;
  number?: string;
  version?: number;
  initial: QuoteDraft;
  options: EditorOptions;
  initialPreview: PreviewState;
}) {
  const [d, setD] = useState<QuoteDraft>(initial);
  const [preview, setPreview] = useState<PreviewState>(initialPreview);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [saving, startSave] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const reqId = useRef(0);
  const first = useRef(true);

  const set = <K extends keyof QuoteDraft>(k: K, v: QuoteDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const setItem = (key: string, patch: Partial<ItemDraft>) =>
    setD((prev) => ({ ...prev, items: prev.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));
  const setPlan = (patch: Partial<QuoteDraft["plan"]>) => setD((prev) => ({ ...prev, plan: { ...prev.plan, ...patch } }));
  const setMilestone = (key: string, patch: Partial<MilestoneDraft>) => setPlan({ items: d.plan.items.map((m) => (m.key === key ? { ...m, ...patch } : m)) });

  const payload = useMemo(() => draftToPayload(d), [d]);
  const payloadJson = JSON.stringify(payload);

  // Vista previa en vivo: mismo HTML del PDF, calculado en el servidor (con debounce).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = ++reqId.current;
    setRefreshing(true);
    const t = setTimeout(async () => {
      const r = await previewQuoteAction(JSON.parse(payloadJson), { number, version });
      if (id !== reqId.current) return;
      setRefreshing(false);
      if (r.ok) setPreview(r.data);
    }, 450);
    return () => clearTimeout(t);
  }, [payloadJson, number, version]);

  const contacts = options.contacts.filter((c) => !d.clientId || c.clientIds.includes(d.clientId) || c.id === d.contactId);
  const opportunities = options.opportunities.filter((o) => o.clientId === d.clientId && (!["won", "lost"].includes(o.stage) || o.id === d.opportunityId));
  const issueFor = (path: string) => errors[path] ?? preview.issues.find((i) => i.path === path)?.message;
  const m = (v: string | undefined) => formatMoney(v ?? "0", d.currency, { decimals: true });
  const pctSum = d.plan.items.reduce((a, x) => a + Math.round(Number(x.percent.replace(",", ".") || 0) * 100), 0) / 100;

  function pickService(key: string, serviceId: string) {
    const s = options.services.find((x) => x.id === serviceId);
    if (!s) return setItem(key, { serviceId: "" });
    const price = d.currency === "USD" ? s.priceUsd : s.priceArs;
    setItem(key, { serviceId, description: s.name, unit: s.unit, ...(price ? { unitPrice: price.replace(/\.00$/, "") } : {}) });
  }

  function move(key: string, dir: -1 | 1) {
    setD((prev) => {
      const i = prev.items.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.items.length) return prev;
      const items = [...prev.items];
      [items[i], items[j]] = [items[j] as ItemDraft, items[i] as ItemDraft];
      return { ...prev, items };
    });
  }

  function save() {
    startSave(async () => {
      const r = quoteId ? await updateQuoteAction(quoteId, payload) : await createQuoteAction(payload);
      if (!r.ok) {
        setErrors(r.error.fields ?? {});
        toast.error(r.error.message);
        setView("edit");
        return;
      }
      setErrors({});
      toast.success(quoteId ? "Presupuesto guardado" : "Presupuesto creado");
      router.push(`/presupuestos/${r.data.id}`);
      router.refresh();
    });
  }

  const errorList = Object.entries(errors);

  const editor = (
    <div className="flex flex-col gap-5">
      {errorList.length ? (
        <Card className="border-danger/40 p-4" role="alert">
          <p className="text-[14px] font-medium text-danger">Revisá estos campos antes de guardar:</p>
          <ul className="mt-1.5 list-disc pl-5 text-[13px] text-text-muted">
            {errorList.slice(0, 8).map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4 md:p-5">
        <SectionLabel className="mb-4">Cabecera</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" name="clientId" required error={errors.clientId}>
            <Select
              id="clientId"
              value={d.clientId}
              aria-invalid={errors.clientId ? true : undefined}
              onChange={(e) => setD((p) => ({ ...p, clientId: e.target.value, contactId: "", opportunityId: "" }))}
            >
              <option value="">Elegí un cliente…</option>
              {options.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contacto" name="contactId" error={errors.contactId}>
            <Select id="contactId" value={d.contactId} onChange={(e) => set("contactId", e.target.value)} disabled={!d.clientId}>
              <option value="">Sin contacto</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Título" name="title" required error={errors.title} className="sm:col-span-2">
            <Input
              id="title"
              value={d.title}
              maxLength={200}
              placeholder="Ej.: Tienda online con WooCommerce"
              aria-invalid={errors.title ? true : undefined}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field
            label="Oportunidad"
            name="opportunityId"
            error={errors.opportunityId}
            hint={d.clientId && !opportunities.length ? "Este cliente no tiene oportunidades abiertas." : undefined}
          >
            <Select id="opportunityId" value={d.opportunityId} onChange={(e) => set("opportunityId", e.target.value)} disabled={!d.clientId}>
              <option value="">Sin oportunidad</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text-muted">Moneda</span>
            <Segmented
              name="currency"
              label="Moneda"
              value={d.currency}
              onChange={(v) => set("currency", v)}
              options={[
                { value: "ARS", label: "Pesos (ARS)" },
                { value: "USD", label: "Dólares (USD)" },
              ]}
            />
          </div>
          <Field label="Fecha" name="issueDate" error={errors.issueDate}>
            <Input id="issueDate" type="date" value={d.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </Field>
          <Field
            label="Válido hasta"
            name="validUntil"
            error={errors.validUntil}
            hint={
              <button type="button" className="text-accent-2 hover:underline" onClick={() => set("validUntil", addDays(d.issueDate, 15))}>
                15 días desde la fecha
              </button>
            }
          >
            <Input
              id="validUntil"
              type="date"
              value={d.validUntil}
              aria-invalid={errors.validUntil ? true : undefined}
              onChange={(e) => set("validUntil", e.target.value)}
            />
          </Field>
          <Field
            label="Tipo de cambio de referencia (opcional)"
            name="exchangeRateRef"
            error={errors.exchangeRateRef}
            hint="Pesos por dólar. Solo informativo."
            className="sm:col-span-2"
          >
            <Input
              id="exchangeRateRef"
              inputMode="decimal"
              value={d.exchangeRateRef}
              placeholder="Ej.: 1450"
              onChange={(e) => set("exchangeRateRef", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionLabel>Ítems</SectionLabel>
          {!options.services.length ? (
            <Link href="/presupuestos/servicios" className="text-[13px] text-text-muted hover:text-text">
              Cargar servicios →
            </Link>
          ) : null}
        </div>
        <FieldErr msg={errors.items} />
        <ol className="flex flex-col gap-3">
          {d.items.map((it, i) => {
            const p = `items.${i}`;
            return (
              <li key={it.key} className="rounded-[10px] border border-border bg-bg-elevated/40 p-3" data-testid="quote-item">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={`Subir ítem ${i + 1}`}
                      disabled={i === 0}
                      onClick={() => move(it.key, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={`Bajar ítem ${i + 1}`}
                      disabled={i === d.items.length - 1}
                      onClick={() => move(it.key, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 hover:text-danger"
                      aria-label={`Quitar ítem ${i + 1}`}
                      onClick={() =>
                        set(
                          "items",
                          d.items.filter((x) => x.key !== it.key),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                  {options.services.length ? (
                    <Field label="Servicio" name={`${p}.serviceId`} className="col-span-2 sm:col-span-6">
                      <Select id={`${p}.serviceId`} value={it.serviceId} onChange={(e) => pickService(it.key, e.target.value)}>
                        <option value="">Ítem libre</option>
                        {options.services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  <Field label="Descripción" name={`${p}.description`} error={issueFor(`${p}.description`)} className="col-span-2 sm:col-span-6">
                    <Input id={`${p}.description`} value={it.description} maxLength={500} onChange={(e) => setItem(it.key, { description: e.target.value })} />
                  </Field>
                  <Field label="Cantidad" name={`${p}.quantity`} error={issueFor(`${p}.quantity`)} className="sm:col-span-2">
                    <Input id={`${p}.quantity`} inputMode="decimal" value={it.quantity} onChange={(e) => setItem(it.key, { quantity: e.target.value })} />
                  </Field>
                  <Field label="Unidad" name={`${p}.unit`} className="sm:col-span-2">
                    <Select id={`${p}.unit`} value={it.unit} onChange={(e) => setItem(it.key, { unit: e.target.value })}>
                      <option value="">—</option>
                      {Object.entries(L.serviceUnit).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label={`Precio unitario (${d.currency})`}
                    name={`${p}.unitPrice`}
                    error={issueFor(`${p}.unitPrice`)}
                    className="col-span-2 sm:col-span-2"
                  >
                    <Input
                      id={`${p}.unitPrice`}
                      inputMode="decimal"
                      value={it.unitPrice}
                      placeholder="0"
                      onChange={(e) => setItem(it.key, { unitPrice: e.target.value })}
                    />
                  </Field>
                  <Field label="Descuento" name={`${p}.discountType`} className="sm:col-span-2">
                    <Select
                      id={`${p}.discountType`}
                      value={it.discountType}
                      onChange={(e) => setItem(it.key, { discountType: e.target.value as ItemDraft["discountType"] })}
                    >
                      <option value="none">Sin descuento</option>
                      <option value="percent">Porcentaje (%)</option>
                      <option value="amount">Monto fijo</option>
                    </Select>
                  </Field>
                  <Field
                    label={it.discountType === "percent" ? "Descuento %" : "Descuento $"}
                    name={`${p}.discountValue`}
                    error={issueFor(`${p}.discountValue`)}
                    className="sm:col-span-2"
                  >
                    <Input
                      id={`${p}.discountValue`}
                      inputMode="decimal"
                      value={it.discountValue}
                      disabled={it.discountType === "none"}
                      placeholder="0"
                      onChange={(e) => setItem(it.key, { discountValue: e.target.value })}
                    />
                  </Field>
                  <div className="col-span-2 flex flex-col justify-end sm:col-span-2">
                    <span className="text-[13px] font-medium text-text-muted">Importe</span>
                    <span className="flex h-10 items-center justify-end font-mono text-[15px] text-text" data-testid="line-total">
                      {m(preview.totals.lines[i])}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <Button type="button" variant="secondary" className="mt-3 w-full sm:w-auto" onClick={() => set("items", [...d.items, emptyItem()])}>
          <Plus className="size-4" /> Agregar ítem
        </Button>
      </Card>

      <Card className="p-4 md:p-5">
        <SectionLabel className="mb-4">Descuento global y totales</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Descuento global" name="globalDiscountType">
            <Select
              id="globalDiscountType"
              value={d.globalDiscountType}
              onChange={(e) => set("globalDiscountType", e.target.value as QuoteDraft["globalDiscountType"])}
            >
              <option value="none">Sin descuento</option>
              <option value="percent">Porcentaje (%)</option>
              <option value="amount">Monto fijo</option>
            </Select>
          </Field>
          <Field label="Valor" name="globalDiscountValue" error={issueFor("globalDiscountValue")}>
            <Input
              id="globalDiscountValue"
              inputMode="decimal"
              value={d.globalDiscountValue}
              disabled={d.globalDiscountType === "none"}
              placeholder="0"
              onChange={(e) => set("globalDiscountValue", e.target.value)}
            />
          </Field>
        </div>
        <dl className="mt-5 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-border pt-4 text-[14px]">
          <dt className="text-text-muted">Subtotal</dt>
          <dd className="text-right font-mono">{m(preview.totals.subtotal)}</dd>
          <dt className="text-text-muted">Descuentos por ítem</dt>
          <dd className="text-right font-mono">−{m(preview.totals.itemsDiscount)}</dd>
          <dt className="text-text-muted">Descuento global</dt>
          <dd className="text-right font-mono">−{m(preview.totals.globalDiscount)}</dd>
          <dt className="mt-1 text-[15px] font-medium text-text">Total</dt>
          <dd className="mt-1 text-right font-mono text-[20px] font-semibold text-text" data-testid="editor-total">
            {m(preview.totals.total)}
          </dd>
        </dl>
        <p className="mt-2 text-[12px] text-text-faint">Precios finales, sin IVA. Los totales los calcula el servidor.</p>
      </Card>

      <Card className="p-4 md:p-5">
        <SectionLabel className="mb-4">Plan de cobro</SectionLabel>
        <Segmented
          name="planKind"
          label="Plan de cobro"
          value={d.plan.kind}
          onChange={(kind) =>
            setPlan(
              kind === "milestones" && !d.plan.items.length
                ? { kind, items: (PRESETS["50/50"] ?? []).map((x) => ({ ...x, key: newKey() })) }
                : kind === "monthly" && !d.plan.amount
                  ? { kind, amount: preview.totals.total === "0.00" ? "" : preview.totals.total }
                  : { kind },
            )
          }
          options={[
            { value: "single", label: L.paymentPlanKind.single },
            { value: "milestones", label: L.paymentPlanKind.milestones },
            { value: "monthly", label: L.paymentPlanKind.monthly },
          ]}
        />
        {d.plan.kind === "single" ? <p className="mt-3 text-[13px] text-text-muted">Un solo pago por el total, a la aceptación.</p> : null}
        {d.plan.kind === "milestones" ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-text-muted">Atajos:</span>
              {Object.entries(PRESETS).map(([k, rows]) => (
                <Button key={k} type="button" size="sm" variant="outline" onClick={() => setPlan({ items: rows.map((x) => ({ ...x, key: newKey() })) })}>
                  {k}
                </Button>
              ))}
            </div>
            {d.plan.items.map((ms, i) => (
              <div key={ms.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:grid-cols-[1fr_96px_120px_auto]">
                <Field
                  label="Etapa"
                  name={`paymentPlan.items.${i}.label`}
                  error={issueFor(`paymentPlan.items.${i}.label`)}
                  className="col-span-3 sm:col-span-1"
                >
                  <Input id={`paymentPlan.items.${i}.label`} value={ms.label} onChange={(e) => setMilestone(ms.key, { label: e.target.value })} />
                </Field>
                <Field label="%" name={`paymentPlan.items.${i}.percent`} error={issueFor(`paymentPlan.items.${i}.percent`)}>
                  <Input
                    id={`paymentPlan.items.${i}.percent`}
                    inputMode="decimal"
                    value={ms.percent}
                    onChange={(e) => setMilestone(ms.key, { percent: e.target.value })}
                  />
                </Field>
                <Field label="A los … días" name={`paymentPlan.items.${i}.offsetDays`}>
                  <Input
                    id={`paymentPlan.items.${i}.offsetDays`}
                    inputMode="numeric"
                    value={ms.offsetDays}
                    onChange={(e) => setMilestone(ms.key, { offsetDays: e.target.value })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar etapa ${i + 1}`}
                  className="hover:text-danger"
                  onClick={() => setPlan({ items: d.plan.items.filter((x) => x.key !== ms.key) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPlan({ items: [...d.plan.items, { key: newKey(), label: "", percent: "", offsetDays: "" }] })}
              >
                <Plus className="size-4" /> Etapa
              </Button>
              <span className={cn("font-mono text-[13px]", pctSum === 100 ? "text-success" : "text-warning")} aria-live="polite">
                Suma: {pctSum} %{pctSum === 100 ? " ✓" : " · debe ser 100"}
              </span>
            </div>
            <FieldErr msg={issueFor("paymentPlan.items") ?? errors.paymentPlan} />
          </div>
        ) : null}
        {d.plan.kind === "monthly" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={`Monto mensual (${d.currency})`} name="paymentPlan.amount" error={issueFor("paymentPlan.amount")}>
              <Input id="paymentPlan.amount" inputMode="decimal" value={d.plan.amount} onChange={(e) => setPlan({ amount: e.target.value })} />
            </Field>
            <Field
              label="Meses"
              name="paymentPlan.months"
              error={issueFor("paymentPlan.months")}
              hint="Vacío = indefinido (se generan los primeros 12 cobros al aceptar)."
            >
              <Input
                id="paymentPlan.months"
                inputMode="numeric"
                value={d.plan.months}
                placeholder="Indefinido"
                onChange={(e) => setPlan({ months: e.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Card>

      <Card className="p-4 md:p-5">
        <SectionLabel className="mb-4">Textos (Markdown)</SectionLabel>
        <div className="flex flex-col gap-4">
          {(
            [
              ["introMd", "Introducción", 3],
              ["scopeMd", "Alcance", 6],
              ["exclusionsMd", "Exclusiones", 5],
              ["termsMd", "Condiciones", 5],
              ["notesMd", "Notas", 3],
            ] as const
          ).map(([k, lbl, rows]) => (
            <Field key={k} label={lbl} name={k} error={errors[k]}>
              <Textarea id={k} rows={rows} value={d[k]} onChange={(e) => set(k, e.target.value)} className="font-mono text-[14px] md:text-[13px]" />
            </Field>
          ))}
        </div>
      </Card>
    </div>
  );

  const previewPane = (
    <div className="flex flex-col gap-2 lg:sticky lg:top-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Vista previa del PDF</SectionLabel>
        <span className="font-mono text-[11px] text-text-faint" aria-live="polite">
          {refreshing ? "actualizando…" : "al día"}
        </span>
      </div>
      <QuotePreviewFrame html={preview.html} className="h-[72dvh] lg:h-[calc(100dvh-150px)]" />
    </div>
  );

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mb-4 lg:hidden">
        <Segmented
          name="editorView"
          label="Vista"
          value={view}
          onChange={setView}
          options={[
            { value: "edit", label: "Editar" },
            { value: "preview", label: "Vista previa" },
          ]}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn(view === "preview" && "hidden lg:block")}>{editor}</div>
        <div className={cn(view === "edit" && "hidden lg:block")}>{previewPane}</div>
      </div>
      <SaveBar>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">Total</p>
          <p className="truncate font-mono text-[17px] font-semibold text-text" data-testid="savebar-total">
            {m(preview.totals.total)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setView(view === "edit" ? "preview" : "edit")}
            aria-label={view === "edit" ? "Ver vista previa" : "Volver a editar"}
          >
            {view === "edit" ? <Eye className="size-4" /> : <PenLine className="size-4" />}
          </Button>
          <Button type="button" variant="primary" loading={saving} onClick={save}>
            {quoteId ? "Guardar cambios" : "Crear presupuesto"}
          </Button>
        </div>
      </SaveBar>
    </div>
  );
}

function SaveBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-2.5 backdrop-blur md:bottom-0 md:left-[272px] lg:static lg:mt-6 lg:rounded-[var(--radius-card)] lg:border lg:px-5 lg:py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">{children}</div>
    </div>
  );
}
