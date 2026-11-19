import "server-only";
import { DomainError, ok, type Result, toResultError } from "@agencyos/core";
import { log, requestIdFrom } from "@agencyos/modules/shared/log";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
    // Errores de dominio (validación, permisos…) son esperables; el resto se registra con su requestId.
    if (!(e instanceof DomainError) && !(e instanceof Error && e.name === "ZodError"))
      log.error({ requestId: requestIdFrom(await headers().catch(() => null)), err: e instanceof Error ? e.message : String(e) }, "server action falló");
    return toResultError(e);
  }
}
