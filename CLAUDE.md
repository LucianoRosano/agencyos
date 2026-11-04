# AGENCYOS — reglas para Claude

Dueño: Luciano Rosano (lucianorosanott@gmail.com). Es dueño de producto: decide y prueba. Vos escribís, desplegás y verificás.
El sistema se llama **AGENCYOS**. Hacia los clientes (PDFs, presupuestos) la marca es **Luciano Rosano**.
Especificación: docs/00-LEEME.md (orden de lectura y precedencia). Estado: docs/ESTADO.md. Pendientes de Luciano: docs/PENDIENTES-LUCIANO.md.

## Siempre
- Al empezar: leer este archivo, docs/ESTADO.md y docs/PENDIENTES-LUCIANO.md.
- Preguntas: una sola lista por fase, antes de empezar. Durante la ejecución: sin narración.
- Verificar antes de decir "listo": pnpm typecheck, pnpm test, pnpm e2e (mobile-390 y desktop-1440, oscuro/claro), capturas revisadas, axe, sin scroll horizontal.
- Al terminar o pausar: actualizar docs/ESTADO.md (hecho / en curso / siguiente) y docs/PENDIENTES-LUCIANO.md.
- Commits chicos, Conventional Commits en español. UI, docs y commits en español rioplatense; código en inglés.

## Nunca (sin aprobación explícita de Luciano)
- Desplegar a producción, migraciones destructivas, borrar datos, enviar algo a clientes, gastar dinero, cambiar la visibilidad de repositorios, ejecutar cambios en GitHub fuera de un plan aprobado.
- Commitear secretos (gitleaks). Guardar credenciales humanas (solo referencias a Bitwarden).
- Mostrar datos de ejemplo en la UI o botones sin función. Lo que no está listo no se muestra.

## Arquitectura (detalle en docs/ARCHITECTURE.md y docs/03)
Monorepo pnpm:
- `packages/db` — esquema Drizzle (`src/schema/*.ts`), migraciones (`migrations/`), cliente. Sin lógica.
- `packages/core` — dinero (`money.ts`, BigInt en centavos), fechas TZ Argentina (`dates.ts`), CUIT, recurrencia, permisos (`can/assertCan`), errores (`DomainError`, `Result`), validadores Zod comunes (`validation.ts`), textos de enums (`labels.ts`). **`@agencyos/core` es seguro para el cliente**; `@agencyos/core/events` (recordEvent, audit) es solo servidor.
- `packages/modules/src/<modulo>/` — `service.ts` (casos de uso), `queries.ts` (lecturas), opcional `jobs.ts`, `mcp.ts`. Importar como `@agencyos/modules/<modulo>/service`.
- `packages/ui` — design system (tokens, Button, Field/Input/Select/Textarea, Card/BlockCard/SectionLabel, Badge/Pill/EntityChip/Dot, Progress, EmptyState, Skeleton, PageHeader/Tabs, Sheet (modal desktop / hoja inferior celular), Menu, charts SVG).
- `packages/pdf` — HTML → PDF con Chromium (playwright-core).
- `apps/web` — Next.js 16 App Router. `app/(auth)` login/setup/2FA, `app/(app)` todo lo autenticado. `proxy.ts` = CSP con nonce.
- `apps/worker` — pg-boss: outbox, jobs diarios, backups.

### Reglas de capas
- UI → Server Action (`app/(app)/<ruta>/actions.ts`) → `modules/*/service.ts` → `db`. La UI nunca toca la base salvo lecturas de composición en layouts.
- Cada función de service: (1) `assertCan(ctx, accion, recurso)`; (2) parsea con Zod; (3) transacción; (4) `recordEvent(tx, ctx, {...})` (outbox + actividad); (5) devuelve la fila. Errores con `notFound()/validation()/forbidden()` de core.
- **Siempre** filtrar por workspace con `scoped(tabla, ctx)` (también excluye papelera y archivados).
- Server Actions: `export const xAction = async (_prev, fd: FormData) => run((ctx) => svc.x(ctx, Object.fromEntries(fd)))`. `run()` (lib/action.ts) obtiene el contexto, convierte errores en `Result` y revalida.
- Formularios: `<ActionForm action={...} successMessage redirectTo onSuccess resetOnSuccess>` + `TextField/SelectField/TextAreaField/CheckField` (components/fields.tsx) — muestran errores por campo desde Zod. Acciones de botón: `useAction().exec(fn, { success, undo })` (toast con "Deshacer" 8 s).
- Eliminar = papelera (`moveToTrash(ctx, tipo, id)` de modules/trash); siempre `confirm()` + "Deshacer". Registrar nuevos tipos en `modules/src/shared/entities.ts`.
- Dinero: `numeric(14,2)` + moneda; en TS siempre strings y `@agencyos/core` money (`addMoney`, `formatMoney`). Nunca float.
- Fechas de calendario `date` → string "YYYY-MM-DD"; hoy = `todayAR()`; mostrar con `formatDate` (dd/mm/aaaa).
- Textos de enums: `L.*` + `label()` de core. Nada de strings sueltos repetidos.

### Calidad visual
- Seguir docs/07-ux-ui.md, docs/contexto (tokens C1, Geist, Lucide) y docs/contexto/referencias/*.webp (Hoy y Cerebro, aprobadas).
- Componentes solo desde `@agencyos/ui`. Estados vacío (EmptyState con acción), carga (loading.tsx/skeleton) y error en cada pantalla.
- Mobile first: inputs ≥ 16 px (`text-base md:text-sm`), zonas táctiles ≥ 44 px, tablas → tarjetas en el celular, sin scroll horizontal, Sheet en vez de modal.
- Etiquetas de sección: `SectionLabel` (mono, mayúsculas espaciadas). Encabezados: `PageHeader` con `accent` del módulo (docs/07 §2).
- Presupuesto: JS inicial < 170 KB gzip por ruta; LCP de Hoy < 1,5 s en celular.

## Comandos
- `pnpm dev` (web en :3000) · `pnpm dev:worker`
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (Vitest: unit + integración contra Postgres `agencyos_test`)
- `pnpm e2e` (Playwright: levanta la web en :3100 contra `agencyos_e2e`, que se recrea en cada corrida)
- `pnpm db:generate` (tras cambiar el esquema) · `pnpm db:migrate`
- `pnpm admin <comando>` (CLI de administración: reset-password, import-inicial, etc.)
- Deploy: ver docs/DEPLOYMENT.md (`infra/scripts/deploy.sh staging|prod`; prod requiere aprobación).

## Entorno local de desarrollo
PostgreSQL 16+ en 127.0.0.1:5432, usuario/clave `agencyos`, bases `agencyos`, `agencyos_test`, `agencyos_e2e`. Variables en `apps/web/.env.local` (ver `.env.example`).
