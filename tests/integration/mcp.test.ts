import { getDb, schema } from "@agencyos/db";
import { buildMcpServer } from "@agencyos/modules/mcp/server";
import { createMcpToken, ctxFromToken, revokeMcpToken } from "@agencyos/modules/mcp/tokens";
import { createProject } from "@agencyos/modules/projects/service";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

async function connect(token: string) {
  const ctx = await ctxFromToken(token);
  if (!ctx) throw new Error("token inválido");
  const server = buildMcpServer(ctx);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  return { client, ctx };
}
const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "");

describe("servidor MCP", () => {
  it("con alcance limitado: lee Hoy, crea tarea y decisión; eliminar es rechazado y auditado", async () => {
    const owner = await makeWorkspace();
    const p = await createProject(owner, { name: "Proyecto MCP" });
    const { token } = await createMcpToken(owner, { name: "Claude Code", scopes: ["read:all", "write:tasks", "write:decisions", "write:inbox"] });
    const { client } = await connect(token);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["ver_hoy", "crear_tarea", "registrar_decision", "proponer_cambio"]));

    const hoy = await client.callTool({ name: "ver_hoy", arguments: {} });
    expect(hoy.isError).toBeFalsy();
    expect(JSON.parse(textOf(hoy))).toHaveProperty("ponerse_al_dia");

    const t = await client.callTool({ name: "crear_tarea", arguments: { titulo: "Tarea desde Claude", proyecto_id: p.id } });
    expect(t.isError).toBeFalsy();
    const created = await getDb().select().from(schema.task).where(and(eq(schema.task.workspaceId, owner.workspaceId), eq(schema.task.title, "Tarea desde Claude")));
    expect(created[0]?.projectId).toBe(p.id);

    const d = await client.callTool({ name: "registrar_decision", arguments: { proyecto_id: p.id, decision: "Usar Next.js", motivo: "Un solo lenguaje" } });
    expect(d.isError).toBeFalsy();

    const del = await client.callTool({ name: "eliminar_elemento", arguments: { tipo: "project", id: p.id } });
    expect(del.isError).toBe(true);
    const denied = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.workspaceId, owner.workspaceId), eq(schema.auditLog.action, "mcp.denied")));
    expect(denied.length).toBe(1);

    const fin = await client.callTool({ name: "ver_finanzas_resumen", arguments: {} });
    expect(fin.isError).toBeFalsy(); // read:all incluye finanzas (lectura)
  });

  it("token revocado o inventado no autentica", async () => {
    const owner = await makeWorkspace();
    const { token, row } = await createMcpToken(owner, { name: "temporal" });
    expect(await ctxFromToken(token)).not.toBeNull();
    await revokeMcpToken(owner, row.id);
    expect(await ctxFromToken(token)).toBeNull();
    expect(await ctxFromToken("ag_inventado")).toBeNull();
  });

  it("sin write:crm no puede registrar interacciones", async () => {
    const owner = await makeWorkspace();
    const { token } = await createMcpToken(owner, { name: "solo lectura", scopes: ["read:all"] });
    const { client } = await connect(token);
    const r = await client.callTool({ name: "capturar", arguments: { texto: "hola" } });
    expect(r.isError).toBe(true);
  });
});
