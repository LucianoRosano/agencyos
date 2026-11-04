# Base de datos

PostgreSQL (prod 17). Esquema en `packages/db/src/schema/*.ts` (Drizzle); migraciones SQL en `packages/db/migrations/`.

## Convenciones (docs/04)
- `id uuid` v7 (generado en la app), `workspace_id` en todas las tablas de negocio, `created_at`, `updated_at`, `created_by`, `archived_at`, `deleted_at` (papelera 30 días).
- Dinero: `numeric(14,2)` + moneda (`ARS`/`USD`). En TypeScript son strings; se opera con `@agencyos/core` (BigInt).
- Fechas de calendario: `date` (se leen como `"YYYY-MM-DD"`, sin conversión de zona). Momentos: `timestamptz`, se muestran en America/Buenos_Aires.
- Enums como `text` + `CHECK`.

## Tablas por área
| Área | Tablas |
|---|---|
| Auth (Better Auth) | `user`, `session`, `account`, `verification`, `two_factor`, `rate_limit` |
| Núcleo | `workspace`, `membership`, `space`, `tag`, `tagging`, `link`, `comment`, `user_preference`, `domain_event` (outbox), `activity`, `notification`, `audit_log` (solo inserción), `approval`, `inbox_item`, `mcp_token`, `reminder` |
| CRM | `client`, `client_fiscal_holder`, `contact`, `client_contact`, `interaction`, `opportunity` |
| Proyectos | `project`, `project_phase`, `task`, `task_checklist_item`, `focus_pick`, `focus_session`, `blocker`, `decision`, `deliverable`, `changelog_entry`, `project_template` |
| Presupuestos | `service`, `quote`, `quote_version`, `quote_item`, `quote_template` |
| Finanzas | `ledger`, `money_account`, `category`, `transaction`, `subscription`, `receivable`, `payable` |
| Conocimiento | `note`, `note_version`, `graph_layout`, `course`, `assessment` |

`reminder` (vencimientos y renovaciones sueltas: dominios, certificados, fechas límite) cubre lo que en la F2 harán `domain`/`hosting`/`certificate`.

## Restricciones relevantes
- `project`: un proyecto `in_progress` exige `next_action` (CHECK).
- `transaction.amount > 0`; el signo lo da `kind` (`income`, `expense`, `transfer_in`, `transfer_out`).
- Únicos siempre con `workspace_id` (`quote.number`, `note.slug`, `tag.name`).
- `audit_log`: trigger que impide UPDATE/DELETE.

## Búsqueda
`f_unaccent()` (IMMUTABLE) y `f_search_norm()` = `lower(f_unaccent(x))`. Índices GIN `gin_trgm_ops` sobre `f_search_norm(...)` en clientes, contactos, proyectos, tareas, oportunidades, presupuestos, notas y materias; FTS `spanish` sobre el cuerpo de las notas.

## Migraciones
```bash
pnpm db:generate   # tras cambiar el esquema (genera SQL revisable)
pnpm db:migrate    # aplica
```
Nunca editar una migración ya aplicada en producción. Las destructivas requieren aprobación de Luciano (CLAUDE.md).

## Datos iniciales
- Al crear el dueño (`/setup`): espacios Agencia/Personal/Facultad, libros Agencia/Personal, categorías, 8 plantillas de proyecto y la plantilla de presupuesto base. **Sin datos de ejemplo.**
- Carga real de Luciano (clientes, proyectos y vencimientos del contexto A4/D9): `pnpm admin import-inicial` muestra el plan; `pnpm admin import-inicial --aplicar` lo ejecuta (idempotente).
