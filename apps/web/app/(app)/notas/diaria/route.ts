import { getOrCreateDaily } from "@agencyos/modules/notes/service";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/session";

/** Abre (o crea) la nota diaria de hoy, en zona horaria de Argentina. */
export async function GET() {
  const ctx = await requireCtx();
  const note = await getOrCreateDaily(ctx);
  redirect(`/notas/${note.id}`);
}
