import { verifyPassword } from "@agencyos/modules/auth/reauth";
import { exportWorkspace } from "@agencyos/modules/settings/export";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await requireCtx();
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  try {
    await verifyPassword(ctx.user.id, password ?? "");
  } catch {
    return new Response("Contraseña incorrecta", { status: 403 });
  }
  const buf = await exportWorkspace(ctx);
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="agencyos-export.zip"`, "cache-control": "no-store" },
  });
}
