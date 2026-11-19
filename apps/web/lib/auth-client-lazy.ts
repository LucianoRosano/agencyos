"use client";

/**
 * Cliente de better-auth bajo demanda (≈ 16 KB gzip con passkeys): para pantallas donde solo se usa al tocar un botón
 * o después de hidratar (Configuración → Seguridad, portal). Las pantallas de ingreso siguen usando lib/auth-client.
 */
export const getAuthClient = () => import("./auth-client").then((m) => m.authClient);
