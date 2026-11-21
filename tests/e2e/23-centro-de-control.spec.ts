import { expect, type Page, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";

async function mcpToken(page: Page, name: string) {
  await page.goto("/configuracion/integraciones");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Confirmá tu contraseña").fill("ContraseñaSegura2026!");
  await page.getByRole("button", { name: "Crear token" }).click();
  return ((await page.locator("code").filter({ hasText: /^ag_/ }).first().textContent()) ?? "").trim();
}

test("Centro de control: skill desde plantilla → objetivo → plan aprobado → agente por MCP con OK y revisión @visual", async ({ page, request }, info) => {
  test.setTimeout(180_000);
  const tag = info.project.name.replace(/[^a-z]/gi, "");
  await login(page);

  // Resumen
  await page.goto("/control");
  await expect(page.getByRole("heading", { name: "Centro de control" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);

  // Skill desde plantilla + exportación para Claude Code
  await page.goto("/control/skills");
  await page.waitForLoadState("networkidle");
  const tpl = page.getByRole("listitem").filter({ hasText: "Arreglar un error con prueba" });
  if (await tpl.count()) {
    await tpl.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("Agregaste «Arreglar un error con prueba»")).toBeVisible();
  }
  await expect(page.getByTestId("skill-list")).toContainText("Arreglar un error con prueba");
  const zip = await page.request.get("/api/control/skills");
  expect(zip.headers()["content-type"]).toBe("application/zip");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "control-skills", info.project.name);

  // Objetivo
  await page.goto("/control/objetivos");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nuevo objetivo" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo objetivo" });
  await dlg.locator("#title").fill(`Arreglar el envío del checkout ${tag}`);
  await dlg.locator("#acceptanceMd").fill("Prueba automatizada que cubre CABA.");
  await dlg.getByLabel("Arreglar un error con prueba").check();
  await dlg.getByRole("button", { name: "Crear objetivo" }).click();
  await page.waitForURL(/\/control\/objetivos\/[0-9a-f-]{36}$/);
  const goalId = page.url().split("/").pop() ?? "";

  // Plan escrito a mano y aprobado
  await page.getByRole("button", { name: "Escribir el plan" }).click();
  await page.locator("#plan").fill("Reproducir el error\nCorregir el cálculo\nPublicar el arreglo (ok)");
  await page.getByRole("button", { name: "Guardar plan" }).click();
  await expect(page.getByText("Plan para aprobar")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar el plan" }).click();
  await expect(page.getByText("Listo para ejecutar").first()).toBeVisible();

  // El agente (Claude Code) trabaja por MCP
  const token = await mcpToken(page, `Claude Code ${tag}`);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" };
  await request.post("/mcp", {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } },
    },
  });
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await request.post("/mcp", { headers, data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
    const body = await r.json();
    expect(body.result.isError ?? false, JSON.stringify(body.result)).toBe(false);
    return JSON.parse(body.result.content[0].text);
  };
  const brief = await call("tomar_objetivo", { id: goalId });
  expect(brief.plan).toHaveLength(3);
  expect(brief.skills[0].nombre).toBe("Arreglar un error con prueba");
  await call("actualizar_paso", { id: goalId, paso: 1, estado: "done", resultado: "Se reproduce con CP 1405" });
  await call("actualizar_paso", { id: goalId, paso: 2, estado: "failed", resultado: "La prueba no compila" });
  await call("registrar_avance", { id: goalId, tipo: "fix", mensaje: "Corregido el import de la prueba" });
  await call("actualizar_paso", { id: goalId, paso: 2, estado: "done" });
  const blocked = await call("actualizar_paso", { id: goalId, paso: 3, estado: "running" });
  expect(blocked.bloqueado).toBe(true);

  // Vos aprobás el paso riesgoso
  await page.goto(`/control/objetivos/${goalId}`);
  await expect(page.getByText("Esperando tu OK").first()).toBeVisible();
  await page.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(page.getByText(/Aprobaste «Publicar el arreglo»/)).toBeVisible();

  await call("actualizar_paso", { id: goalId, paso: 3, estado: "done", resultado: "PR mergeado" });
  await call("terminar_objetivo", { id: goalId, resumen: "Envío corregido con prueba; PR mergeado." });

  await page.reload();
  await expect(page.getByText("Listo para revisar")).toBeVisible();
  await expect(page.getByTestId("goal-log")).toContainText("Corregido el import de la prueba");
  await expect(page.getByTestId("goal-steps")).toContainText("1 intento(s) fallido(s) corregido(s)");
  await expectNoHorizontalScroll(page);
  await expectAccessible(page);
  await shot(page, "control-objetivo", info.project.name);
  await page.getByRole("button", { name: "Aceptar el resultado" }).click();
  await expect(page.getByText("Objetivo cumplido")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Terminado").first()).toBeVisible();
});
