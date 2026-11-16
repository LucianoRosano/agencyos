import { type NextRequest, NextResponse } from "next/server";

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * CSP estricta con nonce para scripts (docs/08 §5) + HSTS en producción.
 * `x-request-id`: el que manda Caddy (o uno nuevo) se propaga a la app (logs, errores) y vuelve en la respuesta.
 * /api y /mcp no pasan por acá (cuerpos grandes: subidas y webhooks): ahí el id lo pone Caddy y lo lee requestIdFrom().
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(request.nextUrl.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  if (request.nextUrl.protocol === "https:") response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|mcp|_next/static|_next/image|favicon.ico|icons|fonts|manifest.webmanifest|sw.js|offline.html).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
