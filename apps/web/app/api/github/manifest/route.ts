import { assertCan } from "@agencyos/core";
import { appConfigFromEnv } from "@agencyos/modules/repos/github";
import { buildManifest, escapeHtml, htmlPage, newOAuthState } from "@agencyos/modules/repos/manifest";
import { cookies } from "next/headers";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Paso 1 del flujo de manifest: formulario que se envía a GitHub (POST con el manifest). */
export async function GET() {
  const ctx = await requireCtx();
  assertCan(ctx, "manage", "settings");
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl.startsWith("https://"))
    return htmlPage(
      "Falta el dominio",
      `<h1>Hace falta el dominio con https</h1><p>GitHub tiene que poder llamar a ${escapeHtml(appUrl || "AGENCYOS")}/api/webhooks/github.</p><p><a href="/repositorios">Volver</a></p>`,
    );
  if (appConfigFromEnv()) return htmlPage("App ya configurada", `<h1>La GitHub App ya está configurada</h1><p><a href="/repositorios">Volver a Repositorios</a></p>`);
  const state = newOAuthState();
  (await cookies()).set("gh_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/github", maxAge: 600 });
  const manifest = JSON.stringify(buildManifest(appUrl));
  return htmlPage(
    "Crear la GitHub App",
    `<h1>Crear la GitHub App «AGENCYOS»</h1>
<p>GitHub va a mostrar la App con los permisos mínimos ya completos. Confirmá con «Create GitHub App». Al volver, AGENCYOS te muestra las credenciales <strong>una sola vez</strong>.</p>
<form method="post" action="https://github.com/settings/apps/new?state=${encodeURIComponent(state)}">
<input type="hidden" name="manifest" value="${escapeHtml(manifest)}">
<button type="submit">Continuar a GitHub</button>
</form>
<details><summary>Ver el manifest</summary><pre>${escapeHtml(JSON.stringify(JSON.parse(manifest), null, 2))}</pre></details>`,
    { formAction: "https://github.com" },
  );
}
