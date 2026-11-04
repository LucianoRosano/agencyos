import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("login + 2FA + cierre de sesión", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/hoy/);
  await page.goto("/configuracion/seguridad");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
  await page.goto("/hoy");
  await expect(page).toHaveURL(/\/login/);
});
