# Checklist de seguridad (docs/08)

Estado verificado leyendo el código del repo y probando la infraestructura en local el **2026-11-04** (base: commit `b367f20` + infra de este cambio).

- `[x]` = implementado y verificado (se indica dónde/cómo).
- `[ ]` = falta, está parcial o depende de aplicarlo en el VPS (con nota).

Actualizar este archivo cada vez que se cierre un ítem.

## 2. Autenticación

- [x] Contraseña mínima de 12 caracteres (máx. 128) — `packages/modules/src/auth/server.ts` (`minPasswordLength: 12`).
- [x] Verificación contra contraseñas filtradas (HIBP, k-anonymity) — plugin `haveIBeenPwned` en `auth/server.ts`; solo se apaga con `AUTH_HIBP=off` (tests).
- [x] Hash de contraseñas del adaptador (scrypt de Better Auth) — sin hash propio.
- [x] 2FA TOTP obligatorio — `apps/web/lib/session.ts` redirige a `/seguridad/2fa` si `twoFactorEnabled` es falso.
- [x] 10 códigos de respaldo — `twoFactor({ backupCodeOptions: { amount: 10 } })`.
- [x] Cookies `HttpOnly` y `SameSite=Lax` — defaults de Better Auth 1.7.17 (`dist/cookies/index.mjs`: `httpOnly: true`, `sameSite: "lax"`).
- [x] Cookies `Secure` en producción — `advanced.useSecureCookies` = `APP_URL` empieza con `https://` (first-setup.sh genera `APP_URL=https://…`).
- [x] Sesiones de 30 días con renovación diaria — `session.expiresIn` / `updateAge`.
- [x] Rate limiting de login por IP: 5 intentos / 15 min; 2FA 10 / 15 min; códigos de respaldo 5 / 15 min; recuperación 3 / 15 min — `rateLimit.customRules` (almacenado en la base).
- [x] La IP del rate limiting no se puede falsificar — Caddy (sin `trusted_proxies`) reescribe `X-Forwarded-For` con la IP real (`infra/Caddyfile`); la app lo lee (`ipAddressHeaders`).
- [ ] Rate limiting **por cuenta**, bloqueo progresivo y aviso por email — no implementado (solo por IP).
- [x] Recuperación con enlace de 15 minutos y revocación de sesiones — `resetPasswordTokenExpiresIn: 900`, `revokeSessionsOnPasswordReset`.
- [ ] Recuperación que además exija TOTP — no verificado en el código.
- [ ] Reautenticación con 2FA para acciones críticas (exportar, cambiar email/contraseña, tokens MCP, datos fiscales) — no implementado todavía.
- [ ] Alertas de inicio de sesión nuevo — no implementado.
- [x] `/setup` protegido por `SETUP_TOKEN` con comparación en tiempo constante — `apps/web/app/(auth)/setup/actions.ts` (`timingSafeEqual`); `first-setup.sh` genera un token por entorno.
- [x] Registro público deshabilitado — `emailAndPassword.disableSignUp: true`.

## 3. Autorización

- [x] Políticas centralizadas `can/assertCan` — `packages/core/src/permissions.ts`.
- [x] `assertCan` en los services con escrituras — `projects`, `tasks`, `inbox`, `spaces`, `today`, `trash` (`purgeOne`). `search` es de solo lectura y filtra por `workspace_id`; `setup` corre antes de que exista un usuario.
- [x] Scoping por workspace — helper `scoped(tabla, ctx)` en `packages/modules/src/shared/db.ts` (también excluye papelera/archivados); `search/service.ts` filtra `workspace_id` en cada consulta SQL.
- [ ] Test de aislamiento multi-inquilino **en cada service** — existe para proyectos (`tests/integration/projects.test.ts`, "aislamiento multi-inquilino"); falta generalizarlo al resto.
- [ ] Matriz de permisos rol × acción testeada con `it.each` — no encontrada.
- [ ] Rol de máquina + alcances para MCP/agentes — pendiente (MCP no implementado).

## 4. Protección de datos

- [x] HTTPS automático (Let's Encrypt) — `infra/Caddyfile` (validado con `caddy validate`).
- [x] HSTS 2 años con subdominios — Caddy (`Strict-Transport-Security "max-age=63072000; includeSubDomains"`). `apps/web/proxy.ts` también lo agrega cuando ve `https:` directo.
- [ ] Cifrado de sobre de secretos de integración con `APP_ENCRYPTION_KEY` — la variable existe y se genera (first-setup.sh), pero ningún código la usa todavía (no hay integraciones con tokens).
- [x] Credenciales humanas solo como referencias a Bitwarden — no hay tablas ni campos de contraseñas de terceros en el esquema actual.
- [ ] Datos fiscales ocultos con reautenticación + auditoría — pendiente (módulo CRM).
- [x] Backups cifrados antes de salir del VPS — `infra/scripts/backup.sh` → rclone crypt; probado en local con un crypt sobre disco (nombres y contenido ilegibles sin la contraseña).
- [ ] Redacción automática de secretos/PII en logs (pino) — no hay logger estructurado todavía.
- [x] Papelera con purga a los 30 días — `purgeTrash(olderThanDays = 30)` en `trash/service.ts` (el job que la invoca depende del worker).
- [ ] Exportación y borrado total del workspace — pendiente.

## 5. Aplicación web

- [x] Validación con Zod en el servidor — cada service parsea con Zod (`packages/core/src/validation.ts`).
- [x] CSRF en Server Actions (comparación de origen de Next.js) + `trustedOrigins: [APP_URL]` en Better Auth.
- [x] CSP estricta con nonce, sin `unsafe-inline` en scripts, `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` — `apps/web/proxy.ts`; verificado con `curl -I` contra la imagen Docker.
- [ ] `style-src` sin `'unsafe-inline'` — hoy permite estilos inline (necesario para estilos dinámicos); revisar si se puede pasar a nonce.
- [x] `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima, `X-Frame-Options: DENY` — `apps/web/next.config.ts` y Caddy.
- [x] Markdown con sanitizador de lista blanca — `apps/web/lib/markdown.ts` (`sanitize-html`, esquemas http/https/mailto, enlaces externos con `noopener noreferrer nofollow`).
- [ ] Subida de archivos (magic bytes, tamaño, URL firmada de 5 min) — no implementado (Caddy limita el cuerpo a 25 MB).
- [ ] Webhooks entrantes con HMAC y anti-replay — no implementados.
- [x] Dependabot semanal agrupado (npm, GitHub Actions, Docker, docker-compose) — `.github/dependabot.yml`.
- [x] `pnpm audit` en la CI — `ci.yml` + `infra/scripts/ci/audit-gate.mjs` (bloquea HIGH/CRITICAL con fix; ver docs/TESTING.md).
- [x] gitleaks en la CI — `ci.yml` (acción oficial) con `.gitleaks.toml`; `gitleaks dir` 8.30.1 sobre el repo: sin hallazgos.
- [ ] gitleaks en pre-commit — no hay hook configurado (opcional en las máquinas de desarrollo).
- [x] `.env*` ignorados salvo `.env.example` — `.gitignore` raíz + `infra/.gitignore` (estado de deploy, rclone.conf).

## 6. Crawler SEO (anti-SSRF)

- [ ] Todo el punto 6 — el crawler no existe todavía. Nota de infra: el worker sale a internet por la red `edge`; las bases están en redes `internal`, así que un SSRF no llega a Postgres por red Docker (sí a `web`/`caddy`: la validación de destino sigue siendo obligatoria).

## 7. IA

- [ ] Todo el punto 7 — agentes de IA no implementados (F5).

## 8. Infraestructura

- [ ] Usuario no root con sudo, SSH solo con clave ed25519, sin root login, UFW 22/80/443, fail2ban, unattended-upgrades, NTP — **script listo** (`infra/scripts/harden-vps.sh`: `bash -n` + shellcheck OK; valida `sshd -t` antes de recargar). Falta correrlo en el VPS real.
- [x] La base no publica puertos — `infra/docker-compose.yml` sin `ports` en `postgres*`; verificado en local (`docker ps`: solo Caddy publica 80/443).
- [x] Redes internas — `db-prod` y `db-stg` con `internal: true`; staging no ve la base de producción y viceversa.
- [x] Contenedores sin root — web y worker corren como `node` (uid 1000), código de la app de solo lectura (verificado: `touch /app/x` → Permission denied); `cap_drop: ALL` en web/worker/caddy (Caddy solo con `NET_BIND_SERVICE`); `no-new-privileges` en todos.
- [x] Límites de memoria por contenedor — `deploy.resources.limits.memory` en cada servicio (techo total ≈ 6,3 GB de 8 GB, más 4 GB de swap del host para los builds).
- [x] Staging y producción con bases, volúmenes y secretos separados — `.env.prod` / `.env.staging` generados por separado (first-setup.sh), volúmenes `agencyos_pgdata` / `agencyos_pgdata_stg`, `agencyos_files` / `agencyos_files_stg`.
- [x] Secretos con permisos 600 y fuera de git — first-setup.sh (`umask 077` + `chmod 600`), `deploy.sh` se niega a correr si el archivo tiene otros permisos.
- [x] Clave SSH de CI restringida (`command=` + `no-pty`, sin forwarding) — `infra/scripts/ci-ssh-gate.sh` solo acepta `deploy staging <sha40>`, `deploy prod vX.Y.Z`, `rollback`, `restore-test`, `backup-status`.
- [x] Producción solo desde tags `vX.Y.Z` contenidos en `main` y con aprobación manual — `deploy.sh` + `deploy-prod.yml` (`environment: production`). **Falta** configurar los *required reviewers* en GitHub (docs/DEPLOYMENT.md §6).
- [x] Backup previo automático y rollback a la imagen anterior si falla el health check — `deploy.sh`; rollback probado en local (`rollback.sh`).
- [x] Restauración de backups probada automáticamente — `restore-test.sh` (cron día 1 + `backup-verify.yml` día 15); probado en local de punta a punta (backup → crypt → descarga → Postgres 17 efímero sin red → conteo de filas).
- [ ] Backups en el VPS real con rclone configurado — depende del VPS y de la cuenta de Google (docs/DEPLOYMENT.md §9).
- [ ] Acciones de GitHub fijadas por SHA — hoy por versión mayor (`@v4`); Dependabot las mantiene. Fijar por SHA es una mejora futura.

## 9. Auditoría (`audit_log`)

- [x] Solo inserción — trigger `audit_log_no_update` (`BEFORE UPDATE OR DELETE` → excepción) en `packages/db/migrations/0001_busqueda_y_auditoria.sql`.
- [x] Se registra: alta del dueño (`setup.owner_created`), purga de papelera (`trash.purged`, `entity.purged`), backups completos (`backup.completed`, desde `backup.sh`).
- [ ] Login/logout/fallos de login, cambios de 2FA y contraseña, tokens, exportaciones, roles, planes de GitHub, aprobaciones, envíos a clientes, integraciones — no se auditan todavía.
- [ ] Vista en Configuración → Actividad con filtros y CSV — pendiente.

## 10. Respuesta a incidentes

- [x] Runbook — `docs/runbooks/incidente.md` (+ `rotar-secretos.md`, `restore-backup.md`, `rollback.md`).
- [ ] Botón "revocar sesiones y tokens" en Configuración → Seguridad — pendiente (el runbook incluye el comando SQL alternativo).

## Hallazgo abierto (bloquea producción)

- [ ] **Migración `0001` falla en PostgreSQL 17** (la versión de producción y de la CI): `f_search_norm` llama a `f_unaccent` sin esquema y PG17 usa un `search_path` seguro al crear índices → `function f_unaccent(text) does not exist`. Reproducido con `postgres:17-bookworm`; en `postgres:16` migra bien. Arreglo: `SELECT lower(public.f_unaccent($1))` en `f_search_norm` (verificado en PG17). Afecta también la restauración de dumps.
