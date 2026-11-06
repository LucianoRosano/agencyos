import { assertCan } from "@agencyos/core";
import { audit } from "@agencyos/core/events";
import { getDb } from "@agencyos/db";
import { exchangeManifestCode } from "@agencyos/modules/repos/github";
import { checkOAuthState, escapeHtml, htmlPage } from "@agencyos/modules/repos/manifest";
import { cookies } from "next/headers";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Paso 2: GitHub vuelve con ?code. Se canjea por las credenciales de la App y se muestran UNA vez
 * para copiarlas al .env del servidor. No se guardan en la base ni en logs.
 */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  assertCan(ctx, "manage", "settings");
  const url = new URL(req.url);
  const jar = await cookies();
  const ok = checkOAuthState(jar.get("gh_state")?.value, url.searchParams.get("state"));
  jar.delete({ name: "gh_state", path: "/api/github" });
  if (!ok) return htmlPage("Solicitud inválida", `<h1>Solicitud inválida o vencida</h1><p><a href="/repositorios">Volver y reintentar</a></p>`);
  let app: Awaited<ReturnType<typeof exchangeManifestCode>>;
  try {
    app = await exchangeManifestCode(url.searchParams.get("code") ?? "");
  } catch (e) {
    return htmlPage(
      "Error",
      `<h1>No se pudo crear la App</h1><p>${escapeHtml(e instanceof Error ? e.message : "Error")}</p><p><a href="/repositorios">Volver</a></p>`,
    );
  }
  await audit(getDb(), ctx, { action: "github.app.created", targetType: "github_app", targetId: String(app.id), after: { slug: app.slug, owner: app.owner } });
  const env = [
    `GITHUB_APP_ID=${app.id}`,
    `GITHUB_APP_SLUG=${app.slug}`,
    `GITHUB_WEBHOOK_SECRET=${app.webhookSecret}`,
    `GITHUB_APP_PRIVATE_KEY="${app.pem.trim().replace(/\n/g, "\\n")}"`,
  ].join("\n");
  return htmlPage(
    "Credenciales de la GitHub App",
    `<h1>App «${escapeHtml(app.slug)}» creada</h1>
<p class="warn"><strong>Se muestran una sola vez.</strong> Copialas ahora al .env del servidor (infra/.env.prod), guardá una copia en Bitwarden y reiniciá web y worker. AGENCYOS no las guarda.</p>
<pre>${escapeHtml(env)}</pre>
<p>Después de reiniciar: Repositorios → «Instalar la App en GitHub» y elegí los repositorios.</p>
<p><a href="/repositorios">Volver a Repositorios</a></p>`,
  );
}
