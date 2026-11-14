import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

test("registrar una passkey y entrar con ella sin contraseña ni código @visual", async ({ page, context }, info) => {
  // Autenticador virtual de Chromium (WebAuthn) con verificación de usuario.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await login(page);
  await page.goto("/configuracion/seguridad");
  const section = page.getByTestId("passkeys");
  await section.getByLabel("Nombre de la passkey").fill(`Llave ${info.project.name}`);
  await section.getByRole("button", { name: "Agregar" }).click();
  await expect(section.getByText(`Llave ${info.project.name}`)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "seguridad-passkeys", info.project.name);

  // cerrar sesión y entrar con la passkey
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "Entrar con passkey" }).click();
  await page.waitForURL("**/hoy");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // borrarla deja la cuenta como estaba
  await page.goto("/configuracion/seguridad");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Eliminar Llave ${info.project.name}` }).click();
  await expect(page.getByTestId("passkeys").getByText(`Llave ${info.project.name}`)).toHaveCount(0);
});
