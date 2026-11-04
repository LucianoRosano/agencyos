import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { totp } from "./totp";

export const OWNER = { name: "Luciano Rosano", email: "lucianorosanott@gmail.com", password: "ContraseñaSegura2026!" };
const SECRET_FILE = `test-results/.e2e-totp-secret-${process.env.E2E_PORT ?? 3100}`;

async function freshCode(secret: string) {
  // evitar reusar un código en el borde de la ventana de 30 s
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (left < 4) await new Promise((r) => setTimeout(r, left * 1000 + 500));
  return totp(secret);
}

/** Crea el dueño si hace falta, activa el 2FA y deja la sesión iniciada. */
export async function login(page: Page) {
  await page.goto("/login");
  if (page.url().includes("/setup")) {
    await page.fill("[name=password]", OWNER.password);
    await page.fill("[name=password2]", OWNER.password);
    await page.click("button[type=submit]");
    await page.waitForURL("**/seguridad/2fa");
    await page.fill("[name=password]", OWNER.password);
    await page.click("button[type=submit]");
    const txt = (await page.locator("text=Clave manual").textContent()) ?? "";
    const secret = txt.split(":")[1]?.trim() ?? "";
    mkdirSync("test-results", { recursive: true });
    writeFileSync(SECRET_FILE, secret);
    await page.fill("[name=code]", await freshCode(secret));
    await page.click("button[type=submit]");
    await page.waitForURL("**/hoy");
    return;
  }
  if (page.url().includes("/hoy")) return;
  const secret = existsSync(SECRET_FILE) ? readFileSync(SECRET_FILE, "utf8").trim() : "";
  await page.fill("[name=email]", OWNER.email);
  await page.fill("[name=password]", OWNER.password);
  await page.click("button[type=submit]");
  await page.locator("[name=code]").waitFor();
  await page.fill("[name=code]", await freshCode(secret));
  await page.click("button[type=submit]");
  await page.waitForURL("**/hoy");
}

/** Sin scroll horizontal (docs/09 §3.11). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "scroll horizontal").toBeLessThanOrEqual(1);
}

export async function shot(page: Page, name: string, project: string) {
  const dir = `docs/capturas/${project}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
