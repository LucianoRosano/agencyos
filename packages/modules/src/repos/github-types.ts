/** Tipos del cliente de GitHub (separados para que el fake no dependa de la implementación real). */

export type GhRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  topics: string[];
  archived: boolean;
  pushedAt: string | null;
  language: string | null;
  isTemplate: boolean;
};

export type GhRun = {
  conclusion: string | null;
  status: string;
  jobs: { name: string; conclusion: string | null; steps: { name: string; conclusion: string | null }[] }[];
};

export type GhInstallation = { id: number; account: { login: string; type: string }; permissions: Record<string, string> };

export type FileChange = { path: string; content: string };

export interface InstallationApi {
  listRepos(): Promise<GhRepo[]>;
  getRepo(fullName: string): Promise<GhRepo | null>;
  getFile(fullName: string, path: string, ref?: string): Promise<string | null>;
  listDir(fullName: string, path: string, ref?: string): Promise<string[]>;
  latestRun(fullName: string, branch: string): Promise<GhRun | null>;
  branchProtection(fullName: string, branch: string): Promise<"protected" | "unprotected" | "unavailable">;
  vulnerabilityAlerts(fullName: string): Promise<boolean | null>;
  /** Solo nombre, descripción o archivar. Nunca visibilidad. */
  updateRepo(fullName: string, patch: { name?: string; description?: string; archived?: true }): Promise<GhRepo>;
  replaceTopics(fullName: string, topics: string[]): Promise<string[]>;
  enableSecurity(fullName: string): Promise<void>;
  protectBranch(fullName: string, branch: string, requiredChecks: string[]): Promise<void>;
  /** Crea una rama nueva desde `base`, sube los archivos ahí y abre un PR. Nunca escribe en `base`. */
  openFilesPr(fullName: string, p: { base: string; branch: string; title: string; body: string; files: FileChange[] }): Promise<{ number: number; url: string }>;
  /** Crea un repositorio PRIVADO desde una plantilla tpl-*. */
  createFromTemplate(p: { templateFullName: string; owner: string; name: string; description: string }): Promise<GhRepo>;
}

export interface GitHubClient {
  readonly mode: "real" | "fake";
  getInstallation(installationId: number): Promise<GhInstallation>;
  installation(installationId: number): InstallationApi;
}

export class GitHubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export type AppConfig = { appId: string; privateKey: string; webhookSecret: string; slug: string | null };
