"use client";

import { Badge, Button, Select } from "@agencyos/ui";
import { FileUp, Upload } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "@/lib/toast";
import { applyImportAction, previewImportAction } from "./import-actions";

type Row = { line: number; status: "ok" | "duplicate" | "error"; summary: string; message?: string };
type Preview = { columns: string[]; rows: Row[]; ok: number; duplicates: number; errors: number };
type Kind = "clientes" | "movimientos";

const TONE = { ok: "success", duplicate: "neutral", error: "danger" } as const;
const STATUS_LABEL = { ok: "Se crea", duplicate: "Ya existe", error: "Error" } as const;

/** Importar clientes o movimientos desde un CSV (Excel/Sheets/banco): vista previa → importar. */
export function ImportPanel({
  accounts,
  templates,
  canFinance,
}: {
  accounts: { value: string; label: string }[];
  templates: Record<Kind, string>;
  canFinance: boolean;
}) {
  const [kind, setKind] = useState<Kind>("clientes");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.value ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const fileId = useId();

  function reset(k: Kind) {
    setKind(k);
    setPreview(null);
  }
  async function onFile(f: File | undefined) {
    setPreview(null);
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) return void toast.error("El archivo supera 1,5 MB. Partilo en varios.");
    setFileName(f.name);
    setCsv(await f.text());
  }
  function doPreview() {
    start(async () => {
      const r = await previewImportAction(kind, csv, accountId);
      if (r.ok) setPreview(r.data as Preview);
      else toast.error(r.error.message);
    });
  }
  function doApply() {
    start(async () => {
      const r = await applyImportAction(kind, csv, accountId);
      if (!r.ok) return void toast.error(r.error.message);
      const d = r.data as Preview & { created: number };
      toast.success(`Importación lista: ${d.created} ${kind === "clientes" ? "clientes" : "movimientos"} creados`);
      setPreview(d);
      setCsv("");
      setFileName("");
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="import-panel">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qué importar">
        {(["clientes", ...(canFinance ? ["movimientos"] : [])] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => reset(k)}
            className={`h-10 rounded-full border px-4 text-[14px] ${kind === k ? "border-accent/60 bg-accent-soft text-text" : "border-border text-text-muted hover:text-text"}`}
          >
            {k === "clientes" ? "Clientes" : "Movimientos"}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-text-muted">
        Columnas que reconoce (en cualquier orden, con o sin tildes):{" "}
        <code className="font-mono text-[12px] break-all text-text">{templates[kind].replaceAll(";", "; ")}</code>.
        {kind === "movimientos"
          ? " El monto puede venir con signo (−: gasto) o en columnas Crédito / Débito como exportan los bancos. Los repetidos (misma fecha, monto y descripción) se saltean."
          : " Solo «Nombre» es obligatoria. Los clientes que ya existen se saltean."}
      </p>
      {kind === "movimientos" ? (
        <label className="flex flex-col gap-1.5 text-[13px] text-text-muted md:max-w-sm">
          Cuenta destino
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="text-base md:text-sm">
            {accounts.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={fileId}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[14px] text-text hover:bg-surface-2"
        >
          <FileUp className="size-4 shrink-0" /> <span className="max-w-[60vw] truncate">{fileName || "Elegir archivo CSV"}</span>
        </label>
        <input id={fileId} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="secondary" disabled={!csv || pending || (kind === "movimientos" && !accountId)} loading={pending && !preview} onClick={doPreview}>
          Vista previa
        </Button>
        {preview && preview.ok > 0 && csv ? (
          <Button variant="primary" disabled={pending} loading={pending} onClick={doApply}>
            <Upload className="size-4" /> Importar {preview.ok}
          </Button>
        ) : null}
      </div>
      {preview ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-text-muted">
            <strong className="text-text">{preview.ok}</strong> para crear · {preview.duplicates} ya existentes · {preview.errors} con errores
          </p>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-[10px] border border-border" aria-label="Vista previa de la importación">
            {preview.rows.map((r) => (
              <li key={r.line} className="flex items-start gap-3 px-3 py-2 text-[13px]">
                <span className="w-10 shrink-0 font-mono text-[11px] text-text-faint">L{r.line}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{r.summary}</span>
                  {r.message ? <span className="block text-[12px] text-text-muted">{r.message}</span> : null}
                </span>
                <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
