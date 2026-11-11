import { domainToASCII } from "node:url";

/**
 * Normaliza un nombre de dominio ingresado por la persona: saca protocolo, ruta, puerto y "www.",
 * pasa a minúsculas y a punycode (IDN). Devuelve null si no es un dominio válido.
 */
export function normalizeDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/:\d+$/, "").replace(/\.$/, "");
  if (s.startsWith("www.")) s = s.slice(4);
  if (!s) return null;
  const ascii = domainToASCII(s);
  if (!ascii) return null;
  if (ascii.length > 253) return null;
  const labels = ascii.split(".");
  if (labels.length < 2) return null;
  const okLabel = (l: string) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l);
  if (!labels.every(okLabel)) return null;
  const tld = labels[labels.length - 1] ?? "";
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return null;
  return ascii;
}

/** Compara versiones semver (x.y.z con prerelease opcional). <0 si a<b. */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = "", pre] = v.replace(/^v/i, "").split("-", 2);
    const nums = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
    return { nums: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0], pre: pre ?? null };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre.localeCompare(pb.pre, "en", { numeric: true });
}

export const SEMVER_RE = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
