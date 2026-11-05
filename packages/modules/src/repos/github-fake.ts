import type { FileChange, GhInstallation, GhRepo, GhRun, GitHubClient, InstallationApi } from "./github-types";
import { GitHubError } from "./github-types";

/**
 * GitHub SIMULADO en memoria, con fixtures. Solo para tests (unitarios, integración y e2e con GITHUB_FAKE=1
 * fuera de producción). Reproduce la semántica relevante de la API: renombres, topics, PRs en ramas nuevas,
 * protección de rama según el plan, plantillas. Registra cada llamada en `calls` para poder auditarlas.
 */

export const FAKE_INSTALLATION_ID = 4242;
export const FAKE_ACCOUNT = "luciano-demo";

type FakeRepo = GhRepo & {
  files: Map<string, string>;
  run: GhRun | null;
  protection: "protected" | "unprotected" | "unavailable";
  alerts: boolean;
  pulls: { number: number; branch: string; title: string; files: FileChange[]; url: string }[];
  branches: Set<string>;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const FULL_README = `# LibreríaOS Fiscal

## Qué es
Facturación automática en ARCA para pedidos WooCommerce.

## Cliente / Proyecto
Producto propio (Librería Uno, Sofía).

## Estado
Activo.

## Stack
WordPress / PHP.

## Instalación
Subir el ZIP del release.

## Configuración
Ver config.example.php.

## Estructura
src/, includes/.

## Versionado
SemVer.

## Mantenimiento
PR a main.
`;

const GOOD_GITIGNORE = ".env*\n!.env.example\nconfig.php\n*.key\n*.pem\n*.crt\n*.p12\n/vendor\n";
const CI_WITH_GITLEAKS = "name: CI\non: [push]\njobs:\n  gitleaks:\n    steps:\n      - name: gitleaks\n";
const greenRun = (): GhRun => ({
  conclusion: "success",
  status: "completed",
  jobs: [
    { name: "gitleaks", conclusion: "success", steps: [{ name: "gitleaks", conclusion: "success" }] },
    { name: "lint", conclusion: "success", steps: [] },
  ],
});

function fixtures(): FakeRepo[] {
  const base = (id: number, name: string, extra: Partial<FakeRepo>): FakeRepo => ({
    id,
    name,
    fullName: `${FAKE_ACCOUNT}/${name}`,
    owner: FAKE_ACCOUNT,
    description: null,
    private: true,
    defaultBranch: "main",
    topics: [],
    archived: false,
    pushedAt: daysAgo(3),
    language: null,
    isTemplate: false,
    files: new Map(),
    run: null,
    protection: "unprotected",
    alerts: false,
    pulls: [],
    branches: new Set(["main"]),
    ...extra,
  });
  return [
    base(9001, "prod-libreriaos-fiscal", {
      description: "[LibreríaOS] Facturación automática en ARCA para pedidos WooCommerce — WordPress/PHP",
      topics: ["alcance-prod", "tipo-wp-plugin", "stack-wordpress", "stack-php", "estado-activo"],
      language: "PHP",
      pushedAt: daysAgo(2),
      files: new Map([
        ["README.md", FULL_README],
        ["CLAUDE.md", "# Reglas"],
        [".gitignore", GOOD_GITIGNORE],
        [".github/workflows/ci.yml", CI_WITH_GITLEAKS],
      ]),
      run: greenRun(),
      protection: "protected",
      alerts: true,
    }),
    base(9002, "Panel_Sofia", {
      description: "Panel de pedidos de WooCommerce",
      topics: ["alcance-cli", "cliente-sofia"],
      language: "PHP",
      pushedAt: daysAgo(10),
      files: new Map([
        ["README.md", "# Panel\n\n## Qué es\nPanel de pedidos.\n"],
        [".gitignore", "/vendor\n"],
      ]),
    }),
    base(9003, "facturador_arca", {
      description: null,
      topics: [],
      language: "Python",
      pushedAt: daysAgo(400),
      files: new Map([["README.md", "# Facturador\n"]]),
    }),
    base(9004, "tpl-wp-plugin", {
      description: "[Plantilla] Base para plugins de WordPress — WordPress/PHP",
      topics: ["alcance-tpl", "tipo-plantilla", "stack-wordpress", "stack-php", "estado-activo"],
      language: "PHP",
      isTemplate: true,
      pushedAt: daysAgo(20),
      files: new Map([
        ["README.md", FULL_README.replace("LibreríaOS Fiscal", "Plantilla WP")],
        ["CLAUDE.md", "# Reglas"],
        [".gitignore", GOOD_GITIGNORE],
        [".github/workflows/ci.yml", CI_WITH_GITLEAKS],
      ]),
      run: greenRun(),
      protection: "unavailable",
      alerts: true,
    }),
    base(9005, "edu-ungs-sistemas", {
      description: "[Facultad] Material de la carrera de Sistemas — Python",
      topics: ["alcance-edu", "tipo-docs", "stack-python", "estado-activo"],
      language: "Python",
      pushedAt: daysAgo(5),
      files: new Map([
        ["README.md", FULL_README.replace("LibreríaOS Fiscal", "UNGS")],
        ["CLAUDE.md", "# Reglas"],
        [".gitignore", GOOD_GITIGNORE],
        [".github/workflows/ci.yml", CI_WITH_GITLEAKS],
      ]),
      run: {
        conclusion: "failure",
        status: "completed",
        jobs: [{ name: "gitleaks", conclusion: "failure", steps: [{ name: "gitleaks", conclusion: "failure" }] }],
      },
      protection: "unprotected",
      alerts: true,
    }),
  ];
}

const pub = (r: FakeRepo): GhRepo => ({
  id: r.id,
  name: r.name,
  fullName: r.fullName,
  owner: r.owner,
  description: r.description,
  private: r.private,
  defaultBranch: r.defaultBranch,
  topics: [...r.topics],
  archived: r.archived,
  pushedAt: r.pushedAt,
  language: r.language,
  isTemplate: r.isTemplate,
});

export class FakeGitHub implements GitHubClient {
  readonly mode = "fake" as const;
  repos = new Map<string, FakeRepo>();
  calls: { method: string; fullName?: string; args?: unknown }[] = [];
  private nextId = 9100;
  private nextPr = 1;

  constructor(opts: { empty?: boolean } = {}) {
    if (!opts.empty) for (const r of fixtures()) this.repos.set(r.fullName.toLowerCase(), r);
  }

  private get(fullName: string): FakeRepo {
    const r = this.repos.get(fullName.toLowerCase());
    if (!r) throw new GitHubError(404, `GitHub: ${fullName} no existe`);
    return r;
  }

  async getInstallation(installationId: number): Promise<GhInstallation> {
    if (installationId !== FAKE_INSTALLATION_ID) throw new GitHubError(404, "GitHub: instalación inexistente");
    return { id: installationId, account: { login: FAKE_ACCOUNT, type: "User" }, permissions: { metadata: "read", contents: "write", administration: "write" } };
  }

  installation(installationId: number): InstallationApi {
    if (installationId !== FAKE_INSTALLATION_ID) throw new GitHubError(404, "GitHub: instalación inexistente");
    const log = (method: string, fullName?: string, args?: unknown) => this.calls.push({ method, fullName, args });
    return {
      listRepos: async () => {
        log("listRepos");
        return [...this.repos.values()].map(pub);
      },
      getRepo: async (fullName) => {
        const r = this.repos.get(fullName.toLowerCase());
        return r ? pub(r) : null;
      },
      getFile: async (fullName, path) => this.get(fullName).files.get(path) ?? null,
      listDir: async (fullName, path) => [...this.get(fullName).files.keys()].filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes("/")),
      latestRun: async (fullName) => this.get(fullName).run,
      branchProtection: async (fullName) => this.get(fullName).protection,
      vulnerabilityAlerts: async (fullName) => this.get(fullName).alerts,
      updateRepo: async (fullName, patch) => {
        log("updateRepo", fullName, patch);
        const r = this.get(fullName);
        if (patch.name !== undefined && patch.name !== r.name) {
          if (this.repos.has(`${r.owner}/${patch.name}`.toLowerCase())) throw new GitHubError(422, "GitHub: ya existe un repositorio con ese nombre");
          this.repos.delete(r.fullName.toLowerCase());
          r.name = patch.name;
          r.fullName = `${r.owner}/${patch.name}`;
          this.repos.set(r.fullName.toLowerCase(), r);
        }
        if (patch.description !== undefined) r.description = patch.description;
        if (patch.archived) r.archived = true;
        return pub(r);
      },
      replaceTopics: async (fullName, topics) => {
        log("replaceTopics", fullName, topics);
        const r = this.get(fullName);
        if (r.archived) throw new GitHubError(403, "GitHub: el repositorio está archivado (solo lectura)");
        r.topics = [...topics];
        return r.topics;
      },
      enableSecurity: async (fullName) => {
        log("enableSecurity", fullName);
        this.get(fullName).alerts = true;
      },
      protectBranch: async (fullName, branch, requiredChecks) => {
        log("protectBranch", fullName, { branch, requiredChecks });
        const r = this.get(fullName);
        if (r.protection === "unavailable") throw new GitHubError(403, "GitHub: Upgrade to GitHub Pro or make this repository public to enable this feature.");
        r.protection = "protected";
      },
      openFilesPr: async (fullName, p) => {
        log("openFilesPr", fullName, { base: p.base, branch: p.branch, files: p.files.map((f) => f.path) });
        const r = this.get(fullName);
        if (r.archived) throw new GitHubError(403, "GitHub: el repositorio está archivado (solo lectura)");
        if (p.branch === r.defaultBranch) throw new GitHubError(422, "GitHub: no se escribe en la rama por defecto");
        let branch = p.branch;
        for (let i = 2; r.branches.has(branch); i++) branch = `${p.branch}-${i}`;
        r.branches.add(branch);
        const number = this.nextPr++;
        const url = `https://github.com/${r.fullName}/pull/${number}`;
        r.pulls.push({ number, branch, title: p.title, files: p.files, url });
        return { number, url };
      },
      createFromTemplate: async (p) => {
        log("createFromTemplate", p.templateFullName, p);
        const tpl = this.get(p.templateFullName);
        if (!tpl.isTemplate) throw new GitHubError(422, "GitHub: el repositorio no es una plantilla");
        if (this.repos.has(`${p.owner}/${p.name}`.toLowerCase())) throw new GitHubError(422, "GitHub: ya existe un repositorio con ese nombre");
        const r: FakeRepo = {
          ...pub(tpl),
          id: this.nextId++,
          name: p.name,
          fullName: `${p.owner}/${p.name}`,
          owner: p.owner,
          description: p.description,
          private: true,
          topics: [],
          isTemplate: false,
          pushedAt: new Date().toISOString(),
          files: new Map(tpl.files),
          run: null,
          protection: "unprotected",
          alerts: false,
          pulls: [],
          branches: new Set(["main"]),
        };
        this.repos.set(r.fullName.toLowerCase(), r);
        return pub(r);
      },
    };
  }
}
