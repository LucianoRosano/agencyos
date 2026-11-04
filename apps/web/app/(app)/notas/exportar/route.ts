import { DomainError } from "@agencyos/core";
import { exportNotesZip } from "@agencyos/modules/notes/export";
import { requireCtx } from "@/lib/session";

/** Exportación de todas las notas a un ZIP compatible con Obsidian (salida de emergencia). */
export async function GET() {
  const ctx = await requireCtx();
  try {
    const { data, filename } = await exportNotesZip(ctx);
    return new Response(data, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError && e.code === "FORBIDDEN") return new Response("No tenés permiso para exportar.", { status: 403 });
    throw e;
  }
}
