import { expect, type Page, test } from "@playwright/test";
import { expectNoHorizontalScroll, login, shot } from "./helpers";

async function moveTo(page: Page, title: string, stage: string, label: string) {
  const sel = page.getByLabel(`Etapa de «${title}»`);
  await sel.selectOption(stage);
  await expect(page.getByText(`«${title}» → ${label}`)).toBeVisible();
  await expect(page.getByLabel(`Etapa de «${title}»`)).toHaveValue(stage);
}

test("CRM: cliente + contacto + interacción + oportunidad → pipeline → ganada → crear proyecto @visual", async ({ page }, info) => {
  const tag = info.project.name;
  const client = `Cliente e2e ${tag}`;
  const opp = `Tienda online ${tag}`;
  await login(page);

  // Cliente con contacto principal en un solo paso
  await page.goto("/crm/clientes");
  await page.getByRole("link", { name: "Nuevo cliente" }).first().click();
  await page.waitForURL("**/crm/clientes/nuevo");
  await page.fill("#name", client);
  await page.fill("#industry", "Estética");
  await page.fill("#city", "Rosario");
  await page.fill("#contactName", "Sofía Prueba");
  await page.fill("#contactPhone", "341 555-1234");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await page.waitForURL(/\/crm\/clientes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: client })).toBeVisible();
  const clientUrl = page.url();
  await expect(page.getByRole("link", { name: "WhatsApp a Sofía Prueba" }).first()).toHaveAttribute("href", "https://wa.me/5493415551234");

  // Interacción rápida con próximo paso
  await page.getByRole("button", { name: "Registrar interacción" }).click();
  const dlg = page.getByRole("dialog", { name: "Registrar interacción" });
  await dlg.getByText("Llamada").click();
  await dlg.locator("#summaryMd").fill("Primera charla: quiere vender **online**.");
  await dlg.locator("#nextStep").fill("Mandar propuesta");
  await dlg.getByRole("button", { name: "Registrar" }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText("Primera charla: quiere vender")).toBeVisible();

  // Oportunidad desde la ficha
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  const od = page.getByRole("dialog", { name: "Nueva oportunidad" });
  await od.locator("#title").fill(opp);
  await od.locator("#valueAmount").fill("1.500.000");
  await od.locator("#probability").fill("40");
  await od.locator("#nextAction").fill("Llamar para la reunión");
  await od.getByRole("button", { name: "Crear oportunidad" }).click();
  await expect(od).toBeHidden();
  await expect(page.getByRole("link", { name: new RegExp(opp) }).first()).toBeVisible();

  // Datos fiscales ocultos por defecto
  await page.getByRole("button", { name: "Mostrar datos fiscales" }).click();
  await expect(page.getByText("Todavía no hay titulares fiscales.")).toBeVisible();
  await page.getByRole("button", { name: "Ocultar" }).click();
  await expectNoHorizontalScroll(page);
  await shot(page, "crm-cliente-ficha", tag);

  // Pipeline
  await page.goto("/crm/oportunidades");
  await expect(page.getByRole("link", { name: opp })).toBeVisible();
  await moveTo(page, opp, "contacted", "Contactado");
  await moveTo(page, opp, "meeting", "Reunión");

  // «Propuesta enviada» pide vincular un presupuesto o crearlo
  await page.getByLabel(`Etapa de «${opp}»`).selectOption("proposal_sent");
  const qd = page.getByRole("dialog", { name: "Vincular un presupuesto" });
  await expect(qd).toBeVisible();
  await expect(qd.getByRole("link", { name: "Crear presupuesto" })).toHaveAttribute("href", /\/presupuestos\/nuevo\?cliente=[0-9a-f-]{36}&oportunidad=[0-9a-f-]{36}/);
  await qd.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByLabel(`Etapa de «${opp}»`)).toHaveValue("meeting");

  await moveTo(page, opp, "negotiation", "Negociación");
  // Suma ponderada en la columna: 1.500.000 × 40 %
  await expect(page.locator('section[data-stage="negotiation"]')).toContainText("$ 600.000");
  await expectNoHorizontalScroll(page);
  await shot(page, "crm-pipeline-kanban", tag);

  // «Perdida» exige motivo (se cancela)
  await page.getByLabel(`Etapa de «${opp}»`).selectOption("lost");
  const ld = page.getByRole("dialog", { name: "Marcar como perdida" });
  await expect(ld.getByRole("button", { name: "Marcar perdida" })).toBeDisabled();
  await ld.getByRole("button", { name: "Cancelar" }).click();

  // Ganada → crear proyecto con el asistente
  await page.getByLabel(`Etapa de «${opp}»`).selectOption("won");
  const wd = page.getByRole("dialog", { name: "¡Oportunidad ganada!" });
  await expect(wd).toBeVisible();
  await expect(wd).toContainText("pasó a cliente activo");
  await wd.getByRole("link", { name: "Crear proyecto" }).click();
  await page.waitForURL(/\/proyectos\/nuevo\?cliente=[0-9a-f-]{36}&nombre=/);
  await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("nombre")).toBe(opp);

  // El prospecto pasó a activo
  await page.goto(clientUrl);
  await expect(page.getByLabel("Estado del cliente")).toHaveValue("active");

  // Vista tabla
  await page.goto("/crm/oportunidades?vista=tabla");
  await expect(page.getByLabel(`Etapa de «${opp}»`).first()).toHaveValue("won");
  await expectNoHorizontalScroll(page);
  await shot(page, "crm-pipeline-tabla", tag);

  // Listas de clientes y contactos
  await page.goto("/crm/clientes");
  await expect(page.getByRole("link", { name: client }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "crm-clientes", tag);
  await page.goto("/crm/contactos");
  await expect(page.getByRole("link", { name: "Sofía Prueba" }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
