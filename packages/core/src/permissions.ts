import type { Ctx } from "./context";
import { forbidden } from "./errors";

export type Resource =
  | "workspace"
  | "space"
  | "inbox"
  | "project"
  | "task"
  | "crm"
  | "fiscal"
  | "quote"
  | "service"
  | "finance"
  | "note"
  | "study"
  | "settings"
  | "audit"
  | "mcp_token"
  | "approval"
  | "tag"
  | "link"
  | "comment"
  | "reminder"
  | "export";
export type Action = "read" | "create" | "update" | "delete" | "manage";

/** Mapa de alcances MCP → permisos (docs/14 §3). */
const SCOPE_GRANTS: Record<string, [Resource, Action[]][]> = {
  "read:all": [
    ["space", ["read"]],
    ["inbox", ["read"]],
    ["project", ["read"]],
    ["task", ["read"]],
    ["crm", ["read"]],
    ["quote", ["read"]],
    ["service", ["read"]],
    ["finance", ["read"]],
    ["note", ["read"]],
    ["study", ["read"]],
    ["tag", ["read"]],
    ["link", ["read"]],
    ["comment", ["read"]],
    ["reminder", ["read"]],
    ["approval", ["read"]],
  ],
  "write:inbox": [["inbox", ["create"]]],
  "write:tasks": [["task", ["create", "update"]]],
  "write:notes": [
    ["note", ["create", "update"]],
    ["link", ["create"]],
  ],
  "write:decisions": [["project", ["update"]]],
  "write:crm": [["crm", ["create", "update"]]],
  "write:finance": [["finance", ["create"]]],
  "propose:*": [["approval", ["create"]]],
};

export const MCP_SCOPES = Object.keys(SCOPE_GRANTS);
export const DEFAULT_MCP_SCOPES = ["read:all", "write:inbox", "write:tasks", "write:notes", "write:decisions", "propose:*"];

export function can(ctx: Ctx, action: Action, resource: Resource): boolean {
  if (ctx.actor.type === "agent") {
    const scopes = ctx.scopes ?? [];
    return scopes.some((s) => SCOPE_GRANTS[s]?.some(([r, acts]) => r === resource && acts.includes(action)));
  }
  if (ctx.actor.type === "system") return true;
  switch (ctx.role) {
    case "owner":
      return true;
    case "admin":
      return !(resource === "workspace" && action === "delete");
    case "member":
      if (resource === "finance" || resource === "fiscal" || resource === "settings" || resource === "audit" || resource === "export") return false;
      if (resource === "mcp_token") return false;
      return action !== "manage";
    case "client":
      return false;
    default:
      return false;
  }
}

export function assertCan(ctx: Ctx, action: Action, resource: Resource): void {
  if (!can(ctx, action, resource)) {
    throw forbidden(
      ctx.actor.type === "agent" ? `El token no tiene alcance para ${action} en ${resource}. Usá proponer_cambio para pedir aprobación.` : undefined,
    );
  }
}
