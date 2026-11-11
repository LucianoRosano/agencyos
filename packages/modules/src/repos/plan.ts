import {
  type CheckKey,
  type CheckStatus,
  ciTemplate,
  claudeMdTemplate,
  gitignoreTemplate,
  nameFollowsConvention,
  PR_TEMPLATE,
  proposeDescription,
  proposeTopics,
  type RepoScope,
  readmeTemplate,
  type StandardFileContext,
  suggestRepoName,
} from "./standard";

/**
 * Plan determinístico (MVP, docs/15 §6): aplica la convención a partir de los checks.
 * Nunca propone borrar, cambiar la visibilidad ni force-push (esas acciones no existen).
 */

export const ACTION_KINDS = ["create_repo", "rename", "set_topics", "set_description", "add_file", "enable_security", "protect_branch", "archive"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export type Risk = "low" | "medium" | "high";

/** Orden de ejecución (docs/15 §4.4): plantillas/creación → renombres, topics y descripciones → archivos vía PR → seguridad → protección → archivado. */
export const ACTION_ORDER: Record<ActionKind, number> = {
  create_repo: 0,
  rename: 1,
  set_topics: 2,
  set_description: 3,
  add_file: 4,
  enable_security: 5,
  protect_branch: 6,
  archive: 7,
};

export const ACTION_LABEL: Record<ActionKind, string> = {
  create_repo: "Crear repositorio",
  rename: "Renombrar",
  set_topics: "Topics",
  set_description: "Descripción",
  add_file: "Agregar archivo (PR)",
  enable_security: "Activar seguridad",
  protect_branch: "Proteger rama",
  archive: "Archivar",
};

export type PlannedAction = {
  repositoryId: string | null;
  kind: ActionKind;
  risk: Risk;
  params: { summary: string; diff: string[] } & Record<string, unknown>;
};

export type PlanRepoInput = {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  topics: string[];
  language: string | null;
  archived: boolean;
  pushedAt: Date | null;
  defaultBranch: string;
  scope: RepoScope | null;
  checks: Partial<Record<CheckKey, { status: CheckStatus; details?: Record<string, unknown> }>>;
  owner: { slug: string | null; label: string | null };
  agencyosUrl: string | null;
};

const preview = (content: string, max = 14) => {
  const lines = content.split("\n");
  return [...lines.slice(0, max).map((l) => `+ ${l}`), ...(lines.length > max ? [`+ … (${lines.length - max} líneas más)`] : [])];
};

export function planActionsFor(r: PlanRepoInput, now = new Date()): PlannedAction[] {
  const out: PlannedAction[] = [];
  const st = (k: CheckKey) => r.checks[k]?.status;
  const det = (k: CheckKey) => r.checks[k]?.details ?? {};
  const add = (kind: ActionKind, risk: Risk, params: PlannedAction["params"]) => out.push({ repositoryId: r.id, kind, risk, params });

  if (r.archived) return out; // un repositorio archivado es de solo lectura: no se propone nada

  // 1. Nombre
  let name = r.name;
  if (!nameFollowsConvention(r.name)) {
    const to = suggestRepoName(r.name, r.scope, r.owner.slug);
    if (to && to !== r.name) {
      name = to;
      add("rename", "medium", {
        from: r.name,
        to,
        summary: `Renombrar a ${to} (GitHub mantiene la redirección; actualizar los remotos locales)`,
        diff: [`- ${r.name}`, `+ ${to}`],
      });
    }
  }
  // 2. Topics
  const topics = proposeTopics({ topics: r.topics, scope: r.scope, clientSlug: r.owner.slug, language: r.language, pushedAt: r.pushedAt, now });
  const topicsChanged = [...topics].sort().join(",") !== [...r.topics].sort().join(",");
  if ((st("topics") !== "pass" || st("coherencia_estado") === "warn") && topicsChanged) {
    const missing = (det("topics").missing as string[] | undefined)?.filter((m) => !topics.some((t) => t.startsWith(`${m}-`))) ?? [];
    add("set_topics", "low", {
      from: r.topics,
      to: topics,
      summary: `Topics según el vocabulario${missing.length ? ` (queda por definir a mano: ${missing.join(", ")})` : ""}`,
      diff: [`- ${r.topics.join(", ") || "(sin topics)"}`, `+ ${topics.join(", ")}`],
    });
  }
  // 3. Descripción
  if (st("descripcion") && st("descripcion") !== "pass") {
    const to = proposeDescription({ description: r.description, owner: r.owner.label, name, topics, language: r.language });
    add("set_description", "low", {
      from: r.description,
      to,
      summary: "Descripción con el formato [Cliente] Qué es — stack",
      diff: [`- ${r.description ?? "(vacía)"}`, `+ ${to}`],
    });
  }
  // 4. Archivos estándar (todos en un solo PR por repositorio al ejecutar)
  const fctx: StandardFileContext = {
    repoName: name,
    title: name,
    ownerLabel: r.owner.label,
    agencyosUrl: r.agencyosUrl,
    stacks: topics.filter((t) => t.startsWith("stack-")).map((t) => t.slice(6)),
    scope: r.scope,
    description: r.description,
  };
  if (st("readme") === "fail") {
    const content = readmeTemplate(fctx);
    add("add_file", "low", { path: "README.md", mode: "create", content, summary: "README.md con las secciones mínimas (vía PR)", diff: preview(content) });
  } else if (st("readme") === "warn") {
    const missing = (det("readme").missing as string[] | undefined) ?? [];
    if (missing.length)
      add("add_file", "low", {
        path: "README.md",
        mode: "complete",
        sections: missing,
        summary: `Completar el README con: ${missing.join(", ")} (vía PR)`,
        diff: missing.map((m) => `+ ## ${m}`),
      });
  }
  if (st("claude_md") === "fail") {
    const content = claudeMdTemplate(fctx);
    add("add_file", "low", { path: "CLAUDE.md", mode: "create", content, summary: "CLAUDE.md con las reglas para Claude (vía PR)", diff: preview(content) });
  }
  if (st("gitignore") === "fail") {
    const content = gitignoreTemplate(fctx.stacks);
    add("add_file", "low", { path: ".gitignore", mode: "create", content, summary: ".gitignore con los patrones sensibles (vía PR)", diff: preview(content) });
  } else if (st("gitignore") === "warn") {
    const missing = (det("gitignore").missing as string[] | undefined) ?? [];
    if (missing.length)
      add("add_file", "low", {
        path: ".gitignore",
        mode: "complete",
        patterns: missing,
        summary: `Agregar al .gitignore: ${missing.join(", ")} (vía PR)`,
        diff: missing.map((m) => `+ ${m}`),
      });
  }
  const gitleaksInCi = Boolean(det("secretos").gitleaksInCi);
  if (st("ci") === "fail" && !det("ci").hasWorkflows) {
    const content = ciTemplate(fctx.stacks);
    add("add_file", "low", { path: ".github/workflows/ci.yml", mode: "create", content, summary: "CI estándar con gitleaks (vía PR)", diff: preview(content) });
    add("add_file", "low", {
      path: ".github/pull_request_template.md",
      mode: "create",
      content: PR_TEMPLATE,
      summary: "Plantilla de PR (qué cambia · cómo se probó · riesgos)",
      diff: preview(PR_TEMPLATE),
    });
  } else if (!gitleaksInCi && st("secretos") !== "fail") {
    const content = ciTemplate(fctx.stacks, true);
    add("add_file", "low", {
      path: ".github/workflows/gitleaks.yml",
      mode: "create",
      content,
      summary: "Workflow de gitleaks (vía PR)",
      diff: preview(content),
    });
  }
  // 5. Seguridad
  if (st("seguridad") === "fail")
    add("enable_security", "low", {
      summary: "Activar alertas de Dependabot y correcciones automáticas",
      diff: ["+ vulnerability-alerts", "+ automated-security-fixes"],
    });
  // 6. Protección de main (prod-* y cli-* activos)
  const active = topics.includes("estado-activo");
  if (st("rama_protegida") === "fail" && (r.scope === "prod" || r.scope === "cli") && active) {
    const requiredChecks = gitleaksInCi && st("secretos") === "pass" ? ["gitleaks"] : [];
    add("protect_branch", "medium", {
      branch: r.defaultBranch,
      requiredChecks,
      summary: `Proteger ${r.defaultBranch}: PR obligatorio${requiredChecks.length ? ", CI en verde" : ""}, sin force-push ni borrado`,
      diff: [
        `+ ${r.defaultBranch}: PR obligatorio`,
        ...(requiredChecks.length ? [`+ checks: ${requiredChecks.join(", ")}`] : []),
        "+ sin force-push",
        "+ sin borrado",
      ],
    });
  }
  // 7. Archivado (solo si el topic ya dice archivado)
  if (det("coherencia_estado").suggestion === "archive")
    add("archive", "medium", { summary: "Archivar (queda de solo lectura; reversible desde GitHub). Nunca se borra.", diff: ["+ archived: true"] });
  return out;
}

/** Acción de creación de repositorio desde un proyecto (docs/15 §6). */
export function createRepoAction(p: {
  installationId: number;
  owner: string;
  templateFullName: string;
  name: string;
  description: string;
  topics: string[];
  projectId: string;
  clientId: string | null;
  files: { path: string; content: string }[];
}): PlannedAction {
  return {
    repositoryId: null,
    kind: "create_repo",
    risk: "low",
    params: {
      ...p,
      summary: `Crear ${p.owner}/${p.name} (privado) desde ${p.templateFullName}, con topics, descripción y archivos estándar (vía PR), vinculado al proyecto`,
      diff: [`+ ${p.owner}/${p.name} (privado)`, `+ ${p.description}`, `+ topics: ${p.topics.join(", ")}`, ...p.files.map((f) => `+ ${f.path} (PR)`)],
    },
  };
}
