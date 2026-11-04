import { z } from "zod";
import { isValidCuit } from "./cuit";
import { toCents } from "./money";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const zText = (max = 500) => z.preprocess(emptyToUndef, z.string().trim().max(max, `Máximo ${max} caracteres`));
export const zRequired = (max = 200, label = "Este campo") =>
  z.string({ error: `${label} es obligatorio` }).trim().min(1, `${label} es obligatorio`).max(max, `Máximo ${max} caracteres`);
export const zOptText = (max = 2000) => zText(max).optional();
export const zUuid = z.string().uuid("Identificador inválido");
export const zOptUuid = z.preprocess(emptyToUndef, z.string().uuid("Identificador inválido").optional());
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
export const zOptDate = z.preprocess(emptyToUndef, zDate.optional());
export const zOptTime = z.preprocess(emptyToUndef, z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida").optional());
export const zCurrency = z.enum(["ARS", "USD"], { error: "Moneda inválida" });
export const zEmail = z.preprocess(emptyToUndef, z.string().trim().email("Email inválido").optional());
export const zPhone = z.preprocess(emptyToUndef, z.string().trim().regex(/^[+\d][\d\s\-()]{5,24}$/, "Teléfono inválido").optional());
export const zCuit = z.preprocess(emptyToUndef, z.string().trim().refine(isValidCuit, "CUIT inválido (revisá el dígito verificador)").optional());
export const zUrl = z.preprocess(
  (v) => {
    const s = emptyToUndef(v);
    if (typeof s === "string" && !/^https?:\/\//i.test(s)) return `https://${s}`;
    return s;
  },
  z.string().url("URL inválida").optional(),
);

/** Monto decimal ≥ 0 como string normalizado ("1234.50"). Acepta coma decimal. */
export const zMoney = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().replace(/\./g, (m, i, s: string) => (s.includes(",") ? "" : m)).replace(",", ".") : v),
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Monto inválido")
    .transform((v) => {
      const c = toCents(v);
      return `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;
    }),
);
export const zOptMoney = z.preprocess(emptyToUndef, zMoney.optional());
export const zPositiveMoney = zMoney.refine((v) => toCents(v) > 0n, "El monto debe ser mayor a cero");
export const zInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());

/** FormData → objeto plano (arrays para claves repetidas terminadas en []). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] as unknown[] | undefined)?.push(val) ?? (out[key] = [val]);
    } else out[k] = val;
  }
  return out;
}
