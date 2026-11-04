import { audit } from "@agencyos/core/events";
import { getDb, getPool, schema, type Tx } from "@agencyos/db";
import { count, eq } from "drizzle-orm";
import { getAuth } from "../auth/server";
import { DEFAULT_CATEGORIES, DEFAULT_QUOTE_TEMPLATE, PROJECT_TEMPLATES } from "./templates";

export const DEFAULT_MODULES = ["inbox", "crm", "projects", "quotes", "finance", "notes", "brain", "calendar", "study", "ai"];

export async function isSetupDone(): Promise<boolean> {
  const [row] = await getDb().select({ n: count() }).from(schema.membership);
  return (row?.n ?? 0) > 0;
}

/** Estructura inicial del workspace (sin datos inventados: docs/04 §16). */
export async function seedStructure(t: Tx, workspaceId: string, userId: string) {
  const spaces = await t
    .insert(schema.space)
    .values([
      { workspaceId, name: "Agencia", kind: "agency", color: "#22D3EE", icon: "briefcase", sort: 0, createdBy: userId },
      { workspaceId, name: "Personal", kind: "personal", color: "#7C5CFF", icon: "user", sort: 1, createdBy: userId },
      { workspaceId, name: "Facultad", kind: "study", color: "#FBBF24", icon: "graduation-cap", sort: 2, createdBy: userId },
    ])
    .returning();
  const agency = spaces.find((s) => s.kind === "agency");
  const personal = spaces.find((s) => s.kind === "personal");
  const ledgers = await t
    .insert(schema.ledger)
    .values([
      { workspaceId, name: "Agencia", spaceId: agency?.id, sort: 0, createdBy: userId },
      { workspaceId, name: "Personal", spaceId: personal?.id, sort: 1, createdBy: userId },
    ])
    .returning();
  const cats = [
    ...DEFAULT_CATEGORIES.income.map((name) => ({ workspaceId, name, kind: "income", createdBy: userId })),
    ...DEFAULT_CATEGORIES.expense.map((name) => ({ workspaceId, name, kind: "expense", createdBy: userId })),
  ];
  await t.insert(schema.category).values(cats);
  await t.insert(schema.projectTemplate).values(
    PROJECT_TEMPLATES.map((tpl, i) => ({
      workspaceId,
      key: tpl.key,
      name: tpl.name,
      kind: tpl.kind,
      description: tpl.description,
      definition: tpl.definition,
      sort: i,
      createdBy: userId,
    })),
  );
  await t.insert(schema.quoteTemplate).values({ workspaceId, ...DEFAULT_QUOTE_TEMPLATE, isDefault: true, createdBy: userId });
  return { spaces, ledgers };
}

export type SetupInput = { name: string; email: string; password: string };

/** Crea el workspace, el usuario dueño y la estructura inicial. Solo funciona una vez. */
export async function createOwner(input: SetupInput): Promise<{ userId: string; workspaceId: string }> {
  if (await isSetupDone()) throw new Error("AGENCYOS ya está configurado.");
  const auth = getAuth();
  const actx = await auth.$context;
  const hashed = await actx.password.hash(input.password);
  // Candado global en una conexión dedicada: dos /setup simultáneos no pueden crear dos dueños.
  const client = await getPool().connect();
  const lock = await client.query<{ ok: boolean }>("select pg_try_advisory_lock(424242) as ok");
  if (!lock.rows[0]?.ok) {
    client.release();
    throw new Error("La configuración inicial ya está en curso.");
  }
  try {
    if (await isSetupDone()) throw new Error("AGENCYOS ya está configurado.");
    const existing = await actx.internalAdapter.findUserByEmail(input.email.toLowerCase());
    const created =
      existing?.user ??
      (await actx.internalAdapter.createUser({ email: input.email.toLowerCase(), name: input.name, emailVerified: true }, { method: "admin" }));
    if (!existing) await actx.internalAdapter.linkAccount({ userId: created.id, providerId: "credential", accountId: created.id, password: hashed });
    else await actx.internalAdapter.updatePassword(created.id, hashed);
    return await createWorkspaceFor(created.id, input);
  } finally {
    await client.query("select pg_advisory_unlock(424242)");
    client.release();
  }
}

async function createWorkspaceFor(userId: string, input: SetupInput): Promise<{ userId: string; workspaceId: string }> {
  const created = { id: userId };
  return getDb().transaction(async (t) => {
    const [ws] = await t
      .insert(schema.workspace)
      .values({
        name: "AGENCYOS",
        slug: "agencyos",
        enabledModules: DEFAULT_MODULES,
        settings: { agencyName: input.name, agencyEmail: input.email.toLowerCase(), stalledDays: 14, maxActiveProjects: 8 },
      })
      .returning();
    if (!ws) throw new Error("No se pudo crear el workspace");
    await t.insert(schema.membership).values({ workspaceId: ws.id, userId: created.id, role: "owner" });
    await seedStructure(t, ws.id, created.id);
    await audit(t, null, { workspaceId: ws.id, actorId: created.id, action: "setup.owner_created", targetType: "user", targetId: created.id });
    return { userId: created.id, workspaceId: ws.id };
  });
}

export async function getMembership(userId: string) {
  const [m] = await getDb().select().from(schema.membership).where(eq(schema.membership.userId, userId)).limit(1);
  return m ?? null;
}
