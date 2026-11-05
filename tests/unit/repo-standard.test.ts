import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { createAppJwt, fakeModeEnabled, signWebhook, verifyWebhookSignature } from "@agencyos/modules/repos/github";
import { planActionsFor } from "@agencyos/modules/repos/plan";
import {
  buildRepoName,
  type CheckResult,
  clientSlug,
  descriptionStatus,
  evaluateRepo,
  gitignoreMissing,
  healthBand,
  healthScore,
  inferLinks,
  nameFollowsConvention,
  proposeTopics,
  type RepoFacts,
  readmeMissingSections,
  slugPart,
  suggestRepoName,
  topicsStatus,
} from "@agencyos/modules/repos/standard";
import { describe, expect, it } from "vitest";

const FULL_README = ["Qué es", "Cliente", "Estado", "Stack", "Instalación", "Configuración", "Estructura", "Versionado", "Mantenimiento"]
  .map((h) => `## ${h}\ntexto`)
  .join("\n");

const goodFacts = (over: Partial<RepoFacts> = {}): RepoFacts => ({
  name: "prod-libreriaos-fiscal",
  description: "[LibreríaOS] Facturación en ARCA — WordPress/PHP",
  topics: ["alcance-prod", "tipo-wp-plugin", "stack-php", "estado-activo"],
  archived: false,
  defaultBranch: "main",
  pushedAt: new Date(),
  scope: "prod",
  readme: FULL_README,
  claudeMd: "# reglas",
  gitignore: ".env*\n*.key\n*.pem\n*.crt\n*.p12\n",
  workflows: [{ path: ".github/workflows/ci.yml", content: "gitleaks" }],
  latestRun: { conclusion: "success", status: "completed", jobs: [{ name: "gitleaks", conclusion: "success", steps: [] }] },
  branchProtection: "protected",
  vulnerabilityAlerts: true,
  ...over,
});

const score = (checks: CheckResult[]) => healthScore(checks);

describe("convención de nombres (docs/15 §2.2)", () => {
  it("normaliza tildes y ñ, kebab-case y minúsculas", () => {
    expect(slugPart("Librería Uno")).toBe("libreria-uno");
    expect(slugPart("Diseño Ñandú  Panel")).toBe("diseno-nandu-panel");
    expect(buildRepoName({ scope: "cli", owner: "Librería Uno", tech: "WP", name: "Tienda" })).toBe("cli-libreriauno-wp-tienda");
    expect(buildRepoName({ scope: "prod", name: "AGENCYOS" })).toBe("prod-agencyos");
    expect(buildRepoName({ scope: "int", name: "Señal — motor PDF" })).toBe("int-senal-motor-pdf");
  });

  it("máximo 50 caracteres, sin guión final", () => {
    const n = buildRepoName({ scope: "cli", owner: "sofia", name: "un nombre larguísimo que excede holgadamente el máximo permitido" });
    expect(n.length).toBeLessThanOrEqual(50);
    expect(n.endsWith("-")).toBe(false);
    expect(nameFollowsConvention(n)).toBe(true);
  });

  it("valida la convención", () => {
    expect(nameFollowsConvention("cli-sofia-wp-sitio")).toBe(true);
    expect(nameFollowsConvention("prod-agencyos")).toBe(true);
    expect(nameFollowsConvention("Panel_Sofia")).toBe(false);
    expect(nameFollowsConvention("cli-sofía")).toBe(false);
    expect(nameFollowsConvention("misc-algo")).toBe(false);
    expect(nameFollowsConvention("prod")).toBe(false);
  });

  it("sugiere un nombre solo si conoce el alcance, sin duplicar el cliente", () => {
    expect(suggestRepoName("Panel_Sofia", "cli", "sofia")).toBe("cli-sofia-panel");
    expect(suggestRepoName("facturador_arca", null)).toBeNull();
    expect(suggestRepoName("LibreriaOS-Panel", "prod", "libreriaos-panel")).toBe("prod-libreriaos-panel");
  });

  it("slug de cliente: compacto si es corto, primera palabra si es largo", () => {
    expect(clientSlug({ name: "Librería Uno" })).toBe("libreriauno");
    expect(clientSlug({ name: "Sofía Casa Editorial" })).toBe("sofia");
  });
});

describe("topics (§2.3)", () => {
  it("detecta faltantes y fuera de vocabulario; cliente obligatorio en cli", () => {
    expect(topicsStatus(["alcance-prod", "tipo-wp-plugin", "stack-php", "estado-activo"], "prod").missing).toEqual([]);
    const cli = topicsStatus(["alcance-cli", "tipo-wp-sitio", "stack-wordpress", "estado-activo"], "cli");
    expect(cli.missing).toEqual(["cliente"]);
    expect(topicsStatus(["alcance-foo", "stack-java"], null).invalid).toEqual(["alcance-foo", "stack-java"]);
  });

  it("propone topics sin adivinar el tipo y degrada activo sin push a mantenimiento", () => {
    const t = proposeTopics({ topics: ["estado-activo"], scope: "cli", clientSlug: "sofia", language: "PHP", pushedAt: new Date(Date.now() - 200 * 86_400_000) });
    expect(t).toEqual(["alcance-cli", "cliente-sofia", "stack-php", "estado-mantenimiento"]);
  });
});

describe("README, descripción y .gitignore", () => {
  it("secciones mínimas del README (con o sin tildes)", () => {
    expect(readmeMissingSections(FULL_README)).toEqual([]);
    expect(readmeMissingSections("# X\n## Que es\n## Instalacion\n")).toContain("Versionado");
  });
  it("formato de descripción", () => {
    expect(descriptionStatus("[Librería Uno] Facturación automática en ARCA — WordPress/PHP")).toBe("pass");
    expect(descriptionStatus("Panel de pedidos")).toBe("warn");
    expect(descriptionStatus("")).toBe("fail");
  });
  it(".gitignore cubre patrones sensibles", () => {
    expect(gitignoreMissing(".env\n*.key\n*.pem\n*.crt\n*.p12")).toEqual([]);
    expect(gitignoreMissing("/vendor")).toEqual([".env*", "*.key", "*.pem", "*.crt", "*.p12"]);
  });
});

describe("puntaje de salud (§5)", () => {
  it("repositorio perfecto = 100 (verde)", () => {
    const s = score(evaluateRepo(goodFacts()));
    expect(s).toBe(100);
    expect(healthBand(s)).toBe("green");
  });

  it("pesos exactos: sin CLAUDE.md resta 10; README incompleto resta 7,5", () => {
    expect(score(evaluateRepo(goodFacts({ claudeMd: null })))).toBe(90);
    expect(score(evaluateRepo(goodFacts({ readme: "## Qué es" })))).toBe(93); // 100 - 7.5 → 92.5 → 93
  });

  it("secretos: si gitleaks falla el máximo es 40 (rojo)", () => {
    const checks = evaluateRepo(
      goodFacts({ latestRun: { conclusion: "failure", status: "completed", jobs: [{ name: "gitleaks", conclusion: "failure", steps: [] }] } }),
    );
    expect(checks.find((c) => c.key === "secretos")?.status).toBe("fail");
    expect(score(checks)).toBe(40);
    expect(healthBand(40)).toBe("red");
  });

  it("secretos: «no verificado» (warn) si la CI no corre gitleaks en verde", () => {
    const checks = evaluateRepo(goodFacts({ workflows: [{ path: "x.yml", content: "lint" }] }));
    const s = checks.find((c) => c.key === "secretos");
    expect(s?.status).toBe("warn");
    expect(s?.message).toMatch(/No verificado/);
    expect(score(checks)).toBe(90);
  });

  it("N/A redistribuye el peso (rama protegida sin plan Pro)", () => {
    const checks = evaluateRepo(goodFacts({ branchProtection: "unavailable", claudeMd: null }));
    expect(checks.find((c) => c.key === "rama_protegida")?.status).toBe("na");
    // 85 de 95 aplicables = 89,47 → 89
    expect(score(checks)).toBe(89);
  });

  it("coherencia: activo sin push en 90 días sugiere mantenimiento", () => {
    const c = evaluateRepo(goodFacts({ pushedAt: new Date(Date.now() - 120 * 86_400_000) })).find((x) => x.key === "coherencia_estado");
    expect(c?.status).toBe("warn");
  });
});

describe("plan determinístico", () => {
  it("propone renombre, topics, descripción, archivos vía PR, seguridad; nunca borrar ni visibilidad", () => {
    const facts = goodFacts({
      name: "Panel_Sofia",
      description: "Panel de pedidos",
      topics: ["alcance-cli", "cliente-sofia"],
      scope: "cli",
      readme: null,
      claudeMd: null,
      gitignore: "/vendor",
      workflows: [],
      latestRun: null,
      branchProtection: "unprotected",
      vulnerabilityAlerts: false,
      ownerLabel: "sofia",
    });
    const checks = evaluateRepo(facts);
    const actions = planActionsFor({
      id: "r1",
      name: facts.name,
      fullName: `x/${facts.name}`,
      description: facts.description,
      topics: facts.topics,
      language: "PHP",
      archived: false,
      pushedAt: new Date(),
      defaultBranch: "main",
      scope: "cli",
      checks: Object.fromEntries(checks.map((c) => [c.key, { status: c.status, details: c.details }])),
      owner: { slug: "sofia", label: "Sofía" },
      agencyosUrl: null,
    });
    const kinds = actions.map((a) => a.kind);
    expect(kinds).toContain("rename");
    expect(actions.find((a) => a.kind === "rename")?.params.to).toBe("cli-sofia-panel");
    expect(kinds).toContain("set_topics");
    expect(kinds).toContain("set_description");
    expect(actions.filter((a) => a.kind === "add_file").map((a) => a.params.path)).toEqual(
      expect.arrayContaining(["README.md", "CLAUDE.md", ".gitignore", ".github/workflows/ci.yml"]),
    );
    expect(kinds).toContain("enable_security");
    expect(kinds).toContain("protect_branch");
    expect(kinds.some((k) => /delete|visibility|transfer/.test(k))).toBe(false);
    for (const a of actions) expect(a.params.diff.length).toBeGreaterThan(0);
  });
});

describe("inferencia de vínculos", () => {
  it("topic cliente-* es seguro; coincidencia por nombre es sugerencia", () => {
    const clients = [
      { id: "c1", name: "Sofía Casa Editorial" },
      { id: "c2", name: "Librería Uno" },
    ];
    expect(inferLinks({ name: "x", topics: ["cliente-sofia"] }, { clients, projects: [], products: [] }).client).toEqual({ id: "c1", sure: true });
    expect(inferLinks({ name: "cli-libreriauno-wp-tienda", topics: [] }, { clients, projects: [], products: [] }).client).toEqual({ id: "c2", sure: false });
    expect(inferLinks({ name: "cli-libreriauno-wp-tienda", topics: [] }, { clients, projects: [], products: [] }).scope).toBe("cli");
  });
});

describe("seguridad: HMAC de webhooks y JWT RS256", () => {
  it("verifica X-Hub-Signature-256 y rechaza firmas alteradas o mal formadas", () => {
    const body = JSON.stringify({ hola: "mundo" });
    const sig = signWebhook("secreto", body);
    expect(verifyWebhookSignature("secreto", body, sig)).toBe(true);
    expect(verifyWebhookSignature("otro", body, sig)).toBe(false);
    expect(verifyWebhookSignature("secreto", `${body} `, sig)).toBe(false);
    expect(verifyWebhookSignature("secreto", body, sig.replace("sha256=", "sha1="))).toBe(false);
    expect(verifyWebhookSignature("secreto", body, "sha256=zz")).toBe(false);
    expect(verifyWebhookSignature("secreto", body, null)).toBe(false);
  });

  it("firma un JWT RS256 válido para la App (iat −60 s, exp ≤ 10 min)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const now = 1_800_000_000;
    const jwt = createAppJwt("123456", pem, now);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload).toEqual({ iat: now - 60, exp: now + 540, iss: "123456" });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
    expect(verify("sha256", Buffer.from(`${h}.${p}`), createPublicKey(publicKey.export({ type: "spki", format: "pem" })), Buffer.from(s, "base64url"))).toBe(
      true,
    );
  });
});

describe("modo simulado", () => {
  it("solo con GITHUB_FAKE=1 y nunca en producción con dominio real", () => {
    expect(fakeModeEnabled({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
    expect(fakeModeEnabled({ GITHUB_FAKE: "1", NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(true);
    expect(fakeModeEnabled({ GITHUB_FAKE: "1", NODE_ENV: "production", APP_URL: "https://agencyos.com.ar" } as NodeJS.ProcessEnv)).toBe(false);
    expect(fakeModeEnabled({ GITHUB_FAKE: "1", NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(fakeModeEnabled({ GITHUB_FAKE: "1", NODE_ENV: "production", APP_URL: "http://localhost:3305" } as NodeJS.ProcessEnv)).toBe(true);
  });
});
