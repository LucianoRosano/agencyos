import { validation } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, isPasswordCompromised, magicLink, twoFactor } from "better-auth/plugins";
import { sendEmail } from "../shared/email";

export const PWNED_MESSAGE = "Esa contraseña apareció en filtraciones públicas. Elegí otra.";

/**
 * Control de contraseñas filtradas (Have I Been Pwned, k-anonimato: solo viajan 5 caracteres del SHA-1)
 * para las cuentas que se crean por fuera de los endpoints de Better Auth (invitación, /setup).
 * Respeta AUTH_HIBP=off (tests). Si el servicio no responde, no se crea la cuenta (falla cerrado, como el plugin).
 */
export async function assertPasswordNotPwned(password: string, check: (p: string) => Promise<boolean> = isPasswordCompromised): Promise<void> {
  if (process.env.AUTH_HIBP === "off") return;
  let compromised: boolean;
  try {
    compromised = await check(password);
  } catch {
    throw validation("No pudimos verificar la contraseña contra filtraciones públicas. Probá de nuevo en unos minutos.", {
      password: "No se pudo verificar",
    });
  }
  if (compromised) throw validation(PWNED_MESSAGE, { password: PWNED_MESSAGE });
}

/**
 * Hash de contraseña para las cuentas que se crean o cambian por fuera de los endpoints (invitación, /setup, CLI).
 * Es el mismo scrypt que usa Better Auth por defecto. No se usa `ctx.password.hash`: con el plugin HIBP activo
 * exige un contexto de endpoint y fallaría fuera de él (el control de filtradas se hace con assertPasswordNotPwned).
 */
export const hashNewPassword = (password: string) => hashPassword(password);

/** Ruta del login a la que vuelve un magic link cuando la cuenta tiene 2FA (pide el código y sigue al portal). */
export const MAGIC_2FA_REDIRECT = "/login?paso=2fa&next=/portal";
const TWO_FACTOR_COOKIE_MAX_AGE = 600;

/**
 * El magic link crea la sesión directo (no pasa por el hook de 2FA del plugin, que solo mira /sign-in/*).
 * Si la cuenta tiene 2FA activado, se descarta esa sesión y se deja el desafío pendiente igual que el plugin
 * twoFactor (cookie firmada `two_factor` + verificación con intentos): el login pide el código y
 * /two-factor/verify-totp crea la sesión recién ahí.
 */
const magicLinkTwoFactor = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/magic-link/verify") return;
  const data = ctx.context.newSession;
  if (!data?.user || !(data.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) return;
  deleteSessionCookie(ctx, true);
  await ctx.context.internalAdapter.deleteSession(data.session.token);
  ctx.context.setNewSession(null);
  const cookie = ctx.context.createAuthCookie("two_factor", { maxAge: TWO_FACTOR_COOKIE_MAX_AGE });
  const identifier = `2fa-${generateRandomString(20)}`;
  const expiresAt = new Date(Date.now() + TWO_FACTOR_COOKIE_MAX_AGE * 1000);
  await ctx.context.internalAdapter.createVerificationValue({ value: data.user.id, identifier, expiresAt });
  await ctx.context.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt });
  await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);
  throw ctx.redirect(new URL(MAGIC_2FA_REDIRECT, ctx.context.baseURL).toString());
});

function createAuth() {
  const baseURL = process.env.APP_URL ?? "http://localhost:3000";
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("Falta AUTH_SECRET");
  return betterAuth({
    appName: "AGENCYOS",
    baseURL,
    secret: secret ?? "dev-secret-solo-para-desarrollo-local-0123456789",
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
        passkey: schema.passkey,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // el dueño se crea en /setup; el resto, solo aceptando una invitación (modules/users)
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 15 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "AGENCYOS · Recuperar contraseña",
          text: `Pediste recuperar tu contraseña de AGENCYOS.\n\nAbrí este enlace (vence en 15 minutos):\n${url}\n\nSi no fuiste vos, ignorá este mail.`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      session: {
        create: {
          // Alerta de dispositivo nuevo: en segundo plano, nunca demora ni bloquea el ingreso.
          after: async (session) => {
            const { recordLoginDevice } = await import("./devices");
            void recordLoginDevice(session).catch((e) => console.error("[auth] dispositivo:", e instanceof Error ? e.message : e));
          },
        },
      },
    },
    rateLimit: {
      enabled: process.env.AUTH_RATE_LIMIT !== "off",
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 5 },
        "/two-factor/verify-totp": { window: 15 * 60, max: 10 },
        "/two-factor/verify-backup-code": { window: 15 * 60, max: 5 },
        "/request-password-reset": { window: 15 * 60, max: 3 },
        "/passkey/verify-authentication": { window: 15 * 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: baseURL.startsWith("https://"),
      cookiePrefix: "agencyos",
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    trustedOrigins: [baseURL],
    hooks: { after: magicLinkTwoFactor },
    plugins: [
      twoFactor({ issuer: "AGENCYOS", backupCodeOptions: { amount: 10 } }),
      // Passkeys: solo se registran desde una sesión ya autenticada con 2FA; valen como segundo factor (WebAuthn con verificación de usuario).
      // Magic link (M15): solo clientes del portal. Para cualquier otro email no se envía nada (y la respuesta es la misma).
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        storeToken: "hashed",
        rateLimit: { window: 15 * 60, max: 3 },
        sendMagicLink: async ({ email, url }) => {
          const { magicLinkAllowed } = await import("../users/service");
          if (!(await magicLinkAllowed(email))) return;
          await sendEmail({
            to: email,
            subject: "Luciano Rosano · Tu enlace para entrar al portal",
            text: `Abrí este enlace para entrar al portal (vence en 15 minutos y sirve una sola vez):\n${url}\n\nSi no lo pediste, ignorá este mail.`,
          });
        },
      }),
      passkey({ rpName: "AGENCYOS", rpID: new URL(baseURL).hostname, origin: new URL(baseURL).origin }),
      ...(process.env.AUTH_HIBP === "off" ? [] : [haveIBeenPwned({ customPasswordCompromisedMessage: PWNED_MESSAGE })]),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __agencyosAuth?: Auth };

export function getAuth(): Auth {
  if (!g.__agencyosAuth) g.__agencyosAuth = createAuth();
  return g.__agencyosAuth;
}
