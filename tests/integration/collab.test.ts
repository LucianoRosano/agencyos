import { getBrainGraph } from "@agencyos/modules/brain/queries";
import * as collab from "@agencyos/modules/collab/service";
import { createClient } from "@agencyos/modules/crm/service";
import { createProject } from "@agencyos/modules/projects/service";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

describe("colaboración: etiquetas, comentarios, conexiones y vistas", () => {
  it("etiqueta entidades, filtra y aísla por workspace", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const p = await createProject(a, { name: "Sitio Panadería" });
    const t1 = await collab.createTag(a, { name: "#urgente" });
    expect(t1.name).toBe("urgente");
    const again = await collab.createTag(a, { name: "Urgente" });
    expect(again.id).toBe(t1.id);
    await collab.setEntityTags(a, "project", p.id, [t1.id]);
    expect((await collab.tagsFor(a, "project", [p.id])).get(p.id)?.map((t) => t.name)).toEqual(["urgente"]);
    expect(await collab.idsWithTag(a, "project", t1.id)).toEqual([p.id]);
    // B no puede etiquetar entidades de A ni usar etiquetas de A
    await expect(collab.setEntityTags(b, "project", p.id, [])).rejects.toThrow();
    const pb = await createProject(b, { name: "Otro" });
    expect(await collab.setEntityTags(b, "project", pb.id, [t1.id])).toBe(0);
  });

  it("comentarios y conexiones manuales + implícitas", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const c = await createClient(a, { name: "Panadería Sol" });
    const p = await createProject(a, { name: "Web Sol", clientId: c.id });
    const other = await createProject(a, { name: "Logo Sol" });
    const cm = await collab.addComment(a, "project", p.id, "Pedir fotos");
    expect((await collab.listComments(a, "project", p.id)).map((r) => r.c.bodyMd)).toEqual(["Pedir fotos"]);
    await expect(collab.addComment(b, "project", p.id, "hack")).rejects.toThrow();
    await expect(collab.deleteComment(b, cm?.id ?? "")).rejects.toThrow();

    const link = await collab.addLink(a, { type: "project", id: p.id }, { type: "project", id: other.id });
    expect(link).not.toBeNull();
    const conns = await collab.listConnections(a, "project", p.id);
    expect(conns.map((x) => [x.type, x.direction])).toEqual([
      ["client", "implicit"],
      ["project", "out"],
    ]);
    const back = await collab.listConnections(a, "project", other.id);
    expect(back[0]?.direction).toBe("in");
    await expect(collab.addLink(b, { type: "project", id: p.id }, { type: "project", id: other.id })).rejects.toThrow();
    await expect(collab.addLink(a, { type: "project", id: p.id }, { type: "project", id: p.id })).rejects.toThrow();
    await collab.removeLink(b, link?.id ?? "");
    expect(await collab.listConnections(a, "project", p.id)).toHaveLength(2);
    await collab.removeLink(a, link?.id ?? "");
    expect(await collab.listConnections(a, "project", p.id)).toHaveLength(1);
  });

  it("vistas guardadas por usuario", async () => {
    const a = await makeWorkspace("A");
    await collab.saveView(a, { module: "tareas", name: "Urgentes", query: "ver=todas&etiqueta=x" });
    expect((await collab.listSavedViews(a, "tareas")).map((v) => v.name)).toEqual(["Urgentes"]);
    await expect(collab.saveView(a, { module: "tareas", name: "x", query: "<script>" })).rejects.toThrow();
    const [v] = await collab.listSavedViews(a, "tareas");
    await collab.deleteSavedView(a, v?.id ?? "");
    expect(await collab.listSavedViews(a, "tareas")).toHaveLength(0);
  });

  it("el Cerebro expone las etiquetas de cada nodo para filtrar", async () => {
    const a = await makeWorkspace("A");
    const p = await createProject(a, { name: "Con etiqueta" });
    const t = await collab.createTag(a, { name: "prioridad" });
    await collab.setEntityTags(a, "project", p.id, [t.id]);
    const g = await getBrainGraph(a);
    expect(g.nodes.find((n) => n.key === `project:${p.id}`)?.tags).toEqual(["prioridad"]);
    expect(g.tags?.map((x) => x.name)).toEqual(["prioridad"]);
  });
});
