import { createHmac, createPrivateKey, sign, timingSafeEqual } from "node:crypto";
import { FakeGitHub } from "./github-fake";
import { type AppConfig, type GhInstallation, type GhRepo, type GitHubClient, GitHubError, type InstallationApi } from "./github-types";

/**
 * Cliente de GitHub (docs/15 §6, docs/03 §6) con interfaz inyectable:
 * - `RealGitHub`: fetch a api.github.com con un JWT RS256 de la GitHub App (node:crypto, sin dependencias)
 *   canjeado por un token de instalación que se cachea hasta poco antes de vencer.
 * - `FakeGitHub` (github-fake.ts): en memoria con fixtures, SOLO para tests (GITHUB_FAKE=1 y NODE_ENV !== "production").
 *
 * La interfaz NO expone borrar repositorios, cambiar la visibilidad ni force-push: no existen esos métodos.
 */

export * from "./github-types";

// --- Configuración ---

/** Lee la configuración de la App desde el entorno. `null` si falta algo (estado "sin App"). */
export function appConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig | null {
  const appId = env.GITHUB_APP_ID?.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const webhookSecret = env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!appId || !privateKey || !webhookSecret) return null;
  return { appId, privateKey, webhookSecret, slug: env.GITHUB_APP_SLUG?.trim() || null };
}

/**
 * El modo simulado exige GITHUB_FAKE=1 explícito y además estar fuera de producción
 * (NODE_ENV !== "production") o servido en localhost: `next start` de los e2e corre con NODE_ENV=production
 * pero con APP_URL http://localhost:<puerto>. Con un dominio real (https) nunca se activa.
 */
export function fakeModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.GITHUB_FAKE !== "1") return false;
  if (env.NODE_ENV !== "production") return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test((env.APP_URL ?? "").replace(/\/$/, ""));
}

export const FAKE_WEBHOOK_SECRET = "fake-webhook-secret-solo-tests";

export function webhookSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return appConfigFromEnv(env)?.webhookSecret ?? (fakeModeEnabled(env) ? FAKE_WEBHOOK_SECRET : null);
}

// --- JWT RS256 de la App ---

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** JWT de la App (RS256, iat −60 s por desfase de reloj, vence a los 9 min; máximo de GitHub: 10). */
export function createAppJwt(appId: string, privateKeyPem: string, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const data = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(data), createPrivateKey(privateKeyPem));
  return `${data}.${b64url(signature)}`;
}

// --- Firma de webhooks ---

/** Verifica `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo) en tiempo constante. */
export function verifyWebhookSignature(secret: string, rawBody: string | Buffer, header: string | null | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const given = header.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const got = Buffer.from(given, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function signWebhook(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

// --- Implementación real ---

const API = "https://api.github.com";

type Json = Record<string, unknown>;

function mapRepo(r: Json): GhRepo {
  return {
    id: Number(r.id),
    name: String(r.name),
    fullName: String(r.full_name),
    owner: String((r.owner as Json | undefined)?.login ?? ""),
    description: (r.description as string | null) ?? null,
    private: Boolean(r.private),
    defaultBranch: String(r.default_branch ?? "main"),
    topics: Array.isArray(r.topics) ? (r.topics as string[]) : [],
    archived: Boolean(r.archived),
    pushedAt: (r.pushed_at as string | null) ?? null,
    language: (r.language as string | null) ?? null,
    isTemplate: Boolean(r.is_template),
  };
}

const encPath = (p: string) =>
  p
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");

const assertFullName = (fullName: string) => {
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(fullName)) throw new GitHubError(400, "Nombre de repositorio inválido");
  return fullName;
};

async function gh(
  method: string,
  path: string,
  opts: { token?: string; jwt?: string; body?: unknown; accept?: string } = {},
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    accept: opts.accept ?? "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "AGENCYOS",
  };
  if (opts.token) headers.authorization = `token ${opts.token}`;
  if (opts.jwt) headers.authorization = `Bearer ${opts.jwt}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")
    throw new GitHubError(429, "GitHub: límite de pedidos alcanzado. Se reintenta más tarde.");
  return { status: res.status, data };
}

function fail(status: number, data: unknown, what: string): never {
  const msg = (data as Json | null)?.message;
  throw new GitHubError(status, `GitHub (${what}): ${typeof msg === "string" ? msg : `HTTP ${status}`}`);
}

export class RealGitHub implements GitHubClient {
  readonly mode = "real" as const;
  private tokens = new Map<number, { token: string; expiresAt: number }>();
  constructor(private readonly cfg: AppConfig) {}

  private jwt() {
    return createAppJwt(this.cfg.appId, this.cfg.privateKey);
  }

  async getInstallation(installationId: number): Promise<GhInstallation> {
    const r = await gh("GET", `/app/installations/${Number(installationId)}`, { jwt: this.jwt() });
    if (r.status !== 200) fail(r.status, r.data, "instalación");
    const d = r.data as Json;
    const acc = d.account as Json;
    return { id: Number(d.id), account: { login: String(acc.login), type: String(acc.type) }, permissions: (d.permissions as Record<string, string>) ?? {} };
  }

  private async token(installationId: number): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
    const r = await gh("POST", `/app/installations/${Number(installationId)}/access_tokens`, { jwt: this.jwt() });
    if (r.status !== 201) fail(r.status, r.data, "token de instalación");
    const d = r.data as { token: string; expires_at: string };
    this.tokens.set(installationId, { token: d.token, expiresAt: new Date(d.expires_at).getTime() });
    return d.token;
  }

  installation(installationId: number): InstallationApi {
    const call = async (method: string, path: string, body?: unknown, accept?: string) =>
      gh(method, path, { token: await this.token(installationId), body, accept });
    const repo = (fullName: string) => `/repos/${assertFullName(fullName)}`;
    return {
      async listRepos() {
        const out: GhRepo[] = [];
        for (let page = 1; page <= 20; page++) {
          const r = await call("GET", `/installation/repositories?per_page=100&page=${page}`);
          if (r.status !== 200) fail(r.status, r.data, "repositorios");
          const list = ((r.data as Json).repositories as Json[]) ?? [];
          out.push(...list.map(mapRepo));
          if (list.length < 100) break;
        }
        return out;
      },
      async getRepo(fullName) {
        const r = await call("GET", repo(fullName));
        if (r.status === 404) return null;
        if (r.status !== 200) fail(r.status, r.data, "repositorio");
        return mapRepo(r.data as Json);
      },
      async getFile(fullName, path, ref) {
        const r = await call("GET", `${repo(fullName)}/contents/${encPath(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
        if (r.status === 404) return null;
        if (r.status !== 200) fail(r.status, r.data, path);
        const d = r.data as Json;
        if (Array.isArray(d) || d.type !== "file") return null;
        return Buffer.from(String(d.content ?? ""), "base64").toString("utf8");
      },
      async listDir(fullName, path, ref) {
        const r = await call("GET", `${repo(fullName)}/contents/${encPath(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
        if (r.status === 404) return [];
        if (r.status !== 200) fail(r.status, r.data, path);
        return Array.isArray(r.data) ? (r.data as Json[]).filter((x) => x.type === "file").map((x) => String(x.path)) : [];
      },
      async latestRun(fullName, branch) {
        const r = await call("GET", `${repo(fullName)}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1&exclude_pull_requests=true`);
        if (r.status === 404 || r.status === 403) return null;
        if (r.status !== 200) fail(r.status, r.data, "ejecuciones de la CI");
        const run = (((r.data as Json).workflow_runs as Json[]) ?? [])[0];
        if (!run) return null;
        const j = await call("GET", `${repo(fullName)}/actions/runs/${Number(run.id)}/jobs?per_page=50`);
        const jobs = j.status === 200 ? (((j.data as Json).jobs as Json[]) ?? []) : [];
        return {
          conclusion: (run.conclusion as string | null) ?? null,
          status: String(run.status),
          jobs: jobs.map((x) => ({
            name: String(x.name),
            conclusion: (x.conclusion as string | null) ?? null,
            steps: ((x.steps as Json[]) ?? []).map((s) => ({ name: String(s.name), conclusion: (s.conclusion as string | null) ?? null })),
          })),
        };
      },
      async branchProtection(fullName, branch) {
        const r = await call("GET", `${repo(fullName)}/branches/${encodeURIComponent(branch)}/protection`);
        if (r.status === 200) return "protected";
        if (r.status === 404) return "unprotected";
        if (r.status === 403) return "unavailable";
        fail(r.status, r.data, "protección de rama");
      },
      async vulnerabilityAlerts(fullName) {
        const r = await call("GET", `${repo(fullName)}/vulnerability-alerts`);
        if (r.status === 204) return true;
        if (r.status === 404) return false;
        return null;
      },
      async updateRepo(fullName, patch) {
        const body: Record<string, unknown> = {};
        if (patch.name !== undefined) body.name = patch.name;
        if (patch.description !== undefined) body.description = patch.description;
        if (patch.archived === true) body.archived = true;
        const r = await call("PATCH", repo(fullName), body);
        if (r.status !== 200) fail(r.status, r.data, "editar repositorio");
        return mapRepo(r.data as Json);
      },
      async replaceTopics(fullName, topics) {
        const r = await call("PUT", `${repo(fullName)}/topics`, { names: topics });
        if (r.status !== 200) fail(r.status, r.data, "topics");
        return ((r.data as Json).names as string[]) ?? topics;
      },
      async enableSecurity(fullName) {
        const r = await call("PUT", `${repo(fullName)}/vulnerability-alerts`);
        if (r.status !== 204) fail(r.status, r.data, "alertas de seguridad");
        await call("PUT", `${repo(fullName)}/automated-security-fixes`); // mejor esfuerzo
      },
      async protectBranch(fullName, branch, requiredChecks) {
        const r = await call("PUT", `${repo(fullName)}/branches/${encodeURIComponent(branch)}/protection`, {
          required_status_checks: requiredChecks.length ? { strict: true, contexts: requiredChecks } : null,
          enforce_admins: false,
          required_pull_request_reviews: { required_approving_review_count: 0 },
          restrictions: null,
          allow_force_pushes: false,
          allow_deletions: false,
        });
        if (r.status !== 200) fail(r.status, r.data, "proteger rama");
      },
      async openFilesPr(fullName, p) {
        const base = await call("GET", `${repo(fullName)}/git/ref/heads/${encodeURIComponent(p.base)}`);
        if (base.status !== 200) fail(base.status, base.data, "rama base");
        const sha = String(((base.data as Json).object as Json).sha);
        let branch = p.branch;
        for (let i = 0; i < 5; i++) {
          const c = await call("POST", `${repo(fullName)}/git/refs`, { ref: `refs/heads/${branch}`, sha });
          if (c.status === 201) break;
          if (c.status !== 422 || i === 4) fail(c.status, c.data, "crear rama");
          branch = `${p.branch}-${i + 2}`;
        }
        for (const f of p.files) {
          const cur = await call("GET", `${repo(fullName)}/contents/${encPath(f.path)}?ref=${encodeURIComponent(branch)}`);
          const curSha = cur.status === 200 && !Array.isArray(cur.data) ? (cur.data as Json).sha : undefined;
          const put = await call("PUT", `${repo(fullName)}/contents/${encPath(f.path)}`, {
            message: `chore: ${curSha ? "actualiza" : "agrega"} ${f.path} (estándar AGENCYOS)`,
            content: Buffer.from(f.content, "utf8").toString("base64"),
            branch,
            ...(curSha ? { sha: curSha } : {}),
          });
          if (put.status !== 200 && put.status !== 201) fail(put.status, put.data, f.path);
        }
        const pr = await call("POST", `${repo(fullName)}/pulls`, { title: p.title, head: branch, base: p.base, body: p.body });
        if (pr.status !== 201) fail(pr.status, pr.data, "abrir PR");
        const d = pr.data as Json;
        return { number: Number(d.number), url: String(d.html_url) };
      },
      async createFromTemplate(p) {
        const r = await call("POST", `${repo(p.templateFullName)}/generate`, {
          owner: p.owner,
          name: p.name,
          description: p.description,
          private: true,
          include_all_branches: false,
        });
        if (r.status !== 201) fail(r.status, r.data, "crear desde plantilla");
        return mapRepo(r.data as Json);
      },
    };
  }
}

/** Canje del código del flujo de manifest (no requiere autenticación; el código vence en 1 h y es de un solo uso). */
export async function exchangeManifestCode(
  code: string,
): Promise<{ id: number; slug: string; pem: string; webhookSecret: string; htmlUrl: string; owner: string }> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(code)) throw new GitHubError(400, "Código inválido");
  const r = await gh("POST", `/app-manifests/${encodeURIComponent(code)}/conversions`);
  if (r.status !== 201) fail(r.status, r.data, "canje del manifest");
  const d = r.data as Json;
  return {
    id: Number(d.id),
    slug: String(d.slug),
    pem: String(d.pem),
    webhookSecret: String(d.webhook_secret ?? ""),
    htmlUrl: String(d.html_url ?? ""),
    owner: String((d.owner as Json | undefined)?.login ?? ""),
  };
}

// --- Fábrica inyectable ---

let override: GitHubClient | null = null;
let realSingleton: { key: string; client: RealGitHub } | null = null;
let fakeSingleton: GitHubClient | null = null;

/** Inyección para tests. */
export function setGitHubClient(c: GitHubClient | null) {
  override = c;
}

export function getGitHubClient(): GitHubClient | null {
  if (override) return override;
  if (fakeModeEnabled()) {
    fakeSingleton ??= new FakeGitHub();
    return fakeSingleton;
  }
  const cfg = appConfigFromEnv();
  if (!cfg) return null;
  const key = `${cfg.appId}:${cfg.privateKey.length}`;
  if (!realSingleton || realSingleton.key !== key) realSingleton = { key, client: new RealGitHub(cfg) };
  return realSingleton.client;
}

export function resetFakeSingleton() {
  fakeSingleton = null;
}
