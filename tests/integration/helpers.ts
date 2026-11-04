import type { Ctx } from "@agencyos/core";
import { getDb, schema, uuidv7 } from "@agencyos/db";
import { seedStructure } from "@agencyos/modules/setup/service";

/** Crea un workspace aislado con su estructura inicial y devuelve un contexto de dueño. */
export async function makeWorkspace(name = "WS de test"): Promise<Ctx & { spaces: { id: string; kind: string }[]; ledgers: { id: string; name: string }[] }> {
  const db = getDb();
  const userId = `u_${uuidv7()}`;
  await db.insert(schema.user).values({ id: userId, name: "Test", email: `${userId}@test.local`, emailVerified: true, twoFactorEnabled: true });
  const [ws] = await db
    .insert(schema.workspace)
    .values({ name, slug: `ws-${uuidv7()}`, enabledModules: ["inbox", "crm", "projects", "quotes", "finance", "notes", "brain", "calendar", "study"] })
    .returning();
  if (!ws) throw new Error("ws");
  await db.insert(schema.membership).values({ workspaceId: ws.id, userId, role: "owner" });
  const { spaces, ledgers } = await db.transaction((t) => seedStructure(t, ws.id, userId));
  return {
    workspaceId: ws.id,
    userId,
    role: "owner",
    actor: { type: "user", id: userId, name: "Test" },
    spaces: spaces.map((s) => ({ id: s.id, kind: s.kind })),
    ledgers: ledgers.map((l) => ({ id: l.id, name: l.name })),
  };
}

/** Contexto de máquina (MCP) con alcances. */
export function agentCtx(base: Ctx, scopes: string[]): Ctx {
  return { ...base, actor: { type: "agent", id: "token-test", name: "Claude (MCP)" }, scopes };
}
