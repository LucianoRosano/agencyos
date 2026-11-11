import { getDb, schema } from "@agencyos/db";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { sendEmail } from "../shared/email";

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
      disableSignUp: true, // el dueño se crea en /setup; usuarios nuevos llegan en la F6
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
      passkey({ rpName: "AGENCYOS", rpID: new URL(baseURL).hostname, origin: new URL(baseURL).origin }),
      ...(process.env.AUTH_HIBP === "off"
        ? []
        : [haveIBeenPwned({ customPasswordCompromisedMessage: "Esa contraseña apareció en filtraciones públicas. Elegí otra." })]),
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
