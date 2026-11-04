# ADR 0003 · Better Auth con 2FA obligatorio

**Estado:** aceptada · 04/11/2026

- Better Auth 1.7 con adaptador Drizzle, `twoFactor` (TOTP + 10 códigos de respaldo), `haveIBeenPwned` (desactivable con `AUTH_HIBP=off` en tests), `nextCookies`.
- Registro público desactivado. El dueño se crea en `/setup` (una sola vez; en producción exige `SETUP_TOKEN`).
- 2FA obligatorio: `requireCtx()` redirige a `/seguridad/2fa` si no está activo.
- Rate limiting en base de datos: login 5/15 min, TOTP 10/15 min.
- Reautenticación con contraseña para crear tokens MCP y exportar todo (`modules/auth/reauth.ts`).
- **Diferencia con docs/08:** los tokens MCP no usan el plugin `apiKey` de Better Auth sino una tabla propia `mcp_token` (hash SHA-256, alcances, vencimiento, revocación): más simple y con los alcances de docs/14.
- Recuperación de contraseña: por email (Brevo) cuando esté configurado; mientras tanto, `pnpm admin reset-password <email>` en el servidor.
