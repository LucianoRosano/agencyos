import { validation } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword } from "better-auth/crypto";
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
