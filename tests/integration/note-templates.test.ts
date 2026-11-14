import { formatDate, todayAR } from "@agencyos/core";
import { createClient } from "@agencyos/modules/crm/service";
import {
  applyTemplate,
  createNoteFromTemplate,
  createNoteTemplate,
  ensureNoteTemplates,
  listNoteTemplates,
  updateNoteTemplate,
} from "@agencyos/modules/notes/templates";
import { createProject } from "@agencyos/modules/projects/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

describe("plantillas de notas", () => {
  it("siembra 4 plantillas una sola vez (aunque después se borren)", async () => {
    const ctx = await makeWorkspace();
    expect(await ensureNoteTemplates(ctx)).toBe(true);
    const list = await listNoteTemplates(ctx);
    expect(list.map((t) => t.name).sort()).toEqual(["Briefing rápido", "Idea", "Post-mortem de proyecto", "Reunión con cliente"]);
    for (const t of list) await moveToTrash(ctx, "note_template", t.id);
    expect(await ensureNoteTemplates(ctx)).toBe(false);
    expect(await listNoteTemplates(ctx)).toHaveLength(0);
  });

  it("crea, edita, elimina y restaura", async () => {
    const ctx = await makeWorkspace();
    const t = await createNoteTemplate(ctx, { name: "Acta", bodyMd: "# {{titulo}}" });
    const u = await updateNoteTemplate(ctx, t.id, { name: "Acta de reunión", bodyMd: "{{fecha}}" });
    expect(u.name).toBe("Acta de reunión");
    await expect(createNoteTemplate(ctx, { name: "" })).rejects.toThrow(/nombre/);
    await moveToTrash(ctx, "note_template", t.id);
    expect((await listNoteTemplates(ctx)).some((x) => x.id === t.id)).toBe(false);
    await restoreFromTrash(ctx, "note_template", t.id);
    expect((await listNoteTemplates(ctx)).some((x) => x.id === t.id)).toBe(true);
  });

  it("reemplaza {{fecha}}, {{titulo}} y {{cliente}} al crear la nota", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Panadería Sol" });
    const p = await createProject(ctx, { name: "Web Sol", clientId: c.id });
    const t = await createNoteTemplate(ctx, { name: "Reunión", bodyMd: "Fecha: {{fecha}}\nTema: {{ titulo }}\nCliente: {{cliente}}\nOtra: {{otra}}" });
    const n1 = await createNoteFromTemplate(ctx, { templateId: t.id, title: "Kickoff", entityType: "client", entityId: c.id });
    expect(n1.bodyMd).toBe(`Fecha: ${formatDate(todayAR())}\nTema: Kickoff\nCliente: Panadería Sol\nOtra: {{otra}}`);
    const n2 = await createNoteFromTemplate(ctx, { templateId: t.id, title: "Seguimiento", entityType: "project", entityId: p.id });
    expect(n2.bodyMd).toContain("Cliente: Panadería Sol");
    const n3 = await createNoteFromTemplate(ctx, { templateId: t.id, title: "Suelta" });
    expect(n3.bodyMd).toContain("Cliente: \n");
    await expect(createNoteFromTemplate(ctx, { templateId: t.id, title: "Kickoff" })).rejects.toThrow();
    expect(applyTemplate("{{Título}} {{FECHA}}", { titulo: "A", fecha: "B", cliente: "" })).toBe("A B");
  });

  it("aislamiento A/B y permisos", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const tb = await createNoteTemplate(b, { name: "De B", bodyMd: "secreto" });
    await expect(createNoteFromTemplate(a, { templateId: tb.id, title: "Robo" })).rejects.toThrow(/plantilla/);
    await expect(updateNoteTemplate(a, tb.id, { name: "X" })).rejects.toThrow();
    await expect(moveToTrash(a, "note_template", tb.id)).rejects.toThrow();
    expect((await listNoteTemplates(a)).some((x) => x.id === tb.id)).toBe(false);
    await expect(createNoteTemplate(agentCtx(a, ["read:all"]), { name: "Bot" })).rejects.toThrow();
  });
});
