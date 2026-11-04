import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { assertCan, type Ctx, DEFAULT_MCP_SCOPES, MCP_SCOPES, notFound, type Role, validation, zRequired } from "@agencyos/core";
import { audit } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const tokenInput = z.object({
  name: zRequired(80, "El nombre"),
  scopes: z
    .array(z.enum(MCP_SCOPES as [string, ...string[]]))
    .min(1, "Elegí al menos un alcance")
    .default(DEFAULT_MCP_SCOPES),
  expiresDays: z.coerce.number().int().min(1).max(365).default(90),
});

/** Crea un token MCP. El texto plano se devuelve UNA sola vez; se guarda solo el hash. */
export async function createMcpToken(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "mcp_token");
  if (!ctx.userId) throw validation("Sin usuario");
  const input = tokenInput.parse(raw);
  const plain = `ag_${randomBytes(32).toString("base64url")}`;
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.mcpToken)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        userId: ctx.userId as string,
        name: input.name,
        tokenHash: sha256(plain),
        prefix: plain.slice(0, 10),
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + input.expiresDays * 86_400_000),
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el token");
    await audit(t, ctx, {
      action: "mcp_token.created",
      targetType: "mcp_token",
      targetId: row.id,
      after: { name: row.name, scopes: row.scopes, expiresAt: row.expiresAt },
    });
    return { token: plain, row };
  });
}

export async function revokeMcpToken(ctx: Ctx, id: string) {
  assertCan(ctx, "manage", "mcp_token");
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.mcpToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.mcpToken.id, id), scoped(schema.mcpToken, ctx)))
      .returning();
    if (!row) throw notFound("El token");
    await audit(t, ctx, { action: "mcp_token.revoked", targetType: "mcp_token", targetId: id });
    return row;
  });
}

export async function listMcpTokens(ctx: Ctx) {
  return getDb().select().from(schema.mcpToken).where(scoped(schema.mcpToken, ctx)).orderBy(desc(schema.mcpToken.createdAt));
}

/** Valida un token Bearer y devuelve el contexto de máquina (actor "Claude (MCP)"). */
export async function ctxFromToken(bearer: string | null): Promise<Ctx | null> {
  if (!bearer?.startsWith("ag_")) return null;
  const hash = sha256(bearer);
  const db = getDb();
  const [row] = await db
    .select({ tok: schema.mcpToken, role: schema.membership.role })
    .from(schema.mcpToken)
    .innerJoin(schema.membership, and(eq(schema.membership.userId, schema.mcpToken.userId), eq(schema.membership.workspaceId, schema.mcpToken.workspaceId)))
    .where(and(eq(schema.mcpToken.tokenHash, hash), isNull(schema.mcpToken.revokedAt), isNull(schema.mcpToken.deletedAt)));
  if (!row) return null;
  if (!timingSafeEqual(Buffer.from(row.tok.tokenHash), Buffer.from(hash))) return null;
  if (row.tok.expiresAt && row.tok.expiresAt < new Date()) return null;
  await db.update(schema.mcpToken).set({ lastUsedAt: new Date() }).where(eq(schema.mcpToken.id, row.tok.id));
  return {
    workspaceId: row.tok.workspaceId,
    userId: row.tok.userId,
    role: row.role as Role,
    actor: { type: "agent", id: `mcp:${row.tok.id}`, name: "Claude (MCP)" },
    scopes: row.tok.scopes,
  };
}
