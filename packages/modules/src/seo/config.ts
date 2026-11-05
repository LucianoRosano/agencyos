import type { SeoSeverity } from "./catalog";

/** Configuración y resumen de una auditoría (sin dependencias de red: lo importa también la web). */
export type AuditConfig = {
  maxPages: number;
  maxDepth: number;
  delayMs: number;
  concurrency: number;
  checkExternal: boolean;
  maxExternalChecks: number;
  lighthouseUrls: string[];
  maxDurationMs: number;
  scheduleId?: string | null;
};

export const DEFAULT_CONFIG: AuditConfig = {
  maxPages: 300,
  maxDepth: 10,
  delayMs: 250,
  concurrency: 4,
  checkExternal: true,
  maxExternalChecks: 100,
  lighthouseUrls: [],
  maxDurationMs: 45 * 60_000,
};

export function configFrom(raw: Record<string, unknown> | null | undefined): AuditConfig {
  const c = { ...DEFAULT_CONFIG, ...(raw ?? {}) } as AuditConfig;
  c.maxPages = clamp(Number(c.maxPages) || DEFAULT_CONFIG.maxPages, 1, 2000);
  c.maxDepth = clamp(Number(c.maxDepth) || DEFAULT_CONFIG.maxDepth, 0, 50);
  c.concurrency = clamp(Number(c.concurrency) || 4, 1, 4);
  c.delayMs = clamp(Number(c.delayMs) || 0, 0, 10_000);
  c.maxExternalChecks = clamp(Number(c.maxExternalChecks) || 0, 0, 500);
  c.lighthouseUrls = Array.isArray(c.lighthouseUrls) ? c.lighthouseUrls.slice(0, 5) : [];
  return c;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(n)));

export type AuditSummary = {
  formula: { version: string; text: string; weights: Record<SeoSeverity, number> };
  counts?: Record<SeoSeverity, number>;
  categories?: Record<string, Record<string, number>>;
  penalties?: { code: string; severity: string; affected: number; penalty: number }[];
  progress: { crawled: number; queued: number; blocked: number; phase: string };
  finalRootUrl?: string;
  robots?: { found: boolean; status: number | null; sitemaps: string[]; blocksAll: boolean; rules: number; crawlDelay: number | null };
  sitemap?: { found: boolean; files: string[]; urls: number; error: string | null; notCrawled: number; checked: boolean };
  https?: { rootIsHttps: boolean; hsts: boolean; httpRedirectsToHttps: boolean | null };
  links?: { internal: number; external: number; externalChecked: number; brokenInternal: number; brokenExternal: number };
  pages?: { total: number; html: number; indexable: number; ok: number; redirects: number; errors: number; medianTtfbMs: number | null; p90TtfbMs: number | null };
  google?: {
    configured: boolean;
    psi: { status: "ok" | "partial" | "error" | "quota" | "skipped"; errors: string[] };
    crux: { status: "ok" | "no_data" | "error" | "quota" | "skipped"; errors: string[] };
  };
  truncated?: string | null;
  durationMs?: number;
  regression?: { previousAuditId: string; scoreDelta: number; newCritical: number } | null;
};


export function sameOrigin(a: string, b: string) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

