import { getDb, schema } from "@agencyos/db";
import { getAuth, MAGIC_2FA_REDIRECT } from "@agencyos/modules/auth/server";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { makeWorkspace } from "./helpers";

const sent = vi.hoisted(() => [] as { to: string; text: string }[]);
vi.mock("../../packages/modules/src/shared/email", async (orig) => ({
  ...(await orig<typeof import("../../packages/modules/src/shared/email")>()),
  emailConfigured: () => true,
  sendEmail: vi.fn(async (m: { to: string; text: string }) => {
    sent.push(m);
    return true;
  }),
}));

const BASE = "http://localhost:3000";

async function clientUser(twoFactor: boolean) {
  const owner = await makeWorkspace();
  const id = `u_ml_${Math.random().toString(36).slice(2)}`;
  const email = `${id}@test.local`;
  await getDb().insert(schema.user).values({ id, name: "Clienta", email, emailVerified: true, twoFactorEnabled: twoFactor });
  await getDb().insert(schema.membership).values({ workspaceId: owner.workspaceId, userId: id, role: "client" });
  return { id, email };
}

async function magicLinkFor(email: string) {
  const res = await getAuth().handler(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, callbackURL: "/portal" }),
    }),
  );
  expect(res.status).toBe(200);
  const mail = sent.findLast((m) => m.to === email);
  const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("no llegó el enlace");
  return url;
}

const sessionsOf = async (userId: string) => getDb().select().from(schema.session).where(eq(schema.session.userId, userId));

describe("magic link del portal y 2FA", () => {
  it("cliente sin 2FA: el enlace inicia sesión y va al portal", async () => {
    const u = await clientUser(false);
    const url = await magicLinkFor(u.email);
    const res = await getAuth().handler(new Request(url, { headers: { origin: BASE } }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/\/portal$/);
    expect(await sessionsOf(u.id)).toHaveLength(1);
  });

  it("cliente con 2FA: el enlace NO crea sesión; deja el desafío pendiente y pide el código", async () => {
    const u = await clientUser(true);
    const url = await magicLinkFor(u.email);
    const res = await getAuth().handler(new Request(url, { headers: { origin: BASE } }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(new URL(MAGIC_2FA_REDIRECT, BASE).toString());
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toMatch(/agencyos\.two_factor=/);
    // la cookie de sesión queda vencida y no hay sesión en la base
    expect(cookies).toMatch(/agencyos\.session_token=;/);
    expect(await sessionsOf(u.id)).toHaveLength(0);
    // el desafío quedó registrado para este usuario
    const pending = await getDb().select().from(schema.verification).where(eq(schema.verification.value, u.id));
    expect(pending.some((v) => v.identifier.startsWith("2fa-"))).toBe(true);
    // el enlace sirve una sola vez
    const again = await getAuth().handler(new Request(url, { headers: { origin: BASE } }));
    expect(again.headers.get("location")).toMatch(/error=INVALID_TOKEN/);
  });
});
