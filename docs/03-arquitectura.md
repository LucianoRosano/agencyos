# 03 · Arquitectura técnica

## 1. Decisiones (resumen ejecutivo)

| Tema | Decisión | Motivo principal |
|---|---|---|
| Forma | **Monolito modular** en un monorepo `pnpm`: una app web + un worker | Una sola persona (con IA) mantiene; los módulos se separan por carpetas y contratos, no por servicios |
| Lenguaje | **TypeScript** estricto en todo | Un solo lenguaje, tipos de punta a punta, Claude lo maneja muy bien |
| Web | **Next.js (App Router)** + React Server Components + Server Actions | Render en el servidor (rápido en celulares), sin API separada para la UI |
| UI | **Tailwind CSS + shadcn/ui** (Radix) adaptados al design system propio · **Lucide** | Accesible, consistente y sin componentes "al azar" (todo pasa por `packages/ui`) |
| Tablas | **TanStack Table** | Filtros, orden y vistas guardadas con buen rendimiento |
| Formularios | **React Hook Form + Zod** (los mismos esquemas Zod validan en el servidor) | Una sola fuente de validación |
| Base de datos | **PostgreSQL** (última versión estable, ≥ 17) autoalojado | Robusto, gratis; FTS en español, `pg_trgm`, `unaccent`, JSONB |
| ORM / migraciones | **Drizzle ORM + drizzle-kit** | SQL legible, tipado, migraciones revisables |
| Auth | **Better Auth** (plugins: `twoFactor`, `admin`, `organization`, `apiKey`; `passkey` en la F4) | Biblioteca autoalojada y probada; evita escribir auth propia; TOTP y roles listos |
| Jobs / colas | **pg-boss** (cola sobre PostgreSQL) en el worker | Sin Redis: un servicio menos; reintentos, cron y deduplicación |
| PDFs y capturas | **Playwright + Chromium** en el worker | Mismo pipeline que Luciano ya usa; PDFs vectoriales prolijos |
| Email | **Brevo** (API transaccional) | Elegido por Luciano; plan gratuito para empezar |
| Push | **Web Push** (VAPID) desde la PWA | Gratis; funciona en el celular instalado |
| Archivos | Interfaz `StorageAdapter`: **disco local** del VPS en la v1; compatible con S3 (R2/B2) después | Costo cero hoy, sin reescritura mañana |
| IA | **AI SDK de Vercel (`ai`)** con proveedores intercambiables (Anthropic por defecto; OpenAI, Google y Ollama opcionales) | Sin depender de un único proveedor; tool calling uniforme |
| MCP | Servidor MCP propio (**SDK oficial de MCP en TypeScript**) dentro de la app web (Streamable HTTP) | Claude opera AGENCYOS sin costo de API |
| Grafo | **Sigma.js + graphology** (WebGL), layout ForceAtlas2 en Web Worker | Miles de nodos fluidos |
| Editor de notas | **CodeMirror 6** + vista previa en vivo de Markdown | Paridad con Obsidian; Markdown real |
| Gráficos | **Componentes SVG propios** (barras, líneas, sparklines, donut) en `packages/ui/charts` | Cero dependencias pesadas para KPIs simples |
| Tests | **Vitest** (unit/integración) + **Playwright** (e2e, visual, a11y con axe) | Ver `09-testing.md` |
| Infra | **VPS Hostinger KVM 2** (São Paulo) + **Docker Compose** + **Caddy** | US$ 8,99/mes con 24 meses; renueva a US$ 14,99: dentro del presupuesto |
| CI/CD | **GitHub Actions** → deploy por SSH al VPS | Luciano nunca sube nada a mano |
| Backups | `pg_dump` + archivos → **rclone (crypt) a Google Drive** de Luciano | Gratis, cifrado y fuera del servidor |

### Supabase: evaluado y descartado para la v1
- El plan gratuito **pausa el proyecto tras 7 días sin actividad** y tiene límites chicos (500 MB de base). El Pro cuesta desde **US$ 25/mes más cómputo**: excede el presupuesto.
- Autoalojar Supabase en el VPS suma muchos contenedores y mantenimiento para resolver cosas que ya cubren PostgreSQL + Better Auth + `StorageAdapter`.
- Como se usa **PostgreSQL estándar** y Drizzle, migrar a un Postgres gestionado (incluido Supabase) más adelante es un cambio de `DATABASE_URL` y de almacenamiento, no una reescritura.

### Plan Business de Hostinger: no se usa para AGENCYOS
Admite apps Node.js, pero:
- las apaga tras un rato sin tráfico;
- ofrece MySQL, no PostgreSQL;
- no permite un worker persistente ni Chromium;
- comparte recursos con los sitios de los clientes.

Se mantiene **solo** para los sitios WordPress.

## 2. Vista de componentes

```
                ┌──────────────────────────────────────────────┐
 Navegador/PWA ─┤  Caddy (HTTPS, compresión, cabeceras)        │
 (celular y PC) └───────────────┬──────────────────────────────┘
                                │
                ┌───────────────▼────────────────┐       ┌──────────────────────────┐
                │ apps/web (Next.js)             │       │ apps/worker (Node)        │
                │ - UI (RSC + Server Actions)    │       │ - pg-boss: jobs y cron    │
                │ - Route handlers: /api/*       │◄─────►│ - Crawler SEO             │
                │ - Webhooks entrantes           │ cola  │ - PDFs/capturas Chromium  │
                │ - Servidor MCP (/mcp)          │ (PG)  │ - Agentes IA (runs)       │
                │ - Auth (Better Auth)           │       │ - Sync GitHub, chequeos   │
                └───────────────┬────────────────┘       └────────────┬─────────────┘
                                │                                     │
                        ┌───────▼─────────────────────────────────────▼───────┐
                        │ PostgreSQL (datos + cola pg-boss + FTS)             │
                        └──────────────────────────────────────────────────────┘
                        Volumen /data/files (StorageAdapter)   rclone → Google Drive (backups cifrados)

 Externos: GitHub App · Brevo · Google (PSI, CrUX, Search Console) · Proveedores IA · WordPress REST de clientes
```

## 3. Capas dentro del monolito

Regla de dependencias: **`app` (UI/rutas) → `modules/*` (casos de uso) → `core` (dominio común) → `db`**. Nunca al revés.

- **`packages/db`**: esquema Drizzle, migraciones, cliente y helpers de transacción. Sin lógica de negocio.
- **`packages/core`**: tipos de dominio compartidos, errores tipados, permisos (políticas), validaciones Zod comunes, **bus de eventos de dominio** (outbox), utilidades de dinero, fechas (TZ Argentina) y búsqueda.
- **`packages/modules/<modulo>`**: cada módulo expone:
  - `schema.ts` (tablas Drizzle del módulo, reexportadas por `db`);
  - `service.ts` (casos de uso: funciones puras + transacciones, **siempre verifican permisos**);
  - `events.ts` (eventos que emite);
  - `validators.ts` (Zod);
  - `queries.ts` (lecturas optimizadas);
  - `jobs.ts` (si tiene jobs);
  - `mcp.ts` (herramientas MCP que publica);
  - `ui/` (componentes específicos).
- **`packages/integrations`**: clientes tipados de GitHub, Brevo, Google, WordPress y proveedores de IA, con reintentos, timeouts y mapeo de errores.
- **`packages/ai`**: registro de agentes, registro de herramientas, router de modelos, presupuesto y trazas (ver `14-agentes-ia.md`).
- **`packages/ui`**: design system (tokens, componentes, gráficos SVG, layout).
- **`apps/web`**: rutas, layouts y composición de UI. **Las Server Actions solo llaman a `service.ts`.**
- **`apps/worker`**: registra los handlers de jobs de cada módulo y ejecuta.

### Contratos entre módulos
- Un módulo **no importa tablas de otro**. Usa el `service` o las `queries` públicas del otro módulo, o reacciona a sus **eventos**.
- **Outbox de eventos:** cada caso de uso que cambia estado inserta un `domain_event` en la misma transacción. Un dispatcher en el worker los publica en pg-boss. Los consumidores son actividad, notificaciones, automatizaciones, Cerebro (enlaces) y agentes. Así se garantiza **no perder eventos** y la idempotencia.

## 4. Catálogo inicial de eventos de dominio

`cliente.*`, `contacto.*`, `interaccion.registrada`, `oportunidad.*`, `proyecto.*`, `tarea.*`, `entrega.*`, `presupuesto.*`, `movimiento.registrado`, `cobro.*`, `pago.*`, `suscripcion.por_vencer`, `sitio.*`, `dominio.por_vencer`, `ssl.por_vencer`, `revision.*`, `recurso.*`, `nota.*`, `repo.*` (`repo.sincronizado`, `repo.fuera_de_estandar`, `repo.push`, `repo.pr_abierto`, `repo.release_publicado`), `auditoria.*`, `automatizacion.*`, `agente.run_*`, `aprobacion.*`.

Formato: `{ id, workspaceId, type, entityType, entityId, actor: {type: user|agent|system, id}, payload, occurredAt }`.

## 5. Datos y rendimiento

- **IDs:** UUIDv7 (ordenables por tiempo).
- **Dinero:** `numeric(14,2)` + `currency char(3)`; nunca `float`. Las operaciones se hacen en `packages/core/money`.
- **Fechas:** `timestamptz` en la base; se presentan en `America/Buenos_Aires`. Las fechas "de calendario" (vencimientos) son `date`.
- **Multi-inquilino:** `workspace_id` en todas las tablas; toda consulta pasa por el helper `scoped(workspaceId)`. Los tests verifican el aislamiento.
- **Búsqueda:** columna `search_vector` (`tsvector`, configuración `spanish` + `unaccent`) en las entidades buscables + índice GIN; `pg_trgm` para nombres cortos.
- **Paginación:** keyset (cursor) en listas; listas virtualizadas en la UI cuando hay más de 200 filas.
- **Caché:** RSC con revalidación por etiqueta (`revalidateTag`) disparada por eventos; sin capa extra de caché en la v1.
- **Presupuesto de rendimiento:** JS inicial < 170 KB gzip por ruta (excepto Cerebro, que carga su bundle WebGL de forma diferida); LCP < 1,5 s en "Hoy" (celular medio, 4G); interacción < 100 ms con actualización optimista.

## 6. Integraciones (cómo se conectan)

| Integración | Mecanismo | Datos guardados |
|---|---|---|
| GitHub | **GitHub App** propia instalada en la cuenta de Luciano. Permisos: metadata (lectura), contents (lectura/escritura **solo** cuando se aprueba un cambio), administration (escritura, para topics, descripción y archivado), pull requests y issues (lectura/escritura), webhooks | ID de instalación; claves de la App en variables de entorno |
| Brevo | API key | Token de integración cifrado |
| Google PSI/CrUX | API key gratuita (no requiere facturación) | Token de integración cifrado |
| Google Search Console | OAuth 2.0 (scope de solo lectura) [F5] | Refresh token cifrado |
| WordPress (clientes) | REST API + Application Password por sitio [F4] | Token de integración cifrado por sitio |
| Proveedores de IA | API keys por proveedor | Cifradas; presupuesto mensual por proveedor y agente |
| Webhooks salientes | HTTP POST con firma HMAC-SHA256 | Secreto por webhook |

**Credenciales humanas** (logins de paneles, hosting, ARCA, etc.) **nunca** se guardan: solo la referencia a Bitwarden. **Tokens de integración de máquina** sí se guardan, cifrados (ver `08-seguridad.md`).

## 7. Infraestructura y despliegue

### Servidor
- **Hostinger VPS KVM 2**: 2 vCPU, 8 GB RAM, 100 GB NVMe, datacenter **São Paulo**, Ubuntu LTS.
- **Contenedores (Docker Compose):** `caddy`, `web` (prod), `worker` (prod), `postgres` (prod), y los equivalentes de **staging** (`web-stg`, `worker-stg`, `postgres-stg`) con límites de memoria.
- **Dominio:** se compra al publicar (ver `16-preguntas-abiertas.md`). Hasta entonces, staging puede servirse con el hostname del VPS para pruebas internas, siempre detrás de autenticación.

### CI/CD (GitHub Actions)
1. **PR:** lint, typecheck, unit, integración (Postgres de servicio), e2e (Playwright contra un build), axe, escaneo de secretos (gitleaks) y auditoría de dependencias.
2. **Merge a `main`:** deploy automático a **staging**: SSH al VPS → `git fetch` del tag/commit → `docker compose build` → `drizzle-kit migrate` (staging) → `up -d` → health check → smoke e2e.
3. **Producción:** se crea un **tag `vX.Y.Z`** (Claude lo propone y Luciano lo aprueba) → mismo flujo sobre prod, con **backup previo automático** y **rollback** a la imagen anterior si falla el health check.

### Operación
- **Backups:** dump diario 03:00 ART + archivos; retención de 7 diarios, 4 semanales y 6 mensuales; cifrado con rclone crypt; **prueba de restauración mensual automática** en un contenedor efímero, con resultado en "Hoy".
- **Observabilidad:**
  - logs estructurados JSON (pino) con rotación;
  - endpoint `/health`;
  - página **Estado del sistema** en Configuración (versión, jobs fallidos, cola, espacio en disco, último backup, cuotas de APIs);
  - alertas de errores a "Hoy" y push;
  - sin servicios pagos de monitoreo.
- **Hardening del VPS:**
  - usuario sin root;
  - SSH solo con clave;
  - UFW (solo 22, 80 y 443);
  - fail2ban;
  - actualizaciones de seguridad automáticas (`unattended-upgrades`);
  - Docker sin puertos de la base expuestos.

## 8. Costos mensuales estimados

| Ítem | Costo |
|---|---|
| VPS KVM 2 | US$ 8,99 (24 meses por adelantado; renueva a US$ 14,99) + impuestos argentinos |
| Dominio | Al publicar. Opción gratuita a verificar: dominio incluido en el GitHub Student Developer Pack |
| GitHub | Gratis (GitHub Pro **gratis con el Student Developer Pack**, ver `15-repositorios.md`) |
| Brevo | Plan gratuito |
| Google PSI/CrUX | Gratis |
| Backups (Google Drive) | Gratis (dentro de su cuota) |
| IA vía MCP con su suscripción de Claude | US$ 0 adicional |
| IA vía API (agentes internos, F5) | Variable, **con tope mensual configurable** (sugerido: US$ 5–10 al inicio; decide Luciano) |
