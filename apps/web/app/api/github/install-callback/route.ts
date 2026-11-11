import { checkOAuthState, escapeHtml, htmlPage } from "@agencyos/modules/repos/manifest";
import { connectInstallation, syncWorkspace } from "@agencyos/modules/repos/service";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

/** setup_url de la App: GitHub vuelve con ?installation_id. Se verifica contra la API (que sea de NUESTRA App) y se sincroniza. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  const url = new URL(req.url);
  const jar = await cookies();
  const ok = checkOAuthState(jar.get("gh_state")?.value, url.searchParams.get("state"));
  jar.delete({ name: "gh_state", path: "/api/github" });
  const id = Number(url.searchParams.get("installation_id"));
  if (!ok || !Number.isInteger(id) || id <= 0)
    return htmlPage(
      "Solicitud inválida",
      `<h1>Solicitud inválida o vencida</h1><p>Volvé a Repositorios e instalá la App desde ahí.</p><p><a href="/repositorios">Volver</a></p>`,
    );
  try {
    await connectInstallation(ctx, id);
    await syncWorkspace(ctx).catch((e) => console.error("[github] primera sincronización", e instanceof Error ? e.message : e));
  } catch (e) {
    return htmlPage(
      "Error",
      `<h1>No se pudo conectar la instalación</h1><p>${escapeHtml(e instanceof Error ? e.message : "Error")}</p><p><a href="/repositorios">Volver</a></p>`,
    );
  }
  redirect("/repositorios");
}
