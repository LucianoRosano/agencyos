/**
 * Observabilidad (docs/OBSERVABILITY.md).
 * - OpenTelemetry (@vercel/otel) SOLO si hay OTEL_EXPORTER_OTLP_ENDPOINT (SigNoz, Grafana Tempo/Alloy, Honeycomb…).
 *   Sin esa variable no se carga nada: cero costo.
 * - onRequestError: todo error no capturado de páginas, Server Actions y rutas sale como log JSON con su requestId.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME || "agencyos-web" });
}

type ErrorRequest = { path: string; method: string; headers: Record<string, string | string[] | undefined> };
type ErrorContext = { routerKind: string; routePath: string; routeType: string };

export async function onRequestError(err: unknown, request: ErrorRequest, context: ErrorContext) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("@agencyos/modules/shared/log");
  const rid = request.headers["x-request-id"];
  log.error(
    {
      requestId: Array.isArray(rid) ? rid[0] : rid,
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
      err: err instanceof Error ? err.message : String(err),
      digest: (err as { digest?: string })?.digest,
    },
    "error no capturado",
  );
}
