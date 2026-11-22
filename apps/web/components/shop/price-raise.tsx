"use client";

import { formatMoney } from "@agencyos/core";
import { Button, Field, Input, Select, Sheet } from "@agencyos/ui";
import { TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { applyPriceRaiseAction, previewPriceRaiseAction, revertPriceRaiseAction } from "@/app/comercio/actions";
import { toast } from "@/lib/toast";

type Change = { id: string; name: string; from: string; to: string };

/** Aumentar (o bajar) precios por porcentaje, para todo el catálogo o una categoría, con redondeo y «Deshacer». */
export function PriceRaiseSheet({ categories, currency }: { categories: string[]; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState("");
  const [category, setCategory] = useState("");
  const [roundTo, setRoundTo] = useState("10");
  const [preview, setPreview] = useState<{ count: number; sample: Change[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valid = /^-?\d{1,3}([.,]\d{1,2})?$/.test(percent.trim()) && Number(percent.replace(",", ".")) !== 0;

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!open || !valid) return;
    const t = setTimeout(() => {
      void previewPriceRaiseAction({ percent, category, roundTo }).then((r) => {
        if (r.ok) setPreview(r.data as { count: number; sample: Change[] });
        else setError(r.error.message);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [open, valid, percent, category, roundTo]);

  function apply() {
    start(async () => {
      const r = await applyPriceRaiseAction({ percent, category, roundTo });
      if (!r.ok) return void toast.error(r.error.message);
      const { count, changes } = r.data as { count: number; changes: Change[] };
      setOpen(false);
      setPercent("");
      router.refresh();
      toast.success(`${count} ${count === 1 ? "precio actualizado" : "precios actualizados"}`, {
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: () =>
            void revertPriceRaiseAction(changes).then((u) => {
              if (u.ok) toast.success("Precios anteriores restaurados");
              else toast.error(u.error.message);
              router.refresh();
            }),
        },
      });
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Aumentar precios"
      trigger={
        <Button variant="secondary">
          <TrendingUp className="size-4" aria-hidden /> Aumentar precios
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-text-muted">
          Sube (o baja, con un número negativo) el precio de venta de todos los productos activos o de una categoría. El stock y el costo no cambian.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Porcentaje" name="raise-percent" hint="Ej.: 8 o 12,5 · −10 para bajar" error={error ?? undefined}>
            <Input
              id="raise-percent"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="8"
              className="text-base md:text-sm"
            />
          </Field>
          <Field label="Productos" name="raise-category">
            <Select id="raise-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todos</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Redondear a" name="raise-round">
            <Select id="raise-round" value={roundTo} onChange={(e) => setRoundTo(e.target.value)}>
              <option value="1">$ 1</option>
              <option value="10">$ 10</option>
              <option value="50">$ 50</option>
              <option value="100">$ 100</option>
              <option value="500">$ 500</option>
              <option value="1000">$ 1.000</option>
            </Select>
          </Field>
        </div>
        {preview ? (
          <div aria-live="polite" data-testid="raise-preview">
            <p className="mb-2 text-[14px]">
              <strong>{preview.count}</strong> {preview.count === 1 ? "producto cambia" : "productos cambian"} de precio
              {preview.count > preview.sample.length ? `; los primeros ${preview.sample.length}:` : ":"}
            </p>
            {preview.sample.length ? (
              <ul className="divide-y divide-border rounded-[10px] border border-border text-[14px]">
                {preview.sample.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 font-mono text-[13px]">
                      <span className="text-text-muted">{formatMoney(c.from, currency)}</span> → {formatMoney(c.to, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button variant="primary" disabled={!preview?.count || pending} loading={pending} onClick={apply}>
            Aplicar a {preview?.count ?? 0}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
