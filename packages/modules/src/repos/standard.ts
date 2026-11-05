/**
 * Estándar de repositorios (docs/15 §2 y §5): convención de nombres, topics, descripción,
 * archivos estándar y puntaje de salud. Funciones puras: sin base de datos ni red.
 */

export const REPO_SCOPES = ["prod", "cli", "int", "tpl", "per", "edu"] as const;
export type RepoScope = (typeof REPO_SCOPES)[number];
export const isRepoScope = (s: string | null | undefined): s is RepoScope => !!s && (REPO_SCOPES as readonly string[]).includes(s);

export const SCOPE_LABEL: Record<RepoScope, string> = {
  prod: "Producto propio",
  cli: "Cliente",
  int: "Interno",
  tpl: "Plantilla",
  per: "Personal",
  edu: "Facultad",
};

export const TOPIC_TYPES = ["wp-plugin", "wp-tema", "wp-sitio", "php-panel", "app-web", "herramienta", "docs", "plantilla"] as const;
export const TOPIC_STACKS = ["wordpress", "woocommerce", "php", "python", "nextjs", "typescript"] as const;
export const TOPIC_STATES = ["activo", "mantenimiento", "pausado", "archivado"] as const;

export const NAME_MAX = 50;

/** Normaliza un texto a un segmento de nombre: minúsculas, sin tildes, ñ → n, kebab-case. */
export function slugPart(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Slug compacto para topics de cliente ("Librería Uno" → "libreriauno"). */
export function compactSlug(s: string): string {
  return slugPart(s).replace(/-/g, "");
}

function clampName(name: string): string {
  if (name.length <= NAME_MAX) return name;
  return name.slice(0, NAME_MAX).replace(/-+$/g, "");
}

/** Arma un nombre con la convención `<alcance>-<cliente o producto>-<tecnología>-<nombre>` (§2.2). */
export function buildRepoName(p: { scope: RepoScope; owner?: string | null; tech?: string | null; name: string }): string {
  const parts = [p.scope, p.owner ? compactSlug(p.owner) : "", p.tech ? slugPart(p.tech) : "", slugPart(p.name)].filter(Boolean);
  // sin segmentos repetidos consecutivos (p. ej. "cli-sofia-sofia-panel")
  const tokens = parts.join("-").split("-");
  const out: string[] = [];
  for (const t of tokens) if (t && out[out.length - 1] !== t) out.push(t);
  return clampName(out.join("-"));
}

const NAME_RE = new RegExp(`^(${REPO_SCOPES.join("|")})-[a-z0-9]+(-[a-z0-9]+)*$`);

export function nameFollowsConvention(name: string): boolean {
  return name.length <= NAME_MAX && NAME_RE.test(name);
}

export function scopeFromName(name: string): RepoScope | null {
  const first = name.split("-")[0]?.toLowerCase();
  return isRepoScope(first) && nameFollowsConvention(name) ? first : null;
}

export function scopeFromTopics(topics: string[]): RepoScope | null {
  for (const t of topics) {
    const m = /^alcance-(.+)$/.exec(t);
    if (m && isRepoScope(m[1])) return m[1];
  }
  return null;
}

export function clientTopic(topics: string[]): string | null {
  for (const t of topics) {
    const m = /^cliente-([a-z0-9]+)$/.exec(t);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Propone un nombre que cumpla la convención a partir del actual (determinístico).
 * Necesita el alcance; sin alcance no se adivina (se pide en Vínculos).
 */
export function suggestRepoName(current: string, scope: RepoScope | null, owner?: string | null): string | null {
  if (!scope) return null;
  const ownerTokens = owner ? slugPart(owner).split("-").filter(Boolean) : [];
  const tokens = slugPart(current)
    .split("-")
    .filter((t) => t && !isRepoScope(t) && !ownerTokens.includes(t));
  if (!tokens.length && !ownerTokens.length) return null;
  const suggestion = clampName([scope, ...ownerTokens, ...tokens].filter(Boolean).join("-"));
  return nameFollowsConvention(suggestion) ? suggestion : null;
}

/**
 * Slug de cliente para topics y nombres: el nombre compacto si es corto ("Librería Uno" → "libreriauno"),
 * si no, la primera palabra ("Sofía Casa Editorial" → "sofia").
 */
export function clientSlug(c: { name: string; tradeName?: string | null }): string {
  const full = compactSlug(c.tradeName || c.name);
  if (full.length <= 14) return full;
  return compactSlug((c.tradeName || c.name).split(/\s+/)[0] ?? full) || full.slice(0, 14);
}

type Candidate = { id: string; name: string };

/**
 * Inferencia de vínculos por convención de nombres y topics (docs/15 §6).
 * `sure` = segura (se aplica sola al sincronizar); si no, se muestra como sugerencia confirmable en Vínculos.
 */
export function inferLinks(
  repo: { id?: string; name: string; topics: string[] },
  c: {
    clients: (Candidate & { tradeName?: string | null })[];
    projects: (Candidate & { clientId?: string | null })[];
    products: (Candidate & { repositoryId?: string | null })[];
  },
) {
  const scope = scopeFromName(repo.name) ?? scopeFromTopics(repo.topics);
  const compactRepo = compactSlug(repo.name);
  const tokens = slugPart(repo.name).split("-");
  let client: { id: string; sure: boolean } | null = null;
  const topic = clientTopic(repo.topics);
  if (topic) {
    const m = c.clients.filter((x) => clientSlug(x) === topic || compactSlug(x.tradeName || x.name) === topic);
    if (m.length === 1 && m[0]) client = { id: m[0].id, sure: true };
  }
  if (!client) {
    const m = c.clients.filter((x) => {
      const s = clientSlug(x);
      return s.length >= 3 && (tokens.includes(s) || (s.length >= 6 && compactRepo.includes(s)));
    });
    if (m.length === 1 && m[0]) client = { id: m[0].id, sure: false };
  }
  let product: { id: string; sure: boolean } | null = null;
  const own = repo.id ? c.products.filter((p) => p.repositoryId === repo.id) : [];
  if (own.length === 1 && own[0]) product = { id: own[0].id, sure: true };
  else if (scope === "prod") {
    const m = c.products.filter((p) => compactSlug(p.name).length >= 4 && compactRepo.includes(compactSlug(p.name)));
    if (m.length === 1 && m[0]) product = { id: m[0].id, sure: false };
  }
  let project: { id: string; sure: boolean } | null = null;
  const pm = c.projects.filter((p) => compactSlug(p.name).length >= 4 && compactRepo.includes(compactSlug(p.name)));
  if (pm.length === 1 && pm[0]) project = { id: pm[0].id, sure: false };
  return { scope, client, project, product };
}

// --- Topics (§2.3) ---

export function topicsStatus(topics: string[], scope: RepoScope | null) {
  const has = (prefix: string, values?: readonly string[]) =>
    topics.some((t) => t.startsWith(prefix) && (!values || values.includes(t.slice(prefix.length))));
  const required: { key: string; ok: boolean }[] = [
    { key: "alcance", ok: has("alcance-", REPO_SCOPES) },
    { key: "tipo", ok: has("tipo-", TOPIC_TYPES) },
    { key: "stack", ok: has("stack-", TOPIC_STACKS) },
    { key: "estado", ok: has("estado-", TOPIC_STATES) },
  ];
  if ((scope ?? scopeFromTopics(topics)) === "cli") required.push({ key: "cliente", ok: !!clientTopic(topics) });
  const known = /^(alcance|tipo|stack|estado|cliente)-/;
  const invalid = topics.filter(
    (t) =>
      known.test(t) &&
      !(
        (t.startsWith("alcance-") && isRepoScope(t.slice(8))) ||
        (t.startsWith("tipo-") && (TOPIC_TYPES as readonly string[]).includes(t.slice(5))) ||
        (t.startsWith("stack-") && (TOPIC_STACKS as readonly string[]).includes(t.slice(6))) ||
        (t.startsWith("estado-") && (TOPIC_STATES as readonly string[]).includes(t.slice(7))) ||
        /^cliente-[a-z0-9]+$/.test(t)
      ),
  );
  return { missing: required.filter((r) => !r.ok).map((r) => r.key), invalid, present: required.filter((r) => r.ok).length };
}

export function stateTopic(topics: string[]): (typeof TOPIC_STATES)[number] | null {
  for (const s of TOPIC_STATES) if (topics.includes(`estado-${s}`)) return s;
  return null;
}

const LANGUAGE_STACK: Record<string, (typeof TOPIC_STACKS)[number]> = {
  PHP: "php",
  Python: "python",
  TypeScript: "typescript",
  JavaScript: "typescript",
};

/** Stack inferido por el lenguaje principal de GitHub. */
export function stackFromLanguage(language: string | null | undefined): (typeof TOPIC_STACKS)[number] | null {
  return language ? (LANGUAGE_STACK[language] ?? null) : null;
}

/** Topics propuestos: conserva los existentes válidos y completa lo que se puede inferir sin adivinar. */
export function proposeTopics(p: {
  topics: string[];
  scope: RepoScope | null;
  clientSlug?: string | null;
  language?: string | null;
  pushedAt?: Date | null;
  archived?: boolean;
  isTemplate?: boolean;
  now?: Date;
}): string[] {
  const out = new Set(p.topics.filter((t) => !topicsStatus([t], p.scope).invalid.length));
  const has = (prefix: string) => [...out].some((t) => t.startsWith(prefix));
  if (p.scope && !has("alcance-")) out.add(`alcance-${p.scope}`);
  if (p.scope === "cli" && p.clientSlug && !has("cliente-")) out.add(`cliente-${p.clientSlug}`);
  const stack = stackFromLanguage(p.language);
  if (stack && !has("stack-")) out.add(`stack-${stack}`);
  if ((p.isTemplate || p.scope === "tpl") && !has("tipo-")) out.add("tipo-plantilla");
  if (!has("estado-")) {
    const days = p.pushedAt ? ((p.now ?? new Date()).getTime() - p.pushedAt.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    out.add(p.archived ? "estado-archivado" : days <= 90 ? "estado-activo" : "estado-mantenimiento");
  } else if (out.has("estado-activo") && !p.archived) {
    const days = p.pushedAt ? ((p.now ?? new Date()).getTime() - p.pushedAt.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    if (days > 90) {
      out.delete("estado-activo");
      out.add("estado-mantenimiento");
    }
  }
  const order = ["alcance-", "cliente-", "tipo-", "stack-", "estado-"];
  const rank = (t: string) => {
    const i = order.findIndex((o) => t.startsWith(o));
    return i === -1 ? order.length : i;
  };
  return [...out].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, 20);
}

// --- Descripción (§2.4) ---

/** `[Cliente o Producto] Qué es, en una frase — stack` */
export const DESCRIPTION_RE = /^\[[^\]]{2,60}\] .{3,}\s—\s\S.*$/;

export function descriptionStatus(description: string | null | undefined): "pass" | "warn" | "fail" {
  if (!description?.trim()) return "fail";
  return DESCRIPTION_RE.test(description.trim()) ? "pass" : "warn";
}

const STACK_LABEL: Record<string, string> = {
  wordpress: "WordPress",
  woocommerce: "WooCommerce",
  php: "PHP",
  python: "Python",
  nextjs: "Next.js",
  typescript: "TypeScript",
};

export function proposeDescription(p: { description: string | null; owner: string | null; name: string; topics: string[]; language: string | null }): string {
  const stacks = p.topics.filter((t) => t.startsWith("stack-")).map((t) => STACK_LABEL[t.slice(6)] ?? t.slice(6));
  const stack = stacks.length ? stacks.join("/") : (p.language ?? "sin stack definido");
  const what = (p.description ?? "")
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/\s—\s.*$/, "")
    .trim();
  const humanName = p.name
    .split("-")
    .filter((t) => !isRepoScope(t))
    .join(" ");
  const sentence = what || humanName.charAt(0).toUpperCase() + humanName.slice(1);
  return `[${p.owner ?? "Sin cliente"}] ${sentence} — ${stack}`.slice(0, 350);
}

// --- README (§2.5) ---

export const README_SECTIONS: { key: string; label: string; match: RegExp }[] = [
  { key: "que_es", label: "Qué es", match: /^que es/ },
  { key: "cliente", label: "Cliente / Proyecto", match: /^(cliente|proyecto)/ },
  { key: "estado", label: "Estado", match: /^estado/ },
  { key: "stack", label: "Stack", match: /^stack/ },
  { key: "instalacion", label: "Instalación / Despliegue", match: /^(instalacion|despliegue)/ },
  { key: "configuracion", label: "Configuración", match: /^configuracion/ },
  { key: "estructura", label: "Estructura", match: /^estructura/ },
  { key: "versionado", label: "Versionado", match: /^versionado/ },
  { key: "mantenimiento", label: "Mantenimiento", match: /^mantenimiento/ },
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function readmeMissingSections(md: string): string[] {
  const headings = md
    .split("\n")
    .map((l) => /^#{1,4}\s+(.+?)\s*#*\s*$/.exec(l)?.[1])
    .filter((h): h is string => !!h)
    .map(norm);
  return README_SECTIONS.filter((s) => !headings.some((h) => s.match.test(h))).map((s) => s.label);
}

// --- .gitignore (§2.5) ---

export const GITIGNORE_SENSITIVE: { pattern: string; accepts: string[] }[] = [
  { pattern: ".env*", accepts: [".env*", ".env.*", ".env", "*.env"] },
  { pattern: "*.key", accepts: ["*.key"] },
  { pattern: "*.pem", accepts: ["*.pem"] },
  { pattern: "*.crt", accepts: ["*.crt"] },
  { pattern: "*.p12", accepts: ["*.p12"] },
];

export function gitignoreMissing(content: string): string[] {
  const lines = new Set(
    content
      .split("\n")
      .map((l) => l.trim().replace(/^\//, ""))
      .filter((l) => l && !l.startsWith("#")),
  );
  return GITIGNORE_SENSITIVE.filter((g) => !g.accepts.some((a) => lines.has(a))).map((g) => g.pattern);
}

// --- Checks y puntaje (§5) ---

export const CHECKS = [
  { key: "nombre", weight: 10, label: "Nombre" },
  { key: "descripcion", weight: 5, label: "Descripción" },
  { key: "topics", weight: 10, label: "Topics" },
  { key: "readme", weight: 15, label: "README" },
  { key: "claude_md", weight: 10, label: "CLAUDE.md" },
  { key: "gitignore", weight: 5, label: ".gitignore" },
  { key: "secretos", weight: 20, label: "Secretos (gitleaks)" },
  { key: "ci", weight: 10, label: "CI" },
  { key: "rama_protegida", weight: 5, label: "Rama protegida" },
  { key: "seguridad", weight: 5, label: "Alertas de seguridad" },
  { key: "coherencia_estado", weight: 5, label: "Coherencia de estado" },
] as const;
export type CheckKey = (typeof CHECKS)[number]["key"];
export type CheckStatus = "pass" | "warn" | "fail" | "na";
export type CheckResult = { key: CheckKey; status: CheckStatus; message: string; details?: Record<string, unknown> };

export const CHECK_LABEL = Object.fromEntries(CHECKS.map((c) => [c.key, c.label])) as Record<CheckKey, string>;
export const CHECK_WEIGHT = Object.fromEntries(CHECKS.map((c) => [c.key, c.weight])) as Record<CheckKey, number>;

const FACTOR: Record<Exclude<CheckStatus, "na">, number> = { pass: 1, warn: 0.5, fail: 0 };

/**
 * Puntaje 0–100: suma ponderada (pass = peso completo, warn = la mitad, fail = 0).
 * Los checks N/A no cuentan y su peso se redistribuye proporcionalmente.
 * Si `secretos` falla, el máximo es 40.
 */
export function healthScore(checks: Pick<CheckResult, "key" | "status">[]): number {
  let total = 0;
  let got = 0;
  for (const c of checks) {
    if (c.status === "na") continue;
    const w = CHECK_WEIGHT[c.key] ?? 0;
    total += w;
    got += w * FACTOR[c.status];
  }
  const score = total ? Math.round((got / total) * 100) : 0;
  const secretsFailed = checks.some((c) => c.key === "secretos" && c.status === "fail");
  return secretsFailed ? Math.min(score, 40) : score;
}

export type HealthBand = "green" | "yellow" | "red";
export function healthBand(score: number | null | undefined): HealthBand | null {
  if (score === null || score === undefined) return null;
  return score >= 90 ? "green" : score >= 70 ? "yellow" : "red";
}

/** Datos crudos que el sincronizador junta de GitHub para evaluar un repositorio. */
export type RepoFacts = {
  name: string;
  description: string | null;
  topics: string[];
  archived: boolean;
  isTemplate?: boolean;
  defaultBranch: string;
  pushedAt: Date | null;
  scope: RepoScope | null;
  ownerLabel?: string | null; // cliente o producto vinculado (para sugerir nombre)
  readme: string | null;
  claudeMd: string | null;
  gitignore: string | null;
  workflows: { path: string; content: string }[];
  latestRun: null | {
    conclusion: string | null;
    status: string;
    jobs: { name: string; conclusion: string | null; steps: { name: string; conclusion: string | null }[] }[];
  };
  branchProtection: "protected" | "unprotected" | "unavailable";
  vulnerabilityAlerts: boolean | null;
};

export function evaluateRepo(f: RepoFacts, now = new Date()): CheckResult[] {
  const out: CheckResult[] = [];
  // nombre
  if (nameFollowsConvention(f.name)) out.push({ key: "nombre", status: "pass", message: "Cumple la convención" });
  else {
    const suggestion = suggestRepoName(f.name, f.scope, f.ownerLabel);
    out.push({
      key: "nombre",
      status: "fail",
      message: suggestion ? `No cumple la convención. Propuesto: ${suggestion}` : "No cumple la convención. Definí el alcance en Vínculos para proponer un nombre.",
      details: { suggestion },
    });
  }
  // descripción
  const ds = descriptionStatus(f.description);
  out.push({
    key: "descripcion",
    status: ds,
    message: ds === "pass" ? "Con formato [Cliente] Qué es — stack" : ds === "warn" ? "Presente, sin el formato [Cliente] Qué es — stack" : "Sin descripción",
  });
  // topics
  const ts = topicsStatus(f.topics, f.scope);
  out.push({
    key: "topics",
    status: !ts.missing.length && !ts.invalid.length ? "pass" : ts.present > 0 ? "warn" : "fail",
    message:
      !ts.missing.length && !ts.invalid.length
        ? "Alcance, tipo, stack y estado presentes"
        : [ts.missing.length ? `Faltan: ${ts.missing.join(", ")}` : "", ts.invalid.length ? `Fuera del vocabulario: ${ts.invalid.join(", ")}` : ""]
            .filter(Boolean)
            .join(" · "),
    details: { missing: ts.missing, invalid: ts.invalid },
  });
  // README
  if (f.readme === null) out.push({ key: "readme", status: "fail", message: "No hay README.md" });
  else {
    const missing = readmeMissingSections(f.readme);
    out.push({
      key: "readme",
      status: missing.length ? "warn" : "pass",
      message: missing.length ? `Faltan secciones: ${missing.join(", ")}` : "Con las secciones mínimas",
      details: { missing },
    });
  }
  // CLAUDE.md
  out.push(f.claudeMd !== null ? { key: "claude_md", status: "pass", message: "Existe" } : { key: "claude_md", status: "fail", message: "No hay CLAUDE.md" });
  // .gitignore
  if (f.gitignore === null) out.push({ key: "gitignore", status: "fail", message: "No hay .gitignore" });
  else {
    const missing = gitignoreMissing(f.gitignore);
    out.push({
      key: "gitignore",
      status: missing.length ? "warn" : "pass",
      message: missing.length ? `No cubre: ${missing.join(", ")}` : "Cubre los patrones sensibles",
      details: { missing },
    });
  }
  // secretos: solo "pass" si la CI corre gitleaks en verde; si gitleaks falla, "fail"; si no, "no verificado".
  const gitleaksInCi = f.workflows.some((w) => /gitleaks/i.test(w.content));
  const gitleaksStep = f.latestRun?.jobs
    .flatMap((j) => [{ name: j.name, conclusion: j.conclusion }, ...j.steps])
    .filter((s) => /gitleaks/i.test(s.name));
  const gitleaksFailed = gitleaksStep?.some((s) => s.conclusion === "failure");
  const gitleaksOk = gitleaksStep?.length && gitleaksStep.every((s) => s.conclusion === "success");
  if (gitleaksFailed)
    out.push({ key: "secretos", status: "fail", message: "gitleaks encontró secretos en la última ejecución de la CI", details: { gitleaksInCi } });
  else if (gitleaksInCi && gitleaksOk) out.push({ key: "secretos", status: "pass", message: "gitleaks en verde en la CI", details: { gitleaksInCi } });
  else
    out.push({
      key: "secretos",
      status: "warn",
      message: gitleaksInCi ? "No verificado: gitleaks no tiene una ejecución en verde todavía" : "No verificado: la CI no corre gitleaks",
      details: { gitleaksInCi },
    });
  // CI
  if (!f.workflows.length) out.push({ key: "ci", status: "fail", message: "No hay workflows en .github/workflows" });
  else if (!f.latestRun) out.push({ key: "ci", status: "warn", message: `Sin ejecuciones en ${f.defaultBranch}` });
  else if (f.latestRun.conclusion === "success") out.push({ key: "ci", status: "pass", message: `Última ejecución en ${f.defaultBranch} en verde` });
  else if (f.latestRun.status !== "completed") out.push({ key: "ci", status: "warn", message: "Ejecución en curso" });
  else out.push({ key: "ci", status: "fail", message: `Última ejecución en ${f.defaultBranch}: ${f.latestRun.conclusion ?? "sin resultado"}` });
  // rama protegida
  if (f.archived) out.push({ key: "rama_protegida", status: "na", message: "Repositorio archivado" });
  else if (f.branchProtection === "unavailable")
    out.push({ key: "rama_protegida", status: "na", message: "El plan de GitHub no permite proteger ramas en privados (N/A, se redistribuye el peso)" });
  else
    out.push(
      f.branchProtection === "protected"
        ? { key: "rama_protegida", status: "pass", message: `${f.defaultBranch} protegida` }
        : { key: "rama_protegida", status: "fail", message: `${f.defaultBranch} sin protección` },
    );
  // seguridad
  out.push(
    f.vulnerabilityAlerts === true
      ? { key: "seguridad", status: "pass", message: "Alertas de Dependabot activadas" }
      : f.vulnerabilityAlerts === false
        ? { key: "seguridad", status: "fail", message: "Alertas de Dependabot desactivadas" }
        : { key: "seguridad", status: "warn", message: "No se pudo verificar (permisos)" },
  );
  // coherencia de estado
  const state = stateTopic(f.topics);
  const idleDays = f.pushedAt ? Math.floor((now.getTime() - f.pushedAt.getTime()) / 86_400_000) : null;
  if (state === "activo" && (idleDays === null || idleDays > 90))
    out.push({
      key: "coherencia_estado",
      status: "warn",
      message: `Marcado activo sin push hace ${idleDays ?? "—"} días: sugiere estado-mantenimiento o archivado`,
      details: { idleDays, suggestion: "mantenimiento" },
    });
  else if (state === "archivado" && !f.archived)
    out.push({ key: "coherencia_estado", status: "warn", message: "Marcado archivado pero sin archivar en GitHub", details: { suggestion: "archive" } });
  else if (!state) out.push({ key: "coherencia_estado", status: "warn", message: "Sin topic de estado", details: { idleDays } });
  else out.push({ key: "coherencia_estado", status: "pass", message: "Estado coherente con la actividad" });
  const ci = out.find((c) => c.key === "ci");
  if (ci) ci.details = { ...ci.details, hasWorkflows: f.workflows.length > 0 };
  return out;
}

// --- Archivos estándar (§2.5) ---

export type StandardFileContext = {
  repoName: string;
  title: string;
  ownerLabel: string | null;
  agencyosUrl: string | null;
  stacks: string[]; // topics stack-*
  scope: RepoScope | null;
  description: string | null;
};

export function readmeTemplate(c: StandardFileContext): string {
  return `# ${c.title}

## Qué es
${c.description?.replace(/^\[[^\]]*\]\s*/, "") ?? "Completar: qué es, en una frase."}

## Cliente / Proyecto
${c.ownerLabel ?? "Sin cliente"}${c.agencyosUrl ? ` · [Ficha en AGENCYOS](${c.agencyosUrl})` : ""}

## Estado
Ver el topic \`estado-*\` del repositorio.

## Stack
${c.stacks.length ? c.stacks.map((s) => `- ${STACK_LABEL[s] ?? s}`).join("\n") : "- Completar"}

## Instalación / Despliegue
Completar los pasos para instalar y desplegar.

## Configuración
Variables y archivos de configuración **sin secretos** (ver \`.env.example\` o \`config.example.php\`).

## Estructura
Completar: carpetas principales y para qué sirve cada una.

## Versionado
SemVer con tags \`vX.Y.Z\` y GitHub Releases. Cambios en \`CHANGELOG.md\`.

## Mantenimiento
Ramas \`feat/…\`, \`fix/…\`, \`chore/…\` con PR a \`main\`. Conventional Commits en español.
`;
}

export function claudeMdTemplate(c: StandardFileContext): string {
  return `# ${c.repoName} — reglas para Claude

${c.description ?? ""}

## Siempre
- Sin narración: preguntas en una sola lista antes de empezar.
- Verificar antes de decir "listo" (lint, tests si existen, gitleaks).
- Trabajar en ramas \`feat/…\`, \`fix/…\`, \`chore/…\`, \`docs/…\` y abrir un PR. Nunca push directo a \`main\`.
- Conventional Commits en español.

## Nunca (sin aprobación explícita de Luciano)
- Nada irreversible: borrar, force-push, cambiar la visibilidad, desplegar a producción.
- Commitear secretos (claves, certificados, \`.env\`, \`config.php\`).

## Comandos
Completar: cómo instalar, probar y desplegar.

## Qué no tocar
Completar.
`;
}

export function gitignoreTemplate(stacks: string[], existing?: string | null): string {
  const base = [".env*", "!.env.example", "config.php", "*.key", "*.pem", "*.crt", "*.p12", "/vendor", "/node_modules", "*.zip", ".DS_Store"];
  if (stacks.includes("python")) base.push("__pycache__/", "*.pyc", ".venv/");
  if (stacks.includes("nextjs") || stacks.includes("typescript")) base.push(".next/", "dist/", "coverage/");
  if (existing !== undefined && existing !== null) {
    const missing = gitignoreMissing(existing);
    const add = base.filter((l) => missing.some((m) => l === m) || (l === "!.env.example" && missing.includes(".env*")));
    return `${existing.replace(/\s*$/, "")}\n\n# Patrones sensibles (estándar AGENCYOS)\n${add.join("\n")}\n`;
  }
  return `# Estándar AGENCYOS\n${base.join("\n")}\n`;
}

export function ciTemplate(stacks: string[], gitleaksOnly = false): string {
  const lint = stacks.includes("php")
    ? `  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: php -l
        run: find . -name '*.php' -not -path './vendor/*' -print0 | xargs -0 -r -n1 php -l
`
    : stacks.includes("python")
      ? `  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: compileall
        run: python3 -m compileall -q .
`
      : stacks.includes("typescript") || stacks.includes("nextjs")
        ? `  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm test --if-present
`
        : "";
  return `name: ${gitleaksOnly ? "gitleaks" : "CI"}
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  gitleaks:
    name: gitleaks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: gitleaks
        run: docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.24.2 detect --source=/repo --redact -v
${gitleaksOnly ? "" : lint}`;
}

export const PR_TEMPLATE = `## Qué cambia

## Cómo se probó

## Riesgos
`;

export function appendReadmeSections(existing: string, missing: string[]): string {
  return `${existing.replace(/\s*$/, "")}\n\n${missing.map((m) => `## ${m}\nCompletar.\n`).join("\n")}`;
}
