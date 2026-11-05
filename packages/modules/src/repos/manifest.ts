import { randomBytes } from "node:crypto";
import { hmac, safeEqualHex } from "../shared/crypto";

/**
 * Flujo de manifest de la GitHub App (docs/03 §6, docs/runbooks/github-app.md).
 * Permisos mínimos: metadata (lectura), contents (escritura solo al ejecutar planes aprobados: archivos vía PR),
 * administration (topics, descripción, renombre, archivado, protección de rama, alertas), pull requests e issues.
 * Además: actions (lectura, para el check de CI/gitleaks) y workflows (escritura: el CI estándar se agrega vía PR
 * y GitHub exige este permiso para tocar .github/workflows).
 * Los eventos `installation` e `installation_repositories` llegan siempre a la App (no se suscriben).
 */
export function buildManifest(appUrl: string) {
  const base = appUrl.replace(/\/$/, "");
  return {
    name: "AGENCYOS",
    url: base,
    description: "AGENCYOS · organización y mantenimiento de los repositorios de Luciano Rosano",
    hook_attributes: { url: `${base}/api/webhooks/github`, active: true },
    redirect_url: `${base}/api/github/manifest-callback`,
    setup_url: `${base}/api/github/install-callback`,
    setup_on_update: true,
    public: false,
    default_permissions: {
      metadata: "read",
      contents: "write",
      administration: "write",
      pull_requests: "write",
      issues: "write",
      actions: "read",
      workflows: "write",
    },
    default_events: ["repository", "push", "pull_request", "release"],
  };
}

/** Estado anti-CSRF para los redirects de GitHub: valor aleatorio en cookie httpOnly + firma HMAC. */
export function newOAuthState(): string {
  const v = randomBytes(16).toString("hex");
  return `${v}.${hmac(process.env.AUTH_SECRET ?? "dev", `gh-state:${v}`)}`;
}

export function checkOAuthState(cookie: string | undefined, param: string | null): boolean {
  if (!cookie || !param || cookie.length !== param.length) return false;
  const [v, sig] = param.split(".");
  if (!v || !sig || !/^[0-9a-f]{32}$/.test(v)) return false;
  return safeEqualHex(Buffer.from(cookie).toString("hex"), Buffer.from(param).toString("hex")) && safeEqualHex(hmac(process.env.AUTH_SECRET ?? "dev", `gh-state:${v}`), sig);
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Página HTML mínima (rutas /api: fuera de la CSP con nonce de la app, llevan su propia CSP estricta). */
export function htmlPage(title: string, body: string, opts: { formAction?: string } = {}): Response {
  const csp = ["default-src 'none'", "style-src 'unsafe-inline'", `form-action ${opts.formAction ?? "'none'"}`, "frame-ancestors 'none'", "base-uri 'none'"].join("; ");
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#06070a;color:#e8ebf2;max-width:720px;margin:0 auto;padding:32px 20px;line-height:1.5}
a,button{color:#fff;background:#7c5cff;border:0;border-radius:8px;padding:12px 16px;font-size:16px;text-decoration:none;display:inline-block;cursor:pointer}
pre{background:#11141b;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-all;font-size:13px}
p,li{color:#c9d1e0}.warn{color:#fbbf24}</style></head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp, "x-frame-options": "DENY", "referrer-policy": "no-referrer" } },
  );
}
