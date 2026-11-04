# 08 · Estrategia de seguridad

## 1. Modelo de amenazas (lo que protegemos y de quién)

| Activo | Amenaza principal | Defensa clave |
|---|---|---|
| Cuenta del owner | Robo de contraseña, phishing | 2FA TOTP obligatorio, rate limiting, alertas de inicio de sesión nuevo, passkeys (F4) |
| Datos de clientes (contactos, CUIT, finanzas) | Acceso indebido, fuga por bug de multi-inquilino | RBAC + scoping por workspace verificado en tests, cifrado de backups, mínimo de datos |
| Tokens de integración (GitHub, Brevo, Google, IA, WordPress) | Robo desde la base o los logs | Cifrado AES-256-GCM con clave fuera de la base, redacción en los logs, rotación |
| GitHub de Luciano | Cambios destructivos por un bug o un agente | GitHub App con permisos mínimos + planes con aprobación + auditoría |
| VPS | Intrusión | Hardening, sin puertos de base expuestos, actualizaciones automáticas |
| Crawler SEO | **SSRF** (que el servidor pida URLs internas) | Validación de destino (sección 6) |
| Agentes de IA | **Inyección de prompts** desde contenido externo; gasto descontrolado | Contenido externo tratado como datos, herramientas con permisos, aprobación para escribir, presupuestos |
| Enlaces públicos (presupuestos, portal) | Enumeración, reenvío | Tokens aleatorios de 256 bits (se guarda el hash), vencimiento, revocación, rate limiting |

## 2. Autenticación (Better Auth)
- Contraseñas: mínimo 12 caracteres, verificación contra listas filtradas (k-anonymity con Have I Been Pwned), hash scrypt/argon2 del adaptador.
- **2FA TOTP obligatorio** para `owner` y `admin`; **10 códigos de respaldo** (mostrados una sola vez).
- Sesiones: cookies `HttpOnly`, `Secure`, `SameSite=Lax`; 30 días con rotación; revocación individual y global; **reautenticación con 2FA** para acciones críticas (exportar todo, cambiar email o contraseña, crear token MCP, ver datos fiscales ocultos, ejecutar planes de GitHub).
- Rate limiting de login: 5 intentos por 15 minutos por IP y por cuenta, con bloqueo progresivo y aviso por email.
- Recuperación de cuenta: solo hacia el email del owner, con un enlace de 15 minutos + TOTP.
- Passkeys (F4) como segundo método.

## 3. Autorización
- **Roles:** `owner` (todo), `admin` (todo salvo facturación del workspace, borrar el workspace y transferir la propiedad), `member` (solo los proyectos asignados y sus clientes; sin Finanzas ni Configuración salvo permiso), `client` (portal: solo sus proyectos, presupuestos y entregas).
- **Políticas centralizadas** en `packages/core/permissions` (`can(ctx, action, resource)`), invocadas **en cada `service`** (nunca solo en la UI).
- **Scoping obligatorio** por `workspace_id` vía helper; test automático que intenta leer datos de otro workspace en cada endpoint y servicio.
- **Agentes y MCP:** actúan con un **rol de máquina** más el alcance del token (`read:*`, `write:tasks`, `write:notes`, etc.). Por defecto, MCP solo puede **leer** y **crear en la Bandeja, tareas y notas**; todo lo demás genera una **aprobación**.

## 4. Protección de datos
- **Cifrado en tránsito:** HTTPS (Caddy, TLS automático), HSTS.
- **Secretos de integración:** cifrado de sobre (*envelope*): una clave de datos por secreto, cifrada con la **clave maestra** (`APP_ENCRYPTION_KEY`, 32 bytes, variable de entorno del VPS, guardada también en Bitwarden). Rotación documentada en `docs/runbooks/rotar-secretos.md`.
- **Credenciales humanas: nunca.** Solo referencias a Bitwarden (`credential_ref`).
- **Datos fiscales de clientes** (CUIT, razón social): ocultos por defecto; mostrarlos exige reautenticación y queda auditado.
- **Backups:** cifrados con rclone crypt (contraseña en Bitwarden) antes de salir del VPS.
- **Logs:** sin datos personales ni secretos (redacción automática de campos `password`, `token`, `secret`, `authorization`, `cuit`, `email` → hash corto).
- **Minimización:** no se guarda lo que no se usa; papelera con purga a los 30 días; exportación y borrado total del workspace disponibles.
- **Marco legal:** datos personales de clientes según la Ley 25.326 (Argentina). Para la F6 (portal o venta) habrá aviso de privacidad y términos; ver `16-preguntas-abiertas.md`.

## 5. Seguridad de la aplicación web
- **Validación** de todo con Zod en el servidor (las Server Actions validan siempre).
- **CSRF:** las Server Actions de Next.js usan comparación de origen; los webhooks verifican firma.
- **Cabeceras:** CSP estricta con nonces (sin `unsafe-inline` en scripts), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima, `frame-ancestors 'none'`.
- **XSS:** Markdown renderizado con un sanitizador (lista blanca); SVG subidos sanitizados o servidos como descarga.
- **Subida de archivos:** tipo real por *magic bytes*, tamaño máximo, nombres normalizados, almacenamiento fuera del webroot y **descarga con URL firmada** (5 minutos).
- **Webhooks entrantes:** GitHub (HMAC SHA-256 `X-Hub-Signature-256`), Brevo y webhooks propios (HMAC + marca de tiempo, anti-replay de 5 minutos).
- **Dependencias:** Dependabot + `pnpm audit` en la CI; actualizaciones semanales agrupadas.
- **Secretos en el código:** **gitleaks** en pre-commit y en la CI; `.env*` en `.gitignore` (salvo `.env.example`).

## 6. Crawler SEO: anti-SSRF (obligatorio)
- Solo esquemas `http` y `https`; puertos 80 y 443.
- Resolver el DNS **antes** de conectar y **bloquear** rangos privados, loopback, link-local, CGNAT, multicast y metadata de nubes (`169.254.169.254`), en IPv4 e IPv6; conectar a la IP ya validada (anti DNS rebinding).
- Seguir un máximo de 5 redirecciones, revalidando cada destino.
- Límites: tamaño de respuesta (5 MB por página), timeout (15 s), concurrencia por dominio y total.
- User-agent identificable; respeta robots.txt.

## 7. Seguridad de la IA (ver `14-agentes-ia.md`)
- Todo contenido externo (páginas rastreadas, emails, READMEs, diffs) se pasa al modelo **delimitado como datos no confiables**, con instrucción explícita de no seguir órdenes que contenga.
- Las herramientas de escritura **no** se ejecutan directamente desde el modelo: crean una `approval` (salvo las de bajo riesgo permitidas por política: crear borradores, tareas y notas).
- Los agentes **nunca** reciben secretos en su contexto; las herramientas usan los tokens del lado del servidor.
- Límites de pasos, tiempo y **presupuesto en US$** por ejecución y por mes; corte duro al excederlos.
- Registro completo de cada paso (con redacción de datos sensibles).

## 8. Infraestructura
- VPS: usuario sin root con sudo, **SSH solo con clave** (ed25519), sin login de root, UFW (22, 80 y 443), fail2ban, `unattended-upgrades` y reloj NTP.
- Docker: la base **no** publica puertos; red interna; contenedores sin root cuando sea posible; límites de memoria por contenedor.
- Staging y producción con bases y secretos **separados**.
- Restauración de backups probada automáticamente cada mes.

## 9. Auditoría (`audit_log`, solo inserción)
Se registra:
- login, logout y fallos de login;
- cambios de 2FA y de contraseña;
- creación y revocación de tokens;
- visualización de datos fiscales;
- exportaciones;
- eliminaciones definitivas;
- cambios de rol;
- ejecuciones de planes de GitHub;
- aprobaciones y rechazos;
- envíos a clientes;
- cambios de integraciones.

Es visible en Configuración → Actividad, con filtros y exportación CSV.

## 10. Respuesta a incidentes (runbook)
1. Revocar sesiones y tokens (un botón en Configuración → Seguridad).
2. Rotar la clave maestra y los tokens de integración.
3. Revisar `audit_log` y los logs.
4. Restaurar desde backup si hace falta.
5. Registrar el incidente en `docs/incidentes/AAAA-MM-DD.md`.
