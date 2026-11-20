"use client";

import { adjustByPercent, formatMoney } from "@agencyos/core";
import { Button, Checkbox, Field, Input, Select, Sheet } from "@agencyos/ui";
import { TrendingUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { adjustRetainersAction, revertRetainerAmountsAction } from "@/app/(app)/finanzas/abonos/actions";
import { useAction } from "@/components/use-action";

export type AdjustRow = { id: string; concept: string; clientName: string; amount: string; currency: string };

const PCT = /^-?\d{1,3}([.,]\d{1,2})?$/;

/** Ajustar montos de abonos por un porcentaje (inflación), con vista previa, selección y Deshacer. */
export function AdjustRetainersButton({ rows }: { rows: AdjustRow[] }) {
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "ARS");
  const [roundTo, setRoundTo] = useState(100);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const changes = useRef<{ id: string; from: string; to: string }[]>([]);
  const { exec, pending } = useAction();
  const valid = PCT.test(percent.trim()) && Number(percent.replace(",", ".")) !== 0;
  const list = rows.filter((r) => r.currency === currency);
  const preview = useMemo(
    () => (valid ? new Map(list.map((r) => [r.id, adjustByPercent(r.amount, percent.trim().replace(",", "."), roundTo)])) : null),
    [valid, list, percent, roundTo],
  );
  const chosen = list.filter((r) => !skip.has(r.id));
  if (!rows.length) return null;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Ajustar montos"
      description="Aumentá tus abonos por inflación: se aplica desde el próximo cobro. Los cobros ya generados no cambian."
      wide
      trigger={
        <Button variant="secondary">
          <TrendingUp className="size-4" /> Ajustar montos
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Porcentaje" name="adj-pct" hint="Ej.: 15 o 12,5">
            <Input
              id="adj-pct"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="15"
              className="text-base md:text-sm"
            />
          </Field>
          {currencies.length > 1 ? (
            <Field label="Moneda" name="adj-cur">
              <Select id="adj-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Redondear a" name="adj-round">
            <Select id="adj-round" value={String(roundTo)} onChange={(e) => setRoundTo(Number(e.target.value))}>
              <option value="1">Sin redondeo</option>
              <option value="100">$ 100</option>
              <option value="1000">$ 1.000</option>
            </Select>
          </Field>
        </div>
        <ul className="flex max-h-[45vh] flex-col divide-y divide-border overflow-y-auto rounded-[var(--radius-control)] border border-border">
          {list.map((r) => (
            <li key={r.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5">
                <Checkbox
                  checked={!skip.has(r.id)}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSkip((s) => {
                      const n = new Set(s);
                      if (on) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    });
                  }}
                  className="size-5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-text">{r.concept}</span>
                  <span className="block truncate text-[12px] text-text-muted">{r.clientName}</span>
                </span>
                <span className="shrink-0 text-right font-mono text-[13px] tabular-nums">
                  <span className="text-text-muted">{formatMoney(r.amount, r.currency)}</span>
                  {preview && !skip.has(r.id) ? <span className="block text-text">→ {formatMoney(preview.get(r.id), r.currency)}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button
            variant="primary"
            loading={pending}
            disabled={!valid || !chosen.length}
            onClick={() =>
              exec(() => adjustRetainersAction({ percent: percent.trim().replace(",", "."), currency, roundTo, ids: chosen.map((r) => r.id) }), {
                success: `Abonos ajustados un ${percent.trim()} %`,
                onDone: (d) => {
                  changes.current = d.changes;
                  setOpen(false);
                  setPercent("");
                  setSkip(new Set());
                },
                undo: () => revertRetainerAmountsAction(changes.current),
              })
            }
          >
            Aplicar a {chosen.length} abono{chosen.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
