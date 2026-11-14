import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login } from "./helpers";

test("login + 2FA + cierre de sesión", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/hoy/);
  await page.goto("/configuracion/seguridad");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
  await page.goto("/hoy");
  await expect(page).toHaveURL(/\/login/);
});

test("páginas legales públicas sin sesión", async ({ page }) => {
  for (const [path, title] of [
    ["/legal/terminos", "Términos de uso"],
    ["/legal/privacidad", "Política de privacidad"],
  ]) {
    await page.goto(path as string);
    await expect(page.getByRole("heading", { name: title as string })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
  }
});
