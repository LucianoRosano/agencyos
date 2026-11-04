export type Role = "owner" | "admin" | "member" | "client";
export type ActorType = "user" | "agent" | "system";

export type Ctx = {
  workspaceId: string;
  userId: string | null;
  role: Role;
  actor: { type: ActorType; id: string | null; name: string };
  /** Alcances de un token de máquina (MCP). Ausente para sesiones humanas. */
  scopes?: string[];
  ip?: string | null;
  userAgent?: string | null;
};

export function systemCtx(workspaceId: string): Ctx {
  return { workspaceId, userId: null, role: "owner", actor: { type: "system", id: null, name: "Sistema" } };
}
