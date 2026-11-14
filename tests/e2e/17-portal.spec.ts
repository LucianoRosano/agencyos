import { execSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { expectAccessible, expectNoHorizontalScroll, login, shot } from "./helpers";
import { totp } from "./totp";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";
const PASSWORD = "ClaveDelInvitado2026!";

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** Cliente con dos proyectos y una entrega lista para aprobar (datos SOLO de test). */
async function seed(tag: string) {
  const [ws] = await sql<{ id: string }>("select id from workspace order by created_at limit 1");
  const [space] = await sql<{ id: string }>("select id from space where workspace_id = $1 order by sort limit 1", [ws?.id]);
  const [c] = await sql<{ id: string }>("insert into client (id, workspace_id, name, status) values (gen_random_uuid(), $1, $2, 'active') returning id", [
    ws?.id,
    `Panadería Sol ${tag}`,
  ]);
  const project = (name: string) =>
    sql<{ id: string }>(
      "insert into project (id, workspace_id, space_id, client_id, name, kind, status, progress, next_action) values (gen_random_uuid(), $1, $2, $3, $4, 'website', 'in_progress', 40, 'Revisar maqueta') returning id",
      [ws?.id, space?.id, c?.id, name],
    ).then((r) => r[0]?.id as string);
  const a = await project(`Web Sol ${tag}`);
  const b = await project(`Tienda Sol ${tag}`);
  await sql("insert into project_phase (id, workspace_id, project_id, name, sort, status) values (gen_random_uuid(), $1, $2, 'Diseño', 0, 'in_progress')", [
    ws?.id,
    a,
  ]);
  await sql("insert into deliverable (id, workspace_id, project_id, title, status) values (gen_random_uuid(), $1, $2, $3, 'delivered')", [
    ws?.id,
    a,
    `Maqueta de inicio ${tag}`,
  ]);
  return { clientName: `Panadería Sol ${tag}`, a, b, aName: `Web Sol ${tag}`, bName: `Tienda Sol ${tag}` };
}

async function invite(page: Page, email: string, role: "client" | "member", pick: string) {
  await page.goto("/configuracion/usuarios");
  await page.getByRole("button", { name: "Invitar" }).click();
  await page.fill("#email", email);
  await page.selectOption("#role", role);
  if (role === "client") await page.selectOption("#clientId", { label: pick });
  else await page.getByLabel(pick, { exact: false }).check();
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const url = await page.getByTestId("invite-url").inputValue();
  expect(url).toMatch(/\/invitacion\/[A-Za-z0-9_-]{40,}$/);
  return url;
}

async function acceptAsNew(page: Page, url: string, name: string) {
  await page.goto(new URL(url).pathname);
  await page.fill("#name", name);
  await page.fill("#password", PASSWORD);
  await page.fill("#password2", PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta y entrar" }).click();
}

test("portal: invitar cliente → aceptar → ver portal → aprobar entrega → el dueño ve la notificación @visual", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const p = info.project.name;
  page.on("dialog", (d) => void d.accept());
  await login(page);
  const s = await seed(p);

  const url = await invite(page, `sofia-${p}@cliente.test`, "client", s.clientName);
  await expect(page.getByTestId("invitations-list")).toContainText(`sofia-${p}@cliente.test`);
  await shot(page, "17-usuarios", p);
  await expectNoHorizontalScroll(page);

  // El cliente acepta en otro navegador
  const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, storageState: { cookies: [], origins: [] }, locale: "es-AR" });
  const client = await ctx.newPage();
  client.on("dialog", (d) => void d.accept());
  await acceptAsNew(client, url, "Sofía Sol");
  await client.waitForURL("**/portal");
  await expect(client.getByTestId("portal-project")).toHaveCount(2);
  await expect(client.getByText("Etapa actual: Diseño")).toBeVisible();
  await expectNoHorizontalScroll(client);
  await expectAccessible(client);
  await shot(client, "17-portal-inicio", p);

  // La app interna le está vedada
  await client.goto("/hoy");
  await client.waitForURL("**/portal");
  await client.goto("/crm/clientes");
  await client.waitForURL("**/portal");

  // Aprobar la entrega
  await client.getByTestId("portal-project").filter({ hasText: s.aName }).click();
  await client.waitForURL(`**/portal/proyectos/${s.a}`);
  await expect(client.getByTestId("portal-deliverable")).toContainText(`Maqueta de inicio ${p}`);
  await expectNoHorizontalScroll(client);
  await expectAccessible(client);
  await shot(client, "17-portal-proyecto", p);
  await client.getByRole("button", { name: "Aprobar" }).click();
  await expect(client.getByText("¡Gracias! Entrega aprobada.")).toBeVisible();
  await expect(client.getByTestId("portal-deliverable")).toContainText("Aprobada");

  await client.goto("/portal/presupuestos");
  await expect(client.getByText("Todavía no hay presupuestos")).toBeVisible();
  await expectNoHorizontalScroll(client);
  await ctx.close();

  // El worker despacha el outbox → notificación al dueño
  execSync(`pnpm --filter @agencyos/worker exec tsx -e "import('./src/jobs.ts').then(async (m) => { await m.dispatchOutbox(); process.exit(0); })"`, {
    env: { ...process.env, DATABASE_URL: E2E_DB },
    stdio: "pipe",
  });
  await page.goto("/notificaciones");
  await expect(page.getByText(`aprobó la entrega «Maqueta de inicio ${p}»`).first()).toBeVisible();
});

test("colaborador: invitar con un proyecto → crear cuenta → 2FA obligatorio → solo ve su proyecto @visual", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const p = info.project.name;
  page.on("dialog", (d) => void d.accept());
  await login(page);
  const s = await seed(`m-${p}`);
  const url = await invite(page, `ana-${p}@colab.test`, "member", s.aName);

  const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, storageState: { cookies: [], origins: [] }, locale: "es-AR" });
  const m = await ctx.newPage();
  await acceptAsNew(m, url, "Ana Colaboradora");
  await m.waitForURL("**/seguridad/2fa");
  // 2FA obligatorio para colaboradores
  await m.fill("[name=password]", PASSWORD);
  await m.click("button[type=submit]");
  const secret = ((await m.locator("text=Clave manual").textContent()) ?? "").split(":")[1]?.trim() ?? "";
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (left < 4) await m.waitForTimeout(left * 1000 + 500);
  await m.fill("[name=code]", totp(secret));
  await m.click("button[type=submit]");
  await m.waitForURL("**/hoy");
  await expect(m.getByRole("heading", { name: /Ana/ })).toBeVisible();
  await expectNoHorizontalScroll(m);
  await shot(m, "17-colaborador-hoy", p);

  await m.goto("/proyectos");
  await expect(m.getByText(s.aName)).toBeVisible();
  await expect(m.getByText(s.bName)).toHaveCount(0);
  await expectNoHorizontalScroll(m);
  await expectAccessible(m);
  await shot(m, "17-colaborador-proyectos", p);
  // Ficha ajena por URL directa: 404
  const res = await m.goto(`/proyectos/${s.b}`);
  expect(res?.status()).toBe(404);
  // CRM y finanzas: fuera de su alcance
  await m.goto("/crm/clientes");
  await m.waitForURL("**/hoy");
  await m.goto("/finanzas");
  await m.waitForURL("**/hoy");
  await ctx.close();

  // El dueño lo ve en la lista con su proyecto
  await page.goto("/configuracion/usuarios");
  await expect(page.getByTestId("users-list")).toContainText("Ana Colaboradora");
  await expect(page.getByTestId("users-list")).toContainText(s.aName);
});
