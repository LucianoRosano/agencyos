import "server-only";
import { ok, type Result, toResultError } from "@agencyos/core";
import { revalidatePath } from "next/cache";
import { type AppCtx, requireCtx } from "./session";

export type ActionState<T = unknown> = Result<T> | null;

/**
 * Envuelve una Server Action: obtiene el contexto autenticado, ejecuta el caso de uso,
 * convierte errores en Result tipado (sin stack traces) y revalida la UI.
 */
export async function run<T>(fn: (ctx: AppCtx) => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<Result<T>> {
  try {
    const ctx = await requireCtx();
    const data = await fn(ctx);
    if (opts.revalidate !== false) revalidatePath("/", "layout");
    return ok(data);
  } catch (e) {
    // redirect()/notFound() de Next se propagan
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest: unknown }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_")
    )
      throw e;
    return toResultError(e);
  }
}
