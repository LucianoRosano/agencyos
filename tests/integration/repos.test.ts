import { randomUUID } from "node:crypto";
import { getDb, schema } from "@agencyos/db";
import { buildMcpServer } from "@agencyos/modules/mcp/server";
import { createMcpToken, ctxFromToken } from "@agencyos/modules/mcp/tokens";
import { createProject } from "@agencyos/modules/projects/service";
import { FAKE_WEBHOOK_SECRET, setGitHubClient, signWebhook } from "@agencyos/modules/repos/github";
import { FAKE_ACCOUNT, FAKE_INSTALLATION_ID, FakeGitHub } from "@agencyos/modules/repos/github-fake";
import { getPlan, getRepo, listRepos } from "@agencyos/modules/repos/queries";
import {
  approvePlan,
  connectInstallation,
  createRepoPlan,
  executeApprovedPlans,
  generatePlan,
  handleWebhook,
  rejectPlan,
  syncWorkspace,
  updateLinks,
} from "@agencyos/modules/repos/service";
import { getToday } from "@agencyos/modules/today/queries";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

process.env.GITHUB_FAKE = "1";

let fake: FakeGitHub;
beforeEach(() => {
  fake = new FakeGitHub();
  setGitHubClient(fake);
});

async function connected() {
  const ctx = await makeWorkspace();
  await connectInstallation(ctx, FAKE_INSTALLATION_ID);
  await syncWorkspace(ctx);
  return ctx;
}

const repoByName = async (ctx: Awaited<ReturnType<typeof makeWorkspace>>, name: string) => (await listRepos(ctx)).find((r) => r.r.name === name)?.r ?? null;

function hook(event: string, payload: unknown, opts: { delivery?: string; secret?: string } = {}) {
  const rawBody = JSON.stringify(payload);
  return handleWebhook({ event, deliveryId: opts.delivery ?? randomUUID(), signature: signWebhook(opts.secret ?? FAKE_WEBHOOK_SECRET, rawBody), rawBody });
}

describe("repositorios (GitHub simulado)", () => {
  it("sincroniza: repos, checks y puntaje (secretos en falla ⇒ máx. 40)", async () => {
    const ctx = await connected();
    const rows = await listRepos(ctx);
    expect(rows.length).toBe(5);
    const fiscal = await repoByName(ctx, "prod-libreriaos-fiscal");
    expect(fiscal?.healthScore).toBe(100);
    expect(fiscal?.scope).toBe("prod");
    const edu = await repoByName(ctx, "edu-ungs-sistemas");
    expect(edu?.healthScore).toBeLessThanOrEqual(40);
    const tpl = await repoByName(ctx, "tpl-wp-plugin");
    const tplData = await getRepo(ctx, tpl?.id as string);
    expect(tplData?.checks.find((c) => c.checkKey === "rama_protegida")?.status).toBe("na");
    const sofia = await repoByName(ctx, "Panel_Sofia");
    expect(sofia?.scope).toBe("cli");
    expect((sofia?.healthScore ?? 100) < 70).toBe(true);
    // segunda sincronización: idempotente
    const again = await syncWorkspace(ctx);
    expect(again.created).toBe(0);
    expect((await listRepos(ctx)).length).toBe(5);
  });

  it("aparece en «Ponerse al día»: secretos como crítico y repos en rojo", async () => {
    const ctx = await connected();
    const today = await getToday(ctx, { userId: ctx.userId as string });
    const repoItems = today.catchUp.filter((i) => i.kind.startsWith("repo"));
    expect(repoItems.some((i) => i.title.includes("edu-ungs-sistemas") && i.severity === "critical")).toBe(true);
    expect(repoItems.some((i) => i.title.includes("Panel_Sofia"))).toBe(true);
  });

  it("plan → aprobar → ejecución en el worker → resultado, auditoría y actividad", async () => {
    const ctx = await connected();
    const sofia = await repoByName(ctx, "Panel_Sofia");
    const plan = await generatePlan(ctx, { repositoryIds: [sofia?.id] });
    expect(plan.status).toBe("pending_approval");
    const data = await getPlan(ctx, plan.id);
    const kinds = data?.actions.map((a) => a.a.kind) ?? [];
    expect(kinds).toEqual(expect.arrayContaining(["rename", "set_topics", "set_description", "add_file", "enable_security"]));
    // sin aprobación no se ejecuta nada
    await executeApprovedPlans();
    expect(fake.calls.filter((c) => c.method !== "listRepos")).toEqual([]);

    const ids = data?.actions.map((a) => a.a.id) ?? [];
    await approvePlan(ctx, plan.id, { actionIds: ids });
    await expect(approvePlan(ctx, plan.id, { actionIds: ids })).rejects.toThrow(/ya fue decidido/);
    const out = await executeApprovedPlans();
    expect(out).toHaveLength(1);

    const after = await getPlan(ctx, plan.id);
    expect(after?.plan.status).toBe("done");
    expect(after?.actions.every((a) => a.a.status === "done" && a.a.result && a.a.executedAt)).toBe(true);
    // los archivos van en UN PR, nunca a main
    const prs = fake.calls.filter((c) => c.method === "openFilesPr");
    expect(prs).toHaveLength(1);
    expect((prs[0]?.args as { branch?: string } | undefined)?.branch).toMatch(/^agencyos\//);
    expect(fake.repos.get(`${FAKE_ACCOUNT}/cli-sofia-panel`)?.files.has("CLAUDE.md")).toBe(false);
    // renombrado en GitHub y en AGENCYOS
    const renamed = await getRepo(ctx, sofia?.id as string);
    expect(renamed?.r.name).toBe("cli-sofia-panel");
    expect(renamed?.r.topics).toEqual(expect.arrayContaining(["alcance-cli", "cliente-sofia", "stack-php", "estado-activo"]));
    expect((renamed?.r.healthScore ?? 0) > (sofia?.healthScore ?? 0)).toBe(true);
    // auditoría por acción + aprobación + ejecución
    const actions = after?.audit.map((a) => a.action) ?? [];
    expect(actions).toEqual(expect.arrayContaining(["repo_plan.approve", "github.rename", "github.set_topics", "github.add_file", "repo_plan.executed"]));
    // nunca se llama a nada destructivo
    expect(fake.calls.some((c) => /delete|visibility|force/i.test(c.method))).toBe(false);
    // re-ejecutar no repite
    expect(await executeApprovedPlans()).toEqual([]);
  });

  it("aprobación parcial: lo no elegido queda omitido; rechazar cierra el plan", async () => {
    const ctx = await connected();
    const sofia = await repoByName(ctx, "Panel_Sofia");
    const plan = await generatePlan(ctx, { repositoryIds: [sofia?.id] });
    const data = await getPlan(ctx, plan.id);
    const rename = data?.actions.find((a) => a.a.kind === "rename");
    await approvePlan(ctx, plan.id, { actionIds: [rename?.a.id] });
    await executeApprovedPlans();
    const after = await getPlan(ctx, plan.id);
    expect(after?.actions.filter((a) => a.a.status === "skipped").length).toBe((data?.actions.length ?? 0) - 1);
    expect(fake.calls.map((c) => c.method)).not.toContain("replaceTopics");

    const p2 = await generatePlan(ctx);
    await rejectPlan(ctx, p2.id);
    expect((await getPlan(ctx, p2.id))?.plan.status).toBe("rejected");
  });

  it("permisos: Claude (MCP) propone pero no aprueba; un miembro no aprueba", async () => {
    const ctx = await connected();
    const bot = agentCtx(ctx, ["read:all", "propose:*"]);
    const plan = await generatePlan(bot, {});
    expect(plan.createdByType).toBe("agent");
    await expect(approvePlan(bot, plan.id, { actionIds: [] })).rejects.toThrow();
    const member = { ...ctx, role: "member" as const };
    const data = await getPlan(ctx, plan.id);
    await expect(approvePlan(member, plan.id, { actionIds: data?.actions.map((a) => a.a.id) })).rejects.toThrow(/permiso/);
    await expect(generatePlan(agentCtx(ctx, ["read:all"]), {})).rejects.toThrow();
  });

  it("aislamiento A/B: B no ve, no vincula, no planifica ni aprueba lo de A", async () => {
    const a = await connected();
    const b = await makeWorkspace("B");
    const repoA = await repoByName(a, "Panel_Sofia");
    expect(await listRepos(b)).toEqual([]);
    expect(await getRepo(b, repoA?.id as string)).toBeNull();
    await expect(updateLinks(b, repoA?.id as string, { scope: "cli" })).rejects.toThrow(/no existe/);
    await expect(generatePlan(b, { repositoryIds: [repoA?.id] })).rejects.toThrow();
    const planA = await generatePlan(a, { repositoryIds: [repoA?.id] });
    await expect(approvePlan(b, planA.id, { actionIds: [randomUUID()] })).rejects.toThrow(/no existe/);
    // vincular a un cliente de otro workspace
    const [cb] = await getDb().insert(schema.client).values({ workspaceId: b.workspaceId, name: "Cliente B" }).returning();
    await expect(updateLinks(a, repoA?.id as string, { clientId: cb?.id })).rejects.toThrow(/no existe/);
  });

  it("vínculos: definir el alcance habilita el nombre propuesto", async () => {
    const ctx = await connected();
    const fact = await repoByName(ctx, "facturador_arca");
    const before = await getRepo(ctx, fact?.id as string);
    expect(before?.checks.find((c) => c.checkKey === "nombre")?.details).toMatchObject({ suggestion: null });
    await updateLinks(ctx, fact?.id as string, { scope: "int" });
    const after = await getRepo(ctx, fact?.id as string);
    expect(after?.checks.find((c) => c.checkKey === "nombre")?.details).toMatchObject({ suggestion: "int-facturador-arca" });
  });

  it("webhooks: firma válida, inválida y entrega duplicada (idempotencia)", async () => {
    const ctx = await connected();
    const fiscal = await repoByName(ctx, "prod-libreriaos-fiscal");
    const payload = {
      ref: "refs/heads/main",
      installation: { id: FAKE_INSTALLATION_ID },
      repository: { id: 9001, full_name: `${FAKE_ACCOUNT}/prod-libreriaos-fiscal` },
      commits: [{}, {}],
      pusher: { name: "luciano" },
      head_commit: { message: "fix: algo" },
    };
    expect((await hook("push", payload, { secret: "otro" })).status).toBe(401);
    expect((await handleWebhook({ event: "push", deliveryId: "x", signature: null, rawBody: "{}" })).status).toBe(401);
    const delivery = randomUUID();
    expect((await hook("push", payload, { delivery })).status).toBe(200);
    const dup = await hook("push", payload, { delivery });
    expect(dup.status).toBe(200);
    expect(dup.body).toMatch(/duplicada/);
    const events = await getDb().select().from(schema.repoEvent).where(eq(schema.repoEvent.deliveryId, delivery));
    expect(events).toHaveLength(1);
    const acts = await getDb()
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.workspaceId, ctx.workspaceId), eq(schema.activity.verb, "repo.push")));
    expect(acts).toHaveLength(1);
    expect(acts[0]?.entityId).toBe(fiscal?.id);
  });

  it("PR abierto por Claude aparece en «Ponerse al día» y desaparece al mergearse", async () => {
    const ctx = await connected();
    const base = { installation: { id: FAKE_INSTALLATION_ID }, repository: { id: 9001, full_name: `${FAKE_ACCOUNT}/prod-libreriaos-fiscal` } };
    const pr = {
      number: 7,
      title: "chore: archivos estándar",
      html_url: "https://github.com/x/pull/7",
      user: { login: "agencyos[bot]" },
      head: { ref: "agencyos/estandar" },
    };
    await hook("pull_request", { ...base, action: "opened", pull_request: pr });
    let today = await getToday(ctx, { userId: ctx.userId as string });
    expect(today.catchUp.some((i) => i.kind === "repo_pr" && i.title.includes("#7"))).toBe(true);
    await hook("pull_request", { ...base, action: "closed", pull_request: { ...pr, merged: true } });
    today = await getToday(ctx, { userId: ctx.userId as string });
    expect(today.catchUp.some((i) => i.kind === "repo_pr")).toBe(false);
  });

  it("release de un repo vinculado a un producto propio → versión + tarea por instalación activa", async () => {
    const ctx = await connected();
    const fiscal = await repoByName(ctx, "prod-libreriaos-fiscal");
    const db = getDb();
    const [cl] = await db.insert(schema.client).values({ workspaceId: ctx.workspaceId, name: "Librería Uno" }).returning();
    const [prod] = await db.insert(schema.ownProduct).values({ workspaceId: ctx.workspaceId, name: "LibreríaOS Fiscal" }).returning();
    await db.insert(schema.installation).values([
      { workspaceId: ctx.workspaceId, productId: prod?.id as string, clientId: cl?.id, status: "active" },
      { workspaceId: ctx.workspaceId, productId: prod?.id as string, clientId: cl?.id, status: "retired" },
    ]);
    await updateLinks(ctx, fiscal?.id as string, { scope: "prod", productId: prod?.id });
    const payload = {
      action: "published",
      installation: { id: FAKE_INSTALLATION_ID },
      repository: { id: 9001, full_name: `${FAKE_ACCOUNT}/prod-libreriaos-fiscal` },
      release: { tag_name: "v1.2.0", name: "1.2.0", body: "- arreglos", html_url: "https://github.com/x/releases/v1.2.0", prerelease: false },
    };
    expect((await hook("release", payload)).status).toBe(200);
    await hook("release", payload); // otra entrega del mismo release: no duplica
    const versions = await db
      .select()
      .from(schema.ownProductVersion)
      .where(eq(schema.ownProductVersion.productId, prod?.id as string));
    expect(versions.map((v) => v.version)).toEqual(["v1.2.0"]);
    const tasks = await db
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.workspaceId, ctx.workspaceId), eq(schema.task.title, "Actualizar LibreríaOS Fiscal a v1.2.0 en Librería Uno")));
    expect(tasks).toHaveLength(1);
  });

  it("crear repositorio desde un proyecto: plan create_repo → aprobado → privado, vinculado y con PR de archivos", async () => {
    const ctx = await connected();
    const [cl] = await getDb().insert(schema.client).values({ workspaceId: ctx.workspaceId, name: "Librería Uno" }).returning();
    const project = await createProject(ctx, { name: "Tienda Librería Uno", clientId: cl?.id });
    const tpl = await repoByName(ctx, "tpl-wp-plugin");
    await expect(
      createRepoPlan(ctx, project.id, { templateId: (await repoByName(ctx, "edu-ungs-sistemas"))?.id, scope: "cli", name: "x", what: "y" }),
    ).rejects.toThrow(/plantilla/);
    const plan = await createRepoPlan(ctx, project.id, {
      templateId: tpl?.id,
      scope: "cli",
      tech: "WP",
      name: "Tienda",
      what: "Tienda online",
      stack: "woocommerce",
    });
    const data = await getPlan(ctx, plan.id);
    expect(data?.actions[0]?.a.kind).toBe("create_repo");
    expect((data?.actions[0]?.a.params as { name?: string } | undefined)?.name).toBe("cli-libreriauno-wp-tienda");
    await approvePlan(ctx, plan.id, { actionIds: data?.actions.map((a) => a.a.id) });
    await executeApprovedPlans();
    const created = fake.repos.get(`${FAKE_ACCOUNT}/cli-libreriauno-wp-tienda`);
    expect(created?.private).toBe(true);
    expect(created?.topics).toEqual(expect.arrayContaining(["alcance-cli", "cliente-libreriauno", "stack-woocommerce"]));
    expect(created?.pulls).toHaveLength(1);
    const linked = await listRepos(ctx, { projectId: project.id });
    expect(linked.map((r) => r.r.name)).toEqual(["cli-libreriauno-wp-tienda"]);
    expect(linked[0]?.r.clientId).toBe(cl?.id);
  });

  it("MCP: listar_repositorios y proponer_plan_repos (queda pendiente de aprobación)", async () => {
    const ctx = await connected();
    const { token } = await createMcpToken(ctx, { name: "Claude Code" });
    const bot = await ctxFromToken(token);
    if (!bot) throw new Error("token");
    const server = buildMcpServer(bot);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "test", version: "1" });
    await client.connect(b);
    const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]?.text ?? "";
    const list = await client.callTool({ name: "listar_repositorios", arguments: { solo_desvios: true } });
    expect(list.isError).toBeFalsy();
    const repos = JSON.parse(text(list)) as { nombre: string; desvios: unknown[] }[];
    expect(repos.some((r) => r.nombre.endsWith("Panel_Sofia") && r.desvios.length > 0)).toBe(true);
    const prop = await client.callTool({ name: "proponer_plan_repos", arguments: {} });
    expect(prop.isError).toBeFalsy();
    const { id } = JSON.parse(text(prop)) as { id: string };
    expect((await getPlan(ctx, id))?.plan).toMatchObject({ status: "pending_approval", createdByType: "agent" });
    await executeApprovedPlans();
    expect(fake.calls.filter((c) => c.method !== "listRepos")).toEqual([]);
  });
});
