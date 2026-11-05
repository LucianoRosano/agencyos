import { createHash } from "node:crypto";
import { ISSUES, issueDef, SEO_CATEGORIES, SEO_SEVERITIES, type SeoCategory, type SeoSeverity } from "./catalog";

/**
 * Puntaje propio, transparente y versionado (docs/02 §M07). Se guarda la versión en cada auditoría
 * (`score_formula_version`) y el texto de la fórmula en `summary.formula` para mostrarla tal cual.
 */
export const SCORE_FORMULA_VERSION = "seo-score/1";
export const SEVERITY_WEIGHTS: Record<SeoSeverity, number> = { critical: 15, high: 8, medium: 4, low: 1.5 };
export const SCORE_FORMULA_TEXT =
  "Puntaje = 100 − Σ (por tipo de problema) peso × (0,5 + 0,5 × URLs afectadas ÷ páginas rastreadas). " +
  "Pesos por severidad: crítico 15, alto 8, medio 4, bajo 1,5. Los problemas de todo el sitio (robots.txt, sitemap, HTTPS) cuentan como si afectaran a todas las páginas. " +
  "Mínimo 0, redondeado. El puntaje por categoría aplica la misma fórmula solo con los problemas de esa categoría.";

export type ScoreIssue = { code: string; severity: string; category: string; url: string | null };
export type CategoryCounts = Record<SeoSeverity, number> & { score: number; total: number };
export type ScoreResult = {
  score: number;
  version: string;
  counts: Record<SeoSeverity, number>;
  categories: Record<SeoCategory, CategoryCounts>;
  penalties: { code: string; severity: string; affected: number; penalty: number }[];
};

function penaltyFor(severity: string, affected: number, siteWide: boolean, pages: number) {
  const w = SEVERITY_WEIGHTS[severity as SeoSeverity] ?? 0;
  const ratio = siteWide ? 1 : Math.min(1, affected / Math.max(1, pages));
  return w * (0.5 + 0.5 * ratio);
}

export function computeScore(issues: ScoreIssue[], pagesCrawled: number): ScoreResult {
  const groups = new Map<string, { severity: string; category: string; urls: Set<string>; siteWide: boolean }>();
  for (const i of issues) {
    const g = groups.get(i.code) ?? { severity: i.severity, category: i.category, urls: new Set<string>(), siteWide: false };
    if (i.url) g.urls.add(i.url);
    else g.siteWide = true;
    groups.set(i.code, g);
  }
  const counts = Object.fromEntries(SEO_SEVERITIES.map((s) => [s, 0])) as Record<SeoSeverity, number>;
  for (const i of issues) if (i.severity in counts) counts[i.severity as SeoSeverity]++;
  const catPenalty = Object.fromEntries(SEO_CATEGORIES.map((c) => [c, 0])) as Record<SeoCategory, number>;
  const penalties: ScoreResult["penalties"] = [];
  let total = 0;
  for (const [code, g] of groups) {
    const p = penaltyFor(g.severity, g.urls.size, g.siteWide, pagesCrawled);
    total += p;
    if (g.category in catPenalty) catPenalty[g.category as SeoCategory] += p;
    penalties.push({ code, severity: g.severity, affected: g.siteWide ? pagesCrawled : g.urls.size, penalty: Math.round(p * 10) / 10 });
  }
  penalties.sort((a, b) => b.penalty - a.penalty);
  const categories = Object.fromEntries(
    SEO_CATEGORIES.map((c) => {
      const inCat = issues.filter((i) => i.category === c);
      const sev = Object.fromEntries(SEO_SEVERITIES.map((s) => [s, inCat.filter((i) => i.severity === s).length])) as Record<SeoSeverity, number>;
      return [c, { ...sev, total: inCat.length, score: clampScore(100 - catPenalty[c]) }];
    }),
  ) as Record<SeoCategory, CategoryCounts>;
  return { score: clampScore(100 - total), version: SCORE_FORMULA_VERSION, counts, categories, penalties };
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** URL normalizada para comparar: esquema y host en minúsculas, sin puerto por defecto ni fragmento. */
export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
    if (!u.pathname) u.pathname = "/";
    return u.toString();
  } catch {
    return null;
  }
}

/** Fingerprint estable entre auditorías: código + URL normalizada (+ clave extra opcional). */
export function fingerprint(code: string, url: string | null, extra = ""): string {
  const norm = url ? (normalizeUrl(url) ?? url) : "";
  return createHash("sha256").update(`${code}|${norm}|${extra}`).digest("hex").slice(0, 32);
}

/** Datos del catálogo para una fila (categoría y severidad salen del código). */
export function classify(code: string): { category: SeoCategory; severity: SeoSeverity } {
  const d = issueDef(code);
  return { category: d.category, severity: d.severity };
}

export const ISSUE_CODES = Object.keys(ISSUES);
