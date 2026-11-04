# ADR 0001 · Monolito modular en monorepo pnpm

**Estado:** aceptada · 04/11/2026

## Contexto
Una sola persona (con IA) mantiene el producto. docs/03 pide monolito modular: una app web + un worker.

## Decisión
- Monorepo pnpm con `apps/web` (Next.js 16), `apps/worker` (pg-boss) y paquetes `db`, `core`, `modules`, `ui`, `pdf`.
- **Diferencia con docs/05:** los módulos viven en **un solo paquete** `packages/modules/src/<modulo>/` (en vez de un paquete por módulo). Menos `package.json` y configuración repetida; la separación por carpetas y contratos se mantiene.
- Sin Turborepo: `pnpm -r` alcanza para este tamaño (una dependencia menos).

## Consecuencias
Se importa como `@agencyos/modules/<modulo>/service`. Si en la F6 se separa algo para vender, cada carpeta ya es autocontenida.
