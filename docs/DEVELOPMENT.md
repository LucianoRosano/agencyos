# Desarrollo

## Requisitos
Node 22+, pnpm 10, PostgreSQL 16+ con las extensiones `unaccent` y `pg_trgm` (vienen en `postgresql-contrib`), Chromium (Playwright) para PDFs y e2e.

## Puesta en marcha
```bash
pnpm install
createdb agencyos && createdb agencyos_test && createdb agencyos_e2e   # usuario/clave agencyos
cp .env.example apps/web/.env.local
pnpm db:migrate
pnpm dev            # web en http://localhost:3000 → /setup crea el dueño y pide activar el 2FA
pnpm dev:worker     # jobs (opcional en desarrollo)
```
En desarrollo conviene `AUTH_HIBP=off` (sin consultas a Have I Been Pwned).

## Estructura
Ver `CLAUDE.md` (reglas y patrones) y `docs/ARCHITECTURE.md`. Para un módulo nuevo: esquema → migración → `service.ts` + tests de integración → `queries.ts` → páginas en `apps/web/app/(app)/<ruta>` + `actions.ts` → integración con Hoy/búsqueda/actividad → MCP → e2e.

## Comandos
| Comando | Qué hace |
|---|---|
| `pnpm typecheck` | TypeScript en todos los paquetes |
| `pnpm lint` | Biome |
| `pnpm test` | Vitest (unit + integración contra `agencyos_test`, que se recrea) |
| `pnpm e2e` | Playwright: build de producción en :3100 contra `agencyos_e2e` (se recrea) |
| `pnpm db:generate` / `pnpm db:migrate` | Migraciones |
| `pnpm admin reset-password <email>` | Restablecer contraseña sin email |
| `pnpm admin import-inicial [--aplicar]` | Carga inicial de clientes y proyectos de Luciano |

## Notas
- No correr dos `next dev` a la vez en el mismo checkout (se pisan `next-env.d.ts`).
- `@agencyos/core` (índice) es seguro para componentes cliente; nunca importar `@agencyos/db`, `@agencyos/core/events` ni `@agencyos/modules/*` desde `"use client"`.
