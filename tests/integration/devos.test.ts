import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import {
  addSkillFromTemplate,
  approvePlan,
  cancelGoal,
  claimGoal,
  createGoal,
  createSkill,
  decideStep,
  finishGoal,
  getGoal,
  goalBriefing,
  proposePlan,
  rejectPlan,
  reviewGoal,
  skillMarkdown,
  updateSkill,
  updateStep,
} from "@agencyos/modules/devos/service";
import { SKILL_TEMPLATES } from "@agencyos/modules/devos/templates";
import { createProject } from "@agencyos/modules/projects/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

describe("Centro de control: skills", () => {
  it("crear, versionar, exportar como SKILL.md y desde plantilla", async () => {
    const ws = await makeWorkspace();
    const s = await createSkill(ws, {
      name: "Publicar sitio",
      description: "Pasar a producción",
      instructionsMd: "1. Backup\n2. Publicar",
      tools: "tomar_objetivo, actualizar_paso",
    });
    expect(s.slug).toBe("publicar-sitio");
    expect(s.tools).toEqual(["tomar_objetivo", "actualizar_paso"]);
    const s2 = await updateSkill(ws, s.id, {
      name: "Publicar sitio",
      description: "Pasar a producción con controles",
      instructionsMd: "1. Backup\n2. Probar\n3. Publicar",
    });
    expect(s2?.version).toBe(2);
    expect(skillMarkdown({ ...s, ...s2, tools: s.tools })).toMatch(/^---\nname: publicar-sitio\ndescription: "Pasar a producción con controles"\n---/);
    for (const t of SKILL_TEMPLATES) await addSkillFromTemplate(ws, t.key);
    const all = await getDb().select().from(schema.skill).where(eq(schema.skill.workspaceId, ws.workspaceId));
    expect(all).toHaveLength(SKILL_TEMPLATES.length + 1);
    await expect(createSkill({ ...ws, role: "member" }, { name: "X", description: "y", instructionsMd: "zzzzzzzzzzzz" })).rejects.toThrow();
  });
});

describe("Centro de control: objetivo con agente supervisado", () => {
  it("plan → aprobación humana → ejecución → paso con OK → error y corrección → revisión → devuelto → terminado", async () => {
    const ws = await makeWorkspace();
    const c = await createClient(ws, { name: "Librería Uno" });
    const p = await createProject(ws, { name: "Tienda Librería", clientId: c.id });
    const skill = await addSkillFromTemplate(ws, "bug-con-prueba");
    const g = await createGoal(ws, {
      title: "Arreglar el cálculo de envío en el checkout",
      descriptionMd: "El envío a CABA cobra el doble.",
      acceptanceMd: "Prueba automatizada que cubre CABA y GBA.",
      projectId: p.id,
      repo: "lucianorosano/libreria-uno",
      skillIds: [skill.id],
    });
    const agent = agentCtx(ws, ["read:all", "work:goals"]);
    // sin plan aprobado el agente no puede ejecutar
    await expect(claimGoal(agent, g.id)).rejects.toThrow(/plan aprobado/);
    await proposePlan(agent, g.id, {
      steps: [
        { title: "Reproducir el error", kind: "research" },
        { title: "Escribir la prueba que falla", kind: "test" },
        { title: "Corregir el cálculo", kind: "code" },
        { title: "Publicar el arreglo", kind: "deploy" },
      ],
    });
    // el agente no puede aprobar su propio plan
    await expect(approvePlan(agent, g.id)).rejects.toThrow();
    await rejectPlan(ws, g.id, "Agregá un paso para revisar el PR");
    await proposePlan(agent, g.id, {
      steps: [
        { title: "Reproducir el error", kind: "research" },
        { title: "Escribir la prueba que falla", kind: "test" },
        { title: "Corregir el cálculo", kind: "code" },
        { title: "Revisar el PR", kind: "review" },
        { title: "Publicar el arreglo", kind: "deploy" },
      ],
    });
    await approvePlan(ws, g.id, { createTasks: true });
    const brief = await goalBriefing(agent, g.id);
    expect(brief.plan).toHaveLength(5);
    expect(brief.plan[4]).toMatchObject({ tipo: "Publicación", necesita_aprobacion: true });
    expect(brief.skills[0]?.instrucciones).toMatch(/prueba automatizada/);
    await claimGoal(agent, g.id);
    await updateStep(agent, g.id, 1, { status: "done", resultMd: "Se reproduce con CP 1405" });
    // error y corrección: el intento queda contado
    await updateStep(agent, g.id, 2, { status: "failed", resultMd: "La prueba no compila" });
    await updateStep(agent, g.id, 2, { status: "done", resultMd: "Prueba agregada y fallando como corresponde" });
    await updateStep(agent, g.id, 3, { status: "done" });
    await updateStep(agent, g.id, 4, { status: "done" });
    // publicar espera el OK
    const blocked = await updateStep(agent, g.id, 5, { status: "running" });
    expect(blocked.blocked).toBe(true);
    expect((await getGoal(ws, g.id))?.g.status).toBe("blocked");
    await expect(decideStep(agent, g.id, 5, true)).rejects.toThrow();
    await decideStep(ws, g.id, 5, true);
    expect((await getGoal(ws, g.id))?.g.status).toBe("running");
    await updateStep(agent, g.id, 5, { status: "done", resultMd: "PR #12 mergeado" });
    await finishGoal(agent, g.id, { summaryMd: "Envío corregido, prueba agregada, PR #12." });
    // revisión: devuelto → vuelve a ejecución → aceptado
    await expect(reviewGoal(ws, g.id, false, "")).rejects.toThrow();
    await reviewGoal(ws, g.id, false, "Falta probar GBA");
    expect((await getGoal(ws, g.id))?.g.status).toBe("running");
    await finishGoal(agent, g.id, { summaryMd: "Agregada la prueba de GBA." });
    await reviewGoal(ws, g.id, true);
    const done = await getGoal(ws, g.id);
    expect(done?.g.status).toBe("done");
    expect(done?.steps.find((s) => s.idx === 2)?.attempts).toBe(1);
    expect(done?.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["plan", "feedback", "approved", "claimed", "error", "approval_request", "approval", "finished", "accepted"]),
    );
    // tareas del plan en el proyecto, completadas con cada paso
    const tasks = await getDb().select().from(schema.task).where(eq(schema.task.projectId, p.id));
    expect(tasks.filter((t) => t.assigneeType === "agent")).toHaveLength(5);
    expect(tasks.filter((t) => t.status === "done")).toHaveLength(5);
    // aislamiento y permisos
    const other = await makeWorkspace("B");
    expect(await getGoal(other, g.id)).toBeNull();
    await expect(createGoal({ ...ws, role: "member" }, { title: "X" })).rejects.toThrow();
    const noScope = agentCtx(ws, ["read:all"]);
    await expect(proposePlan(noScope, g.id, { steps: [{ title: "Algo" }] })).rejects.toThrow();
    const g2 = await createGoal(ws, { title: "Otro" });
    await cancelGoal(ws, g2.id);
    expect((await getGoal(ws, g2.id))?.g.status).toBe("cancelled");
  });
});

describe("Centro de control: vista general y exportación", () => {
  it("cuenta lo del sistema y exporta las skills activas como SKILL.md", async () => {
    const { controlOverview, exportSkillsZip } = await import("@agencyos/modules/devos/service");
    const JSZip = (await import("jszip")).default;
    const ws = await makeWorkspace();
    await createGoal(ws, { title: "Objetivo uno" });
    const s = await createSkill(ws, { name: "Revisar PR", description: "Revisión", instructionsMd: "1. Leer el diff con atención" });
    const o = await controlOverview(ws);
    expect(o.skills).toBe(1);
    expect(o.goals).toMatchObject({ active: 0, waiting: 0 });
    expect(o.mcp.tokens).toBe(0);
    const zip = await JSZip.loadAsync(await exportSkillsZip(ws));
    expect(Object.keys(zip.files)).toContain(`.claude/skills/${s.slug}/SKILL.md`);
    await expect(controlOverview({ ...ws, role: "member" })).rejects.toThrow();
  });
});
