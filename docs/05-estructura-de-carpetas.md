# 05 · Estructura de carpetas y convenciones de código

Repositorio: **`prod-agencyos`** (privado), según la convención de `15-repositorios.md`.

## 1. Árbol

```
prod-agencyos/
├─ CLAUDE.md                       ← reglas para Claude (ver 13-instrucciones-claude-code.md)
├─ README.md                       ← qué es, cómo levantarlo, cómo desplegar
├─ CHANGELOG.md                    ← generado desde Conventional Commits
├─ package.json · pnpm-workspace.yaml · turbo.json
├─ tsconfig.base.json · biome.json (lint + formato)
├─ .env.example                    ← todas las variables, documentadas, SIN valores reales
├─ .github/
│  ├─ workflows/ci.yml · deploy-staging.yml · deploy-prod.yml · backup-verify.yml
│  ├─ pull_request_template.md
│  └─ dependabot.yml
├─ docs/
│  ├─ 00-LEEME.md … 16-preguntas-abiertas.md   ← este paquete
│  ├─ contexto/AGENCYOS-CONTEXTO-DEFINITIVO.md
│  ├─ contexto/referencias/*.png
│  ├─ adr/0001-monolito-modular.md …           ← decisiones de arquitectura (una por archivo)
│  ├─ ESTADO.md                                 ← hecho / en curso / siguiente (lo actualiza Claude)
│  ├─ PENDIENTES-LUCIANO.md                     ← lo que tiene que hacer Luciano
│  └─ runbooks/ (deploy, rollback, restore-backup, rotar-secretos, alta-integracion)
├─ apps/
│  ├─ web/                         ← Next.js
│  │  ├─ app/
│  │  │  ├─ (auth)/login · 2fa · recuperar
│  │  │  ├─ (app)/layout.tsx       ← shell: sidebar, topbar, paleta, toasts
│  │  │  ├─ (app)/hoy · negocio · bandeja
│  │  │  ├─ (app)/crm/clientes · contactos · oportunidades
│  │  │  ├─ (app)/proyectos · tareas · plantillas
│  │  │  ├─ (app)/presupuestos · servicios
│  │  │  ├─ (app)/finanzas/{resumen,movimientos,por-cobrar,por-pagar,suscripciones,cuentas,reportes}
│  │  │  ├─ (app)/sitios · seo · biblioteca · repositorios
│  │  │  ├─ (app)/notas · cerebro · calendario · facultad
│  │  │  ├─ (app)/automatizaciones · ia
│  │  │  ├─ (app)/configuracion/{perfil,workspace,usuarios,roles,integraciones,modulos,datos,actividad,estado}
│  │  │  ├─ (portal)/p/[token]     ← enlace público de presupuesto [F2] / portal de cliente [F6]
│  │  │  ├─ api/auth/[...all]      ← Better Auth
│  │  │  ├─ api/webhooks/{github,brevo,in/[id]}
│  │  │  ├─ api/files/[id]         ← descarga firmada
│  │  │  ├─ api/health
│  │  │  └─ mcp/route.ts           ← servidor MCP (Streamable HTTP)
│  │  ├─ components/               ← composición específica de la app (nada genérico: eso va en packages/ui)
│  │  ├─ public/ (manifest, iconos PWA, sw.js)
│  │  └─ next.config.ts · middleware.ts (auth, cabeceras, CSP)
│  └─ worker/
│     ├─ src/index.ts              ← arranca pg-boss y registra los handlers de cada módulo
│     ├─ src/dispatcher.ts         ← outbox → cola
│     └─ Dockerfile                ← incluye Chromium (Playwright)
├─ packages/
│  ├─ db/          (schema/index.ts reexporta los esquemas de módulos · migrations/ · client.ts · seed/)
│  ├─ core/        (auth-context, permissions/, events/, errors.ts, money.ts, dates.ts, search.ts, crypto.ts, storage/)
│  ├─ ui/          (tokens.css, theme/, components/, charts/, layout/, icons.ts, empty-states/, skeletons/)
│  ├─ integrations/(github/, brevo/, google/, wordpress/, http.ts con retries/timeouts)
│  ├─ ai/          (providers.ts, router.ts, budget.ts, tools/registry.ts, agents/<key>/{prompt.md,agent.ts,evals.json}, tracing.ts)
│  ├─ pdf/         (render.ts con Playwright, templates/ quote · receipt · seo-report · brief)
│  └─ modules/
│     ├─ crm/        { schema.ts, service.ts, queries.ts, validators.ts, events.ts, jobs.ts, mcp.ts, ui/ }
│     ├─ projects/   { … igual … }
│     ├─ quotes/ · finance/ · repos/ · sites/ · seo/ · library/ · automations/ · knowledge/ · study/ · inbox/ · dashboard/ · settings/
├─ infra/
│  ├─ docker-compose.yml (prod + staging, perfiles) · Caddyfile
│  ├─ scripts/ (deploy.sh, rollback.sh, backup.sh, restore-test.sh, harden-vps.sh)
│  └─ rclone/ (plantilla de configuración, sin secretos)
└─ tests/
   ├─ e2e/ (por módulo; proyectos Playwright: mobile-390, desktop-1440, dark, light)
   ├─ visual/ (snapshots aprobados)
   └─ fixtures/ (datos SOLO de test; GitHub/Google/Brevo grabados)
```

## 2. Convenciones de código

- **TypeScript estricto** (`strict`, `noUncheckedIndexedAccess`). Sin `any`.
- **Biome** para lint y formato.
- **Nombres:** código en inglés; textos de UI en español a través de `packages/ui/i18n/es-AR.ts` (preparado para otros idiomas).
- **Módulos:** la UI nunca toca la base de datos; las Server Actions llaman a `service.ts`. Cada función de `service.ts`:
  1. valida con Zod;
  2. verifica permisos (`can(ctx, action, resource)`);
  3. ejecuta en una transacción;
  4. inserta `domain_event`;
  5. devuelve un resultado tipado (`Result<T, DomainError>`).
- **Errores:** clases tipadas (`NotFound`, `Forbidden`, `Validation`, `Conflict`, `ExternalServiceError`, `BudgetExceeded`). La UI los traduce a mensajes claros y nunca muestra stack traces.
- **Commits:** Conventional Commits en español (`feat(crm): pipeline de oportunidades`). Ramas `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- **ADR:** toda decisión técnica nueva o cualquier cambio a este paquete genera `docs/adr/NNNN-titulo.md`.
- **Dependencias:** antes de agregar una, justificarla en el PR (tamaño, mantenimiento, licencia). Preferir la plataforma y lo que ya está.
- **Feature flags:** `workspace.enabled_modules` controla la visibilidad de módulos; no hay módulos a medio terminar visibles.
