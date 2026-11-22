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
    if (await page.locator("[name=token]").count()) await page.fill("[name=token]", process.env.E2E_SETUP_TOKEN ?? "e2e-setup-token");
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
  const { overflow, culprits } = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    // Ignorar lo que está dentro de un contenedor con scroll horizontal propio (pestañas, carruseles).
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
      }
      return false;
    };
    const culprits = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > w + 1 && !clipped(el))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);
    return { overflow: document.documentElement.scrollWidth - w, culprits };
  });
  expect(overflow, `scroll horizontal (${culprits.join(" | ")})`).toBeLessThanOrEqual(1);
}

/** Espera a que terminen las animaciones finitas (transición entre pantallas, aparición de skeletons) antes de medir contraste. */
export async function settleAnimations(page: Page) {
  // Espera las animaciones finitas, incluidas las que arrancan después (contenido que llega por streaming),
  // hasta que no quede ninguna corriendo o pasen 2 s.
  await page.evaluate(async () => {
    const until = Date.now() + 2000;
    while (Date.now() < until) {
      const running = document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY);
      if (!running.length) {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!document.getAnimations().some((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)) return;
        continue;
      }
      await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, until - Date.now()))]);
    }
  });
}

export async function shot(page: Page, name: string, project: string) {
  const dir = `docs/capturas/${project}`;
  mkdirSync(dir, { recursive: true });
  // Captura desde arriba: si la página quedó desplazada, la barra lateral y el topbar (sticky) aparecen en el medio de la captura completa.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: "disabled" });
}

/** axe: sin violaciones serias o críticas (docs/09). */
export async function expectAccessible(page: Page) {
  await settleAnimations(page);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    bad.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ")}`,
    ),
  ).toEqual([]);
}

/** Abre la paleta Ctrl+K (se carga bajo demanda): reintenta si la tecla llegó antes de hidratar. */
export async function openPalette(page: Page) {
  const input = page.getByPlaceholder(/Buscar clientes, proyectos/);
  await expect(async () => {
    if (!(await input.isVisible())) await page.keyboard.press("Control+k");
    await expect(input).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}
