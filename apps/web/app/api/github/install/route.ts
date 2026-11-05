import { assertCan } from "@agencyos/core";
import { appConfigFromEnv } from "@agencyos/modules/repos/github";
import { newOAuthState } from "@agencyos/modules/repos/manifest";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Lleva a instalar la App en la cuenta, con estado anti-CSRF que vuelve en el setup_url. */
export async function GET() {
  const ctx = await requireCtx();
  assertCan(ctx, "manage", "settings");
  const cfg = appConfigFromEnv();
  if (!cfg?.slug || !/^[a-z0-9-]{1,100}$/.test(cfg.slug)) redirect("/repositorios");
  const state = newOAuthState();
  (await cookies()).set("gh_state", state, {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://") ?? false,
    sameSite: "lax",
    path: "/api/github",
    maxAge: 900,
  });
  redirect(`https://github.com/apps/${cfg.slug}/installations/new?state=${encodeURIComponent(state)}`);
}
