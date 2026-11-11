import { expect, type Page, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

/** Captura sin los toasts encima. */
async function cleanShot(page: Page, name: string, project: string) {
  const style = await page.addStyleTag({ content: "[data-sonner-toaster]{display:none !important}" });
  await shot(page, name, project);
  await style.evaluate((el) => el.remove());
}

test("registro de horas: proyecto (pestaña Horas, resumen) y tarea (bloque Tiempo) @visual", async ({ page }, info) => {
  test.setTimeout(120_000);
  const tag = info.project.name;
  await login(page);

  // Proyecto con el asistente (trae tareas)
  await page.goto("/proyectos/nuevo");
  await page.getByText("Tienda online (WooCommerce)").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#name", `Horas e2e ${tag}`);
  await page.getByRole("radio", { name: "Personal / facultad" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#definitionOfDone", "Publicada");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.fill("#firstAction", `Arrancar ${tag}`);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();

  // Pestaña Horas vacía → registrar 1h30
  await page.goto(`${projectUrl}/horas`);
  await expect(page.getByText("Sin horas registradas")).toBeVisible();
  await page.getByRole("button", { name: "Registrar horas" }).click();
  const dlg = page.getByRole("dialog", { name: "Registrar horas" });
  await dlg.locator("#duration").fill("1h30");
  await dlg.locator("#note").fill("Maquetado de la home");
  await dlg.getByRole("button", { name: "Registrar" }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText("Maquetado de la home")).toBeVisible();
  await expect(page.getByText("1 h 30 min").first()).toBeVisible();
  await expect(page.getByText("1,5 h").first()).toBeVisible();

  // Validación: duración ilegible
  await page.getByRole("button", { name: "Registrar horas" }).click();
  await dlg.locator("#duration").fill("un rato");
  await dlg.getByRole("button", { name: "Registrar" }).click();
  await expect(dlg.getByText(/No entendí la duración/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await cleanShot(page, "horas-proyecto", tag);

  // Resumen: línea de horas
  await page.goto(projectUrl);
  await expect(page.getByRole("link", { name: "1,5 h" })).toBeVisible();

  // Tarea del proyecto: bloque Tiempo
  await page.goto(`${projectUrl}/tareas`);
  await page.locator("a[href^='/tareas/']").first().click();
  await page.waitForURL(/\/tareas\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  const td = page.getByRole("dialog", { name: "Registrar horas" });
  await td.locator("#duration").fill("45");
  await td.getByRole("button", { name: "Registrar" }).click();
  await expect(td).toBeHidden();
  await expect(page.getByText("Tiempo · 45 min")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await cleanShot(page, "horas-tarea", tag);

  // El proyecto suma la tarea
  await page.goto(`${projectUrl}/horas`);
  await expect(page.getByText("2,3 h").first()).toBeVisible();
});

test("CRM: etapas editables, servicios de interés → presupuesto e importar chat de WhatsApp @visual", async ({ page }, info) => {
  test.setTimeout(150_000);
  const tag = info.project.name;
  const stage = `Demo ${tag}`;
  const client = `Cliente extras ${tag}`;
  const opp = `Web extras ${tag}`;
  const svc = `Landing extras ${tag}`;
  await login(page);

  // Configuración → CRM: etapa intermedia después de «Contactado»
  await page.goto("/configuracion/crm");
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Agregar" }) });
  await add.locator("#name").fill(stage);
  await add.locator("#probability").fill("35");
  await add.locator("#afterKey").selectOption({ label: "Contactado" });
  await add.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Etapa agregada")).toBeVisible();
  await expect(page.locator(`[data-stage-key] input[value="${stage}"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Eliminar «${stage}»` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Eliminar «Ganada»" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await cleanShot(page, "config-crm-etapas", tag);

  // Servicio en el catálogo
  await page.goto("/presupuestos/servicios");
  await page.getByRole("button", { name: "Nuevo servicio" }).first().click();
  const sd = page.getByRole("dialog", { name: "Nuevo servicio" });
  await sd.locator("#name").fill(svc);
  await sd.locator("#priceArs").fill("250000");
  await sd.getByRole("button", { name: "Guardar servicio" }).click();
  await expect(sd).toBeHidden();

  // Cliente + oportunidad
  await page.goto("/crm/clientes/nuevo");
  await page.fill("#name", client);
  await page.fill("#contactName", "Juan Pérez");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await page.waitForURL(/\/crm\/clientes\/[0-9a-f-]{36}$/);
  const clientUrl = page.url();
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  const od = page.getByRole("dialog", { name: "Nueva oportunidad" });
  await od.locator("#title").fill(opp);
  await od.getByRole("button", { name: "Crear oportunidad" }).click();
  await expect(od).toBeHidden();
  await page
    .getByRole("link", { name: new RegExp(opp) })
    .first()
    .click();
  await page.waitForURL(/\/crm\/oportunidades\/[0-9a-f-]{36}$/);

  // Servicios de interés
  await page.getByRole("button", { name: "Elegir" }).click();
  const svd = page.getByRole("dialog", { name: "Servicios de interés" });
  await svd.getByText(svc).click();
  await svd.getByRole("button", { name: "Guardar" }).click();
  await expect(svd).toBeHidden();
  await expect(page.getByRole("list", { name: "Servicios de interés" }).getByText(svc)).toBeVisible();

  // La etapa propia aparece en el selector y se puede mover ahí
  await page.goto(`/crm/oportunidades?q=${encodeURIComponent(opp)}`);
  const sel = page.getByLabel(`Etapa de «${opp}»`);
  const key = await sel.locator("option", { hasText: stage }).getAttribute("value");
  await sel.selectOption(key as string);
  await expect(page.getByText(`«${opp}» → ${stage}`)).toBeVisible();
  await expect(page.getByLabel(`Etapa de «${opp}»`)).toHaveValue(key as string);
  await page.reload();
  await expect(page.getByLabel(`Etapa de «${opp}»`)).toHaveValue(key as string);
  await expectNoHorizontalScroll(page);
  await cleanShot(page, "crm-pipeline-etapa-propia", tag);

  // Crear presupuesto desde la oportunidad: el servicio entra como ítem
  await page.getByRole("link", { name: opp }).first().click();
  await page.waitForURL(/\/crm\/oportunidades\/[0-9a-f-]{36}$/);
  await expectNoHorizontalScroll(page);
  await cleanShot(page, "crm-oportunidad-servicios", tag);
  await page.getByRole("link", { name: "Crear presupuesto con estos servicios" }).click();
  await page.waitForURL(/\/presupuestos\/nuevo\?/);
  await page.waitForFunction((name) => [...document.querySelectorAll("input")].some((i) => i.value === name), svc);

  // Importar chat de WhatsApp en la ficha del cliente
  await page.goto(`${clientUrl}/interacciones`);
  await page.getByRole("button", { name: "Importar chat de WhatsApp" }).click();
  const wd = page.getByRole("dialog", { name: "Importar chat de WhatsApp" });
  const chat = [
    "12/03/24, 09:15 - Los mensajes y las llamadas están cifrados de extremo a extremo.",
    "12/03/24, 09:16 - Juan Pérez: Hola! ¿Arrancamos con la web?",
    "12/03/24, 09:20 - Luciano: Sí, mañana te paso el presupuesto",
    "13/03/24, 18:02 - Juan Pérez: <Multimedia omitido>",
    `13/03/24, 18:05 - Luciano: Listo ${tag}`,
  ].join("\n");
  await wd.locator("#wa-text").fill(chat);
  await wd.getByRole("button", { name: "Previsualizar" }).click();
  await expect(wd.getByText("2 (una por día)")).toBeVisible();
  await expect(wd.getByRole("radio", { name: /Luciano/ })).toBeChecked();
  await expectNoHorizontalScroll(page);
  await cleanShot(page, "crm-whatsapp-preview", tag);
  await wd.getByRole("button", { name: "Importar 2 días" }).click();
  await expect(wd).toBeHidden();
  await expect(page.getByText(/Chat importado: 2 días nuevos/)).toBeVisible();
  await expect(page.getByText("Hola! ¿Arrancamos con la web?")).toBeVisible();
  // reimportar no duplica
  await page.getByRole("button", { name: "Importar chat de WhatsApp" }).click();
  await wd.locator("#wa-text").fill(chat);
  await wd.getByRole("button", { name: "Previsualizar" }).click();
  await wd.getByRole("button", { name: "Importar 2 días" }).click();
  await expect(page.getByText("Ese chat ya estaba importado: no hubo cambios")).toBeVisible();
  await expect(page.getByText("Hola! ¿Arrancamos con la web?")).toHaveCount(1);
  await expectNoHorizontalScroll(page);
  await cleanShot(page, "crm-whatsapp-importado", tag);
});

test("notas: plantillas sembradas, gestionar y crear nota desde plantilla con variables @visual", async ({ page }, info) => {
  const tag = info.project.name;
  await login(page);
  await page.goto("/notas/plantillas");
  for (const name of ["Reunión con cliente", "Briefing rápido", "Post-mortem de proyecto", "Idea"])
    await expect(page.getByText(name, { exact: true })).toBeVisible();

  // Crear una plantilla propia
  await page.getByRole("button", { name: "Nueva plantilla" }).first().click();
  const td = page.getByRole("dialog", { name: "Nueva plantilla" });
  const tplName = `Acta ${tag}`;
  await td.locator("#name").fill(tplName);
  await td.locator("#bodyMd").fill(`Reunión del {{fecha}} sobre {{titulo}}\n\n## Acuerdos ${tag}\n- `);
  await td.getByRole("button", { name: "Crear plantilla" }).click();
  await expect(td).toBeHidden();
  await expect(page.getByText(tplName)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await cleanShot(page, "notas-plantillas", tag);

  // Nota desde la plantilla
  await page.getByRole("link", { name: "Usar" }).nth(0).waitFor();
  const card = page.locator("li").filter({ hasText: tplName });
  await card.getByRole("link", { name: "Usar" }).click();
  await page.waitForURL(/\/notas\/nueva\?plantilla=/);
  await page.fill("#title", `Kickoff ${tag}`);
  await page.getByRole("button", { name: "Crear nota" }).click();
  await page.waitForURL(/\/notas\/[0-9a-f-]{36}/);
  await expect(page.getByText(`sobre Kickoff ${tag}`).first()).toBeVisible();
  await expect(page.getByText("{{fecha}}")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
