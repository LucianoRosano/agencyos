# Arquitectura

Resumen de la implementación real (la spec de diseño está en `docs/03-arquitectura.md`; las diferencias se documentan en `docs/adr/`).

## Componentes
```
Navegador / PWA ──HTTPS──► Caddy ──► apps/web (Next.js 16)
                                       ├─ UI (RSC + Server Actions)
                                       ├─ /api/auth/*  (Better Auth)
                                       ├─ /mcp         (servidor MCP, Streamable HTTP)
                                       ├─ /api/presupuestos/[id]/pdf, /api/exportar, /api/calendario/ical/[token], /api/health
                                       └─ proxy.ts     (CSP con nonce, HSTS)
                  apps/worker (pg-boss) ── outbox, vencimientos, resumen diario, purga
                  PostgreSQL ── datos + cola pg-boss + búsqueda (unaccent + pg_trgm + FTS)
```

## Capas
`app (UI/rutas)` → `Server Action` (`app/(app)/<ruta>/actions.ts`, envuelta en `run()`) → `packages/modules/src/<modulo>/service.ts` → `packages/db`.

Cada caso de uso: `assertCan(ctx, acción, recurso)` → Zod → transacción → `recordEvent()` (outbox `domain_event` + `activity`) → fila. Todas las consultas filtran con `scoped(tabla, ctx)` (workspace + excluye papelera/archivados).

| Paquete | Contenido |
|---|---|
| `packages/core` | dinero (BigInt en centavos), fechas ART, CUIT, recurrencia, permisos, errores/Result, validadores Zod, textos de enums. Seguro para el cliente. `core/events` (solo servidor): `recordEvent`, `audit`. |
| `packages/db` | esquema Drizzle (`src/schema/*.ts`), migraciones, cliente `pg`, UUIDv7. |
| `packages/modules` | `auth`, `setup`, `spaces`, `inbox`, `projects`, `tasks`, `trash`, `search`, `today`, `business`, `crm`, `quotes`, `finance`, `notes`, `brain`, `study`, `calendar`, `mcp`, `settings`, `approvals`, `notifications`, `activity`, `admin` (CLI). |
| `packages/ui` | design system: tokens oscuro/claro, componentes, gráficos SVG. |
| `packages/pdf` | HTML → PDF con Chromium (playwright-core), A4, Geist embebida. |

## Contexto y permisos
- `requireCtx()` (`apps/web/lib/session.ts`): sesión Better Auth + 2FA activo + membresía → `Ctx { workspaceId, userId, role, actor }`.
- Roles `owner · admin · member · client` (docs/08 §3). `client` no tiene acceso a la app (portal en F6).
- Claude por MCP: `actor.type = "agent"` + `scopes` del token. Matriz en `packages/core/src/permissions.ts`.

## Rendimiento
- RSC con datos en el servidor; Hoy resuelve todo en ~15 consultas paralelas.
- Cerebro con carga diferida (`dynamic(..., { ssr: false })`), layout en Web Worker y posiciones guardadas en `graph_layout`.
- Sin librerías de gráficos: SVG propios.

## Seguridad
Ver `docs/SECURITY-CHECKLIST.md` y `docs/08-seguridad.md`.
