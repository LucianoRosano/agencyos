import { allowLocalForTests, seoFetchFollow } from "./fetcher";

/**
 * PageSpeed Insights (Lighthouse, datos de laboratorio) y CrUX (Core Web Vitals de usuarios reales).
 * Ambas con la misma API key gratuita de Google. Los puntajes se guardan tal como los devuelve Google.
 */
export const PSI_DAILY_QUOTA = 25_000; // cuota gratuita por proyecto de Google Cloud (PageSpeed Insights API)
export const CRUX_DAILY_QUOTA = 150 * 60 * 24; // 150 consultas/minuto
export const QUOTA_WARN_RATIO = 0.8;

const base = (prod: string) => (allowLocalForTests() && process.env.SEO_GOOGLE_API_BASE ? process.env.SEO_GOOGLE_API_BASE : prod);
const PSI_URL = () => `${base("https://www.googleapis.com")}/pagespeedonline/v5/runPagespeed`;
const CRUX_URL = () => `${base("https://chromeuxreport.googleapis.com")}/v1/records:queryRecord`;

export type LabMetrics = { lcpMs: number | null; fcpMs: number | null; tbtMs: number | null; cls: number | null; speedIndexMs: number | null; ttiMs: number | null };
export type PsiResult = { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null; lab: LabMetrics };
export type CruxResult = { lcpP75: number | null; inpP75: number | null; clsP75: number | null; period: string | null };
export type GoogleError = { status: number | null; message: string; quota: boolean; invalidKey: boolean };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const score100 = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round(n * 100);
};

export function parsePsi(json: unknown): PsiResult {
  const lr = (json as { lighthouseResult?: { categories?: Record<string, { score?: unknown }>; audits?: Record<string, { numericValue?: unknown }> } })
    ?.lighthouseResult;
  if (!lr) throw new Error("Respuesta de PageSpeed sin lighthouseResult");
  const c = lr.categories ?? {};
  const a = lr.audits ?? {};
  const nv = (k: string) => {
    const n = num(a[k]?.numericValue);
    return n === null ? null : Math.round(n);
  };
  const cls = num(a["cumulative-layout-shift"]?.numericValue);
  return {
    performance: score100(c.performance?.score),
    accessibility: score100(c.accessibility?.score),
    bestPractices: score100(c["best-practices"]?.score),
    seo: score100(c.seo?.score),
    lab: {
      lcpMs: nv("largest-contentful-paint"),
      fcpMs: nv("first-contentful-paint"),
      tbtMs: nv("total-blocking-time"),
      cls: cls === null ? null : Math.round(cls * 1000) / 1000,
      speedIndexMs: nv("speed-index"),
      ttiMs: nv("interactive"),
    },
  };
}

export function parseCrux(json: unknown): CruxResult {
  const rec = (json as { record?: { metrics?: Record<string, { percentiles?: { p75?: unknown } }>; collectionPeriod?: Record<string, unknown> } })?.record;
  const m = rec?.metrics ?? {};
  const p75 = (k: string) => num(m[k]?.percentiles?.p75);
  const lcp = p75("largest_contentful_paint");
  const inp = p75("interaction_to_next_paint");
  const cls = p75("cumulative_layout_shift");
  const lp = (rec?.collectionPeriod as { lastDate?: { year: number; month: number; day: number } } | undefined)?.lastDate;
  return {
    lcpP75: lcp === null ? null : Math.round(lcp),
    inpP75: inp === null ? null : Math.round(inp),
    clsP75: cls === null ? null : Math.round(cls * 1000) / 1000,
    period: lp ? `${lp.year}-${String(lp.month).padStart(2, "0")}-${String(lp.day).padStart(2, "0")}` : null,
  };
}

function googleError(status: number | null, body: string): GoogleError {
  let message = `Google respondió ${status ?? "sin estado"}`;
  try {
    const j = JSON.parse(body) as { error?: { message?: string; status?: string } };
    if (j.error?.message) message = j.error.message.slice(0, 300);
  } catch {
    // cuerpo no JSON
  }
  const quota = status === 429 || /quota|rate limit/i.test(message);
  const invalidKey = status === 400 && /api key/i.test(message);
  return { status, message: quota ? "Cuota de Google agotada por ahora (429). Probá más tarde." : invalidKey ? "La API key de Google no es válida." : message, quota, invalidKey };
}

export async function runPsi(apiKey: string, url: string, strategy: "mobile" | "desktop"): Promise<{ ok: true; data: PsiResult } | { ok: false; error: GoogleError }> {
  const q = new URLSearchParams({ url, strategy, key: apiKey, locale: "es" });
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) q.append("category", c);
  try {
    const r = await seoFetchFollow(`${PSI_URL()}?${q}`, { timeoutMs: 120_000, maxBytes: 25 * 1024 * 1024, headers: { accept: "application/json" } });
    const body = r.body.toString("utf8");
    if (r.status !== 200) return { ok: false, error: googleError(r.status, body) };
    return { ok: true, data: parsePsi(JSON.parse(body)) };
  } catch (e) {
    return { ok: false, error: { status: null, message: e instanceof Error ? e.message : "Error de red", quota: false, invalidKey: false } };
  }
}

/** CrUX por URL u origen. 404 = Google no tiene datos de campo suficientes (se informa, no es un error). */
export async function runCrux(
  apiKey: string,
  target: { url: string } | { origin: string },
  formFactor: "PHONE" | "DESKTOP",
): Promise<{ ok: true; data: CruxResult | null } | { ok: false; error: GoogleError }> {
  try {
    const r = await seoFetchFollow(`${CRUX_URL()}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...target, formFactor, metrics: ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"] }),
      timeoutMs: 30_000,
    });
    const body = r.body.toString("utf8");
    if (r.status === 404) return { ok: true, data: null };
    if (r.status !== 200) return { ok: false, error: googleError(r.status, body) };
    return { ok: true, data: parseCrux(JSON.parse(body)) };
  } catch (e) {
    return { ok: false, error: { status: null, message: e instanceof Error ? e.message : "Error de red", quota: false, invalidKey: false } };
  }
}
